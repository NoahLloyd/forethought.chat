import { NextResponse } from "next/server";
import { buildStablePreamble, formatSearchResult } from "@/lib/prompt";
import { chunksForUrl, getCatalog, search } from "@/lib/search";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  PROVIDERS,
  runAgent,
  type ByokConfig,
  type Provider,
} from "@/lib/providers";
import type {
  ArticleMention,
  ChatMessage,
  Chunk,
  SourceCard,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeSnippet(text: string, max = 280): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const window = cleaned.slice(0, max + 80);
  const cutoff = window.lastIndexOf(". ");
  if (cutoff > max - 80 && cutoff < max + 80) return window.slice(0, cutoff + 1);
  return cleaned.slice(0, max).trimEnd() + "…";
}

function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
}

function parseByok(raw: unknown): ByokConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    isProvider(o.provider) &&
    typeof o.apiKey === "string" &&
    o.apiKey.trim().length > 0 &&
    typeof o.model === "string" &&
    o.model.trim().length > 0
  ) {
    return {
      provider: o.provider,
      apiKey: o.apiKey.trim(),
      model: o.model.trim(),
    };
  }
  return null;
}

export async function POST(req: Request) {
  let body: {
    messages?: ChatMessage[];
    mentions?: ArticleMention[];
    byok?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m): m is ChatMessage =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0,
  );
  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return NextResponse.json(
      { error: "messages must end with a user turn" },
      { status: 400 },
    );
  }

  const mentions: ArticleMention[] = [];
  const seenMentionUrls = new Set<string>();
  for (const m of body.mentions ?? []) {
    if (
      m &&
      typeof m.url === "string" &&
      typeof m.title === "string" &&
      m.url.startsWith("https://") &&
      !seenMentionUrls.has(m.url)
    ) {
      mentions.push({ url: m.url, title: m.title });
      seenMentionUrls.add(m.url);
    }
  }

  const byok = parseByok(body.byok);
  const provider: Provider = byok?.provider ?? DEFAULT_PROVIDER;
  const model = byok?.model ?? DEFAULT_MODEL[provider];
  const apiKey =
    byok?.apiKey ??
    (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY ?? "" : "");

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          provider === DEFAULT_PROVIDER
            ? "ANTHROPIC_API_KEY missing on server. Add it to .env or supply your own key in Settings."
            : "API key required for non-default provider. Open Settings to add one.",
      },
      { status: 400 },
    );
  }

  const catalog = await getCatalog();
  const systemPrompt = buildStablePreamble(catalog);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Per-request citation registry. `seen` maps chunk id → assigned card
      // so re-finding the same chunk in a later search keeps the marker
      // stable. `nextMarker` is the next free integer.
      const seen = new Map<string, SourceCard>();
      let nextMarker = 1;

      const recordChunks = (chunks: Chunk[]) => {
        let addedAny = false;
        const numbered: Array<{ chunk: Chunk; marker: number }> = [];
        for (const chunk of chunks) {
          let card = seen.get(chunk.id);
          if (!card) {
            card = {
              marker: nextMarker++,
              url: chunk.url,
              title: chunk.title,
              category: chunk.category,
              authors: chunk.authors,
              publishedAt: chunk.publishedAt,
              section: chunk.section,
              snippet: makeSnippet(chunk.text),
              source: chunk.source,
            };
            seen.set(chunk.id, card);
            addedAny = true;
          }
          numbered.push({ chunk, marker: card.marker });
        }
        if (addedAny) {
          send("sources", {
            sources: [...seen.values()].sort((a, b) => a.marker - b.marker),
          });
        }
        return numbered;
      };

      // Search callback handed to provider adapters: it does retrieval,
      // assigns markers, emits the `sources` SSE, and returns the
      // formatted text the model should see as the tool result.
      const searchCallback = async (query: string, k: number) => {
        const trimmed = query.trim();
        if (!trimmed) return formatSearchResult("", []);
        const hits = await search(trimmed, k);
        const numbered = recordChunks(hits.map((h) => h.chunk));
        return formatSearchResult(trimmed, numbered);
      };

      // Pre-seed mentions: pull chunks for each mentioned URL, register
      // them through the same registry (so the model gets stable [N]
      // markers), and hand the formatted text to the provider as the
      // initial mention seed.
      let mentionSeed: string | null = null;
      if (mentions.length > 0) {
        const seedQuery = mentions.map((m) => `"${m.title}"`).join(" + ");
        const seedChunks: Chunk[] = [];
        for (const m of mentions) {
          const chunks = await chunksForUrl(m.url);
          // Cap per-article so a long essay doesn't crowd a 2nd mention.
          for (const c of chunks.slice(0, 4)) seedChunks.push(c);
        }
        const numbered = recordChunks(seedChunks);
        if (numbered.length > 0) {
          mentionSeed = `# Seeded context: user mentioned these article(s)\n\nThe user @-mentioned: ${mentions
            .map((m) => `"${m.title}"`)
            .join(", ")}. Initial excerpts have been retrieved for you below. Read them, then evaluate whether the question is answered or whether you should call \`search\` for additional material before responding.\n\n${formatSearchResult(seedQuery, numbered)}`;
          send("tool_call", { name: "search", query: seedQuery });
        }
      }

      try {
        const result = await runAgent(provider, {
          apiKey,
          model,
          systemPrompt,
          messages,
          mentionSeed,
          search: searchCallback,
          emit: send,
          abortSignal: req.signal,
        });

        if (result.truncated) {
          send("error", { message: `agent stopped after iteration cap` });
        }

        send("done", {
          stopReason: result.truncated ? "max_iterations" : result.stopReason,
          iterations: result.iterations,
          usage: result.usage,
          provider,
          model,
        });
      } catch (err) {
        // Gemini wraps its error JSON inside the SDK error message, then
        // wraps that string in another JSON. Try to peel both layers and
        // surface the human-readable message; fall back to raw text.
        const raw = err instanceof Error ? err.message : "unknown error";
        let msg = raw;
        try {
          const outer = JSON.parse(raw) as { error?: { message?: string } };
          if (typeof outer?.error?.message === "string") {
            try {
              const inner = JSON.parse(outer.error.message) as {
                error?: { message?: string };
              };
              msg = inner?.error?.message ?? outer.error.message;
            } catch {
              msg = outer.error.message;
            }
          }
        } catch {
          // Not JSON; keep raw.
        }
        send("error", { message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
