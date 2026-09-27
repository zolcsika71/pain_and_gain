Next task:

## Goal
Analyze user-supplied replay logs and map files, document evidence-based improvement proposals, and mark successfully analyzed log records `done`.

Model: GPT-5.6-Sol
Reasoning level: High

## Context
- The user manually supplies replay logs and map files in project-relative `replay_logs/`.
- Importer/review utility: `tools/replay-logs.js`.
- Manifest: `replay_logs/manifest.json`.
- Process log records marked `waiting`, grouping response chunks by replay.
- Resolve each replay's validated map through its manifest association.
- The existing `claim` → `examined` → `done` lifecycle deletes completed managed JSONL files and their manifest records while preserving maps and deduplication fingerprints. Consequently, `done` is a completion transition, not a retained record.

## Constraints
- Read repository instructions and inspect supported registration and review commands.
- Do not launch Arena, start a watcher, or scan the Arena cache. Use only the manually supplied files.
- Check supplied files against the manifest. For unregistered files, use supported local-file registration to validate maps, establish evidence-backed replay associations, and create `waiting` log records.
- Do not infer map associations from filenames or proximity alone. If registration is unsupported or evidence is insufficient, report the affected files as blocked; do not silently ignore them or mark them done.
- Analyze actual logs and validated maps; inspect relevant game code as needed.
- Separate observations from inferences and identify missing ticks or incomplete evidence.
- Save findings, supporting evidence, and recommendations in Markdown before completing reviews, because completion deletes source logs.
- Keep analysis findings out of the manifest. Remove existing analysis content while preserving operational metadata, review controls, map associations, and deduplication fingerprints.
- Use supported review commands. Mark records `examined` and then `done` only after analysis and documentation are complete. Leave incomplete or blocked reviews unfinished.
- Propose game-code changes without implementing them.
- Create a new ADR under `docs/decisions/` covering proposals, evidence, rationale, expected benefits, and verification methods. Accurately distinguish proposed, in-progress, and implemented work.
- Create or update PUML diagrams under `docs/diagrams/` when useful, and other Markdown documentation as needed.
- Preserve unrelated changes. Do not commit or push.
- If no supplied logs are available, report that result without inventing findings.

## Acceptance Criteria
- Account for all manually supplied logs and maps, identifying registered, already processed, and blocked files.
- Analyze all accessible `waiting` logs using their verified map associations.
- Support prioritized recommendations with replay IDs, tick references, and map or game-state evidence.
- Persist findings outside the manifest before transitioning analyzed records to `done`.
- Confirm successful completion and the resulting cleanup, while preserving maps, deduplication fingerprints, and unfinished logs.
- Report analyzed replays, status transitions, documentation changes, proposals, and remaining limitations.