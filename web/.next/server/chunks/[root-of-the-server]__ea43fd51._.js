module.exports = [
"[project]/.next-internal/server/app/api/chat/route/actions.js [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__, module, exports) => {

}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/http [external] (http, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("http", () => require("http"));

module.exports = mod;
}),
"[externals]/url [external] (url, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("url", () => require("url"));

module.exports = mod;
}),
"[externals]/punycode [external] (punycode, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("punycode", () => require("punycode"));

module.exports = mod;
}),
"[externals]/https [external] (https, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("https", () => require("https"));

module.exports = mod;
}),
"[externals]/zlib [external] (zlib, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("zlib", () => require("zlib"));

module.exports = mod;
}),
"[externals]/util [external] (util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("util", () => require("util"));

module.exports = mod;
}),
"[externals]/node:fs [external] (node:fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:fs", () => require("node:fs"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/node:stream/web [external] (node:stream/web, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:stream/web", () => require("node:stream/web"));

module.exports = mod;
}),
"[project]/lib/anthropic.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ASSISTANT_LABEL",
    ()=>ASSISTANT_LABEL,
    "CHAT_MODEL",
    ()=>CHAT_MODEL,
    "client",
    ()=>client
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$anthropic$2d$ai$2f$sdk$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@anthropic-ai/sdk/index.mjs [app-route] (ecmascript) <locals>");
;
let _client = null;
function client() {
    if (_client) return _client;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not set — copy .env.example to .env.local and add a key from https://console.anthropic.com/");
    }
    _client = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$anthropic$2d$ai$2f$sdk$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"]({
        apiKey
    });
    return _client;
}
const CHAT_MODEL = "claude-sonnet-4-6";
const ASSISTANT_LABEL = "Forethought.chat";
}),
"[project]/lib/prompt.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Prompt assembly for the Forethought chat route.
 *
 * The system prompt is a single stable preamble (persona + corpus catalog).
 * It is sent on every request with `cache_control: ephemeral` so the prefix
 * stays in Anthropic's prompt cache for the 5-minute TTL window. Excerpts
 * are NOT in the system prompt anymore — the agent fetches them via the
 * `search` tool, and they arrive as tool_result blocks in the conversation.
 *
 * The catalog stays in the preamble so the model has corpus awareness even
 * before it searches: it knows what pieces exist, who wrote them, and when,
 * which lets it plan good search queries instead of guessing keywords.
 */ __turbopack_context__.s([
    "buildStablePreamble",
    ()=>buildStablePreamble,
    "formatSearchResult",
    ()=>formatSearchResult
]);
const PERSONA = `You are Forethought.chat, an unofficial reading companion for the public writing of Forethought (https://www.forethought.org), the Oxford research nonprofit studying the transition to advanced AI.

# How to answer

You have a \`search\` tool that retrieves excerpts from Forethought's published work. Use it.

- For any substantive question about what a piece argues, what an author thinks, or how Forethought frames a topic: call \`search\` BEFORE writing your answer. The catalog below tells you what exists; only search results tell you what those pieces actually say.
- Search is cheap. Prefer several targeted searches over one broad one — compare across pieces, follow up when a result is incomplete, search again with different terms if the first try missed. Two to four searches is typical for a substantive question. Stop once you have enough to answer well; don't search beyond what you'll cite.
- Each excerpt arrives with an \`[N]\` marker. Cite using exactly that marker, e.g. "as MacAskill argues, this is the central question [3]." Multiple sources for one claim: [3, 7]. Cite sparingly but every substantive claim must have one.
- Ground every substantive claim in retrieved excerpts. If after a couple of focused searches the corpus does not cover the question, say so plainly. Offer the closest adjacent piece from the catalog if there is one. Never invent a Forethought claim, author, paper title, or date.
- If excerpts disagree, surface the disagreement and attribute each side. Do not paper over tension.
- Default to a careful, editorial register — short paragraphs, plain prose, occasional emphasis. No headers unless the answer is genuinely structured. No bullet lists for two-sentence answers.
- For "what does Forethought think about X" questions, prefer the most recent piece if there is conflict. Note the date when it matters.
- For "who works on Y" or "who wrote Z" questions, plan from the catalog (it has authors and dates) and confirm with a search before naming anyone in connection with a specific argument.
- When the user is exploring (open-ended question), end with one short suggestion of an adjacent question or piece they might want next. Never do this on direct factual questions.

# Quoting and citation discipline

When you cite [N], the claim you attach the marker to must be **directly supported** by the text in chunk N - not just adjacent to it. Two specific traps to avoid:

- **Hedge preservation.** If a source says "we think the SIE will probably (~60%) compress 3 years into <1 year", do NOT compress that into "Forethought says 60%". Carry the hedges - "we think", "probably", "around", "approximately", "~", "at least", "roughly", "might" - verbatim. Lower-bound claims keep "at least"; central estimates keep "~" or an equivalent.
- **No marker overreach.** Each [N] marker must point to the chunk that contains exactly the claim you attached it to. If you summarise a paper's view in your own words, every distinct claim in the summary needs its own [N]. Do not staple a marker onto a peripheral or downstream claim that the chunk doesn't state.

When the corpus does not address a topic, say so directly. The right answer is "Forethought has not addressed X" or "I cannot find a Forethought piece on X" - not a paragraph of adjacent material. Offer at most one related catalog entry as suggested context, then stop. Do not invent a paper title, claim, or author.

# When NOT to search

- Greetings, identity questions ("who are you?", "what can you do?"), or pure catalog questions ("what has Forethought published on X topic?" — the catalog below already answers this; you can list titles directly).
- Out-of-corpus requests ("write me a python script", general LLM tutoring) — gently redirect to the corpus.

# What you are not

- You are not Forethought speaking in the first person. Speak about Forethought, not as it.
- You are not a general AI tutor. If a question is far outside the corpus, gently redirect.
- You are not paraphrasing Wikipedia. Stay tight to what the excerpts actually argue.

# Forethought, in short

Forethought is a small Oxford-based nonprofit researching how civilisation should navigate transformative AI. Their work spans macrostrategy, AI takeover, power concentration, digital minds, space governance, AI for epistemics, the intelligence explosion, and "better futures" beyond mere x-risk reduction. They publish papers, essays, and a podcast (ForeCast). Senior research fellows include William MacAskill and Tom Davidson; researchers include Fin Moorhouse, Lizka Vaintrob, and Rose Hadshar.`;
function formatCatalog(catalog) {
    // Sort by date desc, group by category, keep it terse.
    const research = catalog.filter((c)=>c.category === "research").slice().sort((a, b)=>(b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const people = catalog.filter((c)=>c.category === "people");
    const researchLines = research.map((r)=>{
        const date = r.publishedAt ?? "no date";
        const authors = r.authors.length > 0 ? ` — ${r.authors.join(", ")}` : "";
        const seriesTitle = typeof r.series === "string" ? r.series : r.series && typeof r.series === "object" ? r.series.title : null;
        const series = seriesTitle ? ` [series: ${seriesTitle}]` : "";
        return `- ${r.title} (${date})${authors}${series} — ${r.url}`;
    });
    const peopleLines = people.map((p)=>`- ${p.title} — ${p.url}`).sort();
    return [
        "# Forethought catalog (current snapshot)",
        "",
        "## Research, essays, and design sketches",
        "",
        ...researchLines,
        "",
        "## People",
        "",
        ...peopleLines
    ].join("\n");
}
function buildStablePreamble(catalog) {
    return [
        PERSONA,
        "",
        formatCatalog(catalog)
    ].join("\n");
}
function formatSearchResult(query, items) {
    if (items.length === 0) {
        return [
            `# Search results for: "${query}"`,
            "",
            "(no results — try broader terms, a different phrasing, or a different angle. If the corpus genuinely doesn't cover this, say so to the user.)"
        ].join("\n");
    }
    const blocks = items.map(({ chunk, marker })=>{
        const head = [];
        head.push(`[${marker}] ${chunk.title}`);
        if (chunk.authors && chunk.authors.length > 0) {
            head.push(`Authors: ${chunk.authors.join(", ")}`);
        }
        if (chunk.publishedAt) head.push(`Published: ${chunk.publishedAt}`);
        if (chunk.section) head.push(`Section: ${chunk.section}`);
        head.push(`URL: ${chunk.url}`);
        return [
            head.join(" · "),
            "",
            chunk.text
        ].join("\n");
    });
    return [
        `# Search results for: "${query}"`,
        "",
        ...[
            blocks.join("\n\n---\n\n")
        ]
    ].join("\n");
}
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[project]/lib/search.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * BM25 retrieval over the prebuilt chunk index.
 *
 * The index is loaded once per server process and held in module memory.
 * Querying is O(query terms × candidate chunks) — fast enough for a
 * sub-thousand-chunk corpus on a single thread.
 *
 * We add a soft article-diversity cap on top of pure BM25 so a top-K
 * window doesn't collapse onto one essay; the model gets complementary
 * material rather than three slices of the same paragraph.
 */ __turbopack_context__.s([
    "corpusStats",
    ()=>corpusStats,
    "getCatalog",
    ()=>getCatalog,
    "getChunk",
    ()=>getChunk,
    "search",
    ()=>search
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:fs [external] (node:fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
;
;
const BM25_K1 = 1.4;
const BM25_B = 0.75;
let cache = null;
let cachePromise = null;
async function load() {
    if (cache) return cache;
    if (cachePromise) return cachePromise;
    // Capture the promise locally so the `finally` clean-up doesn't clobber
    // a NEW promise installed by a third concurrent caller — the bug being:
    //   A starts load → sets cachePromise=p1
    //   B awaits p1
    //   A finishes → finally clears cachePromise to null
    //   C arrives, sees null, starts load → sets cachePromise=p2
    //   B's `finally` (if it ran the same path) would clobber p2 to null.
    // We avoid that by only clearing cachePromise if it's still ours.
    const p = (async ()=>{
        const file = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(process.cwd(), "data", "index.json");
        let raw;
        try {
            raw = await __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["promises"].readFile(file, "utf8");
        } catch (err) {
            const e = err;
            if (e.code === "ENOENT") {
                throw new Error("data/index.json is missing. Run `pnpm ingest` (or `pnpm scrape && pnpm index`) before starting the server. See README.md for the full pipeline.");
            }
            throw err;
        }
        const payload = JSON.parse(raw);
        const byId = new Map();
        for (const c of payload.chunks)byId.set(c.id, c);
        const avgDl = payload.chunks.reduce((s, c)=>s + c.tokens.length, 0) / Math.max(payload.chunks.length, 1);
        const built = {
            payload,
            byId,
            avgDl
        };
        cache = built;
        return built;
    })();
    cachePromise = p;
    try {
        return await p;
    } finally{
        if (cachePromise === p) cachePromise = null;
    }
}
async function getCatalog() {
    const { payload } = await load();
    return payload.catalog;
}
async function corpusStats() {
    const { payload } = await load();
    const research = payload.catalog.filter((e)=>e.category === "research");
    const people = payload.catalog.filter((e)=>e.category === "people");
    const totalWords = payload.catalog.reduce((s, c)=>s + (c.wordCount ?? 0), 0);
    return {
        research: research.length,
        people: people.length,
        chunks: payload.counts.chunks,
        totalWords,
        builtAt: payload.builtAt
    };
}
function tokenize(s) {
    return s.toLowerCase().replace(/[^a-z0-9\s\-']/g, " ").split(/\s+/).filter((t)=>t.length > 1 && t.length < 40);
}
const STOPWORDS = new Set("a an and are as at be but by for from has have he her him his i if in into is it its of on or our she that the their them they this to was we were what when which who why will with you your".split(/\s+/));
const PERSON_QUERY_TERMS = new Set([
    "who",
    "researcher",
    "researchers",
    "fellow",
    "fellows",
    "team",
    "people",
    "staff",
    "author",
    "authors",
    "scholar",
    "scholars",
    "director",
    "leadership",
    "founder",
    "founders"
]);
/**
 * Heuristic: a chunk is "bibliography-heavy" if its text is dominated by
 * footnote markers, citation patterns, or external URLs. Used to discount
 * reference-list chunks at search time so they don't crowd out prose.
 */ function looksLikeReferences(chunk) {
    const t = chunk.text;
    // Section heading is a giveaway.
    const section = (chunk.section ?? "").toLowerCase();
    if (section.includes("references") || section.includes("bibliography") || section.includes("works cited") || section.includes("further reading")) {
        return true;
    }
    const footnoteMarkers = (t.match(/\[\^[\w-]+\]/g) ?? []).length;
    const urls = (t.match(/https?:\/\/\S+/g) ?? []).length;
    const academicMarkers = (t.match(/arxiv|doi|forum\.effectivealtruism|lesswrong/gi) ?? []).length;
    // Three or more footnote refs in one chunk, or 4+ external URLs, is a
    // strong signal we're in a reference list rather than prose.
    return footnoteMarkers >= 3 || urls >= 4 || academicMarkers >= 3;
}
async function search(query, k = 12) {
    const { payload, byId, avgDl } = await load();
    const qTerms = [
        ...new Set(tokenize(query).filter((t)=>!STOPWORDS.has(t)))
    ];
    if (qTerms.length === 0) return [];
    const scores = new Map();
    for (const c of payload.chunks){
        const dl = c.tokens.length;
        if (dl === 0) continue;
        const tf = new Map();
        for (const t of c.tokens)tf.set(t, (tf.get(t) ?? 0) + 1);
        let score = 0;
        for (const term of qTerms){
            const f = tf.get(term);
            if (!f) continue;
            const idf = payload.idf[term];
            if (!idf) continue;
            const num = f * (BM25_K1 + 1);
            const den = f + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDl));
            score += idf * (num / den);
        }
        if (score > 0) scores.set(c.id, score);
    }
    // Title / author / topic overlap — soft, but enough to surface canonical
    // entry points when their slug, author, or topic name is in the query.
    for (const c of payload.chunks){
        const haystack = [
            c.title,
            ...c.authors,
            ...c.topics,
            c.section ?? ""
        ].join(" ").toLowerCase();
        let bonus = 0;
        for (const term of qTerms){
            if (haystack.includes(term)) bonus += 0.6;
        }
        if (bonus > 0) {
            scores.set(c.id, (scores.get(c.id) ?? 0) + bonus);
        }
    }
    // Penalise bibliography-heavy chunks. Forethought articles end with long
    // reference lists which technically match queries on the named papers
    // but offer no actual content to cite. We discount them ~60% so the
    // model gets prose chunks first, but keeps a reference chunk available
    // when the user asks for "more reading on X".
    for (const [id, score] of scores){
        const chunk = byId.get(id);
        if (!chunk) continue;
        if (looksLikeReferences(chunk)) {
            scores.set(id, score * 0.4);
        }
    }
    // Boost people-page chunks when the query is asking about people. We
    // detect this by intersecting query terms with a small "person query"
    // vocabulary; if the user said "who", "researcher", "team", "fellow",
    // people pages should not lose to research articles that happen to
    // mention the same author by name.
    const isPersonQuery = qTerms.some((t)=>PERSON_QUERY_TERMS.has(t));
    if (isPersonQuery) {
        for (const [id, score] of scores){
            const chunk = byId.get(id);
            if (chunk?.category === "people") {
                scores.set(id, score * 1.7);
            }
        }
    }
    const ranked = [];
    for (const [id, score] of scores){
        const chunk = byId.get(id);
        if (chunk) ranked.push({
            chunk,
            score
        });
    }
    ranked.sort((a, b)=>b.score - a.score);
    // Diversify: hard cap of 2 chunks per article so the top-K window has
    // breadth rather than collapsing onto a single essay.
    const out = [];
    const perUrl = new Map();
    for (const r of ranked){
        const used = perUrl.get(r.chunk.url) ?? 0;
        if (used >= 2) continue;
        out.push(r);
        perUrl.set(r.chunk.url, used + 1);
        if (out.length >= k) break;
    }
    return out;
}
async function getChunk(id) {
    const { byId } = await load();
    return byId.get(id) ?? null;
}
}),
"[project]/app/api/chat/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$anthropic$2d$ai$2f$sdk$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@anthropic-ai/sdk/index.mjs [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$anthropic$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/anthropic.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prompt$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/prompt.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/search.ts [app-route] (ecmascript)");
;
;
;
;
;
const runtime = "nodejs";
const dynamic = "force-dynamic";
/**
 * Tool-using agent loop.
 *
 * The model receives the persona + corpus catalog (cached) and a single
 * `search` tool. It decides when and how often to retrieve excerpts before
 * answering. We cap at MAX_ITERS so a confused model can't loop forever.
 *
 * Citation markers are assigned globally per request: the first chunk the
 * model ever sees is [1], the next new chunk [2], and so on. Re-finding a
 * chunk in a later search reuses its existing marker so [3] always points
 * to the same passage no matter when the model first read it.
 */ const MAX_ITERS = 12;
const SEARCH_DEFAULT_K = 6;
const SEARCH_MAX_K = 10;
const SEARCH_TOOL = {
    name: "search",
    description: "Search the Forethought corpus for excerpts relevant to a query. Returns numbered excerpts with citation markers ([N]) you can use directly in your answer. Call this multiple times in one turn to broaden, narrow, or follow up — each call returns its own batch of excerpts.",
    input_schema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "A focused search query — the user's actual phrasing, or a tight paraphrase aimed at the topic. Avoid stop-words and filler."
            },
            k: {
                type: "integer",
                description: `How many excerpts to return. Default ${SEARCH_DEFAULT_K}, max ${SEARCH_MAX_K}.`,
                minimum: 1,
                maximum: SEARCH_MAX_K
            }
        },
        required: [
            "query"
        ]
    }
};
function makeSnippet(text, max = 280) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length <= max) return cleaned;
    // Try to clip on a sentence boundary inside the budget.
    const window = cleaned.slice(0, max + 80);
    const cutoff = window.lastIndexOf(". ");
    if (cutoff > max - 80 && cutoff < max + 80) return window.slice(0, cutoff + 1);
    return cleaned.slice(0, max).trimEnd() + "…";
}
/**
 * Place an ephemeral cache breakpoint on the most recent tool_result block,
 * stripping any breakpoints we set on earlier blocks. Combined with the
 * system-prompt breakpoint, this caches the whole prefix up through the
 * last tool result so iteration N+1 reuses iteration N's work. Anthropic
 * caps cache breakpoints per request at 4; this strategy keeps us at 2.
 */ function applyMessageCacheControl(messages) {
    for (const m of messages){
        if (typeof m.content === "string") continue;
        for (const block of m.content){
            if (typeof block === "object" && block !== null && "cache_control" in block) {
                delete block.cache_control;
            }
        }
    }
    for(let i = messages.length - 1; i >= 0; i--){
        const m = messages[i];
        if (m.role !== "user" || typeof m.content === "string") continue;
        const blocks = m.content;
        for(let j = blocks.length - 1; j >= 0; j--){
            const b = blocks[j];
            if (b.type === "tool_result") {
                b.cache_control = {
                    type: "ephemeral"
                };
                return;
            }
        }
    }
}
async function POST(req) {
    let body;
    try {
        body = await req.json();
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "invalid JSON"
        }, {
            status: 400
        });
    }
    const messages = (body.messages ?? []).filter((m)=>m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0);
    if (messages.length === 0 || messages.at(-1)?.role !== "user") {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "messages must end with a user turn"
        }, {
            status: 400
        });
    }
    const catalog = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCatalog"])();
    const preamble = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prompt$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildStablePreamble"])(catalog);
    // System prompt is a single cached block. Excerpts no longer live here —
    // they come back as tool_result blocks in the conversation.
    const systemBlocks = [
        {
            type: "text",
            text: preamble,
            cache_control: {
                type: "ephemeral"
            }
        }
    ];
    const apiMessages = messages.map((m)=>({
            role: m.role,
            content: m.content
        }));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start (controller) {
            const send = (event, data)=>{
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };
            // Per-request citation registry. `seen` maps chunk id → assigned card
            // so re-finding the same chunk in a later search keeps the marker
            // stable. `nextMarker` is the next free integer.
            const seen = new Map();
            let nextMarker = 1;
            const totals = {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreationTokens: 0,
                cacheReadTokens: 0
            };
            let iter = 0;
            let lastStop = null;
            let truncated = false;
            try {
                const c = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$anthropic$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["client"])();
                while(iter < MAX_ITERS){
                    iter++;
                    applyMessageCacheControl(apiMessages);
                    const llmStream = c.messages.stream({
                        model: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$anthropic$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["CHAT_MODEL"],
                        max_tokens: 4096,
                        system: systemBlocks,
                        messages: apiMessages,
                        tools: [
                            SEARCH_TOOL
                        ]
                    });
                    llmStream.on("text", (delta)=>{
                        send("text", {
                            delta
                        });
                    });
                    const final = await llmStream.finalMessage();
                    totals.inputTokens += final.usage.input_tokens;
                    totals.outputTokens += final.usage.output_tokens;
                    totals.cacheCreationTokens += final.usage.cache_creation_input_tokens ?? 0;
                    totals.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;
                    lastStop = final.stop_reason ?? null;
                    // Persist the assistant turn (text + any tool_use blocks) into
                    // history so the next iteration sees it.
                    apiMessages.push({
                        role: "assistant",
                        content: final.content
                    });
                    if (lastStop !== "tool_use") break;
                    const toolResultBlocks = [];
                    for (const block of final.content){
                        if (block.type !== "tool_use") continue;
                        if (block.name === "search") {
                            const input = block.input ?? {};
                            const query = typeof input.query === "string" ? input.query.trim() : "";
                            const k = Math.min(Math.max(typeof input.k === "number" ? Math.floor(input.k) : SEARCH_DEFAULT_K, 1), SEARCH_MAX_K);
                            send("tool_call", {
                                name: "search",
                                query
                            });
                            let content;
                            let isError = false;
                            try {
                                if (!query) {
                                    content = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prompt$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatSearchResult"])("", []);
                                } else {
                                    const hits = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["search"])(query, k);
                                    const numbered = [];
                                    let addedAny = false;
                                    for (const h of hits){
                                        let card = seen.get(h.chunk.id);
                                        if (!card) {
                                            card = {
                                                marker: nextMarker++,
                                                url: h.chunk.url,
                                                title: h.chunk.title,
                                                category: h.chunk.category,
                                                authors: h.chunk.authors,
                                                publishedAt: h.chunk.publishedAt,
                                                section: h.chunk.section,
                                                snippet: makeSnippet(h.chunk.text)
                                            };
                                            seen.set(h.chunk.id, card);
                                            addedAny = true;
                                        }
                                        numbered.push({
                                            chunk: h.chunk,
                                            marker: card.marker
                                        });
                                    }
                                    content = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prompt$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["formatSearchResult"])(query, numbered);
                                    if (addedAny) {
                                        send("sources", {
                                            sources: [
                                                ...seen.values()
                                            ].sort((a, b)=>a.marker - b.marker)
                                        });
                                    }
                                }
                            } catch (err) {
                                isError = true;
                                content = `Search failed: ${err instanceof Error ? err.message : "unknown error"}`;
                            }
                            toolResultBlocks.push({
                                type: "tool_result",
                                tool_use_id: block.id,
                                content,
                                ...isError ? {
                                    is_error: true
                                } : {}
                            });
                        } else {
                            toolResultBlocks.push({
                                type: "tool_result",
                                tool_use_id: block.id,
                                content: `Unknown tool: ${block.name}. Available tools: search.`,
                                is_error: true
                            });
                        }
                    }
                    apiMessages.push({
                        role: "user",
                        content: toolResultBlocks
                    });
                }
                if (lastStop === "tool_use") {
                    // We hit the iteration cap with the model still wanting to search.
                    // Tell the user; the partial answer (if any) has already streamed.
                    truncated = true;
                    send("error", {
                        message: `agent stopped after ${MAX_ITERS} tool calls`
                    });
                }
                send("done", {
                    stopReason: truncated ? "max_iterations" : lastStop,
                    iterations: iter,
                    usage: totals
                });
            } catch (err) {
                const msg = err instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$anthropic$2d$ai$2f$sdk$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"].APIError ? `${err.status ?? "?"} — ${err.message}` : err instanceof Error ? err.message : "unknown error";
                send("error", {
                    message: msg
                });
            } finally{
                controller.close();
            }
        }
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no"
        }
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__ea43fd51._.js.map