"""Judge-variance probe for the synthesis rubric and integration scorers.

Per `iteration/10-judge-ensembling-2026-05-05.md`, we want to know whether
median-of-N judge calls reduces verdict-driven σ on the synthesis-track
sub-scorers. A full bench-run comparison conflates judge variance with
agent variance; this probe holds the agent prose constant by re-scoring
saved AgentOutputs from a chosen baseline run.

Protocol per (item, scorer):
  - Score N_TRIALS times at passes=1   (raw single-pass scoring)
  - Score N_TRIALS times at passes=3   (median-of-3 scoring)
  - Report σ for each setting.

Total judge calls: 3 items × 2 scorers × N_TRIALS × (1 + 3) calls.
For N_TRIALS=3 that's ~72 calls (~6 minutes via CLI judge).

Usage:
  .venv/bin/python scripts/probe_judge_variance.py \\
      --from-run logs/r19_full_baseline_across_all_4_librarian_tracks
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
from pathlib import Path

from inspect_ai.log import read_eval_log

from forethought_bench.judges import default_judge
from forethought_bench.librarian.scoring.synthesis import score_integration
from forethought_bench.schema import AgentOutput, Item
from forethought_bench.scoring.rubric import score_required_elements


def _find_synthesis_eval(run_dir: Path) -> Path:
    candidates = sorted(run_dir.glob("*_synthesis_*.eval"))
    if not candidates:
        raise FileNotFoundError(f"no synthesis .eval file in {run_dir}")
    return candidates[0]


def _load_synthesis_samples(eval_path: Path) -> list[tuple[Item, AgentOutput]]:
    log = read_eval_log(str(eval_path))
    out: list[tuple[Item, AgentOutput]] = []
    for sample in (log.samples or []):
        sm = sample.metadata or {}
        item = Item.model_validate(sm["item"])
        ao = AgentOutput.model_validate(sm["agent_output"])
        out.append((item, ao))
    return out


async def _trial_scores(
    item: Item,
    ao: AgentOutput,
    judge,
    *,
    passes: int,
    n_trials: int,
) -> tuple[list[float], list[float]]:
    """Run n_trials scoring trials and return (rubric_scores, integration_scores)."""
    rubric_scores: list[float] = []
    integration_scores: list[float] = []
    relationship = str(item.metadata.get("relationship", "complements"))
    for _ in range(n_trials):
        rub = await score_required_elements(
            item.question, ao.final_answer, item.required_elements, judge,
            passes=passes,
        )
        intg = await score_integration(
            item.question, ao.final_answer, relationship, judge,
            passes=passes,
        )
        rubric_scores.append(rub.fraction_at_least_partial)
        integration_scores.append(intg.score)
    return rubric_scores, integration_scores


def _stats(scores: list[float]) -> tuple[float, float, float]:
    if not scores:
        return 0.0, 0.0, 0.0
    if len(scores) == 1:
        return scores[0], 0.0, 0.0
    return (
        statistics.fmean(scores),
        statistics.pstdev(scores),
        max(scores) - min(scores),
    )


async def _amain(args: argparse.Namespace) -> int:
    run_dir = Path(args.from_run)
    eval_path = _find_synthesis_eval(run_dir)
    samples = _load_synthesis_samples(eval_path)
    judge = default_judge(model=args.judge_model)

    print(f"# Judge-variance probe — synthesis track\n")
    print(f"- baseline run: `{run_dir.name}`")
    print(f"- eval file: `{eval_path.name}`")
    print(f"- n_items: {len(samples)}, n_trials: {args.n_trials}")
    print(f"- judge: {judge.name}\n")

    print("| Item | Scorer | passes=1 mean | σ | range | passes=3 mean | σ | range | σ Δ |")
    print("|---|---|---|---|---|---|---|---|---|")

    rubric_sigma_sum_p1 = 0.0
    rubric_sigma_sum_p3 = 0.0
    intg_sigma_sum_p1 = 0.0
    intg_sigma_sum_p3 = 0.0

    for item, ao in samples:
        # Run passes=1 and passes=3 trials concurrently to halve wallclock.
        (r_p1, i_p1), (r_p3, i_p3) = await asyncio.gather(
            _trial_scores(item, ao, judge, passes=1, n_trials=args.n_trials),
            _trial_scores(item, ao, judge, passes=3, n_trials=args.n_trials),
        )
        for label, p1, p3, p1_acc, p3_acc in [
            ("rubric", r_p1, r_p3, "rubric_sigma_sum_p1", "rubric_sigma_sum_p3"),
            ("integration", i_p1, i_p3, "intg_sigma_sum_p1", "intg_sigma_sum_p3"),
        ]:
            m1, s1, rg1 = _stats(p1)
            m3, s3, rg3 = _stats(p3)
            print(
                f"| {item.id} | {label} "
                f"| {m1:.3f} | {s1:.3f} | {rg1:.3f} "
                f"| {m3:.3f} | {s3:.3f} | {rg3:.3f} "
                f"| {s3 - s1:+.3f} |"
            )
            if label == "rubric":
                rubric_sigma_sum_p1 += s1
                rubric_sigma_sum_p3 += s3
            else:
                intg_sigma_sum_p1 += s1
                intg_sigma_sum_p3 += s3

    n = len(samples)
    print()
    print(f"**Mean σ across {n} items**:")
    print(
        f"- rubric: passes=1 σ={rubric_sigma_sum_p1 / n:.3f}, "
        f"passes=3 σ={rubric_sigma_sum_p3 / n:.3f} "
        f"(Δ {rubric_sigma_sum_p3 / n - rubric_sigma_sum_p1 / n:+.3f})"
    )
    print(
        f"- integration: passes=1 σ={intg_sigma_sum_p1 / n:.3f}, "
        f"passes=3 σ={intg_sigma_sum_p3 / n:.3f} "
        f"(Δ {intg_sigma_sum_p3 / n - intg_sigma_sum_p1 / n:+.3f})"
    )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-run", required=True,
                        help="baseline log dir to source faithful answers")
    parser.add_argument("--n-trials", type=int, default=3,
                        help="trials per (item, passes) cell (default 3)")
    parser.add_argument("--judge-model", default="haiku")
    args = parser.parse_args()
    return asyncio.run(_amain(args))


if __name__ == "__main__":
    sys.exit(main())
