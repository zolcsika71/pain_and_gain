# Architecture decisions

ADRs record the rationale and consequences of architectural choices and strategy proposals. Files use a numbered `NNNN-kebab-case.md` name, an `ADR NNNN` heading, and an explicit `Status:` line. The accepted records use Context, Decision, and Consequences sections; the proposal record uses Context, Proposed evaluation order, and Consequences.

## When to read an ADR

Enter from the [task router](../architecture/README.md#task-router). Select the
applicable record/sections below; do not read every ADR for routine gameplay or
documentation work. Read the decision and consequences when changing its boundary,
and follow only relevant prerequisites. Existing records remain authoritative;
this table grants no evidence access or implementation/activation authority.

| Trigger | Required record | Conditional reading |
| --- | --- | --- |
| Source loading, module/import or runtime/tooling boundary | [ADR 0001](0001-modular-arena-source.md) | Project layout and tick flow for orchestration; not every tactics edit. |
| Managed map/log linkage, claims or cleanup | [ADR 0002](0002-map-linked-replay-logs.md) | README importer and matched diagrams before authorized capture access. |
| Reviewing original strategy rationale/proposal status | [ADR 0003](0003-replay-informed-strategy-proposals.md) | Current affected integration contract for what was actually implemented. Proposal order is not deployed policy or strategic validation. |
| Changing diagnostic schema, coverage or analyzer guarantees | [ADR 0004](0004-replay-evidence-and-analysis-roadmap.md) | Relevant evidence/analysis contract sections; completion covers its bounded milestones, not all future behavior. |
| Score evidence publication, selection or retirement | [ADR 0005](0005-replay-frame-scoring-evidence.md) | Retention contract/diagram and separately authorized exact sources. |
| Storage/catalog architecture or authority changes | [ADR 0006](0006-replay-storage-v3.md) | Only the affected authority/implementation/qualification contract; synthetic qualification is not production migration. |
| ADR/index prose-only maintenance | This index's conventions and the affected record's status/links | No unrelated ADR, gameplay history or payload read. |

Accepted architectural choices, proposed evaluations, disabled integrations and
historical qualification are different statuses. Follow the record's explicit
status and current-contract links; do not infer that a numbered ADR activated a
feature. Content-verified in-session reuse follows the task router's reuse rule.

## Records

- [0001-modular-arena-source.md](0001-modular-arena-source.md) — accepted choice of modular JavaScript Arena source without a build step.
- [0002-map-linked-replay-logs.md](0002-map-linked-replay-logs.md) — accepted design for validated map linkage and replay-log review cleanup.
- [0003-replay-informed-strategy-proposals.md](0003-replay-informed-strategy-proposals.md) — proposed strategy evaluations; some narrow rules are implemented, but strategic benefits remain unproven.
- [0004-replay-evidence-and-analysis-roadmap.md](0004-replay-evidence-and-analysis-roadmap.md) — completed M1–M5 roadmap for replay evidence, deterministic analysis, and bounded live validation.
- [0005-replay-frame-scoring-evidence.md](0005-replay-frame-scoring-evidence.md) — accepted replay-score evidence contract with managed source retention and explicit-fingerprint read-only scoring analysis.
- [0006-replay-storage-v3.md](0006-replay-storage-v3.md) — bounded SQLite storage and provenance-aware replay catalog; synthetic M1 core and catalog C1 implemented, consumer integration and explicit migration pending.

For a new ADR, use the next number, state its status explicitly, and document context, the decision or proposal, and consequences. Update status and implementation notes as work evolves; do not treat a proposal or an implemented experiment as a validated improvement. Link supporting [architecture and evidence](../architecture/README.md) and relevant [diagrams](../diagrams/README.md).
