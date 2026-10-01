# Replay evidence contract

This document defines the versioned replay-diagnostic contract for Pain and
Gain. It completed milestone M1 of
[ADR 0004](../decisions/0004-replay-evidence-and-analysis-roadmap.md). M2
implemented membership evidence and M3 now implements action decisions,
attempts, and importer support. M4 implements deterministic read-only analysis.
The M5 prerequisite adds version-1 runtime CPU samples and a version-2 coverage
closure. The [M5 live-validation checkpoint](replay-validation-2026-09-30.md)
records one retained current-build capture and its remaining evidence limits.

The contract preserves the existing `game-state` and `map-state` records. New
diagnostics are separate console records and must not become inputs to gameplay.
The importer continues to write only original `game-state` lines to JSONL.

## Evidence boundaries

The evidence layers remain distinct:

1. `game-state` and `map-state` describe observations made before actions.
2. Diagnostic decisions describe what production selectors chose, including an
   explicit hold or no-action result.
3. Diagnostic attempts prove that a production API call was made and record its
   direct return value.
4. A later observation may show displacement, damage, healing, or death, but it
   does not by itself attribute that effect to an attempt.
5. Derived analysis cites these records and states its assumptions; it is not
   runtime evidence.

`OK` means that Arena scheduled an operation. It does not prove displacement,
damage, healing, capture, survival, or strategic benefit. A missing record is
`unknown`, not a hold, no-action, success, or failure.

Replay identity never comes from a runtime diagnostic. The importer associates
records with the replay ID verified from the cache request key or another
supported source-provenance path. Runtime records must not contain a guessed
`replayId`.

## Compatibility with current records

The following formats are unchanged:

- `game-state`: the existing unversioned, build-tagged `before-actions`
  snapshot. Its original JSON string remains the only content written to the
  managed JSONL.
- `map-state` format version 1: the existing first-successful-tick map capture.
- `flag-allocation` and `healer-escort`: existing build-tagged experimental
  diagnostics. They remain accepted under their current validators and stored
  as typed manifest `otherEntries`. This contract does not retroactively assign
  them a version or stronger coverage guarantees.

Legacy captures remain usable. The absence of the new records in a legacy
capture means that membership transitions, selector decisions, command
attempts, return codes, CPU measurements, and diagnostic completeness are unknown.

## Common diagnostic envelope

Every new diagnostic is one compact JSON object on one console line with all of
these fields:

| Field | Type | Rule |
| --- | --- | --- |
| `type` | string | One of the record types defined below. |
| `formatVersion` | integer | `1` for membership, action, and CPU records and M2/M3 closures; `2` for the current CPU-covering closure. |
| `buildId` | string | Lowercase 64-character hexadecimal runtime build ID. |
| `tick` | integer | Positive Arena tick observed by the running loop. |
| `phase` | string | `before-actions`, `movement`, `tactics`, or `after-actions`. |
| `sequence` | integer | Zero-based emission order among supported diagnostics for this tick. |
| `recordId` | string | Exactly `<tick>:<sequence>`, for example `43:2`. |

The sequence resets to zero each tick and increases by one for every supported
diagnostic, across all types and phases. It records console-emission order, not
engine resolution order. Within a tick, phase order is:

1. `before-actions`: membership evidence after the observation-only update;
2. `movement`: movement decisions and their attempts in production order;
3. `tactics`: healing and combat decisions and their attempts in production
   order;
4. `after-actions`: the optional `runtime-cpu` sample followed immediately by
   the one closing `evidence-coverage` record.

The actual `sequence` is authoritative if multiple actors or actions share a
phase. Diagnostics are emitted from the existing selection and execution paths;
selectors, pathfinding, or Arena commands must not be invoked again for logging.

### Identity and null rules

- Arena object IDs are stable identities. `actorId`, `memberId`, and an
  ID-bearing target use the exact observed ID; they are never synthesized from
  coordinates.
- A target is either `null` or an object with `kind`, `id`, `x`, and `y`.
  `kind` is `creep`, `score-flag`, `position`, `game-object`, or `unknown`.
  `id` is a string when known and otherwise `null`; `x` and `y` are safe
  integers at selection or call time.
- A required property must be present. Omission is not equivalent to `null`.
- `null` means a known absence or a value that the producing call did not make
  available, only where the schema explicitly permits it. It never means that
  a record was lost.
- `reason` values are nonempty kebab-case tokens. New reason tokens may be added
  without changing format version 1, but their meaning must be documented with
  the producer. An analyzer that does not know a token reports its semantic
  interpretation as unknown rather than rejecting otherwise valid evidence.

## Membership evidence

Membership evidence is emitted after `updateMembership()` and before membership
can be inspected by any diagnostic consumer. It is observation-only and cannot
affect assignments or participation.

### `membership-baseline`

One full baseline is emitted for the first membership update observed by a
loaded runtime epoch. It is emitted whether initialization succeeds or fails.
It contains:

- `epoch`: positive integer, starting at 1 for the loaded module;
- `initialized`: boolean;
- `initializationReason`: the module's explicit reason string or `null`;
- `lastTick`: positive integer or `null`;
- `squads`: ordered objects with `id` and ordered `memberIds`;
- `members`: ID-ordered full member objects with `id`, `role`,
  `originalParts`, `squadId`, `slotIndex`, `late`, `presence`, `functioning`,
  `capable`, `participating`, and `canMoveNow`.

`slotIndex` is the member's zero-based position in its squad or `null` when
unassigned. `role` is `melee`, `ranged`, `healer`, `scout`, `mixed`, or
`unclassifiable`. Part-count objects use lowercase Arena part names and
nonnegative integer counts. `originalParts` may be `null` only when the current
classifier cannot form valid initial counts; `functioning` is always an object.
`presence` is `present`, `missing`, or `dead`.

The current initialization reasons are `awaiting-tick-1`,
`expected-14-owned-living`, `invalid-initial-member`, `duplicate-member-id`,
`invalid-tick`, `initial-tick-missed`, and `invalid-observation`. A future reason
must follow the reason-token rule and is evidence, not an instruction to infer
missing state.

### `membership-change`

After the baseline, emit a record only when membership state changes. Its
`epoch` identifies the membership epoch and `changes` is a nonempty ordered
array of atomic changes. Sort member-specific changes by member ID, then by the
kind order below. Preserve reset and initialization changes before member
changes.

| Kind | Required data | Meaning |
| --- | --- | --- |
| `reset` | `previousTick`, `currentTick`, `fromEpoch`, `toEpoch`, `reason` | Match-local state reset because the tick counter restarted or did not advance. |
| `initialization` | `initialized`, `initializationReason` | Initialization result or reason changed. |
| `member-added` | `member` | A previously unknown late ID appeared; `member` is the same full object shape used by the baseline. |
| `assignment` | `memberId`, `squadId`, `slotIndex` | Stable slot changed; `squadId` and `slotIndex` may both be `null` for explicit unassignment. |
| `presence` | `memberId`, `from`, `to` | Presence changed among `present`, `missing`, and `dead`. Absence alone must not produce `dead`. |
| `capability` | `memberId`, `functioning`, `capable`, `canMoveNow` | Functioning parts or current capability/mobility changed. |
| `participation` | `memberId`, `participating` | Active participation changed without changing membership. |

Initial assignments are fully represented in the baseline. The `assignment`
change shape exists for an explicit later state transition, but this contract
does not authorize reassignment. Injury alone does not change membership.
Missing members keep their slots, confirmed dead members remain tombstoned, and
restored capabilities reactivate the original slot according to the existing
membership rules. A `member-added` change is required for an unexpected late ID
because presence and capability changes alone cannot reconstruct its original
role, parts, or unassigned status.

A match reset emits a `reset` change and then a new full baseline in the new
epoch. A module reload cannot describe the prior in-memory epoch; it emits only
its own baseline, which remains uninitialized after tick 1 with the actual
initialization reason.

Example uninitialized baseline after a late module load; no membership or
assignments can be reconstructed because tick 1 was missed:

```json
{"type":"membership-baseline","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":4,"phase":"before-actions","sequence":0,"recordId":"4:0","epoch":1,"initialized":false,"initializationReason":"initial-tick-missed","lastTick":4,"squads":[],"members":[]}
```

Example change-only transition when a member is missing, followed later by its
return with damaged ATTACK capability:

```json
{"type":"membership-change","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":12,"phase":"before-actions","sequence":0,"recordId":"12:0","epoch":1,"changes":[{"kind":"presence","memberId":"melee_1","from":"present","to":"missing"},{"kind":"capability","memberId":"melee_1","functioning":{},"capable":false,"canMoveNow":false},{"kind":"participation","memberId":"melee_1","participating":false}]}
```

```json
{"type":"membership-change","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":13,"phase":"before-actions","sequence":0,"recordId":"13:0","epoch":1,"changes":[{"kind":"presence","memberId":"melee_1","from":"missing","to":"present"},{"kind":"capability","memberId":"melee_1","functioning":{"attack":4,"move":8},"capable":true,"canMoveNow":true},{"kind":"participation","memberId":"melee_1","participating":true}]}
```

These transitions retain squad A and slot 1; they do not imply reassignment.

## Action evidence

The production path emits one `action-decision` for
each owned actor and each channel reached in that tick: `movement`, `healing`,
and `combat`. This includes actors with no selected command. Combat may select
two compatible actions, so the decision carries an ordered `actions` array.

### `action-decision`

In addition to the common envelope, a decision contains:

| Field | Type | Rule |
| --- | --- | --- |
| `decisionId` | string | Equal to this decision's `recordId`. |
| `channel` | string | `movement`, `healing`, or `combat`. |
| `actorId` | string | Owned creep ID. |
| `outcome` | string | `selected`, `hold`, or `no-action`. |
| `reason` | string | Stable reason token from the production path. |
| `actions` | array | Ordered selected calls; nonempty only for `selected`. |

Each selected action has:

- `actionId`: `<decisionId>#<zero-based action index>`;
- `method`: `moveTo`, `heal`, `rangedHeal`, `attack`, or `rangedAttack`;
- `target`: the non-null target identity and coordinates defined above.

`hold` means the selector intentionally chose not to move or act because its
objective was already satisfied. `no-action` means there was no eligible or
compatible action. Both have an empty `actions` array and a non-null reason.
Suppression caused by healing/action compatibility is a `no-action` combat
decision with an explicit reason, not missing combat evidence.

Current movement reasons are `combat-approach`, `combat-in-range`,
`injured-ally-approach`, `injured-ally-in-range`, `flag-fallback`,
`no-movement-objective`, `escort-approach`, `escort-in-range`, and
`escort-fatigue-pause`. Current healing reasons are `self-heal`,
`injured-ally-in-range`, `no-functioning-heal`, and
`no-injured-target-in-range`. Current combat reasons are `target-in-range`,
`healing-compatibility`, `no-functioning-weapon`, and `no-target-in-range`.
These name the production result; they do not establish an engine effect.

### `action-attempt`

Emit one attempt immediately after each selected production call returns. It
contains:

| Field | Type | Rule |
| --- | --- | --- |
| `decisionId` | string | References the selecting decision. |
| `actionId` | string | References exactly one selected action. |
| `channel` | string | Must match the decision. |
| `actorId` | string | Must match the decision. |
| `method` | string | Must match the selected action. |
| `target` | object | ID/coordinates actually passed to the call; must match the selected target unless the producer documents a transformation. |
| `returnCode` | integer or null | Direct API result. `null` means the call occurred but produced no numeric result; it never means no call. |

A selected action with no corresponding attempt is unknown: it may indicate a
capture gap, an interrupted execution path, or an implementation defect. It is
not automatically a failed command. An attempt without a matching selected
action is conflicting evidence.

Example movement hold and explicit tactical no-actions:

```json
{"type":"action-decision","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":20,"phase":"movement","sequence":0,"recordId":"20:0","decisionId":"20:0","channel":"movement","actorId":"ranged_1","outcome":"hold","reason":"combat-in-range","actions":[]}
```

```json
{"type":"action-decision","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":20,"phase":"tactics","sequence":1,"recordId":"20:1","decisionId":"20:1","channel":"healing","actorId":"ranged_1","outcome":"no-action","reason":"no-functioning-heal","actions":[]}
```

```json
{"type":"action-decision","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":20,"phase":"tactics","sequence":2,"recordId":"20:2","decisionId":"20:2","channel":"combat","actorId":"ranged_1","outcome":"no-action","reason":"no-target-in-range","actions":[]}
```

Example selected movement followed by an actual failed call (`ERR_TIRED`, `-11`):

```json
{"type":"action-decision","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":21,"phase":"movement","sequence":0,"recordId":"21:0","decisionId":"21:0","channel":"movement","actorId":"melee_1","outcome":"selected","reason":"combat-approach","actions":[{"actionId":"21:0#0","method":"moveTo","target":{"kind":"creep","id":"enemy_1","x":40,"y":40}}]}
```

```json
{"type":"action-attempt","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":21,"phase":"movement","sequence":1,"recordId":"21:1","decisionId":"21:0","actionId":"21:0#0","channel":"movement","actorId":"melee_1","method":"moveTo","target":{"kind":"creep","id":"enemy_1","x":40,"y":40},"returnCode":-11}
```

The attempt proves the method, argument, and direct failure code. It does not
prove what caused fatigue or what would have happened with a different target.

## Runtime CPU evidence

### `runtime-cpu`

The current producer emits exactly one CPU sample after all gameplay commands
and existing membership/action diagnostics, immediately before coverage closes:

| Field | Type | Rule |
| --- | --- | --- |
| `elapsedNs` | integer | Nonnegative CPU wall time elapsed in the current tick when `getCpuTime()` is called. |
| `limitNs` | integer | Positive applicable Arena CPU limit. |
| `limitKind` | string | `first-tick` at tick 1; `ordinary-tick` otherwise. |
| `unit` | string | Exactly `nanoseconds`. |

The sample includes runtime work completed through the `getCpuTime()` call. It
excludes construction, serialization, and emission of its own record, the
following coverage closure, and later return/runtime work. The analyzer derives
sampling-point headroom as `limitNs - elapsedNs`; negative values are permitted
observations and no acceptance threshold is implied. This is neither exact
final-tick CPU nor differential diagnostic overhead.

```json
{"type":"runtime-cpu","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":20,"phase":"after-actions","sequence":3,"recordId":"20:3","elapsedNs":8000000,"limitNs":20000000,"limitKind":"ordinary-tick","unit":"nanoseconds"}
```

A missing sample, including timeout before the sampling point, is unknown rather
than zero. A sample proves only that execution reached the sampling call; it does
not prove that its own output, the closure, or any subsequent work completed.

## Diagnostic coverage and reconstruction

### `evidence-coverage`

The final diagnostic for each tick reaching its close point is one
`evidence-coverage` record in `after-actions`. Version 1 represents M2/M3
coverage; version 2 adds current CPU coverage. It contains:

- `firstSequence`: `0` when diagnostics preceded it, otherwise `null`;
- `lastSequence`: the last sequence before this record, otherwise `null`;
- `recordCount`: count of preceding versioned diagnostics for the tick;
- `coveredTypes`: ordered diagnostic types whose execution paths this closure
  covers;
- `counts`: an object with exactly `membership-baseline`,
  `membership-change`, `action-decision`, `action-attempt`,
  `movement-decisions`, `healing-decisions`, and `combat-decisions`, each a
  nonnegative integer. Version 2 additionally requires `runtime-cpu`, exactly
  `1`;
- `closed`: exactly `true`, meaning the instrumented tick path reached its
  diagnostic close point.

The coverage record's own sequence equals `recordCount`. It does not count
itself. `closed: true` establishes only that the runtime reached the close point
and reported its expected counts. Importer capture can still be partial.
Only a present, valid coverage record at sequence zero with `recordCount: 0`
establishes that no preceding diagnostics were emitted for that tick.
An entirely absent tick or absent coverage record is unknown, never an implicit
zero.

An M2 closure has `coveredTypes` exactly `["membership-baseline",
"membership-change"]`; its zero action counts do not claim action coverage. An
M3 closure has exactly `["membership-baseline", "membership-change",
"action-decision", "action-attempt"]`. The importer accepts both forms so
membership-only captures retain their original meaning. The current version-2
closure has those four types followed by `"runtime-cpu"`; it requires exactly
one preceding sample. Older otherwise-complete closures remain valid and mean
that CPU evidence is unsupported, not zero or missing from their declared scope.

Coverage closing the three-record hold example above:

```json
{"type":"evidence-coverage","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":20,"phase":"after-actions","sequence":3,"recordId":"20:3","firstSequence":0,"lastSequence":2,"recordCount":3,"coveredTypes":["membership-baseline","membership-change","action-decision","action-attempt"],"counts":{"membership-baseline":0,"membership-change":0,"action-decision":3,"action-attempt":0,"movement-decisions":1,"healing-decisions":1,"combat-decisions":1},"closed":true}
```

Current closure for the CPU example above:

```json
{"type":"evidence-coverage","formatVersion":2,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":20,"phase":"after-actions","sequence":4,"recordId":"20:4","firstSequence":0,"lastSequence":3,"recordCount":4,"coveredTypes":["membership-baseline","membership-change","action-decision","action-attempt","runtime-cpu"],"counts":{"membership-baseline":0,"membership-change":0,"action-decision":3,"action-attempt":0,"movement-decisions":1,"healing-decisions":1,"combat-decisions":1,"runtime-cpu":1},"closed":true}
```

### Reconstruction rules

For each replay and tick, combine supported versioned records only when build ID and
record identity agree:

- A contiguous sequence from zero through the coverage record, matching its
  counts, is diagnostically complete for that tick's instrumented paths.
- Absence of `evidence-coverage`, a sequence gap, a count mismatch, a phase-order
  violation, or a missing or misordered selected-action attempt makes the
  affected evidence incomplete and therefore unknown. Existing snapshots remain
  usable independently.
- Exact duplicate records with the same `recordId` and canonical content are
  deduplicated for analysis and reported as duplicate transport evidence.
- The same `recordId` with different canonical content is a conflict. Do not
  choose one; mark the affected tick/type unknown and report both sources.
- Overlapping response chunks may contain exact duplicates. Coverage is
  evaluated after exact deduplication and conflict detection.
- A build-ID conflict within a response or replay is malformed/conflicting
  evidence. Untagged legacy chunks are not retroactively assigned the build ID
  of a tagged chunk.
- Membership reconstruction requires a baseline for the relevant epoch plus
  every subsequent change through the queried tick. A missing baseline or
  change leaves membership state unknown from that point until a later full
  baseline.
- Do not bridge a missing game-state tick when calculating state deltas. The
  snapshots on either side remain observations but are not consecutive evidence.
- Neither a continuous snapshot range nor a terminal replay frame proves
  complete diagnostic or full-console coverage.

Canonical diagnostic content uses the importer's existing normalization rule:
recursively sort object keys, preserve array order, and retain every field and
value. Raw lines remain the primary evidence even when canonical content is used
for duplicate/conflict classification.

Example gap: records `30:0` and `30:2` plus a coverage record claiming three
preceding records leave `30:1` missing. Tick 30 is incomplete even if its
`game-state` exists:

```json
{"type":"evidence-coverage","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":30,"phase":"after-actions","sequence":3,"recordId":"30:3","firstSequence":0,"lastSequence":2,"recordCount":3,"coveredTypes":["membership-baseline","membership-change","action-decision","action-attempt"],"counts":{"membership-baseline":0,"membership-change":0,"action-decision":2,"action-attempt":1,"movement-decisions":1,"healing-decisions":1,"combat-decisions":0},"closed":true}
```

The importer must report the missing sequence; it must not fabricate `30:1` or
interpret the gap as a hold.

Example malformed recognized diagnostic (missing required `actorId`):

```json
{"type":"action-decision","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":31,"phase":"movement","sequence":0,"recordId":"31:0","decisionId":"31:0","channel":"movement","outcome":"hold","reason":"combat-in-range","actions":[]}
```

The importer rejects the containing response as malformed and publishes none of
its records. It reports the source entry and validation reason.

Example legacy behavior: an existing `game-state` line remains valid without
new diagnostics. Membership, decisions, attempts, and diagnostic completeness
for tick 7 are unknown:

```json
{"type":"game-state","buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":7,"phase":"before-actions","selectedFlagId":null,"creeps":[],"flags":[]}
```

## Importer and storage requirements for M2–M5

M2 implements these requirements for membership evidence, M3 for action
decisions and attempts, and the M5 prerequisite for CPU samples and version-2
coverage. These additions do not redefine existing formats:

1. Recognize `membership-baseline`, `membership-change`, `action-decision`,
   `action-attempt`, `runtime-cpu`, and `evidence-coverage`.
2. Strictly validate the common envelope, type-specific fields, references,
   phase, sequence, record IDs, `coveredTypes`, build consistency, and version. A recognized
   type with an unsupported version is reported as unsupported, not silently
   treated as an ordinary console line.
3. Reject an entire cached response when a recognized new diagnostic is
   malformed. Do not publish only its valid subset.
4. Preserve each valid diagnostic's original console line in typed manifest
   `otherEntries`, including its source key, type, and version. Keep warnings,
   errors, and unknown console lines distinguishable.
5. Keep managed JSONL byte-for-byte game-state-only. Do not insert diagnostics,
   normalize game-state JSON, or backfill old captures.
6. Store a derived per-response diagnostic-coverage summary in manifest
   metadata: observed tick range, missing sequences/closures, duplicate IDs,
   conflicts, versions, and type/channel counts. This summary is derived; raw
   lines remain the evidence.
7. Report selected actions without attempts, attempts without selections,
   duplicate attempts, and mismatched actor/channel/method/target correlation as
   incomplete evidence rather than inventing a result.
8. When records from multiple chunks are analyzed together, deduplicate exact
   overlaps and surface conflicts without overwriting either source. The
   importer must not claim complete replay coverage from a complete response.
9. Preserve replay association from the verified request/source metadata,
   existing map validation, build-provenance rules, fingerprints, review state,
   atomic publication, and cleanup boundaries.

A response containing at least one validated versioned, allocation, or escort
diagnostic but no `game-state` line is an evidence-only response. After the same
validated replay/map association gate as a file-backed import, persist it as a
normal manifest record with its response fingerprint, source, replay/map/build
provenance, zero game-state coverage, diagnostic coverage, all `otherEntries`,
and review state. Set both `outputPath` and `outputFingerprint` to `null`; do not
create an empty JSONL or infer an empty observed game state. Publish this
manifest-only record atomically with status `claim`; `pending` remains the
recovery state for a JSONL that still needs publication.

Evidence-only records participate in listing, `other`, ownership claims,
examination, completion, deduplication, and fingerprint retirement exactly like
file-backed records. Completed cleanup removes the manifest record without a
file operation and preserves the map registration and replay association. A
pure map-only response still establishes its association without creating a
record. Missing closures, gaps, or absent game-state lines remain unknown.

Unknown future diagnostic types remain ordinary `otherEntries` unless their
type is reserved by a newer supported contract. Their presence does not make
any declared closure scope complete. Existing `flag-allocation` and `healer-escort`
entries continue through their current compatibility path.

### Replay-score source retention

The optional manifest-version-2 `scoreRecords` and `retiredScoreSources`
collections implement ADR 0005 Milestone 1 without changing runtime diagnostics,
game-state JSONL, or log-record meaning. A score record manages the exact
decompressed body of one explicitly supplied Arena game-metadata or replay-frame
cache response. Its request-qualified source fingerprint, response-body hash,
and complete-cache-entry hash remain distinct. `mapId` is an optional association
and embedded build provenance is always null.

Layered transport, JSON, metadata, frame, UI, and item summaries preserve
malformed, partial, unsupported, and unassessed states. A published raw body
proves complete supported transport and exact bytes only; it does not prove a
valid score observation, complete replay coverage, player mapping, tick
alignment, or a runtime build. Item summaries retain deterministic target and
occurrence order, use `mislabeled` as the primary status for simultaneous label
and value defects, and preserve both ordered issue codes.

Transport validation requires one coherent HTTP status/header block and rejects
misleading status text or conflicting encoding/length fields. Metadata mapping
structure is valid only for consistent two-element arrays of nonempty string
identities; unsupported objects remain partial and never infer the current
user's slot. Local coverage stores missing times as compact inclusive ranges,
bounded by observed frames. Legacy numeric gap arrays are normalized only for
read-time equality so existing evidence is not rewritten.

Score review uses dedicated claim, examined, and done operations. Done evidence
is retained until an exact-record cleanup first persists `retiring`, then safely
deletes the verified managed response, and finally atomically publishes a
map-independent tombstone while removing the current record. Missing files are
accepted only after `retiring` was persisted. Log reconciliation and log
scan/watch/list paths preserve these optional collections but never manage score
records. Score sequence grouping and derived analysis remain outside this
implemented retention milestone.

Before publication completion, recovery, verification, or cleanup, a managed
score filename must match its record identity and have unique ownership. Newly
published final paths are rechecked as regular non-symlink files with the exact
byte count and hash before the record can enter `claim`.

Milestone 2 applies a separate, read-only production compatibility adapter after
the stored summaries have been revalidated. The adapter accepts `_id` only for
the observed typed replay-object and embedded `ScoreFlag` shapes; the original
`id` and top-level `flags` forms remain supported. Equal duplicate identities
deduplicate. Conflicting duplicates, unequal simultaneous `id`/`_id`, or
disagreeing top-level and embedded flag representations suppress dependent
mapping or alignment. Presence is structural: an explicit empty top-level array
must agree with any embedded flag set, and a malformed present representation is
not treated as absent.

The observed nested metadata form is supported only when the current-user ID,
two user `_id` values, two unique code-to-user references, and the nested
two-entry `usersCode` list form one complete graph with `firstPlayerIndex: 0`.
The two `usersCode` entries identify `player1` and `player2` in order. Usernames
and `users`/`codes` array positions are not identity evidence. Duplicate,
unresolved, malformed, or conflicting references remain unknown; simultaneous
supported identity arrays must agree exactly, and every present legacy identity
field must be well formed before nested metadata can establish mapping. Partial
object-to-snapshot ownership observations must also agree with metadata, even
when the snapshots do not establish both slots. This analysis result never
upgrades, rewrites, or invalidates the retention validator's historical
`metadata: partial` summary for the object-shaped payload.

## M4 analyzer requirements

`tools/replay-analysis.js` reads manifest version 2 directly and never invokes
importer reconciliation, ownership, examination, completion, or cleanup. It
supports all selected file-backed and evidence-only records for one replay and
can restrict selection by full response fingerprint. Its deterministic JSON
report goes to stdout; it does not write an analysis artifact or update review
metadata.

The analyzer revalidates manifest and source fields, safe regular-file paths,
JSONL bytes and schemas, replay/map associations, registered and embedded map
checksums, raw diagnostics, builds, and stored coverage summaries. The map ID is
the checksum of canonical payload JSON plus a newline with only the top-level
`checksum` excluded. The saved map file's byte hash is reported separately and
is never treated as the map ID.

Replay-wide merging applies the existing canonical comparison rule. Exact
overlaps retain their source references and are analyzed once. Conflicting
snapshots or diagnostics are reported without choosing a variant, and any
dependent conclusion is unknown. Stored per-response summaries retain original
`otherEntries` keys; replay-wide references are fingerprint-qualified. Complete
M2 closure supports membership only; complete M3 closure supports membership
and actions only when its supported actor/channel expectation can be checked
against compatible same-tick state. A covered zero action count is established
only for a known empty owned roster. Explicit holds and no-actions remain known
evidence, while missing, unsupported, incomplete, and conflicting evidence
remain distinct.

Membership reconstruction requires an uninterrupted complete path from a valid
baseline. The analyzer checks epochs/resets, member additions, transition source
values, stable assignments, dead-member nonreactivation, and consistency with
available compatible owned pre-action snapshots. Reset continuity requires the
declared next same-build baseline; unexplained rebaselining is not treated as a
continuous valid epoch. It checks recorded attempts for owned actors, consistent
target identities and coordinates, required functioning parts, Chebyshev
attack/heal range, and documented same-tick command compatibility without
rerunning selectors.

Movement attempts and return codes remain separate from displacement observed
in the next consecutive snapshot. A stationary actor after `OK` is an observed
zero displacement, not proof of engine failure. Health changes are reported as
positive, negative, or zero deltas only across consecutive snapshots, without
damage or healing attribution. Report provenance is `local-source-match`,
`tagged-unmatched`, `legacy-unknown`, or `conflicting`; a valid nonlocal build is
not itself a failure. A null return proves an attempt but leaves scheduling
acceptance unknown; zero means accepted for scheduling and a nonzero integer
means rejected. Cross-build membership, action, movement, and health dependencies
remain unknown while independent compatible findings are retained.

ADR 0005 Milestone 2 extends this same read-only analyzer through explicit
`scoreFingerprints`. Selected score files and stored summaries are revalidated
from exact bytes. Source-qualified segments group only through complete,
noncontradictory exact-overlap components; same-source bridges and overlap-order
cycles reject the whole component. Direct cumulative score and displayed gain
remain separate, derived change requires consecutive compatible observations,
and every unavailable delta carries a continuity reason. Optional replay-object
slot labels, snapshot ownership, tick alignment, and selected-log build identity
remain independent evidence chains. Event associations require all applicable
chains and never claim causality. Replay frames alone leave terminal status
unknown. Omitting score selection leaves the log-only report unchanged.

## M1 review conclusions

The contract matches the current boundaries documented in
[project layout](project-layout.md), the
[Arena API](screeps-arena-api.md), and the
[tick-flow diagram](../diagrams/tick-flow.puml): observations precede movement,
movement precedes tactics, and Arena action methods return scheduling/error
codes rather than resolved effects.

M2 emits membership evidence and M3 emits action decisions and attempts through
the same ordered stream. M4 consumes those records without changing their
lifecycle state. Local fixtures verify command-trace equivalence, importer
correlation, deterministic reports, and read-only analysis, but do not establish
live capture completeness or engine effects. On the deterministic 14-scout, no-combat fixture, a two-digit action-only
steady tick produced 57 records and 19,841 serialized JSON-line bytes including newlines (42
decisions, 14 attempts, and one closure). Adding its tick-1 membership baseline
produced 58 records and 22,813 bytes; the longest line was the 3,167-byte
baseline. This is a fixture-size measurement, not live console, capture, CPU, or
memory evidence. Live-capture validation and strategy changes remain outside
M1–M4.

With the M5 CPU prerequisite enabled, the same synthetic fixture produces 59
records/23,113 bytes for tick 1 and 58 records/20,145 bytes for the two-digit
steady tick. The added sample plus version-2 closure metadata increase those
fixtures by 300 and 304 bytes respectively. These remain serialized fixture
sizes, not live capture completeness or CPU-performance measurements.
