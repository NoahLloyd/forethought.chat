import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL, client } from "@/lib/anthropic";
import { buildStablePreamble, formatExcerpts } from "@/lib/prompt";
import { getCatalog, search } from "@/lib/search";
import type { ChatMessage, SourceCard } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Build a search query from the most recent user turn plus a small amount
 * of conversational context. Pulling a few prior turns into the query lets
 * BM25 catch follow-ups like "tell me more about that" without losing
 * specificity on the user's actual question.
 */
function makeRetrievalQuery(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return lastUser.content;
  return `${lastAssistant.content.slice(-400)}\n\n${lastUser.content}`;
}

function makeSnippet(text: string, max = 280): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  // Try to clip on a sentence boundary inside the budget.
  const window = cleaned.slice(0, max + 80);
  const cutoff = window.lastIndexOf(". ");
  if (cutoff > max - 80 && cutoff < max + 80) return window.slice(0, cutoff + 1);
  return cleaned.slice(0, max).trimEnd() + "…";
}

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

  // Retrieve top chunks for the latest user turn.
  const query = makeRetrievalQuery(messages);
  const hits = await search(query, 12);
  const retrieved: SourceCard[] = hits.map((h, i) => ({
    marker: i + 1,
    url: h.chunk.url,
    title: h.chunk.title,
    category: h.chunk.category,
    authors: h.chunk.authors,
    publishedAt: h.chunk.publishedAt,
    section: h.chunk.section,
    snippet: makeSnippet(h.chunk.text),
  }));

  const catalog = await getCatalog();
  const preamble = buildStablePreamble(catalog);
  const excerpts = formatExcerpts(hits.map((h) => h.chunk));

  // The system prompt is built as two blocks so the cache key only covers
  // the stable preamble. The retrieved excerpts are appended in a second
  // block with no cache_control — they invalidate per request, but the
  // preamble (~5-10k tokens with the catalog) stays cached for 5 minutes
  // and is reused across every conversation.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: preamble,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: excerpts,
    },
  ];

  // Forward conversation history. We don't add a second cache breakpoint
  // here — Forethought sessions are usually short and the savings would be
  // marginal compared to the preamble-cache hit we already get.
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Stream the response as Server-Sent Events. The first event is the
  // retrieval payload (so the UI can render source cards immediately while
  // the model is still warming up); subsequent events are text deltas.
  // We hook the client's AbortSignal so a disconnect aborts the upstream
  // Anthropic stream too — without this, the model keeps generating into
  // a closed pipe and we leak both the connection and the API call.
  const encoder = new TextEncoder();
  const c = client();
  const llmStream = c.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 4096,
    system: systemBlocks,
    messages: apiMessages,
  });

  let clientGone = false;
  req.signal.addEventListener(
    "abort",
    () => {
      clientGone = true;
      // The Anthropic SDK exposes an abort method on streams.
      llmStream.controller?.abort();
    },
    { once: true },
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // Controller already closed — client disconnected. Mark as gone
          // so subsequent send() calls become no-ops.
          clientGone = true;
        }
      };

      send("sources", { sources: retrieved });

      try {
        llmStream.on("text", (delta) => {
          send("text", { delta });
        });

        const final = await llmStream.finalMessage();
        send("done", {
          stopReason: final.stop_reason,
          usage: {
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
            cacheCreationTokens: final.usage.cache_creation_input_tokens ?? 0,
            cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
          },
        });
      } catch (err) {
        // If the client disconnected, the SDK throws an abort-shaped error;
        // we don't need to surface that as a user-visible error event.
        if (clientGone) return;
        const msg =
          err instanceof Anthropic.APIError
            ? `${err.status ?? "?"} — ${err.message}`
            : err instanceof Error
              ? err.message
              : "unknown error";
        send("error", { message: msg });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      // The platform invokes cancel() when the consumer (browser) closes
      // its side of the stream — abort the upstream call here too as a
      // belt-and-braces second path beyond req.signal.
      clientGone = true;
      llmStream.controller?.abort();
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
