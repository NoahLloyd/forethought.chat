import OpenAI from "openai";
import {
  MAX_ITERS,
  SEARCH_DEFAULT_K,
  SEARCH_MAX_K,
  SEARCH_TOOL_DESCRIPTION,
  type RunAgentOpts,
  type RunAgentResult,
} from "./types";

type ChatMessageParam =
  OpenAI.Chat.Completions.ChatCompletionMessageParam;

const SEARCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "search",
    description: SEARCH_TOOL_DESCRIPTION,
    parameters: {
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
  },
};

/**
 * OpenAI adapter. Uses chat.completions.stream with manual tool-call
 * orchestration so we can emit `tool_call` SSE events the moment the
 * model commits to a search, before the search itself runs.
 */
export async function runOpenAI(opts: RunAgentOpts): Promise<RunAgentResult> {
  const client = new OpenAI({ apiKey: opts.apiKey });

  const messages: ChatMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    ...opts.messages.map(
      (m) => ({ role: m.role, content: m.content }) as ChatMessageParam,
    ),
  ];

  // Mention seed: prepend a synthetic assistant tool_call + tool result
  // pair so the model sees the seeded chunks as if it had already
  // searched. OpenAI requires assistant.tool_calls + matching tool
  // message with the same tool_call_id.
  if (opts.mentionSeed) {
    const toolCallId = `seed_${Math.random().toString(36).slice(2, 10)}`;
    messages.push(
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: toolCallId,
            type: "function",
            function: {
              name: "search",
              arguments: JSON.stringify({
                query: "(seed: user-mentioned articles)",
              }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: toolCallId,
        content: opts.mentionSeed,
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

    const stream = client.chat.completions.stream({
      model: opts.model,
      messages,
      tools: [SEARCH_TOOL],
      stream_options: { include_usage: true },
    });

    // Emit tool_call as soon as we know the function name + arguments.
    // The arguments stream in chunks, so we wait for `.done` to have the
    // full string parsed.
    const toolCallEvents: Array<{ id: string; query: string }> = [];

    stream.on("content.delta", ({ delta }: { delta: string }) => {
      if (delta) opts.emit("text", { delta });
    });

    stream.on(
      "tool_calls.function.arguments.done",
      (e: {
        index: number;
        id?: string;
        name: string;
        arguments: string;
        parsed_arguments?: unknown;
      }) => {
        if (e.name !== "search") return;
        let q = "";
        try {
          const parsed = (e.parsed_arguments ?? JSON.parse(e.arguments)) as {
            query?: string;
          };
          q = parsed.query ?? "";
        } catch {
          q = "";
        }
        toolCallEvents.push({ id: e.id ?? `call_${e.index}`, query: q });
        if (q) opts.emit("tool_call", { name: "search", query: q });
      },
    );

    const final = await stream.finalChatCompletion();

    if (final.usage) {
      totals.inputTokens += final.usage.prompt_tokens ?? 0;
      totals.outputTokens += final.usage.completion_tokens ?? 0;
      // OpenAI's automatic prompt caching: cached_tokens nests under
      // prompt_tokens_details. Surface it as cacheReadTokens for parity.
      const cached =
        (final.usage as { prompt_tokens_details?: { cached_tokens?: number } })
          .prompt_tokens_details?.cached_tokens ?? 0;
      totals.cacheReadTokens += cached;
    }

    const choice = final.choices[0];
    lastStop = choice?.finish_reason ?? null;

    const assistantMsg = choice?.message;
    if (!assistantMsg) break;

    messages.push({
      role: "assistant",
      content: assistantMsg.content ?? null,
      ...(assistantMsg.tool_calls
        ? { tool_calls: assistantMsg.tool_calls }
        : {}),
    });

    if (lastStop !== "tool_calls" || !assistantMsg.tool_calls?.length) {
      break;
    }

    // Run each requested tool and append a `tool` message per call.
    for (const tc of assistantMsg.tool_calls) {
      if (tc.type !== "function" || tc.function.name !== "search") {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `Unknown tool: ${tc.function.name}. Available tools: search.`,
        });
        continue;
      }
      let query = "";
      let k = SEARCH_DEFAULT_K;
      try {
        const parsed = JSON.parse(tc.function.arguments) as {
          query?: string;
          k?: number;
        };
        query = (parsed.query ?? "").trim();
        if (typeof parsed.k === "number") {
          k = Math.min(
            Math.max(Math.floor(parsed.k), 1),
            SEARCH_MAX_K,
          );
        }
      } catch {
        // malformed: let the model see an error result
      }

      let content: string;
      try {
        content = await opts.search(query, k);
      } catch (err) {
        content = `Search failed: ${
          err instanceof Error ? err.message : "unknown error"
        }`;
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content,
      });
    }
  }

  if (lastStop === "tool_calls") truncated = true;

  return {
    iterations: iter,
    stopReason: lastStop,
    usage: totals,
    truncated,
  };
}
