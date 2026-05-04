/**
 * Subscription-billed Anthropic transport: spawns the local `claude`
 * binary as a subprocess and streams stream-json output back as SSE
 * events. Preferred when `claude` is on PATH (local dev / a personal
 * deployment) — falls through to the API SDK transport otherwise so
 * the deployed website still works for visitors who can't run the CLI.
 *
 * Architecture: claude is given Bash with permission-mode bypass; the
 * system prompt teaches it to run exactly one shell command (the search
 * wrapper at bench/scripts/forethought-search.sh), and BENCH_SOURCES_OUT
 * points at a temp JSONL the wrapper appends to. The provider tails
 * that file and emits `sources` SSE as new entries appear, while
 * parsing the stream-json stdout for text deltas and tool calls. Any
 * `ANTHROPIC_API_KEY` in the parent env is stripped from the child env
 * so the CLI can never silently fall back to API billing.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SourceCard } from "@forethought/agent";
import {
  MAX_ITERS,
  type RunAgentOpts,
  type RunAgentResult,
  type Usage,
} from "./types";

const TOOL_INSTRUCTIONS_TEMPLATE = `

# IMPORTANT: how to search the Forethought corpus

You do NOT have a native \`search\` tool in this run. The Bash tool is
the ONLY tool you have, restricted to running exactly this command:

    bash {script_path} "<your query>" [k]

- To search the Forethought corpus, run that command (k defaults to 6,
  max 10). Stdout is the same numbered-excerpt format the native search
  tool would have produced, with stable [N] citation markers that
  persist across multiple calls in this turn.
- Cite using [N] markers exactly as you would have with the native tool.
- Do NOT run any other shell command. Do NOT use Read, Write, Edit,
  Grep, Glob, or any other tool. Only Bash, only the search command
  above.
- Stop calling search once you can answer well; then write your final
  answer in plain prose with [N] citations.
`;

type SourceRecord = {
  marker: number;
  chunk_id: string;
  url: string;
  title: string;
  category: string;
  authors: string[];
  publishedAt: string | null;
  section: string | null;
  snippet: string;
  source?: string;
};

/** Resolve <repo-root>/bench/scripts/forethought-search.sh from this file. */
function resolveSearchScript(): string {
  const here = fileURLToPath(import.meta.url);
  // web/lib/providers/anthropic-cli.ts → repo root is 4 parents up.
  const repoRoot = path.resolve(path.dirname(here), "..", "..", "..");
  return path.join(repoRoot, "bench", "scripts", "forethought-search.sh");
}

/** Find `claude` on PATH; throw if not present. */
async function resolveClaudeBin(): Promise<string> {
  const { execSync } = await import("node:child_process");
  try {
    return execSync("command -v claude", { encoding: "utf8" }).trim();
  } catch {
    throw new Error("claude CLI not on PATH");
  }
}

function lastUserText(messages: RunAgentOpts["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages.at(-1)?.content ?? "";
}

/**
 * Render full transcript as text the model can ingest in a single -p
 * call. claude -p is single-shot (no conversation history), so prior
 * turns are folded into the prompt as labeled blocks. The orchestrator
 * already filtered to clean alternating turns; we just stitch them.
 */
function renderPromptFromHistory(
  messages: RunAgentOpts["messages"],
  mentionSeed: string | null,
): string {
  const lines: string[] = [];
  if (mentionSeed) {
    lines.push(mentionSeed.trim(), "");
  }
  if (messages.length > 1) {
    lines.push("# Conversation so far");
    for (const m of messages.slice(0, -1)) {
      lines.push(`\n## ${m.role === "user" ? "User" : "Assistant"}\n\n${m.content}`);
    }
    lines.push("\n# Current user turn\n");
  }
  lines.push(lastUserText(messages));
  return lines.join("\n");
}

function toSourceCard(rec: SourceRecord): SourceCard {
  return {
    marker: rec.marker,
    url: rec.url,
    title: rec.title,
    category: rec.category as SourceCard["category"],
    authors: rec.authors ?? [],
    publishedAt: rec.publishedAt ?? null,
    section: rec.section ?? null,
    snippet: rec.snippet ?? "",
    ...(rec.source === "abstract" || rec.source === "body"
      ? { source: rec.source }
      : {}),
  };
}

function parseSourceLine(line: string): SourceRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const rec = JSON.parse(trimmed) as Partial<SourceRecord>;
    if (
      typeof rec.marker !== "number" ||
      typeof rec.chunk_id !== "string" ||
      typeof rec.url !== "string" ||
      typeof rec.title !== "string"
    ) {
      return null;
    }
    return rec as SourceRecord;
  } catch {
    return null;
  }
}

/** Read the JSONL file, return parsed records sorted by marker. */
async function readSources(filePath: string): Promise<SourceRecord[]> {
  const text = await readFile(filePath, "utf8").catch(() => "");
  const recs: SourceRecord[] = [];
  for (const line of text.split("\n")) {
    const r = parseSourceLine(line);
    if (r) recs.push(r);
  }
  recs.sort((a, b) => a.marker - b.marker);
  return recs;
}

/**
 * Stream-json events emitted by `claude -p --output-format stream-json`.
 * The CLI doesn't publish a typed schema, so we narrow only what we
 * read; everything else is allowed via `Record<string, unknown>`.
 */
type StreamEvent = {
  type?: string;
  subtype?: string;
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
      name?: string;
      input?: { command?: string };
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    stop_reason?: string;
  };
  delta?: { type?: string; text?: string };
  result?: string;
  is_error?: boolean;
} & Record<string, unknown>;

const SEARCH_QUERY_PATTERN =
  /forethought-search\.sh\s+("[^"]*"|'[^']*'|\S+)/;

function extractSearchQuery(command: string | undefined): string | null {
  if (!command) return null;
  const m = command.match(SEARCH_QUERY_PATTERN);
  if (!m) return null;
  let raw = m[1];
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1);
  }
  return raw || null;
}

/**
 * Drives a child claude process: parses stream-json events, polls the
 * sources file, emits SSE through opts.emit. Returns when the child
 * exits.
 */
async function streamFromChild(
  proc: ChildProcessWithoutNullStreams,
  sourcesFile: string,
  opts: RunAgentOpts,
): Promise<RunAgentResult> {
  const usage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };
  let stopReason: string | null = null;
  let iterations = 0;
  let truncated = false;

  // Cumulative sources view, deduped by marker. Each emission sends the
  // full sorted list — same shape as the API path's `sources` events.
  const seen = new Map<number, SourceCard>();
  const flushSources = async () => {
    const recs = await readSources(sourcesFile);
    let added = false;
    for (const r of recs) {
      if (!seen.has(r.marker)) {
        seen.set(r.marker, toSourceCard(r));
        added = true;
      }
    }
    if (added) {
      const sorted = [...seen.values()].sort((a, b) => a.marker - b.marker);
      opts.emit("sources", { sources: sorted });
    }
  };

  const handleEvent = (ev: StreamEvent) => {
    // Text deltas — partial assistant message events.
    if (ev.type === "stream_event" && ev.event && typeof ev.event === "object") {
      const inner = ev.event as { type?: string; delta?: { type?: string; text?: string } };
      if (
        inner.type === "content_block_delta" &&
        inner.delta?.type === "text_delta" &&
        typeof inner.delta.text === "string"
      ) {
        opts.emit("text", { delta: inner.delta.text });
      }
      return;
    }
    // Assistant turn completion — surface tool calls + text.
    if (ev.type === "assistant" && ev.message) {
      iterations += 1;
      const u = ev.message.usage;
      if (u) {
        usage.inputTokens += u.input_tokens ?? 0;
        usage.outputTokens += u.output_tokens ?? 0;
        usage.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
        usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      }
      for (const block of ev.message.content ?? []) {
        if (block.type === "tool_use" && block.name === "Bash") {
          const query = extractSearchQuery(block.input?.command);
          if (query) opts.emit("tool_call", { name: "search", query });
        }
      }
      return;
    }
    // Tool result returned — flush new sources.
    if (ev.type === "user" && ev.message) {
      void flushSources();
      return;
    }
    // Final result envelope.
    if (ev.type === "result") {
      stopReason = (ev.subtype as string) ?? "end_turn";
      if (ev.is_error) {
        const msg = typeof ev.result === "string" ? ev.result : "claude reported error";
        opts.emit("error", { message: msg });
      }
      return;
    }
  };

  // Buffer stdout into newline-delimited JSON.
  let buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        handleEvent(JSON.parse(line) as StreamEvent);
      } catch {
        // Non-JSON heartbeat or partial line — skip.
      }
    }
  });

  // Stderr → log only; claude often writes diagnostic info we don't
  // want to surface to the chat UI.
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk: string) => {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[claude] ${chunk.trimEnd()}`);
    }
  });

  // Abort plumbing — kill the child if the request is cancelled.
  if (opts.abortSignal) {
    if (opts.abortSignal.aborted) {
      proc.kill("SIGTERM");
    } else {
      opts.abortSignal.addEventListener(
        "abort",
        () => proc.kill("SIGTERM"),
        { once: true },
      );
    }
  }

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    proc.once("exit", (code) => resolve(code));
    proc.once("error", reject);
  });

  // One last flush in case the final tool_result arrived right at exit.
  await flushSources();

  if (exitCode !== 0 && exitCode !== null) {
    throw new Error(`claude -p exited ${exitCode}`);
  }
  if (iterations >= MAX_ITERS && stopReason !== "end_turn") {
    truncated = true;
  }
  return { iterations, stopReason, usage, truncated };
}

export async function runAnthropicCli(
  opts: RunAgentOpts,
): Promise<RunAgentResult> {
  const claudeBin = await resolveClaudeBin();
  const searchScript = resolveSearchScript();

  const tmpDir = await mkdtemp(path.join(tmpdir(), "librarian-"));
  const sourcesFile = path.join(tmpDir, "sources.jsonl");
  await writeFile(sourcesFile, "");

  // Single-shot prompt: claude -p doesn't manage conversation state, so
  // we serialize history into the prompt body and use the system prompt
  // for the persona + tool instructions.
  const prompt = renderPromptFromHistory(opts.messages, opts.mentionSeed);
  const systemPrompt =
    opts.systemPrompt +
    TOOL_INSTRUCTIONS_TEMPLATE.replace("{script_path}", searchScript);

  const argv = [
    "-p",
    prompt,
    "--append-system-prompt",
    systemPrompt,
    "--allowedTools",
    "Bash",
    "--permission-mode",
    "bypassPermissions",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--no-session-persistence",
  ];
  if (opts.model) argv.push("--model", opts.model);
  if (opts.effort) argv.push("--effort", opts.effort);

  // Subscription billing: drop ANTHROPIC_API_KEY from the child's env so
  // claude can never silently fall back to API billing if both are
  // present in the parent.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BENCH_SOURCES_OUT: sourcesFile,
  };
  delete env.ANTHROPIC_API_KEY;

  const proc = spawn(claudeBin, argv, { env });

  try {
    return await streamFromChild(proc, sourcesFile, opts);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Probe whether the local claude CLI is available. Cached for the
 * process lifetime; the answer doesn't change without a deploy/reboot.
 */
let cliAvailable: boolean | null = null;
export async function isClaudeCliAvailable(): Promise<boolean> {
  if (cliAvailable !== null) return cliAvailable;
  try {
    await resolveClaudeBin();
    const searchScript = resolveSearchScript();
    await stat(searchScript);
    cliAvailable = true;
  } catch {
    cliAvailable = false;
  }
  return cliAvailable;
}
