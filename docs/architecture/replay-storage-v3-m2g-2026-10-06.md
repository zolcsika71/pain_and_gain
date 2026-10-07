# Replay storage M2g: fixture-only score-review completion

Date: 2026-10-06. Published baseline:
`bc511703b3ac8eeb2e15d9ff032cc4c496920ea7`.
Status: implemented and bounded-synthetically qualified; candidate remains
unstaged for independent review. This is not implementation-review approval or
publication authorization. Authority is the unchanged
[reviewed plan](replay-storage-v3-m2g-plan-2026-10-06.md),
[ADR 0006 lifecycle contract](../decisions/0006-replay-storage-v3.md#review-and-lifecycle-contracts)
and [score-retention contract](replay-evidence-contract.md#replay-score-source-retention).
The [machine-readable receipt](replay-storage-v3-m2g-run-2026-10-06.json) records
commands, tested hashes, measurements and retained evidence locations.

## Implementation boundary

[completeFixtureScoreReview](../../tools/replay-score-review-fixture.js) accepts
exactly root, schemaVersion, replayId, fingerprint and taskId. It opens only the
existing explicitly marked temporary fixture roots, using schema-1 store or
schema-2 catalog evidence access. The result has bounded checkpoint presence,
exact identities, decimal ordinal/generation strings and three change flags;
it is not a verification receipt. Completion is an explicit caller assertion,
never inferred from analyzer success or artifact access.

The adapter acquires one writer lock and validates the selected identity,
current/retired exclusivity, original/indexed agreement, output ownership,
readiness, selected intents and reviewer binding on that connection. New
readScoreCompletionFacts reuses M2f's fixed point facts and adds the record
property tail. New pageScoreReviewCheckpoints uses the existing review_page
index and exact property joins, without reading reviews.value or unrelated
extensions. BigInt retrieval and ordinal/task keyset continuation preserve ties
and large ordinals. Frozen, writer-bound cursor tokens reject altered, foreign,
stale and expired use. No public reader authorizes a write.

Admitted checkpoints remain absent, null or at most 256 decoded UTF-8 bytes of
inline string. Empty examination blocks completion; empty completion survives
native nullish assignment and prevents the all-reviewer transition. Existing
completion values can require a status-only change. Already-done retries do not
enumerate reviewers or require task ownership; an absent task returns null
reviewOrdinal/checkpoints without creating a review. The explicitly stricter
terminal metadata/admission checks remain: this is not universal invalid-input
parity with v2. Retired scores reject.

Only the selected completedAt property, necessary review-projection invalidation,
record status/original status pair and one generation increment may change.
Missing properties append at their exact tails; existing ordinals never move.
The narrow optional propertyOrdinal on tx.setStatus validates existing-ordinal
agreement and avoids the old zero fallback for M2g's absent-status case. Existing
callers omitting it retain their behavior. Status-only changes do not touch
reviews. Required integer exhaustion rejects; exhausted true no-ops succeed.

Partial, final and status-only changes use one atomic transaction. No-ops use
none. Pre-commit rejection preserves logical state; post-commit cleanup failure
can reject after mutation/generation commit. Tests prove preserved state and a
generation-neutral retry for partial, final and status-only operations. Primary
Error and null values survive secondary rollback/close/lock/owner cleanup errors;
attempt counters are captured before subsequent-operation controls.

No recovery behavior changed. Ordinary opens remain nonrecovering. Both-schema
before/after-commit, residual non-hot and forced hot-journal controls exercise
existing explicit owner-locked recovery and preserve logical state, generation
and user_version=12345. Injections are after real close/rollback/unlink; these
tests do not establish arbitrary OS close-failure or power-loss guarantees.

M2f's public API/limits, v2 helpers/CLI, SQLite-free imports, analyzers, identities,
provenance, C1 tables and evidence references remain unchanged. Tests include
populated C1 references, borrowed snapshots, subsequent operations and missing
selected response files. Completion performs no evidence-payload access and
does not repair or retire artifacts; existing analyzer checks still reject
missing evidence.

## Independent frozen oracle

Before implementation or test changes, the generator exported the necessary
eleven unmodified source/package blobs and their static dependency closure from
BASE to `/tmp/pain-gain-m2g-qualification-3cPi8k/published/`. Each exported file
was checked against its Git blob ID and SHA-256. The generator is retained at
`/tmp/pain-gain-m2g-qualification-3cPi8k/freeze.mjs`; its hash and complete export
inventory are in the receipt and [frozen oracle](../../tests/fixtures/replay-score-review-m2g-oracle.json).

Expectations came from that export's updateScoreReview with explicit synthetic
roots and process-local controlled clocks, not candidate code. The 71 scenarios
include both source kinds, absent/null/empty/non-ISO checkpoints, constructor,
multiple reviewers, terminal ownership, rejected states and three scale
schedules. Unsupported representations are recorded but compared as explicit
v3 admission controls, not falsely claimed as v2 parity. Ordinals/generation and
absent original status are separately specified v3 bookkeeping controls.

Full original and per-call before/after v2 manifests remain under the retained
`frozen/` directory. Functional clocks start at 00:02:00 UTC per scenario; scale
clocks start at 00:01:00 UTC, advancing one second per prescribed call. Both v2
done and complete aliases were exercised. All twelve selected-artifact hashes
and twelve distinct 50 MiB unrelated payload hashes were frozen independently.
The oracle's unchanged SHA-256 is:

`62b31953b016ead09f5428cc222352896f664b6a90f39c4eb89c577dea5f3a21`.

## Final-byte qualification

Environment: native Node v24.19.0, SQLite 3.53.3, macOS arm64, declared local
APFS. No dependency or runtime/build change. Build-ID check retained
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

| Run | Result | Parent elapsed |
| --- | --- | --- |
| Affected store/payload/catalog/M2f/M2g tests | 404/404 | 238.479 s |
| Focused lifecycle/analyzer/isolation regressions | 465/465 | 259.155 s |
| One complete normal-concurrency npm test | 1,001/1,001 | 386.892 s |
| npm run check | Passed | 1.327 s |

There were no failures, skips or cancellations in these qualification runs.
Affected-core tests freshly exercised M1/C1/M2f gates; focused tests freshly
exercised M2a-M2e consumer/resource gates, v2 lifecycle and SQLite isolation.
The full suite was not assembled from filtered runs and used no concurrency
override. The 163 new M2g tests are included in the complete run.

Exact expanded commands, complete stdout/stderr and before/after byte inventories
are retained as final-affected-core, final-focused, final-full and final-check
receipts/logs under `/tmp/pain-gain-m2g-qualification-3cPi8k/`. All four have the
same 102-path source/test/package snapshot, unchanged before and after execution.
Its ordered JSON SHA-256 is
`16f06aca1b161ec6489d606b28e38fc5bf50779c15cee78a0dc9265fbd60a07b`.
The machine-readable receipt embeds this map and hashes every referenced final run log.
Only qualification documentation/receipts were added after these tested bytes
settled. Documentation/receipt validation is separate from runtime qualification.

## Exact resource results

Both the final affected-core run and final full suite independently completed
all six schema/R groups; neither result pools subsets of different runs. Each
group generated fresh 10/1,000-record stores containing 600 MiB of distinct
unrelated payload files, with R=1,128,1,000 reviewers on each selected score.
Generation asserted record/review/property/intent counts, frozen artifacts and
setup generation 52. Preservation checked every logical table and artifact
hash/size/device/inode/link/allocation value against independently allowed effects.

Each complete six-group gate executed exactly 96 calls: 32 mutations and 64
no-ops. Per-store final generation was 54 for R=1 and 55 otherwise. Corresponding
10/1,000-record operations had equal SQL/PRAGMA/statement/row/page/connection/
metadata-open/transaction counters and generation-normalized result hashes.
There were zero corpus scans, temporary query sorts, completion payload accesses
or leaked owned handles. Generation and preservation artifact reads are separate
measured phases, not included in that zero-access claim.

Full-suite phase measurements, including spawn through exit and pipe closure:

| Schema | Reviewers | Generation | Operations | Preservation | Peak RSS across phases |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5.730 s | 0.222 s | 0.710 s | 84.77 MiB |
| 1 | 128 | 5.755 s | 0.285 s | 0.734 s | 91.28 MiB |
| 1 | 1,000 | 8.839 s | 0.821 s | 0.916 s | 182.38 MiB |
| 2 | 1 | 7.986 s | 0.242 s | 0.701 s | 84.45 MiB |
| 2 | 128 | 4.478 s | 0.263 s | 0.725 s | 90.63 MiB |
| 2 | 1,000 | 5.323 s | 0.606 s | 0.909 s | 181.67 MiB |

The affected-core gate's maximum was 182.73 MiB. All workers used the unchanged
192 MiB old-space and 256 MiB RSS ceilings and 60/30/60-second phase deadlines.
The existing bounded TERM/KILL/reap supervisor, output limits and bounded RSS
sampling were reused unchanged. No deadline grace converted a failure to a pass.

Maximum per-operation SQL API count was 64, individual statement count 72 and
returned-row count 1,048. The difference includes batched connection PRAGMAs.
Ceilings remain 128+4P SQL calls and 128+R+P rows for P=floor(R/128)+1,
with constant 128/128 terminal bounds and the stated overflow bounds. The exact
per-store reviewer page/row totals were 2/2, 8/512 and 32/4,000 for R=1,128,1,000.
Read-only validation COMMITs are distinguished from mutating transactions.
Pages remain at most 128 rows/1 MiB, individual rows 64 KiB, fixed facts 16 KiB,
cumulative copied facts/pages 8 MiB and results 4 KiB. Reviewer 1,001 rejects
before mutation; this does not impose a new reviewer storage or M2f limit.

The receipt contains both complete final gate sets, original result generations,
per-call counters, CPU/high-water RSS/parent RSS samples, query-plan paths,
process exits and retained roots. Budgets are measured only for these workloads;
there is no general performance or reviewer-count scalability claim.

## Retained development evidence

All M2g fixtures, including interrupted restart fixtures, remain retained.
Preliminary passes were 137 oracle/admission tests, ten adversarial tests, four
fault/restart tests, eight race/resource tests and six additional coverage/fault
tests. Their before/after hashes and logs remain separate; they are not substitutes
for final-byte qualification. No functional or resource-gate failure was retried
away, no expectation changed and no budget was raised.

One read-only reporting diagnostic failed: an ad hoc summary extractor parsed an
existing M2f array diagnostic as an individual M2g phase object. Its failure facts
remain in receipt-extraction-failure.json, with the complete original input log.
The corrected extractor filters M2g worker records. No source, oracle, fixture,
test result or gate was changed to address that reporting error. Historical M2f
failures and its original unqualified receipt remain unchanged.

## Exact candidate scope and preservation

The implementation/qualification candidate contains exactly these twelve paths:

1. package.json
2. tools/replay-store.js
3. tools/replay-score-review-fixture.js
4. tests/unit/replay-score-review-fixture.test.js
5. tests/fixtures/replay-score-review-m2g-faults.js
6. tests/fixtures/replay-score-review-m2g-helpers.js
7. tests/fixtures/replay-score-review-m2g-oracle.json
8. tests/fixtures/replay-score-review-m2g-racer.js
9. tests/fixtures/replay-score-review-m2g-restart.js
10. tests/fixtures/replay-score-review-m2g-worker.js
11. docs/architecture/replay-storage-v3-m2g-2026-10-06.md
12. docs/architecture/replay-storage-v3-m2g-run-2026-10-06.json

The pre-existing corrected plan is unchanged, SHA-256
`b5d48527a2023a46e2d309375ee66f043b2ab45fdc44f0a53a32078d9cf61f1c`.
It is excluded from this twelve-path candidate; eventual publication needs
explicit scope authorization. The unrelated prompt/analyze_logs.md deletion is
also excluded. Nothing is staged, committed or pushed.

Protected-state comparison covers HEAD/refs/index, existing source/test/package/
document bytes outside the two authorized existing-file edits, the plan and both
trial-worktree registrations, heads, statuses and protected hashes. Production
evidence, replay_logs, caches and dependencies are excluded from hashing. Final
document hashes and validation results are retained with the local qualification
evidence. No production evidence, Arena operation or activation was used.

This qualifies bounded synthetic score completion only. It does not complete M2,
establish production readiness, prove power-loss durability or resolve SQLite
timing uncertainty. Log completion, retirement/deletion, reconciliation, imports,
map administration, caches, historical/scout wiring, production dispatch, broader
v2 integration, C2, M3 and M4 remain excluded.
