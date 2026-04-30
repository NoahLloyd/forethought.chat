import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
} from "@google/genai";
import {
  MAX_ITERS,
  SEARCH_DEFAULT_K,
  SEARCH_MAX_K,
  SEARCH_TOOL_DESCRIPTION,
  type RunAgentOpts,
  type RunAgentResult,
} from "./types";

/**
 * Google Gemini adapter. Uses generateContentStream with manual
 * function-calling orchestration. Gemini emits chunks containing either
 * text or functionCalls; we accumulate, then run our search callback,
 * then re-call with the function response appended.
 */
export async function runGoogle(opts: RunAgentOpts): Promise<RunAgentResult> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  // Gemini's contents are a list of {role, parts}. We map our user/
  // assistant string history to that, then thread tool calls in as
  // additional model/user turns with functionCall / functionResponse parts.
  const contents: Content[] = opts.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  if (opts.mentionSeed) {
    const seedCallId = `seed_${Math.random().toString(36).slice(2, 10)}`;
    contents.push(
      {
        role: "model",
        parts: [
          {
            functionCall: {
              id: seedCallId,
              name: "search",
              args: { query: "(seed: user-mentioned articles)" },
            },
          },
        ],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: seedCallId,
              name: "search",
              response: { result: opts.mentionSeed },
            },
          },
        ],
      },
    );
  }

  const tools = [
    {
      functionDeclarations: [
        {
          name: "search",
          description: SEARCH_TOOL_DESCRIPTION,
          parametersJsonSchema: {
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
              },
            },
            required: ["query"],
          },
        },
      ],
    },
  ];

  // Suppress the type error from accessing properties on the dynamic
  // typed tools object: the SDK's runtime accepts this shape.
  void Type;

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

    const stream = await ai.models.generateContentStream({
      model: opts.model,
      contents,
      config: { tools, systemInstruction: opts.systemPrompt },
    });

    // Accumulate this iteration's response so we can re-feed it as a
    // model-role turn when the agent loops with tool calls.
    const accumulatedParts: Array<{ text?: string; functionCall?: FunctionCall }> = [];
    let lastUsage:
      | {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          cachedContentTokenCount?: number;
        }
      | undefined;
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      // Stream text deltas.
      const text = chunk.text;
      if (text) {
        opts.emit("text", { delta: text });
        accumulatedParts.push({ text });
      }
      // Capture function calls emitted in this chunk.
      const calls = chunk.functionCalls ?? [];
      for (const fc of calls) {
        accumulatedParts.push({ functionCall: fc });
        const args = (fc.args ?? {}) as { query?: string };
        if (typeof args.query === "string" && args.query.trim().length > 0) {
          opts.emit("tool_call", { name: "search", query: args.query.trim() });
        }
      }
      // Track usage + stop reason as Gemini reports them at the end.
      if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
      const fr = chunk.candidates?.[0]?.finishReason;
      if (fr) finishReason = fr;
    }

    if (lastUsage) {
      totals.inputTokens += lastUsage.promptTokenCount ?? 0;
      totals.outputTokens += lastUsage.candidatesTokenCount ?? 0;
      totals.cacheReadTokens += lastUsage.cachedContentTokenCount ?? 0;
    }
    lastStop = finishReason;

    // Push the model's turn (text + function calls) into history.
    const modelParts = accumulatedParts.map((p) =>
      p.functionCall
        ? { functionCall: p.functionCall }
        : { text: p.text ?? "" },
    );
    if (modelParts.length > 0) {
      contents.push({ role: "model", parts: modelParts });
    }

    // If no function calls, we're done.
    const callsThisIter = accumulatedParts
      .map((p) => p.functionCall)
      .filter((c): c is FunctionCall => Boolean(c));
    if (callsThisIter.length === 0) break;

    // Run each function call and emit a single user-role turn whose
    // parts are the corresponding functionResponse blocks.
    const responseParts: Array<{
      functionResponse: {
        id?: string;
        name: string;
        response: { result: string };
      };
    }> = [];
    for (const call of callsThisIter) {
      if (call.name !== "search") {
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name ?? "search",
            response: {
              result: `Unknown tool: ${call.name}. Available tools: search.`,
            },
          },
        });
        continue;
      }
      const args = (call.args ?? {}) as { query?: string; k?: number };
      const query = typeof args.query === "string" ? args.query.trim() : "";
      const k =
        typeof args.k === "number"
          ? Math.min(Math.max(Math.floor(args.k), 1), SEARCH_MAX_K)
          : SEARCH_DEFAULT_K;

      let result: string;
      try {
        result = await opts.search(query, k);
      } catch (err) {
        result = `Search failed: ${
          err instanceof Error ? err.message : "unknown error"
        }`;
      }
      responseParts.push({
        functionResponse: {
          id: call.id,
          name: "search",
          response: { result },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  if (lastStop === "TOOL_CODE" || lastStop === "OTHER") {
    // Defensive: Gemini sometimes uses these as stop reasons mid-loop.
    truncated = iter >= MAX_ITERS;
  }
  if (iter >= MAX_ITERS) truncated = true;

  return {
    iterations: iter,
    stopReason: lastStop,
    usage: totals,
    truncated,
  };
}
