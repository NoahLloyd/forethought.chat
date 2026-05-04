"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_MODEL,
  DEFAULT_SUB_CONFIG,
  EFFORT_LEVELS,
  PROVIDER_KEY_URL,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  PROVIDERS,
  type ByokState,
  type Effort,
  type Provider,
  type SubConfig,
} from "@/lib/providers/types";
import { AnthropicMark, GoogleMark, OpenAIMark } from "./icons";

const KEY_PREFIX_HINT: Record<Provider, string> = {
  anthropic: "sk-ant-…",
  openai: "sk-…",
  google: "AI…",
};

function ProviderIcon({
  provider,
  className,
}: {
  provider: Provider;
  className?: string;
}) {
  if (provider === "anthropic") return <AnthropicMark className={className} />;
  if (provider === "openai") return <OpenAIMark className={className} />;
  return <GoogleMark className={className} />;
}

type FormEntry = { apiKey: string; model: string };
type FormState = Record<Provider, FormEntry>;

function initialForm(state: ByokState): FormState {
  const out: Partial<FormState> = {};
  for (const p of PROVIDERS) {
    out[p] = {
      apiKey: state.keys[p]?.apiKey ?? "",
      model: state.keys[p]?.model ?? DEFAULT_MODEL[p],
    };
  }
  return out as FormState;
}

const EFFORT_HINTS: Record<Effort, string> = {
  low: "Minimal thinking, fastest responses.",
  medium: "Light thinking for straightforward questions.",
  high: "Standard extended thinking.",
  xhigh: "Extra thinking for complex questions.",
  max: "Maximum thinking budget.",
};

export function ByokSettings({
  open,
  state,
  onClose,
  onSave,
  cliAvailable,
  subConfig,
  onSubSave,
}: {
  open: boolean;
  state: ByokState;
  onClose: () => void;
  onSave: (next: ByokState) => void;
  cliAvailable: boolean;
  subConfig: SubConfig;
  onSubSave: (next: SubConfig) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(state));
  const [active, setActive] = useState<Provider | null>(state.active);
  const [reveal, setReveal] = useState<Partial<Record<Provider, boolean>>>({});
  const [subModel, setSubModel] = useState(subConfig.model);
  const [subEffort, setSubEffort] = useState<Effort>(subConfig.effort);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(state));
    setActive(state.active);
    setReveal({});
    setSubModel(subConfig.model);
    setSubEffort(subConfig.effort);
  }, [open, state, subConfig]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const updateEntry = (p: Provider, patch: Partial<FormEntry>) => {
    setForm((f) => ({ ...f, [p]: { ...f[p], ...patch } }));
  };

  const clearProvider = (p: Provider) => {
    setForm((f) => ({
      ...f,
      [p]: { apiKey: "", model: DEFAULT_MODEL[p] },
    }));
    if (active === p) setActive(null);
  };

  const handleSave = () => {
    const next: ByokState = { active: null, keys: {} };
    for (const p of PROVIDERS) {
      const entry = form[p];
      const trimmed = entry.apiKey.trim();
      if (trimmed.length >= 8) {
        next.keys[p] = { apiKey: trimmed, model: entry.model };
      }
    }
    next.active = active && next.keys[active] ? active : null;
    onSave(next);
    onSubSave({ model: subModel, effort: subEffort });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-ink)]/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal
        aria-label="API key settings"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(94vw,520px)] max-h-[88vh] overflow-y-auto bg-[var(--color-paper-soft)] border border-[var(--color-ink)] rounded-[12px] shadow-[0_12px_36px_-10px_rgba(47,42,38,0.45)] p-5"
      >
        <div className="flex items-baseline justify-between mb-1">
          <h2
            className="text-[18px] text-[var(--color-ink)]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              letterSpacing: "-0.01em",
            }}
          >
            API keys
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors"
          >
            <svg
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="w-3 h-3"
              aria-hidden
            >
              <path d="M2 2l8 8" />
              <path d="M10 2l-8 8" />
            </svg>
          </button>
        </div>
        <p
          className="text-[12.5px] italic text-[var(--color-ink-muted)] leading-snug mb-3"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Save keys for any providers you want to use; pick one as
          &ldquo;Active&rdquo;. Stored only in your browser; sent server-side
          on each chat request, never logged.
        </p>

        {/* Subscription mode panel — shown when the local claude CLI is on PATH */}
        {cliAvailable ? (
          <div className="rounded-[10px] border border-[var(--color-ink)]/20 bg-[var(--color-paper-deep)]/40 px-3.5 py-3 mb-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className="text-[14px] text-[var(--color-ink)]"
                style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
              >
                Subscription
              </span>
              <span
                className="inline-flex items-center px-1.5 h-[16px] rounded text-[10px] text-[var(--color-coral-deep)] bg-[var(--color-coral-tint)]/40"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                local · no key needed
              </span>
            </div>

            <label className="block mb-2.5">
              <span
                className="block text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-1"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Model
              </span>
              <select
                value={subModel}
                onChange={(e) => setSubModel(e.target.value)}
                className="w-full h-9 px-2 rounded-[8px] bg-[var(--color-paper)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)]"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {PROVIDER_MODELS.anthropic.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span
                className="block text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-1.5"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Effort
              </span>
              <div className="flex gap-1.5">
                {EFFORT_LEVELS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setSubEffort(e)}
                    title={EFFORT_HINTS[e]}
                    className={`flex-1 h-8 rounded-[8px] text-[12px] transition-colors ${
                      subEffort === e
                        ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
                        : "bg-[var(--color-paper)] border border-[var(--color-rule)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    }`}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <p
              className="mt-2.5 text-[11.5px] text-[var(--color-ink-muted)] leading-snug"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Used when no API key is active. Runs on your local{" "}
              <code className="text-[10.5px] bg-[var(--color-paper-deep)] px-1 rounded">
                claude
              </code>{" "}
              subscription — never billed to an API key.
            </p>
          </div>
        ) : (
          /* Default-key callout when no CLI is present */
          <div className="rounded-[10px] border border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)]/40 px-3 py-2.5 mb-4 text-[12px] leading-snug text-[var(--color-ink-muted)]"
               style={{ fontFamily: "var(--font-sans)" }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span
                className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Default · no key required
              </span>
              <span
                className="text-[10.5px] text-[var(--color-coral-deep)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Claude Sonnet 4.6
              </span>
            </div>
            <p>
              Leave every provider below empty (or pick{" "}
              <span className="italic">Use server default</span>) and your
              messages run on the project&rsquo;s own Anthropic key, set to
              Claude Sonnet 4.6. No sign-up, but it&rsquo;s shared with
              everyone using the site.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {PROVIDERS.map((p) => {
            const entry = form[p];
            const trimmed = entry.apiKey.trim();
            const hasKey = trimmed.length >= 8;
            const isActive = active === p;
            return (
              <div
                key={p}
                className={`rounded-[10px] border ${
                  isActive
                    ? "border-[var(--color-ink)]"
                    : "border-[var(--color-rule)]"
                } px-3.5 py-3 transition-colors`}
              >
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="active-provider"
                      checked={isActive}
                      disabled={!hasKey}
                      onChange={() => setActive(p)}
                      className="accent-[var(--color-coral)]"
                    />
                    <a
                      href={PROVIDER_KEY_URL[p]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[var(--color-ink)] hover:text-[var(--color-coral-deep)] transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ProviderIcon
                        provider={p}
                        className="w-4 h-4"
                      />
                      <span
                        className="text-[14px]"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 500,
                        }}
                      >
                        {PROVIDER_LABELS[p]}
                      </span>
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3h6v6"/><path d="M3 9l6-6"/></svg>
                    </a>
                    {isActive ? (
                      <span
                        className="inline-flex items-center px-1.5 h-[16px] rounded text-[10px] text-[var(--color-coral-deep)] bg-[var(--color-coral-tint)]/40"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        active
                      </span>
                    ) : null}
                  </label>
                  {hasKey ? (
                    <button
                      type="button"
                      onClick={() => clearProvider(p)}
                      className="text-[11.5px] text-[var(--color-ink-faint)] hover:text-[var(--color-coral-deep)] transition-colors"
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      clear
                    </button>
                  ) : null}
                </div>

                <label className="block mb-2">
                  <span
                    className="block text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-1"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    API key
                  </span>
                  <div className="relative">
                    <input
                      type={reveal[p] ? "text" : "password"}
                      value={entry.apiKey}
                      onChange={(e) =>
                        updateEntry(p, { apiKey: e.target.value })
                      }
                      placeholder={KEY_PREFIX_HINT[p]}
                      spellCheck={false}
                      autoComplete="off"
                      className="w-full h-9 px-2 pr-16 rounded-[8px] bg-[var(--color-paper)] border border-[var(--color-rule)] text-[12.5px] text-[var(--color-ink)]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setReveal((r) => ({ ...r, [p]: !r[p] }))
                      }
                      className="absolute right-1 top-1 h-7 px-2 rounded text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)] transition-colors"
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      {reveal[p] ? "hide" : "show"}
                    </button>
                  </div>
                </label>

                <label className="block">
                  <span
                    className="block text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-1"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Model
                  </span>
                  <select
                    value={entry.model}
                    onChange={(e) =>
                      updateEntry(p, { model: e.target.value })
                    }
                    className="w-full h-9 px-2 rounded-[8px] bg-[var(--color-paper)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)]"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {PROVIDER_MODELS[p].map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>

              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-[var(--color-rule-soft)]">
          <button
            type="button"
            onClick={() => setActive(null)}
            className="text-[12.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-coral-deep)] transition-colors"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            Use server default
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 h-8 rounded-[8px] text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 h-8 rounded-[8px] text-[13px] text-[var(--color-paper)] bg-[var(--color-ink)] hover:bg-[var(--color-coral-deep)] transition-colors"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
