# ADR 0002: Gate replay logs on validated, replay-linked maps

Status: Accepted

## Context

Arena runtime code can observe terrain and objects but cannot write project files. It emits one pre-action `map-state` console entry per match and separate `game-state` entries. Cached replay-log responses may arrive in any order; a response with game-state entries can precede the map-bearing response. A filename or a map from another replay is insufficient evidence of the correct association.

## Decision

The standalone Node.js importer validates map schema, excluding creeps, and stores canonical map JSON in `replay_logs/`. Its SHA-256 checksum is the map ID. It registers a map as `validated` only after the saved file passes schema and checksum checks, reusing an identical registration instead of duplicating content. `manifest.json` version 2 records maps, replay-specific `active` map associations, and log records separately.

Saved maps embed a top-level `checksum` equal to the manifest registration. Hashing excludes only that field and preserves the original normalization: recursively sorted object keys, original array order, and a trailing newline. Validation requires equality of the embedded, registered, and recalculated payload checksums. Thus adding metadata does not change map identity. Existing checksum-free maps require the explicit, locked `upgrade-map-checksums` command, which verifies the payload against its registered checksum before atomic replacement. It never changes a registration to accommodate a mismatch; failures remain untouched and are reported. Manifest version and operational state are unchanged.

The importer creates JSONL only when the response's replay has an active association to a currently validated saved map. Earlier responses are deferred and retried when their map arrives. Each created log record explicitly names the map ID, checksum, and file; the original game-state JSONL lines are unchanged. After transient `pending` publication, new records have status `claim`, meaning analysis is pending. Existing `waiting` records migrate to `claim` without losing operational metadata or review checkpoints. This status is distinct from a review task's ownership `claim` command. A Codex analysis task must claim and examine a log, save findings in Markdown, then explicitly mark its review `done`; the importer never infers completion. Multiple reviewers must all complete. Cleanup checks the managed path and content hash, deletes the finished JSONL and its manifest record, and retains map files and registrations. The replay association retains retired fingerprints solely to prevent unchanged content from reimporting. Explicit local JSONL registration requires an already validated active replay/map association and matching static flag data; filename proximity alone cannot establish provenance.

## Consequences

- No map, invalid map, or absent/inactive replay association means no new JSONL; an unavailable map-bearing response can leave a log deferred indefinitely.
- Canonical content checksums make deduplication independent of capture date and object key order. A changed saved map fails validation rather than silently linking a log.
- Completed review details are intentionally removed with the log record; only deduplication fingerprints remain. Operational captures and the manifest stay local and ignored by Git.
- Empty version-1 manifests can migrate automatically. Nonempty version-1 manifests need deliberate migration; silently inventing map associations is unsafe.
