# ADR 0003: Evaluate replay-informed strategy proposals

Status: Proposed — no game-code change in this decision. The separate combat-movement candidate is staged and awaiting live validation.

## Context

Four validated response chunks from replays `6ab867aee03513115f91edc0` (ticks 1–105) and `6ab9398a22f1123ef118f173` (ticks 1–139) were reviewed with their explicitly associated, checksum-validated maps. The maps share ScoreFlag objects but differ at 1,785 terrain cells. [The review report](../architecture/replay-review-2026-09-27.md) preserves response fingerprints, observed positions and health, coverage, and limitations before managed JSONL cleanup. Snapshots precede actions and do not establish the exact code revision or action causality.

## Proposed evaluation order

1. **Healer support positioning.** Damaged `pg_player1_melee_1` is four or more tiles from every functioning healer at older-replay ticks 47–52 and newer-replay ticks 113–114, outside ranged-heal distance three. Test whether a bounded healer support objective increases in-range healing opportunities and friendly survival without unacceptable flag loss. Observe action logs or other direct action evidence and compare multiple active matches; health changes alone are insufficient.
2. **Stable local combat targets.** Newer-replay `pg_player1_ranged_5` moves between (49,48), (50,47), and (49,48) at ticks 113–115 while enemy range crosses the staged five-tile cutoff. Test brief target persistence or path-aware switching against the current candidate on the same states, then compare actual range-three access, target switches, CPU cost, and outcomes in code-provenance matches. Congestion is observed, but its causal role is uncertain.
3. **Post-capture flag allocation.** At tick 100 both replays still select an already owned first flag while other flags are neutral or enemy-owned. Evaluate allocating selected units to another flag against the current first-flag fallback. Measure net score, flag retention, combat survival, and outcomes; additional captured flags impose army-wide penalties, so more captures are not inherently better.

## Consequences

These are evidence-backed hypotheses, not adopted tactics. Their order reflects the immediate observed loss of heal access, then possible movement switching, then a scoring tradeoff. No gameplay implementation or victory claim follows from this ADR. Each proposal requires focused tests and active matches before adoption. Completing replay analysis and deleting reviewed JSONL does not satisfy the separate live gate for committing the staged combat-movement candidate.
