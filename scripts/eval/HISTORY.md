# Eval history

One row per live run. Exit criteria (launch-loop-plan §5.4): ≥26/30 deterministic, ≥24/30 judge, 0 regressions.

| run | cases | all-pass | deterministic | judge | regressed | credits | per-dimension |
|---|---|---|---|---|---|---|---|
| 2026-09-29T12-37-25-479Z *(superseded: 1 case unscored after a network timeout)* | 6 | 1/6 | 3/6 | 1/6 | 0 | 16 | intent_match 3/6 · brand_fit 1/6 · text_quality 4/6 · focal_point 5/6 · ai_defects 5/6 · post_worthy 1/6 |
| **2026-09-29T12-37-25-479Z BASELINE** (all 6 scored, free re-score) | 6 | 1/6 | 4/6 | 1/6 | 0 | 0 | intent_match 4/6 · brand_fit 2/6 · text_quality 4/6 · focal_point 6/6 · ai_defects 6/6 · post_worthy 1/6 |

**Judge instability (measured 2026-09-29):** re-scoring the SAME six images flipped `text_quality`
on 2 cases (Mama Njeri pass→fail, Gasless Cash fail→pass): ~2/30 comparable verdicts (~7%), even at
temperature 0. Treat single-run differences under ~1 case as noise until the judge uses a
3-call majority vote per dimension (queued as eval work before W2's model A/B).
