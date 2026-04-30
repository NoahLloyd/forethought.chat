# forethought-bench - Full smoke benchmark

**Bench v**: `0.2.0`  **Agent**: `forethought-chat:http://localhost:3000`  **Judge**: `claude-code:opus`  **Total items**: 29  **Wall**: 497s  **Overall composite (n-weighted)**: **0.677**

## Per-track summary

| Track | Tier | n | Composite | Wall (s) |
|---|---|---:|---:|---:|
| claim_recall | smoke | 5 | **0.524** | 30 |
| definitions | smoke | 6 | **0.632** | 61 |
| arguments | smoke | 4 | **0.665** | 103 |
| synthesis | smoke | 3 | **0.812** | 110 |
| boundary | smoke | 8 | **0.750** | 73 |
| open_research | smoke | 3 | **0.704** | 120 |

## Track: `claim_recall`  (tier=smoke, n=5)
composite mean: **0.524** | wall: 30s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| claim_recall_001 | 0.82 | correct=1.0, hedge_preserved=True, valid_cit=2/5 |
| claim_recall_004 | 0.20 | correct=0.0, hedge_preserved=True, valid_cit=0/2 |
| claim_recall_006 | 0.70 | correct=1.0, hedge_preserved=True, valid_cit=0/4 |
| claim_recall_007 | 0.70 | correct=1.0, hedge_preserved=True, valid_cit=0/2 |
| claim_recall_008 | 0.20 | correct=0.0, hedge_preserved=True, valid_cit=0/1 |

## Track: `definitions`  (tier=smoke, n=6)
composite mean: **0.632** | wall: 61s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| definitions_001_viatopia | 0.64 | verbal=MATCH, valid_cit=1/9 |
| definitions_002_asara | 0.50 | verbal=PARTIAL, valid_cit=3/6 |
| definitions_003_ai_character | 0.78 | verbal=MATCH, valid_cit=6/13 |
| definitions_004_three_ie_types | 0.73 | verbal=MATCH, valid_cit=3/9 |
| definitions_005_lock_in_mechanisms | 0.33 | verbal=PARTIAL, valid_cit=1/14 |
| definitions_006_ai_enabled_coup | 0.80 | verbal=MATCH, valid_cit=4/8 |

## Track: `arguments`  (tier=smoke, n=4)
composite mean: **0.665** | wall: 103s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| arguments_001_ai_coups_distinct | 0.76 | elements_present=100%, valid_cit=4/19 |
| arguments_002_lock_in_mechanisms | 0.56 | elements_present=67%, valid_cit=2/19 |
| arguments_003_software_ie_acceleration | 0.66 | elements_present=83%, valid_cit=7/26 |
| arguments_004_country_outgrowth | 0.68 | elements_present=83%, valid_cit=6/19 |

## Track: `synthesis`  (tier=smoke, n=3)
composite mean: **0.812** | wall: 110s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| synthesis_001_ie_timeline_compression | 0.82 | recall=100%, integration=INTEGRATED, elements=60%, valid_cit=7/18 |
| synthesis_002_lock_in_window | 0.78 | recall=100%, integration=INTEGRATED, elements=80%, valid_cit=5/25 |
| synthesis_003_coups_outgrowth | 0.84 | recall=100%, integration=INTEGRATED, elements=100%, valid_cit=3/16 |

## Track: `boundary`  (tier=smoke, n=8)
composite mean: **0.750** | wall: 73s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| boundary_001_climate | 1.00 | [negative_coverage] expected=refuse, observed=refuse, matched=True |
| boundary_002_biosec | 0.00 | [negative_coverage] expected=refuse, observed=split, matched=False |
| boundary_003_quantum_paper | 1.00 | [citation_bait] expected=refuse, observed=refuse, matched=True |
| boundary_004_consciousness_paper | 1.00 | [citation_bait] expected=refuse, observed=refuse, matched=True |
| boundary_005_lockin_brexit | 1.00 | [mixed] expected=split, observed=split, matched=True |
| boundary_006_coups_africa | 0.00 | [mixed] expected=split, observed=caveat, matched=False |
| boundary_007_pre_chatgpt_views | 1.00 | [outdated_view] expected=caveat, observed=caveat, matched=True |
| boundary_008_positive_control | 1.00 | [mixed] expected=ground, observed=ground, matched=True |

## Track: `open_research`  (tier=smoke, n=3)
composite mean: **0.704** | wall: 120s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| open_research_001_lock_in_policy | 0.71 | comp=5 depth=4 instr=5 read=5; valid_cit=4/24 |
| open_research_002_takeoff_alignment | 0.71 | comp=5 depth=4 instr=5 read=5; valid_cit=3/22 |
| open_research_003_export_controls | 0.69 | comp=5 depth=4 instr=5 read=5; valid_cit=2/22 |
