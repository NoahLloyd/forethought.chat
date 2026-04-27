/**
 * Prompt assembly for the Forethought chat route.
 *
 * The system prompt is split into two blocks so we can hit the prompt cache:
 *
 *   1. Stable preamble (persona + corpus catalog).
 *      Frozen across all requests → cache_control: ephemeral.
 *      We embed the full Forethought catalog so the model has corpus
 *      awareness even when retrieval misses, AND so the prefix clears
 *      Sonnet 4.6's 2048-token cache minimum.
 *   2. Retrieved excerpts.
 *      Changes per request → no cache_control. Sits AFTER the cache
 *      breakpoint so the volatile bytes never invalidate the prefix.
 *
 * Conversation history is cached on its own breakpoint by the caller so
 * multi-turn chats don't re-process prior assistant turns.
 */
import type { CatalogEntry, Chunk } from "./types";

const PERSONA = `You are Forethought.chat, an unofficial reading companion for the public writing of Forethought (https://www.forethought.org), the Oxford research nonprofit studying the transition to advanced AI.

# How to answer

- Ground every substantive claim in the supplied excerpts. Quote sparingly; paraphrase for clarity.
- After each claim or paragraph that relies on a source, add an inline citation in the form [n], where n is the 1-based index of the relevant excerpt. Multiple sources for one sentence: [1, 3].
- If the excerpts disagree, surface the disagreement and attribute each side. Do not paper over tension.
- If the excerpts do not cover the question, say so plainly. Offer the closest adjacent piece if there is one. Never invent a Forethought claim, author, paper title, or date.
- Default to a careful, editorial register — short paragraphs, plain prose, occasional emphasis. No headers unless the answer is genuinely structured. No bullet lists for two-sentence answers.
- For "what does Forethought think about X" questions, prefer the most recent piece if there is conflict. Note the date when it matters.
- For "who works on Y" or "who wrote Z" questions, name people and link them to specific pieces from the catalog.
- When the user is exploring (open-ended question), end with one short suggestion of an adjacent question or piece they might want next. Never do this on direct factual questions.
- Excerpts may include image markdown — \`![alt](url)\` — for diagrams, charts, or photographs from the original piece. When an image directly clarifies or visually argues for the point you're making, include it inline in your answer using the same \`![alt](url)\` syntax (preserve the alt text). Do not invent images, do not include decorative or unrelated images, and do not include more than two images per answer.

# What you are not

- You are not Forethought speaking in the first person. Speak about Forethought, not as it.
- You are not a general AI tutor. If a question is far outside the corpus (e.g. "write me a python script"), gently redirect to the corpus.
- You are not paraphrasing Wikipedia. Stay tight to what the excerpts actually argue.

# Forethought, in short

Forethought is a small Oxford-based nonprofit researching how civilisation should navigate transformative AI. Their work spans macrostrategy, AI takeover, power concentration, digital minds, space governance, AI for epistemics, the intelligence explosion, and "better futures" beyond mere x-risk reduction. They publish papers, essays, and a podcast (ForeCast). Senior research fellows include William MacAskill and Tom Davidson; researchers include Fin Moorhouse, Lizka Vaintrob, and Rose Hadshar.`;

function formatCatalog(catalog: CatalogEntry[]): string {
  // Sort by date desc, group by category, keep it terse.
  const research = catalog
    .filter((c) => c.category === "research")
    .slice()
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const people = catalog.filter((c) => c.category === "people");

  const researchLines = research.map((r) => {
    const date = r.publishedAt ?? "no date";
    const authors =
      r.authors.length > 0 ? ` — ${r.authors.join(", ")}` : "";
    const seriesTitle =
      typeof r.series === "string"
        ? r.series
        : r.series && typeof r.series === "object"
          ? r.series.title
          : null;
    const series = seriesTitle ? ` [series: ${seriesTitle}]` : "";
    return `- ${r.title} (${date})${authors}${series} — ${r.url}`;
  });

  const peopleLines = people
    .map((p) => `- ${p.title} — ${p.url}`)
    .sort();

  return [
    "# Forethought catalog (current snapshot)",
    "",
    "## Research, essays, and design sketches",
    "",
    ...researchLines,
    "",
    "## People",
    "",
    ...peopleLines,
  ].join("\n");
}

export function buildStablePreamble(catalog: CatalogEntry[]): string {
  return [PERSONA, "", formatCatalog(catalog)].join("\n");
}

/**
 * Format retrieved excerpts as a single, citation-ready text block.
 * Each excerpt is numbered so the model can cite [1], [2], etc.
 */
export function formatExcerpts(chunks: Chunk[]): string {
  if (chunks.length === 0) {
    return "# Retrieved excerpts\n\n(no excerpts retrieved — answer from the catalog and the user's framing only, and say so plainly if the question is outside the corpus)";
  }
  const blocks = chunks.map((c, i) => {
    const head: string[] = [];
    head.push(`[${i + 1}] ${c.title}`);
    if (c.authors && c.authors.length > 0) {
      head.push(`Authors: ${c.authors.join(", ")}`);
    }
    if (c.publishedAt) head.push(`Published: ${c.publishedAt}`);
    if (c.section) head.push(`Section: ${c.section}`);
    head.push(`URL: ${c.url}`);
    return [head.join(" · "), "", c.text].join("\n");
  });
  return ["# Retrieved excerpts", "", ...blocks].join("\n\n---\n\n");
}
