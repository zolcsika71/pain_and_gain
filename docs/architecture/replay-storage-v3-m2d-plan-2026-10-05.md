# Storage v3 M2d: fixture-only score-only analyzer input

Date: 2026-10-05. Status: planning contract awaiting independent review and
separate implementation authorization. Inspected published commit:
`651ddb7068eb8905188c3158e9cf84b7e0878c1e`.
This document reserves **M2d**, the next unused identifier after M2c. No adapter,
oracle or qualification result is created by this plan. All new budgets below
are proposed, unmeasured acceptance requirements.

Authority: [ADR 0006](../decisions/0006-replay-storage-v3.md),
[ADR 0005](../decisions/0005-replay-frame-scoring-evidence.md), the
[analyzer contract](replay-analysis.md), and the
[score evidence contract](replay-evidence-contract.md#replay-score-source-retention).
The [analysis](../diagrams/replay-analysis.puml),
[score retention](../diagrams/replay-score-retention.puml), and
[log cleanup](../diagrams/replay-review-cleanup.puml) diagrams describe the
existing workflows. This slice changes neither lifecycle.

## Decision and prerequisites

Add one asynchronous v3 input adapter for score-only analysis of one replay.
Support selected game-metadata and replay-frame response bodies, and the existing
full/compact report. Reuse the current score validator and analyzer before
attempting combined log/score, lifecycle or cache integration.

Completed foundations are [M1](replay-storage-v3-m1-2026-10-03.md) storage,
publication and snapshots; [C1](replay-catalog-c1-2026-10-04.md) schema-2 evidence
access; [M2a](replay-storage-v3-m2a-2026-10-04.md) pinned payload iteration; and
[M2c](replay-storage-v3-m2c-2026-10-05.md) shared analyzer/snapshot qualification.
[M2b](replay-storage-v3-m2b-2026-10-04.md) is a compatibility checkpoint, not a
runtime dependency. Historical pending/unstaged wording records earlier states.
M2c's 490-test result is historical evidence for its bounded synthetic scope.

The concrete gaps are pathname loading and whole-score-collection ownership
checking in [replay-score-analysis.js](../../tools/replay-score-analysis.js),
optional collection presence unavailable in the current snapshot view, and
automatic map pinning unsuitable for optional score associations. Resolve these
with the narrow boundaries below, without changing a schema or writer policy.
Preserve M1 recovery, cross-kind ownership, BigInt decoding, error precedence,
and log-snapshot defaults. An additional missing capability is a blocker to
report, not permission for a wider storage refactor.

## Public interface and implementation scope

New `tools/replay-score-analysis-fixture.js` exports:

```text
analyzeFixtureScoreReplay({root, schemaVersion, replayId,
                          scoreFingerprints, reportMode = 'full'})
  -> Promise<existing score-only replay report>
```

- Accept a plain options object with exactly those keys. Reject log fingerprints,
  implicit select-all, unknown keys, duplicate identities and unsupported modes.
  Require one lowercase 24-hex replay ID and 1–64 distinct lowercase 64-hex score
  fingerprints; copy the request before any await. Report `RESOURCE_LIMIT` for
  more than 64, otherwise named argument/identity errors.
- Require numeric schemaVersion 1 or 2 and the core's canonical direct temporary
  root, fixture prefix/marker, Node 24.x at least 24.19.0, native macOS and declared
  local APFS contract. No default root, path alias, production root or CLI switch.
- Dynamically open `openStore({root, mode:'read'})` or
  `openCatalog({root, mode:'read'}).evidence`, closing the owning handle. No
  `recover:true`, implicit upgrade, retry loop or writable connection.
- Full is the API default. The result is a detached ordinary report; analysis and
  cleanup finish before resolution. No output stream, live view or iterator is
  returned. Local-build input follows M2c's safe fixture-local 16 KiB rule, read
  once; missing means null, with no fallback to this repository's build.

Expected implementation paths:

| Path | Responsibility |
| --- | --- |
| New `tools/replay-score-analysis-fixture.js` | Argument/root gates, one snapshot, bounded original metadata and raw-byte loading, score-only report assembly |
| [replay-score-analysis.js](../../tools/replay-score-analysis.js) | Separate loading from the existing score validation/grouping/mapping/measurement implementation |
| [replay-analysis.js](../../tools/replay-analysis.js) | Shared score report assembly; preserve synchronous v2 API, CLI, combined score branch and log-only behavior |
| [replay-store.js](../../tools/replay-store.js) | Narrow score-selection snapshot mode with collection presence and optional-map policy; reuse existing lock/transaction/cleanup machinery |
| New `tests/unit/replay-score-analysis-fixture.test.js` and `tests/fixtures/replay-score-analysis-m2d-*` | Independent frozen oracles, deterministic fixtures/workers, failure/concurrency/resource checks |
| Existing analyzer/score/store tests, `package.json`, relevant docs | Necessary regressions, syntax registration and separate measured qualification record |

No change is planned to catalog schema/APIs, payload encoding, runtime,
dependencies or current consumer dispatch. Small pure loading helpers may be
shared with M2c only where behavior is identical and its regressions stay intact;
do not copy a second analyzer or apply diagnostic-JSON rules to score bodies.

## Storage-neutral score and report boundary

Keep the synchronous `analyzeScoreEvidence` interface as the v2 loading wrapper.
Extract `analyzeLoadedScoreEvidence` in the same module, accepting the existing
selection/analysis inputs plus a detached `sourceEvidence` map keyed by the exact
selected record object/occurrence, not merely its fingerprint. This preserves
v2 behavior even for malformed manifests with duplicate record identities.
Each entry is `{bytes: Buffer}` or the v2 loader's explicit
`{error: string}` result. It contains no root, descriptor, SQL handle, live view
or asynchronous callback. Preserve the existing validation order and sorted
fingerprint order. The wrapper retains native file-error behavior and avoids
loading records rejected by the existing pure record-schema predicate.

Both wrappers use this single score implementation. Recompute response SHA-256,
request-qualified source fingerprint, `validateScoreBody` results and stored
coverage/validation comparison from the exact supplied bytes. Keep cache-entry
fingerprints as original provenance; no cache bytes are available to verify them.
Do not replace evidence identities with sidecar hashes or store IDs.

In `replay-analysis.js`, expose a narrow synchronous
`analyzeLoadedScoreReplay({replayId, scoreFingerprints, reportMode, localBuildId,
scoreCollectionPresent, scoreRecords, sourceEvidence})`. It reuses the existing
analysis session with `fingerprints: []`, empty logical maps/replays/log records,
and the internal score finalization path, then invokes the shared loaded-score
analysis and existing final report builder. Factor that report-assembly helper
with the v2 combined branch rather than copying findings or report construction.
Do not use M2c's log-only empty-selection shortcut: the committed score-only
report intentionally includes the score-path coverage/unknown findings.

The existing v2 `analyzeReplay()` stays synchronous, including combined log/score
calls; its CLI defaults and output serialization stay unchanged. Static imports
on that path must not load SQLite. The new entrypoint supplies no snapshots,
diagnostics or selected log build IDs. Metadata may establish player mapping;
log alignment, log build association and log-dependent events remain unknown.
Replay frames alone never prove terminal status. Logical references keep
`replay_logs/manifest.json` plus scoreFingerprint, and original
`replay_logs/<outputPath>` locators; private sidecar paths never enter findings.

## One coherent score-selection snapshot

Add an exclusive mode to the existing core operation:

```text
withReadSnapshot({scoreSelection: {replayId, fingerprints}}, async view => result)
view.scoreSelection() -> {
  collections: {
    scoreRecords: {present, hasRows},
    retiredScoreSources: {present, hasRows}
  },
  currentKeys, missingFingerprints, retiredFingerprints
}
```

This mode rejects simultaneous recordKeys/mapIds/reviewKeys/payloadRoles options.
It is limited to score records and the two named optional collections, not a
general permissive-selection API. Existing snapshot calls retain their current
defaults and behavior. Reuse the same acquisition, error handling and every-close
loop; do not build an independent locking implementation. Returned selection
metadata is immutable and the accessor checks callback lifetime.

All facts below are resolved in one read transaction under the existing owner
lock, after root/descriptor/store identity revalidation:

1. Read the exact `collections` rows named `scoreRecords` and
   `retiredScoreSources`. Explicit `present=0` means absent; `present=1` with no
   rows means present-empty. A missing presence row is an unsupported fixture
   representation, not proof of absence. Validate any represented `/present`
   property against the projection. No unrelated root property is loaded.
2. Determine `hasRows` with indexed `SELECT ... WHERE collection='score' LIMIT 1`
   existence lookups in records/retired, not COUNT or corpus hydration. Absent
   collections with corresponding rows are `INVALID_REFERENCE`. These are
   bounded metadata integrity checks and authorize no unrelated artifact reads.
3. Resolve each explicit identity in current and retired indexes. Both at once
   are an integrity conflict. Genuine missing/retired selections are recorded
   as such, not manufactured current records. A current record must be claim or
   done, have no publication/cleanup intent, and have its owned ready output;
   pending, retiring or unresolved publication/cleanup rejects the entire call.
4. Validate selected output path/owner/original projections and the identity-bound
   score filename. Check the selected path against the globally unique outputs
   index and map/payload path indexes; do not scan all score records or assume
   uniqueness from the selected subset. Missing output reservations are errors
   even if a projected path is null. Require exact expected length/body hash.
5. Pin selected outputs, all selected original-property payload roots and their
   registered dependencies while the lock is held. Use existing ownership,
   size, regular-file, no-symlink and handle/metadata limits. Metadata queries
   decode integers as BigInt before normalization; preserve exact large ordinals.

The existing records foreign key requires an internal replay identity row.
Verify that key for current records, but do not hydrate its original properties,
invent a public replay association, demand active status or inherit its build.
Fixtures may insert a replay identity with null map/build/status and no original
association properties. Logical score-only reports contain empty replays/maps,
as the equivalent v2 score-only fixture does.

A score's original mapId is optional metadata and remains in the report. In this
mode, neither it nor an internal replay row triggers map registration validation,
map-file opening or map property loading. Existing foreign keys and writer rules
remain intact: a non-null projected map ID may require a metadata row in fixture
setup, but that is not evidence of a map association or permission to read a map.
Test a registered optional map whose artifact is absent. Log snapshots continue
to require their existing validated linkage and map pinning.

Preliminary getters/pages never authorize selection. No second snapshot is used
to repair omissions or combine generations. Release the acquisition lock before
bounded pinned reads/analysis; do not reopen artifacts by pathname. Ordinary
read opens stay nonmutating and report recovery-required where applicable.

## Presence, representation and error semantics

The loaded logical score collection is omitted when snapshot presence is false;
it is an array of selected current originals when true, including an empty
array. Missing/retired requested fingerprints are passed through the existing
selection logic as absent current records. Thus absent collection, present-empty,
all-missing and mixed current/missing selections preserve their distinct existing
v2 unknown findings. Retired identity is available to transport diagnostics but
does not add a new public report field or resurrect source bytes. These are
successful analyses of explicit availability facts, never fallback reports after
a failed artifact read. Any current selection that fails storage/materialization
preflight rejects the whole call; semantic failures follow the analyzer below.

Reconstruct selected originals with safe own properties, preserving order,
unknown fields, absent/null/zero and exact logical values. Require original
`reviews` as a complete bounded value; do not silently synthesize it from split
review rows. Inline values and owned `json-v1` summary/extension root values are
supported. Reconstruct one top-level JSON-pointer property per row. Reject
split/nested property representations, diagnostic envelopes and unresolved
stream values as `UNSUPPORTED_REPRESENTATION` or `RESOURCE_LIMIT`, without
discarding retained data. A referenced value must have the selected owner and
correct root binding; pin registered dependencies even if a representation is
ultimately rejected. No summary field is replaced by an indexed convenience value.

| Condition | Required behavior |
| --- | --- |
| Invalid root/schema/options/identity | Named argument/store error before analysis |
| Missing presence rows or unsupported original representation | `UNSUPPORTED_REPRESENTATION`; never infer presence or missing values |
| Genuine absent/empty collections or missing/retired requested identity | Existing selection unknown findings, using snapshot facts |
| Current pending/retiring record, active intent, absent artifact/reservation | `UNAVAILABLE`, no partial report |
| Unsafe path, wrong owner/binding, original/projection mismatch, physical hash/length corruption | Existing specific storage error or `INVALID_REFERENCE`/`INVALID_ARTIFACT` |
| Budget exhaustion | `RESOURCE_LIMIT`, naming logical field and budget, before analyzer entry |
| Lock/busy/hot-journal/runtime failure | Preserve core error/code; no read-side recovery or retry loop |
| Safely loaded record's semantic provenance/schema or request-qualified/response identity inconsistency | Existing score manifest/hash fail finding; invalid source contributes no derived measurements |
| Stored summary differs from exact-byte recomputation | Existing `score.stored-summary` failure and dependent unknowns |
| Complete retained body is malformed UTF-8/JSON, non-array, partial or unsupported | Existing layered score validation/findings; never silently drop it or apply diagnostic JSON preflight |
| Unexpected setup/read/analysis/callback failure, including null | Reject with original thrown value; cleanup must not replace it |

The physical output hash and original outputFingerprint must match the owned
output projection. The separately retained responseFingerprint and the
request-qualified source fingerprint are checked by the existing analyzer,
preserving its fail findings. Do not claim that a storage body-hash check alone
verifies request provenance. No raw bytes are reserialized before hashing or
validation. Native parsing behavior, including numeric overflow inside a raw
body, remains the published score validator's behavior.

Parity covers supported original representations with readable verified storage,
including semantic failures and the explicit absence cases above. V3 transport
rejection intentionally differs from v2 file-read findings. Invalid selected
artifacts cannot produce an empty successful analysis. This is not universal
invalid-input parity.

## Consumer bounds and resource lifetime

Keep ADR limits: 64 KiB chunks/inline rows, 128-row/8 MiB metadata pages,
64 requested source identities, 8 MiB snapshot metadata and 256 pinned handles.
Use bounded existence/key lookups; no OFFSET scans or whole-store materialization.
Additional consumer limits are 4 MiB per raw response, 16 MiB aggregate raw
responses, 1 MiB encoded size per original property value and 8 MiB total expanded
original metadata (including pointer bytes). Apply the metadata caps to unknown
properties too. Reject oversized references before allocation; use bounded
iteration/encoded-size accounting for expanded originals. These are consumer
limits, not changed retention limits. Raw score bodies are opaque bytes, so the
JSON-payload tokenizer's 1 MiB token limit does not apply to raw response text.

Finish transport/materialization preflight for every selected current record
before invoking shared analysis. The validator may materialize bounded raw JSON
and derived structures; no general bound on analyzer expansion is claimed.
Reject unsupported large originals rather than raising caps or omitting fields.

Await reads and analysis inside the callback. Do not expose a reusable view,
descriptor or background operation. On setup, iteration, analysis, callback or
close failure, attempt every owned close and release the lock. Preserve primary
errors with an explicit failure flag, including thrown null; absent a primary
error, report the first cleanup failure after all attempts. Closing the owning
catalog/store handle follows the same precedence. Subsequent reads/writers must
work. Injected close-after-close exceptions do not qualify arbitrary OS failures.

Read success/failure must not change descriptor, marker, database bytes/generation,
original properties, reviews, intents, status, tombstones or artifact bytes.
Transient owned lock files may be acquired/released. Concurrent cleanup tests
compare only the authorized writer's expected delta; the adapter contributes no
writes. Do not recover or delete orphan/owner temporary artifacts.

## Independent oracle and functional qualification

Before candidate source/refactoring changes, export the unmodified published
commit above and verify analyzer/helper hashes against Git. Run the fixture
recipe through that export's synchronous
`analyzeReplay({root, replayId, fingerprints: [], scoreFingerprints, reportMode})`.
Freeze full/compact report objects and SHA-256 of native compact JSON plus LF,
exact raw source bytes/hashes, original records and validation summaries. Record
generator/export hashes and timestamps. Never generate expected reports with
candidate/shared-refactored code, regenerate expectations to accept a failure,
or overwrite historical oracles. This planning task generates none.

Fix dates/IDs/local build inputs and logical references in every oracle case.
There are no legitimately variable report fields to scrub: fixture root/store UUID,
generation, clocks and physical sidecars must not enter reports. Small v2 oracle
fixtures have no unrelated corpus; unrelated v3 records cannot affect the result.

Required cases for both schemas:

1. Metadata-only, frames-only and combined score kinds; both report modes; reversed
   request order; exact source identities/filename variants; no implicit logs.
   Compare complete report objects and frozen hashes, not only totals.
2. Explicit absent versus present-empty collections, selected missing/tombstoned
   identities, mixed missing/current selections, and contradictory presence or
   current/tombstone state. Missing presence metadata rejects. A snapshot race
   cannot combine pre-cleanup selection with post-cleanup files.
3. Request provenance, body/source hashes, original/projection conflicts, tampered
   summaries, legacy numeric gap normalization, absent/null/zero and unknown
   properties. Exercise safe and above-safe-integer ordinals through SQLite's
   maximum integer without lossy conversion.
4. Complete malformed UTF-8/JSON, non-array bodies, unsupported UI, malformed
   frames/items, partial coverage, large numeric gaps, exact/conflicting overlap,
   segment resets, ambiguous bridges/cycles and all source-order permutations.
   Retain mapping ambiguity/reversal, terminal unknown and null embedded build;
   no log alignment, log build attribution or events may be invented.
5. Null/non-null optional map IDs with zero map/log payload access, including an
   absent optional map artifact and unrelated invalid log association. Preserve
   M2c log-snapshot defaults with explicit regression controls.
6. Pending/retiring/current missing output, active intents, symlinks, wrong owner,
   cross-kind paths, corrupt/truncated bytes, inline/overflow properties, unsupported
   split reviews/nested values, each cap at its boundary and just beyond, source
   and handle limits, hot-journal refusal and live-lock exclusion. No session
   entry on transport/budget rejection; verify preservation after each failure.
7. Suspend a selected read after pinning; another process performs exact authorized
   score cleanup via done -> committed retiring -> deletion/tombstone. The reader
   completes from pinned files with the frozen report; a later reader sees the
   retired selection's unknown result. Preserve maps/logs and unrelated reviews.
8. Setup/read/session/callback/close fault schedules, failing and earlier pinned
   descriptors, thrown Error/null, every-close attempts, no-primary-error close
   control, escaped view rejection, lock release and subsequent successful work.
9. Actual v2 API/CLI full/compact and combined-score controls under a module hook
   rejecting SQLite loads, duplicate v2 record occurrences with different file
   outcomes, raw-body native numeric parsing controls, plus M2c log-only and
   empty-selection oracle regressions.

## Exact proposed scale recipe

Use four stores: independent 10- and 1,000-operational-record roots for each
schema. Operational count means `records` rows across collections, independently
asserted after generation; maps/replays/properties/payloads are not counted as
records. Every store selects the same four score records below. MiB = 1,048,576.

Fix replay ID to 24 lowercase `d` characters, date to
`2026-10-05T00:00:00.000Z`, no local build file, no log records/maps/artifacts for
the selected replay, and one internal replay identity with null map/build/status.
Logical v2 manifest property order is version, maps, replays, records,
scoreRecords, retiredScoreSources; values are 2, [], [], [], the four originals,
[]. Store collection rows explicitly mark both optional collections present,
with original ordinals 4 and 5. The retired table is empty.

The following literals/formulas define the bytes; property order is shown.
Encode each body using `Buffer.from(JSON.stringify(value), 'utf8')`, with no LF,
no pretty printing, no BOM and no random padding:

```js
const metadata = {game: {_id: 'game', user: 'user-b',
  users: [{_id: 'user-a', username: 'untrusted-a'},
          {_id: 'user-b', username: 'untrusted-b'}],
  codes: [{_id: 'code-a', user: 'user-a', version: 1},
          {_id: 'code-b', user: 'user-b', version: 1}],
  game: {usersCode: ['code-a', 'code-b'], firstPlayerIndex: 0}}, ok: 1};
const frame = t => ({gameTime: t, objects: [], flags: [], ui: {version: 1,
  items: [{id: 'player1-score', name: 'Score', value: 2 * t},
          {id: 'player1-gain', name: 'Gained this tick', value: 2},
          {id: 'player2-score', name: 'Score', value: t},
          {id: 'player2-gain', name: 'Gained this tick', value: 1}]}});
const bodies = [metadata,
  Array.from({length: 128}, (_, j) => frame(j + 1)),
  Array.from({length: 128}, (_, j) => frame(j + 65)),
  Array.from({length: 128}, (_, j) => frame(j + 193))];
```

Source i=0 is game-metadata with requestedGameTime null and request URL
`https://arena.screeps.com/api/game/REPLAY`. Sources i=1,2,3 are replay-frames with
requestedGameTime 1,65,193 and URL suffix `/replay/REQUESTED`. Substitute the fixed
replay ID/numeric value literally. There are 384 frame occurrences, a 64-frame
exact overlap and 320 distinct gameTime values. Adjacency alone does not merge
the third frame source with the overlapping pair. Oracle checks must retain
this continuity boundary and unknown terminal/build/alignment conclusions.

For each source in i order, define `sourceKey = '1/0/' + requestUrl`, response hash
as SHA-256(body), source identity with the published `scoreSourceFingerprint`,
and cache-entry hash as SHA-256 of UTF-8 `m2d-cache-I` followed by one zero byte
and exact body bytes (I is decimal i). This is explicitly synthetic cache
provenance. Filename is `replay-score-source-REPLAY-FULL_FINGERPRINT.response`.
Compute coverage/validation with the pinned export's `validateScoreBody` and
freeze them before candidate changes. The original record, in property order, is:

```text
formatVersion:1, kind, replayId, requestedGameTime,
sourceEntry:"synthetic-m2d-I", sourceKey, requestUrl,
cacheEntryFingerprint, responseFingerprint, fingerprint, outputPath,
outputFingerprint:responseFingerprint, embeddedBuildId:null, mapId:null,
coverage, validation, importedAt:DATE, status:"claim", reviews:{},
fixtureNote:"n" repeated 65,536 times
```

Use public writer APIs, not direct SQL, to create these records with original
record ordinals 0–3, pending reservations/intents, raw outputs, and valid
publication finalization. Restore original property ordinals from the object
order above. Store `/validation` as an owned root `summaries/json-v1` payload for
each source even if small; store `/fixtureNote` as an owned root
`extensions/json-v1` payload. Both use native JSON UTF-8 with no LF, parent null,
and no invented item count. Property rows bind to those exact pointers. Other
properties, including coverage/reviews, are inline. All eight sidecars are
physically separate owner-scoped files. No diagnostics or nested envelope exists.
Assert each validation value is within 1 MiB and every inline row within 64 KiB;
recipe failure is a planning/qualification blocker, not permission to alter it.

Thus exactly twelve selected artifacts exist per store: four raw responses,
four validation roots and four original-value overflow roots. Freeze every
artifact size/hash and the four derived evidence identities in the oracle
receipt; hashes are derived by the specified pinned procedure, not guessed in
this plan. Equivalent schema layouts must produce identical reports.

For operational ordinals i=4..N-1, create pending score rows under a second
internal replay identity of 24 lowercase `e` characters. Their fingerprints
are SHA-256 of UTF-8 `m2d-unselected-I`, with null map/build/output projections;
they have no source body and are not analysis selections. These legitimate
pending storage fixtures do not pretend to be ready score evidence.

For each pending owner i=4..9, reserve its two extension roots using a publication
intent `m2d-unrelated-I`, file ordinals 0 and 1, and exact expected paths/hashes/
lengths. For j=0..11, root `/large-J` belongs to i=4+floor(j/2), role extensions,
encoding json-v1, parent null. Publish against that reservation and attach its
property reference without claiming/finalizing the score record. Keep these six
intents and their verified payload checkpoints pending: scores without outputs
must not be finalized. The log-only evidenceOnly exception is not used.
Stream exact JSON string bytes: quote, byte (65+j) repeated
50*MiB-2 times, quote. Each file is exactly 50 MiB and has distinct content/hash,
path and inode. No hard links or sparse placeholders; assert nlink=1, length,
distinct hashes/inodes and allocated storage consistent with ordinary streamed
files. Use bounded chunks and public reservation/publication APIs, leaving the
records pending. This gives exactly twelve unrelated files and 600 MiB at
both record counts. Never materialize their strings or the full corpus.

## Proposed resource gates and exact phase boundaries

Each schema runs separately, with fresh workers and `--max-old-space-size=192`.
Every worker must stay at or below 256 MiB peak RSS, including startup and setup;
do not subtract baseline memory. Deadlines measure parent monotonic time from
spawn through child exit:

| Phase | Deadline and included work |
| --- | --- |
| Generation | 60 seconds for both 10/1,000 stores: create roots, schema/metadata, selected sources, all 1,200 MiB of unrelated bytes, hashing/publication/fsync, count/physical-layout assertions and pre-run inventory receipt |
| Paired operations | 30 seconds for four calls in one worker: full then compact on 10 records, full then compact on 1,000; fresh read handle per call, metadata/pinning/loading/analysis/cleanup, frozen report comparison/hash and access assertions; imports/startup included |
| Preservation | Separate 60 seconds for streaming post-run inventories of both stores and comparison with generation receipts; includes every persistent fixture file but is outside operation counters |

Workers emit bounded metrics/hash receipts, not full reports or payloads to the
parent. Cap combined stdout/stderr at 1 MiB per worker; overflow fails. At a
deadline/output violation mark failure, send TERM, allow at most 2 seconds, then
KILL and allow at most 3 further seconds to reap. A late successful exit never
passes. Report shutdown failures and retain evidence rather than waiting forever.
No automatic reruns to obtain a pass.

For every operation, reset and capture counters around the complete public call,
including open/close. Assert twelve selected artifact opens, one per path, zero
unselected/map/log payload opens or bytes, and zero persistent writes. Selected
payload reads are at most eight times the sum of the frozen twelve artifact
lengths, with no individual read larger than 65,536 bytes. Require equal SQL,
returned-row, open and byte counts across corpus sizes for each schema/mode;
report connection PRAGMAs separately. Schema-1 and schema-2 SQL totals may differ,
but full/compact report hashes must equal the same frozen oracle at both sizes.
This does not claim equal SQLite internal page I/O.

Account separately for bounded descriptor/marker/database/lock access and the
optional local-build input. The scale recipe has no local-build file. Count
all adapter-owned artifact descriptors and ensure balanced closes; instrument
path opens to detect reopening as well as store metrics. Source count, sidecar
layout and SQL plans must be asserted, not inferred from fast timing. Independent
SQL fixture verification stays in generation/preservation, outside the adapter.

The gate establishes fixed-workload corpus independence only. It does not bound
all derived analyzer structures, qualify larger score workloads or measure
production performance. A failed resource gate leaves the candidate unqualified;
do not raise limits or change source counts/recipes to obtain a pass.

## Future validation and completion

Run focused adapter/oracle tests and existing analyzer/score tests, affected
store/payload/catalog/M2a/M2c regressions, all prescribed M1/C1/M2a/M2b/M2c gates
and the new both-schema gate, then one complete normal-concurrency `npm test`
and `npm run check` on final candidate bytes. Check documentation links, anchors,
examples, tracked/new-file whitespace and exact scope. Record source/test/package
hashes before/after, complete logs, commands, runtime/SQLite versions, time, RSS,
access counts, oracle/export provenance and preservation receipts in a separate
qualification record.

Keep all failures, including the unresolved intermittent SQLite busy delay.
Justified diagnostics or a fresh complete run must be reported separately;
passing subsets cannot form a fictitious full-suite pass. Do not relax assertions,
normal concurrency, deadlines, busy timeout or memory limits. The reviewed M2c
report hashes and behavior remain required regression controls.

M2d completion requires independently reviewed implementation, exact-byte oracle
parity on the admitted domain, all preservation/error/concurrency/resource gates
and the complete prescribed suite. It does not complete M2, qualify production
roots, general analyzer-memory bounds, power-loss durability, arbitrary OS close
failure or other platforms, or resolve the SQLite timing issue.

Excluded: combined log/score input and alignment, lifecycle commands, claims or
review completion, cache/historical-index/scout-screen integration, general
bounded-v2 expansion, production dispatch, C2 catalog bodies, M3 administrative
migration/export/rehearsal/rollback and M4 production cutover. Automatic completed
log reconciliation and explicitly authorized score retirement retain their
existing callers and contracts. No source, test, oracle, runtime or qualification
execution is authorized by this planning document itself.
