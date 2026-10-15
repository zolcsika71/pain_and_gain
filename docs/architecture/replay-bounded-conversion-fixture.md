# Bounded multi-record v2 conversion — synthetic only

This opt-in integration consumes production-shaped v2 collections in **newly
generated synthetic roots only**. It is not a production converter, migration,
cutover, export, rollback or replacement for managed v2. Production capacity is
still unresolved. M2h remains paused/unqualified; its lost evidence is not restored.

A [separately guarded backup-rehearsal interface](replay-backup-rehearsal.md)
reuses this machinery with its own receipt-bound scope. Existing fixture exports,
root guards and capacity defaults remain unchanged. Real-backup execution remains
a separately authorized gate, not enabled by the synthetic validation here.

It reuses the [member reader](replay-legacy-members.md), the
[slice](replay-conversion-slice.md)'s planning/reservation/property/byte verifiers,
and [schema-1 core](../../tools/replay-store.js), following
[ADR 0006](../decisions/0006-replay-storage-v3.md). The capped slice entry point
retains its existing input limits, defaults and root permissions.

## API and supported subset

```js
await convertFixtureV2Bounded({synthetic: true, sourceRoot, root});
```

Implementation: [replay-conversion-bounded-fixture.js](../../tools/replay-conversion-bounded-fixture.js).
There is no CLI, default root or production dispatch. Source is a canonical
direct OS-temporary `pain-gain-v2-reader-fixture-*` root with the existing reader
marker and `replay_logs/manifest.json`. Destination is a distinct, already-created
empty schema-1 `pain-gain-store-v3-fixture-*` root, or this exact job's resumable
store. Aliases, production/backup/cache/trial paths and dataless inputs reject.
Node major 24, version 24.19+, and the existing macOS/local-APFS declaration apply.

Supported inputs include multiple validated maps, active map-linked replay
associations, file-backed logs and metadata/frame score records, empty or populated
reviews, and all core log/score status vocabularies. Original statuses are restored
inside the publication transaction; no review completion or retirement executes.
Non-ready legacy records remain non-ready to analysis even when conversion verifies.
Absent optional score/retired collections remain absent; empty ones remain present.
Unknown supported root/entity/review values, null/false/zero, property and array
ordinals, owners, conflicts and duplicate diagnostic occurrences are retained.

### Optional build identity (synthetic conversion only)

For log records, score records and replay associations, `buildId` may be omitted
or a present lowercase 64-character hexadecimal string. Omission remains an
absent original property, including during pending publication and repeated or
interrupted resume. The existing SQLite indexed projection is SQL `NULL` when
absent; that does **not** insert a JSON `buildId: null` property.

Legacy **log records only** also accept an explicit `buildId: null`, matching
the existing v2 log writer's unknown-provenance representation. The original
property stays present and null in pending/final properties, reconstruction and
source commitments; it is never removed or filled from an association. Null and
omission share the existing SQL `NULL` index projection, not authoritative JSON
metadata. Score records and replay associations still reject explicit null.
Empty strings, wrong non-null types and malformed IDs remain `UNSUPPORTED_STATE`.

Known record and association build IDs must agree when both are known. An
omitted value or legacy log null is never inferred from the association, another record,
`embeddedBuildId`, filename or current build. In particular, a score's original
`embeddedBuildId: null` remains a separate present null property. Map linkage
and genuine known-build conflicts remain enforced. Complete ordered properties,
source commitments and own-record indexed projections are verified under the
existing lock; reservation, review-binding and diagnostic-leaf checks are unchanged.

This applies to `convertFixtureV2Bounded` and all streaming capacity profiles,
not the older selected-slice input contract. Small retained regressions live in
[`replay-conversion-build-id.test.js`](../../tests/unit/replay-conversion-build-id.test.js).
Retained synthetic tests cover null/omitted/known logs, pending provenance,
publication interruptions, repeated resume, strict map/replay linkage and changed
source rejection. The separate rehearsal interface uses this same validation;
its new coverage uses only generated flat/nested synthetic backup inputs.
The real rehearsal's retained failed destination is untouched and its execution
authorization remains exhausted. Later real-data gates remain unassessed; review
and renewed authorization are required before any new real run.

Capacity ceilings remain unchanged: accepting unknown build metadata does not establish backup compatibility,
production migration readiness or renewed M2h qualification.

### Historical replay fingerprints (synthetic conversion only)

The v2 log lifecycle explicitly stores retired log identities in each replay's
`retiredFingerprints` array: see `cleanup` and `associateReplay` in
[`replay-logs.js`](../../tools/replay-logs.js). This is not inferred from missing
records. Following [ADR 0006](../decisions/0006-replay-storage-v3.md), bounded and
streaming conversion now preserve a present array of unique lowercase 64-hex
strings, including its original order. Omitted stays omitted; empty stays empty.
Null, non-arrays, malformed IDs and duplicates reject. Unknown association fields
and omitted build identities remain unchanged.

Each listed identity is projected as `(log, replayId, fingerprint)` into the
existing `retired` index, with its array ordinal and no original entity properties.
The exact original array stays in replay properties; no source record, output,
review, retirement event, timestamp or build identity is invented. The replay,
retired projections and replay progress checkpoint publish in one transaction.
Every resume checks their identities/ordinals, exact association properties,
absence of invented retired properties/payloads (including non-root payloads),
and the complete retired count under the existing writer lock. A bounded point
query in `readReviewCheckpoint` exposes the retired projection and any first
owned payload; it does not traverse payloads or perform retirement.

A current **log** with the same replay-qualified historical fingerprint rejects
before mutation, regardless of status. Current records still require their own
valid active map/build links and verified artifacts. A score with the same hex
fingerprint is a different collection identity, not that historical log. Equal
fingerprints in different replays are likewise distinct. Nonempty
`retiredScoreSources` remains unsupported. The original selected-slice contract
and all capacity defaults remain unchanged. The existing 16 KiB inline replay
limit bounds each history array (at most 244 64-byte IDs even without other
metadata); existing association-count, input, memory and deadline limits bound
the total. No larger capacity setting is introduced.

Supported `getRecord` access distinguishes `retired`, `missing` and current
metadata. Selecting a historical identity for a payload snapshot fails: retention
of its fingerprint does not establish source availability or successful historical
qualification. Tests in
[`replay-conversion-history.test.js`](../../tests/unit/replay-conversion-history.test.js)
cover exact reconstruction, conflicts, corruption and interrupted/repeated resume.
This is preservation of synthetic historical metadata, not execution of production
retirement, cleanup or migration.

Map registrations need only original `file`/`checksum` fields, not invented
`path`/`hash` aliases. A narrow optional `mapArtifact` insert argument supplies the
verified indexed file/hash without adding original properties. Conflicting aliases
reject. Two bounded core metadata accessors expose collection headers and entity
counts for final preservation checks. The reproduced lock-cleanup error path now
attaches cleanup failures to the original operation error rather than suppressing
them; no schema or production entrypoint changes.

Explicitly unsupported: evidence-only/null outputs, mapless/deferred associations,
nonempty score-retirement identities, omitted/null review objects, nonvalidated maps,
non-active replay associations, nonlocal artifact basenames and oversized values.
Numeric object-property names are rejected rather than reordered by native JSON;
negative zero, nonfinite numbers and unsafe integral numbers are rejected rather
than silently normalized. Unknown properties are not omitted: within limits they
are retained, otherwise the entire conversion fails. This is a supported subset,
not universal v2 compatibility.

## Fixed limits and memory

Limits are declared before evaluation and may only be reduced with ordinary
data-property `limits` options. Accessors/custom prototypes reject; options and
nested limits are privately copied before async processing.

| Resource | Maximum |
| --- | --- |
| Input / materialized member | 16 MiB / 1 MiB |
| Members per collection / root fields | 8 / 32 |
| Metadata properties / reviews per record | 64 / 8 |
| Diagnostic wrappers / wrapper encoding | 4,096 / less than 512 KiB |
| Map / output / total original bytes | 1 MiB / 8 MiB / 136 MiB |
| Sidecars per record | 64 |
| I/O chunk | 64 KiB |
| Reader values / depth / keys per object | 65,536 / 64 / 128 |
| Reader events | 32 + 5 × 8 |
| Existing destination paths / traversal depth | 4,096 / 8 |
| Cooperative elapsed / heap / RSS checks | 60 seconds / 256 MiB / 512 MiB |

Map/replay/root values must fit 16 KiB each; larger record/review properties spill
through the existing immutable payload encoding. These checks bound accepted
data, not arbitrary filesystem latency or a deliberately nonreturning test fault
callback. Focused test subprocesses additionally have a 180-second outer timeout.
Existing core lock and SQLite busy bounds remain in force.

The reader preflights grammar, duplicate keys and member limits before callbacks.
Repeated awaited passes trade speed for boundedness. Only bounded map/replay
metadata, identity/path sets and artifact digests survive between records. There
is no whole-manifest string/object or accumulated log/score corpus. One bounded
record's diagnostics are still materialized by the member API (at most 1 MiB);
publication and comparison emit ordered envelopes/chunks incrementally with
backpressure. This capped entrypoint does not stream diagnostic input; the
separate opt-in path below does. General sub-value overflow remains unsupported. Original
log/score bytes remain opaque immutable files, never SQLite blobs.

## Commitments, recovery and verification

A root metadata checkpoint `/boundedFixtureConversionV1` binds source root,
manifest hash/length/stat identity, marker hash, artifact hashes/lengths and store
ID before any publication. It is administrative metadata, not a legacy property;
an input property with that name rejects. Collection rows preserve root ordinals;
other root properties retain their own original ordinals.

Under the existing writer lock, maps/replays are committed in dependency order,
then logs and scores are consumed one member at a time. Per-record reservations
and the current-record checkpoint commit atomically before publication. Original
bytes and diagnostic/extension payloads publish through existing durable APIs.
Exact properties, review owners/statuses and record progress commit together only
after verification. Resume verifies prior progress, source commitments, reservations
(owner/path/hash/length/readiness), original properties and file bytes; it never
repins changed input or repairs corruption. Repeated completed runs do not advance
generation. Concurrent attempts serialize onto one store/job. Partial artifacts
are retained; only normal synthetic writer-lock/temporary publication lifecycles
run, not evidence cleanup.

All payloads produced by this planner are leaves. The shared locked verifier now
requires an empty bounded child page beneath each planned diagnostic, record
extension and review extension, both before recovery publication and after record
publication/verified resume. Any unexpected descendant rejects at its first child;
there is no recursive corruption traversal, repair or deletion. The storage core's
valid overflow-tree APIs are unchanged. This rule also covers the opt-in streaming
path below. See the [descendant regressions](../../tests/unit/replay-conversion-descendants.test.js)
and correction receipts under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/conversion-descendants-fix-20261012-OMn6Ox/`.

Review consistency includes every expected owner binding and the complete value
of each non-null inline projection, not only claim/examined/completion fields.
Null projections remain supported and their original properties are still checked.
Corrupt bindings/projections reject without repair in reserved, published and
verified resumes. Focused correction evidence is retained under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/conversion-review-binding-fix-20261011-3WZbFY/`.
The earlier implementation's automatic disposal of newly generated core-test
fixtures and absence of a complete pre-edit census remain verification limitations;
the correction retains its new fixtures and does not rerun those core tests.

Source hashes/stamps are checked between passes and again around the final
verification checkpoint. Final checks include original artifact hashes, streamed
byte comparisons, all selected properties/reviews, root and collection layout,
entity counts and absence of remaining publication operations. These are
conversion-preservation checks, not gameplay/diagnostic semantic validation.

## Focused validation and limits of the claim

[Tests](../../tests/unit/replay-conversion-bounded-fixture.test.js) generate retained
small synthetic roots. They independently reconstruct records/reviews/diagnostics,
compare original artifact bytes and check SQLite integrity/foreign keys. Cases
cover interruption checkpoints, repeat/concurrent resume, all accepted statuses,
source changes, unsafe roots, unsupported values, reduced limits, reservation and
collection corruption, callback mutation and operation-plus-cleanup errors.

```sh
"$NODE24" --test tests/unit/replay-conversion-bounded-fixture.test.js
```

Do not run full suites, historical 600 MiB cases, historical Git-object tests or
paused qualification. Task receipts and exact final commands/exit codes are under:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/bounded-conversion-20261011-Ts7Zj0/`.

The earlier 129-case integration retains its documented exit-code limitation:
the combined 125-pass transcript was captured, but orchestration failed before
recording that process's exit code; later focused commands have recorded exit 0.
Do not retrospectively convert the missing exit code into a verified zero.
Historical accidental large-test runs, Git-blob hydration, unresolved pack
residency change and lost M2h evidence remain disclosed in the linked contracts.

Remaining production gates include additional legacy variants/overflow input,
independent real-copy preservation, resource/power-loss/hot-journal qualification,
complete consumer integration, authority fencing and lossless rollback. The
separate raw-HTTP admission gap is unchanged. The verified operational backup
does not authorize accessing its contents or running conversion against it.

Readiness is limited to tested synthetic cases; this adds no production migration
readiness, renewed M2h qualification, automatic collection or analysis alignment.

## Opt-in streaming diagnostics

```js
await convertFixtureV2Streaming({synthetic: true, sourceRoot, root});
```

This separate export uses `readFixtureV2DiagnosticMembers` from the existing
[reader module](replay-legacy-members.md#opt-in-diagnostic-collection-streaming).
It shares the bounded converter's root guards, record/link/review validation,
writer lock, checkpoints, reservation verification and immutable publication APIs.
Neither `convertFixtureV2Bounded` nor the capped slice raises a limit or enables
streaming implicitly. There is no CLI, production dispatch or migration activation.

The fixed streaming additions are 4 MiB diagnostic JSON per record, 4,096
wrappers, 64 KiB per wrapper and 32 KiB per scalar token. Non-diagnostic record
metadata is still at most 1 MiB; all other converter caps above remain, including
eight records per collection and the 60-second cooperative deadline. Test process
timeouts are 180 seconds. These are small synthetic bounds, not production capacity.

Only bounded property spans/metadata and one wrapper are resident at a time.
The reader's null layout marker is never stored as the original diagnostic
value: the shared planner emits a diagnostic payload reference at that exact
property ordinal. Existing `diagnosticChunks` encodes each complete wrapper
with its occurrence ordinal; publication awaits chunks, hashes and verifies
the bytes, then marks references ready under the existing contract. Manifest
formatting is not copied into JSONL; wrapper values, unknown fields, array/order
and exact `raw` string values are. Existing `iterateDiagnostics` reads the result.
Other original output and map bytes remain immutable, byte-compared files.

The source commitment includes `diagnosticStreaming: 1`, preventing silent
cross-mode resume. Every pass rechecks source fingerprints. The pinned iterator
is used only inside its awaited member callback; no descriptor or diagnostic
array is retained between passes. Resume recomputes the ordered payload hash,
validates output and diagnostic reservations (including item count, ordinal,
encoding and readiness), and compares retained bytes before verified completion.
Review owner/inline-value checks and primary/cleanup error handling are unchanged.
Conflicting sources, malformed data, unsupported values and corrupt files or
references reject; partial artifacts remain retained.

Focused verification uses [small streaming fixtures](../../tests/unit/replay-diagnostic-streaming.test.js)
and existing capped-converter/member tests. Exact commands, exit codes, hashes
and retained fixture locations are recorded outside the repository:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/diagnostic-streaming-20261011-o0Sy4A/`.
The earlier implementation's fixture-disposal and incomplete pre-edit-census
limitations, historical missing exit code, hydration/residency disclosures and
lost M2h evidence remain unchanged. This task does not renew qualification.

Remaining gaps include larger individual scalar/wrapper overflow, other large
metadata/reviews, unrestricted corpus sizes and unsupported legacy variants,
production resource/durability verification and consumer/cutover/rollback work.
The oversized production manifest remains untouched and unsupported.

## Expanded synthetic capacity

```js
await convertFixtureV2Streaming({
  synthetic: true, sourceRoot, root, capacity: 'expanded-synthetic-v1'
});
```

This explicit profile changes no defaults, capped-slice permissions, production
commands or schemas. Only guarded synthetic reader/store roots are accepted.
Capacity and nested numeric overrides are copied into private validated state;
accessors, inherited options, unsupported profiles and nonfinite overrides reject.
`convertFixtureV2Bounded` does not accept a capacity option.

Fixed maxima, chosen before evaluation:

| Dimension | Expanded maximum |
| --- | ---: |
| Manifest input | 64 MiB |
| Raw diagnostic array per log | 16 MiB |
| Wrappers per log | 8,192 |
| Logs / score records | 320 / 128 |
| Maps / replay associations | 64 / 64 |
| Structural values per scanner pass | 1,000,000 |
| Cooperative elapsed time | 600,000 ms |
| Heap / RSS | 256 / 512 MiB |

`limits` can only reduce the profile maxima. Named `records`, `scoreRecords`,
`maps` and `replays` limits replace the common eight-member cap for those four
collections; `retiredScoreSources` must still be empty. Other bounds remain:
1 MiB non-diagnostic metadata, 64 KiB wrappers, 32 KiB scalar tokens, depth 64,
64 properties, eight reviews per record, 32 root properties/collection headers,
8 MiB original output, 136 MiB total original artifacts and 4,096 destination
paths. Scanner/stream I/O remains 64 KiB; bounded map/marker reads can still
materialize their existing capped small objects. This is not universal 64 KiB
allocation or engine-level cancellation. Blocked I/O/nonreturning callbacks can
outlast the cooperative deadline.

Collection members and diagnostics are consumed incrementally. In-memory sets
contain only capped record identities (448), map/replay metadata (64 each), and
artifact descriptors (512), not a record corpus or diagnostic array. Expanded
checkpoints commit the ordered artifact inventory's streamed hash, byte length
and count, rather than serializing that inventory into an oversized inline
identity. Every resume rebuilds and compares this commitment and the source
fingerprints. The profile identifier prevents cross-mode resume. Progress keys
remain bounded by these collection limits; final record verification uses the
existing paginated store API rather than assuming one page contains all records.

Writer locking, reservation ownership/path/hash/length/readiness, review-owner
and complete inline-value checks, leaf-descendant rejection, source checks,
immutable payload comparison and operation/cleanup error separation are retained.
Larger count limits do not remove repeated source verification passes or change
conflict/recovery semantics. Partial artifacts remain retained on rejection.

[Capacity tests](../../tests/unit/replay-conversion-capacity.test.js) separately
exercise an input above 16 MiB with diagnostic arrays above 4 MiB, and the
inventoried 291 logs, 95 scores, 45 maps and 45 replay associations using small
metadata. They verify downstream diagnostic order/values, reviews, original
artifact hashes, stable repeated resume, interrupted publication, changed inputs,
option mutation, finite/reduced limits and the exact 8,192-wrapper reader boundary.
Parser/read instrumentation and sampled process memory describe only tested
fixtures, not a proof of peak memory for every supported metadata shape.

Exact commands, exit codes, measurements, candidate hashes and retained synthetic
artifact locations are in the external capacity receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/conversion-capacity-20261012-TbWUkq/`.
No full 533,731,722-byte production-sized manifest is generated or supported by
this 64 MiB profile. Maximum wrapper/scalar dimensions, maximum metadata at every
record, all profile ceilings together, power-loss durability and production
integration remain unqualified. Prior missing-exit-code, fixture-disposal,
incomplete-census, accidental-large-test and hydration/evidence-loss disclosures
remain in force. Production migration and M2h remain paused/unqualified.

## Backup-sized synthetic profile

```js
await convertFixtureV2Streaming({
  synthetic: true, sourceRoot, root, capacity: 'backup-sized-synthetic-v1'
});
```

This opt-in profile inherits `expanded-synthetic-v1` unchanged except for:

| Dimension | Profile maximum | Recorded backup requirement |
| --- | ---: | ---: |
| Manifest input bytes | 629,145,600 (600 MiB) | 533,731,722 |
| Structural values per scanner pass | 8,000,000 | 5,736,411 |
| Total original artifact bytes | 335,544,320 (320 MiB) | 244,622,392 |

Requirements come from the resident assessment receipt, not a new backup read:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/backup-capacity-assessment-20261012-TWQIba/report.json`.
Numerical headroom does not establish successful full-size conversion. This
profile still rejects production, backup and trial roots; source/destination
must be newly generated guarded synthetic fixtures. No CLI or activation is added.

The private options/limit snapshots feed both source fingerprinting and every
reader pass. Structural counters reset per scanner pass, not per emitted record
in the initial complete scan. Cumulative original-artifact accounting includes
every map and selected log/score output exactly once, checks remaining capacity
before addition, and rejects non-safe lengths. It is a retained-original-byte
budget, not a total-I/O or generated-sidecar budget. Per-file caps remain 1 MiB
maps and 8 MiB outputs; diagnostics, paths and sidecars keep their existing bounds.
Copying and final verification reuse exact planned hashes/lengths and bounded
chunks. Ordered artifact commitments and the explicit profile identifier remain
part of source identity; cross-profile resume rejects rather than repinning.

Every resume reruns full preflight accounting under the invocation's reduced
limits before publishing or accepting a verified checkpoint. Tightening a budget
below retained requirements rejects even a completed job. It does not reset
charges, count copies as new artifacts, or bypass source-change detection.
History/identity rules, reservations, review bindings, leaf checks, locked
transactions and operation/cleanup error handling are unchanged. The source
verification boundaries below avoid per-entity full-manifest hashing.

The [focused tests](../../tests/unit/replay-conversion-backup-capacity.test.js)
use only small retained fixtures: exact and one-less input/value/cumulative
budgets, separate files that each fit but cumulatively exceed the cap, invalid
and mutated options, awaited bounded processing, interrupted/repeated and
cross-profile resume, and changed input during publication. No full-size fixture
or historical 600 MiB test is run. Full-size memory/time, combined maxima,
power-loss durability, all backup formats and production integration remain
untested. Existing limits on larger wrappers/scalars, score-retirement input
and unsupported metadata remain. Production migration and M2h stay paused.

## Bounded source verification boundaries

The converter formerly called a full-manifest SHA-256 check before/after each
map and record publication and before each association. With `M` new maps, `R`
new associations and `N` new log/score records this required up to
`14 + 2M + R + 2N` full-manifest hashes. The reader's structural scans, downstream
diagnostic reads, original-artifact comparisons and external harness reads are
separate I/O, not additional calls to that full-file fingerprint helper.

The bounded/streaming converters now retain full byte hashes at these barriers:

- Initial source commitment, then before/after each of four member-reader visits.
- Before opening the destination, and again under its writer lock.
- Final source validation; for a newly completed job, checks immediately before
  the verified transaction and after its post-publication callback as well.

This is at most **14 full-manifest hashes** for new/interrupted conversion and
**12** for an already-verified resume, independent of entity count. Existing
profile ceilings, the original capped-slice call path and production commands
are unchanged. These counts exclude the unchanged reader's complete traversals.

The first content-verified visit builds a finite map of event identities,
ordinals, spans and SHA-256 digests for each member/root property. Collection
headers retain exact shape/count/span descriptors without rehashing their entire
arrays. Descriptor count is capped by the existing derived event budget. Each
later event must match its original descriptor and content before and after its
awaited processing. Map/association and record reservation/publication boundaries
also check their own original member range. Range hashing reuses the existing
64 KiB fingerprint iterator and descriptor cleanup; offsets are safe integers,
bounded by the pinned file size, and never bypass the whole-input size ceiling.
No complete records or diagnostic arrays are retained by these proofs.
Disjoint member/property ranges add at most ten manifest-byte equivalents on a
new conversion (eight across the four visits, at most two at publication) and
eight on an already-verified resume. Thus fingerprint I/O is at most 24 and 20
input-byte equivalents respectively, excluding reader/payload traversal.

The existing whole-source hash commits every byte, including order, whitespace
and collection syntax. Range proofs are rebuilt on every invocation from that
source; they are not trusted from timestamps, saved offsets or a caller cache.
There is no checkpoint/identity format change, so unchanged existing jobs remain
resumable. File identity/size/time and marker checks are still early detectors,
but neither they nor a range check replace phase/final full-content verification.

A change to an unrelated, already-processed or future member may now be detected
at its next check or phase/final barrier rather than at every intervening entity.
Partial checkpoints still bind the original source hash and cannot be resumed
against a different source. No failed invocation returns verified completion.
As before, an error after the verified transaction can leave that transaction
retained; the next invocation revalidates source, commitments and payloads before
accepting it. This is not a source-writer lock or an atomic filesystem snapshot.

Payload planning, reserved hashes/lengths, streamed copies, complete review
bindings/projections, history/leaf checks and byte-for-byte final comparisons are
unchanged. Derived diagnostics are separately bounded, not charged as original
artifact bytes. New range reads add constant-volume verification work: small
inputs and already-verified resumes may read more, despite removing the
entity-count multiplier from new-conversion full-file hashes.

[Small retained regression fixtures](../../tests/unit/replay-conversion-source-reads.test.js)
measure only reads within converter invocation, separately classifying full/range
manifest hashing, reader scans, original artifacts and destination reads. Setup,
assertions and native SQLite I/O are excluded. They exercise same-length content
mutations with restored timestamps, phase boundaries, replacement, changed
resume sources, interrupted publication, corruption and unchanged resume. No
full-size rehearsal is repeated for this optimization, and no full-size speedup,
production conversion, cutover or renewed M2h qualification is established.

Measured small fixtures, each with one map/association and one score:

| Logs | Full hashes before → after | Manifest read bytes before → after |
| ---: | ---: | ---: |
| 1 | 21 → 14 | 84,084 → 88,373 |
| 8 | 35 → 14 | 496,146 → 411,017 |
| 32 | 83 → 14 | 3,140,190 → 1,519,777 |

Manifest reads combine hashing and reader traversal, excluding fixture setup
and verification assertions. Verified resume still performs 12 full hashes;
its added range checks increased those reads (32-log case: 1,146,756 → 1,365,196).
The instrumented small tests also took longer because additional bounded opens,
residency checks and range checks outweigh tiny-file read savings. This is an
I/O-amplification improvement as records grow, **not a demonstrated wall-time
speedup**. Exact commands, counters, intermediate failure, retained fixtures and
preservation limits are recorded in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/conversion-source-reads-20261012-U9igmX/`.
