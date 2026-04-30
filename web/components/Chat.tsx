"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ArticleMention,
  CatalogEntry,
  SourceCard,
} from "@/lib/types";
import { ArrowUp } from "./icons";
import { ChatSidebar, type ChatSummary } from "./ChatSidebar";
import { ByokSettings } from "./ByokSettings";
import { AssistantTurn, UserBubble, type ChatTurn } from "./Message";
import {
  EMPTY_BYOK_STATE,
  type ByokConfig,
  type ByokState,
  type Provider,
} from "@/lib/providers/types";

const BYOK_STORAGE_KEY = "forethought.chat.byok.v2";

function loadByok(): ByokState {
  if (typeof window === "undefined") return EMPTY_BYOK_STATE;
  try {
    const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return EMPTY_BYOK_STATE;
    const parsed = JSON.parse(raw) as ByokState;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.keys === "object"
    ) {
      return {
        active: (parsed.active as Provider | null) ?? null,
        keys: parsed.keys ?? {},
      };
    }
    return EMPTY_BYOK_STATE;
  } catch {
    return EMPTY_BYOK_STATE;
  }
}

function activeConfig(state: ByokState): ByokConfig | null {
  if (!state.active) return null;
  const entry = state.keys[state.active];
  if (!entry) return null;
  return { provider: state.active, apiKey: entry.apiKey, model: entry.model };
}

const STARTERS: string[] = [
  "What is the intelligence explosion?",
  "What are Forethought's grand challenges?",
  "Compare 'better futures' to x-risk reduction.",
  "Summarise the AI-enabled coups paper.",
];

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

type ChatState = {
  turns: ChatTurn[];
};

const STORAGE_KEY = "forethought.chat.transcript.v1";
const STORAGE_LIMIT_BYTES = 256 * 1024;

export function Chat() {
  const [state, setState] = useState<ChatState>({ turns: [] });
  const [input, setInput] = useState("");
  const [mentions, setMentions] = useState<ArticleMention[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [byok, setByok] = useState<ByokState>(EMPTY_BYOK_STATE);
  const [byokOpen, setByokOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const lastSavedRef = useRef<string>("");

  // Pull the catalog so the composer can offer @-mention suggestions.
  // Cached at the edge for an hour; once we have it, we don't refetch.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { catalog?: CatalogEntry[] } | null) => {
        if (cancelled || !data?.catalog) return;
        setCatalog(data.catalog);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // On mount, ask the server whether Supabase-backed chat history is
  // enabled. If yes, fetch the user's chats; if no, fall through to
  // localStorage hydration like before.
  const refreshChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chats");
      if (!res.ok) return;
      const data = (await res.json()) as {
        enabled?: boolean;
        chats?: ChatSummary[];
      };
      if (data.enabled) {
        setHistoryEnabled(true);
        setChats(data.chats ?? []);
      }
    } catch {
      // Network / configuration errors leave history disabled. Fine.
    }
  }, []);
  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  // Hydrate BYOK state on mount.
  useEffect(() => {
    setByok(loadByok());
  }, []);

  const persistByok = useCallback((next: ByokState) => {
    setByok(next);
    try {
      const isEmpty =
        next.active === null && Object.keys(next.keys).length === 0;
      if (isEmpty) {
        window.localStorage.removeItem(BYOK_STORAGE_KEY);
      } else {
        window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // localStorage unavailable; in-memory state still applies.
    }
  }, []);

  useEffect(() => {
    let queued: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      if (q && q.trim().length > 0) {
        queued = q.trim();
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
      } else if (!historyEnabled) {
        // Without Supabase we hydrate from localStorage so the chat
        // survives page reloads. With Supabase we start with a clean
        // slate and let the user pick from the sidebar instead.
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
      // ignore: corrupted state shouldn't break the page
    } finally {
      setHydrated(true);
    }
  }, [historyEnabled]);

  // Persist transcripts: localStorage when history is off, Supabase when
  // it's on. Both run after hydration only.
  useEffect(() => {
    if (!hydrated) return;
    if (historyEnabled) return;
    try {
      const serialised = JSON.stringify(state);
      if (serialised.length <= STORAGE_LIMIT_BYTES) {
        window.localStorage.setItem(STORAGE_KEY, serialised);
      } else {
        const trimmed = { ...state, turns: state.turns.slice(-20) };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      }
    } catch {
      // localStorage may be unavailable (private mode, quota); ignore.
    }
  }, [state, hydrated, historyEnabled]);

  // Save to Supabase. Debounced + skipped while streaming so we don't
  // write half-rendered assistant turns. The first save creates the
  // row (server returns the new id); subsequent saves upsert.
  useEffect(() => {
    if (!hydrated) return;
    if (!historyEnabled) return;
    if (streaming) return;
    if (state.turns.length === 0) return;

    const payload = JSON.stringify(state);
    if (payload === lastSavedRef.current) return;

    const handle = window.setTimeout(async () => {
      const firstUser = state.turns.find((t) => t.role === "user");
      const title = firstUser
        ? firstUser.content.replace(/\s+/g, " ").slice(0, 80)
        : null;
      try {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: sessionId ?? undefined,
            title,
            transcript: state.turns,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          chat?: { id: string };
        };
        if (data.chat?.id) {
          if (!sessionId) setSessionId(data.chat.id);
          lastSavedRef.current = payload;
          void refreshChats();
        }
      } catch {
        // best-effort save; ignore
      }
    }, 600);

    return () => window.clearTimeout(handle);
  }, [state, hydrated, historyEnabled, streaming, sessionId, refreshChats]);

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

      // Only send mentions whose @-token is still in the message text.
      const activeMentions = mentions.filter((m) =>
        trimmed.includes(`@${m.title}`),
      );

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
      setMentions([]);
      setStreaming(true);

      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const history = [
          ...state.turns,
          { role: "user" as const, content: trimmed, id: userTurn.id },
        ].map((t) => ({ role: t.role, content: t.content }));

        const wireByok = activeConfig(byok);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: history,
            mentions: activeMentions,
            byok: wireByok ?? undefined,
          }),
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
    [state.turns, streaming, mentions, byok],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
    setMentions([]);
    setSessionId(null);
    lastSavedRef.current = "";
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const loadChat = useCallback(
    async (id: string) => {
      if (id === sessionId) return;
      abortRef.current?.abort();
      try {
        const res = await fetch(`/api/chats/${id}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          chat?: { id: string; transcript: ChatTurn[] };
        };
        if (!data.chat) return;
        const turns = (data.chat.transcript ?? []).map((t) =>
          t.role === "assistant" ? { ...t, streaming: false } : t,
        );
        setState({ turns });
        setSessionId(data.chat.id);
        lastSavedRef.current = JSON.stringify({ turns });
        setInput("");
        setMentions([]);
      } catch {
        // ignore
      }
    },
    [sessionId],
  );

  const deleteChat = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/chats/${id}`, { method: "DELETE" });
        if (id === sessionId) {
          setState({ turns: [] });
          setSessionId(null);
          lastSavedRef.current = "";
        }
        void refreshChats();
      } catch {
        // ignore
      }
    },
    [sessionId, refreshChats],
  );

  const isEmpty = state.turns.length === 0;

  return (
    <div className="flex h-dvh">
      <ChatSidebar
        chats={chats}
        activeId={sessionId}
        historyEnabled={historyEnabled}
        byok={byok}
        onPickChat={loadChat}
        onNewChat={reset}
        onDeleteChat={deleteChat}
        onLogoClick={reset}
        onOpenSettings={() => setByokOpen(true)}
      />
      <ByokSettings
        open={byokOpen}
        state={byok}
        onClose={() => setByokOpen(false)}
        onSave={persistByok}
      />
      <div className="relative flex flex-col flex-1 min-w-0">
      <div
        ref={transcriptRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-[760px] mx-auto px-6 pt-10 pb-44">
          {isEmpty ? <Welcome onPick={(q) => submit(q)} /> : null}

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
        catalog={catalog}
        mentions={mentions}
        onMentionsChange={setMentions}
      />
      </div>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="settle pt-[10vh] pb-8 max-w-[560px] mx-auto">
      <h1
        className="text-[34px] md:text-[40px] leading-[1.05] tracking-[-0.012em] text-[var(--color-ink)] mb-3"
        style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
      >
        Forethought<span className="text-[var(--color-coral)]">.</span>chat
      </h1>
      <p
        className="text-[16.5px] leading-[1.55] text-[var(--color-ink-muted)] max-w-[460px] mb-10"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        <em
          style={{
            fontStyle: "italic",
            color: "var(--color-ink)",
          }}
        >
          A reading companion for{" "}
          <a
            href="https://www.forethought.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--color-coral)] decoration-1 underline-offset-[3px]"
          >
            Forethought&rsquo;s
          </a>{" "}
          research.
        </em>{" "}
        Ask anything; every claim is grounded in a citation. Type{" "}
        <span
          className="inline-block px-1 rounded text-[14px] text-[var(--color-coral-deep)] bg-[var(--color-coral-tint)]/60"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          @
        </span>{" "}
        in the composer to reference a paper directly.
      </p>

      <div
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)] mb-2"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        Try asking
      </div>
      <ul className="space-y-0.5">
        {STARTERS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="starter-link group inline-flex items-baseline gap-2 py-1.5 text-left text-[16px] leading-snug text-[var(--color-ink)] hover:text-[var(--color-coral-deep)] transition-colors"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              <span
                className="text-[var(--color-ink-faint)] group-hover:text-[var(--color-coral)] transition-colors"
                aria-hidden
              >
                &rarr;
              </span>
              <span className="border-b border-transparent group-hover:border-[var(--color-coral)]/60 transition-colors">
                {s}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type MentionTrigger = {
  /** Index of the `@` in the textarea value. */
  atIdx: number;
  /** Substring after the `@`, before the caret. */
  query: string;
};

function detectMention(text: string, cursor: number): MentionTrigger | null {
  if (cursor === 0) return null;
  const before = text.slice(0, cursor);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  const charBefore = atIdx > 0 ? text[atIdx - 1] : " ";
  if (atIdx > 0 && !/\s/.test(charBefore)) return null;
  const query = before.slice(atIdx + 1);
  // Article titles can contain spaces, so we keep the picker open while
  // the user types a phrase. We still bail on:
  //   - a newline (signals the user moved on)
  //   - too long a query (likely a paste, not a search)
  //   - a 2nd `@` inside the query (probably typing literal text)
  if (/[\n\r]/.test(query)) return null;
  if (query.length > 80) return null;
  if (query.includes("@")) return null;
  return { atIdx, query };
}

function rankCatalog(
  catalog: CatalogEntry[],
  query: string,
  active: ArticleMention[],
): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(active.map((m) => m.url));
  const pool = catalog.filter((c) => !taken.has(c.url));
  if (q.length === 0) {
    // Empty query: surface most-recent research first, then people.
    return pool
      .slice()
      .sort((a, b) => {
        if (a.category !== b.category) {
          return a.category === "research" ? -1 : 1;
        }
        return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
      })
      .slice(0, 8);
  }
  const scored = pool.map((c) => {
    let score = 0;
    const t = c.title.toLowerCase();
    if (t.startsWith(q)) score += 6;
    else if (t.includes(q)) score += 3;
    for (const a of c.authors) {
      if (a.toLowerCase().includes(q)) score += 2;
    }
    for (const topic of c.topics ?? []) {
      if (topic.toLowerCase().includes(q)) score += 1;
    }
    return { c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.c);
}

function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  catalog,
  mentions,
  onMentionsChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  catalog: CatalogEntry[];
  mentions: ArticleMention[];
  onMentionsChange: (next: ArticleMention[]) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [value]);

  const suggestions = useMemo(
    () => (trigger ? rankCatalog(catalog, trigger.query, mentions) : []),
    [trigger, catalog, mentions],
  );

  // Reset highlight when suggestion list changes.
  useEffect(() => {
    setHighlight(0);
  }, [suggestions.length, trigger?.query]);

  const insertMention = useCallback(
    (entry: CatalogEntry) => {
      const ta = taRef.current;
      if (!ta || !trigger) return;
      const before = value.slice(0, trigger.atIdx);
      const after = value.slice(trigger.atIdx + 1 + trigger.query.length);
      const inserted = `@${entry.title} `;
      const next = `${before}${inserted}${after}`;
      onChange(next);
      onMentionsChange([
        ...mentions.filter((m) => m.url !== entry.url),
        { url: entry.url, title: entry.title },
      ]);
      setTrigger(null);
      requestAnimationFrame(() => {
        const pos = before.length + inserted.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    },
    [trigger, value, onChange, onMentionsChange, mentions],
  );

  const removeMention = useCallback(
    (url: string) => {
      const target = mentions.find((m) => m.url === url);
      onMentionsChange(mentions.filter((m) => m.url !== url));
      if (target) {
        const stripped = value.replace(`@${target.title} `, "").replace(`@${target.title}`, "");
        if (stripped !== value) onChange(stripped);
      }
    },
    [mentions, value, onChange, onMentionsChange],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      onChange(next);
      const cursor = e.target.selectionStart ?? next.length;
      setTrigger(detectMention(next, cursor));
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Esc always closes the picker if open: handy when the user wants
      // to keep their literal `@` text without picking a result.
      if (trigger && e.key === "Escape") {
        e.preventDefault();
        setTrigger(null);
        return;
      }
      if (trigger && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlight((h) => (h + 1) % suggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlight(
            (h) => (h - 1 + suggestions.length) % suggestions.length,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(suggestions[highlight]);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [trigger, suggestions, highlight, insertMention, onSubmit],
  );

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      taRef.current?.focus();
    }
  }, []);

  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
      <div className="max-w-[760px] mx-auto px-6 pb-6">
        <div
          aria-hidden
          className="h-12 -mb-1"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--color-paper) 80%)",
          }}
        />
        <div className="relative pointer-events-auto bg-[var(--color-paper)] rounded-[18px] border border-[var(--color-rule)] shadow-[0_4px_24px_-12px_rgba(24,24,24,0.18)]">
          {trigger && suggestions.length > 0 ? (
            <MentionPicker
              suggestions={suggestions}
              highlight={highlight}
              onPick={insertMention}
              onHover={setHighlight}
            />
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="px-3.5 pt-3 pb-2.5"
          >
            {mentions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {mentions.map((m) => (
                  <span
                    key={m.url}
                    className="inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-full bg-[var(--color-paper-deep)] border border-[var(--color-rule)] text-[12px] text-[var(--color-ink)]"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    <span className="text-[var(--color-coral-deep)]">@</span>
                    <span className="truncate max-w-[280px]">{m.title}</span>
                    <button
                      type="button"
                      onClick={() => removeMention(m.url)}
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] hover:bg-[var(--color-rule-soft)]"
                      aria-label={`Remove mention ${m.title}`}
                    >
                      <svg
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        className="w-2.5 h-2.5"
                        aria-hidden
                      >
                        <path d="M2 2l6 6" />
                        <path d="M8 2l-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <textarea
              ref={taRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onSelect={(e) => {
                const t = e.currentTarget;
                setTrigger(detectMention(t.value, t.selectionStart ?? 0));
              }}
              onBlur={() => {
                // Defer so click on a suggestion can land first.
                window.setTimeout(() => setTrigger(null), 120);
              }}
              placeholder="Ask anything · type @ to reference an article"
              rows={1}
              id="composer"
              aria-label="Message Forethought.chat"
              className="block w-full resize-none bg-transparent text-[16px] leading-[1.45] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)]"
              style={{ fontFamily: "var(--font-sans)" }}
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
                  @
                </kbd>
                {" mention · "}
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
      </div>
    </div>
  );
}

function MentionPicker({
  suggestions,
  highlight,
  onPick,
  onHover,
}: {
  suggestions: CatalogEntry[];
  highlight: number;
  onPick: (entry: CatalogEntry) => void;
  onHover: (idx: number) => void;
}) {
  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 z-30 max-h-[280px] overflow-y-auto rounded-[14px] bg-[var(--color-paper-soft)] border border-[var(--color-ink)] shadow-[0_8px_22px_-10px_rgba(47,42,38,0.35)]"
      role="listbox"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {suggestions.map((entry, i) => {
        const date = entry.publishedAt
          ? new Date(entry.publishedAt).toLocaleDateString("en-GB", {
              month: "short",
              year: "numeric",
            })
          : null;
        const active = i === highlight;
        return (
          <button
            key={entry.url}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(entry);
            }}
            className={`block w-full text-left px-3 py-2 ${
              active
                ? "bg-[var(--color-paper-deep)]"
                : "hover:bg-[var(--color-paper-deep)]/60"
            }`}
          >
            <div
              className="text-[13.5px] text-[var(--color-ink)] leading-tight truncate"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            >
              {entry.title}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--color-ink-muted)] truncate">
              {entry.category === "people" ? "Person" : entry.category}
              {entry.authors.length > 0
                ? ` · ${entry.authors.slice(0, 3).join(", ")}${
                    entry.authors.length > 3 ? " et al." : ""
                  }`
                : null}
              {date ? ` · ${date}` : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
