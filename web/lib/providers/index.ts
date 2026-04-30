import { runAnthropic } from "./anthropic";
import { runOpenAI } from "./openai";
import { runGoogle } from "./google";
import type { Provider, RunAgentOpts, RunAgentResult } from "./types";

export * from "./types";

export async function runAgent(
  provider: Provider,
  opts: RunAgentOpts,
): Promise<RunAgentResult> {
  switch (provider) {
    case "anthropic":
      return runAnthropic(opts);
    case "openai":
      return runOpenAI(opts);
    case "google":
      return runGoogle(opts);
  }
}
