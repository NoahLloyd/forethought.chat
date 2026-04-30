module.exports = [
"[project]/.next-internal/server/app/api/catalog/route/actions.js [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__, module, exports) => {

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
"[externals]/node:fs [external] (node:fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:fs", () => require("node:fs"));

module.exports = mod;
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
"[project]/app/api/catalog/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Catalog endpoint — feeds the welcome screen and the topic browser.
 *
 * Returns the prebuilt catalog plus a small set of derived stats (counts,
 * top-level topics) so the UI doesn't have to recompute them on every load.
 * Cached aggressively — the underlying file only changes on `pnpm ingest`.
 */ __turbopack_context__.s([
    "GET",
    ()=>GET,
    "revalidate",
    ()=>revalidate,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/search.ts [app-route] (ecmascript)");
;
;
const runtime = "nodejs";
const revalidate = 3600;
async function GET() {
    const [catalog, stats] = await Promise.all([
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCatalog"])(),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["corpusStats"])()
    ]);
    // Pull a topic histogram so the UI can show "what's covered" without
    // scanning every catalog entry on the client.
    const topicCounts = new Map();
    for (const entry of catalog){
        for (const t of entry.topics ?? []){
            topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
        }
    }
    const topics = [
        ...topicCounts.entries()
    ].map(([name, count])=>({
            name,
            count
        })).sort((a, b)=>b.count - a.count || a.name.localeCompare(b.name));
    // Author histogram is similarly cheap and useful for "who writes about Y".
    const authorCounts = new Map();
    for (const entry of catalog){
        if (entry.category !== "research") continue;
        for (const a of entry.authors ?? []){
            authorCounts.set(a, (authorCounts.get(a) ?? 0) + 1);
        }
    }
    const authors = [
        ...authorCounts.entries()
    ].map(([name, count])=>({
            name,
            count
        })).sort((a, b)=>b.count - a.count || a.name.localeCompare(b.name));
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        catalog,
        stats,
        topics,
        authors
    }, {
        headers: {
            "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=86400"
        }
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__c725aaaf._.js.map