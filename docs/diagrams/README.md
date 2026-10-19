# Diagrams

This folder contains PlantUML (`.puml`) source diagrams for project workflows.

## When to read a diagram

Enter from the [task router](../architecture/README.md#task-router). Diagrams are
conditional companions, not a mandatory scan for every task or a replacement
for the linked contracts. Read/update only the workflow being changed; purely
local arithmetic or prose edits do not require every diagram.

| Task boundary | Diagram and required companion | Conditional dependency |
| --- | --- | --- |
| Tick orchestration, movement ownership or action/logging order | [Tick flow](tick-flow.puml) and [project layout](../architecture/project-layout.md#project-layout) | Affected controller integration and evidence sections for exact priorities/bounds. |
| Map linkage/import publication | [Map import](replay-map-import.puml) and [ADR 0002](../decisions/0002-map-linked-replay-logs.md) | README importer commands before authorized data access. |
| Managed reviewer lifecycle or cleanup | [Review/cleanup](replay-review-cleanup.puml) and ADR 0002 above | README claim/examined/done procedure; no cleanup implied by reading it. |
| Score source publication/retirement | [Score retention](replay-score-retention.puml) and [retention contract](../architecture/replay-evidence-contract.md#replay-score-source-retention) | ADR 0005; selected source authority/residency requirements. |
| Analyzer input selection or evidence reconstruction | [Analysis](replay-analysis.puml) and [analyzer contract](../architecture/replay-analysis.md#interface-and-input-selection) | ADR 0004/evidence coverage sections for changed guarantees. |
| Diagram/index prose-only maintenance | Affected source/link and companion document | No replay, cache, map or historical fixture payload access. |

The current applicable contract controls details omitted by a diagram. Report
conflicts rather than adopting a diagram's shorthand as a new policy. Reuse an
already-read diagram only under the router's unchanged-content/session rule.

## Sources

- [tick-flow.puml](tick-flow.puml) — Arena tick observation, objectives, movement, tactics, and logging; accompanies [project-layout.md](../architecture/project-layout.md).
- [replay-map-import.puml](replay-map-import.puml) — map validation, replay association, and log import; accompanies [project-layout.md](../architecture/project-layout.md) and [ADR 0002](../decisions/0002-map-linked-replay-logs.md).
- [replay-review-cleanup.puml](replay-review-cleanup.puml) — claim, examination, completion, and managed-log cleanup; accompanies [project-layout.md](../architecture/project-layout.md) and [ADR 0002](../decisions/0002-map-linked-replay-logs.md).
- [replay-score-retention.puml](replay-score-retention.puml) — exact replay-score source publication, review, durable retirement, and map-independent tombstones; accompanies [the replay evidence contract](../architecture/replay-evidence-contract.md) and [ADR 0005](../decisions/0005-replay-frame-scoring-evidence.md).
- [replay-analysis.puml](replay-analysis.puml) — deterministic read-only manifest, map, snapshot, and diagnostic analysis; accompanies [replay-analysis.md](../architecture/replay-analysis.md) and [ADR 0004](../decisions/0004-replay-evidence-and-analysis-roadmap.md).

Update the `.puml` source when a depicted workflow changes, and keep its linked [architecture documentation](../architecture/README.md) and [decisions](../decisions/README.md) consistent. The diagrams summarize flows; consult the linked documents for conditions and evidence limits.
