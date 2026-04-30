import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — copy .env.example to .env.local and add a key from https://console.anthropic.com/",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// Pinned to the latest Sonnet for the chat route. Forethought research is
// long-form, so Sonnet 4.6's 1M context and adaptive thinking buy us
// better synthesis than Haiku while keeping streaming latency snappy.
export const CHAT_MODEL = "claude-sonnet-4-6";

export const ASSISTANT_LABEL = "Forethought.chat";
