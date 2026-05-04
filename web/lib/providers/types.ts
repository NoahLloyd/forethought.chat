/**
 * Shared types for the multi-provider chat agent.
 *
 * Each provider module exposes `runAgent(opts)` that streams a chat
 * completion and dispatches a single `search` tool. The orchestrator
 * (the chat route handler) owns citation markers, mention seeding, and
 * the SSE socket. Providers stay narrow: build provider-shape messages,
 * stream tokens, route tool calls back through the orchestrator.
 */
import type { ChatMessage } from "../types";

export const PROVIDERS = ["anthropic", "openai", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * The single-active config the server receives on each request. The
 * client keeps a richer shape (saved keys for every provider, plus a
 * pointer at which one is active); only that pointer is sent over the
 * wire on each chat call.
 */
export type ByokConfig = {
  provider: Provider;
  apiKey: string;
  model: string;
};

/** Per-provider entry in the client's saved-keys map. */
export type ByokKeyEntry = {
  apiKey: string;
  model: string;
};

/**
 * Client-side BYOK state. `keys[provider]` is set if the user has saved
 * a key for that provider. `active` selects which one is sent with the
 * next chat request; null means "use the server's default key".
 */
export type ByokState = {
  active: Provider | null;
  keys: Partial<Record<Provider, ByokKeyEntry>>;
};

export const EMPTY_BYOK_STATE: ByokState = {
  active: null,
  keys: {},
};

/** Defaults when no BYOK config is provided. */
export const DEFAULT_PROVIDER: Provider = "anthropic";

/**
 * Default model per provider. The Anthropic entry is the model the local
 * `claude` CLI runs against by default (passed via `--model`); it bills
 * the host's subscription, not an API key. Sonnet 4.6 hits the sweet
 * spot of cost and intelligence.
 */
export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.5",
  google: "gemini-3-flash-preview",
};

/**
 * Model menu surfaced in the BYOK settings drawer. Pulled from each
 * provider's "Models" docs page in April 2026; we list the current
 * generally-available chat models, top to bottom of the cost/intel
 * spectrum, plus one or two reasoning/specialized variants.
 */
export const PROVIDER_MODELS: Record<
  Provider,
  Array<{ id: string; label: string }>
> = {
  anthropic: [
    { id: "claude-opus-4-7", label: "Claude Opus 4.7 · most capable" },
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6 · balanced",
    },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 · fastest" },
  ],
  openai: [
    { id: "gpt-5.5", label: "GPT-5.5 · flagship" },
    { id: "gpt-5.5-pro", label: "GPT-5.5 Pro · highest accuracy" },
    { id: "gpt-5.4", label: "GPT-5.4 · cheaper flagship" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { id: "gpt-5.4-nano", label: "GPT-5.4 nano · cheapest" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
    { id: "gpt-5-nano", label: "GPT-5 nano" },
    { id: "gpt-5", label: "GPT-5 · reasoning" },
    { id: "o3", label: "o3 · reasoning" },
    { id: "o3-pro", label: "o3-pro · reasoning, more compute" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex · coding agents" },
  ],
  google: [
    {
      id: "gemini-3.1-pro-preview",
      label: "Gemini 3.1 Pro (preview) · most capable",
    },
    {
      id: "gemini-3-flash-preview",
      label: "Gemini 3 Flash (preview) · frontier-class",
    },
    {
      id: "gemini-3.1-flash-lite-preview",
      label: "Gemini 3.1 Flash-Lite (preview)",
    },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  ],
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

/** Where the user goes to mint a key for each provider. */
export const PROVIDER_KEY_URL: Record<Provider, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/app/apikey",
};

/** Friendly hostname for inline link labels. */
export const PROVIDER_KEY_HOST: Record<Provider, string> = {
  anthropic: "console.anthropic.com",
  openai: "platform.openai.com",
  google: "aistudio.google.com",
};

export type StreamEmit = (event: string, data: unknown) => void;

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

/**
 * Search callback. Provider modules invoke this when the model calls the
 * `search` tool. It returns formatted text the provider should pass back
 * as the tool result. The orchestrator handles marker assignment and the
 * `sources` SSE event internally.
 */
export type SearchCallback = (
  query: string,
  k: number,
) => Promise<string>;

export type RunAgentOpts = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  /**
   * Pre-formatted Markdown describing chunks already loaded for the
   * user's @-mentioned articles, including their citation markers.
   * The provider should make sure the model sees this at the start of
   * the conversation so it can cite [N] without re-searching.
   */
  mentionSeed: string | null;
  search: SearchCallback;
  emit: StreamEmit;
  abortSignal?: AbortSignal;
  /** Passed as --effort to the CLI provider; ignored by API providers. */
  effort?: Effort;
};

export type RunAgentResult = {
  iterations: number;
  stopReason: string | null;
  usage: Usage;
  truncated: boolean;
};

export const MAX_ITERS = 30;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORT_LEVELS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export type SubConfig = {
  model: string;
  effort: Effort;
};

export const DEFAULT_SUB_CONFIG: SubConfig = {
  model: DEFAULT_MODEL.anthropic,
  effort: "high",
};
export const SEARCH_DEFAULT_K = 6;
export const SEARCH_MAX_K = 10;

export const SEARCH_TOOL_DESCRIPTION =
  "Search the Forethought corpus for excerpts relevant to a query. Returns numbered excerpts with citation markers ([N]) you can use directly in your answer. Call this multiple times in one turn to broaden, narrow, or follow up; each call returns its own batch of excerpts.";
