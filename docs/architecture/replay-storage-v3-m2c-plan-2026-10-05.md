# Storage v3 M2c: fixture-only asynchronous replay analyzer input

Date: 2026-10-05. Status: planning contract awaiting separate implementation
authorization and review. Inspected HEAD:
`846d2a458d5776f974853aaad530ef4b71d25f6d`.
M2c is the next unused identifier in the M2a/M2b sequence. All resource gates
below are proposed, unmeasured acceptance requirements.

Authority: [ADR 0006](../decisions/0006-replay-storage-v3.md), the
[analyzer contract](replay-analysis.md), and the deployed v2 workflows in the
[analysis](../diagrams/replay-analysis.puml),
[log cleanup](../diagrams/replay-review-cleanup.puml), and
[score retention](../diagrams/replay-score-retention.puml) diagrams.
This plan does not amend those contracts or reinterpret historical results.

## Decision, dependencies and boundary

Implement one fixture-only asynchronous v3 input adapter for the existing
log-only replay analyzer. Require one replay and explicit log fingerprints.
This is the deferred analyzer-reader candidate identified by the
[M2b plan](replay-storage-v3-m2b-plan-2026-10-04.md#choice-and-prerequisites).
It exercises selected maps, JSONLs, diagnostics and original metadata together
before taking on lifecycle-bearing list/review/import orchestration.

Runtime prerequisites are the qualified [M1 storage core](replay-storage-v3-m1-2026-10-03.md),
[C1 schema-2 evidence handle](replay-catalog-c1-2026-10-04.md), and
[M2a payload iteration](replay-storage-v3-m2a-2026-10-04.md).
F1 publication lifetime, F2 publication completeness and F3 explicit recovery
remain required. [M2b qualification](replay-storage-v3-m2b-2026-10-04.md)
is a completed compatibility checkpoint, not a runtime dependency: the v3
adapter must not import its legacy scanner or reconstruct a v2 manifest file.
Historical pending/unstaged wording in earlier qualification records describes
those checkpoints, not the inspected committed state.

M2c excludes score-source analysis; implicit select-all; review ownership or
completion; import/list/reconciliation/cleanup policy; caches; historical-index
and scout-screen wiring; general bounded v2 access; C2 bodies; migration,
export, rehearsal and production roots. Automatic completed-log reconciliation
and explicit score retirement remain in their existing callers. No catalog
finding, conclusion or review is written. Existing commands remain disconnected
from this fixture entrypoint.

## Public interface and implementation paths

New `tools/replay-analysis-fixture.js` exports exactly:

```text
analyzeFixtureReplay({root, schemaVersion, replayId, fingerprints,
                     reportMode = 'full'}) -> Promise<existing log report>
```

- Require a plain options object with only these keys. Reject every supplied
  `scoreFingerprints` property, including undefined/empty values, and unknown
  options with `UNSUPPORTED_OPTION`; never silently drop score requests.
- Require a canonical absolute root equal to its resolved real path, a direct
  child of the real OS temporary directory with the existing
  `pain-gain-store-v3-fixture-` prefix and valid bound fixture marker. Preserve
  the core's schema/runtime/filesystem checks; no default root, path alias,
  arbitrary file option, format autodetection or recovery fallback.
- Accept only numeric schemaVersion 1 or 2, a lowercase 24-hex replay ID, and
  1–64 distinct lowercase 64-hex log fingerprints. Reject duplicates, invalid
  identities, empty/omitted selection and unsupported mode before evidence reads.
  Explicitly reject more than 64 supplied fingerprints with `RESOURCE_LIMIT`.
- `reportMode` accepts only `full` or `compact`; default full matches the
  existing library. Resolve to a detached ordinary report only after snapshot
  and store cleanup succeed. There is no output sink, stdout, CLI or live view
  in the public result.
- Dynamically open schema 1 with `openStore({root, mode:'read'})` or schema 2
  with `openCatalog({root, mode:'read'}).evidence`. Close the owning handle.
  No `recover:true`: hot-journal recovery remains an explicit writer operation.

Expected future changes:

| Path | M2c responsibility |
| --- | --- |
| New `tools/replay-analysis-fixture.js` | Options/root gates, async pinned loading, logical metadata assembly and call into the shared analyzer boundary |
| [replay-analysis.js](../../tools/replay-analysis.js) | Extract the shared synchronous analysis session described below; preserve v2 loading, API, score path and CLI |
| [replay-store.js](../../tools/replay-store.js) | Narrow additive pinned-artifact accessors and locked ownership checks described below, with regression tests; no schema or lifecycle policy change |
| New `tests/unit/replay-analysis-fixture.test.js` | Parity, failures, concurrency, preservation and both-schema scale qualification |
| [replay-analysis.test.js](../../tests/unit/replay-analysis.test.js), [replay-store.test.js](../../tests/unit/replay-store.test.js) | Existing behavior and accessor/snapshot regressions; share only genuinely reusable synthetic fixture builders |
| `package.json` and directly relevant documentation | Syntax-check registration and implementation/qualification record; no new dependency |

The payload module, catalog adapter, existing consumer callers and runtime code
should remain unchanged. A demonstrated missing core capability outside the
accessors below is a blocker to report, not permission to enlarge M2c.

## Shared loading-to-analysis boundary

Extract `createReplayAnalysisSession({replayId, fingerprints, reportMode,
localBuildId, logicalManifest, mapEvidence})` in `replay-analysis.js` as a tooling library
interface. It returns synchronous `acceptRecord(record, outputEvidence)` and
`finish()` methods. The session owns existing validation, finding
accumulation, merging, CPU/membership/action checks and final report creation;
there must be only one implementation of those rules.

`logicalManifest` supplies selected original replay association/map registration
values and schema-readability context. Records retain their original logical
fields. `outputEvidence`/`mapEvidence` are detached exact byte buffers or the
existing v2 loader's explicit read-error result, keyed by logical filename.
The session validates the selected map before accepting records, as the current
analyzer does. The logical selection metadata includes the complete ordered
list needed for replay-wide build checks before per-record validation.
No filesystem access, SQL, handle, Promise, root or lifecycle callback belongs
inside the session. Preserve the current order of validation/findings and
final sorting. Accept records in original record ordinal order, irrespective
of request order. `finish` is single-use and does not silently accept an
incomplete session. The precise internal method split may be adjusted only if
the same boundary and parity gates hold; these names are the planned interface.

The synchronous v2 `analyzeReplay()` keeps its existing validation, whole-v2
loader and public behavior. It feeds the session synchronously. Preserve its
optional score branch and the snapshots/merged diagnostics needed by that
branch; a shared internal finalization helper may return those to the v2
wrapper without exposing them in the public report. The v3 adapter awaits all
loading before calling synchronous analysis methods. Do not make existing
callers asynchronous or import SQLite into their dependency graph.

Transport preflight must complete for the entire selected input before entering
the analysis session. Selected inputs/timelines can remain materialized within
the budgets below; no accumulated corpus object is created. Reuse current
validators and report writer, including native serialization behavior on the
unchanged v2 path. A logical version-2 schema finding/message is compatibility
output about the reconstructed logical shape, not a physical-store version
claim; do not add physical schema/UUID/generation fields to the report.

`localBuildId` follows the existing fixture-root `src/debug/build-id.js`
interpretation; absence gives null. For v3, if present, require a regular safe
file within the fixture and at most 16 KiB, read once before the snapshot and
hold that value for the call. It is a local provenance input, not runtime
evidence or a fallback to the repository's build. No external in-place mutation
guarantee is made. Parity fixtures give v2 and v3 the same local-build input.

## Coherent selection, properties and artifact access

Preliminary `getRecord`/`getReplay`/`getMap`/paging results are advisory only.
Call `withReadSnapshot` once with all requested record keys and all payload
roles. Never remove a missing identity and analyze the remainder. Inside the
locked metadata transaction, require every selected record to exist and be
`claim` or `done`, with no active publication/cleanup intent. Pin all selected
roots/dependencies before releasing the owner lock. Recheck projected and
original identities/status/output fields and replay/map links using this view.
Changes before lock acquisition must be observed or reject; no automatic retry
or mixed-generation assembly is permitted.

Add callback-scoped `view.output(recordKey)` and `view.mapArtifact(mapId)`:
return the already-pinned `{path, hash, bytes}` descriptor (or null for an
explicitly output-free log). They perform no lookup or reopen after setup.
Keep these descriptors in private view maps, not in existing metadata rows.
Under the existing setup lock/transaction, verify output owner tuple, ready
state and path/hash projections; the record must be the unique output owner.
Resolve its output by the indexed owner as well as the projected path, so null
projections cannot hide a pending reservation. Null is permitted only when
both original/projection output fields are null and no owned output exists.
Map refs belong to the selected registered map; preserve legitimate map sharing
across records. Count ref metadata/handles toward existing budgets. Use
`payloadChunks`/`view.read` positionally; never call `readFileSync(path)` to
rediscover artifact length or content. Test use after callback as `CLOSED`.

Read ordered `view.properties` for the selected record/replay/map owners.
Rebuild the original logical top-level fields in ordinal order using safe own
properties (including `__proto__`); preserve absent/null/false/zero and unknown
fields. Do not replace originals with SQL defaults or projections. Check every
represented indexed projection against its original value. Required logical
fields include source metadata, output metadata, build, map linkage, coverage,
diagnosticCoverage, otherEntries and the original reviews container shape.
An absent required field is never filled with an invented empty object.

For this bounded slice, support inline or owned root-payload original values;
support `/otherEntries` only through its exact diagnostics root binding and
registered overflow tree. Decode other required payload values through pinned
`iterateJson` and finish full hash/UTF-8/JSON validation before using a value.
Reconstructed metadata including expanded summaries/properties must fit 8 MiB;
each materialized payload JSON value/wrapper and JSONL line is at most 1 MiB.
Stream references above that limit reject `RESOURCE_LIMIT`; evidence remains
retained. Nonfinite decoded outer property/wrapper numbers and non-JSON values
reject `INVALID_JSON`, consistent with v3. Raw diagnostic strings retain native
analyzer parsing and semantic validation, including unsupported generations.

The current snapshot does not enumerate all operational reviewers or all
map/replay overflow-property roots. Consequently M2c requires an original
bounded `/reviews` container value on each synthetic record and inline original
map/replay fields; separate reviewer rows are neither loaded nor manufactured.
An out-of-line map/replay property or a split-only reviews representation is
`UNSUPPORTED_REPRESENTATION`. Explicitly test these rejections. General review
reconstruction is deferred. This fixture input profile does not constrain
retention or silently discard unknown properties.

For selected records, expand all original property payloads, including unknown
extensions within the above bounds. Verify diagnostic item count, exact
occurrence order, owner/role/parent, hash, length and wrapper references.
Require map/replay association and record map projections to agree before
analysis. A physical map/output hash or ownership failure is an adapter error.
With valid transport, raw map schema/canonical-checksum problems, JSONL schema,
raw build conflicts and coverage inconsistencies remain analyzer findings.

Additional proposed per-call materialization caps are 1 MiB per selected map,
16 MiB aggregate JSONL bytes and 16 MiB aggregate decoded diagnostic-wrapper
JSON bytes (measure encoded size incrementally before accumulating). These are
consumer limits, not new storage retention limits. Reject before analysis and
do not raise them to pass the gate. Loading bounds do not bound the analyzer's
derived structures for arbitrary inputs.

Logical evidence locators remain `replay_logs/manifest.json` plus existing
fingerprint/key/recordId/tick fields, `replay_logs/<original-output-name>` plus
fingerprint/line, and `replay_logs/<original-map-name>` plus map ID. Keep original
occurrence ordinals internally for duplicate keys and payload resolution; do
not change existing public finding fields. Sidecar paths, store IDs and
generations are private transport details. Sidecar hashes never substitute for
response fingerprints, JSONL hashes or canonical map checksums.

## Error, lifetime and preservation contract

| Condition | Required result |
| --- | --- |
| Invalid options/identity/mode/root/schema | Reject before analysis; named argument/root/store error; never infer selection |
| Missing/retired selected identity, pending output, active intent, absent artifact | Reject `UNAVAILABLE`; advisory tombstone information may enrich context but cannot authorize partial analysis |
| Unsafe path, wrong owner/binding, projection disagreement, byte hash/length corruption | Reject existing specific storage error or `INVALID_REFERENCE`/`INVALID_ARTIFACT`; no partial report |
| Bound exceeded or unsupported representation | Reject `RESOURCE_LIMIT` or `UNSUPPORTED_REPRESENTATION`; identify logical field and limit |
| Lock/busy/runtime/hot-journal failure | Preserve core error/code, including `RECOVERY_REQUIRED`; no read-side recovery or retry loop |
| Transport-valid semantic evidence problem | Preserve current analyzer fail/unknown finding and dependent-evidence rules |
| Unexpected read/session failure or thrown non-Error value | Reject with the original thrown value, including null |

Parity with v2 applies to admitted, transport-valid inputs, including semantic
failures. V3's stricter transport rejections intentionally differ from v2's
file-read findings and missing-selection unknown reports. Tests must assert
that distinction; never convert a rejected request to an empty successful
analysis or claim universal invalid-input parity.

Await preflight and analysis inside the snapshot callback. No iterators,
descriptors, views or detached background reads may escape. After releasing the
setup lock, another writer may perform separately authorized synthetic cleanup;
all selected content must remain readable through pinned descriptors. Slow
async consumption must not retain that writer lock. Propagate setup/session
errors as primary using an explicit failure flag, not error truthiness. Attempt
every owned close; preserve thrown null; without a primary error reject with
the first cleanup failure after all attempts. Subsequent snapshots/writers
must work; arbitrary OS close-failure behavior remains unqualified.

On isolated success/failure tests, compare pre/post descriptor, marker,
database bytes/generation, original properties, reviewers, intents, lifecycle
state and every fixture artifact hash/size. Owned transient lock files may be
created/released, but no persistent metadata/evidence mutation is allowed.
For concurrent-cleanup tests, compare with the writer's explicitly expected
delta and prove the reader contributes no writes. Retain orphan/temp evidence
and existing lock-owner artifacts; a reader is not a cleanup operation.

## Synthetic functional acceptance

1. Compare complete full/compact report objects and serialized bytes with the
   committed v2 analyzer oracle, using equivalent synthetic logical inputs for
   both schemas. Cover file-backed/evidence-only logs, explicit subset and
   request permutations, tagged/nonlocal/legacy builds, Unicode, null/absent
   properties and deterministic references. Test actual unchanged v2 CLI and
   score API controls; import hooks must reject `node:sqlite` while they pass.
2. Port representative [analyzer fixtures](../../tests/unit/replay-analysis.test.js):
   legacy/M2/M3/CPU closures, exact/conflicting overlaps, incompatible builds,
   gaps, malformed raw records, unsupported generations and incorrect stored
   summaries. Assert existing rule/verdict/provenance/output parity, not totals
   alone. Score options always reject on the new entrypoint.
3. Exercise missing/retired selections and readiness races between advisory
   lookup and snapshot; wrong output owners, replay/map linkage, unsafe paths,
   missing files, hash/length mismatch and invalid map/JSONL semantic controls.
   No member of a failed selection may produce a report.
4. Exercise inline and root-payload properties, ordinary/overflow diagnostics,
   exact limit and limit+1 values, unregistered/wrong-owner dependencies,
   malformed UTF-8/JSON, unknown properties and explicit unsupported shapes.
   Source/metadata/handle budgets must reject before entering the session.
5. Coordinate real child-process barriers for cleanup after pinning; retain
   readable map/output/root/overflow handles, no path reopen or mixed metadata.
   Test setup failure after earlier pins, interrupted reads, session errors,
   callback lifetime, close failures at multiple positions, and thrown null.
   Verify all close attempts, lock release and a subsequent successful read.
6. Instrument every success/error path for persistent fixture preservation and
   zero reader writes beyond owner-lock housekeeping. All fixtures are newly
   created temporary roots on the supported native Node/macOS/APFS runtime.
   No platform shim, retained replay or production manifest is permitted.

## Reproducible resource fixture and unmeasured gates

Run schema 1 and schema 2 separately. For each schema generate two independent
stores, with exactly 10 and 1,000 rows in the operational `records` table.
Catalog capture rows do not count. The same four selected log records occupy
ordinals 0–3. Other identities occupy ordinals 4–9 or 4–999. Assert row counts
independently of fixture-builder loops before each measured operation.

The version-1 fixture recipe is fixed as follows (all JSON uses native compact
serialization and the key order shown; canonical map encoding uses the existing
canonical helper). No current dates, random evidence IDs or imported evidence:

- Replay ID: 24 lowercase `b` characters. Build ID: 64 lowercase `a` characters.
  No local-build file, so localBuildId is null. Record fingerprint for ordinal
  `i` is `i.toString(16).padStart(64, '0')`; these are explicit synthetic response
  identities, not claims about a captured network response.
- Map payload: `{arena:{name:'Pain and Gain',season:'4',level:1,ticksLimit:2000},
  terrain:{width:100,height:100,rows:100 arrays each of 100 zeros},objects:[]}`.
  Compute the canonical map checksum by the existing rule. Save canonical JSON
  of the payload plus top-level checksum and one LF. Original map filename is
  `pain_and_gain_map_2026-10-05T00-00-00-000Z.json`; registration status validated,
  replay status active, associated build the fixed build above.
- Selected records 0, 1, 2 each contain exactly one JSONL line:
  `{type:'game-state',buildId:BUILD,tick:i+1,phase:'before-actions',
  selectedFlagId:null,creeps:[],flags:[]}` followed by LF. Output filenames are
  `REPLAY-FINGERPRINT.jsonl` using the full synthetic fingerprint. Record 3 is
  evidence-only with both output fields explicitly null. This fixes three
  same-size outputs, three total snapshots and no gameplay actors.
- Each selected record has exactly 1,024 wrappers, for j=0..1023:
  `{key:String(j),raw:'x'.repeat(128),type:'other'}`. Total 4,096 wrappers. Encode
  envelope `{ordinal:j,wrapper:WRAPPER}` plus LF, except j=512 is
  `{ordinal:j,wrapperRef:'/otherEntries/overflow'}` plus LF. Each record owns
  its own one-value extension file for that wrapper with no LF and parent
  `/otherEntries`. There are four root files and four overflow files; no
  content deduplication, shared ownership or alternative overflow layout.
- All four logical records use requestedTick `i+1`, sourceEntry
  `synthetic-cache-i`, sourceKey
  `1/0/https://arena.screeps.com/api/game/REPLAY/log/i+1` with numeric substitution,
  fixed importedAt `2026-10-05T00:00:00.000Z`, status claim and reviews `{}`.
  Here `synthetic-cache-i` means the literal prefix plus decimal i; the source
  URL ends in decimal i+1, with no expression characters in the saved string.
  Recompute exact ordinary game coverage and diagnosticCoverage with the
  committed v2 helpers from these inputs; diagnostics are untyped, so closure
  absence remains unknown. Store summaries as inline original properties.
  Include registeredAt on the map and associatedAt on the replay with that
  timestamp; replay retiredFingerprints is exactly an empty array. No other
  original optional fields are included in the fixed scale recipe. Storage
  projection-only aliases are not copied into the logical legacy records.
- Each of the six unrelated records 4–9 owns two independent 50 MiB extension
  files: exactly 12 files totaling 629,145,600 bytes. Each file is a JSON string
  with opening/closing quotes and a repeated ASCII character `A` through `L`
  for its distinct ordinal. Stream 64 KiB chunks. Assert distinct paths,
  inodes and hashes, actual on-disk lengths and no shared hard links. Additional
  records 10–999 have small metadata and no extra large payload. No selected
  record owns any of these files. Both stores individually contain 600 MiB.
  These are opaque synthetic storage extensions, not imported cache responses;
  this fixture does not exercise or raise the unchanged decompression cap.

Before implementing the v3 adapter, the future test task must generate the
small equivalent v2 fixture and run the analyzer from pinned commit
`846d2a458d5776f974853aaad530ef4b71d25f6d` to freeze a checked-in recipe receipt:
all selected artifact byte sizes/hashes and two expected report SHA-256 values,
`Hfull` and `Hcompact`. Define each report hash as SHA-256 of native
`JSON.stringify(report)` UTF-8 bytes plus one LF. Verify that oracle against
independent known-answer assertions (four selected/trusted records in compact
mode, three snapshot ticks, zero complete diagnostic ticks, logical references
only). Freeze those literal hashes before exercising the adapter, then assert
them across both schemas and both corpus sizes. Do not obtain expected hashes
from the implementation under test. This plan fixes their deterministic recipe;
no unrun numerical hashes or measured sizes are asserted here. Changing the
recipe or golden outputs requires an explained review, not auto-update-on-fail.

Generation worker: 192 MiB V8 heap, 256 MiB peak RSS, 60 seconds per schema's
pair of stores including streamed publication and oracle-receipt checks.
Operation worker: fresh process with the same heap/RSS bounds and 30 seconds
for all four calls (full/compact at 10/1,000 records) per schema, including
opening, closing and incremental report hashing. No warmup or automatic retry.
Preservation inventory/hashing may be a separate worker with a 60-second
deadline, the same memory limits and 64 KiB reads; never hide it as adapter I/O.
Watchdogs use monotonic time, SIGTERM at expiry, SIGKILL after 2 seconds and
reap within another 3 seconds; timeout is failure even if shutdown succeeds.
Bound retained child stdout/stderr to 1 MiB each; overflow is an explicit gate
failure. Report exit status/signal and safe shutdown outcomes.

Instrument only public adapter calls for selected-access metrics. Count all
prepared/exec SQL calls (report connection PRAGMAs separately), returned rows,
artifact opens/read calls/bytes, max read chunk, writes and descriptor balance.
For each report mode compare 10 versus 1,000: equal selected SQL/row/open counts,
equal selected bytes and equal expected report hash. Require exactly twelve
distinct selected artifacts (one map, three outputs, four roots, four overflow
files), one open per
artifact per call, zero unselected payload opens/bytes and zero persistent
writes. Metadata database/descriptor/lock access is separately counted, not
misreported as payload traffic. SQLite internal page I/O need not be constant.
Bound total payload bytes per call by eight times the sum of selected artifact
lengths; repeated whole-corpus reads or payload scans are forbidden.

Use existing limits: 64 KiB file chunks, 64 KiB inline rows, 128-row/8 MiB pages,
64 selected records, 8 MiB snapshot metadata and 256 handles including overflow.
Also enforce the adapter materialization caps above. Record both child peak RSS
and elapsed time; no subtraction of setup memory or weakened thresholds. This
gate qualifies corpus independence for its fixed selected workload, not
generally bounded analyzer memory or production timing.

## Future qualification and completion

Run focused new adapter and existing analyzer/score tests, affected snapshot/
payload/store/catalog regressions, then normal-concurrency `npm test` and
`npm run check`. Rerun M1/C1/M2a resource gates because shared snapshot/analyzer
paths change; retain M2b compatibility checks and prescribed gates. Validate
documentation links/anchors/examples and tracked/new-file whitespace. Preserve
HEAD/index, unrelated work, trial worktrees and runtime/build bytes throughout.

Retain every qualification failure and exact command/runtime/exit result. The
intermittent SQLite busy-delay cause remains unresolved: diagnostics or a
justified fresh complete run may be recorded, but separate passing subsets
cannot form a fictitious passing suite. Never relax assertions, busy timeout,
watchdogs or memory limits to obtain qualification. A failed required gate
leaves qualification incomplete until a genuine complete prescribed run passes.

Complete M2c only after reviewed code satisfies the above parity, rejection,
resource, concurrency, preservation and full-suite gates on exact candidate
bytes. A later qualification record must identify scope and measured results.
No tests or implementation are performed by this plan. Full M2 integration,
production readiness, arbitrary power-loss/close-failure semantics, external
in-place artifact mutation and additional platforms remain unqualified.
