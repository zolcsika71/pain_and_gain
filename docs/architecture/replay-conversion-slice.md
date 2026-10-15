# Synthetic v2-to-SQLite conversion slice

## Status and scope

This opt-in module assesses reuse of the existing schema-1 storage core. It
converts exactly one explicitly selected synthetic log record and one score
record, their common map/replay association and all their active reviews.
It has no CLI, production dispatch, cutover, deletion or activation path.
Production remains file-based managed v2. Its manifest was measured at
533,731,722 bytes; this slice does not read it or solve its capacity limit.

Implementation: [replay-conversion-fixture.js](../../tools/replay-conversion-fixture.js).
Tests: [replay-conversion-fixture.test.js](../../tests/unit/replay-conversion-fixture.test.js).
Protocol: [ADR 0006](../decisions/0006-replay-storage-v3.md).
Assessment: `/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-assessment-20261011-xMFTTr/assessment.md`.

## Explicit fixture contract

Use resident Node **24.19+ within major 24**, local APFS, and newly generated
synthetic input only. No runtime guard is weakened. The exported API is:

```js
await convertFixtureV2Slice({
    synthetic: true,
    sourceRoot, root, replayId, logFingerprint, scoreFingerprint
});
```

Both roots must be canonical, nonsymlink direct children of the canonical OS
temporary directory. Source names start `pain-gain-v2-conversion-fixture-`;
destinations start `pain-gain-store-v3-fixture-`. Project, production and trial
paths fail before opening their contents. The destination must be an empty
schema-1 fixture previously created by `createFixtureStore`, or this exact
conversion's resumable destination. The source must contain
`.v2-conversion-fixture.json` with exactly
`{"fixture":"synthetic-v2-conversion","version":1}`.

The bounded source `manifest.json` has version 2 and exactly the `maps`,
`replays`, `records` and `scoreRecords` arrays. Selection uses the original
collection/replay/fingerprint key, not output-body hashes. Unselected identities
may precede the selected rows; their payloads are not opened or converted.
Selected records must already be `claim`, with active reviews (`completedAt:
null`), and matching build/map associations. The score kind is `game-metadata`
or `replay-frames`. Unknown properties, explicit null/false/zero, conflicts,
owners, reviewer IDs, timestamps and source ordinals are preserved, not repaired.

The selected-slice input contract still requires matching known build IDs.
The shared planner/verifier now preserves each record's own build-ID presence
for the [bounded/streaming callers](replay-bounded-conversion-fixture.md#optional-build-identity-synthetic-conversion-only):
an omitted identity is not filled from its replay association. This does not
broaden slice eligibility, fixture roots, limits or storage permissions.

For this narrow subset the selected map registration explicitly includes
`id`, `checksum`, `file`, `path`, `hash`, `status`; `path` equals `file`, and
`hash` is the exact saved-file SHA-256, distinct from the canonical map checksum.
The saved map must pass the existing v2 `validMap`, canonical `mapChecksum` and
embedded-checksum rules. Supporting registrations lacking the explicit
path/hash aliases is deferred, not silently synthesized into original metadata.
Output paths are local basenames. Output bytes are opaque originals: this
conversion verifies preservation, not gameplay/schema/diagnostic interpretation.

Limits are fixed: 2 MiB manifest, 1 MiB map, 8 MiB per original output,
17 MiB combined originals, eight rows per source collection, 64 properties per
entity, eight active reviews per record, 4,096 wrappers, each below 512 KiB,
64 sidecars per record, 512 destination paths and depth eight. Map/replay values
must fit 16 KiB; larger record/review values spill to immutable sidecars.
The elapsed check is cooperative at 30 seconds, not a preemptive OS deadline;
the core retains its finite lock/SQLite busy limits. Duplicate JSON keys,
identity/path conflicts, unsupported shapes and exceeded limits fail explicitly.
The manifest is consumed through
[readFixtureV2Members](replay-legacy-members.md), using its explicit `conversion`
fixture layout. There is no whole-manifest string/object in the converter.
The reader's additional hard limits also apply: 1 MiB per metadata member,
64 container levels, 128 keys per object, 256 bytes per raw key and 65,536
structural values. The converter reduces input to 2 MiB and events to 37 (five
root fields plus at most eight members in each of four collections). Inputs
exceeding either contract reject explicitly, including formerly materializable
records above 1 MiB; no limit is raised to accommodate them. This is **not** a
general overflow-preserving production converter.

The first member pass validates every collection's count and identity uniqueness,
but retains values only for the selected replay, log and score record. It retains
at most eight identity keys per collection, not all unselected record metadata.
A second pass selects the linked map, so arbitrary root collection order works
without retaining all maps. Original member ordinals are used unchanged.
Each pass has the reader's complete syntax/limit preflight and awaited callbacks;
selected metadata stays bounded, with at most one extra streamed member at a time.
The marker and terrain-map JSON still use their existing small whole-value readers;
original output payloads remain streamed and are never parsed as manifest metadata.

Streamed manifest hashes and path identity/size/mtime checks surround member
consumption. Source replacement, observed modification or interruption rejects
before destination mutation during initial input validation. Rechecks before
publication/verification still compare the exact source identity with the locked
checkpoint. Arbitrary external modifications that evade observations are not
qualified. The `input-member` synchronous fault boundary supports small-fixture
interruption tests. Caller options are copied before the new awaited input path.

## Preservation and resumability

The unchanged core supplies writer locking, transactions, output reservations,
payload ownership, exclusive publication and directory fsync. A root property
`/fixtureConversionV1` binds the source/marker hashes, exact selection, artifact
hashes/lengths and destination store ID. Its phases are:

1. `prepared`: source commitment is durable before publishing the map.
2. `reserved`: map/replay, pending records, review owners and all output/sidecar
   reservations are committed together. Pending records are not review-ready.
3. `published`: all files have been verified; both records, exact ordered
   properties and original active reviews become visible in one transaction.
4. `verified`: original/source and destination bytes and metadata have been
   checked before the final checkpoint. Repeating this state verifies without
   advancing the generation or republishing payloads.

Missing/unverifiable commitments and changed source identities fail; current
bytes are never automatically adopted as a new source. Exceptions around
publication/checkpoints leave resumable state, not duplicate records/reviews.
Core publication intents reconcile exact existing files. Conflicting/corrupt
files remain in place and cause failure. No lifecycle `done`/release is used.

Resume also resolves each output reservation by its exact record owner through
the core's bounded `readReviewCheckpoint` API on the locked writer connection.
Collection, replay ID, fingerprint, path, body hash and byte length must match
the committed input. `published`/`verified` states require a `ready` reservation;
`reserved` may contain either `pending` or `ready` files while interrupted
publication resumes. Missing or inconsistent reservations fail without repair,
even when record projections and physical bytes still match.

The shared converter planner produces leaf payload references only. Verification
under the writer lock checks one bounded child page for every planned diagnostic
or extension payload, including review-owned extensions. Any child rejects with
`CHANGED_DESTINATION` before recovery publication or verified completion. A nested
descendant necessarily introduces an unexpected direct child; verification rejects
there without traversing the corrupt tree. No rows or files are repaired/deleted.
This restriction describes this planner, not a change to the storage core's
support for valid overflow-reference trees.

The [focused descendant regressions](../../tests/unit/replay-conversion-descendants.test.js)
cover slice, bounded and streaming callers, reserved/published/verified recovery,
direct/nested corruption, unchanged rejected stores and repeated readable valid
leaves. All 24 corruption cases failed before correction; valid controls passed.
Exact before/after commands, exit codes and retained synthetic fixture locations:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/conversion-descendants-fix-20261012-OMn6Ox/`.
This correction grants no production migration readiness or renewed qualification.

The shared verifier also checks every review's exact record/task owner binding
through the locked checkpoint API. Any non-null inline review projection must
equal the complete preserved review (or the empty reserved-phase review),
including unknown fields and their presence/order. Null projections remain valid;
original property/ordinal and payload checks still apply. A mismatched binding
or projection returns `CHANGED_DESTINATION` without repair or checkpoint advancement.
This applies to both the capped slice and the separate multi-record fixture.

Converter-owned descriptor cleanup preserves the original operation error and
system code. A simultaneous close failure is attached in `cleanupFailures`;
a close-only failure is thrown normally. This applies to JSON reads, streamed
hashing/publication input and streamed byte comparisons. Storage core and shared
helper behavior are unchanged by this correction.

Original outputs/maps remain immutable files. Diagnostics use the existing
ordered JSONL envelope encoding, including repeated keys, raw whitespace and
unknown wrapper fields. Large record/review extensions use hash-addressed JSON
sidecars. SQLite holds bounded properties and references, not large bodies.
The record's `/reviews` property retains its original ordinal as an empty
structural marker; its original value is reconstructed from ordered review
owners/properties. No complete v2 export or root-layout migration is provided.
Verification streams SHA-256 and byte-for-byte comparisons in at most 64 KiB
chunks. Focused tests independently reconstruct original selected values and
wrapper order through the existing pinned snapshot/diagnostic readers.

## Focused validation and remaining gaps

Run only the slice tests with an explicitly selected supported runtime:

```sh
"$NODE24" --test tests/unit/replay-conversion-fixture.test.js
```

`NODE24` is a user-selected resident executable, not an installation instruction.
Tests generate and retain clearly labeled temporary synthetic source/store pairs
and print their locations. They cover properties/reviews/ordering, repeat and
concurrent runs, exceptions at conversion and core publication checkpoints,
source conflicts, corrupt retained bytes, duplicate keys and unsafe roots.
These exception-injection tests do not establish power-loss, SIGKILL/hot-journal,
cross-device, full-scale migration, rollback or production analyzer compatibility.

Local verification on 2026-10-11 used resident Node 24.19.0 / SQLite 3.53.3:
38 slice tests and four selected core API/publication tests passed. New JavaScript
syntax, changed-file whitespace and local document links were checked. No full
suite or paused qualification ran. Receipt directory:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/v2-conversion-slice-20261011-lKP3x2/`.

The scoped P2 correction was verified separately on the same Node 24 runtime:
both reproduced regressions failed before the converter fix; afterward all
71 slice tests and four selected core tests passed. New cases cover log/score
reservation ownership, path, hash, length, readiness and absence in both
published and verified resumes, plus operation/close failures in all three
converter-owned descriptor paths. Existing interruption and concurrent-resume
tests still pass. Before/after and preservation receipts:

`/Users/zoltanka/.local/share/pain-and-gain-evidence/v2-conversion-fixes-20261011-AIGR0D/`.

The member-reader integration uses newly generated small fixtures only. The
whole-manifest-read regression failed before integration; focused cases cover
arbitrary root ordering, source replacement/modification, truncated input,
unsupported root metadata, duplicate unselected identities and reader/converter
limits. The existing reconstruction, reservation, descriptor-failure and recovery
tests remain unchanged. Integration verification and preservation receipts:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/conversion-members-20261011-SZQxoz/`.
Recorded validation on Node 24.19.0: 85 converter tests (71 existing plus 14
integration cases), 42 reader tests and two explicitly selected small legacy
compatibility tests passed. Core validation is reused with unchanged core bytes.

The earlier member-reader compatibility-filter mistake ran 11 compatibility tests
and both excluded 600 MiB synthetic cases. That historical scope exception remains
disclosed and is not renewed qualification; those cases are excluded here.

Missing work remains explicitly outside this slice: general source variants and
root layout/retired records, scalable production scanning, backup/restore and
cutover fencing, migration/export reconciliation, importer/analyzer dispatch,
whole-corpus resource qualification, and the separate raw-HTTP admission gap.
No catalog extension or diagnostic occurrence index is added.

M2h remains paused and unqualified; lost historical supporting evidence is not
restored by these tests or accepted merely because old receipts exist. Earlier
Git-blob hydration and the separately observed pack residency change (cause
unestablished) remain historical disclosures. Trial placeholders are untouched.
No production-readiness, whole-match completeness or automatic-collection claim
follows from successful fixture conversion.

## Separate bounded multi-record fixture

The [multi-record fixture contract](replay-bounded-conversion-fixture.md) adds a
separate entry point using this slice's bounded planning and verification helpers.
It does not broaden `convertFixtureV2Slice` permissions or limits. Production is
still managed v2. Its additional legacy variants and tests are qualified separately.
The historical 129-case integration's combined 125-pass transcript lacks a captured
process exit code due to an orchestration error; later focused exit codes remain
recorded. That limitation is not retroactively erased by new passing tests.
