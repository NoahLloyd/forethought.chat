"""Pydantic schemas for benchmark items, agent outputs, and scoring results."""

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class TrackName(str, Enum):
    DEFINITIONS = "definitions"
    CLAIM_RECALL = "claim_recall"
    ARGUMENTS = "arguments"
    SYNTHESIS = "synthesis"
    GATE = "gate"
    OPEN_RESEARCH = "open_research"


class NumericTolerance(BaseModel):
    """How close a numeric answer must be to count.

    Both relative and absolute - score passes if |answer - target| <=
    max(rtol * |target|, atol). This lets you grade probabilities (where
    0.05 of slack matters) and large counts uniformly.
    """

    rtol: float = 0.10
    atol: float = 0.0


class NumericTarget(BaseModel):
    value: float
    unit: str | None = None
    tolerance: NumericTolerance = Field(default_factory=NumericTolerance)


class CitationRef(BaseModel):
    """A reference to a Forethought source (used in expected_citation)."""

    url: str
    title: str | None = None
    authors: list[str] = Field(default_factory=list)
    section: str | None = None


class Item(BaseModel):
    """A single benchmark item. Used across all tracks; track-irrelevant fields
    are simply None / empty.

    Versioning is per-item (`version`) and benchmark-wide (BENCHMARK_VERSION).
    Bump per-item when you change the question or accepted answers; bump
    BENCHMARK_VERSION when scoring logic changes.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    track: TrackName
    version: int = 1
    question: str

    # Track 2 (claim recall) fields.
    claim_type: Literal["numeric", "named", "verbal"] | None = None
    numeric_target: NumericTarget | None = None
    accepted_phrasings: list[str] = Field(default_factory=list)
    # Hedge tokens that the source uses; the hedge_preservation scorer
    # checks the agent didn't strip them out (e.g., turning "~50%" into
    # "Forethought says 50%").
    hedge_terms: list[str] = Field(default_factory=list)

    # Citation expectations.
    expected_citation: CitationRef | None = None
    expected_citations: list[CitationRef] = Field(default_factory=list)
    # Verbatim source passage (for citation-faithfulness ground truth).
    source_passage: str | None = None

    # Gate track fields.
    expected_behavior: Literal["ground", "refuse", "split", "caveat"] | None = None
    gate_subtype: Literal[
        "negative_coverage", "citation_bait", "mixed", "outdated_view"
    ] | None = None

    # Track 3 (argument reconstruction) and Track 4 (synthesis) fields.
    required_elements: list[str] = Field(default_factory=list)

    # Tier controls whether an item runs in the default fast iteration loop.
    # "smoke"    : included in default runs (small, failure-mode-diverse subset)
    # "extended" : excluded by default; included only when tier="extended" or "all"
    tier: Literal["smoke", "extended"] = "smoke"

    # Held-out partition. ~20% of items per track should be held_out=True.
    held_out: bool = False
    # Canary token unique to this item; embedded in the question text so
    # future training-data contamination is detectable.
    canary_id: str | None = None

    metadata: dict[str, Any] = Field(default_factory=dict)


class Citation(BaseModel):
    """A citation as emitted by the agent under test."""

    url: str | None = None
    title: str | None = None
    # The excerpt the agent claims to be quoting / drawing from.
    passage: str | None = None
    # Free text annotation: which claim in the answer this citation supports.
    # The citation-faithfulness pipeline parses this to align claims to citations.
    supports: str | None = None


class RetrievedPassage(BaseModel):
    """A passage the agent retrieved during search (whether or not cited)."""

    url: str | None = None
    title: str | None = None
    text: str
    score: float | None = None


class AgentOutput(BaseModel):
    """The canonical structured output schema the agent under test must emit.

    Agents that emit prose are post-hoc extracted into this shape by
    forethought_bench.agents.extractor. New agents should emit it natively.
    """

    final_answer: str
    citations: list[Citation] = Field(default_factory=list)
    # If the agent emits probabilities, include them so calibration can be scored.
    confidence: float | None = None
    search_queries: list[str] = Field(default_factory=list)
    retrieved_passages: list[RetrievedPassage] = Field(default_factory=list)
    # The original prose answer, kept for record-keeping when extraction was used.
    raw: str | None = None


class CitationVerdict(str, Enum):
    """Per-citation verdict from the citation-faithfulness pipeline."""

    VALID = "valid"
    FABRICATED = "fabricated"  # cited URL/passage not in corpus
    REAL_BUT_UNSUPPORTIVE = "real_but_unsupportive"  # cited passage exists but doesn't support the claim
    PARTIAL = "partial"  # supports part of the claim but not all of it


class CitationCheck(BaseModel):
    """The result of running a single agent citation through the 4-stage pipeline."""

    citation_index: int
    verdict: CitationVerdict
    # Whether stage 2 (passage retrieval) succeeded.
    passage_found_in_corpus: bool
    # Stage 3 fuzzy match score, if applicable.
    passage_match_score: float | None = None
    # Stage 4 LLM judge rationale.
    support_rationale: str | None = None
    # The claim the citation was meant to support, as parsed from the agent output.
    parsed_claim: str | None = None
