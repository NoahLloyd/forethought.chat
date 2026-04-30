import Anthropic from "@anthropic-ai/sdk";
import {
  MAX_ITERS,
  SEARCH_DEFAULT_K,
  SEARCH_MAX_K,
  SEARCH_TOOL_DESCRIPTION,
  type RunAgentOpts,
  type RunAgentResult,
} from "./types";

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search",
  description: SEARCH_TOOL_DESCRIPTION,
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "A focused search query: the user's actual phrasing, or a tight paraphrase. Avoid stop-words and filler.",
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

export async function runAnthropic(opts: RunAgentOpts): Promise<RunAgentResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  // System prompt sits in a single cached block so the persona+catalog
  // preamble is reused across requests. Excerpts arrive as tool_result
  // blocks in the conversation, never in the system prompt.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: opts.systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];

  const apiMessages: Anthropic.MessageParam[] = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Mention seed is rendered as a synthetic search round-trip so the
  // model sees it as if it had already searched (including the citation
  // markers) without spending a real LLM call on it.
  if (opts.mentionSeed) {
    const toolUseId = `seed_${Math.random().toString(36).slice(2, 10)}`;
    apiMessages.push(
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: toolUseId,
            name: "search",
            input: { query: "(seed: user-mentioned articles)" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: opts.mentionSeed,
          },
        ],
      },
    );
  }

  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };
  let iter = 0;
  let lastStop: string | null = null;
  let truncated = false;

  while (iter < MAX_ITERS) {
    iter++;
    applyMessageCacheControl(apiMessages);

    const llmStream = client.messages.stream({
      model: opts.model,
      max_tokens: 4096,
      system: systemBlocks,
      messages: apiMessages,
      tools: [SEARCH_TOOL],
    });

    llmStream.on("text", (delta) => {
      opts.emit("text", { delta });
    });

    const final = await llmStream.finalMessage();

    totals.inputTokens += final.usage.input_tokens;
    totals.outputTokens += final.usage.output_tokens;
    totals.cacheCreationTokens += final.usage.cache_creation_input_tokens ?? 0;
    totals.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;

    lastStop = final.stop_reason ?? null;
    apiMessages.push({ role: "assistant", content: final.content });

    if (lastStop !== "tool_use") break;

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "search") {
        const input = (block.input ?? {}) as { query?: unknown; k?: unknown };
        const query = typeof input.query === "string" ? input.query.trim() : "";
        const k = Math.min(
          Math.max(
            typeof input.k === "number" ? Math.floor(input.k) : SEARCH_DEFAULT_K,
            1,
          ),
          SEARCH_MAX_K,
        );

        opts.emit("tool_call", { name: "search", query });

        let content: string;
        let isError = false;
        try {
          content = await opts.search(query, k);
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

  if (lastStop === "tool_use") truncated = true;

  return {
    iterations: iter,
    stopReason: lastStop,
    usage: totals,
    truncated,
  };
}
