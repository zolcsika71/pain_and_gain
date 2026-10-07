# Storage v3 M2g: fixture-only score-review completion

Date: 2026-10-06. Status: proposed implementation contract, awaiting independent
review and separate implementation authorization. Published BASE:
`bc511703b3ac8eeb2e15d9ff032cc4c496920ea7`.

This plan reserves **M2g**, the next unused identifier found after M2f. The
committed roadmap requires review integration but assigns no successor or
ordering after M2f. Choosing score completion before log completion and cleanup
is this plan's bounded recommendation. Every new budget and qualification result
below is **unmeasured**. This task creates this plan only.

Authority: [ADR 0006 lifecycle contracts](../decisions/0006-replay-storage-v3.md#review-and-lifecycle-contracts),
[ADR 0005 score lifecycle](../decisions/0005-replay-frame-scoring-evidence.md#publication-and-review-lifecycle),
the [score-retention contract](replay-evidence-contract.md#replay-score-source-retention)
and [score-retention diagram](../diagrams/replay-score-retention.puml).
Score completion retains the record and all artifacts. The distinct
[log-review lifecycle](../diagrams/replay-review-cleanup.puml) remains unchanged.

## Scope, prerequisites and exclusions

Complete one explicitly selected task review of one score record. Change the
record from `claim` to `done` in the same transaction only when all its reviewers
have nonempty examined and completed checkpoints under the admitted policy below.
Completion is the caller's assertion that its analysis is finished. Neither this
operation, a claim, nor successful analyzer execution verifies that assertion or
certifies artifact availability, integrity, scoring validity or findings.

Completed prerequisites are [M1](replay-storage-v3-m1-2026-10-03.md) locking,
original-property storage, transactions and explicit recovery; the
[C1 evidence interface](replay-catalog-c1-2026-10-04.md); and
[M2f's corrected plan](replay-storage-v3-m2f-plan-2026-10-06.md) and
[qualified checkpoint implementation](replay-storage-v3-m2f-2026-10-06.md).
M2c/M2d and [M2e](replay-storage-v3-m2e-2026-10-06.md) establish analyzer/snapshot
regressions, not an automatic completion signal. Historical 838-test M2f
qualification covers only its recorded bytes and scope; it does not qualify M2g.

Missing capabilities are locked checkpoint-only reviewer pagination and explicit
ordinal allocation for an absent original status property. They belong to this
bounded implementation. No schema/index, dependency or payload-format change is
planned; report a necessary expansion rather than silently introducing one.

Excluded: log completion, retirement, deletion, reconciliation, waiting-status
migration, imports, map administration, caches, historical-index/scout wiring,
production roots/dispatch, broader bounded-v2 integration, C2 catalog work, M3
migration/rehearsal and M4 production cutover. Do not call v2 lifecycle commands
to implement a v3 mutation. Do not create catalog review/workflow/artifact events.

## Separate fixture interface

Proposed new `tools/replay-score-review-fixture.js` exports:

```text
completeFixtureScoreReview({root, schemaVersion, replayId, fingerprint, taskId})
  -> Promise<completionResult>
```

Accept exactly those five own data properties on a plain object with prototype
Object.prototype or null. Reject symbols, unknown keys, accessors and missing
keys without evaluating getters. Copy validated primitive inputs before awaiting.
Unknown options are `UNSUPPORTED_OPTION`; malformed options/root types are
`INVALID_ARGUMENT`; unsupported numeric schema is `UNSUPPORTED_STORE`; invalid
replay/fingerprint/task syntax is `INVALID_IDENTITY`.

Schema is numeric 1 or 2, replay ID lowercase 24-hex, fingerprint lowercase
64-hex, task ID exactly `^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$`. Preserve case and
bytes; do not trim or normalize. `constructor` is an ordinary independent task.
There is no collection/action parameter: the function means score completion.
No aliases, batch, wildcard, timestamp injection, default root or recovery option
are public. Supplying any such option rejects before opening a store.

Reuse canonical direct temporary-root/marker checks, the
`pain-gain-store-v3-fixture-` prefix, declared local APFS and supported native
Node/SQLite requirements. Lazy-open schema 1 with `openStore({root,mode:'write'})`
or schema 2 with `openCatalog({root,mode:'write'}).evidence`; close the owner
handle. Never use catalog workflow APIs. M2f's existing function, accepted actions,
result shape and limits remain unchanged. Keep v2 `updateScoreReview`, its
`complete`/`done` aliases and `score-done` CLI unchanged and SQLite-free at import.
No production command imports or auto-dispatches to the new adapter.

The detached result has exactly these fields:

| Field | Representation |
| --- | --- |
| collection | Literal `score` |
| replayId, fingerprint, taskId | Exact supplied identities |
| changed, completionChanged, statusChanged | Booleans; changed is their logical OR |
| recordStatus | Resulting `claim` or `done` |
| reviewOrdinal | Exact unsigned decimal string, or null for an absent task on terminal retry |
| generation | Exact unsigned decimal string |
| checkpoints | Three named presence/value entries as in M2f, or null for that absent terminal task |

Each checkpoint entry is `{present:false}` or `{present:true,value:null|string}`.
Do not return other reviewers, physical paths, arbitrary fields, a whole review,
a live cursor or a verification flag. Native JSON serialization must fit 4 KiB
UTF-8; preflight before mutation. An absent terminal task is represented by both
`reviewOrdinal:null` and `checkpoints:null`, never by an invented empty review.

## Locked facts and reviewer pagination

Execute one `withWriter` callback. Core acquires the existing owner lock,
revalidates root, descriptor/store identity and connection settings, then opens
the writable connection under that lock. Preliminary public reads authorize
neither mutation nor a no-op. No nested owner lock/read snapshot is acquired.

Add narrow synchronous writer-lifetime-bound capabilities, with names reserved
by this plan:

```text
writer.readScoreCompletionFacts({recordKey, taskId}) -> copied fixed facts
writer.pageScoreReviewCheckpoints({recordKey, after}) -> copied page/cursor
```

Fixed facts contain the exact selected current/retired record, generation,
selected identity/status/output projections and corresponding original fields
where present, output reservation and indexed cross-kind ownership, selected
intent, task review/header/owner binding and its three checkpoint properties,
and record/review property tails needed for ordinal allocation. Bound copied
fixed facts to 16 KiB. Reuse internal point-query logic where useful without
enlarging M2f facts, queries or results. Expose no SQL, connection or arbitrary
mutation callback. Returned objects are copies, not mutable database state.

Before choosing a branch, validate:

1. Exact score/replay/fingerprint tuple and canonical record key, original versus
   indexed agreement, and current-versus-retired exclusivity. Conflicts are
   `INVALID_REFERENCE`; missing and retired yield distinct `MISSING_RECORD` and
   `RETIRED_RECORD`. A score tombstone is never terminal success here.
2. Current status is `claim` or `done`, with no selected publication/cleanup intent.
   Pending, retiring and any other state or active intent yield `NOT_READY`.
   No state migration or repair occurs.
3. The owned output reservation is ready, its identity/path/hash agree with the
   record, its filename obeys existing score identity rules, and no indexed
   map/payload owner conflicts with its path. Scores need no map association.
   These are metadata checks only: never stat/open/read the artifact itself.
4. The selected task header, if present, has the exact canonical owner key and
   binding. Orphan properties or conflicting bindings are `OWNERSHIP_CONFLICT`.
   Validate the selected checkpoints before forming any result.

For a `claim` record require an existing selected task and nonempty examinedAt,
then paginate all of that record's reviewers on this same writer connection.
Public `pageReviews`/`getReview` are not substitutes: they use independent read
connections and may hydrate convenience values or unrelated properties.

Pages contain at most 128 reviewer rows, ordered by exact `(ordinal,task)` with
BINARY task comparison and keyset continuation, never OFFSET. Select only the
review identity/header/owner key and the presence, ordinal, inline JSON and
payload-pointer columns for `/claimedAt`, `/examinedAt`, `/completedAt`. Use
indexed joins/point lookups to these three properties; never select
`reviews.value`, unknown property values, or payload bodies. One composite
reviewer row is the returned-row accounting unit; it includes the joined
checkpoint columns. Do not execute one separate public lookup per reviewer.

Existing `review_page`, review identity/owner uniqueness and property primary
indexes suffice. Verify actual query plans use selected-record ranges and exact
property keys without corpus scans or temporary sorting. Decode SQLite integers
as BigInt before retrieval, retaining core safe-number normalization; continuation
comparisons must remain exact above JavaScript's safe integer range and with ties.

Check each row's selected-record identity, valid exact task syntax, canonical
owner key and all three admitted checkpoint representations. Preserve arbitrary
extensions and the original claimedAt; neither contributes implicit permission.
The selected task must occur exactly once and agree with its fixed facts.
Do not stop pagination on the first unfinished reviewer: finish validation and
work-limit checks even when the aggregate is already false. Retain only one page,
the selected task facts and boolean/counter accumulators, not the reviewer corpus.

Cursors bind the writer lifetime, store ID, generation, record, query/order and
last exact ordinal/task. Reject foreign, altered, expired or stale cursors. A
128-row page returns a continuation; an empty or shorter page ends traversal.
An exact multiple therefore requires a final empty page. No write occurs between
pages. Internal cursors never escape the public completion result.

## Representation domain and terminal policy

As in M2f, each checked checkpoint is independently absent, inline JSON null, or
an inline JSON string of at most 256 decoded UTF-8 bytes. Preserve empty/non-ISO
strings and field absence exactly. Sidecars, objects, arrays, numbers and booleans
are `UNSUPPORTED_CHECKPOINT`; oversized strings are `RESOURCE_LIMIT`. Malformed
stored JSON/identity metadata is `INVALID_REFERENCE`, not a falsy checkpoint.
Review keys examined by pagination must satisfy the task syntax above; malformed
stored keys reject with `INVALID_REFERENCE`. These are explicit parity-domain
restrictions, not promises of parity for every malformed v2 manifest.

After the fixed validation, a `done` record is a terminal no-op. Preserve v2's
return-before-requiring-task-ownership behavior: an absent task succeeds without
being created. Do not paginate or recertify other reviewers on this branch, even
if the record has zero reviewers or more than the nonterminal reviewer limit.
If the requested task exists, validate and return only its admitted checkpoints;
if absent, return the null fields specified above. A malformed selected checkpoint,
ownership conflict, selected intent or inconsistent record still rejects. This
deliberately delimits v2's unconditional terminal return with storage/admission
checks; it must be documented and tested separately from admitted parity.

For `claim`, absent task is `NOT_CLAIMED`. Its examinedAt absent, null or empty
string is `NOT_EXAMINED`; a nonempty admitted string suffices without imposing
timestamp format or chronology. There is no vacuous all-reviewers completion.
Compute the following hypothetical post-call state before any write:

| Selected completedAt | Completion property effect |
| --- | --- |
| Absent or null, with nonempty examinedAt | Set one new UTC ISO timestamp |
| Any admitted string, including empty | Preserve exactly; no checkpoint repair |

Use native v2 truthiness within this admitted domain: a reviewer counts as
finished only when both examinedAt and completedAt are nonempty strings. Empty
completedAt survives `??=` and blocks the aggregate; empty examinedAt blocks it
too. Missing/null claimedAt does not invalidate an existing ownership entry.
All other reviewers must independently pass this test. Substitute only the
selected task's hypothetical completion when evaluating it.

| Aggregate/selected change | Result |
| --- | --- |
| Other unfinished reviewer; new selected completion | Update only completion; retain claim |
| Every reviewer finished after new selected completion | Update completion and status to done together |
| Every reviewer already finished; status still claim | Status-only mutation to done |
| Aggregate false; selected completion already a string | True no-op; retain claim |
| Valid terminal done | True no-op regardless of requested task ownership |

The v2 source of truth is [updateScoreReview](../../tools/replay-logs.js), not
catalog completion. The existing [lifecycle tests](../../tests/unit/replay-score-sources.test.js)
and [retention contract](replay-evidence-contract.md#replay-score-source-retention)
continue to distinguish completion from separately authorized retirement.

## Exact updates, generation and failure boundaries

After all fixed facts/pages/policy and resource checks, preflight the detached
result and every changed row. Capture one `new Date().toISOString()` only when
a completion timestamp must be allocated. Never derive it from payloads. No
await, released-lock gap or external authorization read separates this decision
from the synchronous mutation transaction.

Use `tx.setProperty` only for the selected `/completedAt`; never `putReview` for
an existing review. Preserve a present null property's ordinal. If absent, append
at zero for an empty review or its exact maximum property ordinal plus one.
Retain review ordinals, ties, all other property values/ordinals and payload refs.
Invalidating this review's `reviews.value` projection to SQL NULL is allowed only
when that review property changes. A status-only change does not touch reviews.

When transitioning to done, update both `records.status` and its original
`/status` property. Preserve an existing status ordinal; when absent, append at
zero for an empty record or its maximum original-property ordinal plus one.
Do not blindly use the current `setStatus` fallback of zero. Add only a bounded
optional `propertyOrdinal` argument to `tx.setStatus` if needed: an explicitly
supplied value must match the existing ordinal when present and be validated as
an exact nonnegative SQLite integer. M2g supplies the locked/preflighted value
for both present and absent cases; callers omitting it retain their existing
behavior. No ordinal override may renumber a present status property.

An absent original status with an indexed status is a v3-specific control:
v2's missing record.status would not authorize review. Do not label this or
large SQLite ordinal tests as committed-v2 parity. A no-op leaves an absent
original status absent. A present original status must agree with its projection.

All additions/comparisons use exact integers through 9,223,372,036,854,775,807.
Reject needed property allocation or generation overflow with `RESOURCE_LIMIT`
before mutation. Exhausted ordinals that need no allocation remain valid; true
no-ops at maximum generation succeed. A status-only mutation needs a generation
increment and any missing status ordinal allocation just like another change.

If either completionChanged or statusChanged is true, use exactly one atomic
`writer.transaction`, incrementing generation once through core. No-op executes
no write transaction. Pre-commit rejection and no-op advance generation by zero.
Preserve the first completion timestamp on retry. Generation is bookkeeping,
never evidence identity or a deterministic finding/cache key. After unrelated
mutations, a retry can return the then-current generation without changing it.

Preserve primary thrown values, including null, across rollback, database close,
lock release, owner-file cleanup and owner-handle close. Attempt independently
owned cleanup even after another attempt fails. Without a primary error, surface
the first cleanup failure. Expire writer/page/transaction capabilities when their
callbacks end. With no write transaction, do not manufacture a rollback attempt.

Distinguish pre-commit rollback from post-commit cleanup failure. The latter may
reject after checkpoint/status/generation committed; preserve that state and
prove an exact retry is a no-op. Never claim rollback after commit or replace the
primary value merely to attach metadata. Unclassified delivery errors remain
outcome-uncertain until rechecked. Test injected failures after real close,
rollback or unlink; do not generalize to arbitrary OS close failure or power loss.

Ordinary opens remain nonrecovering. `RECOVERY_REQUIRED` requires the existing
separate explicit locked recovery call; add no implicit retry or public recovery
flag. Preserve native hot-journal recovery and M2f's same-value user_version
header write for residual non-hot journals under the owner lock. Recovery must
preserve logical tables, generation and a non-default user_version.

## Preservation and compatibility

Successful writes are limited to the exact target completion property, its
convenience-projection invalidation when necessary, the exact record status pair,
and one generation increment. All other database rows, original JSON text,
presence/order, references, reviewers, provenance, fingerprints, source/response
identities, maps, records, intents, payload registrations and C1 tables remain.
No-op/pre-commit rejection permits none of those logical changes.

Completion opens, reads and writes zero selected or unrelated evidence payloads,
including checkpoint references, maps, raw responses, diagnostics and extensions.
It neither repairs missing files nor creates artifacts, intents or tombstones.
Preserve full file bytes and identities in separate qualification inventories;
SQLite page layout and transient journals/locks are not evidence identity.

An earlier callback-scoped snapshot retains its acquired metadata and pinned
readability; a later snapshot sees either the old state or the complete committed
state. Preserve current analyzer admission/report semantics and provenance;
completion must not relax selected-artifact integrity checks. Catalog evidence
references remain valid without generating a catalog completion event.

Expected future scope: the new adapter; narrow store capabilities/optional exact
status ordinal; new unit tests and `replay-score-review-m2g-*` fixture helpers;
syntax registration; and a separate measured qualification document/receipt.
Reuse internal pure validation only where needed. No changes to v2 lifecycle/CLI
dispatch, existing frozen oracles or Arena runtime are planned.

## Independent oracle procedure before implementation

After separate implementation authorization, before editing executable code or
tests, export the necessary unmodified BASE tooling, package and input-fixture
dependency closure to an isolated synthetic workspace. Verify each exported Git
blob ID and SHA-256; retain the source inventory and generator hash. Import v2
helpers only from that export and supply explicit synthetic roots. Never run a
live repository CLI root or use its production defaults.

Freeze original synthetic manifests, each before/after logical manifest and byte
hash, scenario inputs, process-local controlled-clock schedule, errors and exact
checkpoint/status effects from committed `updateScoreReview(...,'done',...)`.
Also establish the unchanged v2 `complete` alias. Derive completionChanged and
statusChanged by before/after comparison, not candidate results. v3 ordinals,
generation deltas, admission failures and result projection are independently
specified bookkeeping controls; v2 whole-manifest rewrite counts are not parity.
For functional cases, reset call q=0 per case and use
`2026-10-06T00:02:00.000Z + q*1000ms`; the scale cases use their separate schedule
below. Freeze every case's inputs, call order and expected effects explicitly.

Cover game-metadata and replay-frame scores under both future schemas: absent
owner, constructor, multiple owners, absent/null/empty/non-ISO checkpoints,
existing completion, partial/final/status-only mutation, repeat calls, terminal
owned/unowned retries, no reviewers on done, missing/retired/pending/retiring,
and selected representation restrictions. Separate intentional v3 rejections
from admitted-v2 parity, including malformed terminal metadata and missing
original status. Freeze the full scale schedule below, score fingerprints and
all selected/large artifact hashes before implementation; reuse published input
recipes without importing candidate expectations. Preserve prior M2c-M2f oracles.

Do not generate any oracle or run the recipe during this planning task. A frozen
expectation that disagrees with a later candidate is evidence to investigate,
not permission to rewrite the expectation.

## Exact paired fixture recipe and clocks

Run six independent groups `(schema,R)` in order `(1,1)`, `(1,128)`, `(1,1000)`,
`(2,1)`, `(2,128)`, `(2,1000)`. Each group has two fresh stores with exactly 10
and 1,000 current operational records, created through the existing schema APIs.
R is the number of reviewers on each of the two selected score records, not the
number of records. Never reuse a mutated store between R groups. Twelve stores
are generated in total; retain all of them, including failed/interrupted groups.

Pin BASE's [M2e scale recipe](../../tests/fixtures/replay-combined-analysis-m2e-recipe.js),
[definitions](../../tests/fixtures/replay-combined-analysis-m2e-definitions.js),
[store construction](../../tests/fixtures/replay-combined-analysis-m2e-store.js)
and its pure v2 dependencies by source hash before future execution. Use variant
`scale`, count N and `large:true`, without altering their selected artifacts:

- Ordinals 0/1 are the existing selected logs with fingerprints 64 zeros and 63
  zeros followed by 1. Ordinals 2/3 are game-metadata and replay-frame scores.
  Replay ID is `bbbbbbbbbbbbbbbbbbbbbbbb`; build ID is 64 lowercase a characters;
  imported date is `2026-10-06T00:00:00.000Z`. Preserve the map, raw response and
  JSONL bytes, 1,024 wrappers per log and overflow occurrence 512 exactly.
- The two score fingerprints, already pinned independently in M2f, are
  `dc2285ad6874bf50f4b85d530fbc14b727d747cdfcd87b12abfa47fd7c1b1999`
  and `daf3f3ef20551c4674c2558014606c007779cf7e973fa2aec594b9afbac2032f`.
  Future oracle generation must verify them through unmodified BASE helpers.
  All twelve selected artifact sizes/hashes must agree with the frozen recipe.
- Six/996 pending filler scores have replay ID `eeeeeeeeeeeeeeeeeeeeeeee`,
  ordinals i=4..N-1 and SHA-256 of UTF-8 `m2e-unselected-${i}` as fingerprint.
  No records are retired. The first six fillers retain their six publication
  intents and twelve operation-file entries from large-payload construction.
- Each store has twelve distinct regular 50 MiB unrelated extension files. File
  j=0..11 is a JSON string: quote, exactly `50*1048576-2` bytes of ASCII `65+j`,
  quote. Pointer is `/large-${j}`, role extensions, parent null; each pending
  owner reserves its two files through its publication intent before publish.
  Require twelve separate inodes, link count one, no sparse substitutes, frozen
  hashes and exactly 629,145,600 bytes total. Do not weaken publication rules.

After construction, seed only the two score records' normalized review rows in
one writer transaction per store. Leave the logs without reviewers and all
record-original extensions unchanged. Each score has tasks i=0..R-1 named
`codex/m2g-r` plus i in four zero-padded decimal digits, review ordinal `7+2*i`.
Use putReview with properties in this order, ordinals 0,1,2,3:

1. claimedAt = `2026-10-06T00:00:00.000Z`;
2. examinedAt = `2026-10-06T00:00:10.000Z`;
3. completedAt as specified next;
4. note = `{"zero":0,"flag":false}`.

For metadata score M, the last two tasks have completedAt null when R>=2; all
earlier tasks have `2026-10-06T00:00:20.000Z`. When R=1, its sole task has null.
For frame score F, every task has that nonempty completion string while record
status remains claim. This intentionally exercises a status-only transition.
Both scores initially have status claim and no selected intent. Require exactly
2R reviews and 8R review-property rows; no reviews belong to other records.

Let B be task R-1; A is task R-2 when R>=2, otherwise A=B. Let U be the absent
task `codex/m2g-terminal-absent`. For each store execute these eight separate
public calls in order; reset q=0 for the other corpus size. Clock at call q is
`2026-10-06T00:01:00.000Z + q*1000ms`, including retries and terminal calls.

| q | Record/task | R=1 expected effect | R=128 or 1,000 expected effect |
| --- | --- | --- | --- |
| 0 | M / A | Complete A and set M done | Complete A, retain M claim |
| 1 | M / A | Terminal no-op | Nonterminal no-op; B still unfinished |
| 2 | M / B | Terminal no-op (A=B) | Complete B and set M done |
| 3 | M / B | Terminal no-op | Terminal no-op |
| 4 | F / B | Status-only F done | Status-only F done |
| 5 | F / B | Terminal no-op | Terminal no-op |
| 6 | F / U | Terminal absent-task no-op | Terminal absent-task no-op |
| 7 | F / U | Terminal absent-task no-op | Terminal absent-task no-op |

A's new completion is clock q=0; B's is clock q=2 only for R>=2. No other
timestamp changes. F retains every old timestamp. Every review/property ordinal
is unchanged in this scale recipe; missing-property allocation is a separate
functional control. All terminal U results have null reviewOrdinal/checkpoints.

The unchanged construction plus one seed transaction yields setup generation
G=52, independent of N/R/schema; verify and retain it rather than silently
normalizing unexpected setup writes. The future oracle pins expected bookkeeping
independently. Per store, exact counters are:

| R | Calls | Mutating transactions | No-op calls | Completion-property changes | Status transitions | Final generation |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 | 2 | 6 | 1 | 2 | 54 |
| 128 | 8 | 3 | 5 | 2 | 2 | 55 |
| 1,000 | 8 | 3 | 5 | 2 | 2 | 55 |

Each pair executes 16 calls; all six groups execute 96 calls, 32 mutating
transactions and 64 no-ops. A successful mutating call has one write BEGIN/COMMIT
and zero rollbacks. Count initial read-only validation transactions separately;
their COMMIT is not an extra mutation. Compare entire results to the frozen
projection, normalizing only generation to delta from G for corresponding hashes.
Keep original generation strings in receipts. Do not generate analyzer reports
inside the completion resource gate.

## Reviewer-dependent work and resource gates

All limits in this section proposed specifically for M2g are unmeasured.
Existing storage limits are preserved: 64 KiB inline row/value and stream chunk;
128 rows/8 MiB per metadata page; 64 sources/8 MiB/256 handles per analysis
snapshot; lock 50 attempts at 100 ms with existing stale-owner checks; SQLite
busy timeout 5,000 ms and unchanged connection settings. M2f's 128-SQL-call/
128-returned-row operation ceilings, 16 KiB facts and 4 KiB results stay intact.

M2g's nonterminal completion admits at most **1,000 selected-record reviewers**.
Discovering reviewer 1,001 rejects `RESOURCE_LIMIT` before any mutation, even
when an earlier reviewer already prevents completion. This is a declared initial
operation limit, not a storage/reviewer-retention limit. Existing records with
more reviewers remain retained; M2f is not restricted by this new cap. Terminal
done retries do not enumerate reviewers and therefore do not impose this cap.

Use fixed 128-row checkpoint pages, additionally capped at 1 MiB copied JSON per
page and 64 KiB per composite row. Across fixed facts plus every visited page,
allow at most 8 MiB cumulative copied JSON, counting each visit without double
counting its enclosing page serialization. BigInts count as decimal strings.
Keep at most one such page, 16 KiB fixed facts and a 4 KiB result live in adapter
state; no whole-reviewer map/array. Enforce caps during collection, not after an
unbounded query/materialization. Unknown extensions never enter these accounts.

For a fully traversed admitted claim record with R reviewers define
`P(R)=floor(R/128)+1`, including a final empty page for exact multiples. Allow
at most `128 + 4*P(R)` total SQL API calls and `128 + R + P(R)` returned rows per
public operation, including opens, connection checks, PRAGMAs, point facts and
mutations. Four SQL calls per page is a ceiling, not a prescribed query count.
Use indexed composite checkpoint rows rather than per-reviewer query loops.
For terminal or pre-pagination rejection, the ceilings are 128 calls/128 rows.
Overflow detection is absolutely bounded by eight page fetches, 1,024 fetched
reviewer rows, 160 total SQL calls and 1,160 total returned rows. Byte caps apply
even before the reviewer count limit is reached. Other rejection paths never
exceed these absolute limits. No hidden COUNT/full-corpus pass is permitted.

The fixed recipe has these exact pagination counters per store:

| R | Calls traversing all reviewers | Reviewer page fetches | Reviewer rows returned by those pages |
| --- | --- | --- | --- |
| 1 | 2 (q=0,4) | 2 | 2 |
| 128 | 4 (q=0,1,2,4) | 8 | 512 |
| 1,000 | 4 (q=0,1,2,4) | 32 | 4,000 |

All other calls skip reviewer pagination. These counters exclude selected-task
point facts, which still count toward total SQL/rows. Across different R values,
work can grow with selected reviewers; it must not grow with unrelated records.
For each fixed schema/R, corresponding N=10/N=1,000 calls must have exactly equal
SQL/PRAGMA calls, returned rows, page fetches, connections, metadata opens,
write transactions, generation-normalized result hashes and logical effects.

Instrument all operation file-open/read/write paths and owned handles; require
zero selected/unrelated evidence access, zero corpus scans, zero leaked handles
and no unauthorized logical writes. Report actual SQL and individual PRAGMA
statements as well as API calls, rows, pages, changed/no-op/status-only counts,
generation, elapsed time, CPU, worker high-water RSS and parent RSS samples.
Retain EXPLAIN plans separately without inflating adapter counters; their test
overhead remains charged to the operations phase. Existing read-only validation
COMMITs must be distinguished from write commits in measurements.

Each schema/R pair has three fresh, independently supervised workers, all with
`--max-old-space-size=192` and maximum **256 MiB RSS**:

| Phase | Deadline | Included work |
| --- | --- | --- |
| Generation | 60 seconds | Both stores, source-hash checks, exact selected/large files, R reviewer seeds, full logical/file inventories, hashes, handle closure and receipt emission |
| Operations | 30 seconds | All 16 ordered calls, clocks, admission/result checks, SQL/row/file instrumentation, query plans, per-call closure, receipt and shutdown |
| Preservation | 60 seconds | Both complete logical inventories and streamed artifact hashes/identities, comparison against frozen allowed effects, closure and receipt |

Measure parent wall time from spawn through exit **and stdout/stderr closure**,
including startup/import/runtime validation. No prewarming, fixture generation,
artifact hashing or analyzer execution in operations. Bound each output stream
to 1 MiB and emitted JSON to 512 KiB; inventories/individual plans can be retained
as phase files instead of embedding them in output. Stream file generation and
hashing in at most 64 KiB chunks, never buffer the 600 MiB corpus.

On deadline, RSS or output failure, latch failure, send TERM, allow two seconds,
then KILL and allow three seconds for reap/pipe closure. If still unreaped, close
supervisor pipes, unref and report the unreaped process; bound the supervisor too.
Parent RSS sampling must itself have a bounded subprocess timeout. Shutdown grace
never converts an over-deadline run to a pass. Retain complete bounded logs,
overflow/failure facts and every interrupted fixture. Do not retry away failures,
pool passing subsets, enlarge limits or alter frozen expectations to obtain a pass.

Preservation compares every logical table, including operations, operation_files,
payloads and C1 tables, to the generated inventory with only the independently
frozen completion/status/generation effects applied. Verify all artifact hashes,
sizes, device/inode, link count and nonsparse allocation remain equal, plus no
owned locks/connections remain. Generation/preservation evidence access is
separately measured and must never be reported as zero-access completion work.

## Required future functional and regression tests

Run under both schemas unless intrinsically a v2-only control:

- Strict five-field admission and detached input/result; exact identities and
  task boundaries including constructor; separate log/score identities sharing
  a fingerprint; both score source kinds and map-independent metadata.
- The complete representation/transition tables, partial/final/status-only
  changes, existing/empty completion, absent/null claimedAt, absent/null/empty
  examinedAt, absent task on claim versus done, zero-reviewer terminal done,
  done with more than 1,000 reviewers, and missing/retired/pending/retiring.
  Explicitly test terminal selected-field restrictions versus untouched malformed
  nonselected terminal reviews; do not claim an audit of skipped reviewers.
- Inline unknown fields, more than 128 unrelated properties, structured/payload
  extensions and null convenience projections remain opaque and exact. Reject
  referenced/nested/non-string checkpoints and oversized/escaped results without
  reading sidecars. Preserve all other reviewers even when they block completion.
- Reviewer counts 127,128,129,255,256,999,1,000,1,001; an unfinished/unsupported
  final-page reviewer; tied/sparse/above-safe-integer ordinals; a selected task
  across page boundaries; foreign/altered/stale/expired cursors; exact page-end
  traversal. Demonstrate overflow and byte-budget rejection with no writes.
- Missing completedAt and missing original status append at exact property tails,
  including empty owners, ties, large ordinals and maximum integer. Present
  ordinals never move. Generation/status-only overflow rejects unchanged; maximum
  generation true no-ops succeed. Projection invalidation occurs only as allowed.
- Same-task and different-task competing completion processes; completion versus
  M2f claim/examined. If a new claim wins the lock it can prevent done; if final
  completion wins, a later claim rejects as already not ready. Assert actual
  acquired-lock order using latches, never a scheduler-specific winner or sleep.
- Before-acquisition changes to state, owner binding, original identity, output,
  selected intent, descriptor/root and synthetic retirement reject appropriately.
  No preliminary observation authorizes a later mutation. Fault public getters
  to ensure they are not an authorization source.
- Transaction begin/body/commit faults; null and Error primaries; secondary
  rollback, database-close, lock/owner-file/owner-handle cleanup failures; exact
  cleanup attempts before subsequent-operation counters. Include cleanup-only
  no-op failure, committed mutation followed by cleanup rejection and exact retry.
- Process death immediately before commit, immediately after native commit, and
  separate forced hot-journal and residual non-hot (cold) journal controls,
  retaining fixtures. Ordinary opens remain nonrecovering;
  explicit recovery preserves old state before commit or committed state after it,
  generation and user_version=12345, and clears the journal through SQLite.
  Include recovery-commit null/Error plus secondary cleanup faults and successful
  later operations; avoid accidentally injecting during stale-lock removal.
- Earlier review/evidence snapshots retain old metadata and pinned readability;
  later snapshots see done and its matching completion. Expired capabilities fail.
  Preserve C1 evidence references and all C1 rows without catalog review events.
- Remove a selected synthetic response outside the operation, then show completion
  still performs no evidence access and makes no verification claim; existing
  analyzer/retirement missing-file behavior remains strict and unchanged.
- Existing v2 APIs/CLI, all-reviewer log cleanup, score retention/retirement and
  SQLite-free import controls remain unchanged. Any CLI control copies tools to
  an isolated canonical synthetic root; cwd alone cannot redirect module roots.

## Future qualification and publication boundary

After independent plan review and separate implementation authorization:

1. Freeze the committed-v2 oracle/provenance before implementation, then run new
   both-schema functional, fault, concurrency, restart and six resource groups.
2. Run affected store/payload/catalog tests, M2f tests, v2 log/score lifecycle,
   M2c/M2d/M2e analyzer/report/snapshot and SQLite-isolation regressions. Exercise
   existing M1/C1/M2a-M2f resource/preservation gates affected by writer changes.
   Reuse an unchanged gate only with explicit dependency/byte correspondence and
   impact reasoning; do not substitute historical passes for affected paths.
3. Run one complete normal-concurrency `npm test`, then `npm run check`, on settled
   executable/test/package bytes. No skips, relaxed assertions, concurrency,
   deadlines, SQLite settings or synthesized combined-suite pass.
4. Validate docs links/anchors, examples, JSON receipts and tracked/new whitespace.
   Retain exact candidate paths, source/test/package before/after hashes, oracle
   export/generator hashes, commands, runtime/platform/SQLite versions, complete
   logs, exits, timestamps, per-call/phase metrics and preservation inventories.
   Keep original failures and historical unqualified receipts unchanged. Do not
   edit settled code after runs without a justified fresh affected qualification.
5. Record a separate M2g qualification document/receipt and leave the candidate
   unstaged for independent review. Plan/implementation approval is not staging,
   commit, push, migration or production authorization. Any failed required gate
   leaves the candidate explicitly unqualified; report all unresolved failures.

Completion of M2g would mean bounded synthetic score-completion semantics and
fixed-workload corpus independence only. It would not establish full M2, general
reviewer-count scalability, production readiness, power-loss assurance or resolve
SQLite timing uncertainty. No work in this plan changes M2f or v2 public contracts.

For this planning task, preserve all existing bytes, HEAD/refs, empty index,
the prompt/analyze_logs.md deletion and both trial worktrees. Hash only protected
source/test/document/package state, excluding production evidence, replay_logs,
caches and dependencies. Create only this document, validate it statically and
leave it unstaged; no implementation, oracle generation, probes or test execution.
