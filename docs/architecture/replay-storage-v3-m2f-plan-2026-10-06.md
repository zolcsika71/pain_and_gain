# Storage v3 M2f: fixture-only review checkpoints

Date: 2026-10-06. Status: proposed implementation contract, awaiting independent
review and separate implementation authorization. Inspected published BASE:
`b9144735ba28d67ba43fa35ee5cbfb56ac8e4f34`.

This plan reserves **M2f**, the next unused identifier after M2e. The committed
roadmap requires review integration but does not name or order this successor.
Choosing claim/examined before completion, cleanup and caches is this plan's
bounded recommendation. All new budgets and results below are **unmeasured**.
No implementation, oracle generation, probe or qualification accompanies it.

Authority: [ADR 0006](../decisions/0006-replay-storage-v3.md#review-and-lifecycle-contracts),
[ADR 0002](../decisions/0002-map-linked-replay-logs.md),
[ADR 0005](../decisions/0005-replay-frame-scoring-evidence.md#publication-and-review-lifecycle),
and the [score evidence contract](replay-evidence-contract.md#replay-score-source-retention).
The [log-review diagram](../diagrams/replay-review-cleanup.puml) and
[score-retention diagram](../diagrams/replay-score-retention.puml) retain their
existing meanings; this slice implements only their first two task checkpoints.

## Scope and prerequisites

Provide one asynchronous fixture entrypoint for one exact operational log or
score record and one task. A task claim is not the record's public `claim` state,
an artifact-integrity receipt, a finding, or a catalog review. Examination is an
explicit caller assertion after actual examination, not inferred from analyzer
success, elapsed time, process exit or this adapter's own reads.

Prerequisites are [M1](replay-storage-v3-m1-2026-10-03.md) owner locking,
transactions, recovery and original-property storage, plus
[C1](replay-catalog-c1-2026-10-04.md) schema-2 evidence access. The
[M2e plan](replay-storage-v3-m2e-plan-2026-10-06.md) and
[qualification](replay-storage-v3-m2e-2026-10-06.md) establish existing analyzer
and snapshot behavior to preserve. M2a–M2e are regression/compatibility
checkpoints, not runtime dependencies of review mutation. Historical M2e
723-test qualification does not qualify M2f. Catalog review events remain
separate and are neither generated nor changed by this adapter.

Excluded: complete/done, retirement, reconciliation, waiting-status migration,
imports, map administration, caches, historical-index/scout integration,
production dispatch/roots, broader bounded-v2 integration, C2, M3 and M4. Do not
call the existing lifecycle commands to implement the v3 operation. Automatic
completed-log reconciliation versus explicitly requested score retirement stays
unchanged. No evidence validation, analysis, file publication or deletion occurs.

## Public interface and implementation boundary

New `tools/replay-review-fixture.js` exports:

```text
updateFixtureReviewCheckpoint({root, schemaVersion, collection,
  replayId, fingerprint, taskId, action}) -> Promise<checkpointResult>
```

- Accept only a plain options object with exactly these required keys, no symbol
  keys or accessor properties. Copy validated primitive inputs before awaiting.
  Reject unknown options with `UNSUPPORTED_OPTION`, malformed options with
  `INVALID_ARGUMENT`, and unsupported schema with `UNSUPPORTED_STORE`.
- `schemaVersion` is numeric 1 or 2; `collection` is `log` or `score`; replay ID
  is lowercase 24-hex and fingerprint lowercase 64-hex. Task ID uses the existing
  `^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$` rule, with no trimming, case folding or
  Unicode normalization. `constructor` is a valid independent task. Invalid
  identity/task inputs yield `INVALID_IDENTITY`; unsupported action, including
  completion aliases, yields `UNSUPPORTED_OPTION` before opening the store.
- `action` is exactly `claim` or `examined`. No batch, wildcard, inferred task,
  timestamp override, recovery flag or default root is public.
- Require the existing canonical direct temporary root, bound fixture marker,
  `pain-gain-store-v3-fixture-` prefix, declared local APFS and supported native
  Node/SQLite. Reuse core root/descriptor validation; no platform shim or path
  alias. Lazy-import `openStore({root,mode:'write'})` for schema 1 or
  `openCatalog({root,mode:'write'}).evidence` for schema 2, closing the owner handle.
  Never route through the catalog's review/workflow API.
- Preserve current v2 `updateReview`, `updateScoreReview`, their CLI commands and
  SQLite-free import path. Shared pure checkpoint policy may be factored within
  [replay-logs.js](../../tools/replay-logs.js); store code supplies bounded data
  access/mutation, not completion policy. No production command imports the new
  fixture adapter or auto-detects v3.

The detached result contains exactly `collection`, `replayId`, `fingerprint`,
`taskId`, `action`, `changed`, `recordStatus` (always `claim`), `reviewOrdinal`,
`generation` and `checkpoints`. Ordinal/generation are exact unsigned decimal
strings, never lossy Number conversions. `checkpoints` contains the three names
`claimedAt`, `examinedAt`, `completedAt`, each represented as `{present:false}`
or `{present:true,value:null|string}`. No whole record, other reviewers, physical
paths, live view or arbitrary original extensions are returned. Native JSON
serialization must fit 4 KiB UTF-8; preflight the result before a mutation.

Expected future implementation paths:

| Path | Responsibility |
| --- | --- |
| New `tools/replay-review-fixture.js` | Fixture/input gates, checkpoint orchestration, bounded result and owner cleanup |
| [replay-store.js](../../tools/replay-store.js) | Narrow writer-scoped checkpoint facts, exact ordinal tails and necessary cleanup/error preservation |
| [replay-logs.js](../../tools/replay-logs.js) | Only a necessary pure policy seam, if shared; existing v2 behavior unchanged |
| New `tests/unit/replay-review-fixture.test.js`, `tests/fixtures/replay-review-m2f-*` | Independent oracle, fixtures, concurrency/fault workers and receipts |
| Existing store/catalog/log/score tests, `package.json`, relevant documentation | Regression checks, syntax registration and separate measured qualification record |

No schema/index, dependency, payload-format or general storage refactor is
planned. Report a required expansion rather than silently implementing it.

## Locked facts and atomic changes

Add a synchronous, writer-lifetime-bound
`writer.readReviewCheckpoint({recordKey,taskId})` capability. It uses the writer's
already checked connection, not public `getRecord()`/`getReview()` connections,
and never exposes SQL, a connection or mutation callbacks. Return bounded copied
facts: current/missing/retired record state; selected identity/status projections
and corresponding original fields where present; relevant indexed association,
output and active-intent facts; review existence/owner/ordinal; the three exact
checkpoint property rows; required ordinal tails; current generation.

Use point queries and indexed reverse `ORDER BY ordinal DESC,... LIMIT 1` tail
queries, scoped to the selected record/review. Existing indexes `review_page`,
`property_page`, `operation_record` and ownership indexes suffice. Fetch only
headers/checkpoint columns, never the complete `reviews.value` or an unknown
property body. Decode SQLite integers as BigInt before retrieval/iteration and
retain core normalization. Bound each returned row to 64 KiB, total selected
facts to 16 KiB, and at most 128 SQL calls/128 returned rows per public operation,
including open/connection checks. These are proposed ceilings, not measured
counts; count PRAGMAs and connection activity separately as well.

The adapter executes one `withWriter` callback:

1. Core acquires the existing owner lock, revalidates canonical root, descriptor
   and store identity, and opens the checked writable connection only inside
   that lock. Preserve connection settings and bounded lock acquisition.
2. Read checkpoint facts on that connection. Revalidate exact collection/replay/
   fingerprint, original/projection agreement, review owner-key binding, and
   current-versus-retired exclusivity. Accept only current status `claim` with
   no selected publication/cleanup intent. Pending/waiting/done/retiring reject;
   waiting is not migrated. Missing and retired remain distinct errors.
3. Check indexed log replay/map linkage and output ownership. Scores require
   their owned ready output but no map; evidence-only logs require paired null
   output projections; file-backed logs require their owned ready reservation.
   Cross-kind path ownership is checked by indexed metadata lookups for these
   selected map/output paths. Do not open maps, outputs, diagnostics, review
   extensions or dependency payloads. This validates operational metadata, not
   physical availability/hash integrity; a claim does not certify readable
   evidence. Preserve subsequent analyzers' stricter artifact checks.
4. Validate the admitted checkpoint representation below and determine no-op
   versus change under this same lock. No preliminary unlocked observation can
   authorize either result. Capture one `new Date().toISOString()` for an actual
   change after acquisition; no timestamp is derived from evidence.
5. For a change, calculate exact ordinals and preflight row/result budgets, then
   call the existing synchronous `writer.transaction`. There is no await or
   released-lock gap between facts, decision and mutation. A new review uses
   `tx.putReview` only after proven absence. Existing reviews use `tx.setProperty`
   for `/examinedAt` only, retaining its ordinal or appending as specified below.
   Never replace an existing review with `putReview` or rewrite its extensions.
6. Return only after transaction, writer connection, lock and owner cleanup.
   No-op executes no write transaction. Mutating transaction increments generation
   exactly once through the existing core; no extra increment in the adapter.

The owner lock serializes cooperating writers; no guarantee is added for direct
external SQLite/file mutation. Existing snapshots need no new mode: an earlier
callback-scoped view keeps its acquired properties/pinned handles, while a later
snapshot observes the committed checkpoint. Never acquire a nested snapshot or
second owner lock from inside `withWriter`.

## Representations, ordinals and policy

`properties` is authoritative. `reviews.value` is only a bounded convenience
projection; invalidating it to SQL NULL through the existing `setProperty` path
is an allowed change, not loss of the original review object. Do not reconstruct
the complete review to keep that cache populated.

Admit checkpoint properties independently as absent, inline JSON null, or inline
JSON string of at most 256 decoded UTF-8 bytes. Retain strings exactly, including
empty or non-ISO strings: do not normalize historical timestamps. New values are
24-character UTC ISO timestamps. Any checkpoint payload reference, nested value,
number or boolean is `UNSUPPORTED_CHECKPOINT`; an oversized string is
`RESOURCE_LIMIT`. Reject before mutation; never open a checkpoint sidecar or
interpret unsupported values as absent. Unrelated inline/structured extensions,
arbitrary property counts and preserved payload references are not grounds for
rejection and must not be hydrated. Original field absence differs from null.

This is a declared admitted parity domain, not universal parity with malformed
v2 reviews. Both actions validate these three checkpoint representations before
returning their bounded result, including a no-op. Do not impose new timestamp
chronology or require a populated `claimedAt` on an already existing review:
v2 task ownership is the own review entry, not timestamp truthiness. Retain an
existing `completedAt` without treating it as permission for record completion.

| Selected review/action | Resulting logical mutation |
| --- | --- |
| Absent / claim | Create `{claimedAt:now,examinedAt:null,completedAt:null}` in this property order |
| Present / claim | No-op, even if claimedAt is absent/null; never repair it |
| Absent / examined | `NOT_CLAIMED`; no change |
| Present, examinedAt absent or null / examined | Set examinedAt to now; preserve all other properties |
| Present, examinedAt any admitted string / examined | No-op, including the empty string, matching native `??=` |

New review ordinal is zero when none exist, otherwise selected record's largest
review ordinal plus one. New reviews' three property ordinals are 0, 1, 2.
Existing review and property ordinals never change. A missing `/examinedAt`
appends at zero for an empty review or maximum property ordinal plus one; a
present null uses its existing ordinal. Tail queries do not materialize other
reviewers or unknown values. Preserve ties already present; no renumbering.
Perform addition/comparison exactly through SQLite's maximum signed integer;
overflow rejects with `RESOURCE_LIMIT` before any write. A no-op at maximum
generation/ordinal still succeeds because no allocation/increment is needed.

Each actual checkpoint mutation advances generation by exactly one; pre-commit rejected
and no-op calls advance it by zero. This deliberately avoids v2's redundant
whole-manifest save on retries without changing logical checkpoint semantics.
Generation is store bookkeeping, not an evidence/report identity. A successful
retry after a lost response returns `changed:false`, preserved first timestamp,
and the then-current generation; do not promise byte-identical receipts after
unrelated intervening mutations. No new idempotency journal or caller retry loop.

## Failure, cleanup and preservation

Use distinct `MISSING_RECORD`, `RETIRED_RECORD`, `NOT_READY`, `NOT_CLAIMED`,
`UNSUPPORTED_CHECKPOINT`, `INVALID_REFERENCE`/`OWNERSHIP_CONFLICT` and existing
resource/runtime/recovery/lock errors. Errors are not successful empty results
or analyzer fail/unknown findings. Reject inconsistent metadata rather than
repairing it. Ordinary opens remain nonrecovering; `RECOVERY_REQUIRED` demands
the existing separately invoked explicit locked recovery path. A race requiring
native recovery on a writable connection remains governed by M1; no unlocked
recovery, implicit retry or new recovery flag is introduced.

Rollback every pre-commit failed transaction. Preserve its primary thrown value,
including null, across rollback, database close, lock release and owner close;
attempt all independently owned cleanup steps. With no primary error, surface
the cleanup error. Escaped writer/facts capability calls reject after callback
exit. No background work is started. Test close-after-close injection only; do
not claim arbitrary OS close-failure or power-loss qualification.

Distinguish rejection before commit from failure to deliver success after commit.
Pre-commit rejection preserves persistent logical state and generation. If a
successful commit is followed by cleanup failure, the call rejects but the
checkpoint remains committed: never try to undo it or report rollback. Retain a
test receipt establishing the commit boundary, and prove a subsequent exact
retry is a no-op. Do not replace primary thrown values with wrappers merely to
attach a commit flag; an unclassified caller error must be treated as outcome
uncertain until rechecked. Injected commit ambiguity must be recorded, not
asserted to preserve a pre-operation database byte image.

Successful mutation permits only the target review row/new properties or exact
examinedAt update, convenience-projection invalidation, and generation change.
No-op/pre-commit rejection permits none. Preserve all other rows, original JSON
text, presence, ordinals, references, C1 tables, records/statuses, intents,
identities, maps, artifacts and other reviewers. SQLite page layout and transient
DELETE journal/lock files are not evidence equality; compare logical database
content plus artifact bytes, and verify owned locks/connections are released.
No evidence-payload open/read/write is permitted by checkpoint operations,
including selected payloads. Fixture-generation and preservation hashing are
separate measured phases, never charged as zero-access adapter operations.

## Independent comparisons and required tests

Before any candidate implementation/refactoring, export BASE's unmodified
tooling/package inputs to an isolated synthetic workspace, verify their Git
blob hashes, and run the committed `updateReview`/`updateScoreReview` functions
on synthetic v2 manifests only. Freeze generator/export hashes, scenario inputs,
original files, projected checkpoint results, full before/after logical manifests
and hashes. Use a process-local controlled Date implementation in test workers;
keep the published source files unchanged and give the future candidate the same
clock schedule. No public timestamp injection is added. Never import the live
repository CLI root, use production defaults or generate expected values from
the candidate. Existing M2e oracles stay immutable.

Compare the logical v2 checkpoint effect rather than its whole-record return
shape or rewrite count. Fixture v2 logs start at claim with no unrelated waiting
records; waiting-state migration is outside parity and is intentionally rejected
by the v3 adapter. Freeze native behavior for empty strings, missing/null fields,
exact unusual task IDs and repeated requests. Record unsupported representations
separately; do not disguise intentional v3 resource/admission errors as parity.

Required future tests, under both schemas unless inherently v2-only:

- File-backed/evidence-only logs, game-metadata/replay-frame scores; exact task
  validation boundaries, `constructor`, separate collections sharing a fingerprint,
  multiple reviewers, all transition-table cases, retained completed checkpoints
  on a claim record and rejection of pending/waiting/done/retiring/missing/retired.
- Unknown inline values, more than 128 unrelated review properties, payload-backed
  extensions and null convenience projections; zero extension access and exact
  property/reference preservation. Unsupported/oversized checkpoint fields reject
  unchanged. Preserve sparse and above-safe-integer ordinals through maximum;
  reject required allocation/generation overflow but allow no-ops at the maximum.
- Live competing processes, same-task claim races (one creation/one no-op),
  different-task claims (distinct appended ordinals, no lost updates), examination
  racing a claim, and selected state/identity/intent changes before acquisition.
  Assert actual lock-serialized order, not scheduler-specific winners. An earlier
  read cannot authorize a later retired/not-ready record. Score maps remain optional.
- Existing snapshot acquired before checkpoint change retains earlier review
  metadata and pinned readability; a subsequent snapshot sees the new checkpoint.
  Use test-only latches, not sleeps as proof of lock acquisition. Any authorized
  retirement actor is synthetic setup/testing of core behavior, not a new adapter
  feature. Preserve the log-cleanup versus explicit-score-retirement distinction.
- Transaction-begin/body/commit faults, thrown null, cleanup-only failures,
  connection/lock cleanup, expired writer capability, descriptor replacement,
  stale/dead/live lock rules, hot-journal read-open failure and separately invoked
  recovery. Exercise process restart before/after commit with retained fixtures;
  verify rollback or committed retry as applicable and subsequent operations.
- Assert adapter success does not imply artifact existence/integrity: removal of
  a selected artifact in a synthetic fixture is not hidden by a fabricated
  verification result. No file access during checkpoint calls; existing analysis
  continues to reject unavailable evidence. Do not weaken snapshot admission.
- Synchronous v2 APIs/CLI, import-time SQLite isolation, M2c/M2d/M2e frozen reports,
  review snapshot behavior and existing all-reviewer completion tests remain
  unchanged. CLI controls, if needed, run copied tools in synthetic roots only.

## Deterministic resource recipe

Use two fresh stores per schema, exactly **10 and 1,000 current operational
records**, no retired records initially. Create schemas through existing
`createFixtureStore`/`createCatalogFixture` APIs. Freeze the input-only BASE
[M2e recipe](../../tests/fixtures/replay-combined-analysis-m2e-recipe.js), its
[definitions](../../tests/fixtures/replay-combined-analysis-m2e-definitions.js)
and [writer-based fixture construction](../../tests/fixtures/replay-combined-analysis-m2e-store.js)
as the selected-artifact specification, with variant `scale`; do not execute
them during planning. Future generation must verify those source hashes against
BASE before invoking them. No candidate-derived expected artifacts.

- Four selected records at ordinals 0–3: replay `bbbbbbbbbbbbbbbbbbbbbbbb`, log
  fingerprints 64 zeros and 63 zeros followed by `1`, then game-metadata and
  replay-frame score fingerprints derived by the unmodified BASE
  `scoreSourceFingerprint` from the recipe's exact request keys/raw bodies.
  Freeze the two derived fingerprint literals and every artifact hash/size before
  implementation. Build ID is 64 `a` characters, imported date
  `2026-10-06T00:00:00.000Z`; map, output bytes, 1,024 wrappers per selected log,
  overflow occurrence 512 and score extensions are exactly the pinned recipe.
  These existing twelve selected artifacts must remain unopened by M2f.
- Six/996 pending filler score records use replay `eeeeeeeeeeeeeeeeeeeeeeee`,
  ordinals `i=4..N-1`, fingerprint SHA-256 of UTF-8 `m2e-unselected-${i}`, as in
  that construction. The first six each own two distinct 50 MiB extension files:
  payload j=0..11 is a JSON string, quote + (50*1,048,576-2) bytes of ASCII
  `65+j` + quote. Pointer `/large-${j}`, role extensions, parent null. Reserve
  each through its pending record's publication intent before publishPayload;
  retain the pending record/intents. Never use log-only unreserved prepublication
  for scores. Require twelve separate regular files/inodes, no hard-link/sparse
  substitutes, exact total 629,145,600 bytes and frozen per-file hashes.
- Before measurement, seed each selected record with task `codex/m2f-existing`
  at review ordinal 7 using putReview. Its properties in order are claimedAt
  `2026-10-06T00:00:00.000Z`, examinedAt null, completedAt null, and
  `note:{"zero":0,"flag":false}`. Add no other reviewers. This workload needs
  no new payloads; structured-review preservation is a separate functional test.
- Fix record order to those four records. For each, perform the following six
  separate public calls, then advance to the next record. Call index q=0..23
  uses clock `2026-10-06T00:01:00.000Z + q*1000ms`, including retries.

| Offset per record | Task/action | Expected effect |
| --- | --- | --- |
| 0 | codex/m2f-new / claim | New ordinal 8, claimedAt current clock, null examinedAt/completedAt; generation +1 |
| 1 | codex/m2f-new / claim | No-op; first claimedAt retained |
| 2 | codex/m2f-new / examined | Set examinedAt at current clock, same ordinal; generation +1 |
| 3 | codex/m2f-new / examined | No-op; first examinedAt retained |
| 4 | codex/m2f-existing / examined | Set examinedAt, preserve ordinal 7 and note; generation +1 |
| 5 | codex/m2f-existing / examined | No-op |

Each store therefore executes 24 calls, twelve mutations and twelve no-ops;
final generation is its own measured setup generation plus twelve. Compare
result hashes after normalizing **only** generation to delta from that store's
setup generation. Keep original generation strings in receipts. All other
result fields, timestamps, property order and values must match frozen v2
expectations. No report is generated by M2f; retain existing analyzer-report
hashes through separate compatibility gates, not a new resource-gate analyzer run.

## Proposed resource gates and evidence

Per schema, the pair's 48 public calls run sequentially in one operation worker
with `--max-old-space-size=192`; peak worker RSS must be at most 256 MiB.
Corresponding calls at the two corpus sizes must have identical SQL/returned-row
counts and normalized result hashes. Fix workload first; measure actual counts
without inventing a number now. Report per-call and total SQL/rows, PRAGMAs,
connections/metadata opens, changed/no-op/transaction/generation counts, elapsed
time and CPU/RSS. Zero selected or unrelated evidence opens/read bytes/writes,
zero corpus scans and no unapproved logical writes are mandatory. Verify query
plans use selected-key/tail indexes and instrument file access, not just reports.

Existing ceilings remain: 64 KiB inline row/value and stream chunks, 128-row/
8 MiB metadata pages, snapshot 64 sources/8 MiB/256 handles, lock 50 attempts at
100 ms with existing stale-owner rules, SQLite busy timeout 5,000 ms and unchanged
connection settings. The adapter does not enlarge any of them or use analysis
snapshot limits as permission to load whole reviews. Its narrower facts/result
caps and zero-payload access rule above apply independently.

Each schema's phases are separately bounded, parent-monitored from worker spawn
to exit **and stdout/stderr closure**, including module/runtime initialization:

- **Generation: 60 seconds** for both stores, selected artifacts, twelve 50 MiB
  files per store, review seeds, database/artifact inventories, hash checks,
  owner/descriptor closure and bounded receipt emission. Stream chunk generation;
  do not buffer the 600 MiB corpus. Source-hash verification is included.
- **Operations: 30 seconds** for all 48 calls across both sizes, request/result
  validation and counters, per-call handle cleanup, final receipt and shutdown.
  No fixture construction, prewarming, analysis or preservation hashing inside
  this phase. Each public call opens/closes its own handle as the interface says.
- **Preservation: 60 seconds** for both post-run logical database inventories,
  artifact hashes/identity checks and comparison to generation receipts with
  only the twelve authorized review changes per store plus generation allowed.
  Collect core publication intents/C1 tables too; preserve source bytes.

All phase workers use the same heap/RSS limits. Bound each stdout/stderr stream
to 1 MiB and JSON receipts to 512 KiB; never print payloads. Overflow is failure,
not silent truncation. On timeout or output overflow send TERM, allow two seconds,
then KILL and allow three seconds for process reap/pipe closure. Shutdown grace
does not extend a passing phase budget. Retain failed/interrupted fixtures and
all logs; bound supervisor termination itself and report unreaped processes.
Do not rerun failures merely to obtain a pass or combine passing subsets.

## Qualification and completion boundary

Future implementation qualification must run on settled candidate bytes:

1. Independent committed-v2 comparisons and focused new both-schema tests.
2. Affected storage/payload/catalog, replay-log/score lifecycle and M2c/M2d/M2e
   analyzer/SQLite-isolation tests, including existing preservation regressions.
3. New paired resource gates and existing prescribed M1/C1/M2a–M2e gates; reuse
   an unchanged gate only with explicit byte/dependency correspondence and impact
   assessment, never to replace an affected writer/cleanup gate.
4. One complete normal-concurrency `npm test`, then `npm run check`; no relaxed
   assertions, deadlines, limits, skips or manufactured combined-suite passes.
5. Documentation links/anchors, receipt JSON, examples and tracked/new-file
   whitespace; before/after executable/test/package hashes tied to complete logs,
   exits, runtime versions, timestamps, actual counters and frozen oracle hashes.

Create a separate qualification record retaining every failure and any justified
diagnostic or fresh complete run as distinct history. SQLite timing uncertainty
remains unresolved; no larger busy deadline or undocumented retry is allowed.
If any required gate fails, leave the candidate explicitly unqualified. Record
the exact candidate path list and this plan's eventual publication dependency;
implementation authorization alone is not permission to stage or commit it.

Completion means bounded synthetic review-checkpoint behavior and fixed-workload
corpus independence only. It does not qualify general analyzer memory, arbitrary
review-body processing, completion/cleanup orchestration, full M2, production
readiness, additional platforms/durability, or resolution of SQLite timing.
This planning task creates only this document; implementation, oracles and all
measurements remain future work. Preserve the existing prompt deletion, empty
index, both trial worktrees, runtime/builds/dependencies and production evidence.
