# forethought-bench - Full smoke benchmark

**Bench v**: `0.2.0`  **Agent**: `forethought-chat:http://localhost:3000`  **Judge**: `claude-code:opus`  **Total items**: 29  **Wall**: 531s  **Overall composite (n-weighted)**: **0.612**

## Per-track summary

| Track | Tier | n | Composite | Wall (s) |
|---|---|---:|---:|---:|
| claim_recall | smoke | 5 | **0.520** | 27 |
| definitions | smoke | 6 | **0.679** | 72 |
| arguments | smoke | 4 | **0.623** | 106 |
| synthesis | smoke | 3 | **0.803** | 128 |
| boundary | smoke | 8 | **0.500** | 65 |
| open_research | smoke | 3 | **0.729** | 133 |

## Track: `claim_recall`  (tier=smoke, n=5)
composite mean: **0.520** | wall: 27s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| claim_recall_001 | 0.80 | correct=1.0, hedge_preserved=True, valid_cit=2/6 |
| claim_recall_004 | 0.20 | correct=0.0, hedge_preserved=True, valid_cit=0/3 |
| claim_recall_006 | 0.70 | correct=1.0, hedge_preserved=True, valid_cit=0/4 |
| claim_recall_007 | 0.20 | correct=0.0, hedge_preserved=True, valid_cit=0/3 |
| claim_recall_008 | 0.70 | correct=1.0, hedge_preserved=True, valid_cit=0/2 |

## Track: `definitions`  (tier=smoke, n=6)
composite mean: **0.679** | wall: 72s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| definitions_001_viatopia | 0.66 | verbal=MATCH, valid_cit=1/7 |
| definitions_002_asara | 0.84 | verbal=MATCH, valid_cit=3/5 |
| definitions_003_ai_character | 0.78 | verbal=MATCH, valid_cit=4/9 |
| definitions_004_three_ie_types | 0.73 | verbal=MATCH, valid_cit=6/19 |
| definitions_005_lock_in_mechanisms | 0.38 | verbal=PARTIAL, valid_cit=2/10 |
| definitions_006_ai_enabled_coup | 0.69 | verbal=MATCH, valid_cit=3/13 |

## Track: `arguments`  (tier=smoke, n=4)
composite mean: **0.623** | wall: 106s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| arguments_001_ai_coups_distinct | 0.63 | elements_present=60%, valid_cit=4/16 |
| arguments_002_lock_in_mechanisms | 0.50 | elements_present=50%, valid_cit=2/16 |
| arguments_003_software_ie_acceleration | 0.69 | elements_present=83%, valid_cit=4/24 |
| arguments_004_country_outgrowth | 0.66 | elements_present=83%, valid_cit=5/19 |

## Track: `synthesis`  (tier=smoke, n=3)
composite mean: **0.803** | wall: 128s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| synthesis_001_ie_timeline_compression | 0.79 | recall=100%, integration=INTEGRATED, elements=80%, valid_cit=2/20 |
| synthesis_002_lock_in_window | 0.76 | recall=100%, integration=INTEGRATED, elements=80%, valid_cit=2/26 |
| synthesis_003_coups_outgrowth | 0.86 | recall=100%, integration=INTEGRATED, elements=100%, valid_cit=5/16 |

## Track: `boundary`  (tier=smoke, n=8)
composite mean: **0.500** | wall: 65s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| boundary_001_climate | 0.00 | [negative_coverage] expected=refuse, observed=split, matched=False |
| boundary_002_biosec | 0.00 | [negative_coverage] expected=refuse, observed=split, matched=False |
| boundary_003_quantum_paper | 1.00 | [citation_bait] expected=refuse, observed=refuse, matched=True |
| boundary_004_consciousness_paper | 1.00 | [citation_bait] expected=refuse, observed=refuse, matched=True |
| boundary_005_lockin_brexit | 1.00 | [mixed] expected=split, observed=split, matched=True |
| boundary_006_coups_africa | 0.00 | [mixed] expected=split, observed=caveat, matched=False |
| boundary_007_pre_chatgpt_views | 0.00 | [outdated_view] expected=caveat, observed=split, matched=False |
| boundary_008_positive_control | 1.00 | [mixed] expected=ground, observed=ground, matched=True |

## Track: `open_research`  (tier=smoke, n=3)
composite mean: **0.729** | wall: 133s | agent: `forethought-chat:http://localhost:3000` | judge: `claude-code:opus`

| ID | Composite | Highlights |
|---|---:|---|
| open_research_001_lock_in_policy | 0.68 | comp=5 depth=4 instr=5 read=5; valid_cit=1/23 |
| open_research_002_takeoff_alignment | 0.77 | comp=5 depth=5 instr=5 read=5; valid_cit=6/24 |
| open_research_003_export_controls | 0.73 | comp=5 depth=4 instr=5 read=5; valid_cit=7/31 |
