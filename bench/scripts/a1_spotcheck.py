"""A1 (claim-anchoring) gold-set spot-check helper.

Per `iteration/06-validation-protocol.md`:

- Take 30 REAL_BUT_UNSUPPORTIVE citations from the baseline run.
- Have a human (Noah) hand-label each as truly_unsupportive (the chunk
  really doesn't back the claim) vs artifact_of_granularity (the
  marker pinned to the wrong chunk because of multi-marker sentences).
- Re-run the same citations with A1 active (current code) and check:
  - On truly_unsupportive: A1 still flags ≥80% as UNSUP/PARTIAL.
  - On artifact: A1 flips ≥60% to VALID/PARTIAL.

This script handles steps 1 (sample) and 3 (re-grade) automatically.
Step 2 is human work — emits a CSV ready for hand-labeling.

Usage:
  # Step 1: extract a sample of REAL_BUT_UNSUPPORTIVE citations to label
  python scripts/a1_spotcheck.py extract --from-run logs/final_run --n 30

  # (hand-label the CSV, save as scoring_gold.csv)
  # Add a `gold_label` column with values:
  #   truly_unsupportive | artifact_of_granularity | unclear

  # Step 3: re-grade the same citations with current A1 code
  python scripts/a1_spotcheck.py regrade scoring_gold.csv

The CSV is small enough (30 rows × ~10 fields) to hand-label in any
spreadsheet tool. Skipping LLM-driven labeling deliberately — the whole
point of the gold set is to be ground truth, not another judge.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import random
import sys
from collections import Counter
from pathlib import Path
from statistics import mean

from inspect_ai.log import read_eval_log

from forethought_bench._common import resolve_content_dir
from forethought_bench.corpus import Corpus
from forethought_bench.judges import default_judge
from forethought_bench.schema import AgentOutput, Citation
from forethought_bench.scoring.citation_faithfulness import check_all_citations
from forethought_bench.scoring.claim_anchoring import refine_citation_claims


def _collect_unsupportive(run_dir: Path, *, max_n: int, seed: int = 17) -> list[dict]:
    """Pull up to max_n citations whose verdict was REAL_BUT_UNSUPPORTIVE.

    Uses the citation_checks blob in score.metadata so we don't have to
    re-run the judge to learn the original verdicts.
    """
    rng = random.Random(seed)
    candidates: list[dict] = []
    for ep in sorted(run_dir.glob("*.eval")):
        log = read_eval_log(str(ep))
        track = (log.eval.metadata or {}).get("track", "?") if log.eval else "?"
        # Skip removed tracks — citations there can't be re-graded against
        # current code (no Item schema fields, no scorer).
        if track in {"boundary", "gate"}:
            continue
        for sample in (log.samples or []):
            sm = (next(iter((sample.scores or {}).values()), None) or {}).metadata or {}
            checks = sm.get("citation_checks") or []
            ao_raw = (sample.metadata or {}).get("agent_output") or {}
            cites = ao_raw.get("citations") or []
            for ck in checks:
                if ck.get("verdict") != "real_but_unsupportive":
                    continue
                idx = int(ck.get("citation_index", -1))
                if idx < 0 or idx >= len(cites):
                    continue
                cite = cites[idx]
                candidates.append({
                    "track": track,
                    "item_id": str(sample.id),
                    "citation_index": idx,
                    "url": cite.get("url", ""),
                    "title": cite.get("title", ""),
                    "passage": (cite.get("passage") or "")[:600],
                    "claim": ck.get("parsed_claim", "")[:600],
                    "support_rationale": (ck.get("support_rationale") or "")[:600],
                })
    rng.shuffle(candidates)
    return candidates[:max_n]


def cmd_extract(args: argparse.Namespace) -> int:
    rows = _collect_unsupportive(Path(args.from_run), max_n=args.n, seed=args.seed)
    if not rows:
        print(f"no real_but_unsupportive citations found in {args.from_run}", file=sys.stderr)
        return 1
    out = Path(args.out)
    fieldnames = list(rows[0].keys()) + ["gold_label", "notes"]
    with out.open("w") as fp:
        writer = csv.DictWriter(fp, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            r["gold_label"] = ""
            r["notes"] = ""
            writer.writerow(r)
    print(f"wrote {len(rows)} rows to {out}")
    print("Fill in gold_label per row with one of:")
    print("  truly_unsupportive       — chunk really doesn't back claim")
    print("  artifact_of_granularity  — claim string is too coarse; the marker")
    print("                              actually anchors a sub-clause that IS")
    print("                              supported")
    print("  unclear                  — exclude from final stats")
    return 0


async def _aregrade(args: argparse.Namespace) -> int:
    rows = list(csv.DictReader(open(args.csv)))
    if not rows:
        print("empty CSV", file=sys.stderr)
        return 1
    corpus = Corpus.from_directory(resolve_content_dir(args.content_dir))
    judge = default_judge(model=args.judge_model)

    # Group rows by item so we can rebuild a per-item AgentOutput
    # (refine_citation_claims operates per-output, not per-citation).
    by_item: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        by_item.setdefault((r["track"], r["item_id"]), []).append(r)

    # We don't have the original AgentOutput here — but we have URL + passage
    # + claim, which is everything check_all_citations needs. We'll
    # synthesize a minimal output per item.
    flips: list[tuple[str, str, str]] = []
    new_verdicts: list[str] = []
    for (track, item_id), citations in by_item.items():
        cites = [
            Citation(
                url=c["url"], title=c.get("title") or "untitled",
                passage=c.get("passage") or "", supports=c.get("claim") or "",
            )
            for c in citations
        ]
        # Synthesize a final_answer that is just the claim list (one per
        # sentence) so refine_citation_claims sees clear marker→clause
        # mappings. Each claim becomes "<claim text> [N]".
        prose_parts = []
        for i, c in enumerate(citations):
            claim = (c.get("claim") or "").rstrip(". ")
            prose_parts.append(f"{claim} [{i+1}]")
        synthetic_answer = ". ".join(prose_parts) + "."
        ao = AgentOutput(final_answer=synthetic_answer, citations=cites)

        # Refine via A1 — same code path as production scoring.
        ao = await refine_citation_claims(ao, judge)
        # Re-grade
        checks = await check_all_citations(ao, corpus, judge)
        for src_row, ck in zip(citations, checks):
            v_old = "real_but_unsupportive"
            v_new = ck.verdict
            new_verdicts.append(v_new)
            label = (src_row.get("gold_label") or "").strip()
            flips.append((src_row["item_id"], label, v_new))

    print(f"# A1 spot-check regrade — {len(rows)} citations\n")
    by_label: dict[str, list[str]] = {}
    for _iid, label, v in flips:
        by_label.setdefault(label or "(unlabeled)", []).append(v)
    print("| gold_label | n | valid | partial | unsup | fab |")
    print("|---|---|---|---|---|---|")
    for label in sorted(by_label):
        vs = by_label[label]
        c = Counter(vs)
        print(
            f"| {label} | {len(vs)} | "
            f"{c.get('valid', 0)} | "
            f"{c.get('partial', 0)} | "
            f"{c.get('real_but_unsupportive', 0)} | "
            f"{c.get('fabricated', 0)} |"
        )
    print()
    truly = by_label.get("truly_unsupportive") or []
    art = by_label.get("artifact_of_granularity") or []
    if truly:
        held = sum(1 for v in truly if v in {"real_but_unsupportive", "partial"})
        rate = held / len(truly)
        print(f"- truly_unsupportive still flagged UNSUP/PARTIAL: **{rate*100:.0f}%** "
              f"(target ≥80%) {'✓' if rate >= 0.80 else '⚠'}")
    if art:
        flipped = sum(1 for v in art if v in {"valid", "partial"})
        rate = flipped / len(art)
        print(f"- artifact_of_granularity flipped to VALID/PARTIAL: **{rate*100:.0f}%** "
              f"(target ≥60%) {'✓' if rate >= 0.60 else '⚠'}")
    if not (truly and art):
        print("\n(no labels supplied yet — fill in the `gold_label` column to get pass/fail).")
    return 0


def cmd_regrade(args: argparse.Namespace) -> int:
    return asyncio.run(_aregrade(args))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_extract = sub.add_parser("extract", help="emit CSV of REAL_BUT_UNSUPPORTIVE citations to hand-label")
    p_extract.add_argument("--from-run", default="logs/final_run")
    p_extract.add_argument("--n", type=int, default=30)
    p_extract.add_argument("--seed", type=int, default=17)
    p_extract.add_argument("--out", default="iteration/a1_spotcheck.csv")
    p_extract.set_defaults(fn=cmd_extract)
    p_regrade = sub.add_parser("regrade", help="re-run A1 + citation grader on a labeled CSV")
    p_regrade.add_argument("csv")
    p_regrade.add_argument("--content-dir", default=None)
    p_regrade.add_argument("--judge-model", default="haiku")
    p_regrade.set_defaults(fn=cmd_regrade)
    args = parser.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
