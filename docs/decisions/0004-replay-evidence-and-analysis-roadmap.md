# ADR 0004: Improve replay evidence and deterministic analysis

Status: Accepted direction; M1–M3 complete, M4–M5 planned.

Date: 2026-09-29 (Europe/Budapest)

## Context

The project already records build-tagged pre-action game-state snapshots and
validated, replay-linked maps. Membership bookkeeping is integrated into the tick
loop but does not drive gameplay. Selected actions, most command attempts, and
internal membership transitions are not exposed in the baseline replay format.

The user-reported local validation of commit
`d8f8d450b4b94996c5984ebec81885851622c71c` passed 98 tests. The subsequent review of
replay `6abaeae1694bbd3f98cb73e9` reported 83 consecutive snapshots (ticks 1–83),
a matching runtime build ID, and no errors in the available captured console
output. This supports runtime execution, not direct verification of membership
values. Reset behavior was not exercised. These are reported baseline results,
not checks rerun when writing this ADR.

The user agreed to prioritize better evidence and deterministic analysis over
machine learning, deep learning, reinforcement learning, and speculative
performance optimization.

Related records:
- [Project layout and current behavior](../architecture/project-layout.md)
- [ADR 0002: map linkage and replay lifecycle](0002-map-linked-replay-logs.md)
- [ADR 0003: strategy proposals](0003-replay-informed-strategy-proposals.md)
- [Current tick flow](../diagrams/tick-flow.puml)
- [Replay commands and build provenance](../../README.md)
- [Replay evidence contract](../architecture/replay-evidence-contract.md)

## Decision

Extend observability and add a deterministic, read-only replay analyzer before
changing strategy or optimizing runtime code. Keep the analysis implementation
outside `src/` and reuse existing JavaScript/Node.js tooling where practical.

Maintain three separate evidence categories:

| Category | What it establishes | What it does not establish |
| --- | --- | --- |
| Observed state | Recorded pre-action positions, health, parts, flags, and diagnostic state | Which command caused a later change |
| Selected decision and command attempt | Chosen action/target and whether an API call was attempted, with its return code | Successful movement, damage, healing, or strategic benefit |
| Derived analysis | Deterministic checks and metrics with cited inputs and explicit assumptions | Unrecorded internal state or counterfactual match outcomes |

Missing evidence is `unknown`, not success, failure, or proof that no event
occurred. A successful API return code is not proof of a resulting state change.

This ADR is also the progress tracker for this bounded roadmap. Keep the decision
and rationale stable; update milestone status and evidence as implementation
progresses. A material change of direction requires an explicit ADR amendment or
a superseding ADR.

## Scope and invariants

- Preserve gameplay selection, action order, tie-breaking, and command counts.
  Do not enable the scout or healer-escort experiments.
- Keep membership observation-only; diagnostics must not become selector inputs.
- Preserve existing game-state and map formats and original retained captures.
  Add separately typed, versioned diagnostic records; keep game-state JSONL
  game-state-only.
- Design importer support alongside diagnostics so new records retain build
  provenance and are available to the analyzer through the existing evidence
  storage approach.
- Keep old captures analyzable, explicitly reporting unavailable diagnostics.
- Do not claim complete console coverage or terminal-tick coverage without
  evidence. An absent terminal snapshot alone is not a defect.
- Record diagnostic overhead and capture completeness; do not assume that
  additional logging is free.
- Roadmap documentation does not itself authorize automatic match launches,
  strategy changes, or replay cleanup; each implementation milestone requires
  its own task authorization.

## Roadmap

M1–M3 are complete. Complete the remaining milestones in order; record implementation
and live verification separately.

| ID | Milestone | Status | Depends on | Completion evidence |
| --- | --- | --- | --- | --- |
| M1 | Define the evidence contract | Complete | Baseline | [Reviewed schema, examples, compatibility and coverage rules](../architecture/replay-evidence-contract.md) |
| M2 | Add membership diagnostics | Complete | M1 | Transition tests, importer round-trip evidence, unchanged selector inputs |
| M3 | Add decision and action diagnostics | Complete | M1, M2 | Command-trace equivalence tests and diagnostic correlation tests |
| M4 | Add deterministic replay analysis | Planned | M2, M3 | Known-answer fixtures, reproducible reports, read-only verification |
| M5 | Validate a new live capture and close the milestone | Planned | M4 | Build-identified capture, analysis report, overhead and evidence limitations |

### M1 — Evidence contract

Define record types, schema versions, tick, build ID, phase, ordering/correlation,
stable actor/target identities, null semantics, and diagnostic coverage. Replay
identity remains grounded in the importer source association, not a guessed
runtime value.

Specify an initial membership baseline followed by change-only events for
initialization/reset, assignment, presence, capability, and participation.
Include initialization reasons and enough state to reconstruct transitions.
Define how a partial capture or lost event makes reconstruction incomplete.

Define action records for selected movement/combat/healing, explicit hold/no-action
outcomes, actual attempts, and API return codes. Specify sufficient identifiers
and target coordinates to associate decisions, attempts, and snapshots.

Acceptance: documented examples cover baseline, transitions, holds, failed
commands, gaps, malformed records, and legacy captures. Importer validation and
storage changes are identified without silently redefining old formats.

### M2 — Membership diagnostics

Instrument existing state transitions without changing membership rules. Emit an
initial baseline and subsequent changes rather than repeating all membership
state every tick. Preserve original roles, stable slots, missing-versus-dead
semantics, and match-local reset behavior.

Acceptance: tests exercise initialization success/failure, missing and returned
members, tombstones, capability loss/restoration, fatigue-related mobility, late
IDs, and reset. Verify change-only emission, deterministic ordering, importer
preservation, and that logging does not mutate membership or gameplay inputs.
Local reset tests must not be described as live reset evidence.

### M3 — Decision and action diagnostics

Capture decisions at their existing selection sites and attempts at their actual
execution sites. Do not call selectors or game commands a second time for
logging. Record the actual method, target, and returned value; explicitly
distinguish no attempt from a missing return value.

Acceptance: instrumented and baseline execution produce identical ordered command
traces on representative fixtures, including mixed weapons, healing conflicts,
holds, and failures. Records correlate to the correct actor, tick, phase, and
build, and survive importer round trips. Measure output volume and check for
capture truncation or dropped evidence.

### M4 — Deterministic analyzer

Read captures, explicitly linked maps, and supported diagnostic evidence without
mutating inputs or lifecycle metadata. Keep claim/examined operations in the
documented external review workflow.

Validate schemas, build consistency, map linkage and canonical checksums,
snapshot coverage, gaps, duplicates, conflicting overlaps, and diagnostic
coverage. Distinguish the canonical map payload checksum from the saved file's
byte hash.

Report membership consistency, attack/heal range and functioning-part
eligibility, command conflicts, movement attempts and observed displacement, and
health changes between consecutive available snapshots. Do not assign damage or
healing causality from health differences alone. Do not bridge missing ticks as
if they were adjacent observations.

Each finding must identify its replay, build/provenance status, file/record or
tick/actor evidence, rule, and verdict (`pass`, `fail`, or `unknown`).
Unverified legacy provenance must remain unknown. Any code-based decision
reconstruction requires the matching implementation and necessary prior state
and must be labeled as inference.

Acceptance: small synthetic fixtures have explicit expected findings; legacy
captures yield useful partial reports; malformed and contradictory inputs produce
clear findings; repeated analysis gives the same substantive results; input bytes
and review metadata remain unchanged.

### M5 — Live validation and checkpoint

Run the documented local checks, generate/check the new runtime build ID, and
have the user launch a match with the intended source directory. Analyze a newly
captured, build-identified replay through the supported review workflow.

Acceptance: new diagnostics are retained, readable, correlated, and sufficient
for the exercised analyzer checks. Record observed tick coverage, runtime errors
found in available output, diagnostic size/CPU measurements, and all remaining
unknowns. Link the implementation commit, test results, capture fingerprints,
map reference/checksum, and report.

A single match need not exercise every transition. Record unexercised reset or
other scenarios as residual limitations; require targeted additional evidence
before claiming those behaviors were verified live. Successful instrumentation
does not establish improved win rate or strategy.

## Retention and review lifecycle

The existing utility's `done` command can immediately delete a managed JSONL and
its manifest record when every reviewer has completed. There is currently no
supported "done but retain" mode. Do not invoke `done` or cleanup for captures the
user has instructed us to retain, and do not manually edit review metadata.

For replay `6abaeae1694bbd3f98cb73e9`, the reported analysis is complete but review
task `codex/membership-live-d8f8d45-20260929` remains claimed and examined to retain
the evidence. Lifecycle completion is intentionally deferred. This records the
user's retention instruction; it does not change the utility or ADR 0002's
description of its existing behavior.

Apply the same retention requirement to roadmap validation captures unless the
user explicitly changes it. A utility redesign is outside this roadmap.

## Progress update rules

Use `Planned`, `In progress`, `Blocked`, or `Complete` for milestones.
For each status change, append the date, milestone, commit/PR, checks actually
run, evidence references, limitations, and next action. Mark complete only when
the listed acceptance criteria are met. Record live coverage separately from
local tests; never silently convert an unknown into a pass.

| Date | Milestone | Update | Evidence / next action |
| --- | --- | --- | --- |
| 2026-09-29 | Roadmap | Initial ADR draft; implementation not started | Begin M1 after roadmap review |
| 2026-09-29 | M1 | Complete: documented the version-1 evidence contract without runtime or importer changes | Contract examples parsed as JSON; local links and whitespace checked. Begin M2 only in a separately authorized task. |
| 2026-09-29 | M2 | Complete: runtime emits an initial membership baseline, deterministic change-only transitions, and membership-only coverage; the importer validates and preserves those records while keeping JSONL game-state-only | Focused transition and importer round-trip tests cover initialization, assignment, presence, tombstones, capability/mobility, late IDs, resets, suppression, gaps, duplicates, conflicts, and legacy input. Tick-flow regression coverage preserves commands and order; all 105 local tests, syntax/build-ID checks, and whitespace checks passed. Local reset evidence is not live reset evidence; M3 action diagnostics and M5 live validation remain planned. |
| 2026-09-30 | M3 | Complete locally (intentionally uncommitted): production selection/execution paths emit movement, healing, and combat decisions plus correlated command attempts, and the importer validates and preserves them with full M3 coverage | Local equivalence fixtures cover mixed weapons, healing compatibility, holds, no-actions, numeric failures, and missing numeric returns without changing ordered commands or inputs. Importer fixtures cover normal and diagnostic-only round trips, deferred retry, evidence-only review/cleanup and retirement, persistence, M2 compatibility, correlations and ordering, closures, gaps, canonical duplicates, conflicts, truncation, and unsupported versions. The diagnostic-only regression failed before the lifecycle fix and then passed. `npm run check`, 53 focused tests, all 115 tests, explicit build-ID verification, and whitespace checks passed with unchanged runtime build ID `c68afb80a447dbc69b12e4283757992d53b949c8c8aad6690b12200d53d1cf96`. The documented 14-scout fixture measured 57 records/19,841 bytes for a two-digit steady action-only tick and 58 records/22,813 bytes with the tick-1 membership baseline. Live capture completeness, runtime overhead, engine effects, and live reset behavior remain for M5. M4–M5 remain planned. |

## Consequences

The project gains reproducible analysis with explicit evidence limits and a
clear path from recorded decisions to observed outcomes. Costs include extra
console output, importer compatibility work, runtime overhead, and maintenance
of analysis rules and fixtures.

Strategy evaluation in ADR 0003 remains separate. Performance optimization,
statistical cross-match comparisons, ML/DL/RL, and new squad behavior are deferred;
they are not additional committed milestones. Revisit them only when a concrete
question and adequate evidence justify the work.
