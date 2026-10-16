# Explicit synthetic SQLite cache imports

This is a small fixture-only consumer seam, not production admission, migration
or authority selection. Production remains managed v2. It follows
[ADR 0002](../decisions/0002-map-linked-replay-logs.md),
[ADR 0006](../decisions/0006-replay-storage-v3.md) and the
[migration plan](replay-production-sqlite-migration-plan-2026-10-11.md).

## Entrypoints and supported inputs

### External score validation — 2026-10-15

The selected importer preserves complete score `validation` values above 16 KiB
as an existing owner-qualified `extensions` / `json-v1` property at `/validation`.
Values at or below 16 KiB remain inline; neither that ceiling nor the core's
64 KiB inline ceiling increases. The external value is capped at **1 MiB**;
aggregate score-record metadata (serialized values plus UTF-8 property-name bytes,
including reconstructed reviews) is **2 MiB**. Existing 100,000-value/depth-64,
transport/decoded-body and execution caps apply independently. Large semantic
findings are not transport admission failures.

The existing import intent reserves the response and external property together.
Pending records omit the not-yet-published property; publication installs its
original ordinal only after immutable bytes are ready. The checkpoint binds its
owner-qualified path/hash/length. Recovery checks ownership, readiness, encoding,
role, root/leaf structure and complete bytes under the writer lock; corruption
rejects without repair. Small-value checkpoints keep their format. Reimports are
generation-neutral and preserve provenance, unknown fields and relational reviews.
Converted-record no-ops accept supported inline/external validation only after the
same integrity checks, without inventing historical import commitments.

The existing bounded score reader reconstructs this JSON property. SQLite recovery
already inventories/copies it. The capped administrative v2 export now emits this
one supported JSON leaf, preserving nested ordering and retaining exact original
bytes in its recovery archive. Existing 4 MiB manifest/32 MiB artifact limits remain;
this is not production-scale v2 rollback. Other external metadata remains fenced.

Generated regressions cover both inline thresholds, an exact **69,624-byte** value,
linked/map-independent scores, semantic findings, corruption, interrupted publication,
repeated recovery, analysis parity, converted no-ops and independent SQLite recovery.
No real cache body is reread. Candidate-09 and earlier releases remain unchanged.
Results, successor pins and inspection limits:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/score-validation-property-20261015-GDBRFY/report.json`.
This is synthetic compatibility evidence, not production adoption or qualification.

Existing production entrypoints are `importCacheFile` (used by scan/watch) and
`importScoreCacheFile` (`score-import`). Their ordinary dispatch and lifecycle
behavior remain unchanged. The separate route is:

```text
node tools/replay-logs.js --synthetic-sqlite <fixture-root> import <cache-fixture-root> <cache-basename>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> score-import <cache-fixture-root> <cache-basename>
```

[importSyntheticCache](../../tools/replay-import-command-fixture.js) accepts only
own data options `{synthetic:true,root,collection,sourceRoot,sourceFile}`. Collection
is exactly `log` or `score`. Inputs are snapshotted before awaits; extra options,
accessors and inherited/custom-prototype option objects reject. No recovery,
schema, clock, budget or backend override is exposed.

The destination must already be a canonical, resident schema-1
`pain-gain-store-v3-fixture-` root directly under canonical `os.tmpdir()`, using
the unchanged [fixture access guard](replay-log-checkpoint-integration.md).
This command never initializes storage or accepts a rehearsal/production root.
The source must separately be a canonical direct temporary
`pain-gain-cache-import-fixture-` directory, with independent resident marker
`.synthetic-cache-fixture` containing exactly `synthetic-chromium-cache-v1\n`.
The selected importer reads one explicitly named regular, independent cache basename.
The separate bounded scan/watch route below enumerates only this same marked
synthetic directory. No alias, symlink, arbitrary path or Arena-cache access is permitted. These declarations
label independently generated test data; they do not establish real provenance.
Metadata-check/open races remain; no atomic OS-level no-hydration guarantee is made.

Supported log cases are map-bearing file-backed logs, logs using a validated
existing replay map, map-only responses and typed diagnostic-only responses.
Mapless logs return the existing deferred result without a record/checkpoint.
Scores use an existing active, validated replay/map association when present.
New isolated stores also admit **map-independent scores with no association**,
preserving v2's original `mapId: null`, omitted `buildId` and separate
`embeddedBuildId: null`. No map, replay-association row, build or provenance is
fabricated. An existing invalid/inactive association is not treated as absence;
it still rejects before checkpoint mutation. An independently committed score
keeps its original null link on repetition, even if a later log registers a map.
Pre-existing records without this import commitment reject except for the
verified converted-record no-op described below. Unsupported collection presence,
retiring states and broader lifecycle recovery are not silently adopted or
normalized. Explicit retired identities deduplicate; they do
not establish availability or create historical source records.

### Association-free storage boundary

New schema-1 fixture creation adds a virtual `records.association_id` foreign-key
projection: it is SQL NULL only for score rows with null map/build projections;
logs and linked/known-build rows still reference `replays(key)`. Original
`replay_id`, record keys, properties and ordinals remain unchanged. The insertion
API permits missing associations only for format-1 `replay-frames` or
`game-metadata` scores with an explicit null `mapId` and omitted `buildId`.
Linked score map IDs must match their replay association; log checks remain strict.
The virtual column is not a new authoritative metadata property.

Existing fixture databases are never rebuilt or upgraded on open/import. A bounded
schema capability query under the writer lock rejects association-free admission
to the older schema with `UNSUPPORTED_STORE` **before publishing a checkpoint**.
Existing linked imports remain supported. This is an additive fixture-schema
capability, not production schema migration or authority selection; older binaries
do not gain association-free insertion support merely by reading the descriptor.

The import commitment explicitly stores null map/replay bindings and null link
ordinals for this case. It uses the same prepared/reserved/published/verified
protocol, owned output reservation and exact cache/body hashes. Score-only pinned
readers and claim/examined checkpoints do not require invented map evidence.
Map-dependent snapshot access still reports `UNAVAILABLE` for the absent link.
Every selected non-null score map link is checked, including selections following
an independent score for the same replay.

## Transport, metadata and finite bounds

The route reuses the existing full Chromium simple-cache-v5 stream/EOF/CRC/key-hash
and HTTP/gzip validators, then the existing log or score parser. Generated test
transport is constructed independently, not wrapped around downloaded evidence.
**Raw HTTP admission remains unsupported.** Modern complete transport is required
here; the ordinary log parser's historical abbreviated-frame acceptance is not
broadened or removed from production. Score-body semantic validation remains
distinct from transport rejection: original invalid/partial semantic bodies retain
their validation metadata as v2 does, not an analytical pass.

Shared pure record constructors and filename candidates preserve v2 field values,
types, absence/null, source keys, request/response/cache hashes, original JSONL
lines, score-body bytes, diagnostic keys/raw strings and ordering. Map files use
the same canonical payload checksum and embedded-checksum format as v2; their byte
hash is separate. New known association builds never fill an unknown log's own
`buildId: null`. Known-ID conflicts reject. Score build identity stays omitted,
with `embeddedBuildId: null`; no winner identity is inferred.

Fixed limits (not a production capacity profile):

| Dimension | Bound |
| --- | --- |
| Selected cache file | 1 MiB; checked before allocation |
| Decoded response / original output | 4 MiB |
| Saved canonical map | 1 MiB |
| Diagnostic sidecar / wrappers | 2 MiB / 4,096 |
| Inline metadata field / fields per new entity | 16 KiB / 64 |
| Inspected structural values / nesting | 100,000 / 64 |
| Log tick-span enumeration | At most 10,000 difference |
| Current source records / maps / associations | 64 / 64 / 64 |
| Root control properties / root row bytes / reconstructed reviews | 127 / 8 MiB / eight per record |
| Stream and publication I/O chunks | 64 KiB |
| Invocation deadline | 60 seconds, cooperative phase checks |

Parsers still materialize this bounded selected response. The new opt-in decoded
limit, log tick-span guard and strict UTF-8 guard do not change ordinary defaults
(100,000,000 decoded bytes, legacy log UTF-8 handling and no new span restriction).
The route rejects invalid log UTF-8 rather than changing original bytes through
replacement decoding. Existing core metadata/handle/lock/busy limits also remain.
Publication is awaited and chunked, but this is not end-to-end streaming, a hard
CPU timeout or a universal heap/RSS qualification. No limits automatically increase.

### Explicit converted-corpus budget

The ordinary defaults above remain unchanged. A production authority proof may
opt into this exact `importBudget` object (every numeric value may only be reduced):

```json
{"profile":"converted-corpus-v1","logs":320,"scores":128,"maps":64,"replays":64,"rootProperties":1024,"rootBytes":8388608,"operations":128}
```

The existing descriptor `production.proofHash` binds this budget; preparation and
selection validate it, and import/scan copy validated values into private state.
Unknown profiles/keys, accessors and non-positive, non-finite or increased values
reject. There is no schema migration or per-call override. A missing budget keeps
the 64-record default. This profile changes **corpus traversal only**, not selected
cache, decoded-value, diagnostic, execution or scan-discovery limits.

Record/map/replay counts and root checkpoints are paginated under the existing
writer lock. Only one page and the selected checkpoint are retained; root-row
bytes and counts are bounded before parsing. Prospective checkpoint bytes are
reserved before publication, and prepared recovery rechecks insertion capacity.
Scan uses bounded checkpoint/operation pages before reconciliation and exact-source
recovery. Its 64-file discovery limit remains: a large stored corpus does not
authorize scanning an arbitrarily large cache directory.

### Proof-pinned cache capacity

The optional production migration-proof `cacheCapacity` selects this exact
`replay-cache-v1` profile. Every field is required; positive safe integers may
only be reduced. Accessors, inherited options and unknown fields reject. A private
frozen copy is used; the descriptor proof hash binds the profile and pending-import
source scope. Changing that proof cannot resume an old commitment.

```json
{"profile":"replay-cache-v1","wrappers":8192,"diagnostics":4194304,"files":2048,"entries":4096,"directoryIterations":1048576,"cycleBytes":67108864,"discoveryBytes":536870912,"attemptBytes":268435456,"attempts":4096,"reportBytes":2097152}
```

Absent this opt-in, existing synthetic/production defaults remain unchanged.
This does not raise the 1 MiB cache-file, 4 MiB decoded/output, 16 KiB field,
100,000 structural-value, 64-property, depth-64 or tick-span limits. Import retains
60 seconds; scan/watch retain 180 seconds, five retries and three cycles. These
cooperative deadlines do not promise completion of every admissible workload.
Diagnostic bytes mean canonical ordered JSONL, not the v2 array's raw byte span.
Selected diagnostic arrays remain bounded materialization, not end-to-end streaming.

Profile discovery is shallow, v2-style lexicographic file discovery: directories
are not descended and their count is explicit; nonregular entries reject.
Metadata keyset walks retain at most 128 names and 128 hash/identity summaries,
never an entire directory or multiple decoded response bodies. Every walk enforces
entry/file limits; a cumulative iteration budget bounds repeated keyset walks.
Full cache content is hashed before processing and at final inventory comparison.
Per-file pre-open residency, safe paths, stable reads and byte limits remain; the
production writer lease/scope is revalidated before and after each synchronous
page. This does not cache residency or promise atomic OS-level metadata/open
protection. Cancellation yields between pages, every 16 summaries and imports.

The existing v2 parser classifies non-log files as `unrelated`, explicitly reported
in sorted order without admission. Matching incomplete/unsupported log responses
still reach strict transport validation and reject. Default marked synthetic scans
retain their old stricter unsupported-input behavior. A score response is unrelated
to **log scan**, not admitted as a score. No recursive discovery or raw HTTP admission
is added. Exact pending recovery, converted no-op verification, reservations,
reviews and payload checks are unchanged. Failure may retain committed partial
work, but cannot report complete; retries are explicit and remain finite.

Metadata-only measurement on 2026-10-14 found 1,388 regular files / 31,996,663 bytes
in the default Arena `Cache_Data`, plus one `index-dir` directory; largest file
503,192 bytes. A 20-file retained provenance cache totals 1,405,882 bytes, largest
86,426. All 386 original provenance references were resident and matched recorded
metadata. No real cache payload was opened. The unchanged 1 MiB transport bound
fits these measured files; decoded bytes, canonical diagnostic bytes, per-field
sizes and response representations remain unverified. The diagnostic ceiling is
tested with generated data, not asserted as a real canonical-sidecar measurement.
Generated 5,882/8,192-wrapper imports, 8,193-wrapper rejection and 1,388-file discovery
give separate boundary/shape coverage, not combined real-workload throughput proof.
Other-output display and other consumers' independent selection caps are unchanged.

### Verified converted-record repetition

An unchanged selected log or linked score recorded in a completed
`/boundedFixtureConversionV1` commitment can return `deduplicated` without creating
an import commitment or writing any state. Under the writer lock it checks
conversion membership/collection ordinal, identity and known build conflicts,
original source metadata, map/replay bindings, relational projections and reviews,
ready output ownership/path/hash/length, exact retained output bytes, and the log's
owned diagnostic leaf/hash/bytes/order. Unexpected children, missing/corrupt files,
changed source metadata and incomplete conversion reject without repair.

Original `sourceEntry`, import time, unknown properties, field order, reviews and
log null/omitted/known build representations remain unchanged. Unknown builds are
not filled from the incoming response or association. Legacy logs have a decoded
response fingerprint, not a historical raw-cache hash: full transport validation,
source key, response/output and diagnostic comparisons are required, but no
unrecorded historical transport commitment is invented. Scores additionally retain
their recorded cache-entry fingerprint. Claim/waiting/done states can be verified
without changing lifecycle state; missing managed outputs still reject.

For a legacy log only, omitted `diagnosticCoverage` may remain omitted when the
verified conversion checkpoint binds this store, unique record membership and
collection ordinal, and its version-1 identity retains an absolute source root
and finite source/marker SHA-256 fingerprints. Missing, incomplete or incompatible
conversion provenance rejects; no historical import commitment is invented. A
present value, including explicit null, still undergoes the exact comparison.
This exception does not skip output ownership/content or diagnostic leaf/hash/
bytes/order checks, alter reviews, infer a build ID or backfill a derived summary.
An absent summary is not a successful analytical coverage finding. Repeated
supported duplicates remain generation-neutral. Generated regressions cover this
legacy omission separately from malformed/present summaries and corrupt payloads.

This does not adopt arbitrary records lacking conversion/import commitments or
broaden converter support for map-independent scores. Already committed independent
score imports retain their existing support. Local-log adoption remains separate.

## Publication, repetition and failure

All destination planning, identity/ownership checks, append ordinals and mutation
run under the existing owner-token writer lock. Narrow core queries resolve exact
artifact owners, append tails and at most two intent-file headers; no manifest,
database-wide content hash or unbounded record set is reconstructed.

Before map or payload publication, the bounded root commitment records the source
marker/cache hashes, exact request identity, store ID, filenames/hashes/lengths,
original timestamps and map/replay/record append ordinals. Phases are `prepared`,
`reserved`, `published` and `verified`. An incomplete import fences a different
selected source: resume that exact import first. No automatic resume or retry runs.
Changes to its source, including a new response fingerprint at the same filename,
reject without abandoning or reinterpreting the old intent.

Maps publish exclusively and are checked before registration. File-backed records
reserve outputs and diagnostics with the existing publication intent API, publish
verified immutable files, then atomically finish readiness and original properties.
Generic reservation appends are corrected to the original property ordinals in
that same preparation transaction. Diagnostic-only logs prepublish the owned
sidecar, then atomically create a ready evidence-only record with null output; no
pending empty JSONL is invented. Map-only responses create no source record.

Recovery checks ownership, projections, ordinals, pending/ready reservations,
exact intent headers, leaf references and bytes before accepting state. Unexpected
diagnostic descendants, missing/corrupt ready artifacts and inconsistent commitments
reject without repair. Existing exact interrupted publications may be reused;
unknown same-hash files are not adopted. For safety this seam rejects a missing
already-published log output rather than exercising v2's missing-log repair behavior.

Independent source checks run around preparation, publication and final acceptance.
`verified` is checkpointed only after retained references and bytes pass final
comparison. An interrupted `published` state can be verified on an explicit repeat.
Completed repetition preserves generation, reviews, unknown properties and payloads.
Byte-identical complete transport at another marked synthetic path deduplicates while
retaining the first source/cache provenance. Existing reviews are reconstructed
from their original relational properties, with binding/inline checks; none is
claimed, examined, completed or released by import.

A repeat must still match the original cache hash, including after completion
or at an alternate filename. Same-body/different-transport duplicates are outside
this narrow seam and reject, rather than blessing a corrupted cache commitment.
Alternate-path deduplication retains
the first recorded provenance rather than rewriting it.

Primary errors in the new source/map/owner cleanup paths retain separate cleanup
failures. Core publication, rollback, lock and cleanup behavior is reused, not
requalified for power loss or every OS failure. Only normal owned publication
temporary/lock lifecycle operations occur; incomplete artifacts remain retained.
No historical evidence or unowned collision file is removed.

## Downstream integration and remaining gates

The import test exercises the existing selected log/score checkpoint commands and
log/score/combined analysis adapters on admitted generated data. It also exposed a
claim seam mismatch: relational checkpoints did not populate the record's original
`reviews` marker. Historical/scout readers now optionally pin the selected task's
review alongside the same source selection. They validate owner binding and the
inline/original `claimedAt` checkpoint, retaining null inline projections; legacy
original reviews remain supported when no relational row exists. The pure historical
projection accepts that validated predicate. No record or review is rewritten by
the read-only consumers, and ordinary v2 gates remain unchanged.

Focused synthetic verification and its intermediate failures are retained at
`/Users/zoltanka/.local/share/pain-and-gain-evidence/synthetic-import-routes-20261013-8xgqCR/report.json`.
There is no real-cache import, backup/rehearsal access, full-size test, historical
Git-object read or qualification run. The retained map-independent extension is
recorded at
`/Users/zoltanka/.local/share/pain-and-gain-evidence/map-independent-score-imports-20261013-Hhor9L/report.json`.
It covers small generated frame/metadata and invalid-semantic-body parity,
review/read consumers, exact repetition, later map arrival, interrupted recovery,
source/link/reservation corruption and legacy-schema rejection. It does not expand
the existing refusal to adopt unowned same-hash files or same-body/different-cache
transport; those restrictions still differ from broader v2 admission behavior.
Three parity regressions failed before correction. Afterward, 31 new and 221
existing focused checks passed on Node 24.19.0 (252 distinct checks, not pooled
repeat runs). Generated fixtures and intermediate failures remain retained.
Subsequent synthetic list/lifecycle and bounded scan/watch integrations are
documented in the migration plan and below. Remaining gates include
unowned/pre-existing-state adoption, missing-output repair, large/overflow admission,
maps/other CLI routing, production authority, lossless rollback and fresh qualification.
Production cutover and M2h remain unauthorized and unqualified.

## Bounded synthetic scan and watch

```text
node tools/replay-logs.js --synthetic-sqlite <fixture-root> scan <cache-fixture-root>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> watch <cache-fixture-root>
```

[scanSyntheticCache / watchSyntheticCache](../../tools/replay-scan-command-fixture.js)
accept own data options `{synthetic:true,root,sourceRoot,limits?,signal?}`. Roots
use the existing importer guards and marker, not a second backend. No store is
initialized. Default production commands are unchanged. These routes discover
**logs only**, just like v2 `scanCache`; selected `score-import` stays separate.
Only the exact synthetic marker is excluded from discovery. Directories, aliases,
unsupported transport and corrupt inputs reject explicitly rather than silently
disappearing from a successful report. Real Arena cache discovery remains fenced.

The initial inventory is bounded and sorted with v2's filename ordering. Existing
full transport parsing, source commitments, publication intents and exact-source
recovery are reused. One unverified import commitment may be resumed **only** from
its unchanged cache path and pinned cache/marker hashes in the selected directory.
This recovery precedes list reconciliation because list deliberately rejects
pending logs. Foreign, missing, altered or ambiguous pending inputs stop the run;
there is no skip, abandonment, repair or inferred identity. Checks repeat between
polls and before cycle completion. A concurrent unresolved publication prevents
successful completion. Each importer revalidates under its own existing lock.

After startup recovery, bounded list reconciliation runs once, matching ordinary
scan/watch startup: waiting migration, then eligible done-log cleanup. It does not
repeat destructive reconciliation every poll. Discovery/import is not one corpus
transaction: earlier verified publications or retirement may remain after a later
failure. Reports retain events/counters and mark the result incomplete. Explicit
reinvocation re-enumerates and uses durable exact-source checkpoints. Root control
inspection is capped at 127 properties / one operation page; unsupported recovery
states remain fenced rather than creating a new scheduler journal.

Successful unchanged sources are skipped on later polls within the same run, but
their cache bytes are still hash-checked. New/changed files are attempted in sorted
order. Mapless logs are deferred, then retried once at the end of that cycle if a
map may have arrived, and on later polls within the attempt cap. The retry counter
is not reset by that same-cycle retry. Errors stop immediately: unlike v2's broader
five-error retry policy, no automatic transport/publication-error retry is added.
Unresolved deferred logs at the final cycle are `DEFERRED_INPUT`, not completion.
Changing inventory or bytes during a cycle is `CHANGED_INPUT`; between polls,
new/rewritten sources are supported. Completed source provenance remains immutable.

### Bounds and shutdown

Limits are snapshotted before async work. `limits` may only reduce `SCAN_LIMITS`:

| Dimension | Maximum/default |
| --- | --- |
| Files per inventory / distinct filenames during run | 64 / 64; at most 65 directory entries including the marker |
| Selected cache file / bytes per inventory | 1 MiB / 16 MiB |
| Cumulative discovery body hashing | 64 MiB; reserve a 1 MiB read before each inspection |
| Imported-source bytes charged per attempt / total attempts | 128 MiB / 128 |
| Attempts for one unchanged source | Five; failures stop immediately |
| Watch cycles / polling interval | Three / 2,000 ms |
| Cooperative run deadline / retained event report | 180 seconds / 1 MiB |

Importer decoded/artifact/diagnostic limits and the list's separate metadata and
retirement I/O bounds remain unchanged. Byte counters describe cache discovery and
selected-source attempts, **not** total repeated importer verification or native
SQLite I/O. Repeated import I/O remains bounded by finite attempts and unchanged
per-import caps. Bodies/decoded arrays are selected and capped, not end-to-end
streamed. Root/control reads retain their existing independent bounds.

`scan` makes one pass. Execution yields to the event loop between imports so
signals are not starved by a chain of immediately fulfilled promises.
`watch` awaits each import and each poll; it has no background
worker and stops at its cycle ceiling. An `AbortSignal` cancels waiting promptly;
in-flight import/reconciliation is awaited before shutdown is acknowledged. Those
operations may commit before cancellation is observed. The deadline is cooperative,
not native-call preemption or a hard shutdown-latency guarantee. No promise timeout
leaves work running. The CLI installs temporary SIGINT/SIGTERM handlers, removes
them in `finally`, prints a final report, and exits 130 for cancellation, 1 for
failure, or 0 for complete bounded execution. API errors retain primary codes and
cleanup failures and attach `scanState` with `complete:false` and
`executionStopped:true`. Reported cleanup failures set `cleanupUncertain:true`
and withhold `shutdownConfirmed`; they never replace the primary error. Clean
termination confirms shutdown. Invalid arguments reject before execution starts.

Reports are bounded summaries, not retained diagnostic arrays. Deduplication is
reported explicitly; ordinary v2 suppresses those events. A complete report covers
the observed finite cycles only, not lossless catch-up, current corpus integrity,
unattended collection or analysis readiness. Files may arrive after the last check.
Cooperating writers serialize selected mutations; arbitrary uncooperative edits
and metadata-check/open races are not atomically prevented.

Small generated fixtures exercise sorted v2 parity, map arrival, duplicates,
changed sources, pending recovery, cancellation/child exit, conflicts and budgets,
plus scan → claim/examined → analysis → list. Fixtures and recovery observations
remain retained; only authorized test-owned retirement removes new payloads.
Receipt: `/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-scan-watch-20261013-0Cldh1/report.json`.
No automatic collection is activated. Authority, lossless rollback, cutover and
qualification remain separate mandatory gates.

## Map/output and local maintenance consumers

[Explicit synthetic maintenance](replay-synthetic-maintenance.md) now connects
bounded `maps`, selected `other`, status-only migration and committed local-JSONL
adoption. Local admission uses existing v2 provenance/flag/build validation and
the existing output journal with a separate writer-owned adoption proof; ordinary
cache reservation remains strict. An unfinished local adoption blocks new cache
imports and scan until its exact selection is recovered. Ready map checksums can
be verified; missing-checksum replacement remains a concrete map-qualified
recovery-contract gap, not completed repair coverage.
