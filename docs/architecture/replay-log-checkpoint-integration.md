# Synthetic selected-log and selected-score command integration

Date: 2026-10-13. Implemented and tested with retained, generated fixtures only.
Production remains managed v2. This is a consumer seam, not authority selection,
migration, M2h qualification or permission to mutate a backup/rehearsal store.

The separately authorized [synthetic analysis command route](replay-analysis.md#explicit-synthetic-sqlite-route)
reuses these fixture access checks but never invokes claim/examined operations.
Running analysis does not advance review lifecycle state.

## Explicit interface

Use resident Node 24.19+ within major 24 on the existing local macOS filesystem
contract; validation here used **Node 24.19.0**.

```text
node tools/replay-logs.js --synthetic-sqlite <fixture-root> claim <replay-id> <fingerprint> <task-id>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> examined <replay-id> <fingerprint> <task-id>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> score-claim <replay-id> <fingerprint> <task-id>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> score-examined <replay-id> <fingerprint> <task-id>
```

The flag must be first. The checkpoint APIs admit only claim/examined for the
explicitly selected log or score collection. The separately bounded
[lifecycle connection](#selected-synthetic-lifecycle) below adds completion,
verification and exact retirement; [imports](replay-synthetic-imports.md) have
their own route. There is no fallback to v2 or automatic retry. Score command names retain their
`score-` prefix; unprefixed names select logs, never infer the collection from data.
The caller must already have a schema-1 fixture store. This command never creates
one. All ordinary production commands, `updateReview()` and `updateScoreReview()`
remain unchanged; an ordinary importer-module import does not load SQLite.

[updateSyntheticLogReview and updateSyntheticScoreReview](../../tools/replay-log-review-fixture.js) each accept exactly
`{synthetic:true, root, action, replayId, fingerprint, taskId}` as own data
properties of an ordinary/null-prototype object. Accessors, inherited options,
unknown keys, coercion and identity inference are rejected. Primitive inputs are
copied before asynchronous work. Replay IDs/fingerprints are exact lowercase
24/64-hex; task IDs retain the existing 1–200-character ASCII rule.
Both APIs use unprefixed `action: 'claim'|'examined'`; the CLI translates only the
two exact score command names. Their collection is fixed internally, not a public
option. The shared private adapter reuses the original fixture access checks.

The root must be an existing canonical, direct child of the canonical temporary
directory with prefix `pain-gain-store-v3-fixture-`. Production, cache, backup,
trial and rehearsal paths cannot satisfy that contract. Existing fixture marker,
descriptor, store directories, database and present journal/WAL/SHM sidecars
receive metadata-only residency/path checks before store access. Control/database
files must be independent regular files, not aliases, symlinks or hardlinks.
The normal owner lock's hardlink publication is exempt from the hardlink rule.
The descriptor is read with a 16 KiB cap and binds schema 1, payload version 1,
store UUID and exact database path; rehearsal descriptors are rejected.

Checks use the existing residency mechanism; metadata-check/open races remain.
This is not an atomic OS-level no-hydration guarantee or protection against
uncooperative concurrent file replacement. No real placeholders were opened in
tests; dataless cases used mocked metadata and intercepted opens.

## Reused checkpoint semantics

The command delegates to
[updateFixtureReviewCheckpoint](../../tools/replay-review-fixture.js), not new SQL
or whole-manifest reconstruction. Its
[existing contract](replay-storage-v3-m2f-plan-2026-10-06.md) and
[ADR 0006](../decisions/0006-replay-storage-v3.md#review-and-lifecycle-contracts)
remain controlling.

Inside the existing writer lock, the seam checks exact selected identity,
current/retired exclusivity, original/index projections, claim eligibility,
absence of a selected active intent, validated map/active replay linkage,
owned ready output metadata where required, and review owner binding. Conflicting
**known** log/replay build IDs now reject under that lock. SQL NULL remains
unknown: source null and omission remain distinct properties and neither is
filled from a known association.

Score checkpoints reuse the unchanged score-specific seam: exact collection/
replay/fingerprint and original/index agreement, current claim status, no selected
intent, matching unique output owner/path/hash projections, and a ready output
reservation. Output names must satisfy the existing identity-qualified score
filename predicate (short/full fingerprint or its admitted collision suffix).
Map linkage is not required for scores. Missing/retired selections, pending/done/
retiring states, forged owners, non-ready reservations, cross-kind path conflicts
and mismatched original fields reject without repair. Log and score fingerprints
may be identical without sharing reviews. Score identities remain their own;
known replay/log identities never fill omitted score build fields. Embedded nulls
and unknown fields remain unchanged. No winner/result interpretation is performed.

A new claim appends one review with `claimedAt:now`, `examinedAt:null`,
`completedAt:null`. Repeated claims do not repair existing reviews. Examination
requires that task's claim and changes only absent/null `examinedAt`, preserving
its ordinal or appending it. Existing strings, including empty strings, are
generation-neutral no-ops. Owners, unknown properties, unrelated reviewers,
records and payload references are retained. Reviews stay active through these
checkpoint APIs; completion uses the separate lifecycle route below. There is no
release command. `examined` is an explicit caller assertion, not proof
that this command performed analysis.

The existing bounded checkpoint result is printed, **not** the legacy CLI's
complete `reviews` object: selected IDs/action, `changed`, status, exact decimal
generation/review ordinal, and three presence-aware checkpoints. This explicit
mode has a distinct bounded output contract. Facts are capped at 16 KiB; result
at 4 KiB; admitted checkpoint strings at 256 decoded UTF-8 bytes. Unknown review
bodies are not read to produce the result. Properties remain authoritative;
examination may invalidate the convenience `reviews.value` projection to NULL.

Claims validate operational metadata, **not** physical artifact availability,
body hashes, diagnostic completeness, runtime ownership or alignment. Evidence-only
log metadata is admitted by the existing seam; analyzers retain their stricter
payload-integrity/access gates. There is no hidden artifact verification scan.
This includes score claims: ready reservation metadata does not establish that a
body is available or verified. Review updates never open score bodies/maps or
hydrate unknown review payloads; existing downstream access contracts remain.

## Transactions and failures

Decision and mutation share the existing lock. An actual change uses one existing
transaction and advances generation once. No-op uses no mutation transaction.
Unsupported state, ownership/identity conflicts and pre-commit faults reject
without repair or partial logical mutation. No caller timestamp override exists.

The completed log integration corrected suppressed cleanup errors in the reused
path. Those unchanged corrections retain original Error/system codes and attach separate
`cleanupFailures` for runtime/connection/read/writer database close and checkpoint
owner close. A non-Error primary combined with cleanup failure is an AggregateError
whose cause retains the original value. The explicit CLI reports that cause and
cleanup codes separately; its failure exit is nonzero. Ordinary v2 error output
is unchanged. Other storage/lifecycle cleanup paths are not qualified by this task.

A cleanup-only failure remains a failure, even when COMMIT already succeeded.
Do not infer rollback from a failed command exit: a separately requested repeat
rechecks state and can reconcile to a no-op. There is no retry loop or cleanup
command in this integration. Existing lock/SQLite limits are unchanged.

## Verification and limits

[Log tests](../../tests/unit/replay-log-review-command.test.js): **58 passing**
checks cover CLI/API gating, reconstruction, unknown/null/absent preservation,
eligibility and ownership conflicts, repeated/concurrent calls, atomic faults,
combined operation/cleanup errors, dataless controls and v2 semantics on independent
synthetic input. All generated fixtures and intermediate failed runs are retained.
No broad, large-fixture, historical-Git or database-backed qualification suite ran.

[Score tests](../../tests/unit/replay-score-review-command.test.js): **44 passing**
checks; combined with the accepted log suite, **102 checks passed** on Node
24.19.0. Coverage includes both operations, exact review reconstruction, mapless/
omitted identities, collection separation, unknown properties and unrelated reviews,
eligibility/output/owner conflicts, repeated/concurrent calls, claim and examined
rollback, combined errors and bounded CLI error output. Shared core/checkpoint APIs
are byte-identical to the completed log task; no schema or capacity changes.
The log CLI exclusion test now rejects `score-done` and separately proves that a
valid `score-claim` with only a log present rejects `MISSING_RECORD`, with no fallback.
This explicit feature delta does not change accepted log command semantics.

WebStorm call tracing confirms delegation to the checkpoint seam. Changed-JavaScript
inspection reported no errors; retained warnings include intentional cleanup throws,
Node/dynamic-row type resolution, existing dynamic SQL/static-model limitations,
and missing dialect mappings for new test SQL. No warnings were suppressed or IDE
configuration changed. These inspections do not qualify production storage.

Original log commands, exit codes, before/after hashes, IDE results and preservation limits:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/selected-log-checkpoints-20261013-2qE8nQ/report.json`.
Score extension, retained intermediate failures, current hashes and self-review:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/selected-score-checkpoints-20261013-P471Ey/report.json`.
An initial fixture helper passed an async iterator to the synchronous hash utility;
that harness failure is retained, not counted as a missing-route reproduction.
The corrected before-run demonstrated rejected score dispatch. All resulting
fixtures remain retained. IDE warnings include missing dialect mappings for new
test SQL, Node/dynamic types, duplicate test fragments and intentional cleanup
throws; no inspection was disabled and no IDE setting changed.
The [migration plan](replay-production-sqlite-migration-plan-2026-10-11.md) retains
all other consumer, authority-selection, rollback and qualification gates.

## Selected synthetic lifecycle

The [lifecycle dispatcher](../../tools/replay-lifecycle-command-fixture.js) uses
the same explicit schema-1 fixture access gate. These are additional synthetic
commands; ordinary production dispatch remains managed v2:

```text
node tools/replay-logs.js --synthetic-sqlite <fixture-root> done <replay-id> <fingerprint> <task-id>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> complete <replay-id> <fingerprint> <task-id>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> reconcile <replay-id> <fingerprint>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> score-done <replay-id> <fingerprint> <task-id>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> score-verify <replay-id> <fingerprint>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> score-cleanup <replay-id> <fingerprint>
```

`reconcile` resumes only an exact already-done log. It is not corpus-wide
`reconcileCleanup`, does not migrate waiting records, and never retires scores.
No release operation is introduced: the ordinary command surface has none.

Completion reuses [the existing completion policy](../../tools/replay-score-review-fixture.js)
and bounded checkpoint queries, now collection-qualified for logs too. Under the
writer lock it checks identity, original projections, owner binding, ready output
metadata and all reviewer checkpoints. A task must have examined its selection;
other active owners prevent done. Unknown review properties/ordinals survive.
Repeated completion with no change is generation-neutral. Completion remains a
caller assertion of actual examination, not an analyzer side effect.

Log completion and retirement are separate durable operations, as in v2. If
retirement fails after completion, the completed review and done status remain;
exact `reconcile`, or another `done` on that still-current done log, can resume.
Score done retains response bytes; only exact score-cleanup authorizes retirement.
Score verification uses pinned score readers plus the existing body, identity and
summary predicates. Invalid transport summaries are faithfully checked, not
promoted to valid analytical evidence. Its existing reader bounds remain (4 MiB
per raw score body, 16 MiB total selected raw bytes); larger bodies reject.

[Retirement](../../tools/replay-store-retirement.js) reuses the existing writer
lock, output reservations, bounded ownership inventory, deletion intent and
per-file checkpoints. Log and score identities remain separate. Log output
filenames must belong to the selected replay; all remaining originals and
sidecars must match exact owner/path/hash/length before any deletion. Symlinks,
hardlinks, foreign intents, incomplete reviews and corrupt references reject.
The log rule permits an already-absent original JSONL and journals that absence;
missing sidecars before intent reject. Scores require their original before
retiring; either collection can resume already-authorized deletions. No repair
or adoption of unowned files occurs. Maps and associations are retained.

Final log deletion, reviewer removal, replay-qualified retired index insertion
and history append share one transaction. This route supports inline ordered
`retiredFingerprints` up to 128 entries, checked against the retired index before
deletion. Larger or externally represented history is an explicit unresolved
capability, not truncated or silently migrated. Existing score tombstone semantics
remain unchanged. Both use at most 128 files / 128 MiB, 1,000 reviewers,
8 MiB cumulative metadata and the existing SQL/row budgets. No schema changes or
automatic upgrades are introduced by this integration.

Operation errors retain their system codes and attach descriptor/database cleanup
failures separately. File residency checks precede retirement reads; existing
metadata-check/open races and uncooperative replacement limitations remain.
Tests delete only their newly generated selected payloads. Original cache fixtures,
interruption artifacts, failure reports and unrelated generated records remain.

Focused validation, IDE findings and the final self-review are retained at
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-lifecycle-cache-20261013-h09uQD/report.json`.
This does not renew M2h: the lost-evidence disclosure and fresh qualification
requirements remain. The bounded corpus list below adds reconciliation only for
its stated synthetic subset. Scan/watch, legacy repair and production
authority/rollback remain separate gaps in the migration plan.

## Bounded synthetic list and reconciliation

```text
node tools/replay-logs.js --synthetic-sqlite <fixture-root> list
```

[listSyntheticLogs](../../tools/replay-lifecycle-command-fixture.js) uses the same
explicit fixture guard; [reconcileLogList](../../tools/replay-store-list.js) is a
writer capability, not a read-only list API. Ordinary production dispatch is
unchanged. Like v2 `reconcileCleanup`, it first migrates all supported waiting
logs to claim, then retires done logs in original ordinal order, then lists the
survivors. Scores, maps and shared replay associations are not retired by list.
CLI output has the same per-line fields as v2; the API additionally returns
migrated/retired counts and the final generation. Nothing is emitted before the
entire supported pass succeeds; there is no successful truncated result.

One writer lock covers metadata preflight, status migration, retirement and
result acceptance. Existing generation-qualified keyset pages preserve ordering;
no cursor crosses a mutation. Waiting statuses update together in one transaction,
preserving property ordinals and other original metadata. Done logs go through
the existing retirement API, which revalidates reviews, ownership, reservations,
history and exact file bytes under the same lock. Missing done-log originals are
permitted; missing sidecars before an intent, changed files or incomplete owners
reject. Live claim/waiting files are not opened merely to list them: metadata
listing neither verifies their availability nor authorizes analysis.

Supported metadata has inline displayed fields and inline review properties,
an empty reviews layout marker with separate ordered owners, and inline diagnostic
arrays or a ready leaf `/otherEntries` reference with a finite item count. External
display/review fields, segmented diagnostic counts, pending logs and inconsistent
projections reject explicitly. Unknown metadata is left intact, not normalized.
Diagnostic count reporting is metadata-only, not a new body-integrity claim.

Limits, fixed before evaluation, are exported as `LIST_LIMITS`. API `limits`
may only reduce them; options/accessors are checked and copied before async work:

| Bound | Maximum |
| --- | --- |
| Logs / total reviews | 512 / 4,096 |
| Metadata page | 128 rows; existing core 8 MiB page and 64 KiB row bounds |
| Cumulative preflight/result metadata | 65,536 rows / 16 MiB |
| Planned retirement files / bytes | 1,024 / 64 MiB across all done logs |
| Retirement body reads | At most two passes, 128 MiB; existing 64 KiB buffers |
| SQL calls / cooperative locked-work deadline | 100,000 / 60 seconds |

The existing per-record retirement limits still apply, including 128 files,
1,000 reviewers, 8 MiB retirement metadata and 128 inline history entries.
Listing retains a bounded metadata plan/report, never the manifest or diagnostic
bodies. These are application bounds, not hard heap/RSS or native SQLite-I/O
guarantees. Lock acquisition and native calls retain their existing behavior;
the cooperative deadline cannot preempt a native call.

Known preflight limit failures occur before mutations. Later I/O/deadline or
eligibility failures may leave committed waiting migration or earlier retirements,
as v2 can. Every destructive file step remains journaled. Retrying explicit list
re-enumerates the current corpus and resumes remaining intents; no extra corpus
journal, rollback of deleted evidence, automatic retry or general cleanup is
introduced. Completed no-op lists are generation-neutral. Concurrent cooperating
writers serialize; same-handle interleaving invalidates acceptance. Uncooperative
writers and the existing residency-check/open race are not made safe atomically.

Tests use only newly generated retained fixtures, including v2 parity, pagination,
budget rejection, review corruption, missing files, interruption and repeated
recovery. Recovery observations and test reports are retained externally; only
test-owned payloads are deleted. Validation and preservation receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-list-20261013-vwsqmA/report.json`.
Scan/watch, maps/other CLI routing, standalone legacy repair, authority selection,
lossless rollback, production cutover and fresh qualification remain out of scope.
