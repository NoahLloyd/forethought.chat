"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogEntry, SourceCard } from "@/lib/types";
import { ArrowUp, Spark } from "./icons";
import { AssistantTurn, UserBubble, type ChatTurn } from "./Message";

type CorpusStats = {
  research: number;
  people: number;
  chunks: number;
  totalWords: number;
  builtAt: string;
};

type CatalogPayload = {
  catalog: CatalogEntry[];
  stats: CorpusStats;
  topics: { name: string; count: number }[];
  authors: { name: string; count: number }[];
};

const STARTERS: Array<{ label: string; query: string }> = [
  {
    label: "What is the intelligence explosion?",
    query:
      "What is the intelligence explosion as Forethought describes it, and what makes it different from earlier framings?",
  },
  {
    label: "Forethought's grand challenges, ranked",
    query:
      "Which grand challenges does Forethought consider load-bearing for AGI preparedness, and how do they differ from misalignment?",
  },
  {
    label: "Compare 'better futures' to x-risk reduction",
    query:
      "How does the Better Futures research agenda differ from a pure existential-risk-reduction frame? What's the tension?",
  },
  {
    label: "Power concentration & AI-enabled coups",
    query:
      "Summarise the AI-enabled coups paper. What's the core mechanism and what does Forethought recommend doing about it?",
  },
];

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

type ChatState = {
  turns: ChatTurn[];
};

const STORAGE_KEY = "forethought.chat.transcript.v1";
const STORAGE_LIMIT_BYTES = 256 * 1024;

export function Chat({
  initialCatalog = [],
  initialStats = null,
  initialTopics = [],
}: {
  initialCatalog?: CatalogEntry[];
  initialStats?: CorpusStats | null;
  initialTopics?: { name: string; count: number }[];
} = {}) {
  const [state, setState] = useState<ChatState>({ turns: [] });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [stats, setStats] = useState<CorpusStats | null>(initialStats);
  const [catalog, setCatalog] = useState<CatalogEntry[]>(initialCatalog);
  const [topics, setTopics] =
    useState<{ name: string; count: number }[]>(initialTopics);
  const [hydrated, setHydrated] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Hydrate transcript from localStorage on mount. Keeping the chat alive
  // across reloads is a small thing that users notice immediately.
  // If the URL carries `?q=…` (e.g., from a "chat about this" link on a
  // reader page) we drop the prior transcript and submit the query in a
  // follow-up effect.
  useEffect(() => {
    let queued: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      if (q && q.trim().length > 0) {
        queued = q.trim();
        // Clean the URL so a reload doesn't re-submit.
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {
      // ignore
    }

    try {
      if (queued) {
        setState({ turns: [] });
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setPendingQuery(queued);
      } else {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ChatState;
          const turns = parsed.turns.map((t) =>
            t.role === "assistant" ? { ...t, streaming: false } : t,
          );
          setState({ turns });
        }
      }
    } catch {
      // ignore — corrupted state shouldn't break the page
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist after every change. We cap the size so a runaway session
  // doesn't fill the user's localStorage budget.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const serialised = JSON.stringify(state);
      if (serialised.length <= STORAGE_LIMIT_BYTES) {
        window.localStorage.setItem(STORAGE_KEY, serialised);
      } else {
        // Drop oldest pairs until we fit; preserves the most recent context.
        const trimmed = { ...state, turns: state.turns.slice(-20) };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      }
    } catch {
      // localStorage may be unavailable (private mode, quota); ignore.
    }
  }, [state, hydrated]);

  // Catalog already arrives as initial props from the server component, so
  // the welcome screen paints with real numbers on first byte. We re-fetch
  // in the background to pick up new pieces published since the page was
  // statically built (the catalog endpoint revalidates hourly).
  useEffect(() => {
    if (catalog.length > 0) return;
    let cancelled = false;
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CatalogPayload | null) => {
        if (cancelled || !data) return;
        setStats(data.stats);
        setCatalog(data.catalog);
        setTopics(data.topics);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [catalog.length]);

  // Auto-scroll behaviour:
  //   - On the very first turn (welcome → 2 turns), always scroll the new
  //     assistant turn into view. Mobile users start at the top of the
  //     welcome screen; we'd lose them otherwise.
  //   - On subsequent turns, only scroll if they're already near the bottom
  //     so we don't yank a user who has scrolled up to re-read something.
  const wasEmptyRef = useRef(true);
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    if (state.turns.length === 0) {
      wasEmptyRef.current = true;
      return;
    }
    const justBecameNonEmpty = wasEmptyRef.current && state.turns.length >= 1;
    wasEmptyRef.current = false;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    if (justBecameNonEmpty || distanceFromBottom < 200) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: justBecameNonEmpty ? "smooth" : "auto",
      });
    }
  }, [state.turns]);

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      const userTurn: ChatTurn = {
        role: "user",
        id: makeId(),
        content: trimmed,
      };
      const assistantId = makeId();
      const assistantTurn: ChatTurn = {
        role: "assistant",
        id: assistantId,
        content: "",
        sources: [],
        streaming: true,
        error: null,
      };

      setState((s) => ({ turns: [...s.turns, userTurn, assistantTurn] }));
      setInput("");
      setStreaming(true);

      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const history = [
          ...state.turns,
          { role: "user" as const, content: trimmed, id: userTurn.id },
        ].map((t) => ({ role: t.role, content: t.content }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        let sources: SourceCard[] = [];
        let errorMsg: string | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Server-Sent Events are separated by blank lines.
          const events = buffer.split(/\n\n/);
          buffer = events.pop() ?? "";
          for (const ev of events) {
            const lines = ev.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event: "));
            const dataLine = lines.find((l) => l.startsWith("data: "));
            if (!eventLine || !dataLine) continue;
            const evType = eventLine.slice(7).trim();
            const data = JSON.parse(dataLine.slice(6));
            if (evType === "sources") {
              sources = data.sources as SourceCard[];
              setState((s) => ({
                turns: s.turns.map((t) =>
                  t.role === "assistant" && t.id === assistantId
                    ? { ...t, sources }
                    : t,
                ),
              }));
            } else if (evType === "text") {
              assistantText += data.delta as string;
              setState((s) => ({
                turns: s.turns.map((t) =>
                  t.role === "assistant" && t.id === assistantId
                    ? { ...t, content: assistantText }
                    : t,
                ),
              }));
            } else if (evType === "error") {
              errorMsg = data.message as string;
            }
          }
        }

        setState((s) => ({
          turns: s.turns.map((t) =>
            t.role === "assistant" && t.id === assistantId
              ? { ...t, streaming: false, error: errorMsg }
              : t,
          ),
        }));
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setState((s) => ({
            turns: s.turns.map((t) =>
              t.role === "assistant" && t.id === assistantId
                ? { ...t, streaming: false, error: "stopped" }
                : t,
            ),
          }));
        } else {
          const msg = err instanceof Error ? err.message : "unknown error";
          setState((s) => ({
            turns: s.turns.map((t) =>
              t.role === "assistant" && t.id === assistantId
                ? { ...t, streaming: false, error: msg }
                : t,
            ),
          }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [state.turns, streaming],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // After hydration, fire any queued URL query exactly once.
  useEffect(() => {
    if (!hydrated || !pendingQuery || streaming) return;
    const q = pendingQuery;
    setPendingQuery(null);
    submit(q);
  }, [hydrated, pendingQuery, streaming, submit]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ turns: [] });
    setInput("");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const isEmpty = state.turns.length === 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-65px)]">
      {!isEmpty ? (
        <div className="absolute top-[72px] right-6 z-20">
          <button
            onClick={reset}
            className="px-3 h-8 rounded-full text-[12.5px] text-[var(--color-ink-muted)] bg-[var(--color-paper-soft)] border border-[var(--color-rule)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)] hover:border-[var(--color-coral)] transition-colors"
            style={{ fontFamily: "var(--font-sans)" }}
            aria-label="Start a new conversation"
          >
            ＋ new chat
          </button>
        </div>
      ) : null}
      <div
        ref={transcriptRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-[760px] mx-auto px-6 pt-10 pb-44">
          {isEmpty ? (
            <Welcome
              onPick={(q) => submit(q)}
              stats={stats}
              catalog={catalog}
              topics={topics}
            />
          ) : null}

          <div className="space-y-9">
            {state.turns.map((turn) =>
              turn.role === "user" ? (
                <UserBubble key={turn.id} content={turn.content} />
              ) : (
                <AssistantTurn
                  key={turn.id}
                  content={turn.content}
                  sources={turn.sources}
                  streaming={turn.streaming}
                  error={turn.error ?? null}
                />
              ),
            )}
          </div>
        </div>
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => submit(input)}
        onStop={stop}
        streaming={streaming}
      />
    </div>
  );
}

function Welcome({
  onPick,
  stats,
  catalog,
  topics,
}: {
  onPick: (q: string) => void;
  stats: CorpusStats | null;
  catalog: CatalogEntry[];
  topics: { name: string; count: number }[];
}) {
  // Pick six most-recent research pieces — gives users a "what's new" feel
  // without overwhelming the welcome screen.
  const recent = useMemo(
    () =>
      catalog
        .filter((c) => c.category === "research" && c.publishedAt)
        .sort((a, b) =>
          (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
        )
        .slice(0, 6),
    [catalog],
  );
  const sourceCount = stats ? stats.research + stats.people : 97;
  const wordsLabel = useMemo(() => {
    if (!stats) return "554k words";
    const w = stats.totalWords;
    if (w > 1_000_000) return `${(w / 1_000_000).toFixed(1)}m words`;
    if (w > 1_000) return `${Math.round(w / 1000)}k words`;
    return `${w} words`;
  }, [stats]);

  return (
    <div className="mb-12">
      <div className="settle inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-paper-soft)] border border-[var(--color-rule)] text-[12px] text-[var(--color-ink-muted)] mb-6">
        <Spark className="w-2.5 h-2.5 text-[var(--color-coral)]" />
        <span style={{ fontFamily: "var(--font-sans)" }}>
          unofficial · grounded in {sourceCount} Forethought sources ·{" "}
          {wordsLabel}
        </span>
      </div>
      <h1
        className="settle settle-2 text-[44px] md:text-[54px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] mb-4"
        style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
      >
        Ask Forethought&rsquo;s
        <br />
        <em
          className="not-italic"
          style={{
            fontStyle: "italic",
            color: "var(--color-coral-deep)",
            fontWeight: 400,
          }}
        >
          research, anything.
        </em>
      </h1>
      <p
        className="settle settle-3 text-[17px] text-[var(--color-ink-muted)] max-w-[560px] mb-7"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        A chat companion for the public writing of{" "}
        <a
          href="https://www.forethought.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[var(--color-coral)] decoration-1 underline-offset-[3px]"
        >
          Forethought
        </a>
        . Every claim is grounded in a citation; click any chip to read the
        passage in context.
      </p>

      <div className="settle settle-4 grid grid-cols-1 md:grid-cols-2 gap-2.5 max-w-[640px] mb-12">
        {STARTERS.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.query)}
            className="text-left px-4 py-3 rounded-[10px] border border-[var(--color-rule)] bg-[var(--color-paper-soft)]/60 hover:bg-[var(--color-paper-soft)] hover:border-[var(--color-coral)] transition-all duration-150 group"
          >
            <span
              className="text-[14.5px] text-[var(--color-ink)] leading-snug block"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {s.label}
            </span>
            <span
              className="text-[11.5px] text-[var(--color-ink-faint)] mt-1 block opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              ↵ ask
            </span>
          </button>
        ))}
      </div>

      {recent.length > 0 ? (
        <div className="settle settle-5 mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <span
              className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Recently published
            </span>
            <a
              href="https://www.forethought.org/research"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-coral-deep)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              all research →
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {recent.map((p) => {
              const date = p.publishedAt
                ? new Date(p.publishedAt).toLocaleDateString("en-GB", {
                    month: "short",
                    year: "numeric",
                  })
                : null;
              const askIt = `Summarise '${p.title}'. What's the core argument and the strongest objection?`;
              return (
                <button
                  key={p.url}
                  onClick={() => onPick(askIt)}
                  className="source-card text-left rounded-[10px] border border-[var(--color-rule)] bg-[var(--color-paper-soft)]/40 px-3.5 py-3"
                >
                  <div
                    className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] mb-1"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {date}
                    {p.authors.length > 0
                      ? ` · ${p.authors.slice(0, 2).join(", ")}${p.authors.length > 2 ? " et al." : ""}`
                      : null}
                  </div>
                  <div
                    className="text-[14px] text-[var(--color-ink)] leading-snug"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 500,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {p.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {topics.length > 0 ? (
        <div className="settle settle-5">
          <div className="flex items-baseline mb-3">
            <span
              className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Topics covered
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topics.slice(0, 12).map((t) => (
              <button
                key={t.name}
                onClick={() =>
                  onPick(
                    `What does Forethought publish on ${t.name.toLowerCase()}? Give me the key papers and their main claims.`,
                  )
                }
                className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-full border border-[var(--color-rule)] bg-[var(--color-paper-soft)]/40 hover:bg-[var(--color-paper-soft)] hover:border-[var(--color-coral)] text-[12.5px] text-[var(--color-ink)] transition-colors"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {t.name}
                <span className="text-[var(--color-ink-faint)] text-[11px]">
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea up to 8 rows.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [value]);

  // Cmd/Ctrl+K focuses the composer from anywhere on the page. ⌘K is the
  // de-facto "focus the chat input" gesture; people expect it. Esc while
  // streaming aborts the in-flight response.
  const [modKey, setModKey] = useState<"⌘" | "Ctrl">("⌘");
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const isMac =
        /mac|iphone|ipad|ipod/i.test(navigator.platform) ||
        /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
      setModKey(isMac ? "⌘" : "Ctrl");
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        taRef.current?.focus();
      }
      if (e.key === "Escape" && streaming) {
        e.preventDefault();
        onStop();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [streaming, onStop]);

  // Auto-focus the composer on first paint so users can start typing
  // immediately. Only on desktop — on mobile this would pop the keyboard
  // unsolicited and feel aggressive.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      taRef.current?.focus();
    }
  }, []);

  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
      <div className="max-w-[760px] mx-auto px-6 pb-6">
        {/* Soft fade so transcript text doesn't run sharp into the composer */}
        <div
          aria-hidden
          className="h-12 -mb-1"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--color-paper) 80%)",
          }}
        />
        <div className="pointer-events-auto bg-[var(--color-paper)] rounded-[18px] border border-[var(--color-rule)] shadow-[0_4px_24px_-12px_rgba(24,24,24,0.18)]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="px-3.5 pt-3 pb-2.5"
          >
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="Ask about a paper, an author, an argument…"
              rows={1}
              id="composer"
              aria-label="Message Forethought.chat"
              className="block w-full resize-none bg-transparent text-[16px] leading-[1.45] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)]"
              style={{ fontFamily: "var(--font-serif)" }}
            />
            <div className="flex items-center justify-between mt-1.5">
              <div
                className="text-[11px] text-[var(--color-ink-faint)]"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                <kbd
                  className="font-medium"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  ↵
                </kbd>
                {" send · "}
                <kbd
                  className="font-medium"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  ⇧↵
                </kbd>
                {" newline · "}
                <kbd
                  className="font-medium"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {modKey}K
                </kbd>
                {" focus"}
              </div>
              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  title="Stop generating (Esc)"
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12.5px] text-[var(--color-ink)] bg-[var(--color-paper-deep)] hover:bg-[var(--color-rule)] transition-colors"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[var(--color-ink)]" />
                  Stop
                  <kbd
                    className="ml-1 text-[10.5px] text-[var(--color-ink-muted)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Esc
                  </kbd>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={value.trim().length === 0}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--color-ink)] text-[var(--color-paper)] disabled:bg-[var(--color-rule)] disabled:text-[var(--color-ink-faint)] disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
        </div>
        <div
          className="mt-2.5 text-center text-[11px] text-[var(--color-ink-faint)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Forethought.chat is unofficial. Powered by Claude. Verify
          load-bearing claims against the linked sources.
        </div>
      </div>
    </div>
  );
}
