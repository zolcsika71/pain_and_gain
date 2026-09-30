# Architecture and evidence

This folder holds descriptions of the bot and its integrations, plus validation and replay-review records. Design descriptions explain how the project works; evidence records describe what particular tests and replays did or did not establish.

- [project-layout.md](project-layout.md) — source layout, tick flow, local tooling, and replay workflow.
- [replay-evidence-contract.md](replay-evidence-contract.md) — versioned membership/action diagnostic contract, coverage rules, examples, and importer requirements for ADR 0004.
- [replay-analysis.md](replay-analysis.md) — deterministic read-only analyzer interface, report semantics, merging rules, and evidence limits for ADR 0004 M4.
- [screeps-arena-api.md](screeps-arena-api.md) — game API reference for objects, actions, and pathfinding.
- [screeps-squads-and-pairing.md](screeps-squads-and-pairing.md) — reference material for squad and pairing behavior.
- [combat-positioning-validation.md](combat-positioning-validation.md) — build-specific movement, healer, and flag-allocation validation, including unresolved live-evidence limits.
- [replay-review-2026-09-27.md](replay-review-2026-09-27.md) — dated analysis of map-linked replay snapshots and strategy proposals, with coverage caveats.

Update the relevant design document when implementation changes. Keep validation records tied to their builds, replays, and observed coverage; distinguish observations from inferred behavior and retain unresolved limitations. Record decisions in [decisions](../decisions/README.md) and update related [diagrams](../diagrams/README.md) when their workflows change.
