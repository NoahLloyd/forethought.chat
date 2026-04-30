import { NextResponse } from "next/server";
import path from "node:path";
import {
  CHAT_MODEL,
  buildStablePreamble,
  client,
  createSearcher,
  runAgent,
  type ChatMessage,
} from "@forethought/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thin SSE wrapper around `runAgent`.
 *
 * The agent's iteration loop, search tool, and prompt assembly live in
 * @forethought/agent. This route is purely transport: parse the request,
 * instantiate a Searcher bound to web/data/index.json, run the agent,
 * translate each yielded AgentEvent into an SSE `event:` / `data:` frame.
 *
 * The Searcher is created at module scope so its index cache is reused
 * across requests in the same dev/serverless worker.
 */
const searcher = createSearcher({
  indexPath: path.join(process.cwd(), "data", "index.json"),
});

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m): m is ChatMessage =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0,
  );
  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return NextResponse.json(
      { error: "messages must end with a user turn" },
      { status: 400 },
    );
  }

  const catalog = await searcher.getCatalog();
  const systemPreamble = buildStablePreamble(catalog);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        for await (const evt of runAgent({
          messages,
          systemPreamble,
          client: client(),
          model: CHAT_MODEL,
          searcher,
        })) {
          // The wire format mirrors AgentEvent 1:1: event name = evt.type,
          // payload = the rest of the discriminated union.
          const { type, ...rest } = evt;
          send(type, rest);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        send("error", { message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
