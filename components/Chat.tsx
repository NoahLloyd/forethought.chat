"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SourceCard } from "@/lib/types";
import { ArrowUp, Spark } from "./icons";
import { AssistantTurn, UserBubble, type ChatTurn } from "./Message";

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

export function Chat() {
  const [state, setState] = useState<ChatState>({ turns: [] });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new content but only if the user hasn't scrolled up.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 200) {
      el.scrollTop = el.scrollHeight;
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
              sources = data.sources as Source[];
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

  const isEmpty = state.turns.length === 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-65px)]">
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
      />
    </div>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mb-12">
      <div className="settle inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-paper-soft)] border border-[var(--color-rule)] text-[12px] text-[var(--color-ink-muted)] mb-6">
        <Spark className="w-2.5 h-2.5 text-[var(--color-coral)]" />
        <span style={{ fontFamily: "var(--font-sans)" }}>
          unofficial · grounded in 97 Forethought sources
        </span>
      </div>
      <h1
        className="settle settle-2 text-[44px] md:text-[54px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] mb-4"
        style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
      >
        Read Forethought,
        <br />
        <em
          className="not-italic"
          style={{
            fontStyle: "italic",
            color: "var(--color-coral-deep)",
            fontWeight: 400,
          }}
        >
          out loud.
        </em>
      </h1>
      <p
        className="settle settle-3 text-[17px] text-[var(--color-ink-muted)] max-w-[560px] mb-7"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        A reading companion for the public writing of{" "}
        <a
          href="https://www.forethought.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[var(--color-coral)] decoration-1 underline-offset-[3px]"
        >
          Forethought
        </a>
        — papers, essays, and the people behind them. Ask anything; every claim
        is grounded in a citation back to source.
      </p>

      <div className="settle settle-4 grid grid-cols-1 md:grid-cols-2 gap-2.5 max-w-[640px]">
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
                {" newline"}
              </div>
              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center gap-1 px-3 h-8 rounded-full text-[12.5px] text-[var(--color-ink)] bg-[var(--color-paper-deep)] hover:bg-[var(--color-rule)] transition-colors"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[var(--color-ink)]" />
                  Stop
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
          Forethought.chat is unofficial. Powered by Anthropic Claude. Verify
          load-bearing claims against the linked sources.
        </div>
      </div>
    </div>
  );
}
