# ADR 0002: Gate replay logs on validated, replay-linked maps

Status: Accepted

## Context

Arena runtime code can observe terrain and objects but cannot write project files. It emits one pre-action `map-state` console entry per match and separate `game-state` entries. Cached replay-log responses may arrive in any order; a response with game-state entries can precede the map-bearing response. A filename or a map from another replay is insufficient evidence of the correct association.

## Decision

The standalone Node.js importer validates map schema, excluding creeps, and stores canonical map JSON in `replay_logs/`. Its SHA-256 checksum is the map ID. It registers a map as `validated` only after the saved file passes schema and checksum checks, reusing an identical registration instead of duplicating content. `manifest.json` version 2 records maps, replay-specific `active` map associations, and log records separately.

The importer creates JSONL only when the response's replay has an active association to a currently validated saved map. Earlier responses are deferred and retried when their map arrives. Each created log record explicitly names the map ID, checksum, and file; the original game-state JSONL lines are unchanged. New records are `waiting`. A Codex analysis task must claim and examine a log, then explicitly mark its review `done`; the importer never infers completion. Multiple reviewers must all complete. Cleanup checks the managed path and content hash, deletes the finished JSONL and its manifest record, and retains map files and registrations. The replay association retains retired response fingerprints solely to prevent unchanged cache data from reimporting.

## Consequences

- No map, invalid map, or absent/inactive replay association means no new JSONL; an unavailable map-bearing response can leave a log deferred indefinitely.
- Canonical content checksums make deduplication independent of capture date and object key order. A changed saved map fails validation rather than silently linking a log.
- Completed review details are intentionally removed with the log record; only deduplication fingerprints remain. Operational captures and the manifest stay local and ignored by Git.
- Empty version-1 manifests can migrate automatically. Nonempty version-1 manifests need deliberate migration; silently inventing map associations is unsafe.
