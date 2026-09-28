# Architecture decisions

ADRs record the rationale and consequences of architectural choices and strategy proposals. Files use a numbered `NNNN-kebab-case.md` name, an `ADR NNNN` heading, and an explicit `Status:` line. The accepted records use Context, Decision, and Consequences sections; the proposal record uses Context, Proposed evaluation order, and Consequences.

- [0001-modular-arena-source.md](0001-modular-arena-source.md) — accepted choice of modular JavaScript Arena source without a build step.
- [0002-map-linked-replay-logs.md](0002-map-linked-replay-logs.md) — accepted design for validated map linkage and replay-log review cleanup.
- [0003-replay-informed-strategy-proposals.md](0003-replay-informed-strategy-proposals.md) — proposed strategy evaluations; some narrow rules are implemented, but strategic benefits remain unproven.
- [0004-replay-evidence-and-analysis-roadmap.md](0004-replay-evidence-and-analysis-roadmap.md) — accepted direction for replay evidence and deterministic analysis; milestones M1–M5 remain planned.

For a new ADR, use the next number, state its status explicitly, and document context, the decision or proposal, and consequences. Update status and implementation notes as work evolves; do not treat a proposal or an implemented experiment as a validated improvement. Link supporting [architecture and evidence](../architecture/README.md) and relevant [diagrams](../diagrams/README.md).
