"""Multi-stage citation faithfulness pipeline.

Stages:
  1. Extract (claim, citation) pairs from the agent output. The agent's
     Citation.supports field already holds the parsed claim; if absent,
     the agent extractor (forethought_bench.agents.extractor) populates it.
  2. Retrieve the cited document from the corpus by URL.
  3. Locate the quoted passage within the document (fuzzy match).
  4. Ask a judge whether the located passage actually supports the claim.

Per-citation verdict:
  VALID                 - passage found AND supports the claim
  FABRICATED            - URL not in corpus, or passage not in the cited URL's doc
  REAL_BUT_UNSUPPORTIVE - passage found but does not support the claim
  PARTIAL               - passage supports part of the claim or supports it weakly

End-to-end LLM judging is intentionally NOT used here: the "real paper but
doesn't support the claim" failure is invisible to end-to-end judging and is
the most damaging trust failure for a research-grounded agent.
"""

from __future__ import annotations

import asyncio

from forethought_bench.corpus import Corpus
from forethought_bench.judges import Judge, JudgeRequest
from forethought_bench.schema import (
    AgentOutput,
    Citation,
    CitationCheck,
    CitationVerdict,
)

SUPPORT_JUDGE_SYSTEM = """\
You are a citation faithfulness judge for a benchmark of an agent that answers
questions grounded in Forethought Research's corpus.

You will be given a CLAIM the agent made and a PASSAGE the agent cited as
supporting that claim. Decide whether the passage actually supports the claim.

Respond with EXACTLY one of these verdicts on the first line, then 1-2 sentences
of rationale:

  SUPPORTS    : the passage clearly supports the entire claim
  PARTIAL     : the passage supports only part of the claim, or supports it weakly
  UNSUPPORTIVE: the passage does not support the claim

Strictness rules:
- If the claim asserts a specific number (e.g., "50%", "~5x"), the passage must
  contain that number or imply it unambiguously. A nearby but different number
  is UNSUPPORTIVE, not PARTIAL.
- If the claim flattens hedges that the passage uses (passage: "we estimate
  ~50%"; claim: "50%"), that is PARTIAL, not SUPPORTS.
- If the passage is from the right paper but discusses an adjacent topic, that
  is UNSUPPORTIVE.
- Truth in absolute terms is not your job. Only whether the passage supports
  the claim.
"""

SUPPORT_JUDGE_USER_TEMPLATE = """\
CLAIM: {claim}

CITED PASSAGE:
\"\"\"
{passage}
\"\"\"

VERDICT:"""


async def check_citation(
    citation_index: int,
    citation: Citation,
    parsed_claim: str | None,
    corpus: Corpus,
    judge: Judge,
    *,
    fuzzy_threshold: float = 0.80,
) -> CitationCheck:
    """Run the 4-stage pipeline on one citation."""
    # Stage 2: retrieve the cited document.
    if not citation.url:
        return CitationCheck(
            citation_index=citation_index,
            verdict=CitationVerdict.FABRICATED,
            passage_found_in_corpus=False,
            parsed_claim=parsed_claim,
            support_rationale="Citation has no URL.",
        )
    record = corpus.by_url(citation.url)
    if record is None:
        return CitationCheck(
            citation_index=citation_index,
            verdict=CitationVerdict.FABRICATED,
            passage_found_in_corpus=False,
            parsed_claim=parsed_claim,
            support_rationale=f"URL not present in corpus: {citation.url}",
        )

    # Stage 3: locate the quoted passage.
    if citation.passage:
        match = corpus.find_passage(
            citation.url, citation.passage, threshold=fuzzy_threshold
        )
        if match is None:
            # The passage might be real but mis-attributed.
            anywhere = corpus.find_passage_anywhere(citation.passage, threshold=0.85)
            if anywhere is not None and anywhere.record_url != citation.url:
                return CitationCheck(
                    citation_index=citation_index,
                    verdict=CitationVerdict.FABRICATED,
                    passage_found_in_corpus=True,
                    passage_match_score=anywhere.score,
                    parsed_claim=parsed_claim,
                    support_rationale=(
                        f"Quoted passage exists in corpus at {anywhere.record_url} "
                        f"but was attributed to {citation.url}."
                    ),
                )
            return CitationCheck(
                citation_index=citation_index,
                verdict=CitationVerdict.FABRICATED,
                passage_found_in_corpus=False,
                parsed_claim=parsed_claim,
                support_rationale=f"Quoted passage not found in {citation.url}.",
            )
        passage_text = match.matched_excerpt
        match_score: float | None = match.score
    else:
        # No quoted passage. Use the document body so the support check still runs.
        # An agent that cites a URL without quoting can still be SUPPORTS if the
        # document does support the claim, but PARTIAL is a reasonable default
        # when there's no anchoring excerpt.
        passage_text = (record.text or record.body)[:6000]
        match_score = None

    # Stage 4: LLM support check.
    if not parsed_claim:
        return CitationCheck(
            citation_index=citation_index,
            verdict=CitationVerdict.PARTIAL,
            passage_found_in_corpus=True,
            passage_match_score=match_score,
            parsed_claim=None,
            support_rationale=(
                "Citation existence verified; no parsed claim available so support "
                "could not be graded. Set Citation.supports to enable stage-4 grading."
            ),
        )

    resp = await judge.complete(
        JudgeRequest(
            system=SUPPORT_JUDGE_SYSTEM,
            user=SUPPORT_JUDGE_USER_TEMPLATE.format(
                claim=parsed_claim, passage=passage_text
            ),
            max_tokens=256,
        )
    )
    verdict = _parse_support_verdict(resp.text)
    return CitationCheck(
        citation_index=citation_index,
        verdict=verdict,
        passage_found_in_corpus=True,
        passage_match_score=match_score,
        parsed_claim=parsed_claim,
        support_rationale=resp.text.strip(),
    )


async def check_all_citations(
    output: AgentOutput,
    corpus: Corpus,
    judge: Judge,
    *,
    fuzzy_threshold: float = 0.80,
) -> list[CitationCheck]:
    """Run the pipeline over every citation in an agent output, in parallel."""
    if not output.citations:
        return []
    tasks = [
        check_citation(
            i,
            c,
            parsed_claim=c.supports,
            corpus=corpus,
            judge=judge,
            fuzzy_threshold=fuzzy_threshold,
        )
        for i, c in enumerate(output.citations)
    ]
    return await asyncio.gather(*tasks)


def faithfulness_score(checks: list[CitationCheck]) -> dict[str, float | int]:
    """Aggregate per-citation verdicts.

    Returns a dict suitable for Inspect Score.metadata. The headline score is
    the fraction of citations with verdict VALID. The verdict counts let
    downstream consumers see whether failures are fabrication vs. unsupportive,
    which have very different implications for trust.
    """
    if not checks:
        return {
            "score": 1.0,
            "n": 0,
            "valid": 0,
            "fabricated": 0,
            "unsupportive": 0,
            "partial": 0,
        }
    counts: dict[CitationVerdict, int] = dict.fromkeys(CitationVerdict, 0)
    for c in checks:
        counts[c.verdict] += 1
    return {
        "score": counts[CitationVerdict.VALID] / len(checks),
        "n": len(checks),
        "valid": counts[CitationVerdict.VALID],
        "fabricated": counts[CitationVerdict.FABRICATED],
        "unsupportive": counts[CitationVerdict.REAL_BUT_UNSUPPORTIVE],
        "partial": counts[CitationVerdict.PARTIAL],
    }


def _parse_support_verdict(text: str) -> CitationVerdict:
    if not text:
        return CitationVerdict.REAL_BUT_UNSUPPORTIVE
    first = text.strip().splitlines()[0].strip().rstrip(":").upper()
    if first.startswith("SUPPORT"):
        return CitationVerdict.VALID
    if first.startswith("PARTIAL"):
        return CitationVerdict.PARTIAL
    return CitationVerdict.REAL_BUT_UNSUPPORTIVE
