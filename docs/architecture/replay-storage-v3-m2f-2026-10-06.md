# Replay storage M2f: fixture-only checkpoint candidate

Date: 2026-10-06. Published baseline:
`b9144735ba28d67ba43fa35ee5cbfb56ac8e4f34`.
Status: implemented and bounded-synthetically qualified on the corrected bytes.
The candidate is unstaged. Authority is the unchanged
[corrected plan](replay-storage-v3-m2f-plan-2026-10-06.md),
[ADR 0006](../decisions/0006-replay-storage-v3.md#review-and-lifecycle-contracts)
and the existing log/score lifecycle contracts.

## Implementation boundary

[updateFixtureReviewCheckpoint](../../tools/replay-review-fixture.js) accepts
exactly the seven required primitive request fields. It lazy-opens the existing
schema-1 store or schema-2 catalog evidence owner in write mode, then performs
one writer callback. The new
[readReviewCheckpoint](../../tools/replay-store.js) reads fixed metadata and
checkpoint projections on that writer's connection. Indexed point and reverse
tail queries never fetch the complete review projection, unrelated property
bodies or payload bytes. Existing row limits apply; copied facts are limited to
16 KiB and native JSON results to 4 KiB.

The adapter revalidates identity, current/retired exclusivity, original fields,
task owner binding, readiness, intents, output ownership and log-map linkage
under the lock. Claims create a review only after proven absence. Examination
updates only `/examinedAt`, preserving its existing ordinal or appending exactly
after the property tail. Original extensions and other reviewers remain intact.
BigInt arithmetic preserves ordinals and generations through SQLite's maximum
signed integer. No-op calls allocate nothing and start no write transaction.
Changed calls commit once and increment generation once.

The shared core now preserves primary exceptions, including null, across
rollback, connection close and lock cleanup. Both lock names receive independent
cleanup attempts. A committed checkpoint is not rolled back if subsequent
cleanup fails; the fault receipt establishes this boundary and a generation-
neutral retry with the original timestamp. Injections occur after real close,
rollback or unlink; arbitrary OS failure and power loss are not qualified.

No v2 lifecycle implementation, CLI dispatch, schema, indexes, dependency,
completion policy or payload format changed. The necessary explicit fixture
recovery correction is described separately below. Claims certify
no artifact availability or integrity. Examination is the caller's explicit
assertion; it is never inferred from analysis or process success. Tests remove a
synthetic selected artifact, successfully claim its metadata without file access,
then establish that the existing analyzer still rejects unavailable evidence.

## Independent oracle and preservation

Before candidate implementation, the generator exported unmodified JavaScript
tooling/fixture inputs and package metadata from BASE, verifying every Git blob
hash. The retained export, generator and full original/before/after v2 manifests
are under `/tmp/pain-gain-m2f.zt3u1S/oracle-final/`; the generator is
`/tmp/pain-gain-m2f.zt3u1S/freeze.mjs`. The frozen
[oracle](../../tests/fixtures/replay-review-m2f-oracle.json) records their hashes,
48 deterministic scenarios with two calls each, the 24-call scale schedule,
artifact hashes/sizes and original logical manifest hashes. It remains identical
to the pre-implementation frozen file, SHA-256
`f7fd90035db95c187c2d1d4eb2332901938418a666ae3509f7347fbcd2b53ad1`.

Expectations came from committed `updateReview`/`updateScoreReview` using a
process-local controlled Date, never from the candidate. Comparison concerns
logical checkpoint effects, not v2's redundant manifest serialization. Native
empty-string/null/missing behavior, completed timestamps and `constructor`
ownership remain represented. Unsupported checkpoint representations are tested
separately, outside admitted parity. Frozen score fingerprints are:

- game metadata: `dc2285ad6874bf50f4b85d530fbc14b727d747cdfcd87b12abfa47fd7c1b1999`;
- replay frames: `daf3f3ef20551c4674c2558014606c007779cf7e973fa2aec594b9afbac2032f`.

The corrected plan is unchanged, SHA-256
`529fe019985cac84807d22004ff90b376231d3650ee30b8c27016d44b72f2fad`.
It remains an additional untracked publication dependency, not an implied
authorization to stage or commit it. Initial protected-state receipts cover
HEAD, index, source/tool/test/document bytes and both trial worktrees. Production
evidence, replay_logs, caches and dependencies are excluded from preservation
hashing; production evidence was not opened. Runtime/build bytes and the unrelated
`prompt/analyze_logs.md` deletion are preserved.

## Retained development history

All development fixtures and task logs remain retained; no failed resource gate
was retried for a pass. Logs and command receipts live under
`/tmp/pain-gain-m2f.zt3u1S/`.

1. The first oracle export failed with subprocess `ENOBUFS` while exporting an
   unrelated large committed report. The partial `published/` export remains.
   The export was narrowed to needed JavaScript/package inputs; no resource-gate
   limit or candidate expectation was changed.
2. The second oracle generator used a synthetic manifest at the wrong directory
   level. Committed v2 reads `<root>/replay_logs/manifest.json`; the unsuccessful
   `frozen/` workspace and generator snapshot remain. The corrected generator
   completed before implementation and its oracle has never been revised.
3. Initial development tests passed 101/101. Both preliminary resource gates and
   four fault/race controls passed. Parent RSS monitoring and further controls
   were subsequently added, so those preliminary passes are not final-byte
   qualification.
4. The first adversarial run passed two tests and failed four. Two failures were
   an extension fixture that omitted the already-published output from its new
   publication intent. The corrected fixture uses the selected evidence-only log;
   both schemas now pass without changing publication requirements.
5. The other two failures expose a real existing recovery gap. SIGKILL just
   before checkpoint commit leaves a 33,344-byte journal with a zeroed header.
   An explicit `recover:true` open preserves logical database state but leaves
   that non-hot journal in place. A following ordinary checkpoint open rejects
   `RECOVERY_REQUIRED`. The failed schema fixtures include
   `pain-gain-store-v3-fixture-cn0zkP` and `pain-gain-store-v3-fixture-yaVBaq`
   beneath the canonical OS temporary directory. These are retained untouched.
   Independent copied-database diagnostics confirm that native begin/rollback,
   begin/commit and a same-value UPDATE do not remove the journal. No journal was
   manually deleted and no recovery policy was changed to force a passing test.
6. A separate cleanup regression against the isolated BASE export throws
   `secondary-rollback` instead of the primary null. The same regression passes
   against the candidate. Both complete logs and synthetic fixtures are retained.

At that checkpoint the restart test remained failing, not skipped or rewritten
around the cold-journal schedule. Its before-commit failure prevented subsequent
after-commit/hot-journal substeps from running. Existing hot-journal passes did
not qualify the failed cold-journal restart. The original candidate was explicitly
left unqualified and permission for a recovery correction was requested.

## Restart-recovery correction

The renewed implementation/qualification request includes the planned restart
and subsequent-operation contract. The necessary expansion was reported before
editing: correct the existing explicit, locked fixture recovery path, without
adding a public adapter option or implicit recovery. After checked writable
connection validation, a remaining nonempty DELETE journal now causes a native
transaction containing a same-value `PRAGMA user_version` header write. SQLite
finishes the journal lifecycle; no journal is manually deleted. The signed
32-bit header value is retained, no logical table changes and no generation
increment occur. Primary recovery errors, including null, survive rollback,
database-close and lock-release failures. Ordinary opens remain nonrecovering.

The original both-schema restart assertions are unchanged. Added assertions
retain `user_version=12345` and require the journal to be absent after explicit
recovery. Before-commit, after-commit and forced hot-journal schedules now all
execute. The targeted restart run passed 2/2. Recovery fault controls also prove
null/Error preservation through all cleanup attempts, unchanged logical state
and successful subsequent checkpoints.

The first new recovery fault run failed 0/2: the injection fired while removing
the stale crash lock, before entering the recovery transaction. Its log and
fixtures remain retained. The corrected injection targets cleanup only after
the recovery transaction has begun and rolled back; the corrected run passed
2/2. No production behavior, oracle expectation or resource limit was altered.
Follow-up captures and logs are under `/tmp/pain-gain-m2f-followup.gjQNLG/`.

## Qualification evidence

The immutable [original run receipt](replay-storage-v3-m2f-run-2026-10-06.json) records commands,
runtime versions, complete-log hashes, before/after executable/test/package
hashes, final candidate scope and phase receipts. Native runtime is Node 24.19.0,
SQLite 3.53.3 on darwin/arm64. No platform shim or relaxed assertion, concurrency,
deadline, heap, RSS or SQLite busy timeout is used.

Before the recovery correction, the affected-core run passed 166/166 in 59.052 seconds with unchanged tested
bytes, freshly exercising M1/C1/M2a/M2b gates. The focused checkpoint/lifecycle/
analyzer run passed 530 of 532 tests in 292.970 seconds; both failures are the
cold-journal restart, with no skips or cancellations. M2c/M2d/M2e gates and v2
lifecycle/SQLite-isolation regressions passed in that same run. One complete
normal-concurrency `npm test` passed 836 of 838 tests in 313.609 seconds, with
the same two failures and no skips or cancellations. `npm run check` passed in
1.297 seconds. All four commands have matching before/after source, test,
oracle and package hashes for those original candidate bytes. Those historical
hashes are not claimed to match the corrected executable/tests delivered now.
Only documentation and aggregate receipts were finalized after the original
runs. The failed restart left that original candidate unqualified.

The exact paired scale recipe creates 10 and 1,000 operational records per
schema, with the twelve frozen selected files plus twelve distinct, nonsparse
50 MiB extension files per store. Each selected record starts with reviewer
ordinal 7 and the prescribed note. Each operation worker performs 48 calls under
a 192 MiB heap cap. Corresponding SQL/row counts and generation-normalized result
hashes must match across sizes. Each store performs twelve mutations and twelve
no-ops, advancing its setup generation by twelve.

Generation, operations and preservation are separate 60/30/60-second phases.
The supervisor measures spawn through exit and pipe closure, samples RSS in the
parent and checks worker high-water RSS against 256 MiB, bounds each output
stream to 1 MiB and receipts to 512 KiB, and retains process/phase logs. TERM,
two-second KILL escalation and three-second reap bounds do not extend a passing
deadline. SQL, PRAGMA calls, rows, connections, metadata opens, transactions,
elapsed time and CPU/RSS are reported separately. Query-plan checks require
indexed selected-key/tail access, no corpus scans and no temporary sorting.
File instrumentation rejects selected or unrelated evidence access.

The original focused run measured the following complete paired phases:

| Schema | Generation | 48 operations | Preservation | Peak worker RSS |
| --- | --- | --- | --- | --- |
| 1 | 19.648 s | 1.787 s | 0.695 s | 84.97 MiB |
| 2 | 19.559 s | 1.825 s | 0.707 s | 84.52 MiB |

Across 48 calls, schema 1 issued 1,224 non-PRAGMA SQL calls and returned 1,804
rows; schema 2 issued 1,320 and returned 1,900. Each call used 14 PRAGMA calls,
three connections (including the runtime capability check) and nine metadata
opens. All corresponding call counts and normalized hashes matched exactly.
Every checkpoint call had zero evidence opens/read bytes/writes and zero corpus
scans. Counts describe adapter-issued calls; test-only EXPLAIN probes are retained
separately in the phase directory. Their overhead remains inside the operation
deadline and memory measurement. Per-call values, CPU measurements, original
generation strings and parent RSS samples are retained in the receipt.

Preservation compares every logical database table, including C1 tables and
publication intents, against a baseline with only the twelve prescribed review
changes and generation increments applied. Full streamed file hashes, sizes,
device/inode and allocation checks preserve every artifact. Physical SQLite
page layout is not used as evidence equality. Construction and preservation
hashing are separate from the zero-payload-access checkpoint measurements.

## Fresh corrected-byte qualification

The separate [follow-up receipt](replay-storage-v3-m2f-followup-run-2026-10-06.json)
retains the original receipt's hash, the new starting-state capture and a fresh
verification of all 29 unmodified exported blobs. The oracle, its generator,
the corrected plan and original receipt remain byte-identical. Protection checks
use both the original pre-implementation capture and this follow-up's 407-file
main-worktree capture; the trial captures cover 325 and 332 files respectively.
Production evidence remains excluded and unaccessed.

Fresh affected-core validation passed 166/166 in 58.760 seconds. Fresh focused
checkpoint/lifecycle/analyzer validation passed 532/532 in 287.800 seconds, with
no skipped or cancelled tests. All executable/test/package hashes were unchanged
before and after each command and match the corrected candidate. These are
complete new runs after the code/test correction, not passing subsets of the
historical failures. One fresh complete normal-concurrency `npm test` passed
838/838 in 311.668 seconds, without skips or cancellations. The subsequent
`npm run check` passed in 1.322 seconds; runtime build ID remains
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.
All four commands share identical source/test/package snapshots. Only the
qualification documentation and aggregate receipt were finalized afterward;
final link/anchor, JSON, syntax, whitespace and byte-correspondence validation
is retained at `/tmp/pain-gain-m2f-followup.gjQNLG/final-validation.json`.

The identified fresh focused paired resource gates measured:

| Schema | Generation | 48 operations | Preservation | Peak worker RSS |
| --- | --- | --- | --- | --- |
| 1 | 18.702 s | 1.827 s | 0.709 s | 84.31 MiB |
| 2 | 18.867 s | 1.955 s | 0.710 s | 85.66 MiB |

SQL/row totals remained 1,224/1,804 for schema 1 and 1,320/1,900 for schema 2;
every corresponding 10/1,000-record call matched exactly. The maximum complete
per-call SQL count, including PRAGMAs, was 54/56; maximum returned rows were
46/48. Each call still used 14 PRAGMA API calls, three connections and nine
metadata opens. The two connection-setting calls each contain five PRAGMAs:
14 API calls represent 22 individual PRAGMA statements; counting those separately
would raise the maximum SQL statement count to 62/64, still below 128. Reported
SQL/PRAGMA counters count API calls, not SQLite-internal I/O.
Zero corpus scans and zero checkpoint evidence opens/read bytes/writes were
observed for all 96 calls across schemas. Each store committed twelve mutations,
performed twelve transaction-free no-ops and advanced generation from 52 to 64.
The unchanged 192 MiB heap, 256 MiB RSS, 60/30/60-second phase and bounded-output
limits passed. The full-suite phase receipts are kept separately, not pooled into
this table. CPU measurements, parent RSS samples, retained roots, full per-call
counts, query plans and streamed preservation inventories remain reproducible
through the receipt and phase-directory references.

Fault-worker receipts include counters from subsequent-operation controls;
the tests separately assert exact cleanup-attempt counts at each injected failure
boundary before those controls. Injections occur after native rollback/close/
unlink and do not establish arbitrary OS failure semantics. All original failed
restart fixtures and receipts remain untouched; no gate was retried merely for
a pass and no assertion, limit or frozen expectation was weakened.

## Candidate scope and limits

The original 16-path candidate list is in the original receipt: README, architecture index,
project layout, this record, its JSON receipt, package syntax registration,
the adapter and shared store, the new unit suite and seven M2f fixture files.
The pre-existing corrected plan and unrelated prompt deletion are additional,
preserved worktree state. No staging, commit, push, ref changes, production
evidence access, Arena operation or production activation occurred.

The corrected candidate has 18 paths: the original 16, the M1 recovery-contract
documentation update and the separate follow-up receipt. Only the shared store,
two M2f test files, the M1/M2f records and the new receipt changed during this
follow-up. The exact lists and final-byte hashes are in the follow-up receipt.

The intended claim is bounded synthetic
checkpoint qualification and fixed-workload corpus independence only. General
analyzer memory, arbitrary review-body handling, completion/retirement,
reconciliation, imports, caches, broader v2 integration, full M2, C2, M3, M4,
production readiness, power-loss durability and SQLite timing uncertainty remain
outside this task's qualified scope.
