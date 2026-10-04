# Architecture decisions

ADRs record the rationale and consequences of architectural choices and strategy proposals. Files use a numbered `NNNN-kebab-case.md` name, an `ADR NNNN` heading, and an explicit `Status:` line. The accepted records use Context, Decision, and Consequences sections; the proposal record uses Context, Proposed evaluation order, and Consequences.

- [0001-modular-arena-source.md](0001-modular-arena-source.md) — accepted choice of modular JavaScript Arena source without a build step.
- [0002-map-linked-replay-logs.md](0002-map-linked-replay-logs.md) — accepted design for validated map linkage and replay-log review cleanup.
- [0003-replay-informed-strategy-proposals.md](0003-replay-informed-strategy-proposals.md) — proposed strategy evaluations; some narrow rules are implemented, but strategic benefits remain unproven.
- [0004-replay-evidence-and-analysis-roadmap.md](0004-replay-evidence-and-analysis-roadmap.md) — completed M1–M5 roadmap for replay evidence, deterministic analysis, and bounded live validation.
- [0005-replay-frame-scoring-evidence.md](0005-replay-frame-scoring-evidence.md) — accepted replay-score evidence contract with managed source retention and explicit-fingerprint read-only scoring analysis.
- [0006-replay-storage-v3.md](0006-replay-storage-v3.md) — bounded SQLite storage and provenance-aware replay catalog; synthetic M1 core and catalog C1 implemented, consumer integration and explicit migration pending.

For a new ADR, use the next number, state its status explicitly, and document context, the decision or proposal, and consequences. Update status and implementation notes as work evolves; do not treat a proposal or an implemented experiment as a validated improvement. Link supporting [architecture and evidence](../architecture/README.md) and relevant [diagrams](../diagrams/README.md).
