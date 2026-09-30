# Diagrams

This folder contains PlantUML (`.puml`) source diagrams for project workflows.

- [tick-flow.puml](tick-flow.puml) — Arena tick observation, objectives, movement, tactics, and logging; accompanies [project-layout.md](../architecture/project-layout.md).
- [replay-map-import.puml](replay-map-import.puml) — map validation, replay association, and log import; accompanies [project-layout.md](../architecture/project-layout.md) and [ADR 0002](../decisions/0002-map-linked-replay-logs.md).
- [replay-review-cleanup.puml](replay-review-cleanup.puml) — claim, examination, completion, and managed-log cleanup; accompanies [project-layout.md](../architecture/project-layout.md) and [ADR 0002](../decisions/0002-map-linked-replay-logs.md).
- [replay-analysis.puml](replay-analysis.puml) — deterministic read-only manifest, map, snapshot, and diagnostic analysis; accompanies [replay-analysis.md](../architecture/replay-analysis.md) and [ADR 0004](../decisions/0004-replay-evidence-and-analysis-roadmap.md).

Update the `.puml` source when a depicted workflow changes, and keep its linked [architecture documentation](../architecture/README.md) and [decisions](../decisions/README.md) consistent. The diagrams summarize flows; consult the linked documents for conditions and evidence limits.
