"use client";

import React, { useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SourceCard } from "@/lib/types";
import { externalUrlWithFragment } from "@/lib/article-link";
import { PassageCard } from "./PassageCard";
import { Sources } from "./Sources";

export type ChatTurn =
  | {
      role: "user";
      id: string;
      content: string;
    }
  | {
      role: "assistant";
      id: string;
      content: string;
      sources: SourceCard[];
      streaming: boolean;
      error?: string | null;
    };

export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[15.5px] leading-snug bg-[var(--color-ink)] text-[var(--color-paper)]"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {content.split("\n").map((line, i, arr) => (
          <span key={i}>
            {line}
            {i < arr.length - 1 ? <br /> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AssistantTurn({
  content,
  sources,
  streaming,
  error,
}: {
  content: string;
  sources: SourceCard[];
  streaming: boolean;
  error?: string | null;
}) {
  // Server-side markers can be sparse and large (the agent may retrieve
  // 15 chunks but only cite 5 of them). Renumber for display so the user
  // sees [1] [2] [3] instead of [2] [11] [14], in order of first
  // appearance in the prose. The mapping is purely client-side; the
  // server keeps stable globally-unique markers so the model can cite
  // consistently across multi-tool-call agent loops.
  const { displayContent, displaySources, displayCited } = useMemo(() => {
    const order: number[] = [];
    const orderSeen = new Set<number>();
    CITE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CITE_RE.exec(content)) !== null) {
      for (const part of m[1].split(/\s*,\s*/)) {
        const n = Number(part);
        if (Number.isFinite(n) && !orderSeen.has(n)) {
          orderSeen.add(n);
          order.push(n);
        }
      }
    }
    CITE_RE.lastIndex = 0;

    // Original-marker → 1-based display marker.
    const map = new Map<number, number>();
    order.forEach((orig, i) => map.set(orig, i + 1));

    // Rewrite the prose so every `[N]` (or `[N, M]`) uses display nums.
    const rewritten = content.replace(
      /\[(\d+(?:\s*,\s*\d+)*)\]/g,
      (_full, group: string) => {
        const parts = group
          .split(/\s*,\s*/)
          .map(Number)
          .map((n) => map.get(n))
          .filter((n): n is number => typeof n === "number");
        if (parts.length === 0) return _full;
        return `[${parts.join(", ")}]`;
      },
    );

    // Only sources cited in the prose, with their markers renumbered to
    // match the rewritten content.
    const cited = sources
      .filter((s) => map.has(s.marker))
      .map((s) => ({ ...s, marker: map.get(s.marker)! }))
      .sort((a, b) => a.marker - b.marker);

    return {
      displayContent: rewritten,
      displaySources: cited,
      displayCited: cited,
    };
  }, [content, sources]);

  const decorate = useCallback(
    (node: React.ReactNode, keyHint: string): React.ReactNode =>
      withCitations(node, displaySources, keyHint),
    [displaySources],
  );

  const stage: "preflight" | "reading" | "writing" | "done" = streaming
    ? content.length > 0
      ? "writing"
      : sources.length > 0
        ? "reading"
        : "preflight"
    : "done";

  return (
    <div className="settle">
      {stage === "preflight" || stage === "reading" ? (
        <div className="mb-3 flex items-center gap-2 text-[12px] text-[var(--color-ink-muted)]"
             style={{ fontFamily: "var(--font-sans)" }}
             aria-live="polite"
        >
          <span className="inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-[var(--color-coral)] animate-pulse" />
          <span>
            {stage === "preflight"
              ? "Searching the corpus…"
              : `Reading ${new Set(sources.map((s) => s.url)).size} Forethought pieces…`}
          </span>
        </div>
      ) : null}
      <div className="prose-forethought">
        {content.length === 0 && streaming ? (
          <span className="streaming-caret" />
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children, ...rest }) => (
                <p {...rest}>{decorate(children, "p")}</p>
              ),
              li: ({ children, ...rest }) => (
                <li {...rest}>{decorate(children, "li")}</li>
              ),
              h1: ({ children, ...rest }) => (
                <h1 {...rest}>{decorate(children, "h1")}</h1>
              ),
              h2: ({ children, ...rest }) => (
                <h2 {...rest}>{decorate(children, "h2")}</h2>
              ),
              h3: ({ children, ...rest }) => (
                <h3 {...rest}>{decorate(children, "h3")}</h3>
              ),
              h4: ({ children, ...rest }) => (
                <h4 {...rest}>{decorate(children, "h4")}</h4>
              ),
              blockquote: ({ children, ...rest }) => (
                <blockquote {...rest}>{decorate(children, "bq")}</blockquote>
              ),
              a: ({ children, href, ...rest }) => (
                <a
                  {...rest}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              img: ({ src, alt }) => <ChatFigure src={src} alt={alt} />,
            }}
          >
            {displayContent}
          </ReactMarkdown>
        )}
        {streaming && content.length > 0 ? (
          <span className="streaming-caret" />
        ) : null}
      </div>
      {error ? (
        <div
          className="mt-3 text-[13px] text-[var(--color-coral-deep)] border-l-2 border-[var(--color-coral)] pl-3"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {error}
        </div>
      ) : null}
      {!streaming && content.length > 0 ? (
        <CopyButton content={content} />
      ) : null}
      {displayCited.length > 0 ? <Sources sources={displayCited} /> : null}
    </div>
  );
}

function CopyButton({ content }: { content: string }) {
  const [state, setState] = React.useState<"idle" | "copied">("idle");
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setState("copied");
      setTimeout(() => setState("idle"), 1400);
    } catch {
      // Clipboard API can be unavailable (insecure context, no permission).
      // Silent failure is fine; the response is right there to select.
    }
  }, [content]);
  return (
    <button
      type="button"
      onClick={copy}
      className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11.5px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-soft)] transition-colors"
      style={{ fontFamily: "var(--font-sans)" }}
      aria-label={state === "copied" ? "Copied" : "Copy response"}
    >
      {state === "copied" ? (
        <>
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="var(--color-coral-deep)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3"
            aria-hidden
          >
            <path d="M2 6.5L5 9.5L10 3.5" />
          </svg>
          copied
        </>
      ) : (
        <>
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3"
            aria-hidden
          >
            <rect x="3.5" y="2" width="6.5" height="7.5" rx="1" />
            <path d="M2 4.5v5.5h5.5" />
          </svg>
          copy
        </>
      )}
    </button>
  );
}

const CITE_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function withCitations(
  node: React.ReactNode,
  sources: SourceCard[],
  keyHint: string,
): React.ReactNode {
  if (node === null || node === undefined) return node;
  if (typeof node === "boolean") return node;
  if (typeof node === "number") return node;

  if (typeof node === "string") {
    if (!node.includes("[")) return node;
    CITE_RE.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = CITE_RE.exec(node)) !== null) {
      if (m.index > last) parts.push(node.slice(last, m.index));
      const nums = m[1].split(/\s*,\s*/).map((n) => Number(n));
      nums.forEach((n, j) => {
        parts.push(
          <CitationChip
            key={`${keyHint}-${i}-${j}`}
            marker={n}
            source={sources.find((s) => s.marker === n)}
          />,
        );
      });
      last = CITE_RE.lastIndex;
      i++;
    }
    CITE_RE.lastIndex = 0;
    if (parts.length === 0) return node;
    if (last < node.length) parts.push(node.slice(last));
    return <>{parts}</>;
  }

  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <React.Fragment key={`${keyHint}-${i}`}>
        {withCitations(c, sources, `${keyHint}-${i}`)}
      </React.Fragment>
    ));
  }

  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    const newChildren = withCitations(
      el.props.children,
      sources,
      `${keyHint}-c`,
    );
    return React.cloneElement(el, { children: newChildren } as never);
  }

  return node;
}

function CitationChip({
  marker,
  source,
}: {
  marker: number;
  source: SourceCard | undefined;
}) {
  if (!source) {
    return (
      <sup
        className="cite-chip cite-missing"
        title="No matching source in this turn's retrieval"
      >
        {marker}
      </sup>
    );
  }

  // Plain click opens forethought.org with the cited passage highlighted
  // via a text fragment. Hovering the chip reveals the preview card so
  // the user can decide before clicking.
  const externalHref = externalUrlWithFragment(
    source.url,
    source.snippet,
    source.source,
  );

  return (
    <span className="passage-anchor">
      <a
        href={externalHref}
        target="_blank"
        rel="noopener noreferrer"
        className="cite-chip"
        aria-label={`Citation ${marker}: ${source.title}`}
      >
        {marker}
      </a>
      <PassageCard
        source={source}
        passages={
          source.snippet ? [{ marker, snippet: source.snippet }] : []
        }
        placement="above"
      />
    </span>
  );
}

/**
 * Render a Markdown image as a captioned figure. Forethought hosts images
 * on Contentful with protocol-relative URLs (`//images.ctfassets.net/…`);
 * normalise them to https so they resolve in production.
 */
function ChatFigure({
  src,
  alt,
}: {
  src?: string | Blob;
  alt?: string;
}) {
  if (typeof src !== "string" || src.length === 0) return null;
  const normalized = src.startsWith("//") ? `https:${src}` : src;
  return (
    <figure className="chat-figure">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={normalized} alt={alt ?? ""} loading="lazy" decoding="async" />
      {alt ? <figcaption>{alt}</figcaption> : null}
    </figure>
  );
}

