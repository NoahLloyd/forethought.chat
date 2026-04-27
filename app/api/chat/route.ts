import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL, client } from "@/lib/anthropic";
import { buildStablePreamble, formatSearchResult } from "@/lib/prompt";
import { getCatalog, search } from "@/lib/search";
import type { ChatMessage, Chunk, SourceCard } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tool-using agent loop.
 *
 * The model receives the persona + corpus catalog (cached) and a single
 * `search` tool. It decides when and how often to retrieve excerpts before
 * answering. We cap at MAX_ITERS so a confused model can't loop forever.
 *
 * Citation markers are assigned globally per request: the first chunk the
 * model ever sees is [1], the next new chunk [2], and so on. Re-finding a
 * chunk in a later search reuses its existing marker so [3] always points
 * to the same passage no matter when the model first read it.
 */
const MAX_ITERS = 6;
const SEARCH_DEFAULT_K = 6;
const SEARCH_MAX_K = 10;

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search",
  description:
    "Search the Forethought corpus for excerpts relevant to a query. Returns numbered excerpts with citation markers ([N]) you can use directly in your answer. Call this multiple times in one turn to broaden, narrow, or follow up — each call returns its own batch of excerpts.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "A focused search query — the user's actual phrasing, or a tight paraphrase aimed at the topic. Avoid stop-words and filler.",
      },
      k: {
        type: "integer",
        description: `How many excerpts to return. Default ${SEARCH_DEFAULT_K}, max ${SEARCH_MAX_K}.`,
        minimum: 1,
        maximum: SEARCH_MAX_K,
      },
    },
    required: ["query"],
  },
};

function makeSnippet(text: string, max = 280): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  // Try to clip on a sentence boundary inside the budget.
  const window = cleaned.slice(0, max + 80);
  const cutoff = window.lastIndexOf(". ");
  if (cutoff > max - 80 && cutoff < max + 80) return window.slice(0, cutoff + 1);
  return cleaned.slice(0, max).trimEnd() + "…";
}

/**
 * Place an ephemeral cache breakpoint on the most recent tool_result block,
 * stripping any breakpoints we set on earlier blocks. Combined with the
 * system-prompt breakpoint, this caches the whole prefix up through the
 * last tool result so iteration N+1 reuses iteration N's work. Anthropic
 * caps cache breakpoints per request at 4; this strategy keeps us at 2.
 */
function applyMessageCacheControl(messages: Anthropic.MessageParam[]): void {
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const block of m.content) {
      if (
        typeof block === "object" &&
        block !== null &&
        "cache_control" in block
      ) {
        delete (block as { cache_control?: unknown }).cache_control;
      }
    }
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || typeof m.content === "string") continue;
    const blocks = m.content;
    for (let j = blocks.length - 1; j >= 0; j--) {
      const b = blocks[j];
      if (b.type === "tool_result") {
        (b as { cache_control?: { type: "ephemeral" } }).cache_control = {
          type: "ephemeral",
        };
        return;
      }
    }
  }
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

  const catalog = await getCatalog();
  const preamble = buildStablePreamble(catalog);

  // System prompt is a single cached block. Excerpts no longer live here —
  // they come back as tool_result blocks in the conversation.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: preamble,
      cache_control: { type: "ephemeral" },
    },
  ];

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Per-request citation registry. `seen` maps chunk id → assigned card
      // so re-finding the same chunk in a later search keeps the marker
      // stable. `nextMarker` is the next free integer.
      const seen = new Map<string, SourceCard>();
      let nextMarker = 1;

      const totals = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      };

      let iter = 0;
      let lastStop: string | null = null;
      let truncated = false;

      try {
        const c = client();

        while (iter < MAX_ITERS) {
          iter++;
          applyMessageCacheControl(apiMessages);

          const llmStream = c.messages.stream({
            model: CHAT_MODEL,
            max_tokens: 4096,
            system: systemBlocks,
            messages: apiMessages,
            tools: [SEARCH_TOOL],
          });

          llmStream.on("text", (delta) => {
            send("text", { delta });
          });

          const final = await llmStream.finalMessage();

          totals.inputTokens += final.usage.input_tokens;
          totals.outputTokens += final.usage.output_tokens;
          totals.cacheCreationTokens +=
            final.usage.cache_creation_input_tokens ?? 0;
          totals.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;

          lastStop = final.stop_reason ?? null;

          // Persist the assistant turn (text + any tool_use blocks) into
          // history so the next iteration sees it.
          apiMessages.push({ role: "assistant", content: final.content });

          if (lastStop !== "tool_use") break;

          const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            if (block.name === "search") {
              const input = (block.input ?? {}) as {
                query?: unknown;
                k?: unknown;
              };
              const query =
                typeof input.query === "string" ? input.query.trim() : "";
              const k = Math.min(
                Math.max(
                  typeof input.k === "number" ? Math.floor(input.k) : SEARCH_DEFAULT_K,
                  1,
                ),
                SEARCH_MAX_K,
              );

              send("tool_call", { name: "search", query });

              let content: string;
              let isError = false;
              try {
                if (!query) {
                  content = formatSearchResult("", []);
                } else {
                  const hits = await search(query, k);
                  const numbered: Array<{ chunk: Chunk; marker: number }> = [];
                  let addedAny = false;
                  for (const h of hits) {
                    let card = seen.get(h.chunk.id);
                    if (!card) {
                      card = {
                        marker: nextMarker++,
                        url: h.chunk.url,
                        title: h.chunk.title,
                        category: h.chunk.category,
                        authors: h.chunk.authors,
                        publishedAt: h.chunk.publishedAt,
                        section: h.chunk.section,
                        snippet: makeSnippet(h.chunk.text),
                      };
                      seen.set(h.chunk.id, card);
                      addedAny = true;
                    }
                    numbered.push({ chunk: h.chunk, marker: card.marker });
                  }
                  content = formatSearchResult(query, numbered);
                  if (addedAny) {
                    send("sources", {
                      sources: [...seen.values()].sort(
                        (a, b) => a.marker - b.marker,
                      ),
                    });
                  }
                }
              } catch (err) {
                isError = true;
                content = `Search failed: ${
                  err instanceof Error ? err.message : "unknown error"
                }`;
              }

              toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: block.id,
                content,
                ...(isError ? { is_error: true } : {}),
              });
            } else {
              toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Unknown tool: ${block.name}. Available tools: search.`,
                is_error: true,
              });
            }
          }

          apiMessages.push({ role: "user", content: toolResultBlocks });
        }

        if (lastStop === "tool_use") {
          // We hit the iteration cap with the model still wanting to search.
          // Tell the user; the partial answer (if any) has already streamed.
          truncated = true;
          send("error", {
            message: `agent stopped after ${MAX_ITERS} tool calls`,
          });
        }

        send("done", {
          stopReason: truncated ? "max_iterations" : lastStop,
          iterations: iter,
          usage: totals,
        });
      } catch (err) {
        const msg =
          err instanceof Anthropic.APIError
            ? `${err.status ?? "?"} — ${err.message}`
            : err instanceof Error
              ? err.message
              : "unknown error";
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
