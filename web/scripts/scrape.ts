/**
 * Forethought.org content scraper.
 *
 * Forethought publishes via Next.js + Contentful. The reliable text source is
 * the embedded `__NEXT_DATA__` payload which holds the structured CMS records
 * (articles, people, pages). We pull those records directly and keep the
 * markdown bodies intact rather than scraping rendered HTML — this preserves
 * footnote markers, headings, links, and code spans for downstream chunking.
 *
 *   pnpm scrape                    # incremental
 *   pnpm scrape -- --refresh       # ignore raw/ cache
 *   pnpm scrape -- --only research # research / people / pages only
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

const ROOT = path.resolve(process.cwd());
const RAW_DIR = path.join(ROOT, "data", "raw");
const OUT_DIR = path.join(ROOT, "data", "content");
const SITEMAP_URL = "https://www.forethought.org/sitemap.xml";

const argv = process.argv.slice(2);
const REFRESH = argv.includes("--refresh");
const ONLY = ((): "research" | "people" | "pages" | null => {
  const i = argv.indexOf("--only");
  if (i === -1) return null;
  const v = argv[i + 1];
  return v === "research" || v === "people" || v === "pages" ? v : null;
})();

type Category = "research" | "people" | "pages";

type ContentRecord = {
  url: string;
  category: Category;
  slug: string;
  type: string | null;
  title: string;
  description: string;
  authors: { name: string; slug: string | null; role: string | null }[];
  topics: string[];
  publishedAt: string | null;
  series: SeriesInfo | null;
  links: {
    podcast: string | null;
    podcastTitle: string | null;
    podcastDurationSeconds: number | null;
    lesswrong: string | null;
    eaForum: string | null;
    preprint: string | null;
    sameAs: string[];
  };
  body: string;
  text: string;
  wordCount: number;
  scrapedAt: string;
};

function categorise(url: string): Category | null {
  const u = new URL(url);
  if (u.hostname !== "www.forethought.org" && u.hostname !== "forethought.org") {
    return null;
  }
  if (u.pathname.startsWith("/research/")) return "research";
  if (u.pathname.startsWith("/people/")) return "people";
  const skip = new Set([
    "/subscribe",
    "/donate",
    "/2025-fundraiser",
    "/privacy-policy",
    "/support",
    "/newsletter",
    "/contact",
    "/careers/expression-of-interest",
    "/careers/expression-of-interest-power-concentration",
  ]);
  if (skip.has(u.pathname)) return null;
  if (
    u.pathname === "/" ||
    u.pathname === "/about" ||
    u.pathname === "/careers" ||
    u.pathname === "/research"
  ) {
    return "pages";
  }
  return null;
}

function slugFor(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length === 0 || parts[0] === "") return "home";
  return parts.join("__");
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchWithCache(url: string): Promise<string> {
  const slug = slugFor(url);
  const cachePath = path.join(RAW_DIR, `${slug}.html`);
  if (!REFRESH) {
    try {
      return await fs.readFile(cachePath, "utf8");
    } catch {
      // fall through to network
    }
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "ForethoughtChatBot/1.0 (+https://forethought.chat; research index)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  await ensureDir(RAW_DIR);
  await fs.writeFile(cachePath, html, "utf8");
  return html;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readNextData(html: string): unknown | null {
  const $ = cheerio.load(html);
  const blob = $("script#__NEXT_DATA__").text();
  if (!blob) return null;
  try {
    return JSON.parse(blob);
  } catch {
    return null;
  }
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/:inline-graphic\{[^}]*\}/g, "")
    .replace(/:inline-quote\{[^}]*\}/g, "")
    .replace(/^[ \t]+$/gm, "")
    .replace(/ /g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownToPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/[#>*_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSectionsBody(sections: unknown): string {
  if (!Array.isArray(sections)) return "";
  const parts: string[] = [];
  for (const s of sections) {
    if (!isObject(s) || !isObject(s.fields)) continue;
    const f = s.fields as Record<string, unknown>;
    const body = typeof f.body === "string" ? f.body : "";
    if (body.trim()) parts.push(body.trim());
    const intro = typeof f.intro === "string" ? f.intro : "";
    if (intro.trim()) parts.push(intro.trim());
    const text = typeof f.text === "string" ? f.text : "";
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join("\n\n");
}

function extractAuthorRefs(
  authors: unknown,
): { name: string; slug: string | null; role: string | null }[] {
  if (!Array.isArray(authors)) return [];
  const out: { name: string; slug: string | null; role: string | null }[] = [];
  for (const a of authors) {
    if (!isObject(a) || !isObject(a.fields)) continue;
    const f = a.fields as Record<string, unknown>;
    const name = typeof f.name === "string" ? f.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      slug: typeof f.slug === "string" ? f.slug : null,
      role: typeof f.role === "string" ? f.role : null,
    });
  }
  return out;
}

function extractTopics(topics: unknown): string[] {
  if (!Array.isArray(topics)) return [];
  const out: string[] = [];
  for (const t of topics) {
    if (typeof t === "string") {
      const v = t.trim();
      if (v && !out.includes(v)) out.push(v);
    } else if (isObject(t) && isObject(t.fields)) {
      const f = t.fields as Record<string, unknown>;
      const v =
        (typeof f.title === "string" && f.title.trim()) ||
        (typeof f.name === "string" && f.name.trim()) ||
        "";
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

type SeriesPart = { slug: string; title: string };

type SeriesInfo = {
  title: string;
  slug: string | null;
  totalParts: number;
  currentIndex: number | null;
  parts: SeriesPart[];
  overview: SeriesPart | null;
};

/**
 * Forethought's `seriesContext` payload has the shape
 *   { kind: "part" | "overview", seriesName, totalParts,
 *     partsNavigation: { currentIndex, previousArticle, nextArticle, overviewArticle },
 *     partsList: [{ slug, title, isCurrent }] }
 * — not the original Sanity-style `seriesContext.series.fields`. Read
 * directly from the partsList so a series carries its full ordering.
 */
function extractSeries(seriesContext: unknown): SeriesInfo | null {
  if (!isObject(seriesContext)) return null;
  const seriesName =
    typeof seriesContext.seriesName === "string"
      ? seriesContext.seriesName.trim()
      : "";
  if (!seriesName) return null;
  const totalParts =
    typeof seriesContext.totalParts === "number" ? seriesContext.totalParts : 0;
  const nav = isObject(seriesContext.partsNavigation)
    ? seriesContext.partsNavigation
    : null;
  const partsListRaw = Array.isArray(seriesContext.partsList)
    ? seriesContext.partsList
    : [];
  const parts: SeriesPart[] = [];
  let currentIndex: number | null = null;
  partsListRaw.forEach((p, i) => {
    if (
      isObject(p) &&
      typeof p.slug === "string" &&
      typeof p.title === "string"
    ) {
      parts.push({ slug: p.slug, title: p.title.trim() });
      if (p.isCurrent === true) currentIndex = i;
    }
  });
  // partsNavigation can also tell us currentIndex (1-based per the payload)
  if (currentIndex === null && nav && typeof nav.currentIndex === "number") {
    currentIndex = nav.currentIndex - 1;
  }
  let overview: SeriesPart | null = null;
  if (nav && isObject(nav.overviewArticle)) {
    const o = nav.overviewArticle;
    if (typeof o.slug === "string" && typeof o.title === "string") {
      overview = { slug: o.slug, title: o.title.trim() };
    }
  }
  return {
    title: seriesName,
    slug: overview?.slug ?? null,
    totalParts,
    currentIndex,
    parts,
    overview,
  };
}

function extractPodcastMetadata(podcastMetadata: unknown, link: string | null) {
  if (!link || !isObject(podcastMetadata)) {
    return { podcastTitle: null, podcastDurationSeconds: null };
  }
  const m = podcastMetadata as Record<string, unknown>;
  const entry = m[link];
  if (!isObject(entry)) {
    return { podcastTitle: null, podcastDurationSeconds: null };
  }
  return {
    podcastTitle: typeof entry.title === "string" ? entry.title : null,
    podcastDurationSeconds:
      typeof entry.durationSeconds === "number" ? entry.durationSeconds : null,
  };
}

function metaFromHtml(html: string) {
  const $ = cheerio.load(html);
  return {
    ogTitle: $('meta[property="og:title"]').attr("content") ?? "",
    ogDescription:
      $('meta[property="og:description"]').attr("content") ??
      $('meta[name="description"]').attr("content") ??
      "",
    docTitle: $("title").first().text(),
  };
}

function getPageProps(data: unknown): Record<string, unknown> | null {
  if (!isObject(data)) return null;
  const props = isObject(data.props)
    ? (data.props as Record<string, unknown>)
    : null;
  if (!props) return null;
  return isObject(props.pageProps)
    ? (props.pageProps as Record<string, unknown>)
    : null;
}

function buildResearchRecord(
  url: string,
  data: unknown,
  html: string,
): ContentRecord | null {
  const pageProps = getPageProps(data);
  if (!pageProps) return null;
  const article = isObject(pageProps.article)
    ? (pageProps.article as Record<string, unknown>)
    : null;
  if (!article || !isObject(article.fields)) return null;
  const f = article.fields as Record<string, unknown>;

  const title = typeof f.title === "string" ? f.title.trim() : "";
  const abstract = typeof f.abstract === "string" ? f.abstract.trim() : "";
  const authorDescription =
    typeof f.authorDescription === "string" ? f.authorDescription.trim() : "";
  const sectionsBody = extractSectionsBody(f.sections);
  const bodyMd = cleanMarkdown(
    [
      title ? `# ${title}` : "",
      abstract ? `**Abstract.** ${abstract}` : "",
      sectionsBody,
      authorDescription ? `*Acknowledgements.* ${authorDescription}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  const text = markdownToPlain(bodyMd);
  const meta = metaFromHtml(html);

  const podcastLink = typeof f.podcastLink === "string" ? f.podcastLink : null;
  const { podcastTitle, podcastDurationSeconds } = extractPodcastMetadata(
    pageProps.podcastMetadata,
    podcastLink,
  );

  return {
    url,
    category: "research",
    slug: typeof f.slug === "string" ? f.slug : slugFor(url),
    type: typeof f.type === "string" ? f.type : null,
    title: title || meta.ogTitle || meta.docTitle,
    description: abstract.slice(0, 600) || meta.ogDescription,
    authors: extractAuthorRefs(f.authors),
    topics: extractTopics(f.topics),
    publishedAt: ((): string | null => {
      const v = typeof f.publishedAt === "string" ? f.publishedAt : null;
      if (!v) return null;
      const m = /^\d{4}-\d{2}-\d{2}/.exec(v);
      return m ? m[0] : null;
    })(),
    series: extractSeries(pageProps.seriesContext),
    links: {
      podcast: podcastLink,
      podcastTitle,
      podcastDurationSeconds,
      lesswrong: typeof f.lesswrongLink === "string" ? f.lesswrongLink : null,
      eaForum: typeof f.eaForumLink === "string" ? f.eaForumLink : null,
      preprint:
        typeof f.preprintRepositoryLink === "string"
          ? f.preprintRepositoryLink
          : null,
      sameAs: [],
    },
    body: bodyMd,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    scrapedAt: new Date().toISOString(),
  };
}

function buildPersonRecord(
  url: string,
  data: unknown,
  html: string,
): ContentRecord | null {
  const pageProps = getPageProps(data);
  if (!pageProps) return null;
  const person = isObject(pageProps.person)
    ? (pageProps.person as Record<string, unknown>)
    : null;
  if (!person || !isObject(person.fields)) return null;
  const f = person.fields as Record<string, unknown>;

  const name = typeof f.name === "string" ? f.name.trim() : "";
  const role = typeof f.role === "string" ? f.role.trim() : "";
  const bio = typeof f.bio === "string" ? f.bio.trim() : "";
  const sameAs = Array.isArray(f.sameAs)
    ? (f.sameAs as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const bodyMd = cleanMarkdown(
    [name ? `# ${name}` : "", role ? `**Role:** ${role}` : "", bio]
      .filter(Boolean)
      .join("\n\n"),
  );
  const text = markdownToPlain(bodyMd);
  const meta = metaFromHtml(html);

  return {
    url,
    category: "people",
    slug: typeof f.slug === "string" ? f.slug : slugFor(url),
    type: typeof f.teamCategory === "string" ? f.teamCategory : null,
    title: name || meta.ogTitle || meta.docTitle,
    description: role
      ? `${role} — ${bio.slice(0, 240)}`.trim()
      : bio.slice(0, 240),
    authors: name
      ? [
          {
            name,
            slug: typeof f.slug === "string" ? f.slug : null,
            role: role || null,
          },
        ]
      : [],
    topics: [],
    publishedAt: null,
    series: null,
    links: {
      podcast: null,
      podcastTitle: null,
      podcastDurationSeconds: null,
      lesswrong: null,
      eaForum: null,
      preprint: null,
      sameAs,
    },
    body: bodyMd,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    scrapedAt: new Date().toISOString(),
  };
}

function buildPageRecord(
  url: string,
  data: unknown,
  html: string,
): ContentRecord | null {
  const pageProps = getPageProps(data);
  if (!pageProps) return null;
  const page = isObject(pageProps.page)
    ? (pageProps.page as Record<string, unknown>)
    : null;
  if (!page || !isObject(page.fields)) return null;
  const f = page.fields as Record<string, unknown>;

  const title = typeof f.title === "string" ? f.title.trim() : "";
  const sectionsBody = extractSectionsBody(f.sections);
  const bodyMd = cleanMarkdown(
    [title ? `# ${title}` : "", sectionsBody].filter(Boolean).join("\n\n"),
  );
  const text = markdownToPlain(bodyMd);
  const meta = metaFromHtml(html);

  return {
    url,
    category: "pages",
    slug: typeof f.slug === "string" ? f.slug : slugFor(url),
    type: null,
    title: title || meta.ogTitle || meta.docTitle,
    description: meta.ogDescription || text.slice(0, 240),
    authors: [],
    topics: [],
    publishedAt: null,
    series: null,
    links: {
      podcast: null,
      podcastTitle: null,
      podcastDurationSeconds: null,
      lesswrong: null,
      eaForum: null,
      preprint: null,
      sameAs: [],
    },
    body: bodyMd,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    scrapedAt: new Date().toISOString(),
  };
}

async function processUrl(url: string): Promise<ContentRecord | null> {
  const cat = categorise(url);
  if (!cat) return null;
  if (ONLY && cat !== ONLY) return null;

  const html = await fetchWithCache(url);
  const data = readNextData(html);

  if (cat === "research") return buildResearchRecord(url, data, html);
  if (cat === "people") return buildPersonRecord(url, data, html);
  return buildPageRecord(url, data, html);
}

async function readSitemap(): Promise<string[]> {
  const xml = await (
    await fetch(SITEMAP_URL, {
      headers: {
        "User-Agent":
          "ForethoughtChatBot/1.0 (+https://forethought.chat; research index)",
      },
    })
  ).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return [...new Set(urls)];
}

async function main() {
  await ensureDir(OUT_DIR);
  await ensureDir(RAW_DIR);

  // Wipe stale per-record JSON so renamed slugs don't leave orphans.
  for (const f of await fs.readdir(OUT_DIR)) {
    if (f.endsWith(".json")) await fs.unlink(path.join(OUT_DIR, f));
  }

  console.log("Fetching sitemap…");
  const allUrls = await readSitemap();
  console.log(`Sitemap lists ${allUrls.length} URLs.`);

  const targets = allUrls.filter((u) => categorise(u) !== null);
  console.log(`Scraping ${targets.length} URLs (filter: ${ONLY ?? "all"}).`);

  const limit = pLimit(6);
  const records: ContentRecord[] = [];
  let done = 0;
  let failed = 0;
  await Promise.all(
    targets.map((url) =>
      limit(async () => {
        try {
          const rec = await processUrl(url);
          if (rec) {
            records.push(rec);
            await fs.writeFile(
              path.join(OUT_DIR, `${rec.category}__${rec.slug}.json`),
              JSON.stringify(rec, null, 2),
              "utf8",
            );
          }
        } catch (err) {
          failed += 1;
          console.error(`  ✗ ${url}: ${(err as Error).message}`);
        } finally {
          done += 1;
          if (done % 10 === 0 || done === targets.length) {
            console.log(`  · ${done}/${targets.length} processed`);
          }
        }
      }),
    ),
  );

  records.sort((a, b) => a.url.localeCompare(b.url));
  await fs.writeFile(
    path.join(OUT_DIR, "_all.json"),
    JSON.stringify(records, null, 2),
    "utf8",
  );

  const manifest = records.map((r) => ({
    url: r.url,
    category: r.category,
    type: r.type,
    title: r.title,
    authors: r.authors.map((a) => a.name),
    publishedAt: r.publishedAt,
    wordCount: r.wordCount,
  }));
  await fs.writeFile(
    path.join(OUT_DIR, "_manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const wordsTotal = records.reduce((s, r) => s + r.wordCount, 0);
  const byCat = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\nDone. ${records.length} records (${Object.entries(byCat)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}), ${wordsTotal.toLocaleString()} words. Failures: ${failed}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
