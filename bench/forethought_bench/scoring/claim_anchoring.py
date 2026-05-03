"""Claim-anchored citation refinement.

The deterministic marker extractor (`agents/forethought_chat.py`'s
`extract_citations_from_markers`) attaches each `[N]` marker to the WHOLE
SENTENCE it sits in. When two markers occupy one sentence, both get credited
with the same supports string -- which is wrong if marker [1] backs a
clause-level fact and marker [2] backs a different clause-level fact.

This module re-runs the agent's prose through an LLM extractor that splits
each sentence into the smallest claim each marker supports, then rewrites the
`Citation.supports` field so the downstream citation-faithfulness judge grades
the right thing for each chunk.

We only refine the `supports` field; URL, title, and passage stay as the
production agent emitted them, so the corpus lookup in stages 2-3 of the
pipeline still works.
"""

from __future__ import annotations

import json
import re

from forethought_bench.judges import Judge, JudgeRequest
from forethought_bench.schema import AgentOutput, Citation

CLAIM_ANCHOR_SYSTEM = """\
You re-anchor the citation markers in an agent's prose answer to the SMALLEST
clause-level claim each marker supports.

INPUT
- PROSE: the agent's answer with `[N]` markers inline.
- MARKERS: an ordered list of `(index, marker, sentence_excerpt)` enumerating
  every marker occurrence in PROSE in left-to-right order. Two markers in one
  sentence share the sentence_excerpt.

OUTPUT (JSON only, no markdown fences)
{
  "claims": [
    {
      "index": <int, MUST equal the input MARKERS list index, 1:1>,
      "marker": <int, the [N] number>,
      "supports": <string, the SMALLEST clause-level claim this marker backs>
    },
    ...
  ]
}

RULES
- Output one entry per input marker, in input order. Same length as MARKERS.
- "supports" is the smallest grammatically-coherent claim in the answer that
  the marker backs. NOT the whole sentence, unless the sentence is itself a
  single clause. Prefer the bare fact: a number with its referent, a named
  concept with its definition, a single premise.
- If a sentence is "X is true and Y has probability 50% [1] [2]", figure out
  which clause each marker backs from semantics where possible. If both
  markers are clearly attached to the joint sentence, output the joint claim
  for both rather than guessing.
- Do NOT paraphrase; preserve the agent's wording where possible.
- Do NOT invent claims the agent did not make.
"""

CLAIM_ANCHOR_USER_TEMPLATE = """\
PROSE:
\"\"\"
{prose}
\"\"\"

MARKERS:
{markers_block}

JSON:"""


_MARKER_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


async def refine_citation_claims(
    output: AgentOutput,
    judge: Judge,
) -> AgentOutput:
    """Rewrite Citation.supports on each citation using an LLM extractor pass.

    Returns a NEW AgentOutput with refined citations; does not mutate the
    input. Falls back to the original output untouched if the extractor
    returns unparseable JSON or zero claims (the deterministic sentence
    extraction is still a workable fallback).
    """
    if not output.citations:
        return output
    prose = output.final_answer or ""
    if not prose.strip():
        return output

    walk = _walk_marker_occurrences(prose)
    if not walk:
        return output

    markers_block = "\n".join(
        f'  {i}. [{marker}] sentence: "{_truncate(sentence, 240)}"'
        for i, (marker, sentence) in enumerate(walk)
    )
    resp = await judge.complete(
        JudgeRequest(
            system=CLAIM_ANCHOR_SYSTEM,
            user=CLAIM_ANCHOR_USER_TEMPLATE.format(
                prose=prose, markers_block=markers_block
            ),
            max_tokens=2048,
        )
    )
    parsed = _parse_json_loose(resp.text) or {}
    claims_raw = parsed.get("claims") or []
    if not isinstance(claims_raw, list) or not claims_raw:
        return output

    by_index: dict[int, str] = {}
    for entry in claims_raw:
        if not isinstance(entry, dict):
            continue
        try:
            idx = int(entry.get("index", -1))
        except (TypeError, ValueError):
            continue
        if not (0 <= idx < len(walk)):
            continue
        supports = entry.get("supports")
        if not isinstance(supports, str) or not supports.strip():
            continue
        by_index[idx] = supports.strip()

    if not by_index:
        return output

    aligned = _align_walk_to_citations(walk, output.citations, by_index)

    if len(aligned) != len(output.citations):
        # Citation list and walk are out of sync (custom agent emits its own
        # citations independent of marker walking). Skip refinement to avoid
        # stomping on agent-emitted supports text.
        return output

    new_citations: list[Citation] = []
    for c, refined in zip(output.citations, aligned, strict=True):
        new_citations.append(
            Citation(
                url=c.url,
                title=c.title,
                passage=c.passage,
                supports=refined or c.supports,
            )
        )
    return output.model_copy(update={"citations": new_citations})


def _walk_marker_occurrences(prose: str) -> list[tuple[int, str]]:
    """Walk prose and emit (marker_int, sentence_excerpt) for every marker
    occurrence in left-to-right order.

    This walk has the SAME shape as `extract_citations_from_markers` does
    BEFORE its dedup step, so we can align walk indices to the citation list
    one-to-one with the dedup applied.
    """
    out: list[tuple[int, str]] = []
    for sentence in _split_sentences(prose):
        markers = _markers_in(sentence)
        if not markers:
            continue
        claim = _strip_markers(sentence).strip()
        if not claim:
            continue
        for n in markers:
            out.append((n, claim))
    return out


def _align_walk_to_citations(
    walk: list[tuple[int, str]],
    citations: list[Citation],
    refined_by_walk_index: dict[int, str],
) -> list[str | None]:
    """Map walk-indexed refined claims onto the citation list.

    `extract_citations_from_markers` walks marker occurrences and dedups on
    `(claim, marker)`. Each surviving (claim, marker) pair becomes ONE
    citation, in walk order. We replay that dedup here, recording the FIRST
    walk index for each (claim, marker) pair, then look up refined claims by
    that walk index.

    If the citation list length disagrees with the dedup walk (custom agent),
    return an empty list and let the caller skip refinement.
    """
    seen: dict[tuple[str, int], int] = {}
    dedup_walk_indices: list[int] = []
    for i, (marker, sentence) in enumerate(walk):
        key = (sentence, marker)
        if key in seen:
            continue
        seen[key] = i
        dedup_walk_indices.append(i)

    if len(dedup_walk_indices) != len(citations):
        return []

    out: list[str | None] = []
    for walk_index in dedup_walk_indices:
        out.append(refined_by_walk_index.get(walk_index))
    return out


def _split_sentences(text: str) -> list[str]:
    return [s for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]


def _markers_in(text: str) -> list[int]:
    out: list[int] = []
    for m in _MARKER_RE.finditer(text):
        for n_str in re.findall(r"\d+", m.group(1)):
            out.append(int(n_str))
    return out


def _strip_markers(text: str) -> str:
    return _MARKER_RE.sub("", text)


def _truncate(s: str, n: int) -> str:
    return s if len(s) <= n else s[: n - 1] + "..."


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
