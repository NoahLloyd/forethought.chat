"""Offline tests for the post-iteration scorers (A1, A2, A3).

Each test stubs the Judge interface so no network or LLM is required. The
goal here is to exercise the parsing, fallback, and composition logic; the
actual judge prompt quality is tested live in smoke runs.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from forethought_bench.judges.base import Judge, JudgeRequest, JudgeResponse
from forethought_bench.schema import (
    AgentOutput,
    Citation,
    NumericTarget,
    NumericTolerance,
    RetrievedPassage,
)
from forethought_bench.scoring.answer_support import score_answer_support
from forethought_bench.scoring.claim_anchoring import refine_citation_claims
from forethought_bench.scoring.numeric_judge import score_numeric_judge


class StubJudge(Judge):
    """Returns a fixed response, or one produced by a function of the request."""

    def __init__(
        self,
        responder: str | Callable[[JudgeRequest], str],
        model: str = "stub",
    ) -> None:
        self._responder = responder
        self.model = model
        self.name = f"stub:{model}"

    async def complete(self, req: JudgeRequest) -> JudgeResponse:
        text = self._responder(req) if callable(self._responder) else self._responder
        return JudgeResponse(text=text, model=self.model, usage={})


class _StubCorpus:
    """Minimal duck-typed Corpus for answer_support tests."""

    def __init__(self, by_url_map: dict[str, str]) -> None:
        self._by_url_map = by_url_map

    def by_url(self, url: str):
        text = self._by_url_map.get(url)
        if text is None:
            return None
        return type("R", (), {"text": text, "body": text, "title": "stub", "url": url})()


# --- A3: numeric LLM judge ---------------------------------------------------


@pytest.mark.asyncio
async def test_numeric_judge_correct_eightfold() -> None:
    """The whole point of A3: 'eightfold' for target=8x must score CORRECT.

    The regex extractor in numeric_tolerance.py misses this because the
    `fold` suffix only fires after a digit. The judge has full prose
    competence."""
    judge = StubJudge("CORRECT\nThe answer says 'eightfold' which equals 8x, matching target 8x within tolerance.")
    target = NumericTarget(value=8.0, unit="x", tolerance=NumericTolerance(rtol=0.10))
    res = await score_numeric_judge(
        "Britain's GDP share grew eightfold during the industrial revolution",
        target,
        judge,
    )
    assert res.verdict == "CORRECT"
    assert res.score == 1.0


@pytest.mark.asyncio
async def test_numeric_judge_partial() -> None:
    judge = StubJudge("PARTIAL\nThe answer says 7x which is just outside the 10% tolerance band of 8x.")
    target = NumericTarget(value=8.0, unit="x", tolerance=NumericTolerance(rtol=0.10))
    res = await score_numeric_judge("around 7x", target, judge)
    assert res.verdict == "PARTIAL"
    assert res.score == 0.5


@pytest.mark.asyncio
async def test_numeric_judge_incorrect() -> None:
    judge = StubJudge("INCORRECT\nThe answer says 'doubled' = 2x, well outside the band of 8x.")
    target = NumericTarget(value=8.0, unit="x", tolerance=NumericTolerance(rtol=0.10))
    res = await score_numeric_judge("Britain's share doubled", target, judge)
    assert res.verdict == "INCORRECT"
    assert res.score == 0.0


@pytest.mark.asyncio
async def test_numeric_judge_empty_answer_short_circuits() -> None:
    judge = StubJudge("CORRECT")  # should never be called
    target = NumericTarget(value=8.0, unit="x")
    res = await score_numeric_judge("", target, judge)
    assert res.verdict == "INCORRECT"
    assert res.score == 0.0


@pytest.mark.asyncio
async def test_numeric_judge_unparseable_falls_back_to_incorrect() -> None:
    judge = StubJudge("idk maybe correct? not sure")
    target = NumericTarget(value=8.0, unit="x")
    res = await score_numeric_judge("eightfold", target, judge)
    # No verdict word in the first line; falls back to INCORRECT.
    assert res.verdict == "INCORRECT"


# --- A1: claim-anchored citation refinement ---------------------------------


@pytest.mark.asyncio
async def test_refine_citations_splits_multi_marker_sentence() -> None:
    """Two markers on one sentence get refined into two distinct claims.

    Without A1, both citations have supports='X is true and Y has 50% chance'
    and the support judge is asked the wrong question for each."""
    prose = "Software-IE is plausible and chip-tech feedback alone reaches 65% [1] [2]."
    output = AgentOutput(
        final_answer=prose,
        citations=[
            Citation(url="u1", title="t1", passage="p1", supports="Software-IE is plausible and chip-tech feedback alone reaches 65%"),
            Citation(url="u2", title="t2", passage="p2", supports="Software-IE is plausible and chip-tech feedback alone reaches 65%"),
        ],
        retrieved_passages=[
            RetrievedPassage(url="u1", title="t1", text="p1"),
            RetrievedPassage(url="u2", title="t2", text="p2"),
        ],
    )
    judge_response = """\
{
  "claims": [
    {"index": 0, "marker": 1, "supports": "Software-IE is plausible"},
    {"index": 1, "marker": 2, "supports": "chip-tech feedback alone reaches 65%"}
  ]
}
"""
    judge = StubJudge(judge_response)
    refined = await refine_citation_claims(output, judge)
    assert len(refined.citations) == 2
    assert refined.citations[0].supports == "Software-IE is plausible"
    assert refined.citations[1].supports == "chip-tech feedback alone reaches 65%"
    # URLs and passages preserved.
    assert refined.citations[0].url == "u1"
    assert refined.citations[1].passage == "p2"


@pytest.mark.asyncio
async def test_refine_citations_unparseable_returns_original() -> None:
    prose = "Some claim [1]."
    output = AgentOutput(
        final_answer=prose,
        citations=[Citation(url="u1", supports="Some claim")],
    )
    judge = StubJudge("not json at all")
    refined = await refine_citation_claims(output, judge)
    assert refined.citations[0].supports == "Some claim"


@pytest.mark.asyncio
async def test_refine_citations_empty_output_returns_original() -> None:
    output = AgentOutput(final_answer="No citations here.", citations=[])
    judge = StubJudge("{\"claims\": []}")
    refined = await refine_citation_claims(output, judge)
    assert refined.citations == []


@pytest.mark.asyncio
async def test_refine_citations_skips_when_walk_disagrees() -> None:
    """Custom-agent citation list out of sync with deterministic walk:
    refinement should bail out rather than scramble supports text."""
    prose = "Claim A [1]."
    output = AgentOutput(
        final_answer=prose,
        # Two citations but only one marker in prose -> walk has length 1.
        citations=[
            Citation(url="u1", supports="Claim A"),
            Citation(url="u2", supports="Different claim emitted by custom agent"),
        ],
    )
    judge = StubJudge('{"claims": [{"index": 0, "marker": 1, "supports": "Claim A refined"}]}')
    refined = await refine_citation_claims(output, judge)
    # Should be unchanged because walk and citation list disagree.
    assert refined.citations[0].supports == "Claim A"
    assert refined.citations[1].supports == "Different claim emitted by custom agent"


@pytest.mark.asyncio
async def test_refine_citations_dedupes_same_claim_same_marker_repeated() -> None:
    """Repeated `[1]` on the same sentence collapses to ONE citation; walk
    must dedup the same way so alignment lengths match."""
    prose = "Claim X [1] [1]."
    output = AgentOutput(
        final_answer=prose,
        citations=[Citation(url="u1", supports="Claim X")],  # one citation after dedup
    )
    # The walk has two entries, both (1, "Claim X"); dedup collapses to one.
    judge = StubJudge(
        '{"claims": ['
        '{"index": 0, "marker": 1, "supports": "the X claim"},'
        '{"index": 1, "marker": 1, "supports": "the X claim again"}'
        "]}"
    )
    refined = await refine_citation_claims(output, judge)
    assert len(refined.citations) == 1
    assert refined.citations[0].supports == "the X claim"


@pytest.mark.asyncio
async def test_refine_citations_distinct_sentences_same_marker() -> None:
    """`[1]` reused across two different sentences -> two citations after
    dedup; refinement should pair them correctly with the LLM's per-sentence
    refined claims."""
    prose = "First fact about X [1]. Then a second fact about Y [1]."
    output = AgentOutput(
        final_answer=prose,
        citations=[
            Citation(url="u1", supports="First fact about X"),
            Citation(url="u1", supports="Then a second fact about Y"),
        ],
    )
    judge = StubJudge(
        '{"claims": ['
        '{"index": 0, "marker": 1, "supports": "X is the topic"},'
        '{"index": 1, "marker": 1, "supports": "Y has property Z"}'
        "]}"
    )
    refined = await refine_citation_claims(output, judge)
    assert refined.citations[0].supports == "X is the topic"
    assert refined.citations[1].supports == "Y has property Z"


@pytest.mark.asyncio
async def test_refine_citations_partial_judge_response_keeps_originals_for_missing() -> None:
    """If the LLM returns refined claims for only SOME walk entries, the
    rest keep their deterministic supports text."""
    prose = "Claim A [1] and claim B [2]."
    output = AgentOutput(
        final_answer=prose,
        citations=[
            Citation(url="u1", supports="Claim A and claim B"),
            Citation(url="u2", supports="Claim A and claim B"),
        ],
    )
    # Only refine index 0.
    judge = StubJudge('{"claims": [{"index": 0, "marker": 1, "supports": "Claim A only"}]}')
    refined = await refine_citation_claims(output, judge)
    assert refined.citations[0].supports == "Claim A only"
    # Index 1 wasn't refined; deterministic supports text preserved.
    assert refined.citations[1].supports == "Claim A and claim B"


# --- A2: per-document holistic answer-support grader ------------------------


@pytest.mark.asyncio
async def test_answer_support_no_unsupported_claims_full_score() -> None:
    output = AgentOutput(
        final_answer="The growth was 8x [1].",
        citations=[Citation(url="u1", title="t", passage="The growth was 8x.")],
    )
    corpus = _StubCorpus({"u1": "The growth was 8x."})
    judge = StubJudge('{"unsupported_claims": [], "rationale": "fully supported"}')
    res = await score_answer_support(output, corpus, judge)
    assert res.score == 1.0
    assert res.unsupported_claims == []
    assert res.judge_ran is True


@pytest.mark.asyncio
async def test_answer_support_one_unsupported_short_answer() -> None:
    output = AgentOutput(
        final_answer="A short answer with one unsupported claim [1].",
        citations=[Citation(url="u1", title="t", passage="some evidence")],
    )
    corpus = _StubCorpus({"u1": "some evidence"})
    judge = StubJudge('{"unsupported_claims": ["the unsupported claim"], "rationale": "one issue"}')
    res = await score_answer_support(output, corpus, judge)
    assert res.score == 0.6  # one unsupported, short answer
    assert res.unsupported_claims == ["the unsupported claim"]


@pytest.mark.asyncio
async def test_answer_support_three_unsupported_low_score() -> None:
    output = AgentOutput(
        final_answer="Many things [1].",
        citations=[Citation(url="u1", passage="ev")],
    )
    corpus = _StubCorpus({"u1": "ev"})
    judge = StubJudge(
        '{"unsupported_claims": ["a", "b", "c"], "rationale": "three issues"}'
    )
    res = await score_answer_support(output, corpus, judge)
    assert res.score == 0.2


@pytest.mark.asyncio
async def test_answer_support_no_citations_skipped() -> None:
    output = AgentOutput(final_answer="Some answer with no markers.", citations=[])
    corpus = _StubCorpus({})
    judge = StubJudge("never called")
    res = await score_answer_support(output, corpus, judge)
    assert res.judge_ran is False
    assert res.score == 0.5  # neutral, can't grade without evidence


@pytest.mark.asyncio
async def test_answer_support_strips_markers_before_judging() -> None:
    """The evidence judge shouldn't see [N] markers in the answer; that lets
    the judge focus on factual claims rather than the citation surface."""
    seen_user: list[str] = []

    def respond(req: JudgeRequest) -> str:
        seen_user.append(req.user)
        return '{"unsupported_claims": [], "rationale": ""}'

    output = AgentOutput(
        final_answer="Claim X is true [1] and claim Y is also true [2].",
        citations=[
            Citation(url="u1", passage="ev1"),
            Citation(url="u2", passage="ev2"),
        ],
    )
    corpus = _StubCorpus({"u1": "ev1", "u2": "ev2"})
    judge = StubJudge(respond)
    await score_answer_support(output, corpus, judge)
    assert seen_user, "judge was not called"
    assert "[1]" not in seen_user[0]
    assert "[2]" not in seen_user[0]
    assert "Claim X is true" in seen_user[0]


@pytest.mark.asyncio
async def test_answer_support_dedupes_evidence_by_url() -> None:
    """Two citations to the same URL should produce one evidence block."""
    output = AgentOutput(
        final_answer="C1 [1]. C2 [1].",
        citations=[
            Citation(url="u1", passage="ev"),
            Citation(url="u1", passage="ev"),
        ],
    )
    corpus = _StubCorpus({"u1": "ev"})
    judge = StubJudge('{"unsupported_claims": [], "rationale": ""}')
    res = await score_answer_support(output, corpus, judge)
    assert res.n_cited_sources == 1
