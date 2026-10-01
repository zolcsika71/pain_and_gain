# ADR 0005: Retain replay-frame scoring evidence

Status: Accepted.

Decision approved: 2026-10-01 (Europe/Budapest).

Implementation: Milestone 1 completed 2026-10-01; Milestone 2 is not implemented.

Date: 2026-09-30 (Europe/Budapest)

## Context

The runtime and replay-log evidence defined by
[the replay evidence contract](../architecture/replay-evidence-contract.md)
record ScoreFlag ownership and `scorePerTick`, but do not expose either
player's cumulative score or the Arena display value named `Gained this tick`.
The installed Pain and Gain definitions likewise expose
`ScoreFlag.scorePerTick` and `MAX_SCORE_PER_TICK`, not player totals or gains.

A read-only investigation of replay `6abd7222b72ca0c20fa0bce2` found those
values in cached `/api/game/<replay-id>/replay/<tick>` response frames. This is
an observation of one Arena payload version, not a universal or documented API
guarantee. The related
[validation checkpoint](../architecture/healer-escort-injury-release-validation-2026-09-30.md#verified-score-evidence-in-this-replay)
records the observed fields, player mapping, tick alignment, and terminal
exception.

The existing importer supports only `/log/<tick>` cache responses and local
game-state JSONL. `register-local` rejects other formats. Unregistered reference
files are user-owned, but there is no supported command, manifest record, claim
lifecycle, safe cleanup rule, or dedicated Git exclusion for replay-frame
responses. Copying the payloads under a misleading existing filename pattern
would bypass those safeguards. Before Milestone 1, the selected replay's
scoring payloads therefore remained cache-only and were not durably retained.

At Milestone 1 import, the exact cache contained 17 replay-frame responses covering
`gameTime` 0–1,536 without gaps. Their decompressed response bodies total
33,520,398 bytes; the Chromium cache files total 466,387 bytes. A separate game
metadata cache entry is also present. These files may be evicted independently
of the repository, so implementing managed retention is the first milestone,
before score analysis support.

## Evidence boundaries

The accepted design keeps four layers distinct:

1. A **raw score source** is the exact decompressed HTTP response body plus its
   exact cache request identity. It is authoritative for what the response
   contained.
2. **Direct score observations** are validated values copied from one replay
   frame: cumulative `Score` and displayed `Gained this tick` for a player slot.
3. A **derived score change** is `score(t) - score(t - 1)` across two consecutive,
   compatible, nonconflicting frames. It is not the direct gain field.
4. **Cross-evidence analysis** associates frames with separately selected
   build-tagged logs, objective ownership, or escort events. It is derived and
   cannot establish causality or strategic benefit.

Replay frames do not embed the runtime build ID or Git commit SHA. A report may
associate score evidence with build-tagged log evidence only when replay
identity, player mapping, and tick alignment are independently established. It
must cite both source sets and keep the frame's embedded build provenance
`unknown`.

## Approved source contract

### Supported request sources

Version 1 supports two exact HTTPS request shapes extracted from a complete
Chromium simple-cache entry:

- `https://arena.screeps.com/api/game/<replay-id>/replay/<requested-game-time>`;
- `https://arena.screeps.com/api/game/<replay-id>` for player-slot mapping and
  match metadata.

The importer stores both the complete cache key, including its cache namespace,
and the extracted URL. Replay identity comes only from the request URL. A
timestamp, cache filename, list order, or payload object ID is not sufficient.

The retained raw content is the exact decompressed response body, before JSON
parse or canonicalization. The transport cache file is not the authoritative
artifact because its framing is browser-specific and may contain unrelated
transport metadata. Record these hashes separately:

- `cacheEntryFingerprint`: SHA-256 of the complete cache file, for transport
  provenance only;
- `responseFingerprint`: SHA-256 of the exact decompressed response body;
- `fingerprint`: SHA-256 over the domain string `replay-score-source-v1`, one
  NUL byte, the exact cache key, one NUL byte, and the response body bytes.

Including the request key in `fingerprint` prevents two different requests with
identical bodies from losing their separate source identities. Replay-wide
merging still deduplicates exact frame content and retains every source
reference.

### Managed source record

Manifest version 2 gains optional top-level `scoreRecords` and
`retiredScoreSources` arrays. Absence of `scoreRecords` means score-source
retention is unsupported, not empty coverage. Absence of
`retiredScoreSources` means no score-source retirement tombstones are recorded.
These collections are preferred to inserting replay frames into existing log
`records`, which would falsely imply game-state/diagnostic semantics. Current
tools accept and preserve additional manifest properties, so optional
collections avoid a breaking manifest-version migration. That is a statement
about the tools at the design checkpoint, not a guarantee about every
older or future binary. Implementation requires explicit tests proving that
every supported manifest writer preserves both collections and every field in
their entries.

Each score record has:

| Field | Rule |
| --- | --- |
| `formatVersion` | Exactly `1`. |
| `kind` | `replay-frames` or `game-metadata`. |
| `replayId` | Exact 24-character ID parsed from the request URL. |
| `requestedGameTime` | Nonnegative safe integer for frame requests; `null` for metadata. |
| `sourceEntry` | Original cache path as provenance; not required for later analysis. |
| `sourceKey` / `requestUrl` | Exact cache key and extracted HTTPS URL. |
| `cacheEntryFingerprint` | SHA-256 of the complete cache entry. |
| `responseFingerprint` | SHA-256 of exact decompressed response bytes. |
| `fingerprint` | Domain- and request-qualified record identity defined above. |
| `outputPath` | Safe project-relative managed raw-response filename. |
| `outputFingerprint` | SHA-256 of saved bytes; equal to `responseFingerprint`. |
| `embeddedBuildId` | Always `null` in version 1; never copied from logs or local source. |
| `mapId` | Validated active replay map ID when available, otherwise `null`; it is an association, not embedded frame provenance. |
| `coverage` | Derived per-source, per-local-segment summary with status `complete` or `partial`; `null` when frame structure is unavailable or for metadata. |
| `validation` | Fixed layered transport, JSON, metadata, frame, UI, and item summaries plus deterministic issue codes. |
| `importedAt` | Operational timestamp; excluded from deterministic reports. |
| `status` / `reviews` | `pending` → `claim` publication, `done` review completion, recoverable `retiring` cleanup intent, and per-task review checkpoints. |

Example managed record; hashes and identifiers are illustrative:

```json
{
  "formatVersion": 1,
  "kind": "replay-frames",
  "replayId": "aaaaaaaaaaaaaaaaaaaaaaaa",
  "requestedGameTime": 100,
  "sourceEntry": "/local/cache/0123456789abcdef_0",
  "sourceKey": "1/0/https://arena.screeps.com/api/game/aaaaaaaaaaaaaaaaaaaaaaaa/replay/100",
  "requestUrl": "https://arena.screeps.com/api/game/aaaaaaaaaaaaaaaaaaaaaaaa/replay/100",
  "cacheEntryFingerprint": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "responseFingerprint": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "fingerprint": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "outputPath": "replay-score-source-aaaaaaaaaaaaaaaaaaaaaaaa-dddddddddddd.response",
  "outputFingerprint": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "embeddedBuildId": null,
  "mapId": null,
  "coverage": {
    "status": "complete",
    "totalFrames": 1,
    "validFrames": 1,
    "invalidFrames": 0,
    "localSegments": [
      {
        "firstFrameIndex": 0,
        "lastFrameIndex": 0,
        "firstGameTime": 100,
        "lastGameTime": 100,
        "duplicates": [],
        "gaps": []
      }
    ],
    "uiVersions": [1]
  },
  "validation": {
    "transport": "complete",
    "json": "valid",
    "metadata": "not-applicable",
    "frames": "valid",
    "ui": "supported",
    "items": {
      "status": "valid",
      "counts": {
        "valid": 4,
        "missing": 0,
        "mislabeled": 0,
        "invalid": 0,
        "conflicting": 0,
        "unassessed": 0
      },
      "blockedBy": [],
      "assessments": [
        {
          "frameIndex": 0,
          "gameTime": 100,
          "slot": "player1",
          "itemId": "player1-score",
          "measurement": "cumulativeScore",
          "status": "valid",
          "occurrenceIndexes": [0],
          "value": 500,
          "reason": null
        },
        {
          "frameIndex": 0,
          "gameTime": 100,
          "slot": "player1",
          "itemId": "player1-gain",
          "measurement": "displayedGain",
          "status": "valid",
          "occurrenceIndexes": [1],
          "value": 5,
          "reason": null
        },
        {
          "frameIndex": 0,
          "gameTime": 100,
          "slot": "player2",
          "itemId": "player2-score",
          "measurement": "cumulativeScore",
          "status": "valid",
          "occurrenceIndexes": [2],
          "value": 400,
          "reason": null
        },
        {
          "frameIndex": 0,
          "gameTime": 100,
          "slot": "player2",
          "itemId": "player2-gain",
          "measurement": "displayedGain",
          "status": "valid",
          "occurrenceIndexes": [3],
          "value": 3,
          "reason": null
        }
      ]
    },
    "issues": []
  },
  "importedAt": "2026-09-30T00:00:00.000Z",
  "status": "claim",
  "reviews": {}
}
```

`retiredScoreSources` is independent of `replays` and map associations. Each
tombstone has exactly this identity:

```json
{
  "sourceType": "replay-score-source",
  "replayId": "aaaaaaaaaaaaaaaaaaaaaaaa",
  "fingerprint": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
}
```

The tuple `(sourceType, replayId, fingerprint)` is unique. It is sufficient for
deduplication because the fingerprint already commits to the exact request key
and response body. A score import checks this collection before creating a
record and returns `deduplicated` for an exact retired identity. It must not
create a replay/map association to store a tombstone. Tombstones contain no
map, build, or review claim and are never inferred from log retirement. Repeated
retirement or cleanup retries preserve one canonical entry.

### Manifest compatibility and writer obligations

Current manifest readers require version 2 plus `maps`, `replays`, and
`records`, but retain unknown top-level properties in memory and serialize the
same object on writes. Current log-only tools therefore can preserve the new
optional collections without understanding them. They do not display, claim,
analyze, reconcile, retire, or clean score records. Operators must use the
score-specific commands for those operations. In that limited sense, an older
tool may preserve score data while providing no score lifecycle visibility or
management; preservation must be verified for each supported version rather
than assumed from successful loading.

Implementation tests must prove structural preservation of `scoreRecords`,
`retiredScoreSources`, nested validation/coverage, and reviews through every
current manifest path: cache log import, local JSONL registration, map creation
and replay association, status migration, claim/examined/complete/done, log
cleanup, explicit reconciliation, and the `list`, `scan`, and `watch` entry
paths that invoke it. Map-checksum upgrade and map-list paths must either remain
manifest-read-only or preserve the same fields if they begin writing the
manifest. Analyzer success and failure paths remain entirely read-only. A
future writer that reconstructs a manifest from known fields instead of
round-tripping unknown fields is incompatible until updated and tested.
Score-aware readers must also accept the compact gap-range representation
defined below. Older log-only readers remain compatible because they preserve
the optional collections without interpreting their nested fields.

### Layered validation and coverage

Retention and score validity are separate. A source is eligible for publication
only after version-5 stream boundaries, EOF records, CRC-32 fields, any present
key SHA-256, and content decoding prove that its decompressed response body is
complete. The stream framing is the authoritative compressed-body length; an
HTTP `content-length` header is optional, but when present it must match that
length. A complete body is retained even when later validation fails.
Successful retention proves only the exact bytes and request identity; it does
not prove valid scoring content or complete frame coverage.

Every stored `validation` object has `transport`, `json`, `metadata`, `frames`,
`ui`, `items`, and `issues`. Stages irrelevant to the source kind are
`not-applicable`; stages blocked by an earlier failure are `unavailable` rather
than failed. `metadata` uses `valid`, `partial`, `malformed`, `unavailable`, or
`not-applicable`; `frames` uses the same vocabulary; and `ui` uses `supported`,
`partial`, `unsupported`, `unavailable`, or `not-applicable`. Validation
proceeds without suppressing independent valid evidence:

1. `transport` is `complete` for every published source. Incomplete or
   undecodable transport remains unpublished and retryable.
2. `json` is `valid` or `malformed`. Malformed JSON has `coverage: null`, all
   applicable later stages `unavailable`, and no score observations or mapping.
3. A game-metadata source validates its JSON object and mapping fields as
   `metadata: valid`, `partial`, or `malformed`; frame and UI stages are
   `not-applicable`, `items.status` is `not-applicable`, and `coverage` is
   `null`. Invalid metadata fields do not create or change a player mapping. A
   replay-frame source always has `metadata: not-applicable`. For metadata,
   `items` retains the same four-field object shape with six zero counts and
   empty `blockedBy` and `assessments` arrays. Version 1 calls mapping structure
   valid only when every present supported field (`players`, `users`, or
   `game.players`) is the same two-element array of nonempty string identities.
   Object entries, empty identities, unsupported shapes, and conflicting
   supported fields remain partial. This validates retained structure only; it
   does not map either slot to the current user.
4. `frames` is `valid`, `partial`, or `malformed`. A non-array replay body has
   `coverage: null`. In an array, each element is validated independently; a
   malformed element is counted as invalid but does not discard other valid
   frames. It creates a continuity boundary because its `gameTime` and contents
   cannot be trusted. Partial coverage reports total, valid, and invalid frame
   counts and derives range, duplicates, and gaps separately for each valid
   local segment. It never calls that source range complete.
5. `ui` is `supported`, `partial`, `unsupported`, or `unavailable`, summarized
   from valid frames. An unknown `ui.version` makes score interpretation for
   that frame unsupported without invalidating its structural `gameTime`.
6. `items` stores the deterministic per-frame, per-slot, per-item summary
   defined below. Missing, mislabeled, noninteger, or conflicting items make
   only their dependent measurement unavailable or conflicting; unrelated valid
   slot/item observations survive.

For a replay-frame source, `validation.items` has exactly these fields:

| Field | Rule |
| --- | --- |
| `status` | `valid`, `partial`, `invalid`, `unavailable`, or `not-applicable`. |
| `counts` | Exact counts for `valid`, `missing`, `mislabeled`, `invalid`, `conflicting`, and `unassessed`. |
| `blockedBy` | Sorted unique upstream reason codes that prevented item assessment; empty when none did. |
| `assessments` | One deterministic entry for each expected item target in each parsed frame-array element. |

The expected target order is `player1-score`, `player1-gain`, `player2-score`,
then `player2-gain`. Assessments are sorted first by original frame-array index
and then by that target order. Each assessment has `frameIndex`, `gameTime`,
`slot`, `itemId`, `measurement`, `status`, `occurrenceIndexes`, `value`, and
`reason`. `gameTime` is `null` when frame validation cannot trust it.
`occurrenceIndexes` contains the sorted zero-based positions of every matching
ID in the original `ui.items` array. `value` is the common finite safe integer
only for `valid`, otherwise `null`. `reason` is non-null only for `unassessed`;
`missing` and `unassessed` assessments have empty occurrence indexes.

Assessment status is determined in this order:

1. If frame or UI validation prevents inspection, use `unassessed`
   with reason `frame-malformed`, `ui-unavailable`, or `ui-unsupported`. This is
   not an item failure and does not suppress assessments from other frames.
2. If a supported, inspectable `ui.items` array has no matching ID, use
   `missing`.
3. If matching occurrences do not all have identical labels and values, use
   `conflicting` and retain all occurrence indexes.
4. Otherwise, use `mislabeled` when the common label is not the required label.
   This is the primary status even when the common value is also not a finite
   safe integer. Use `invalid` only when the common label is correct and the
   common value is not a finite safe integer. The diagnostic rules below still
   preserve every applicable label and value defect.
5. Otherwise use `valid`. Exact duplicate occurrences remain one valid
   measurement with every occurrence index retained.

The aggregate is `valid` only when the nonempty assessment list is entirely
valid; `partial` when at least one assessment is valid and at least one is not;
`invalid` when there is at least one assessed failure and no valid assessment;
and `unavailable` when there is no assessed result because every target is
unassessed or an upstream JSON/frame failure left no target to enumerate.
`not-applicable` is reserved for metadata sources. Counts sum to the assessment
length. A response-wide blocker such as `json-malformed`, `frames-malformed`,
or `no-frames` appears in `blockedBy` even when `assessments` is empty; per-frame
blockers appear both there and in the affected assessment reasons.
These aggregate statuses describe item-observation availability; `invalid`
does not invalidate a structurally valid frame or prevent raw retention.

Assessed failures use stable issue codes `item-missing`,
`item-label-mismatch`, `item-value-invalid`, and `item-conflict`. Within the item
stage of `validation.issues`, issues follow assessment order; multiple issues
for one assessment use the code order just listed. Emit at most one issue per
applicable defect per assessment, not per occurrence, and include that
assessment's complete sorted `occurrenceIndexes` in each item issue. Thus a
nonconflicting target with both a wrong common label and an invalid common value
has primary status `mislabeled` and emits `item-label-mismatch` followed by
`item-value-invalid`. Identical duplicate occurrences retain all their indexes
in one assessment and the same single ordered pair of issues; they do not become
`conflicting` and do not multiply issue entries. A higher-priority conflict
emits only `item-conflict`, and an upstream-blocked `unassessed` target cites the
existing JSON, frame, or UI issue instead of inventing an item failure. Only a
`valid` assessment produces a direct score observation, so every assessed
failure, including the combined label/value case, contributes none. Unrelated
valid assessments still produce their observations.

For example, one `player1-score` occurrence at index 0 with a wrong label and a
non-safe-integer value produces a `mislabeled` assessment with
`occurrenceIndexes: [0]`, `value: null`, and the two ordered issues above. Two
identical such occurrences at indexes 0 and 2 produce the same status and issue
pair with `occurrenceIndexes: [0, 2]`. If the other three expected targets are
valid, the item aggregate is `partial` and their three direct observations
survive.

Coverage status `complete` means every frame element in that one response was
structurally valid. It never means the response or selected sources cover the
whole replay. Missing requested responses, source gaps, and unavailable
terminal frames remain separate unknowns.

Each local segment stores `gaps` as deterministically ordered inclusive ranges
`{"firstGameTime": n, "lastGameTime": m}`. Ranges are derived only from adjacent
observed times, so calculation and storage are bounded by the number of parsed
frames rather than the numeric span. Empty gaps remain `[]`. Read-time summary
comparison normalizes the earlier numeric gap-array representation into these
ranges in work proportional to the stored array, allowing existing records to
remain verifiable without rewriting production evidence. New or recomputed
summaries always use compact ranges; older score-aware binaries that assume
individual integers cannot interpret nonempty new gap summaries and must be
upgraded before managing them.

Every issue has a stable code and the narrowest available source reference:
response fingerprint and, when known, array index, `gameTime`, slot, and item
ID. Stored `coverage` and `validation` are derived summaries. Raw response bytes
are authoritative. Analysis must recompute both summaries, including assessment
order, counts, blockers, occurrence indexes, values, reasons, statuses, item
issue ordering, and per-assessment issue deduplication, and require exact
structural equality with the persisted summaries before using them. The sole
representation compatibility rule is that a stored legacy numeric `gaps` array
is deterministically normalized to compact ranges before this comparison; no
other persisted field is normalized.

A structurally valid version-1 replay response is a JSON array of frame objects.
Every usable frame has one nonnegative safe-integer `gameTime`. Array order is
retained as source evidence.

### Sequence segments, duplicates, and conflicts

The analyzer initially assumes no epoch identity beyond what the selected
source bytes establish. Within one response array, a strict decrease in
`gameTime` proves that one monotonic sequence cannot span both sides in that
source, so the analyzer creates a local segment boundary. It does not by itself
prove a match reset or epoch. Equal adjacent times are duplicate/conflict
candidates, not proof of a restart. Each local segment receives the
deterministic identifier SHA-256 over the domain string
`replay-score-local-segment-v1`, one NUL byte, the source fingerprint, one NUL
byte, and the decimal first-frame array index. Cache timestamps, filenames,
import order, and requested-response order never establish a segment or epoch.

Local segments from separate sources are candidate peers only when they share
at least one exact canonical overlapping frame. The analyzer constructs the
complete undirected candidate-overlap graph from all selected sources before
forming any group. Vertices and edges are ordered by local segment ID and
canonical overlap identity, never by cache timestamp, filename, import order,
or requested-response order. The canonical overlap identity is SHA-256 over the
domain string `replay-score-overlap-v1`, one NUL byte, and the canonical frame
JSON bytes.

An entire connected component may become one established group only when its
transitive closure contains no proven boundary or ordering contradiction. In
particular, a component is rejected if it contains two distinct local segments
from the same source, because the source boundary proves they cannot be one
monotonic sequence. The component also forms a directed order graph from the
relative array order of its canonical overlap identities; a cycle is a proven
ordering contradiction and rejects the component. A source contributes a
strict order edge only when every occurrence of one identity precedes every
occurrence of the other, so duplicate-position ambiguity cannot invent an
order. This group-wide invariant is checked after all exact overlap edges are
known; pairwise-compatible unions cannot bypass it.

When a component violates the invariant, the analyzer does not select a
maximal compatible subset or an epoch. It leaves every constituent local
segment separate, retains every candidate overlap reference, and reports one
deterministically ordered `ambiguous-overlap-bridge` relationship for the
component. The result is invariant under source enumeration and import order.
No score delta, player mapping, tick alignment, or event association may use a
rejected component to cross between its local segments.

Only a component that passes the invariant is grouped transitively, with every
constituent local segment ID retained. Numerically adjacent but nonoverlapping
source ranges are not grouped merely because they share a replay ID or request
pattern; derived changes at that source boundary remain unknown. Within an
established group, exact canonical overlaps are deduplicated with every source
reference. Different canonical frames at the same `gameTime` are conflicts
only when the evidence establishes that they belong to the same accepted group.
A strict decrease observed within one source proves separate local segments, so
repeated times across that boundary are not conflicts merely because their
numbers match.

Repeated `gameTime` values from different sources are ambiguous when no source
proves their order or common segment. The analyzer retains per-source direct
observations and reports `ambiguous-segment`; it neither merges them nor chooses
between overlap, restart, or conflict interpretations. Segment equivalence may
be established only by a separately validated explicit payload/session
identifier or evidence spanning the boundary. Version 1 recognizes no such
payload identifier by default.

Derived score changes require consecutive `gameTime` values within one local
segment or one accepted group, with valid nonconflicting observations. No
delta, player mapping, tick alignment, or event association crosses a proven
boundary, a rejected candidate component, or an ambiguous segment relationship.
A score decrease ends derived continuity but does not by itself prove a new
epoch or authorize an inferred reset value.

Scoring support currently recognizes only `ui.version: 1`. Within `ui.items`,
the item IDs are authoritative keys:

- `player1-score` and `player2-score`, named `Score`;
- `player1-gain` and `player2-gain`, named `Gained this tick`.

Each value must be a finite safe integer. The source retains the original value
and label exactly; the normalized observations use these names:

| Measurement | Meaning |
| --- | --- |
| `cumulativeScore` | Direct `*-score` value in this frame. |
| `displayedGain` | Direct `*-gain` value in this frame; not renamed to awarded gain. |
| `derivedScoreChange` | Difference between consecutive compatible cumulative scores. |

Missing items are unavailable, not zero. Duplicate item IDs with identical
values retain source references; different values conflict. Frame 0 or any
other initial observation does not acquire an implied score or gain. A gap
never permits a multi-tick delta to be divided into per-tick gains.

The direct `displayedGain` and `derivedScoreChange` may legitimately differ.
The observed selected replay ends with unchanged cumulative scores and nonzero
displayed gains. The analyzer reports that difference; it is neither a schema
failure nor permission to call the displayed value an awarded terminal delta.

## Player identity and provenance

`player1` and `player2` are payload slots, not aliases for us and opponent. The
analyzer reports slot-level values even when ownership mapping is unknown.

An ours/opponent mapping requires a deterministic evidence chain, such as:

1. exact game metadata links an authenticated/current user or code entry to a
   game slot;
2. replay objects link `player1`/`player2` to stable object IDs; and
3. selected compatible runtime snapshots identify the same IDs with `my`.

The report records `ours-player1`, `ours-player2`, `unknown`, or `conflicting`,
and cites every dependency. Metadata alone may be sufficient only if its field
semantics are validated for that payload version. UI placement, player zero,
winner index, list order, and the left-hand display are never assumptions.

Reversed mapping is fully supported: score and gain values stay attached to
their original payload slot, while derived `ours` and `opponent` labels follow
the verified mapping. Missing or conflicting mapping leaves slot-level values
available and ours/opponent differences unknown.

## Tick alignment and build association

Alignment is replay-specific derived evidence. At minimum, compare stable object
IDs and fields present in both sources, such as position, health, fatigue, flag
ownership, and `scorePerTick`, over more than one tick. Report the supported
offset, compared range, comparison counts, and conflicts. The selected replay
supports `runtime snapshot tick t = replay frame gameTime t - 1`; another replay
must not inherit that offset.

When zero or multiple offsets fit, when compared fields conflict, or when gaps
cross the needed interval, alignment is unknown. Score observations remain
available at frame time, but objective/escort association and runtime-tick
labels depending on the offset remain unknown.

An analyzer invocation selects log fingerprints and score fingerprints
separately. A valid association finding may state that the selected logs carry
one build ID and align with selected score frames. It must not write that build
ID into the score record or imply that the frames attest to a Git commit. A
valid nonlocal log build is not automatically a score failure; incompatible log
builds make only cross-build conclusions unknown.

## Publication and review lifecycle

The implementation reuses the manifest lock and review semantics but
uses source-type-specific commands so a score fingerprint cannot be confused
with a log fingerprint. Every score mutation holds that lock and selects one
explicit `(replayId, fingerprint)` or one explicitly supplied cache file. Score
operations never invoke log reconciliation or iterate unrelated score records.

1. Parse one explicitly supplied cache file; validate its exact request key,
   complete version-5 stream framing and integrity fields, exactly one coherent
   HTTP status/header block, any present HTTP content length, and decoding.
2. Compute all hashes before changing repository state.
3. Under the manifest lock, reject unsafe paths and conflicting identities,
   then append a `pending` score record and atomically save the manifest.
4. Write the exact response body to a same-directory temporary file opened with
   exclusive creation, flush it, and publish it to the final safe path without
   replacement. Add the root-anchored ignore rule
   `/replay_logs/replay-score-source-*.response` in the same implementation.
5. Verify the final regular non-symlink file hash, change the record to `claim`,
   and atomically save the manifest.

An identical request/body import is idempotent and verifies the managed file.
Changed content for the same request receives a distinct fingerprint and record;
the analyzer later reports overlapping conflicts. A retry recovers a `pending`
record by publishing or verifying the expected bytes. If neither the managed
file nor original cache source remains, the record stays pending and analysis is
unknown. An orphan file is adopted only when a subsequently parsed exact request
and body reproduce its filename and hash; otherwise it stays unmanaged.

Output naming must not rely on a truncated fingerprint as a unique identity.
The allocator may try a readable truncated name first, but collision recovery
uses the full fingerprint and then deterministic numeric suffixes. It never
replaces an occupied path. A matching pending record, not filename resemblance,
authorizes recovery.
Every current score record must own exactly one output path, and that filename
must contain its replay ID plus its truncated or full fingerprint according to
the allocator rules. Verification, recovery, and cleanup reject mismatched or
multiply owned paths before changing lifecycle state or artifacts.

Score review commands apply the existing rules:

- `score-claim` creates one task review without changing public `claim` status;
- `score-examined` records examination only for an existing owner;
- `score-done` records completion and changes the record to `done` only when all
  owners have examined and completed it; it never deletes evidence;
- `score-cleanup <replay-id> <fingerprint>` is the only retirement operation.
  It is separately authorized, exact-record scoped, and retry-safe.

Cleanup uses `done` and `retiring` as durable recovery states:

1. If the top-level tombstone exists and no current record exists, return
   success without changing anything. A tombstone plus a current record is an
   integrity conflict and cleanup refuses it.
2. Require all reviews completed and status `done` or `retiring`. For `done`,
   require the managed file to be a safe regular non-symlink with the recorded
   hash. A missing file at this point is unexpected evidence loss: refuse
   cleanup so an exact re-import can restore it.
3. Atomically save status `retiring` before deletion. This persisted intent is
   the only condition under which a missing managed file can mean interrupted
   authorized cleanup.
4. In `retiring`, verify and delete the managed file if present. A changed,
   unsafe, or undeletable file leaves the record `retiring`, publishes no
   tombstone, and reports failure. If the file is absent, continue because the
   persisted intent proves deletion may already have succeeded.
5. In one atomic manifest save, add the canonical top-level
   `retiredScoreSources` tombstone and remove the current score record. Maps,
   replay/map associations, logs, reports, and unrelated score records remain
   unchanged.

An interruption after `done`, after `retiring`, after deletion, or after the
final manifest save is recovered by repeating the same exact `score-cleanup`
command. Pending publication is recovered only by repeating explicit import of
the same cache source or a score-specific exact-record recovery command supplied
with those source bytes. An exact re-import may restore a missing verified file
for an existing `pending` or `done` record without changing reviews; it must
refuse changed bytes. Imports encountering `retiring` neither recreate the file
nor alter the record and direct the operator to exact cleanup recovery. There
is no global score reconciliation command in
milestone 1, and existing `list`, `scan`, `watch`, or log reconciliation must
not recover or clean score records as a side effect.

No time limit, process exit, analyzer run, or completed log review implies score
completion. Maps, log records, reports, and unrelated score records are never
deleted with a score source. A retained review stays claimed/examined with
`completedAt: null`, matching current evidence-retention practice. Exact cleanup
is implemented but was not authorized or executed for the retained selected
replay sources during Milestone 1.

## Analyzer report contract

The read-only analyzer gains an explicit `scoreFingerprints` selection. It reads
raw response bytes directly, verifies every manifest and output hash, reparses
the source, and compares stored summaries with recomputed coverage. Existing
log-only invocation and output remain compatible.

For each slot and mapped player, report:

- direct cumulative score by `gameTime`;
- direct displayed gain by `gameTime`;
- derived score change only for consecutive compatible frames;
- established local segment identifiers and any ambiguous segment relationship;
- `scoreDifference = oursScore - opponentScore` when mapping is valid;
- `displayedGainDifference = oursDisplayedGain - opponentDisplayedGain`;
- direct-versus-derived agreement as `equal`, `different`, or `unknown`;
- temporal alignment with ScoreFlag ownership/rates and escort episodes when
  alignment and the selected log evidence are valid.

Findings use `pass`, `fail`, or `unknown` consistently with the existing
analyzer. Integrity contradictions may fail. Missing, unsupported, malformed,
conflicting, unmapped, unaligned, or nonconsecutive dependencies yield unknown
for dependent measurements. A displayed gain, score lead, flag capture, escort
episode, or temporal correlation never proves causality, healing effectiveness,
prevented damage, strategic benefit, or improved win rate.

## Examples

Direct observations and a derived change remain separate:

```json
{
  "replayId": "aaaaaaaaaaaaaaaaaaaaaaaa",
  "gameTime": 42,
  "segmentIds": ["eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
  "slot": "player1",
  "player": "ours",
  "cumulativeScore": 105,
  "displayedGain": 5,
  "derivedScoreChange": 5,
  "gainComparison": "equal"
}
```

A terminal-style frame may validly differ:

```json
{
  "replayId": "aaaaaaaaaaaaaaaaaaaaaaaa",
  "gameTime": 43,
  "segmentIds": ["eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
  "slot": "player1",
  "player": "ours",
  "cumulativeScore": 105,
  "displayedGain": 5,
  "derivedScoreChange": 0,
  "gainComparison": "different"
}
```

If frame 42 is absent, frame 43 retains its two direct values but
`derivedScoreChange` and `gainComparison` are `null`/`unknown`; no value is
interpolated.

A complete body with malformed JSON is retained without invented coverage:

```json
{
  "coverage": null,
  "validation": {
    "transport": "complete",
    "json": "malformed",
    "metadata": "not-applicable",
    "frames": "unavailable",
    "ui": "unavailable",
    "items": {
      "status": "unavailable",
      "counts": {
        "valid": 0,
        "missing": 0,
        "mislabeled": 0,
        "invalid": 0,
        "conflicting": 0,
        "unassessed": 0
      },
      "blockedBy": ["json-malformed"],
      "assessments": []
    },
    "issues": [
      {
        "code": "json-malformed",
        "fingerprint": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      }
    ]
  }
}
```

If one exact source contains `gameTime` values `98, 99, 0, 1`, array order
proves two local segments beginning at indexes 0 and 2. A score change from 99
to 0 is unknown. If separate sources contain different frames for `gameTime`
1 without evidence that their segments are equivalent or ordered, both direct
observations remain source-qualified and their relationship is
`ambiguous-segment`, not silently a conflict or a restart.

For the one-to-many bridge case, suppose source A contains two local segments
separated by a strict decrease and the same exact canonical frame `F` at
`gameTime` 5 occurs once in each segment. If source B also contains `F`, its two
pairwise exact overlaps create one candidate component containing both proven
source-A segments. The group-wide invariant rejects that entire component and
reports `ambiguous-overlap-bridge`; it does not use source B to reunite the
segments or choose either occurrence of `F`. Permuting the selected-source
order produces the same sorted relationship and leaves deltas, tick alignment,
and event associations across all three local segments unknown.

## Synthetic test matrix

| Fixture | Required result |
| --- | --- |
| Valid metadata plus frames 0–2 | Frame 0 score absence is unknown; frames 1–2 retain direct values. |
| Consecutive scores 10 → 15, displayed gain 5 | Derived change 5 and comparison `equal`. |
| Terminal scores 15 → 15, displayed gain 5 | Derived change 0 and comparison `different`, not failure. |
| Gap from gameTime 10 to 12 | Direct values retained; derived change at 12 unknown. |
| Duplicate identical frame | One canonical observation with all source references. |
| Different same-time frames in one established segment | Integrity conflict; dependent score/alignment findings unknown. |
| One source ordered as 98, 99, 0, 1 | Two deterministic source-qualified local segments; no delta across the source-order boundary and no inferred reset. |
| Same `gameTime` in two proven local segments | Both observations survive without being classified as conflicting overlap. |
| A third source exactly overlaps one frame present in two same-source segments separated by a proven boundary | Reject the whole candidate component as `ambiguous-overlap-bridge`; keep all local segments separate and withhold cross-segment delta/alignment/event conclusions. |
| Every permutation of the one-to-many bridge's selected-source order | Byte-identical sorted grouping relationships and findings; no epoch or compatible subset selected from input order. |
| A candidate component whose source-derived overlap-order graph contains a cycle | Reject the whole component as `ambiguous-overlap-bridge`; retain its candidate edges and derive nothing across its local segments. |
| Different same-time frames from sources with no established segment relationship | `ambiguous-segment`; retain source-qualified direct values and withhold merge/delta/alignment. |
| Numerically adjacent but nonoverlapping source ranges | Keep separate local segments; no cross-source boundary delta without supported equivalence. |
| Import order or cache timestamps imply an apparent restart | They establish no segment identity or ordering. |
| Reversed mapping: ours is `player2` | Ours/opponent differences use player2/player1 respectively. |
| Missing or conflicting player mapping | Slot reports remain; ours/opponent reports unknown. |
| Incomplete transport, length mismatch, or undecodable body | No managed source is published; exact source remains retryable. |
| HTTP error status containing misleading `HTTP/1.1 200` text, conflicting encodings, or conflicting lengths | Transport is rejected as unsupported or incomplete; no source is published. |
| Complete transport with malformed JSON | Raw body retained, `coverage: null`, item status `unavailable`, zero assessments, blocker `json-malformed`, and no score observations. |
| Valid JSON with non-array replay body | Raw body retained, frame validation malformed, `coverage: null`, item status `unavailable`, and blocker `frames-malformed`. |
| Metadata body with invalid mapping fields | Raw body retained, `coverage: null`, item status `not-applicable`, valid independent metadata survives, and player mapping remains unknown. |
| Array with valid and malformed frames | Partial coverage counts both; malformed-frame targets are `unassessed`, valid frame/item observations survive in separate local segments, and no delta crosses the malformed element. |
| Two observed frames separated by an arbitrarily large safe-integer time span | One compact inclusive gap range; work and storage remain bounded by observed input. |
| Unknown `ui.version` | Four targets for that valid frame are `unassessed` with blocker `ui-unsupported`; raw source and structural `gameTime` survive, score interpretation is unknown. |
| All four expected items valid | Item status `valid`; four ordered valid assessments and four direct observations survive. |
| One missing item or unexpected label alongside valid items | Affected assessment is `missing` or `mislabeled`, aggregate is `partial`, affected measurement is unknown, and unrelated valid observations survive. |
| Noninteger item or duplicate conflicting item alongside no valid items | Assessment is `invalid` or `conflicting`, aggregate is `invalid`, occurrence indexes and issue scope are retained, and no dependent pass is emitted. |
| One item occurrence with both a wrong label and an invalid value alongside three valid targets | Primary status is `mislabeled`; emit `item-label-mismatch` then `item-value-invalid` once each with that occurrence index, retain no observation for the affected target, report aggregate `partial`, and retain the other three observations. |
| Identical duplicate item occurrences with both a wrong label and an invalid value alongside three valid targets | One `mislabeled` assessment retains all ordered occurrence indexes; emit one ordered label/value issue pair rather than per-occurrence issues, do not report `conflicting`, report aggregate `partial`, and retain the other three observations. |
| Exact duplicate item IDs with identical label and value | One valid assessment and direct observation retain all ordered occurrence indexes. |
| Stored item count, order, blocker, occurrence, status, issue order, or issue multiplicity differs from recomputation | Integrity mismatch; do not use the persisted summary or dependent score conclusion. |
| Score decrease without other boundary evidence | End derived continuity; do not infer a reset or new epoch. |
| One valid tick offset | Cross-evidence findings cite the offset and both source sets. |
| Multiple/contradictory offsets | Cross-evidence alignment unknown; frame-time score remains usable. |
| Frame with no build ID plus matched tagged logs | Frame provenance stays unknown; association reports the log build separately. |
| Mixed tagged log builds | Build-dependent cross-evidence findings unknown. |
| Interrupted publication before/after file creation | Retry publishes or verifies exactly once without overwrite. |
| Repeated exact import | No duplicate record; hashes and existing reviews unchanged. |
| Changed response for the same request | Separate record retained; overlap conflict preserved. |
| Symlink, traversal, occupied filename, changed managed bytes | Refused without deleting or overwriting anything. |
| One record points at another record's same-hash output, or multiple records claim one path | Cleanup refuses before `retiring`; every artifact, record, and unrelated field remains unchanged. |
| Legacy manifest without `scoreRecords` | Existing log analysis unchanged; score support reported unavailable. |
| Mapless score record retirement | Top-level typed tombstone created; no replay/map association invented. |
| Reimport of a retired exact identity | Tombstone returns `deduplicated`; no file or current record created. |
| Claim/examined/done with multiple owners | Existing ownership gates and `completedAt` semantics preserved. |
| `done` record missing its file before retirement intent | Cleanup refuses; no tombstone or record removal. |
| Interruption after saving `retiring`, before deletion | Exact cleanup retry verifies and deletes the file, then finalizes once. |
| Interruption after deletion, before tombstone save | Missing file is accepted only with persisted `retiring`; retry publishes tombstone and removes record. |
| File deletion or safety validation fails | Record remains `retiring`; no tombstone or unrelated change. |
| Interruption after final tombstone save | Retry is idempotent and reports already retired. |
| Log cache import and local JSONL registration | Preserve all score collections, tombstones, nested summaries, and reviews. |
| Log review transitions, done, and cleanup | Preserve all score collections and tombstones while changing only selected log state. |
| Waiting-status migration and explicit log reconciliation | Preserve all score collections and tombstones; score lifecycle is not reconciled. |
| `list`, `scan`, and `watch` entry paths | Preserve score data through invoked log writers without displaying or managing score records. |
| Map registration/association and map-checksum operations | Preserve score data; checksum verification remains manifest-read-only unless deliberately changed. |
| Manifest writer preservation guard | A populated optional-field fixture remains structurally equal after each current writer; any reconstructed/dropped field fails. |
| Analyzer success and failure paths | Manifest, raw sources, maps, JSONL, reports, and reviews byte-identical. |

## Current replay source inventory

The following decompressed response fingerprints were observed read-only in the
current cache. This inventory is provenance evidence, not durable retention:

| Requested frame | `gameTime` coverage | Response SHA-256 |
| ---: | ---: | --- |
| 0 | 0 | `5cd769b3272337e9feb1ed05b7bfd8888dfb23f3b0395f0e2ee18bc140152e97` |
| 100 | 1–100 | `c0755d8234bd4a373f5adb23147835611f4f9fd34182375dbf96466ac6d0e12b` |
| 200 | 101–200 | `fd3accca16d42828c39c70745a51bbefcfe54291b2430010270e6089840d0a72` |
| 300 | 201–300 | `6be6f43e52a3f1f47f290480e0cd243033904a9181d1c1015be31184f09013c2` |
| 400 | 301–400 | `9b3edd3c1da6b0ef0ed633ab1d9e75500afcff0011361385adef36d289b2dcc1` |
| 500 | 401–500 | `9ce4dd89614ba73270dbda8d3488a2dbd8f38959bfdca8b902f9ac45e6f54520` |
| 600 | 501–600 | `3658578b24a4088e3947d562039e6a3ae81a4c91ff53f5f4481c355fe3202b76` |
| 700 | 601–700 | `49ce2999f4d63b44c9fc6bfbb79b15bb693dd2d406d07ef0b551c7db41bd0e89` |
| 800 | 701–800 | `9da36c6e17072325a61ce107cbda0e57d686c9e1801ec8fc1b9f77ff2a370b94` |
| 900 | 801–900 | `456959149f8bfb3de0cc1b725b9230c3cc93d35917a62821b3e67329a81395d0` |
| 1,000 | 901–1,000 | `a2f2ffd935c6355f2c0b34b94e3913da70fbebb21127281e14461c847662a6e9` |
| 1,100 | 1,001–1,100 | `66cbc3ed0cb1a4d639f3dc08088784344d9b10a10671f201f0696b4d95714651` |
| 1,200 | 1,101–1,200 | `0882cfa65fb019208315cdfb8f6f47b2e84a7af9d63de26dbd212a4479217f24` |
| 1,300 | 1,201–1,300 | `58c7a47fc1d9d8ac6863b27bf7fa874feff002ddcedd5d95259dfdb412007674` |
| 1,400 | 1,301–1,400 | `0c3586bdd6bf2a4d71294d94e8938a675c1f8349f241b605806997d52125cf84` |
| 1,500 | 1,401–1,500 | `dffeec750429075d72551ada345917ab01f55159cd18cbfe4ec09219a99b75f3` |
| 1,536 | 1,501–1,536 | `1e55cfa3a323c17cdfa5dc1e204d0dd3870b9549c2f34b59893d28f076b55e30` |

The separate game-metadata cache file is `20468fbf557699d6_0`, 4,896 bytes,
with complete-cache-file SHA-256
`32a4e7e8c2c67e95a317236f250de083c6c579cccd474714b1d68ebb13df98a8`.
At the time of inventory, the log importer could not decode or retain that
request and no listed source was durable. Milestone 1 subsequently retained and
hash-verified all 18 sources through the dedicated score workflow. They are
claimed and examined under task
`codex/adr0005-m1-retention-20261001`, with `completedAt: null`; none has been
retired. The `/replay/0` body is retained with complete structural coverage but
four missing scoring-item assessments, so retention does not turn it into a
valid scoring observation.

## Retention alternatives

- **Reuse log `records` or `otherEntries`: rejected.** Replay frames are not
  console diagnostics, carry no build ID, and require their own raw response
  file. Treating them as evidence-only logs would invent false log, map, and
  diagnostic coverage semantics.
- **Use `register-local`: unavailable.** It accepts only safely named
  game-state JSONL whose static flags match an active map. Replay response
  arrays and metadata correctly fail that contract.
- **Make an unmanaged copy under an existing ignored suffix: rejected.** A
  misleading `.jsonl`, map, analyzer-report, or generic cache name would have no
  manifest identity, ownership, hash enforcement, or safe cleanup semantics.
  It would not be compliant managed retention.
- **Retain complete Chromium cache entries: not preferred.** They are compact
  and preserve transport framing, but include browser-specific material that is
  unnecessary for score reproduction. Recording their hashes while managing
  exact decompressed response bodies retains both transport provenance and the
  portable authoritative content.
- **Create a second manifest or bump to manifest version 3: not preferred.** A
  second manifest duplicates locks and review lifecycle; version 3 makes every
  current reader fail before score support is needed. An optional typed
  collection in version 2 is smaller, provided compatibility tests prove old
  writers preserve it.

The accepted design is therefore optional top-level `scoreRecords` and
`retiredScoreSources` collections, dedicated ignored raw-response files, and
shared locking/review primitives with source-type-specific commands.

## Implementation status and remaining plan

### Milestone 1 — source retention (completed 2026-10-01)

1. Add the root-anchored ignore rule and safe filename validator.
2. Add pure parsing/validation for exact metadata and replay-frame cache keys.
3. Add optional `scoreRecords` and map-independent `retiredScoreSources`
   read/write preservation.
4. Implement explicit single-file import only; do not initially add broad
   scan/watch discovery.
5. Implement atomic exclusive publication, exact-record pending recovery,
   idempotency, and score-specific claim/examined/done/cleanup operations with
   durable `retiring` recovery.
6. Add compatibility tests for every existing manifest writer and entry path
   enumerated above, including preservation of nested fields and tombstones.
7. Update the accepted manifest/evidence documentation and lifecycle diagrams
   to describe the optional collections without changing log or JSONL meaning.
8. Use that reviewed implementation to retain the 17 currently cached replay
   responses and metadata response before relying on them further.

Milestone 1 was completed after saved bytes and manifest hashes round-tripped,
repeated import and retirement are idempotent, interruption recovery passes at
every persistence boundary, old manifest/log behavior passes unchanged, and the
selected sources are managed, claimed, examined, and locally ignored. Retirement
behavior was verified with synthetic roots; the selected sources remain retained
and were not completed or cleaned up.

### Milestone 2 — read-only analysis

1. Extend the analyzer interface with explicit score fingerprints.
2. Revalidate raw sources and layered summaries, establish only
   evidence-supported local segments, merge only exact-overlap components that
   satisfy the group-wide invariant, and preserve ambiguity, conflicts, and
   source references.
3. Implement player mapping, tick alignment, direct measurements, consecutive
   derived changes, differences, and event alignment.
4. Add the synthetic matrix above plus deterministic-output and byte-preservation
   tests on success and failure paths.
5. Reproduce the selected replay observations from managed sources and document
   any differences without rewriting the historical checkpoint.

No runtime source, build ID, game-state JSONL, map format, diagnostic schema, or
existing log record changes are required.

## Approved decisions

The user explicitly approved all six decisions on 2026-10-01 before Milestone 1
implementation:

1. exact decompressed HTTP body, rather than the complete Chromium cache file,
   is the managed raw artifact;
2. manifest version 2 gains optional top-level `scoreRecords` and
   `retiredScoreSources` instead of introducing manifest version 3, a second
   manifest, or map-dependent score tombstones;
3. complete transport-valid but semantically malformed/unsupported bodies are
   retained with layered validation, explicit assessed-versus-unassessed item
   summaries, and nullable/partial coverage, while incomplete/undecodable
   transport is retried and not published as complete evidence;
4. `displayedGain` is the stable evidence name until authoritative semantics
   establish that it always equals an awarded per-tick increment;
5. sequence identity is source-qualified, an exact-overlap component joins only
   when its complete transitive closure has no proven boundary or ordering
   contradiction, and competing or ambiguous overlaps suppress dependent
   conclusions without selecting an epoch or compatible subset; and
6. score cleanup uses explicit exact-record commands and durable `retiring`
   state, never global or log-triggered reconciliation.

The five review findings left no further technical ambiguity at approval time.
The Arena metadata and UI payload formats are not authoritative public APIs;
future versions must remain unsupported/unknown until separately validated.

## Consequences

Milestone 1 preserves evictable score sources with the same ownership and
safety properties as replay logs while keeping game-state JSONL and runtime
diagnostics unchanged. It enables a future deterministic score analyzer without
claiming frame build provenance or causal strategy effects.

Costs include local raw-response storage, another explicitly selected evidence
class, manifest/tooling complexity, and maintenance for undocumented Arena UI
payload versions. Milestone 2 analysis remains separately unimplemented.
