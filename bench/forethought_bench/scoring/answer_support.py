"""Per-document holistic answer-support grader.

`citation_faithfulness.py` grades each `(claim, citation)` pair in isolation:
"does THIS chunk support THIS sentence?". That misses two cases the per-claim
lens cannot see:

  1. Claims that are jointly supported by 2+ chunks but no single chunk on
     its own. Per-claim grading marks the answer down for "weak" citations
     even though the cited set together is fine.
  2. Claims in the answer that no cited source supports. Per-claim grading
     can't notice these because there is no marker to walk from.

This module asks a judge a single per-item question:

  Given the cited set as the only allowed evidence, are there factual claims
  in the answer that are NOT supported by the evidence?

Returns a score in [0, 1] (1.0 = no unsupported claims) and the list of
unsupported claims for the report. Composes alongside per-citation grading,
not in place of it.

Reference: FaithJudge (arXiv 2505.04847) recommends running per-claim and
per-document graders side by side because they expose different failure modes.
"""

from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from forethought_bench.corpus import Corpus
from forethought_bench.judges import Judge, JudgeRequest
from forethought_bench.schema import AgentOutput

ANSWER_SUPPORT_SYSTEM = """\
You audit whether an agent's prose answer makes any factual claims that the
cited evidence block does NOT support.

You will be given:
  ANSWER: the agent's prose answer (citation markers stripped).
  EVIDENCE: a concatenation of every distinct passage the agent cited,
            deduped by source URL. Treat EVIDENCE as the ONLY source the
            agent is allowed to draw on -- ignore your own world knowledge.

Decide, for each factual claim in the answer, whether the EVIDENCE supports
it. Joint support across multiple passages is allowed: a claim can be
"supported" if 2+ passages together back it.

DO NOT flag:
- Definitional or framing prose ("This question concerns ...").
- Claims phrased as the agent's hedge ("I am not sure", "the corpus
  doesn't appear to address X directly").
- Restatements of the question.

DO flag:
- Specific numbers, dates, names, or attributed claims that are absent from
  EVIDENCE.
- Causal/conditional claims that EVIDENCE does not back.
- Claims attributed to a Forethought author or paper when EVIDENCE doesn't
  contain that attribution.

Return JSON only, no markdown fences:

{
  "unsupported_claims": [<string>, ...],
  "rationale": "<one or two sentences explaining the verdict>"
}

If every factual claim is supported, return an empty list.
"""

ANSWER_SUPPORT_USER_TEMPLATE = """\
ANSWER:
\"\"\"
{answer}
\"\"\"

EVIDENCE:
\"\"\"
{evidence}
\"\"\"

JSON:"""


class AnswerSupportResult(BaseModel):
    score: float  # in [0, 1]
    unsupported_claims: list[str] = Field(default_factory=list)
    rationale: str = ""
    n_cited_sources: int = 0
    evidence_chars: int = 0
    # If we couldn't build an evidence block (no citations, or none resolve),
    # we set score=0.5 and explain in rationale -- the judge wasn't run.
    judge_ran: bool = True


_MARKER_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")


async def score_answer_support(
    output: AgentOutput,
    corpus: Corpus,
    judge: Judge,
    *,
    max_evidence_chars: int = 24_000,
    max_chars_per_source: int = 4_000,
) -> AnswerSupportResult:
    """Grade whether the agent's answer makes any unsupported claims given the
    cited evidence block.

    The evidence block is a concatenation of:
      - the agent's quoted passage if present (these are the chunks the agent
        actually saw via retrieval), OR
      - the corpus document body trimmed to `max_chars_per_source`, when no
        passage was quoted but the URL is in the corpus.

    Deduped by URL so a 10-citation answer pointing at 3 papers gets 3
    evidence sources.
    """
    answer = (output.final_answer or "").strip()
    if not answer:
        return AnswerSupportResult(
            score=1.0,
            rationale="empty answer; nothing to check",
            judge_ran=False,
        )

    evidence_blocks = _build_evidence_blocks(
        output, corpus, max_chars_per_source=max_chars_per_source
    )
    if not evidence_blocks:
        return AnswerSupportResult(
            score=0.5,
            rationale="no resolvable cited evidence; per-document grader skipped",
            judge_ran=False,
        )

    evidence_text, total_chars = _pack_evidence(
        evidence_blocks, max_evidence_chars=max_evidence_chars
    )
    answer_clean = _strip_markers(answer)

    resp = await judge.complete(
        JudgeRequest(
            system=ANSWER_SUPPORT_SYSTEM,
            user=ANSWER_SUPPORT_USER_TEMPLATE.format(
                answer=answer_clean, evidence=evidence_text
            ),
            max_tokens=1024,
        )
    )
    parsed = _parse_json_loose(resp.text) or {}
    unsupported_raw = parsed.get("unsupported_claims") or []
    if not isinstance(unsupported_raw, list):
        unsupported_raw = []
    unsupported = [str(c) for c in unsupported_raw if isinstance(c, str)]
    rationale = str(parsed.get("rationale", "")).strip()[:600]

    score = _score_from_unsupported(answer_clean, unsupported)
    return AnswerSupportResult(
        score=score,
        unsupported_claims=unsupported,
        rationale=rationale or resp.text.strip()[:600],
        n_cited_sources=len(evidence_blocks),
        evidence_chars=total_chars,
        judge_ran=True,
    )


def _score_from_unsupported(answer: str, unsupported: list[str]) -> float:
    """Map the unsupported-claim list to a [0, 1] score.

    Heuristic:
      0 unsupported            -> 1.0
      1 unsupported, short ans -> 0.6 (single bad claim is a real penalty)
      1 unsupported, long ans  -> 0.7
      2 unsupported            -> 0.4
      3+ unsupported           -> 0.2
    """
    n = len(unsupported)
    if n == 0:
        return 1.0
    long = len(answer) > 1200
    if n == 1:
        return 0.7 if long else 0.6
    if n == 2:
        return 0.4
    return 0.2


def _build_evidence_blocks(
    output: AgentOutput,
    corpus: Corpus,
    *,
    max_chars_per_source: int,
) -> list[tuple[str, str, str]]:
    """Build (url, title, evidence_text) tuples deduped by URL.

    Pulls the agent's quoted passage if present; falls back to the corpus
    document body when the passage is absent or empty.
    """
    blocks: list[tuple[str, str, str]] = []
    seen_urls: set[str] = set()
    for c in output.citations or []:
        url = (c.url or "").strip()
        if not url or url in seen_urls:
            continue
        evidence: str
        title = (c.title or "").strip() or "(untitled)"
        if c.passage and c.passage.strip():
            evidence = c.passage.strip()
        else:
            record = corpus.by_url(url)
            if record is None:
                # Cannot include this source; skip silently. Per-citation
                # pipeline will already flag it as fabricated.
                continue
            doc = (record.text or record.body or "").strip()
            evidence = doc[:max_chars_per_source]
            title = record.title or title
        if not evidence:
            continue
        seen_urls.add(url)
        blocks.append((url, title, evidence))
    return blocks


def _pack_evidence(
    blocks: list[tuple[str, str, str]],
    *,
    max_evidence_chars: int,
) -> tuple[str, int]:
    """Concatenate evidence blocks, capped at max_evidence_chars.

    If the total exceeds the cap, trims each block proportionally so every
    cited source contributes some evidence.
    """
    raw_total = sum(len(b[2]) for b in blocks)
    if raw_total <= max_evidence_chars:
        parts = [_format_block(url, title, ev) for url, title, ev in blocks]
        return "\n\n".join(parts), raw_total

    overhead_per_block = 64  # heading + separators
    budget = max(0, max_evidence_chars - overhead_per_block * len(blocks))
    if budget <= 0 or raw_total == 0:
        return "", 0
    parts: list[str] = []
    used = 0
    for url, title, ev in blocks:
        share = max(200, int(len(ev) / raw_total * budget))
        share = min(share, len(ev))
        snippet = ev[:share]
        used += len(snippet)
        parts.append(_format_block(url, title, snippet))
    return "\n\n".join(parts), used


def _format_block(url: str, title: str, ev: str) -> str:
    return f"--- SOURCE: {title} ({url}) ---\n{ev}"


def _strip_markers(text: str) -> str:
    return _MARKER_RE.sub("", text).strip()


def _parse_json_loose(text: str) -> dict | None:
    s = (text or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```\s*$", "", s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", s, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
        return None
