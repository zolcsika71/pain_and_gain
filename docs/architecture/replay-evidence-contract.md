# Replay evidence contract

This document defines the version-1 contract for future replay diagnostics in
Pain and Gain. It completes milestone M1 of
[ADR 0004](../decisions/0004-replay-evidence-and-analysis-roadmap.md); it does not
implement membership or action diagnostics, importer changes, or analysis.

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
attempts, return codes, and diagnostic completeness are unknown.

## Common version-1 diagnostic envelope

Every new diagnostic is one compact JSON object on one console line with all of
these fields:

| Field | Type | Rule |
| --- | --- | --- |
| `type` | string | One of the record types defined below. |
| `formatVersion` | integer | Exactly `1`. |
| `buildId` | string | Lowercase 64-character hexadecimal runtime build ID. |
| `tick` | integer | Positive Arena tick observed by the running loop. |
| `phase` | string | `before-actions`, `movement`, `tactics`, or `after-actions`. |
| `sequence` | integer | Zero-based emission order among version-1 diagnostics for this tick. |
| `recordId` | string | Exactly `<tick>:<sequence>`, for example `43:2`. |

The sequence resets to zero each tick and increases by one for every version-1
diagnostic, across all types and phases. It records console-emission order, not
engine resolution order. Within a tick, phase order is:

1. `before-actions`: membership evidence after the observation-only update;
2. `movement`: movement decisions and their attempts in production order;
3. `tactics`: healing and combat decisions and their attempts in production
   order;
4. `after-actions`: the one closing `evidence-coverage` record.

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
| `assignment` | `memberId`, `squadId`, `slotIndex` | Stable slot changed; `squadId` and `slotIndex` may both be `null` for explicit unassignment. |
| `presence` | `memberId`, `from`, `to` | Presence changed among `present`, `missing`, and `dead`. Absence alone must not produce `dead`. |
| `capability` | `memberId`, `functioning`, `capable`, `canMoveNow` | Functioning parts or current capability/mobility changed. |
| `participation` | `memberId`, `participating` | Active participation changed without changing membership. |

Initial assignments are fully represented in the baseline. The `assignment`
change shape exists for an explicit later state transition, but this contract
does not authorize reassignment. Injury alone does not change membership.
Missing members keep their slots, confirmed dead members remain tombstoned, and
restored capabilities reactivate the original slot according to the existing
membership rules.

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

The production path emits one `action-decision` for each owned actor and each
channel reached in that tick: `movement`, `healing`, and `combat`. This includes
actors with no selected command. Combat may select two compatible actions, so
the decision carries an ordered `actions` array.

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

## Diagnostic coverage and reconstruction

### `evidence-coverage`

The final version-1 diagnostic for each tick is one `evidence-coverage` record
in `after-actions`. It contains:

- `firstSequence`: `0` when diagnostics preceded it, otherwise `null`;
- `lastSequence`: the last sequence before this record, otherwise `null`;
- `recordCount`: count of preceding version-1 diagnostics for the tick;
- `counts`: an object with exactly `membership-baseline`,
  `membership-change`, `action-decision`, `action-attempt`,
  `movement-decisions`, `healing-decisions`, and `combat-decisions`, each a
  nonnegative integer;
- `closed`: exactly `true`, meaning the instrumented tick path reached its
  diagnostic close point.

The coverage record's own sequence equals `recordCount`. It does not count
itself. `closed: true` establishes only that the runtime reached the close point
and reported its expected counts. Importer capture can still be partial.
Only a present, valid coverage record at sequence zero with `recordCount: 0`
establishes that no preceding version-1 diagnostics were emitted for that tick.
An entirely absent tick or absent coverage record is unknown, never an implicit
zero.

Coverage closing the three-record hold example above:

```json
{"type":"evidence-coverage","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":20,"phase":"after-actions","sequence":3,"recordId":"20:3","firstSequence":0,"lastSequence":2,"recordCount":3,"counts":{"membership-baseline":0,"membership-change":0,"action-decision":3,"action-attempt":0,"movement-decisions":1,"healing-decisions":1,"combat-decisions":1},"closed":true}
```

### Reconstruction rules

For each replay and tick, combine version-1 records only when build ID and
record identity agree:

- A contiguous sequence from zero through the coverage record, matching its
  counts, is diagnostically complete for that tick's instrumented paths.
- Absence of `evidence-coverage`, a sequence gap, a count mismatch, or a missing
  selected-action attempt makes the affected evidence incomplete and therefore
  unknown. Existing snapshots remain usable independently.
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
{"type":"evidence-coverage","formatVersion":1,"buildId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tick":30,"phase":"after-actions","sequence":3,"recordId":"30:3","firstSequence":0,"lastSequence":2,"recordCount":3,"counts":{"membership-baseline":0,"membership-change":0,"action-decision":2,"action-attempt":1,"movement-decisions":1,"healing-decisions":1,"combat-decisions":0},"closed":true}
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

## Required importer and storage work for M2–M3

Future implementation must make these focused changes without redefining old
formats:

1. Recognize the five new types: `membership-baseline`, `membership-change`,
   `action-decision`, `action-attempt`, and `evidence-coverage`.
2. Strictly validate the common envelope, type-specific fields, references,
   phase, sequence, record IDs, build consistency, and version. A recognized
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
7. When records from multiple chunks are analyzed together, deduplicate exact
   overlaps and surface conflicts without overwriting either source. The
   importer must not claim complete replay coverage from a complete response.
8. Preserve replay association from the verified request/source metadata,
   existing map validation, build-provenance rules, fingerprints, review state,
   atomic publication, and cleanup boundaries.

Unknown future diagnostic types remain ordinary `otherEntries` unless their
type is reserved by a newer supported contract. Their presence does not make
version-1 evidence complete. Existing `flag-allocation` and `healer-escort`
entries continue through their current compatibility path.

## M1 review conclusions

The contract matches the current boundaries documented in
[project layout](project-layout.md), the
[Arena API](screeps-arena-api.md), and the
[tick-flow diagram](../diagrams/tick-flow.puml): observations precede movement,
movement precedes tactics, and Arena action methods return scheduling/error
codes rather than resolved effects.

It deliberately specifies evidence that the current runtime does not emit.
Implementing that evidence belongs to M2 and M3. Deterministic analysis,
live-capture validation, performance measurements, and any strategy changes
remain outside M1.
