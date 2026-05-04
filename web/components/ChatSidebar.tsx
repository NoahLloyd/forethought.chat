"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ForethoughtMark } from "./icons";
import { PROVIDER_LABELS, type ByokState } from "@/lib/providers/types";

export type ChatSummary = {
  id: string;
  title: string | null;
  updated_at: string;
};

export function ChatSidebar({
  chats,
  activeId,
  historyEnabled,
  byok,
  onPickChat,
  onNewChat,
  onDeleteChat,
  onLogoClick,
  onOpenSettings,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  historyEnabled: boolean;
  byok: ByokState;
  onPickChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onLogoClick: () => void;
  onOpenSettings: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on Esc.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Auto-close on viewport widening (drawer becomes the permanent sidebar).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = () => {
      if (mql.matches) setMobileOpen(false);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Wrap pick/new handlers so the drawer closes after an action on mobile.
  const wrap = (fn: () => void) => () => {
    fn();
    setMobileOpen(false);
  };

  const sidebarBody = (
    <SidebarContent
      chats={chats}
      activeId={activeId}
      historyEnabled={historyEnabled}
      byok={byok}
      onPickChat={(id) => {
        onPickChat(id);
        setMobileOpen(false);
      }}
      onNewChat={wrap(onNewChat)}
      onDeleteChat={onDeleteChat}
      onLogoClick={wrap(onLogoClick)}
      onOpenSettings={wrap(onOpenSettings)}
    />
  );

  return (
    <>
      {/* Mobile-only menu button: opens the drawer. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open chat menu"
        className="md:hidden fixed top-3 left-3 z-30 inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--color-paper-soft)] border border-[var(--color-rule)] text-[var(--color-ink)] hover:bg-[var(--color-paper)] shadow-[0_2px_6px_-2px_rgba(47,42,38,0.12)]"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          className="w-4 h-4"
          aria-hidden
        >
          <path d="M2.5 4.5h11" />
          <path d="M2.5 8h11" />
          <path d="M2.5 11.5h11" />
        </svg>
      </button>

      {/* Mobile drawer + backdrop. */}
      {mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-[var(--color-ink)]/30 backdrop-blur-[2px]"
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[280px] flex flex-col bg-[var(--color-paper-soft)] border-r border-[var(--color-rule)] shadow-[0_8px_28px_-12px_rgba(47,42,38,0.35)]"
            aria-label="Chat history"
          >
            {sidebarBody}
          </aside>
        </div>
      ) : null}

      {/* Permanent sidebar on md+ screens. */}
      <aside
        className="hidden md:flex flex-col w-[260px] shrink-0 border-r border-[var(--color-rule-soft)] bg-[var(--color-paper-soft)]/60"
        aria-label="Chat history"
      >
        {sidebarBody}
      </aside>
    </>
  );
}

function SidebarContent({
  chats,
  activeId,
  historyEnabled,
  byok,
  onPickChat,
  onNewChat,
  onDeleteChat,
  onLogoClick,
  onOpenSettings,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  historyEnabled: boolean;
  byok: ByokState;
  onPickChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onLogoClick: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Brand block: clicking the logo returns to the welcome screen
          (treats the front page as "out of chat mode"). */}
      <button
        type="button"
        onClick={onLogoClick}
        className="px-3 pt-4 pb-3 text-left flex items-center gap-2 text-[var(--color-ink)] hover:text-[var(--color-coral-deep)] transition-colors"
        aria-label="Forethought.chat: back to welcome screen"
        style={{ lineHeight: 1 }}
      >
        <ForethoughtMark style={{ width: "21px", height: "26px" }} aria-hidden />
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: "20px",
            letterSpacing: "-0.012em",
            lineHeight: 1,
          }}
        >
          Forethought<span className="text-[var(--color-coral)]">.</span>chat
        </span>
        <span
          className="ml-1 inline-block text-[11px] italic text-[var(--color-ink-faint)]"
          style={{ fontFamily: "var(--font-serif)" }}
          aria-label="unofficial site"
        >
          unofficial
        </span>
      </button>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onNewChat}
          className="w-full inline-flex items-center justify-between gap-2 h-9 px-3 rounded-[8px] text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]/60 transition-colors"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          <span className="inline-flex items-center gap-2">
            <svg
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="w-3 h-3"
              aria-hidden
            >
              <path d="M6 2v8" />
              <path d="M2 6h8" />
            </svg>
            New chat
          </span>
        </button>
      </div>

      <div className="px-3 pt-2 pb-1">
        <span
          className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          History
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {!historyEnabled ? (
          <div
            className="px-2 py-2 text-[12px] italic text-[var(--color-ink-faint)] leading-snug"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Past chats will appear here once Supabase is configured.
          </div>
        ) : chats.length === 0 ? (
          <div
            className="px-2 py-2 text-[12px] italic text-[var(--color-ink-faint)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            No past chats yet.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((c) => (
              <li key={c.id}>
                <ChatRow
                  chat={c}
                  active={activeId === c.id}
                  onPick={() => onPickChat(c.id)}
                  onDelete={() => onDeleteChat(c.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quiet meta links sit above the rule so they read as
          unobtrusive footnotes rather than primary actions. */}
      <div className="px-4 pt-2 pb-1.5 flex items-center justify-between gap-3">
        <Link
          href="/about"
          className="text-[11.5px] text-[var(--color-ink-faint)] hover:text-[var(--color-coral-deep)] transition-colors"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          About
        </Link>
        <a
          href="https://www.forethought.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11.5px] text-[var(--color-ink-faint)] hover:text-[var(--color-coral-deep)] transition-colors"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          forethought.org
          <svg
            viewBox="0 0 12 12"
            className="w-2.5 h-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 3h6v6" />
            <path d="M3 9l6-6" />
          </svg>
        </a>
      </div>

      {/* Settings owns the bottom band; full-width hover surface, real
          equalizer-style icon, provider badge on the right when set. */}
      <div className="border-t border-[var(--color-rule-soft)] p-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between gap-2 h-9 px-2 rounded-[8px] text-[12.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]/70 transition-colors"
          style={{ fontFamily: "var(--font-sans)" }}
          aria-label="Open API key settings"
        >
          <span className="inline-flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[15px] h-[15px]"
              aria-hidden
            >
              <path d="M14 17H5" />
              <path d="M19 7h-9" />
              <circle cx="17" cy="17" r="3" />
              <circle cx="7" cy="7" r="3" />
            </svg>
            Settings
          </span>
          {byok.active ? (
            <span
              className="inline-flex items-center px-1.5 h-[18px] rounded text-[10px] text-[var(--color-coral-deep)] bg-[var(--color-coral-tint)]/40"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {PROVIDER_LABELS[byok.active]}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function ChatRow({
  chat,
  active,
  onPick,
  onDelete,
}: {
  chat: ChatSummary;
  active: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!active) setConfirming(false);
  }, [active]);

  return (
    <div
      className={`group relative flex items-center rounded-[8px] ${
        active ? "bg-[var(--color-paper-deep)]" : "hover:bg-[var(--color-paper-deep)]/60"
      }`}
    >
      <button
        type="button"
        onClick={onPick}
        className="flex-1 min-w-0 text-left px-2.5 py-2"
        title={chat.title ?? "Untitled chat"}
      >
        <div
          className="text-[12.5px] text-[var(--color-ink)] truncate"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {chat.title?.trim() || "Untitled chat"}
        </div>
        <div
          className="mt-0.5 text-[10.5px] text-[var(--color-ink-faint)]"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {timeAgo(chat.updated_at)}
        </div>
      </button>
      {confirming ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="px-2 py-1 mr-1 rounded text-[10.5px] text-[var(--color-coral-deep)] bg-[var(--color-coral-tint)] hover:bg-[var(--color-coral)] hover:text-white transition-colors"
          style={{ fontFamily: "var(--font-sans)" }}
          aria-label="Confirm delete"
        >
          delete
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          className="opacity-0 group-hover:opacity-100 px-1.5 py-1 mr-1 rounded text-[var(--color-ink-faint)] hover:text-[var(--color-coral-deep)] transition-opacity"
          aria-label="Delete chat"
        >
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            className="w-3 h-3"
            aria-hidden
          >
            <path d="M3 4h6" />
            <path d="M4.5 4V3h3v1" />
            <path d="M4 4l0.5 6h3L8 4" />
          </svg>
        </button>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.round(diff / minute)}m ago`;
  if (diff < day) return `${Math.round(diff / hour)}h ago`;
  if (diff < day * 30) return `${Math.round(diff / day)}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
