"""A2 (answer-support) discriminative-power validation.

Per `iteration/06-validation-protocol.md`:

- Build a synthetic-error set: 8 items × {faithful, hallucinated} answer.
- Score both with `score_answer_support` only.
- Pass iff: faithful mean ≥ 0.85, hallucinated mean ≤ 0.55, gap ≥ 0.30.

The faithful answer is the agent's actual output from a baseline run
(default: ``logs/final_run``). The hallucinated answer mutates the first
numeric percentage in the prose to a wrong-but-plausible value (e.g.
``50%`` → ``75%``). The mutation is contradicted by the corpus evidence
A2 will be given, so if A2 is doing its job it should mark the
hallucinated answer down.

Why automated mutation: cheap to scale, reproducible, and the failure
mode it tests (a number that contradicts the cited paper) is one of the
top-2 production hallucinations we care about.

Usage:
  .venv/bin/python scripts/validate_a2.py
  .venv/bin/python scripts/validate_a2.py --from-run logs/iter_a1a2a3_v3_...
  .venv/bin/python scripts/validate_a2.py --n 4 --shift 30
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from statistics import mean

from inspect_ai.log import read_eval_log

from forethought_bench._common import resolve_content_dir
from forethought_bench.corpus import Corpus
from forethought_bench.judges import default_judge
from forethought_bench.schema import AgentOutput
from forethought_bench.scoring.answer_support import score_answer_support

DEFAULT_BASELINE = "logs/final_run"
PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
FAKE_CLAIM = (
    " A separate Forethought working paper (Buckman & Reiss, 2026-Q1) puts "
    "the upper bound on this figure at 47.3% under low-coordination "
    "scenarios, contradicting the headline estimate."
)


@dataclass
class Pair:
    item_id: str
    track: str
    faithful: AgentOutput
    hallucinated: AgentOutput
    mutation: str


def _mutate_first_percent(answer: str, *, shift: int = 25) -> tuple[str, str] | None:
    m = PERCENT_RE.search(answer)
    if not m:
        return None
    old = float(m.group(1))
    # +shift modulo 95 keeps the new value plausible and != old.
    new_int = int((old + shift) % 95)
    if new_int == int(old):
        new_int = (new_int + 7) % 95
    if new_int == 0:
        new_int = 13
    new = str(new_int)
    mutated = answer[:m.start(1)] + new + answer[m.end(1):]
    note = f"%-shift: '{m.group(0)}' → '{new}{m.group(0)[len(m.group(1)):]}'"
    return mutated, note


def _mutate_append_fake(answer: str, *, _shift: int = 0) -> tuple[str, str] | None:
    """Append a clearly fabricated sentence with a fake author + figure.

    Tests whether A2 catches whole-claim hallucinations (vs. number-only
    swaps which are subtle). If A2 fails on this too, the grader prompt
    needs structural changes, not just stricter wording.
    """
    if not answer.strip():
        return None
    return answer.rstrip() + FAKE_CLAIM, "append-fake-claim"


_MUTATIONS = {
    "pct-shift": _mutate_first_percent,
    "fake-claim": _mutate_append_fake,
}


def _load_baseline(
    run_dir: str, *, max_items: int, mutation: str = "pct-shift",
    shift: int = 25,
) -> list[Pair]:
    mut_fn = _MUTATIONS[mutation]
    pairs: list[Pair] = []
    for ep in sorted(Path(run_dir).glob("*.eval")):
        log = read_eval_log(str(ep))
        meta = log.eval.metadata or {}
        track = str(meta.get("track", "?"))
        if track in {"boundary", "gate"}:
            continue
        for sample in (log.samples or []):
            sm = sample.metadata or {}
            ao_raw = sm.get("agent_output") or {}
            try:
                ao = AgentOutput.model_validate(ao_raw)
            except Exception:
                continue
            mutated = mut_fn(ao.final_answer or "", shift=shift)
            if not mutated:
                continue
            new_answer, note = mutated
            hallucinated = ao.model_copy(update={"final_answer": new_answer})
            pairs.append(Pair(
                item_id=str(sample.id), track=track,
                faithful=ao, hallucinated=hallucinated,
                mutation=note,
            ))
            if len(pairs) >= max_items:
                return pairs
    return pairs


async def _score_pair(pair: Pair, corpus: Corpus, judge) -> tuple[float, float, list[str], list[str]]:
    f, h = await asyncio.gather(
        score_answer_support(pair.faithful, corpus, judge),
        score_answer_support(pair.hallucinated, corpus, judge),
    )
    return f.score, h.score, f.unsupported_claims, h.unsupported_claims


async def _amain(args: argparse.Namespace) -> int:
    pairs = _load_baseline(
        args.from_run, max_items=args.n,
        mutation=args.mutation, shift=args.shift,
    )
    if not pairs:
        print(f"no usable pairs in {args.from_run}", file=sys.stderr)
        return 1
    print(f"# A2 validation — synthetic hallucinated probe\n")
    print(f"- baseline run: `{args.from_run}`")
    print(f"- pairs: {len(pairs)} (sampled across tracks)")
    print(f"- mutation: {args.mutation}"
          + (f" (shift={args.shift})" if args.mutation == "pct-shift" else ""))
    print(f"- success criteria: faithful≥0.85, hallucinated≤0.55, gap≥0.30\n")

    corpus = Corpus.from_directory(resolve_content_dir(args.content_dir))
    judge = default_judge(model=args.judge_model)

    rows: list[tuple[str, str, float, float, float, str, list[str]]] = []
    for p in pairs:
        f_score, h_score, _f_un, h_un = await _score_pair(p, corpus, judge)
        gap = f_score - h_score
        rows.append((p.track, p.item_id, f_score, h_score, gap, p.mutation, h_un))

    print("| Track | Item | Faithful | Hallucinated | Gap | Mutation |")
    print("|---|---|---|---|---|---|")
    for track, item_id, f, h, g, mut, _ in rows:
        flag = "✓" if g >= 0.30 else "⚠"
        print(f"| {track} | {item_id} | {f:.3f} | {h:.3f} | {g:+.3f} {flag} | {mut} |")

    f_mean = mean(r[2] for r in rows)
    h_mean = mean(r[3] for r in rows)
    g_mean = mean(r[4] for r in rows)
    print()
    print(f"**Means**: faithful={f_mean:.3f}  hallucinated={h_mean:.3f}  gap={g_mean:+.3f}")
    crit_fa = "✓" if f_mean >= 0.85 else "⚠"
    crit_ha = "✓" if h_mean <= 0.55 else "⚠"
    crit_gap = "✓" if g_mean >= 0.30 else "⚠"
    print(f"- faithful ≥ 0.85? **{crit_fa}**  (mean {f_mean:.3f})")
    print(f"- hallucinated ≤ 0.55? **{crit_ha}**  (mean {h_mean:.3f})")
    print(f"- gap ≥ 0.30? **{crit_gap}**  (mean {g_mean:+.3f})")

    overall_pass = all(c == "✓" for c in [crit_fa, crit_ha, crit_gap])
    print(f"\n**Verdict**: {'PASS' if overall_pass else 'FAIL'}")

    if args.show_unsupported:
        print("\n## Per-pair unsupported claims (hallucinated variant)\n")
        for track, item_id, _f, _h, _g, _m, h_un in rows:
            print(f"### {track}/{item_id}")
            for c in h_un:
                print(f"- {c}")
            print()
    return 0 if overall_pass else 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-run", default=DEFAULT_BASELINE,
                        help=f"baseline log dir to source faithful answers (default: {DEFAULT_BASELINE})")
    parser.add_argument("--n", type=int, default=8, help="number of items (default 8)")
    parser.add_argument("--mutation", default="pct-shift",
                        choices=list(_MUTATIONS.keys()),
                        help="mutation strategy (default pct-shift)")
    parser.add_argument("--shift", type=int, default=25, help="percent shift for pct-shift mutation (default 25)")
    parser.add_argument("--content-dir", default=None, help="corpus dir (default auto-detect)")
    parser.add_argument("--judge-model", default="haiku", help="judge model alias (default haiku)")
    parser.add_argument("--show-unsupported", action="store_true",
                        help="dump per-pair unsupported_claims lists")
    args = parser.parse_args()
    return asyncio.run(_amain(args))


if __name__ == "__main__":
    sys.exit(main())
