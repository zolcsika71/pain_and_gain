# ADR 0006: Replay storage v3 with an operational index and immutable payloads

Status: Accepted storage and replay-catalog design; isolated synthetic M1 implemented; pending M1/C1 corrections and F5 passed their focused reviews, with separate candidate preparation recorded below; production integration and migration not implemented or authorized by this document.

C1 implementation/qualification: [isolated catalog record](../architecture/replay-catalog-c1-2026-10-04.md).
Dependency-separated candidate scope: [audit consolidation](../architecture/audit-candidates-2026-10-04.md).

Date: 2026-10-03 (Europe/Budapest).

Catalog contract added: 2026-10-04. This documentation decision defines a separate
implementation task; it does not extend M1's qualification.

## Context

Compact serialization repaired the reproduced Node single-string failure, but
version-2 storage still reads and rewrites every retained response for routine
operations. The [performance and recovery record](../architecture/replay-import-performance-2026-10-02.md)
documents that repair and its capacity limit. This decision changes local Node
tooling, not Arena runtime code, evidence interpretation, or retention policy.

The bounded structural investigation at main commit
52dba8bb8216afad12615f1a2098a0dfba7733b3 measured:

| Contributor | Bytes |
| --- | ---: |
| Log otherEntries | 469,562,405 |
| Score validation | 4,614,779 |
| Log diagnosticCoverage | 163,551 |
| Remaining metadata and JSON overhead | 469,770 |
| Complete manifest | 474,810,505 |

There are 270 log records, 82 score records, 42 maps, and 42 replay associations.
The 957,196 retained otherEntries occupy 98.89% of the manifest. Raw diagnostic
strings occupy 353,174,806 bytes; escaping/wrappers account for the remaining
116,387,599 bytes. No repeated (source key, raw entry) pairs were found within
replays across retained records. Parsed diagnostic objects are not also stored
beside those strings. Neither duplicate removal nor automatic review completion
is a justified remedy. The largest log record is 2,874,092 bytes and the largest
diagnostic wrapper is 4,584 bytes.

The profile streamed 64 KiB chunks, parsed one collection element at a time,
and imposed a 64 MiB element ceiling and 60-second deadline. It took 7.37 seconds
with 410,583,040 bytes peak RSS, including corpus-wide duplicate-hash bookkeeping.
These measurements are not storage-v3 performance predictions. They are reused
here; no capture analysis or production rehearsal is required to write this ADR.

## Decision

Use SQLite for small operational metadata and indexed ownership/identity
lookups. Store diagnostics, detailed derived summaries, and large opaque
extensions in immutable, response-owned files. Keep existing JSONLs, raw score
responses, maps, analysis reports, audit artifacts, and backups in place.
Storage must not materialize the accumulated corpus as a JSON string, buffer,
array of hydrated records, SQLite value, or export document.

### Alternatives and consequences of the choice

- Streaming the existing monolith addresses serialization but not routine
  whole-corpus reads or rewrites; it is insufficient alone.
- Per-record JSON metadata is feasible without a database, but would require
  a custom cross-record transaction/index journal for ownership, retirement,
  map association, and review updates. SQLite supplies those transactions and
  indexes; a small file-operation journal is still necessary.
- Putting the whole manifest, or all diagnostics, into one SQLite TEXT/BLOB
  merely relocates the large-value problem and is rejected.
- External database services, npm SQLite drivers, compression, content-level
  evidence deduplication, automatic garbage collection, and log reduction are
  not part of this decision.

### Runtime and filesystem contract

The initial tooling-runtime target is Node 24.x, at least 24.19.0; Node
24.19.0 is the measured availability baseline, not a storage qualification.
Storage tests and rehearsal remain release gates. Other major versions are
unsupported until separately qualified. Required built-ins are node:sqlite,
node:fs, node:crypto, and the existing parser dependencies. Require SQLite at
least 3.53.3, prepared get/run/iterate statements, read-only connections,
transactions, foreign keys, busy timeout, and the SQLite backup API. Detect
version/capability failure before creating a lock, file, or database. No shell
sqlite executable, downloadable extension, or npm dependency is required.
Patch updates must pass the storage tests before production use.

The installed baseline exposes SQLite 3.53.3. The Node API has release-candidate
stability, not a stable-API guarantee; see the
[version-specific Node documentation](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html).
Keep this dependency behind the store interface.

The initial production-filesystem target is a local macOS APFS volume with
functioning hard links, same-filesystem atomic rename, regular non-symlink files, file and
directory fsync, and POSIX open-file lifetime after unlink. Linux, Windows,
network/removable filesystems, and actively synchronized folders are not
qualified by the current investigation. A later platform qualification must
prove the same contracts. The operator declares local-volume eligibility;
capability checks cannot prove power-loss behaviour or detect every remote
filesystem. Unsupported declarations, failed probes, unsafe paths, or an
unsupported runtime cause an explicit error, not a weaker fallback.

Use rollback-journal DELETE mode, synchronous=FULL, foreign_keys=ON,
mmap_size=0, and an 8 MiB suggested SQLite page-cache setting. Establish DELETE
mode at creation and check it on later opens; do not silently change an existing
store's persistent journal mode. Set and verify connection-local settings on
every connection before transactions, including a 5,000 ms busy timeout.
Read-only connection settings may not write persistent state. WAL and memory/off
journals are unsupported; SQLite must not fall back to weaker settings.
Read back the effective values because unsupported PRAGMAs can be silently
ignored; see SQLite's [PRAGMA contract](https://sqlite.org/pragma.html).
Full durability assumes that OS/filesystem/device flushes work as advertised;
process-crash tests do not prove survival of arbitrary power loss. SQLite
explains these assumptions in its
[atomic-commit documentation](https://sqlite.org/atomiccommit.html).

### Descriptor and layout

The following is a proposed format, not currently present production data:

~~~text
replay_logs/
  manifest.json                         small v3 descriptor
  store-v3/<store-id>/
    index.sqlite                        operational metadata
    diagnostics/<prefix>/<owner>/<hash>.jsonl  ordered response wrappers
    summaries/<prefix>/<owner>/<hash>.json    one derived JSON value
    extensions/<prefix>/<owner>/<hash>.json   one opaque JSON value
  existing *.jsonl, *.response, maps, reports, caches and local_audits/
~~~

~~~json
{
  "version": 3,
  "storage": "sqlite-sidecars",
  "schemaVersion": 1,
  "payloadVersion": 1,
  "storeId": "<uuid>",
  "database": "store-v3/<uuid>/index.sqlite"
}
~~~

The descriptor identifies a store, not a record/build or analysis generation.
It contains no corpus data. The database stores a transaction generation,
schema version, store ID, and migration receipt. They must agree with the
descriptor. Open never creates a missing database. Reject unknown versions,
mismatches, traversal, absolute references, symlinks, nonregular files, and
resolved paths outside the declared store/root. New files use exclusive
creation and mode 0600; new directories use 0700.

Payloads use SHA-256 of their exact saved bytes, sharded by the first two hex
characters, and a format-qualified path. The owner directory is SHA-256 of the
canonical JSON tuple (owner kind, owner key, JSON pointer); a record owner key
contains collection, replay ID and fingerprint. Each file has one owning record/field;
there is no cross-record reference counting or shared-payload deletion. The
owner is checked in the database even when two fields have identical bytes.
The owner directory is mandatory, not a collision-time naming choice. Existing
evidence files keep their current names and identities.

### Schema and preservation invariants

Use STRICT tables. The following names, keys, and responsibilities are the
schema contract; SQL implementation belongs to milestone M1:

| Table | Key / required indexed columns | Retained contents |
| --- | --- | --- |
| store_meta | Singleton store ID; schema/payload version; generation | Migration identity/receipt and original root layout |
| collections | Collection name | Present/absent flag and original root property ordinal; optional empty arrays remain present |
| maps | Original map ID; unique owned map path | Original registration properties/checksum/status and ordinal |
| replays | Original replay ID; map ID/status indexes | Original association properties, build association, and ordinal |
| records | (collection, replay ID, fingerprint); replay/status/ordinal indexes | Log or score metadata, source identity, build/map fields, nullable output references, counts and ordinal |
| reviews | (record key, exact task ID); per-record index | Original review value, property ordinal, checkpoint projections and unknown fields |
| retired | (collection, replay ID, fingerprint) | Log retired-fingerprint ordinal or exact score tombstone, including extensions; no invented map/build dependency |
| payloads | (owner kind, owner key, JSON pointer); parent-pointer index | Role, encoding, relative path, bytes/hash, item count where applicable, publication state and parent reference |
| properties | (owner kind, owner key, JSON pointer); ordinal index | Original property presence/order, small JSON value or payload reference |
| outputs | Unique normalized project-relative path; unique record owner | Existing evidence-file ownership and expected byte hash |
| operations | Unique operation ID; record/phase indexes | Durable publication/cleanup intent, exact expected paths/hashes and progress |
| operation_files | (operation ID, file ordinal); owner/path indexes | Per-file expected hash/bytes, publication/deletion phase and original presence; paginated, not an unbounded intent JSON array |
| migration_progress | Source hash and completed source ordinal | Staging-only checkpoints and preservation receipts |

Identifiers, paths, JSON pointers and original timestamps are TEXT with BINARY
comparison. Fingerprints/map IDs are validated lowercase 64-character hex;
replay IDs are lowercase 24-character hex. Counts, byte lengths, generations
and ordinals are nonnegative INTEGER, read as BigInt when they exceed JavaScript
safe-integer range; generation exhaustion fails rather than wrapping. JSON
values retain original numeric/boolean/null types in JSON text or streams, not
through SQLite coercion. Every inline JSON TEXT is checked at at most 65,536
UTF-8 bytes. Large original values use payload references. Oversized structural
identifiers/property names are an explicit resource error with original input
retained; value spill is not permission to truncate an index key.

Use record keys as composite foreign keys for reviews, outputs and operations;
payload/property owners must resolve to exactly one declared entity/field.
Owned payload paths are unique. Record status is checked against the existing
collection-specific vocabulary: log pending/claim/done/waiting; score
pending/claim/done/retiring. Index output hashes/build/map fields as nullable
projections while retaining original presence in properties. Evidence-only
log output path/hash are both null; scores require owned output references.
Supported legacy omissions remain omissions; migration must not fill them with
inferred values. No arbitrary large metadata JSON column is permitted.

Collection is log or score; score metadata retains its separate original kind
(replay-frames or game-metadata). Original array/occurrence ordinals, reviewer
property order, and root/property layout are retained. Newly inserted records
append; score tombstone enumeration retains the current canonical-sort rule.
Do not order evidence by timestamp, request tick, filename, or database row ID.

Indexed values are checked projections of original JSON properties, not a
replacement for them. Use properties/payload slots to reconstruct exact JSON
types and property presence. SQL NULL alone cannot distinguish absent from
explicit null. Do not coerce unknown booleans into integers, normalize Unicode,
rewrite timestamps, filter unfamiliar fields, or turn missing values into zero.
Opaque values must survive export even when no operational reader understands
them. Removed structural properties (reviews, diagnostics, summaries, retired
arrays) retain presence/layout metadata for reconstruction. Projection/value
disagreement is corruption, not permission to repair the authoritative value.

Uniqueness constraints cover current record identities and output ownership.
Transactions reject a current/retired identity conflict. Missing associations,
duplicate legacy identities, invalid fields, or ownership conflicts block
migration with exact references; do not normalize or discard them. Unknown
properties do not block migration merely because they are unknown.

Keep original log response fingerprints, score domain/request-qualified
fingerprints, cache hashes, output hashes, and canonical map checksums. A
sidecar hash is only a storage-integrity check and must never replace one of
these identities. Replay-local source keys and diagnostic occurrence ordinals
remain independently addressable, including overlapping evidence.

### Payload encodings and authority

Diagnostics are UTF-8 JSONL with exactly one version-1 envelope per occurrence:

~~~json
{"ordinal":0,"wrapper":{"key":"original-key","raw":"original console string","type":"original type"}}
~~~

The wrapper is the complete original object, not the illustrative subset above.
The raw string retains its exact value. Do not also persist its parsed runtime
object. Entry order and wrapper fields are lossless; storage encoding changes
neither correlation nor canonical comparison rules. An oversized wrapper uses
an envelope with ordinal and wrapperRef instead, referencing an immutable
extension JSON value. Its logical wrapper remains identical. Every reference,
including overflow wrappers, is registered in payloads with its owner pointer
and parent pointer. References form an acyclic tree within that owner's value;
unregistered, cyclic or mismatched references are invalid. Snapshot setup uses
the indexed parent relation to enumerate/open the selected dependency closure
before releasing the lock, without scanning unrelated payloads. Reference
expansion uses those pinned handles only; it is explicit and budgeted, and never
appears as evidence content.

Detailed coverage/validation and opaque extensions are UTF-8 files containing
one complete JSON value. Streaming readers select required fields or array
elements; they must not read/parse a whole file merely to discover its size.
Large string tokens and unknown values can be copied/exported in byte chunks
without constructing a JavaScript string. Preserve empty containers, values,
array order, and JSON types; pretty-printing/property whitespace is not an
evidence identity. Diagnostics' raw strings, score-response bytes, and existing
game-state JSONL lines must remain exact.

Original diagnostics/game-state/raw score bytes are authoritative observations.
Registrations, identities, reviews and lifecycle state are authoritative
operational metadata. Coverage, validation, counts and projections are derived;
retain their original values and validation-version provenance, and recompute
them against selected raw evidence as current analyzers do. Unknown legacy
validator versions remain unknown. Sidecar layout does not authorize dropping
the old full validation object or promoting a compact count to complete evidence.

### Resource budgets and failure behaviour

These are chosen initial limits, not measured speed or memory guarantees:

| Resource | Initial contract |
| --- | --- |
| Descriptor | At most 16 KiB; reject larger descriptors before parsing |
| Individual inline JSON value / materialized metadata row | At most 64 KiB UTF-8; spill large original values, never discard them |
| Metadata page | At most 128 rows and 8 MiB; deterministic keyset cursor, not OFFSET |
| File read/write chunk | At most 64 KiB per stream; backpressure required |
| Materialized diagnostic envelope / JSON token | At most 1 MiB; overflow uses a reference/stream, not silent truncation |
| Coherent analysis selection | At most 64 source records, 8 MiB total materialized metadata and 256 open artifact handles, including maps and extensions |
| Lock acquisition | Preserve 50 attempts at 100 ms, dead-owner check after 30 seconds, and token-checked release |
| SQLite busy timeout | 5,000 ms; bounded failure, no infinite retry |
| Corpus payload size | No application-wide string bound; limited by available disk, SQLite limits and indexed metadata growth |

Spill values before serializing a row. A large number of properties/reviewers is
paginated, not combined into a large metadata object. Keyset cursors carry the
store ID, generation, query/order and last key; reject/restart a cursor if its
generation changed rather than silently mixing states. Explicit selections
over the snapshot budget fail before analysis and name the exceeded budget.
They are not automatically split and merged: independent requests cannot claim
one coherent result. Future budget increases require measured isolated checks.

Routine queries may return missing/retired/current separately. Missing files are
unavailable; invalid hashes/schema are invalid; resource or lock exhaustion is
an explicit incomplete-operation error, never a supported pass. Storage alone
does not classify gameplay candidates or manufacture zero-event coverage.

Retain the existing 100,000,000-byte decompression cap and parser semantics.
Retention may spill values larger than materialization budgets; a consumer that
cannot stream a required oversized value reports a resource limit rather than
rejecting its retention or treating it as absent. Analyzer working memory remains
dependent on the explicitly selected replay; optimizing it is outside this ADR.

### Store interfaces and affected readers

Introduce a tooling-only module, tools/replay-store.js, with no default project
root, Arena imports, cleanup-on-open, or automatic migration. Creation/open names
an explicit evidence root; methods are bound to that validated store/root. The
contracted interfaces are:

~~~text
createFixtureStore({root, filesystem: 'local-apfs'}) -> Promise<store> [M1 only]
openStore({root, mode: 'read' | 'write'}) -> Promise<store>; close()
getRecord({collection, replayId, fingerprint}) -> metadata | missing | retired
getReplay(replayId); getMap(mapId); getReview(recordKey, taskId)
pageRecords({replayId?, status?, collection, after?, limit}) -> page/cursor
pageReviews(recordKey, cursor); pageOperations(cursor)
pageProperties(ownerKey, cursor); pagePayloads(ownerKey, parentPointer, cursor)
withWriter(async writer => result) -> Promise<result>
writer.transaction(tx => result) -> result [synchronous; no nested transactions]
writer.publishPayload({owner, pointer, role, source, expectedBytes, expectedHash})
  -> Promise<payloadRef> [streamed while writer lock remains held]
writer.publishOutput({recordKey, path, source, expectedBytes, expectedHash})
  -> Promise<outputRef> [reserved fixture JSONL/raw-response output, no parsing]
withReadSnapshot({recordKeys, mapIds, reviewKeys, payloadRoles}, async view => result)
  -> Promise<result> [view/handles valid only inside the callback]
iterateDiagnostics(view, recordKey) -> ordered wrapper/envelope iterator
iterateJson(view, payloadRef, selector) -> bounded values or stream references
streamOriginalValue(view, payloadRef, sink) -> exact JSON-value bytes
exportLogicalSnapshot(view, sink) -> streamed legacy-shaped JSON
~~~

The transaction object exposes insertEntity, setProperty, putReview,
reserveOutput, appendIntent, setStatus and finishPublication. Inputs name the
exact entity/record key and original ordinal/value or already-published payload
reference; expected paths/hashes belong to the intent. No original property is
implicitly replaced by a SQL projection. M1 implements these core primitives;
business-policy decisions and legacy export remain later milestones.
Both publication methods consume bounded byte-chunk iterables. Output publication
always requires a matching current reservation/intent and never adopts an
unreserved user file. Payload publication requires a matching reservation/intent
except for evidence-only prepublication with its exact declared owner; that
exception does not create or publish a game-state output.
Transaction callbacks reject Promise results; filesystem streaming stays
outside SQLite transactions while the owner lock remains held. Read snapshots
resolve the callback result, never return reusable live views to the caller.

Write primitives insert/check projections, update one original property/review,
reserve outputs, append intent, set allowed status, and commit retired identity
with record removal. They run only inside withWriter. Policy orchestration stays
in replay-logs.js; the store does not infer review completion or permit arbitrary
cleanup. Export is administrative and read-only, not a routine compatibility
path. Whole-store exports require stopped writers and separate bounded paging;
they are not squeezed into withReadSnapshot's analysis selection budget.

| Consumer | Required adaptation before production cutover |
| --- | --- |
| replay-logs.js | Indexed imports/maps/identity/output checks; paginated list/other/reconciliation; exact review updates and journaled publication/cleanup |
| replay-analysis.js | Select metadata first, pin selected files, stream diagnostics and revalidate original summaries/maps/JSONL; do not call lifecycle commands |
| replay-score-analysis.js | Receive the selected store view, preserve optional-collection semantics, check indexed global ownership, reparse selected raw responses and compare stored summaries |
| historical-index.js | Resolve exact selections/tombstones/claims; hash selected logical metadata and evidence only; reuse compact analyzer reports |
| scout-hold-screen.js | Claim/build gates unchanged; one pinned view shared with analysis; stream diagnostics and incremental raw-string hashing |

Current command names, review gates, source selection and pass/fail/unknown
semantics remain. Version-2 pretty/compact inputs remain readable through a
bounded legacy adapter after integration; legacy writing remains the existing
v2 path until explicit migration. Nonempty version-1 data remains unsupported.
M1 does not implement or dispatch that adapter.

Existing report/index shapes remain; the qualified manifest path remains a
logical index locator resolved by collection, replay ID, fingerprint and original
key/occurrence. It is no longer a claim that raw diagnostics reside in that file.
Keep old references resolvable via this resolver and the frozen migration backup.
Do not introduce volatile store UUIDs/generations into deterministic findings.

Evidence fingerprints and map checksums remain unchanged. Hash the screen's
ordered raw strings incrementally with one newline between entries and none at
the end, exactly matching its current join semantics, including empty input.
Historical cache projections retain original logical values, not physical
sidecar references. New cache domains are historical-store-v3-v1 and
scout-hold-store-v3-v1; include adapter/encoding/canonicalization versions and
hashes of all new reader dependencies. Old cache files remain retained but miss
once on domain change. Selected value/bytes/map/config/analyzer changes invalidate;
unrelated replays' record updates and sidecar relocation do not. Referenced
replay associations and selection-relevant tombstones remain key inputs.
Always recheck claims, availability and selected integrity before using a cache
hit. No whole-database hash or corpus generation belongs in the derived-report key.

### Locking, publication and reader coherence

Keep the existing .manifest.lock path and its fully published PID/token owner,
inode-checked stale recovery, dead-owner requirement and token-checked release.
Retain the existing exception for a legacy empty lock older than 30 seconds,
with the same inode check; new lock publication must never expose an empty owner.
Malformed nonempty owners fail rather than authorize removal. Do not steal a
live lock. All mutations, including filesystem publication,
recovery, map upgrades, migration cutover and cleanup, use that lock. Inside it,
use BEGIN IMMEDIATE for short SQLite transactions, with rollback on error.
Increment generation on each committed mutation. Prepared statements may be
cached; do not retain an unvalidated mutable corpus object across acquisitions.
Recheck identities, output ownership and validated map linkage under the lock.

Writable SQLite connections are opened and used only while the writer lock is
held, including any native hot-journal recovery; close them before releasing it.
Outside withWriter, metadata lookups use strictly read-only connections/short
read transactions. A write-capable store handle is not permission to open a
writable connection before acquiring the lock. Revalidate the descriptor/store
ID after acquisition so cutover cannot leave a stale writable target.

File-backed publication retains pending -> claim:

1. Commit exact record/output/payload reservations plus publication intent as
   pending. The journal names every expected file and hash.
2. Stream private exclusive temporary files, fsync them, publish without
   overwriting an existing destination, and fsync affected directories. Verify
   exact bytes/hash and ownership. Existing captures retain their current
   exclusive-publication rules; never adopt changed or unsafe files.
3. Commit ready payload references, claim and publication-intent removal in one
   transaction.
   Failure after step 1 leaves pending for targeted retry; after step 2, retry
   verifies/reuses existing exact bytes. Do not expose partial ready evidence.

For evidence-only logs, prepublish and verify the diagnostic sidecar under the
lock, then atomically commit the ready claim record with null outputPath and
outputFingerprint. A crash before that transaction leaves an unreferenced owned
artifact, not a fabricated pending JSONL. Retry can reuse its verified bytes.
Map-only responses still create no log record. Mapless logs remain deferred;
scores remain map-independent. Do not change the existing distinction between
recoverable missing log output and an error for missing published score output.

Database transactions do not cover filesystem changes. Recovery uses the exact
intent and source identity, verifies each existing file, and never silently
recalculates identity. A rollback/ENOSPC/EIO/hash mismatch leaves durable intent
or the previous committed state; it must not leave a false claim. Unreferenced
temporaries/sidecars remain retained until an explicit, ownership-verified
maintenance operation; open/import does not perform garbage collection.

For a coherent analysis view, briefly acquire the same lock, begin a read
transaction, select original metadata/association and the explicitly required
review entries, and open all required immutable artifacts, including registered
overflow/extension dependencies. Check paths, regular-file status and identity
using opened handles, then release the transaction and lock before invoking the
callback. The callback borrows the view; the store closes every handle in finally
after callback completion/failure. Supported POSIX
unlink semantics keep them readable if authorized cleanup subsequently removes
their names. Read and validate/hash the same handles; do not reopen by path or
mix a later generation into this view. Findings that depend on a file's integrity
are withheld until that stream is fully verified. Exceptions close every handle.
Snapshot setup beyond the metadata/handle/selection budget returns a resource
error before invoking the callback. Metadata-only list pages are generation
coherent but are not pinned evidence-analysis views; an integrity conclusion
always uses a pinned view.

Read operations never reconcile, recover hot journals, migrate statuses, claim,
complete, or repair evidence. If SQLite needs recovery that read-only open cannot
perform, report recovery-required for a separately invoked writer operation.
Operational lock files are the only transient filesystem writes allowed during
snapshot acquisition; they do not change evidence/review state. The existing
synchronous analysis API will become async for bounded lock acquisition;
update its callers/tests together, not with a lock-bypassing sync fallback.

### Review and lifecycle contracts

Preserve [ADR 0002](0002-map-linked-replay-logs.md) and
[ADR 0005](0005-replay-frame-scoring-evidence.md):

- A record's claim status is distinct from a task's ownership claim. Exact task
  IDs/checkpoints are retained; claim/examined are idempotent and completion
  requires actual examination. No deadline, migration or process exit completes
  a reviewer. All owners must have examined/completed checkpoints before done.
- Log done still authorizes existing log cleanup/reconciliation. Store an
  internal cleanup intent while public status remains done. Verify original
  output and diagnostic/summary ownership/hashes before deletion; support the
  existing log rule for an already-missing output. Remove the record and append
  its replay-qualified retired fingerprint in one final transaction. Remove
  reviews with the retired record as today; keep maps and replay associations.
- Score done retains the response. Only exact score-cleanup persists retiring
  plus intent. A response missing before retiring remains an error; after intent,
  targeted retry accepts already-removed files. Verify all remaining owned files,
  then atomically add the map-independent score tombstone and remove the record.
  Log reconciliation must not retire score sources.
- Journal each deletion boundary. Deletion after recorded authorization and
  before the final database commit is resumable; readers cannot mistake this
  intent for ready evidence. Abort on changed/symlink/unmanaged content. New
  sidecars are deleted only with their authorized owning record, never by age.
- Paginate reconciliation over eligible states; it must not load all payloads.
  Migration/verification/export never invoke it or normalize waiting statuses.
  Imported legacy waiting values are preserved until the existing explicit or
  operational status-migration path acts after cutover.

### Explicit migration and backup protocol

Implementation, isolated rehearsal, and production migration are separate
authorizations. No automatic migration in open, list, scan or watch. A later
tools/replay-store-migrate.js administrative interface will expose prepare,
verify, resume, cutover, export and rollback with explicit paths/receipts; no
production default root or implicit cleanup.

1. Stop all writers and verify their absence. Acquire the owner-checked lock
   to freeze publication. Inventory current paths, pending operations and
   lifecycle state without completing or cleaning anything. Check space for
   a fresh backup, converted payloads/index, temporary files and headroom;
   count unmanaged files separately and leave them untouched.
2. Create a complete, restorable current backup: exact manifest, every referenced
   capture/map/score body, operational identity metadata, and sources needed
   for pending recovery. Record hashes, lengths, states and missing-file reasons.
   A permitted pre-existing missing/pending artifact is not invented in the
   backup; unresolved unsafe/corrupt state blocks cutover. The pre-recovery
   backup-Q4Ivfh predates the three recovered records and is insufficient alone.
3. Preserve a frozen legacy manifest copy with SHA-256/length and backup receipt.
   Stream that copy into a new, unpublished store directory. Parse fields and
   collections incrementally, spill large values, and commit checkpoints only
   after referenced artifacts are durable. Each checkpoint names source hash,
   byte position/parser boundary, collection/record ordinal, converter version
   and verified output hashes. Unsupported/ambiguous JSON (including duplicate
   object keys) fails explicitly with the frozen source retained.
4. Resume only when the source/backup/converter identities match. Revalidate the
   last committed output/checkpoint; replay uncommitted work idempotently.
   Deterministic owner/artifact identities prevent duplicate publication. Do not
   resume against a changed source, bless partially written files, or delete
   unknown scratch artifacts. Reacquire the lock for an interrupted session.
5. Verify a streamed logical reconstruction against every frozen legacy value:
   collection/property presence and order, records, raw diagnostics, summaries,
   extensions, reviews, retired identities and map associations. Compare original
   fingerprints, original artifact bytes/hashes, counts and statuses, and run
   SQLite integrity/foreign-key checks. Use streaming comparison, not whole
   document stringify/canonicalization. Preserve all errors/unknowns; conversion
   is not an evidence reanalysis or repair.
6. Before cutover, recheck the full production manifest hash and referenced
   artifact inventory against the frozen receipt under the lock. Any intervening
   write blocks publication. Close staging connections, ensure a clean journal
   and durable database/sidecars/directories, and atomically publish the bounded
   version-3 descriptor via temporary file, fsync, rename and parent fsync.
   The descriptor is the sole activation point; never publish a staging subset
   as a legacy production manifest.
7. Keep the original backup, source, receipts and old reports. If descriptor
   durability is uncertain after rename, stop writers and inspect/verify what
   is actually active; do not retry blind activation or overwrite either store.

All supported readers must be upgraded before cutover. Older version-2 importer
readers reject the version-3 descriptor; permissive incompatible tools must be
retired or fenced before migration. No dual writes or silent v2 fallback after
activation. Tools in retained trial worktrees are not silently upgraded or
assumed compatible. Opening a descriptor for writes must validate its store ID
and schema before creating data. Frozen version-2 backups remain read-only;
nonempty version-1 migration is excluded.

After migration, backups require coordinated stopped writers, the bounded
SQLite [backup API](https://sqlite.org/backup.html), the active descriptor and
all referenced artifacts/operations/receipts. A database-only copy is not an
evidence backup. Verify a restore in isolation before accepting the backup.

### Rollback boundaries

- Before activation, production remains version 2. Keep unpublished staging
  data for diagnosis/resume; rollback does not delete evidence.
- After activation but before any logical write, with all writers stopped and
  the lock held, verify the cutover receipt and unchanged logical state/artifacts,
  then atomically restore the exact frozen version-2 manifest. Operational read
  lock creation alone does not count as a logical write.
- After any import, review/status/map change or cleanup, restoring that old
  snapshot is forbidden: it loses new state or resurrects retired evidence.
  Resolve pending operations without inventing readiness, create a fresh backup,
  and stream-export the current complete logical state and matching artifact
  inventory. Verify preservation and rollback compatibility before publication.
- Compare the export's actual UTF-8/UTF-16 sizes and measured reader memory
  requirements against the specific legacy Node reader. An export beyond its
  single-string limit, or failing an isolated load, is not a usable legacy
  rollback. Use a previously qualified compatible v3 binary/store instead;
  never split a legacy manifest into unsupported subsets or discard records.
- Keep both generations and receipts until rollback verification succeeds.
  Rollback is an explicit administrative operation, never error-handler cleanup.

### First isolated implementation milestone (M1)

Goal: prove the bounded storage core and per-response publication contracts on
synthetic scratch evidence, without connecting any current consumer or touching
production. M1 was separately authorized and implemented; its
[local qualification record](../architecture/replay-storage-v3-m1-2026-10-03.md)
does not authorize consumer integration or production migration.

Expected files for M1:

- tools/replay-store.js: runtime/path gates, schema creation, bounded metadata
  queries/properties/reviews, owner-checked writer transactions, pending
  publication primitives and coherent read snapshots. Transaction primitives
  accept already-validated fixture metadata; no Arena cache parsing or policy.
- tools/replay-store-payloads.js: version-1 envelopes, immutable streaming
  publication, overflow references, selected iteration and incremental hashes.
- tests/unit/replay-store.test.js and tests/unit/replay-store-payloads.test.js:
  synthetic fixtures, process concurrency/crash injection and scale gate.
- Direct documentation updates and syntax-check registration for these modules
  only; no npm dependency or Arena build-ID change.

Fixture creation requires an explicit newly created empty temporary root and
exclusive fixture marker; there is no create-at-project-root/default-root path.
Require a direct child of the resolved OS temporary directory named with the
pain-gain-store-v3-fixture- prefix; reject a symlink, nonempty root or pre-existing
marker. The exclusive marker binds the root and store ID. In M1, both open modes
require that marker and reject any other root before reading a descriptor or
database. General v3 roots are enabled only with the later integration release.
Every test creates its own root; production roots, existing worktrees, Arena
cache and user captures are excluded. Write operations may only use the fixture
store in M1. Ordinary store open never creates/migrates a database. M1's interface
subset includes metadata/property/payload paging, original-value iteration,
writer primitives and pinned snapshots; exportLogicalSnapshot and legacy input
dispatch are explicitly deferred. Fixtures reconstruct values through these
iterators without implementing a legacy exporter. Snapshot handles are closed
by the store in finally; using a view after its callback fails as closed.

M1 deliverables/acceptance:

1. Synthetic log, evidence-only, score, map/replay, reviewer and retired fixtures
   reconstruct identical original values/order/presence. Include Unicode, null,
   zero, false, optional absent/empty collections, nested unknown properties,
   overflowing wrappers/extensions and more properties than one page. No
   per-record or corpus-wide oversized stringify/readFile is required.
2. Exact indexed lookup, 128-row/8 MiB pagination and bounded review update open
   no unrelated payloads. Generation-bound cursors reject stale use. Duplicate
   and ownership conflicts fail without mutation. Output/evidence identities
   remain distinct from sidecar hashes.
3. Pending publication failures at reservation commit, temporary write/fsync,
   exclusive publication/directory fsync, verification and claim commit leave
   the previous state or retryable intent. Exact retries reuse bytes without
   duplicate rows; changed destinations are rejected. Evidence-only failure
   leaves no fake JSONL. No implicit orphan deletion or lifecycle completion.
4. Two child processes cannot lose review/property updates or both own one
   output. Live lock ownership is respected; terminated-owner recovery follows
   the existing rule. Injected SQLite busy/rollback/I/O failures never produce
   ready evidence. Read-only open must not recover or alter a hot journal.
5. A pinned reader retains a coherent fixture snapshot while a second writer
   performs an authorized synthetic cleanup-journal sequence and unlinks files.
   No mixed metadata, path reopen, leaked handles, or unsupported pass is allowed.
   This tests storage mechanics, not production completion orchestration.
6. Stream-generate at least 600 MiB of unique accumulated ASCII fixture payloads (larger
   than the former 536,870,888-character ASCII string limit), each source within
   existing per-response limits. Do not read a production manifest or repeatedly
   share one physical payload to simulate volume. Compare 10 and 1,000 metadata
   records with fixed-size selections. Listing opens zero payload files; one
   lookup/review update touches only selected rows and bounded index/journal
   work, never unrelated payloads; one import writes only its payload/index
   pages. B-tree depth/page splits may change page counts; a corpus scan or
   corpus rewrite is not permitted. Record SQL/filesystem
   operation counts, bytes, wall time and peak RSS; pass with at most 256 MiB
   process RSS under a 192 MiB V8 heap for the core-only scale worker. Existing
   analyzer/parser memory is excluded, not claimed improved. Use a 60-second
   fixture-generation deadline and 30-second operation-worker deadline, safe
   child shutdown, and explicit environmental failure rather than weakened
   thresholds. These are proposed acceptance budgets, not completed benchmarks.
7. Run focused tests, npm test, npm run check, links/anchors and whitespace on
   the final isolated-core patch. Report real results and resource limitations.

Excluded from M1: editing replay-logs.js or any reader, production-capable CLI,
legacy conversion/export implementation, full review/retirement policy
orchestration, storage migration/rehearsal, real-evidence analysis, watcher
startup, configuration/build changes, and cleanup of existing files. If a budget
or platform primitive fails, report the measured blocker; do not quietly change
this contract or broaden into an analyzer/storage redesign.

### SQLite replay catalog extension

SQLite is also the central catalog for replay identity/provenance, capture
references, analysis runs, observed findings, interpreted conclusions,
experiments and reviews. Large immutable logs/reports remain files, referenced
by exact path and byte hash; they are not copied into SQLite. The catalog is a
traceability layer, not a new analyzer, evidence owner, strategic decision engine
or automatic review-completion mechanism.

Current [storage interfaces](../../tools/replay-store.js) implement schema 1
and synthetic M1 only. Current [analysis](../architecture/replay-analysis.md)
and [historical-index records](../architecture/historical-evidence-cycle-2026-10-02.md)
still use v2 evidence and independent cached reports. None currently writes the
catalog. Preserve their selection, fingerprints, claim gates, report semantics
and deterministic cache contracts when integrating later.

#### Entities, identities and relationships

Natural evidence identities remain authoritative: replay ID, the full
`[collection, replayId, fingerprint]` capture key, original uploaded-code ID
qualified by player/account, runtime build ID and canonical map checksum.
Catalog subjects for these identities have one unique natural key, not a new
evidence fingerprint. New questions, runs, findings, conclusion series,
experiments, revisions and catalog review events use caller-supplied UUIDs,
persisted once. Retry with the same ID and identical logical fields is idempotent;
different fields cause `IDENTITY_CONFLICT`, not replacement. UUIDs are catalog
identifiers, never substituted into deterministic analyzer findings/cache keys.
This checks immutable registration/event content, not mutable workflow projections.
An exact revision/event retry is resolved before its head/state precondition:
return the original receipt without advancing state twice, even if later events
exist. A different revision ID with a stale expected head still conflicts.
Use the M1 canonical JSON capture tuple, preserving collection qualification;
UUIDs/ordinals do not replace it. Catalog IDs and counters retain M1's validation,
BINARY comparison, safe-integer/BigInt and overflow-failure rules.

Use STRICT tables, BINARY identifiers and foreign keys. The following additive
schema contract uses `catalog_` names to avoid altering M1's operational tables:

| Table / stable key | Required relationships and indexed projections |
| --- | --- |
| catalog_subjects / subject_id | UUID, immutable kind and unique `(kind, natural_key)` where applicable; ordinal for bounded enumeration; each subject resolves to exactly one matching typed row |
| catalog_replays / replay_id | unique subject_id; original replay ID, no required map/build/upload association; references are supplied by provenance assertions |
| catalog_captures / capture_key | unique subject_id and `(collection, replay_id, fingerprint)`; FK catalog_replays; log/score kind and original source domain/request identity, optional retained metadata reference |
| catalog_uploads / `(player_key, code_id)` | subject_id; original code ID and observed version if available; no inferred next version or required runtime build |
| catalog_builds / build_id | subject_id; full runtime build ID, not an uploaded-code ID; optional verified source/configuration assertion |
| catalog_configs / config_id | subject_id; immutable known switch values and explicit scope/source; absent switches remain absent, explicit null remains null, false remains false |
| catalog_artifacts / artifact_id | subject_id; unique original owner identity/field plus format version, expected hash/bytes/encoding and location revisions; non-owning reference to a single operational or catalog-owned artifact |
| catalog_provenance / assertion_id | subject_id of replay/capture/upload/build/config, field, ordinal, bounded original value or artifact reference; origin evidence_ref or explicit user/local-source origin, validation/version and knowledge state |
| catalog_coverage / `(capture_key, ordinal)` | FK capture; dimension (`runtime-tick`, `game-time`, `diagnostic-type`, `frame`, `terminal`), inclusive bounds if known, validation version, evidence ref and state/reason; indexed by capture/dimension/start |
| catalog_questions / question_id | subject_id; immutable question, predefined observable criterion, required coverage/provenance and comparison policy; changed question gets a new ID with predecessor FK |
| catalog_question_links / `(question_id, related_question_id, role)` | FKs both questions; append-only explicit comparison/predecessor relationship with policy, reason and creator task; no implicit cross-question support |
| catalog_runs / run_id | subject_id; FK question; analyzer name/version and dependency digest, parameter value/reference, explicit selection digest/version, workflow and bounded error; optional cached-report artifact |
| catalog_run_sources / `(run_id, ordinal)` | FK run/capture; unique capture per run; immutable selected occurrence/range, expected selected logical/evidence/map digests, provenance/availability receipt and reason |
| catalog_evidence_refs / evidence_ref_id | FK capture; optional artifact/location revision, diagnostic key/occurrence/line, actor and inclusive tick/game-time range; build/config assertion refs where applicable |
| catalog_findings / finding_id | subject_id; FK run, unique `(run_id, ordinal)`; observed kind/rule, exact bounded value or artifact ref, original analyzer verdict and normalized verdict with semantics version |
| catalog_finding_evidence / `(finding_id, ordinal)` | FK finding/evidence_ref; support role (`observation`, `coverage`, `provenance`, `counterevidence`); all contributors retained, not just compact representatives |
| catalog_conclusions / conclusion_id | subject_id; FK question; current_revision integer; one stable interpretation series, not the latest text as an overwriteable field |
| catalog_conclusion_revisions / `(conclusion_id, revision)` | immutable revision subject_id, predecessor revision, verdict, rationale/value reference, scope/limitations, creator task and ordinal; FK same-series predecessor |
| catalog_conclusion_support / `(conclusion_id, revision, ordinal)` | FK exact revision/finding; support or counterevidence role; no link to a mutable latest finding or report |
| catalog_experiments / experiment_id | subject_id; current_revision; separate workflow, not a strategy-promotion flag |
| catalog_experiment_revisions / `(experiment_id, revision)` | immutable revision subject_id, hypothesis, FK question, baseline/candidate build/config refs, acceptance/failure/unexercised criteria and limits, predecessor; no implied matched comparison |
| catalog_experiment_runs / `(experiment_id, revision, run_id)` | FKs exact experiment revision/run; baseline/candidate/observational arm and assignment provenance; unknown arm is explicit |
| catalog_tasks / task_id | exact existing task identifier, not normalized; stable catalog subject association, bounded task description/reference |
| catalog_reviews / `(target_subject_id, task_id)` | FKs subject/task; separate catalog review checkpoints plus ordinal; target can be an exact conclusion/experiment revision, not only a series |
| catalog_review_events / event_id | append-only target/task association, ordinal, event/checkpoint and original timestamp/value; retain prior assessments and rationale refs |
| catalog_workflow_events / `(subject_id, ordinal)` | unique immutable event_id UUID; FK run/conclusion/experiment subject and creator task; append-only previous/next workflow, checkpoint and reason; current-state projection changes in the same transaction |
| catalog_artifact_events / `(artifact_id, ordinal)` | append-only location/availability observation or authorized-retirement receipt; original path/hash retained, reason and source/task explicit |

Every join is an indexed exact FK lookup or keyset page. Typed-row/subject-kind
agreement is checked inside the writer transaction; no unresolved polymorphic
target strings or dangling support edges are accepted. Reverse indexes cover
run/question, capture/replay, evidence_ref/capture, finding/run, support/finding,
experiment/run, related-question links and review/target. Selection and occurrence ordinals, not UUID
sort order or timestamps, determine evidence order. All original extensions and
optional collection/property presence use paginated properties or immutable
references under the existing bounded-value contract, never a large JSON column.
Catalog properties use an explicitly typed catalog-subject owner, not a fabricated
capture owner. Referencing an existing artifact is non-owning and does not reserve
its path again. C1 permits only bounded inline catalog properties; overflow bodies
require the later publication milestone. Actor identifiers are scoped by replay,
not assumed globally unique. Unknown player identity cannot be replaced with an
invented upload owner: retain the observed code ID as a scoped provenance assertion
until its player-qualified identity is established.
Artifact registration checks its immutable original owner/field/format identity
before allocating another anchor; changed expected hash/length is a conflict or
invalid observation, not a new identity for the same evidence. Paths are location
history, not artifact identity; identical hashes from different owners remain
distinct. Catalog anchors for retained maps/artifacts resolve exact original
operational owner keys without adding foreign keys to deletable operational rows.
Evidence-ref capture and artifact ownership must agree; actor/range and
build/config assertions name that capture's scope or an explicit sourced alignment
relationship. A reference cannot substitute another capture's bytes or build tag.
Finding evidence must belong to its sealed run selection (or the explicitly
selected map/provenance dependencies). Cross-match conclusions link separate
runs/findings through the question's comparison policy, not fabricated joins.

Catalog captures are durable identity anchors, not duplicate operational records.
An explicitly requested but absent capture may have an anchor and an unavailable
selection receipt; this does not invent observed metadata or a live `claim`.
Do not FK catalog references to deletion-sensitive `records`/`reviews` with
CASCADE. Resolve the same natural identity against current/retired/missing
operational state instead. Catalog review history is distinct from importer
review ownership: it neither claims a capture nor authorizes cleanup. Copying
an existing review for historical reference must name its original checkpoints
and source; the operational reviewer still follows the existing lifecycle.

#### Provenance, observation and interpretation

Provenance assertions are append-only and scoped to their exact supporting
evidence. Knowledge state is `observed`, `reported`, `local-verified`, `unknown`,
`conflicting` or `invalid`, with a reason. Unknown values are not fabricated IDs
or zero counts. SQL NULL is only a projection; preserve original property
presence/value alongside it. Record conflicting opponent/version, player-slot
mapping, upload, map, build and configuration assertions without choosing a
winner. Opponent display names are not stable player IDs. A source-folder check
proves local bytes only, not upload or execution. A captured build tag proves
only its covered runtime evidence; a build/config association needs its own
validated source or runtime evidence. Score-to-build association and runtime/
frame alignment need explicit assertion sources; shared replay ID alone does
not establish them. Terrain/checksum and relevant starting positions remain
separate comparison inputs. Terminal state requires terminal evidence, not the
last retained tick, metadata tick count or final observed cumulative score.

Coverage is a set of sourced intervals/observations, not a single maximum tick.
Use `covered`, `gap`, `unknown`, `conflicting`, `invalid` with exact reason/type;
metadata-advertised extent is a provenance assertion, not covered runtime.
Do not expand arbitrarily wide gaps into tick rows. Complete zero-event closures
remain distinguishable from absent diagnostics. Counts name their unit: ticks,
commands, transitions or independent matches. Conclusions may cite incomplete
evidence while recording the resulting uncertainty, never silently merging
incompatible builds, opponents, maps or source groups.

A run freezes its question, selected source order/ranges, analyzer/dependency
versions, parameters and relevant fingerprint projection before `running`.
Selections are assembled in bounded pages while `planned`, then sealed in one
transaction with at most 64 captures; over-limit selections reject rather than
truncate. No selection/parameter edits after sealing: a rerun gets a new run ID.
The deterministic selection digest hashes the ordered logical evidence values,
explicit missing selections and relevant map/config/association/version inputs,
not store UUID, catalog generation, unrelated rows or sidecar relocation.
Reuse a report only after rechecking claims, selected availability and integrity.
`completed` requires all declared finding/support pages and report references
published atomically ready via a final checkpoint; it does not imply a pass.
Sealing is mandatory before `running` and stores the bounded selection count,
ordered digest and semantics version. Missing selected captures remain sealed
unavailable inputs, not silently dropped rows. Declared result counts include
finding and evidence-link ordinals, including explicit zero; absence of a result
declaration is not zero. C1 publishes findings only with the atomic `completed`
checkpoint; failed/cancelled runs retain execution diagnostics, not partial
published gameplay findings. Conclusion support uses only published findings.

Findings retain observations and checks: decisions, command attempts/return
codes, subsequent positions, and observed outcomes are different kinds. A
command `OK` never becomes displacement; a policy reproduction never becomes a
counterfactual trajectory. Preserve analyzer `pass`/`fail`/`unknown` spelling and
semantics version; the catalog's explicit mapping is `passed`/`failed`/`unknown`.
Compact aggregate findings carry counts, scope and representative-only detail
flags; do not pretend they enumerate every finding. Full supporting references
are paginated or stored in an immutable report artifact.

Conclusions interpret named findings for one question/scope. Append a contiguous
revision with exact support links; never UPDATE/DELETE a published revision or
its support. Use compare-and-swap `expectedRevision` on the series head under
the writer lock. Concurrent revisions cannot silently overwrite each other;
stale heads return `REVISION_CONFLICT`. Corrections/retractions append a revision
with predecessor and reason. Prior revisions/support/reviews remain queryable.
New series have head 0, no published revision; the first append expects 0,
creates revision 1 with null predecessor, then advances the head. Later appends
expect n and create n+1 with predecessor n. Caller-supplied revision subject IDs
are stable retry keys. A same-question/scope support link requires matching
criterion/units and explicit evidence references; cross-question support also
requires a named `catalog_question_links` comparison and scoped policy. Changed
scope or evidence is recorded in a new revision, not inferred from the head.
A draft revision may have no verdict; recording a verdict requires a new complete
revision, not retroactive alteration of the draft. Experiment hypothesis/criteria
and arm definitions follow the same immutable revision/head rule. Review an exact
revision; reviewing a series does not automatically approve its next revision.

#### Verdict and workflow contracts

| Verdict | Meaning for the named question and criterion |
| --- | --- |
| unknown | Relevant evidence is insufficient, incompatible or invalid to judge; unresolved scenario occurrence is unknown, not proof of absence |
| unexercised | Sufficient relevant coverage establishes no qualifying opportunity in the stated scope; not pass/failure, and never inferred merely from a missing record |
| passed | Supported observations satisfy the predefined criterion at its stated command/position/outcome level |
| failed | Supported observations violate that criterion; an importer/analysis execution error is not a gameplay failure |

Run edges are `planned -> running | cancelled` and
`running -> completed | errored | cancelled`; no other state-changing edges.
Terminal runs are immutable except append-only review/history. Crash leaves `running`
with an explicit checkpoint: authorized exact retry resumes that run, never
silently completes it. Conclusion/experiment workflow is independently
`open`, `active`, `deferred`, `closed`, starting at open. Allowed edges are
open -> active/deferred/closed, active -> deferred/closed,
deferred -> active/closed, and closed -> active only with an explicit reopening
reason and task. These are recorded as task-attributed history events;
workflow does not rewrite revisions or choose a verdict. A completed run can
contain unknown/unexercised results; a closed/deferred experiment can remain
inconclusive. Catalog review checkpoints are claimed/examined/completed history,
with completion requiring examination, not a verdict. They have no expiry or
automatic capture-completion effect.
Creation and every transition append a task-attributed event and update only its
checked projection in one transaction. `expectedState` mismatch is `INVALID_STATE`;
an exact event retry returns its receipt before this check. Same-state checkpoints
are append-only events, not an implicit restart. Catalog review edges are
unclaimed -> claimed -> examined -> completed; repeated exact events are idempotent,
and a new assessment after completion targets a new task or revision. Copying a
historical operational checkpoint preserves its source receipt and does not invoke
an operational transition. Reopening workflow never mutates published content.

Never reduce all findings to one implicit benefit verdict. If the question
explicitly defines a homogeneous candidate aggregate, use supported `failed`
first, then `unknown`, then `passed`, then `unexercised`, preserving counts of
every state and total qualifying opportunities. Thus a pass cannot hide an
incomplete candidate. Different criteria/compatibility groups get separate
conclusions; no universal cross-match aggregation is authorized.

Representative revision API value (synthetic IDs; evidence is not a real replay):

~~~json
{
  "conclusionId": "11111111-1111-4111-8111-111111111111",
  "revisionSubjectId": "33333333-3333-4333-8333-333333333333",
  "expectedRevision": 1,
  "revision": 2,
  "predecessor": 1,
  "verdict": "unknown",
  "semanticsVersion": "synthetic-v1",
  "criterion": "following-position",
  "unit": "transitions",
  "counts": {"passed": 0, "failed": 0, "unknown": 1, "unexercised": 0},
  "opportunities": null,
  "coverageSufficient": false,
  "provenanceState": "unknown",
  "scope": {"criterion": "following-position", "ticks": [8, 9]},
  "rationale": "Accepted command is recorded; the compatible following snapshot is missing.",
  "support": [{"findingId": "22222222-2222-4222-8222-222222222222", "role": "support"}],
  "taskId": "codex/synthetic-catalog-check"
}
~~~

`support` here is one bounded input page, not an unbounded revision JSON field.
For C1 it is the complete support set, committed atomically with that revision.
Representative SQL expresses the revision and support integrity contracts
(other tables/columns follow the schema table above):

~~~sql
CREATE TABLE catalog_conclusion_revisions (
  conclusion_id TEXT NOT NULL REFERENCES catalog_conclusions(conclusion_id),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  subject_id TEXT NOT NULL UNIQUE REFERENCES catalog_subjects(subject_id),
  predecessor INTEGER,
  verdict TEXT CHECK(verdict IN ('unknown','unexercised','passed','failed')),
  PRIMARY KEY(conclusion_id, revision),
  FOREIGN KEY(conclusion_id, predecessor)
    REFERENCES catalog_conclusion_revisions(conclusion_id, revision),
  CHECK((revision = 1 AND predecessor IS NULL)
     OR (revision > 1 AND predecessor IS NOT NULL AND predecessor = revision - 1))
) STRICT;
CREATE TABLE catalog_conclusion_support (
  conclusion_id TEXT NOT NULL, revision INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  finding_id TEXT NOT NULL REFERENCES catalog_findings(finding_id),
  role TEXT NOT NULL CHECK(role IN ('support','counterevidence')),
  PRIMARY KEY(conclusion_id, revision, ordinal),
  FOREIGN KEY(conclusion_id, revision)
    REFERENCES catalog_conclusion_revisions(conclusion_id, revision)
) STRICT;
CREATE INDEX catalog_support_finding ON catalog_conclusion_support(finding_id);
~~~

Writer checks additionally require same question/scope or an explicit comparison
relationship, supported run membership, contiguous page ordinals, bounded values
and revision-head CAS. Once committed, revision/support immutability is enforced
with SQL guards as well as the public API. Drafts retain explicit unknown fields;
SQL NULL verdict means not assessed, never a zero/pass/default unknown verdict.

#### Bounded APIs, file ownership and unavailable evidence

`tools/replay-catalog.js` tooling interfaces (C1 implemented on synthetic fixtures,
C2 deferred); not Arena runtime APIs:

~~~text
createCatalogFixture({root, filesystem: 'local-apfs'}) -> Promise<catalog> [C1]
openCatalog({root, mode: 'read' | 'write'}) -> Promise<catalog>; close()
getReplay(replayId); getCapture(captureKey); getRun(runId)
getConclusion(conclusionId, revision?); getExperiment(experimentId, revision?)
pageReplays(filters, cursor); pageCaptures(replayId, cursor)
pageRunSources(runId, cursor); pageFindings(runId, filters, cursor)
pageEvidence(findingId, cursor); pageSupport(conclusionId, revision, cursor)
pageConclusionHistory(conclusionId, cursor); pageReviews(targetSubjectId, cursor)
resolveEvidence(evidenceRefId) -> reference + historical receipt + current availability
withCatalogSnapshot(explicitSelection, async view => result) [C1 metadata only]
withCatalogEvidenceSnapshot(explicitSelection, async view => result) [deferred C2]
withWriter(async writer => writer.transaction(tx => result))
tx.registerIdentity(...); tx.appendProvenance(...); tx.appendCoverage(...)
tx.createQuestion(...); tx.linkQuestions(...)
tx.createRun(...); tx.appendRunSources(...); tx.sealRun(...)
tx.transitionRun(...); tx.publishRunResult({runId, expectedState, declaredCounts, ...})
tx.appendFinding(...); tx.appendFindingEvidence(...) [same result transaction only]
tx.appendConclusionRevision({expectedRevision, ...}); tx.appendSupport(...)
tx.appendExperimentRevision({expectedRevision, ...}); tx.linkExperimentRun(...)
tx.appendReviewEvent(...); tx.appendArtifactEvent(...)
tx.transitionWorkflow({eventId, subjectId, expectedState, nextState, taskId, reason})
~~~

Transaction callbacks are synchronous, nonnested and reject Promise results,
as in M1; asynchronous work remains outside the SQLite transaction under the
same owner lock. Lookup/write methods perform structural, selection, provenance
scope and state checks. They do not rerun an analyzer or adjudicate whether
caller-supplied observations are true; retain their declared validator/version.
Verdict checks require the question's named criterion, evidence/coverage support
and explicit uncertainty/count fields, not a new gameplay inference algorithm.

Single-row results never hydrate joined histories/support lists. All relationship
pages use the existing 128-row/8 MiB bounds and generation/query-bound keyset
cursors. Write input pages have at most 128 rows and 8 MiB, every materialized row
at most 64 KiB; oversized original bodies need owned immutable references or
explicit `RESOURCE_LIMIT`, not truncation. Multi-page revisions/results stage
under durable catalog intents and become public in one final transaction only
after all declared ordinals/references are validated; readers reject active intents.
Catalog metadata snapshots share the same lock/read-transaction and 8 MiB bound.
They freeze explicit metadata/availability receipts without opening artifacts;
the callback runs after transaction/lock release on a borrowed closed-after-use
view, not an unrestricted graph-query connection. Active selected publication or
cleanup intents reject snapshot setup before the callback, including operational
records still labelled claim/done. Metadata lookup may report those intents as
pending but cannot imply ready evidence. Snapshot setup never runs recovery.
Evidence snapshots additionally use the same 64-capture/256-handle limits and pin
every selected artifact/overflow dependency before releasing the lock. No recursive
whole-graph hydration, corpus scans, OFFSET paging or implicit latest-evidence joins.

`resolveEvidence` is metadata-only and reports `not-checked`, `pending`, `retired`
or `missing` with last-known paths/hashes; it does not label files verified merely
because a catalog row exists. Explicit bounded snapshot acquisition reports
`verified`, `unavailable` or `invalid` for selected evidence after integrity checks.
It never searches backups/cache automatically or adopts same-hash files. A
relocation needs an explicit validated location revision, preserving prior paths;
it neither changes evidence identity nor invalidates logical caches on its own.

Catalog artifact references confer no ownership or retention veto. Operational
files/sidecars retain one current owner; catalog lookup adds no second deletable
owner. When authorized log-done or explicit score-retiring cleanup removes them,
stable capture/artifact/reference anchors and original expectations remain. Later
queries report unavailable evidence, not dangling success, a zero-event finding
or automatic erasure of a conclusion. Historical verdicts remain recorded with
their run's validation receipt; current reproducibility is separately unavailable.
Reassessment creates a new run/revision. Operational record reviews may still
be removed as today; their catalog historical references survive independently.

New catalog-owned report/rationale/extension files, when later implemented, have
an exact `(catalog subject, field)` owner and use the same immutable publication,
hash validation, directory-fsync retry and pending-journal protocol. Cross-kind
ownership checks must include them; no sharing or garbage collection by citation
count. Catalog intents/file checkpoints are separate typed tables with FK catalog
subjects, not fake operational capture records. Only later explicitly authorized
catalog maintenance may retire them. Neither evidence cleanup nor deleting an
analysis/experiment link can delete an artifact owned by another entity.

#### Separate synthetic milestone C1: catalog metadata foundation

C1 is a separate synthetic milestone, not M1 completion, M2 integration
or authorization to run anything from this ADR. Implement the catalog tables,
stable identities, provenance/coverage metadata, frozen runs/selections, findings
and support links, conclusion/experiment revisions, catalog review histories and
bounded metadata resolution on synthetic temporary fixtures only.

Use fixture schemaVersion 2 and catalogVersion 1 in both descriptor/store metadata;
payloadVersion stays 1. An M1/schema-1 binary must reject schema 2 before writes.
C1 creates fresh marked temporary roots with the same canonical prefix/root,
runtime/filesystem and SQLite settings; no in-place upgrade of even a schema-1
fixture, implicit open migration or production-capable root. Schema-1 M1 creation
and checks remain unchanged. The future M2/M3 release must explicitly qualify
compatibility/migration for the combined schema, not silently cut over this fixture.

Expected changes: `tools/replay-catalog.js`, `tests/unit/replay-catalog.test.js`,
minimal fixture/schema/locked-query hooks in `tools/replay-store.js` if needed,
syntax-check registration and a catalog qualification record. Reuse the core's
owner lock, connection settings, transaction generation, bounded pages and error
cleanup; do not build another lock/SQLite connection policy. C1 inputs are
caller-validated synthetic facts; it does not invoke/import existing analyzers.

C1 references only already registered synthetic M1 evidence artifacts, with no
new catalog-owned payload publication, file retirement or relocation. Small
catalog bodies are bounded inline values; oversized bodies explicitly fail with
`RESOURCE_LIMIT` and leave caller input untouched. Catalog body spill/publication,
multi-page large-result publication, general evidence snapshots and cleanup-event
integration are a later C2 task. C1 rejects any operation needing those facilities;
it must not weaken the full design or pretend such results are ready. Single
bounded result/revision batches use one atomic metadata transaction. Run selections
may be assembled in bounded pages, with durable planned state and exact retry.
The complete C1 transaction input, including all findings/support/properties, is
limited to 128 rows and 8 MiB with 64 KiB per row; exceeding it rejects before
mutation. Support append primitives are usable only inside the transaction that
creates their revision/finding, before publication; no post-commit support edits.
Result publication atomically commits its full declared finding/support set and
completed checkpoint. Larger result sets require C2, not repeated C1 completion
batches. Fixture schema hooks are internal typed operations, not a public arbitrary
SQL escape hatch. Historical artifact events may be appended from explicit
synthetic receipts; C1 does not automatically write events during core cleanup.

C1 acceptance gates, all synthetic:

1. Reconstruct exact identities, ordinal order, unknown/absent/null/false/zero
   values and conflicting provenance. Runtime tags, upload IDs/versions, local
   configuration and score alignment/terminal knowledge remain independently
   sourced. Metadata extent cannot become runtime coverage or a final score.
2. Build a replay -> captures -> sealed run -> findings/evidence -> two conclusion
   revisions -> experiment arms -> revision-specific reviews chain. Reject wrong
   kind/dangling FK, cross-replay actors/ranges, incompatible unsupported provenance,
   identity replacement and unsealed-run findings. Retain unavailable requested
   captures visibly. Permit explicit incompatible/unknown observations without
   promoting them to supported comparisons.
   Reject evidence outside sealed selection and mismatched capture/artifact scope;
   explicit cross-question support needs a stored comparison link. Validate
   metadata-snapshot intent rejection, callback lifetime and unchanged core payload
   pinning without adding the deferred catalog evidence-snapshot API.
3. Exercise all four verdicts independently of completed/errored/deferred workflow,
   draft null verdict and explicit aggregate counts/precedence. A supported pass
   plus an unknown candidate cannot appear as complete pass. A command observation
   is not displacement; insufficient scenario coverage cannot be unexercised.
4. Append revision/support atomically with expected-head CAS; preserve older text,
   support, counterevidence and reviews. Two processes race on the same expected
   head: one succeeds and the other returns `REVISION_CONFLICT`; independent review
   events survive concurrent writes. SQL/API attempts to mutate published history
   fail. Inject transaction/commit/process-death faults; reopen yields the previous
   complete revision or the new complete revision, never an orphan head/partial
   support set. Planned-run page retries preserve exact selection without duplicates.
   Test first-head 0, non-null contiguous predecessors, exact old-revision/event
   retry after head advancement, and stale-head conflicts for different retry IDs.
   Reject invalid workflow edges, unsealed running, premature review completion
   and result publication without exact bounded declared counts; failed execution
   cannot manufacture a failed gameplay verdict.
5. Authorize synthetic log-done cleanup and separate score-retiring cleanup through
   the existing core, without changing their policy. Catalog references/history
   remain resolvable as retired/unavailable; score done alone still retains files.
   Reads never claim/complete/reconcile, read bodies or resurrect missing evidence.
   Catalog reviews cannot retire captures; citations cannot prevent authorized cleanup.
6. Assert exactly 10 and 1,000 capture anchors in paired catalog fixtures; record
   accompanying table counts separately. Distribute associated runs/revisions
   into valid bounded batches, not one over-limit support set. Compare fixed
   selected list/lookup/support/history/review operations, indexed plans and
   SQL/returned-row counters: these counts depend on selected rows/pages, not
   total anchors (one bounded lookahead row per page is permitted). Metadata operations
   open/read/write zero payload bytes and update only selected metadata/index pages;
   no graph/corpus rewrite. Reject row/page/source overflow and stale cursors.
   Run a core-only worker under the unchanged 192 MiB heap, 256 MiB RSS and
   30-second operation deadline; record operation/byte/time/RSS measurements.
   Reuse the M1 600 MiB qualification only with unchanged-core correspondence and
   impact assessment; rerun that streaming gate if shared storage paths change.
7. Run focused catalog and affected M1 tests, full repository tests, syntax/build,
   links/examples/whitespace and preservation checks. Report measured scope and
   limits, not guarantees of power-loss durability, arbitrary OS close-failure
   semantics or additional platforms.

Excluded: production roots/evidence, existing command/analyzer/cache integration,
automatic extraction of historical documents, full-text search, generalized graph
engine, catalog-owned body files, backup/export/migration/rehearsal, runtime changes,
automatic reviewer completion, strategy promotion, watcher/gameplay and M2–M4.
No schema/API decision is intentionally left open for C1; production catalog-body
publication (C2), reader wiring and combined-schema cutover remain separate work
requiring their own qualified implementations and explicit authorizations.

### Later milestones and release gates

The first bounded M2 slice is specified in the
[M2a diagnostic-reader plan](../architecture/replay-storage-v3-m2a-plan-2026-10-04.md).
It is a planned synthetic consumer seam, not completion or relaxation of the
full M2 gates below. Historical M1/C1 qualification records retain their scope.

- M2: integrate every reader/writer behind the store; preserve lifecycle and
  CLI/report semantics, add bounded v2 read support and versioned cache keys.
  Test current maps/deferrals/local registration/log recovery versus score
  missing-file handling, exact diagnostics/coverage, and all reviewers. Include
  concurrent imports/reviews/cleanup and snapshot safety under each error path.
- M3: implement administrative migration/export/verification/rollback and
  rehearse on isolated fixtures first, then a separately approved frozen copy.
  Crash-inject at each checkpoint and descriptor publication boundary; altered
  source/receipt/checkpoint and incomplete backups must block resume/cutover.
  Verify all optional/unknown data, artifacts, reviews and retired identities,
  including streams exceeding the old string limit. Exercise rollback before
  and after new logical writes; prove oversized legacy rollback is rejected.
- M4: separately authorize production migration only after a current complete
  backup/restore proof, all supported consumers upgraded, preservation receipts,
  passing concurrency/crash/resource gates and an explicit rollback plan. No
  milestone completion automatically authorizes M4 or production cleanup.

## Consequences

Routine work becomes proportional to selected metadata/payloads rather than
the accumulated diagnostic corpus. This is an architectural expectation to
measure, not a promised startup speed or total analyzer-memory reduction.
SQLite metadata, indexes and retained per-response files still grow with
evidence; disk capacity, file counts, large selections and uncompleted reviews
remain real limits. This decision does not solve them by deleting evidence.

The breaking storage format requires coordinated tooling qualification and
explicit cutover. The first milestone is isolated and reversible; no currently
running v2 command changes because this document was added. The
[review/cleanup](../diagrams/replay-review-cleanup.puml) and
[score-retention](../diagrams/replay-score-retention.puml) diagrams still describe
the deployed v2 workflows, not implemented v3 file journaling.

No storage-design decision remains intentionally open for M1. SQL implementation
details, measured performance, platform flush qualification, complete consumer
compatibility and production migration readiness are unverified deliverables,
not assumptions or permission to migrate. Changes to selected budgets, runtime
support or safety guarantees require an explicit ADR update with evidence.
