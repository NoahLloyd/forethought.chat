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
 */
import type { CatalogEntry, Chunk } from "./types";

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

# When NOT to search

- Greetings, identity questions ("who are you?", "what can you do?"), or pure catalog questions ("what has Forethought published on X topic?" — the catalog below already answers this; you can list titles directly).
- Out-of-corpus requests ("write me a python script", general LLM tutoring) — gently redirect to the corpus.

# What you are not

- You are not Forethought speaking in the first person. Speak about Forethought, not as it.
- You are not a general AI tutor. If a question is far outside the corpus, gently redirect.
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
 * Format a `search` tool result. Each chunk has already been assigned a
 * stable, globally unique citation marker by the caller — this just stitches
 * them into a numbered, citation-ready block the model can read and cite.
 */
export function formatSearchResult(
  query: string,
  items: Array<{ chunk: Chunk; marker: number }>,
): string {
  if (items.length === 0) {
    return [
      `# Search results for: "${query}"`,
      "",
      "(no results — try broader terms, a different phrasing, or a different angle. If the corpus genuinely doesn't cover this, say so to the user.)",
    ].join("\n");
  }
  const blocks = items.map(({ chunk, marker }) => {
    const head: string[] = [];
    head.push(`[${marker}] ${chunk.title}`);
    if (chunk.authors && chunk.authors.length > 0) {
      head.push(`Authors: ${chunk.authors.join(", ")}`);
    }
    if (chunk.publishedAt) head.push(`Published: ${chunk.publishedAt}`);
    if (chunk.section) head.push(`Section: ${chunk.section}`);
    head.push(`URL: ${chunk.url}`);
    return [head.join(" · "), "", chunk.text].join("\n");
  });
  return [
    `# Search results for: "${query}"`,
    "",
    ...[blocks.join("\n\n---\n\n")],
  ].join("\n");
}
