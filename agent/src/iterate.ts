/**
 * Framework-agnostic agent iteration loop.
 *
 * `runAgent` is an async generator that drives the tool-calling Sonnet loop
 * and yields typed events. It knows nothing about HTTP, SSE, or Next.js.
 * Consumers translate events to whatever transport they want:
 *   - web/app/api/chat/route.ts emits SSE for the browser client
 *   - the bench could call this in-process and consume events directly
 *   - a CLI version could pretty-print to the terminal
 *
 * Behaviour preserved verbatim from the previous in-route implementation:
 *   - global citation marker registry (re-finding a chunk reuses its [N])
 *   - cumulative `sources` event each time new chunks enter the registry
 *   - text deltas streamed as the model emits them
 *   - tool_call event per `search` invocation
 *   - MAX_ITERS cap; if hit while still requesting tools, emits an error
 *     event before the final done
 *   - prompt-cache breakpoint floats to the most recent tool_result
 */
import Anthropic from "@anthropic-ai/sdk";
import { formatSearchResult } from "./prompt";
import type { Searcher } from "./search";
import type {
  AgentEvent,
  ChatMessage,
  Chunk,
  SourceCard,
} from "./types";

export type RunAgentOptions = {
  /** The full conversation, ending with a user turn. */
  messages: ChatMessage[];
  /** The cached system prefix (persona + corpus catalog). */
  systemPreamble: string;
  /** Anthropic SDK client, ready to use. */
  client: Anthropic;
  /** Pinned model id. */
  model: string;
  /** Search backend the model's `search` tool delegates to. */
  searcher: Pick<Searcher, "search">;
  /** Hard ceiling on tool-calling rounds. Default 12. */
  maxIterations?: number;
  /** Default `k` if the model omits it. Default 6. */
  searchDefaultK?: number;
  /** Hard cap on `k` even if the model asks for more. Default 10. */
  searchMaxK?: number;
};

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search",
  description:
    "Search the Forethought corpus for excerpts relevant to a query. Returns numbered excerpts with citation markers ([N]) you can use directly in your answer. Call this multiple times in one turn to broaden, narrow, or follow up - each call returns its own batch of excerpts.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "A focused search query - the user's actual phrasing, or a tight paraphrase aimed at the topic. Avoid stop-words and filler.",
      },
      k: {
        type: "integer",
        description: "How many excerpts to return.",
        minimum: 1,
        maximum: 10,
      },
    },
    required: ["query"],
  },
};

export async function* runAgent(
  opts: RunAgentOptions,
): AsyncGenerator<AgentEvent, void, unknown> {
  const maxIters = opts.maxIterations ?? 12;
  const searchDefaultK = opts.searchDefaultK ?? 6;
  const searchMaxK = opts.searchMaxK ?? 10;

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: opts.systemPreamble,
      cache_control: { type: "ephemeral" },
    },
  ];

  const apiMessages: Anthropic.MessageParam[] = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

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
    while (iter < maxIters) {
      iter++;
      applyMessageCacheControl(apiMessages);

      const llmStream = opts.client.messages.stream({
        model: opts.model,
        max_tokens: 4096,
        system: systemBlocks,
        messages: apiMessages,
        tools: [SEARCH_TOOL],
      });

      // We need text deltas to flow out of this generator AS they arrive,
      // not bunched at end of iteration. Buffer them into a queue that
      // alternates with the stream.
      const textBuffer: string[] = [];
      llmStream.on("text", (delta: string) => {
        textBuffer.push(delta);
      });

      const final = await llmStream.finalMessage();

      // Drain buffered deltas into the event stream now. (For richer
      // interleaving, the future could swap in a full async-iterator queue.)
      while (textBuffer.length > 0) {
        const delta = textBuffer.shift()!;
        yield { type: "text", delta };
      }

      totals.inputTokens += final.usage.input_tokens;
      totals.outputTokens += final.usage.output_tokens;
      totals.cacheCreationTokens +=
        final.usage.cache_creation_input_tokens ?? 0;
      totals.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;

      lastStop = final.stop_reason ?? null;
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
              typeof input.k === "number" ? Math.floor(input.k) : searchDefaultK,
              1,
            ),
            searchMaxK,
          );

          yield { type: "tool_call", name: "search", query };

          let content: string;
          let isError = false;
          try {
            if (!query) {
              content = formatSearchResult("", []);
            } else {
              const hits = await opts.searcher.search(query, k);
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
                yield {
                  type: "sources",
                  sources: [...seen.values()].sort(
                    (a, b) => a.marker - b.marker,
                  ),
                };
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
      truncated = true;
      yield {
        type: "error",
        message: `agent stopped after ${maxIters} tool calls`,
      };
    }

    yield {
      type: "done",
      stopReason: truncated ? "max_iterations" : lastStop,
      iterations: iter,
      usage: totals,
    };
  } catch (err) {
    const msg =
      err instanceof Anthropic.APIError
        ? `${err.status ?? "?"} - ${err.message}`
        : err instanceof Error
          ? err.message
          : "unknown error";
    yield { type: "error", message: msg };
  }
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

function makeSnippet(text: string, max = 280): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const window = cleaned.slice(0, max + 80);
  const cutoff = window.lastIndexOf(". ");
  if (cutoff > max - 80 && cutoff < max + 80) return window.slice(0, cutoff + 1);
  return cleaned.slice(0, max).trimEnd() + "...";
}
