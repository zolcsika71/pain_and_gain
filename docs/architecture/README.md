# Architecture and evidence

This folder holds descriptions of the bot and its integrations, plus validation and replay-review records. Design descriptions explain how the project works; evidence records describe what particular tests and replays did or did not establish.

- [project-layout.md](project-layout.md) — source layout, tick flow, local tooling, and replay workflow.
- [replay-evidence-contract.md](replay-evidence-contract.md) — versioned membership/action diagnostic contract, coverage rules, examples, and importer requirements for ADR 0004.
- [replay-analysis.md](replay-analysis.md) — deterministic read-only analyzer interface, report semantics, merging rules, and evidence limits for ADR 0004 M4.
- [replay-import-performance-2026-10-02.md](replay-import-performance-2026-10-02.md) — measured watcher startup, compact-manifest recovery, and the link to ADR 0006's durable-storage design.
- [replay-storage-v3-m1-2026-10-03.md](replay-storage-v3-m1-2026-10-03.md) — isolated synthetic storage core, bounded interfaces, crash/concurrency checks and streaming scale gate; no production integration or migration.
- [replay-storage-v3-m2a-plan-2026-10-04.md](replay-storage-v3-m2a-plan-2026-10-04.md) — proposed first M2 slice: one-response diagnostic output through a pinned synthetic v3 fixture; interfaces, compatibility boundaries and acceptance gates, not implementation or production qualification.
- [replay-storage-v3-m2a-2026-10-04.md](replay-storage-v3-m2a-2026-10-04.md) — implementation and synthetic qualification of the shared diagnostic consumer and explicit fixture reader; measured resource gates and remaining M2 limits.
- [replay-storage-v3-m2b-plan-2026-10-04.md](replay-storage-v3-m2b-plan-2026-10-04.md) — next bounded M2 slice: fixture-only streaming v2 selection for the shared diagnostic consumer; compatibility, file lifetime and proposed resource gates, with CLI activation deferred.
- [replay-storage-v3-m2b-2026-10-04.md](replay-storage-v3-m2b-2026-10-04.md) — bounded legacy diagnostic reader implementation and synthetic qualification; native selection/serialization, pinned-file lifetime and measured full-file scanning, without CLI activation.
- [replay-storage-v3-m2c-plan-2026-10-05.md](replay-storage-v3-m2c-plan-2026-10-05.md) — reviewed fixture-only asynchronous analyzer adapter contract and fixed-selection resource recipe.
- [replay-storage-v3-m2c-2026-10-05.md](replay-storage-v3-m2c-2026-10-05.md) — M2c implementation and qualification outcomes; independent v2 oracle, pinned analysis input, preserved CLI and remaining limitations.
- [replay-storage-v3-m2d-plan-2026-10-05.md](replay-storage-v3-m2d-plan-2026-10-05.md) — reviewed fixture-only score analyzer contract, coherent presence/selection snapshot and fixed resource recipe.
- [replay-storage-v3-m2d-2026-10-05.md](replay-storage-v3-m2d-2026-10-05.md) — local M2d implementation and measured qualification status; no production dispatch or broader M2 completion.
- [replay-storage-v3-m2e-plan-2026-10-06.md](replay-storage-v3-m2e-plan-2026-10-06.md) — reviewed combined log-and-score fixture adapter contract and deterministic resource recipe.
- [replay-storage-v3-m2e-2026-10-06.md](replay-storage-v3-m2e-2026-10-06.md) — M2e implementation, oracle provenance, measured qualification and retained development failures; no production activation.
- [replay-storage-v3-m2f-plan-2026-10-06.md](replay-storage-v3-m2f-plan-2026-10-06.md) — corrected fixture-only claim/examined contract; unchanged publication dependency.
- [replay-storage-v3-m2f-2026-10-06.md](replay-storage-v3-m2f-2026-10-06.md) — checkpoint implementation, independent v2 oracle, measurements and retained qualification history.
- [replay-catalog-c1-2026-10-04.md](replay-catalog-c1-2026-10-04.md) — isolated synthetic metadata catalog qualification: evidence provenance, analysis runs, immutable conclusion revisions, reviews and bounded resource gates; not production-integrated or migration-qualified. Contract: [ADR 0006 catalog C1](../decisions/0006-replay-storage-v3.md#separate-synthetic-milestone-c1-catalog-metadata-foundation).
- [replay-validation-2026-09-30.md](replay-validation-2026-09-30.md) — retained current-build replay, deterministic report, CPU/size measurements, and remaining limits that close ADR 0004 M5.
- [replay-score-production-validation-2026-10-02.md](replay-score-production-validation-2026-10-02.md) — exact retained-source selection, production scoring compatibility results, bounded output verification, and standalone reproduction procedure for ADR 0005.
- [screeps-arena-api.md](screeps-arena-api.md) — game API reference for objects, actions, and pathfinding.
- [screeps-squads-and-pairing.md](screeps-squads-and-pairing.md) — reference material for squad and pairing behavior.
- [supported-contest-objective-2026-10-16.md](supported-contest-objective-2026-10-16.md) — isolated-occupant stand-off design, subsequent inactive integration, shared validated travel and limited live observations.
- [squad-pair-experiment-2026-10-02.md](squad-pair-experiment-2026-10-02.md) — disabled one-pair movement policy, precedence, bounded recovery, local validation, and limited live opening screen.
- [combat-positioning-validation.md](combat-positioning-validation.md) — build-specific movement, healer, and flag-allocation validation, including unresolved live-evidence limits.
- [pure-healer-pressure-retreat-2026-10-16.md](pure-healer-pressure-retreat-2026-10-16.md) — bounded healer escape preserving useful healing bands; recorded exposure, generated checks and no survival claim.
- [healer-useful-closing-test-only-2026-10-17.md](healer-useful-closing-test-only-2026-10-17.md) — default-off runtime integration of the tested range-two close; prospective healing, convergence limits, movement priority and exact rollback contract.
- [adjacent-ranged-retreat-support-audit-2026-10-17.md](adjacent-ranged-retreat-support-audit-2026-10-17.md) — support-preserving adjacent escape preference with the original emergency fallback; frozen build awaiting manual observation.
- [precontact-ranged-kiting-test-only-2026-10-17.md](precontact-ranged-kiting-test-only-2026-10-17.md) — rejected test-only range-two proposal and retained support-loss/cycling counterexamples.
- [secondary-scoped-readiness-test-only-2026-10-17.md](secondary-scoped-readiness-test-only-2026-10-17.md) — retained original generated health-scope comparison and limitations.
- [secondary-scoped-readiness-integration-2026-10-17.md](secondary-scoped-readiness-integration-2026-10-17.md) — inactive promotion of the scoped health veto, with real-flow support cancellation and unchanged defence membership.
- [secondary-partial-travel-test-only-2026-10-17.md](secondary-partial-travel-test-only-2026-10-17.md) — retained original bounded16-subset generated comparison and adverse outcomes.
- [secondary-partial-travel-integration-2026-10-17.md](secondary-partial-travel-integration-2026-10-17.md) — inactive shared capture/contest subset selector, bounded step diagnostics, real-flow regressions and rollback.
- [development-publication-2026-10-17.md](development-publication-2026-10-17.md) — publication scope, reused validation, excluded local work and unchanged frozen gameplay identity.
- [scout-hold-experiment-2026-10-02.md](scout-hold-experiment-2026-10-02.md) — disabled-default scout fallback holding policy, local checks, live charcock screening, and remaining release gap.
- [historical-evidence-cycle-2026-10-02.md](historical-evidence-cycle-2026-10-02.md) — bounded cached cross-match index and no-change escort decision.
- [replay-review-2026-09-27.md](replay-review-2026-09-27.md) — dated analysis of map-linked replay snapshots and strategy proposals, with coverage caveats.

Update the relevant design document when implementation changes. Keep validation records tied to their builds, replays, and observed coverage; distinguish observations from inferred behavior and retain unresolved limitations. Record decisions in [decisions](../decisions/README.md) and update related [diagrams](../diagrams/README.md) when their workflows change.
