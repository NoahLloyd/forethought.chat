import { runAnthropic } from "./anthropic";
import { isClaudeCliAvailable, runAnthropicCli } from "./anthropic-cli";
import { runOpenAI } from "./openai";
import { runGoogle } from "./google";
import type { Provider, RunAgentOpts, RunAgentResult } from "./types";

export * from "./types";
export { isClaudeCliAvailable } from "./anthropic-cli";

/**
 * Optional override:
 *   "cli" → always use the local `claude` (subscription-billed). 4xx if missing.
 *   "api" → always use @anthropic-ai/sdk (API-key-billed).
 * Default: prefer CLI when `claude` is on PATH; fall back to API otherwise.
 *
 * The default lets the same code work locally (subscription) and on a
 * deployed Vercel-style host without the CLI (API), without a config
 * change. Set explicitly when you want to force one transport.
 */
function transportOverride(): "cli" | "api" | null {
  const v = process.env.LIBRARIAN_TRANSPORT?.trim().toLowerCase();
  if (v === "cli" || v === "api") return v;
  return null;
}

export async function runAgent(
  provider: Provider,
  opts: RunAgentOpts,
): Promise<RunAgentResult> {
  switch (provider) {
    case "anthropic": {
      const override = transportOverride();
      if (override === "api") return runAnthropic(opts);
      if (override === "cli") return runAnthropicCli(opts);
      // BYOK key always goes to API — the user explicitly supplied it.
      if (opts.apiKey) return runAnthropic(opts);
      const cli = await isClaudeCliAvailable();
      return cli ? runAnthropicCli(opts) : runAnthropic(opts);
    }
    case "openai":
      return runOpenAI(opts);
    case "google":
      return runGoogle(opts);
  }
}
