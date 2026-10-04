# Replay storage v3 M1: isolated synthetic core

This record tracks qualification of the synthetic core specified by
[ADR 0006](../decisions/0006-replay-storage-v3.md#first-isolated-implementation-milestone-m1).
It is not importer/reader integration, storage migration, or permission to use
the core with real evidence. The deployed compact v2 manifest remains unchanged.

Current status, 2026-10-04: F1–F3 corrections passed focused review. Their M1-only
commit candidate is separated from the pending C1 adapter and schema-2 tests;
the latter belong to the subsequent catalog candidate. Qualification counts
below are historical combined-working-tree runs unless explicitly labeled
isolated-candidate results. Statements that later audit findings were open or
that a correction awaited review describe the state at that earlier checkpoint,
not the current finding status. All F1–F5 corrections have now passed focused
review. No staging, publication, production integration or migration follows
automatically from this status.

## Implementation boundaries

[replay-store.js](../../tools/replay-store.js) implements STRICT SQLite tables,
explicit fixture creation/open, bounded original properties/reviews, indexed
lookups, generation-bound keyset pages, writer transactions, publication intents
and callback-scoped read snapshots. Every open mode requires the fixture marker
and a canonical direct child of the resolved OS temporary directory with the
`pain-gain-store-v3-fixture-` prefix. There is no production/default-root path.
Creation requires an empty root and a `local-apfs` declaration. Paths, descriptors,
versions, output ownership, indexed/original projections and dependency references
fail closed. Normal open never creates a missing database.

Explicit restart recovery uses `openStore({root, mode: 'write', recover: true})`.
The same opt-in reaches the shared core through C1's `openCatalog`. Ordinary
opens (including write-capable handles without the opt-in) remain read-only
validation and report `RECOVERY_REQUIRED` for a nonempty journal. `recover` must
be boolean; true in read mode is rejected. Recovery acquires the existing owner
lock, rechecks the canonical temporary root and descriptor/store identity after
acquisition, then opens a checked writable SQLite connection. Native rollback,
connection-setting verification and database identity/version validation occur
inside that lock; the connection closes before lock release and handle return.
SQLite may roll back before database metadata can be read; identity rejection
never returns a usable handle. There is no migration, status normalization,
file-intent execution or generation increment for recovery itself. Subsequent
operations reacquire/revalidate normally; open does not reserve the lock for the
returned handle. This remains a synthetic-root interface, not production repair.

Cross-kind ownership uses exact indexed path checks across maps, outputs and
payloads under the writer lock, at reservation and publication. Pending rows
reserve ownership even when no final file exists. Evidence-only prepublication
also reserves its deterministic payload path within the writer callback before
awaiting source chunks, until that callback ends; map/output reservations cannot
adopt it before the record transaction. Final reference registration rechecks
ownership. Exact same-owner publication/intent retries remain supported, but
identical bytes do not authorize sharing one path across kinds or owners.

[replay-store-payloads.js](../../tools/replay-store-payloads.js) provides streaming
JSON encoding, diagnostic envelopes, immutable owner-qualified payload paths,
bounded JSON-pointer selection (including `*` array/object children), verified
UTF-8 parsing, overflow ranges and positional reads from pinned handles. A large
selected value is `{kind: 'stream', ref, start, end}`, not missing/truncated/zero.
Copy it through `payloadChunks(view, ref, start, end)` inside the callback.
`streamOriginalValue(view, ref, sink)` verifies then copies exact saved bytes.

### Concrete fixture interface

The ADR's store/writer methods are implemented without a legacy dispatcher or
exporter. Entity input is `{kind, key, ordinal, value}`: record keys are the
canonical `[collection, replayId, fingerprint]` tuple returned by `recordKey`;
`recordOwner` returns its property/payload owner. `value` contains original
properties, while checked projections support operations. Property input is
`{owner, pointer, ordinal, value}` or an explicit owned `payloadRef` instead of
`value`. Oversized inline input fails with `RESOURCE_LIMIT`; callers publish the
streamed original value and pass its reference instead. It is never silently
coerced, omitted or truncated. Fixture inputs are validated JSON values, not
Arena responses. Sparse arrays, non-JSON objects and cycles fail.

`putReview` preserves exact task IDs and original fields as paginated properties.
Direct property updates invalidate the inline review projection in the same
transaction. Lookup reconstructs current small top-level reviews from at most
129 property rows (128 plus one overflow sentinel), within the 64 KiB row/value
budgets; it does not persist a rebuilt cache. A large/overflow review returns
`kind: 'structured'` and its owner, which is reconstructed from property pages
and pinned references. `payloadRefs` supplies explicitly spilled unknown review
fields; it does not infer completion. Optional collections retain a separate
presence flag and original ordinal, including absent versus present-empty.

`appendIntent` accepts an operation ID, exact record key, phase and bounded
file entries with ordinal/path/hash/bytes. Payload entries additionally name
owner/pointer/role/parentPointer. Parent rows precede children. `publishPayload`
and `publishOutput` consume at most 64 KiB byte chunks and verify expected size
and SHA-256. Reserved payload publication also checks role and derived destination
path against the saved reservation before any file I/O or checkpoint changes;
the evidence-only exception cannot bypass an existing reservation. Final readiness
requires verified intent checkpoints. Finalization independently resolves the
record's owned output reservation: file-backed logs and scores require its ready
state, matching record path/hash projections, and an exact path/hash/byte-length
verified checkpoint in the specified publication intent. An empty or partial
intent cannot stand in for that output. These bounded metadata checks precede
readiness writes; output-free evidence-only logs remain supported. Evidence-only
prepublication creates no JSONL and can only be claimed with a reference verified
by the same writer callback. Targeted retries verify existing exact bytes;
they also complete directory fsync before committing readiness, including a
retry after the exclusive link succeeded but its directory flush failed.
Changed or unowned files cannot be adopted. Failed operation temporaries are
retained, not garbage-collected.

Writer/transaction capabilities expire at callback completion; transactions are
synchronous and cannot nest. Outstanding file operations are revoked, not drained:
the callback must await them. Returning with outstanding work rejects with
`INVALID_STATE`; an already failing callback preserves its original thrown value.
Owned temporary descriptors close before lock release. Later source/hash
continuations check expiry before mutation, readiness checkpoints or successful
references, and reject with `CLOSED` when otherwise valid. Caller iterators may
remain suspended, but cannot retain an open store-owned descriptor or writer lock.
Their external resources remain the caller's responsibility; the store neither
waits indefinitely for nor forcibly executes arbitrary iterator cleanup.
Writable connections are opened only under the
owner-checked lock. Every connection verifies DELETE/FULL/foreign-keys/mmap/cache
and busy settings. Pure readers never recover a journal. A hot journal requires
a separately invoked fixture writer, using the explicit restart-recovery opt-in
when no pre-crash handle survives. Snapshot setup captures selected record,
association, map, original-property and explicit-review metadata, and opens all
selected files/dependency sidecars under the lock. Analysis then releases the
transaction/lock and borrows handles until callback completion. Missing files,
changed bytes, resource exhaustion and stale cursors remain explicit errors.
Newly opened handles remain locally owned through inspection/registration;
setup failure closes them before rethrowing the original error. Registered
handles remain owned by normal snapshot cleanup, without an early/double close.
Outer cleanup attempts every registered close even when an earlier one throws.
An existing setup/callback failure remains primary; otherwise the first cleanup
failure rejects the operation after all close attempts, rather than reporting success.
Unresolved publication/cleanup intents are unavailable even when public status
is claim/done. Explicit reviewer selection also counts its owning records toward
the 64-source limit; it cannot bypass the readiness or source-budget gates.
Root payloads are selected per requested role through an ordered role index,
before the 257-row sentinel bound. Every selected dependency role is included;
the 256-handle/8 MiB limits still fail before analysis, rather than truncating.

`writer.deleteFile` is a fixture-only file-journal primitive: it requires an exact
owned, authorized cleanup intent, verifies bytes, unlinks, fsyncs the parent
directory and checkpoints. An absent-file retry also fsyncs the parent before
checkpointing deletion; repeated flush failure retains the pending intent. Logs
require public `done`; scores require explicitly committed `retiring`. The file
primitive rejects execution inside a transaction, so an uncommitted/rolled-back
status change cannot authorize deletion. It neither automatically transitions
a score nor performs log reconciliation. Together
with `finishPublication({retire: true})`, it tests storage mechanics; it does not
decide reviewer completion or orchestrate production log/score retirement. No
existing replay command imports the new modules. No dependency or runtime-build
change is required. `fault(boundary)` is an optional fixture injection callback;
it is not a production recovery interface.

## Validation and repeatable commands

```sh
node --test tests/unit/replay-store.test.js tests/unit/replay-store-payloads.test.js
node --test --test-name-pattern='600 MiB' tests/unit/replay-store-payloads.test.js
npm test
npm run check
git diff --check
```

The tests create their own temporary roots and remove only those synthetic
fixtures after completion. Scale workers use `--max-old-space-size=192` and
enforce the ADR's 60-second generation, 30-second operation and 256 MiB RSS gates.

| M1 requirement | Synthetic validation |
| --- | --- |
| Preservation | log/evidence-only/score/map/replay/review/retired identities, ordinals, Unicode/null/zero/false, absent/empty collections, nested unknowns, overflow review/diagnostic values, multiple property pages |
| Bounded access | 128-row pages, explicit row/chunk/snapshot/handle errors, stale/query cursors, selected JSON pointers/ranges, indexed query plan, no unrelated payload reads |
| Publication/retry | reservation rollback, temporary-write/fsync, exclusive publication, directory fsync, verification and claim-commit faults; exact retry; unowned/changed path rejection |
| Concurrency/recovery | two-process property/reviewer updates and output race, live/dead/legacy-empty/malformed locks, SQLite busy timeout and transaction rollback, SIGKILL boundaries, native hot journal with nonmutating read failure then writer recovery |
| Coherent readers | second-process authorized cleanup while an open handle remains readable; overflow file unlink after pinning; selected original metadata, callback failure/closed capability and integrity checks |
| Scale | ten distinct physical 60 MiB ASCII payloads (600 MiB total), fixed selections at 10/1,000 metadata rows, one selected import, retained file identity checks, measured SQL/artifact counters and worker RSS |

### Initial candidate: superseded qualification

Local runtime: Node 24.19.0, SQLite 3.53.3, macOS, declared local APFS.

The initial candidate passed **21/21** focused tests. Its 600 MiB generation
worker took **1.385 s**, with **63.45 MiB** peak RSS; the operation worker took
**0.217 s**, including fixture metadata growth, with **71.13 MiB** peak RSS.
Both ran under a 192 MiB V8 heap and passed their separate deadlines/RSS gates.
Generation wrote and verified 629,145,600 bytes across ten distinct files;
the API recorded 9,620 chunk writes and ten verification-file opens.

| Operation | Operational SQL calls at 10 / 1,000 rows | Artifact bytes read/written | Elapsed at 10 / 1,000 rows |
| --- | ---: | ---: | ---: |
| List ten rows | 2 / 2 | 0 / 0 | 1.92 / 0.79 ms |
| Exact lookup | 1 / 1 | 0 / 0 | 0.70 / 0.40 ms |
| Review update | 8 / 8 | 0 / 0 | 7.62 / 10.03 ms |
| One new import | 21 / 21 | 12 / 12, then 14 / 14 | 40.60 / 31.20 ms |

List, lookup and review opened zero payloads. Import performed one verification
open and seven streamed chunk writes for its new payload only. Existing payload
inode/length/mtime/ctime values remained unchanged. These are local observations,
not guaranteed performance or filesystem durability. The initial scale harness
failed on an omitted default fixture ID; this was a test-helper failure, not a
storage/resource failure. Final review also corrected a row-count off-by-one;
both measured sizes are now explicitly asserted before operations.

That initial patch also passed **234/234** repository tests (21.574 s),
`npm run check` (including unchanged runtime build
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`),
36 local links, two anchors, two JSON examples and all-file whitespace checks.
The full-suite scale gate independently passed again; the table above uses
the explicitly identified focused-run measurements, not pooled observations.

Those passes did not establish M1 readiness. Subsequent synthetic review
reproduced four blockers: exact publication retry skipped an interrupted directory
fsync; score cleanup accepted `done` without `retiring`; a role-filtered snapshot
silently omitted a selected root beyond the 257-row cutoff; and original review
property updates left lookup returning stale checkpoints. The candidate remained
unstaged. These historical results are retained, not presented as corrected-code
qualification or power-loss evidence.

### Corrected candidate: targeted regressions

Four new tests named `M1 regression:` failed **4/4** against the defective
implementation before its correction, then passed **4/4** after correction:

- Publication: both payload/output retries actually flush the affected directory
  before claim; an injected retry fsync EIO leaves pending/intent unchanged until
  another exact retry succeeds.
- Cleanup: score deletion/retirement rejects `done`; explicit persisted `retiring`
  survives reopen and enables retry-safe deletion. Uncommitted authorization and
  rollback cannot permit file I/O. Existing log-done cleanup remains separate.
- Snapshots: after 257 excluded roots, the selected summary and its overflow
  child are both pinned, with only two artifact opens and fewer than 20 metadata
  rows. The query uses the ordered role index without a temporary sort; exceeding
  the handle budget rejects the callback instead of omitting files.
- Reviews: checkpoint updates are immediately visible across handles; rollback,
  unknown escaped/prototype-named fields, null/false/zero and bounded structured
  fallback remain supported. Lookup opens no payloads to rebuild small values.

One pre-existing preservation assertion was corrected to include an explicitly
inserted review extension: its previous expectation had codified the stale
lookup defect. No ADR requirement, resource budget or lifecycle policy was changed.

The final regression definitions also failed **4/4** against saved defective
modules in an isolated temporary copy; the failures were missing fsync/state
rejections, an unpinned selected payload, and the stale examined checkpoint.

Corrected final-code validation passed **25/25** focused tests (25.082 s),
**238/238** repository tests (25.976 s), and `npm run check`. The focused run
includes concurrency/hot-journal/SIGKILL recovery, log-done cleanup and active
publication/cleanup-intent rejection. The unchanged runtime build remains
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

The corrected focused 600 MiB gate streamed ten distinct physical payloads,
writing/verifying **629,145,600 bytes**, with exact **10/1,000** starting-row
assertions. Generation took **1.320 s / 63.36 MiB peak RSS**; operations took
**0.214 s / 71.56 MiB peak RSS**. Both passed their 192 MiB heap, 256 MiB RSS,
60/30-second gates. The final full suite independently passed the gate again;
the following table uses only that identified focused run.

| Operation | Operational SQL calls at 10 / 1,000 rows | Artifact bytes read/written | Elapsed at 10 / 1,000 rows |
| --- | ---: | ---: | ---: |
| List ten rows | 2 / 2 | 0 / 0 | 1.77 / 0.76 ms |
| Exact lookup | 1 / 1 | 0 / 0 | 0.59 / 0.37 ms |
| Review update | 11 / 11 | 0 / 0 | 6.94 / 13.07 ms |
| One new import | 21 / 21 | 12 / 12, then 14 / 14 | 34.51 / 31.38 ms |

The three additional review-update SQL calls invalidate property-write
projections and restore the complete bounded `putReview` projection; cost does
not grow with corpus size in this fixture. Metadata operations opened/read/wrote
no payloads; import verified/wrote only its new payload. Existing payload
identities remained unchanged. These counters retain the exclusions below.

Documentation validation passed 36 local links, two anchors, two JSON examples,
and tracked/untracked whitespace checks. The corrected ten-path M1 candidate
remains unstaged for review; no integration, migration or production qualification
is implied by these local passes.

### Corrected-candidate review: reproduced ownership blocker

Further synthetic review reproduced a separate cross-kind path-ownership defect.
Before publication, one log's pending summary payload and another record's score
output can reserve the same relative path: `reserveOutput` checks maps and
existing files, but not pending payload ownership. Both publications then reach
`claim`. Authorized cleanup of the log deletes that shared file while the score
remains `claim`; a subsequent score snapshot reports `UNAVAILABLE`.

This violates ADR 0006's single-owner file and ownership-conflict requirements.
The four corrections and their qualification results above remain recorded, but
did not establish M1 readiness. At that review the candidate remained blocked
and unstaged; implementation was not changed during the review. Follow-up
required rejecting cross-kind path reservations under the writer lock, including
either reservation order and evidence-only publication, with regressions
demonstrating that cleanup cannot remove another record's output. Keep the ADR
requirements unchanged.

### Ownership correction: final-code qualification

The correction adds bounded cross-kind ownership checks to output reservations,
payload intents, both publication primitives, evidence-only reference registration
and map registration. Per-table uniqueness alone was insufficient. No schema,
ADR requirement, locking/publication protocol or lifecycle policy was changed.
A callback-local path reservation also protects evidence-only publication while
its streamed source awaits, before a final file or metadata owner exists.

Five `cross-kind ownership:` regressions failed **5/5** against the defective
implementation before correction, then passed with the correction. The final
regression definitions also failed **5/5** against saved defective modules in
an isolated copy. They cover:

- Payload-first and output-first pending reservations, plus map conflicts.
  Rejections preserve existing metadata, generation and intent; no conflicting
  file or ownership row is created. Same-record cross-kind sharing is rejected.
- Evidence-only publication before record creation, including a paused source;
  map/output conflicts are rejected during prepublication, and a map cannot
  adopt the verified file afterward. Exact same-owner retries retain bytes and
  references.
- Publication rechecks against synthetic pre-existing conflicting reservations;
  neither primitive writes bytes or changes record/intent state on rejection.
- Two competing processes with distinct operation IDs: exactly one reserves the
  pending path, the other reports `OWNERSHIP_CONFLICT`, and the winner can publish.
- Authorized log cleanup removes only its own sidecar. A rejected cleanup alias
  cannot delete the score output; its record/hash and pinned snapshot remain
  readable. The reverse ready-output conflict preserves its bytes/state as well.

Final validation passed **30/30** storage tests (29.160 s), **243/243** repository
tests (30.536 s), and `npm run check`. All four earlier corrections, active-intent
rejection, process concurrency, busy/hot-journal/SIGKILL recovery and pinned
reader cleanup were revalidated. The runtime build remains unchanged at
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

The final focused 600 MiB gate again streamed **629,145,600 bytes** across ten
distinct physical payloads, with exact **10/1,000** starting-row assertions.
Generation took **1.428 s / 63.55 MiB peak RSS**; operations took
**0.235 s / 71.50 MiB peak RSS**. Both met the unchanged 192 MiB heap, 256 MiB RSS,
60/30-second limits. The repository suite independently passed the gate again;
the table below uses the identified focused run only.

| Operation | Operational SQL calls at 10 / 1,000 rows | Artifact bytes read/written | Elapsed at 10 / 1,000 rows |
| --- | ---: | ---: | ---: |
| List ten rows | 2 / 2 | 0 / 0 | 1.91 / 0.76 ms |
| Exact lookup | 1 / 1 | 0 / 0 | 0.59 / 0.36 ms |
| Review update | 11 / 11 | 0 / 0 | 11.29 / 9.85 ms |
| One new import | 25 / 25 | 12 / 12, then 14 / 14 | 45.56 / 35.55 ms |

Four additional exact indexed ownership queries per evidence-only import raise
its operational SQL count from 21 to 25 at both sizes. Metadata operations still
open/read/write zero payloads; imports verify/write only their new payloads.
Existing payload inode/length/mtime/ctime values remain unchanged. Counter and
platform exclusions below still apply; these are not durability guarantees.

Documentation checks passed 36 local links, two anchors, two JSON examples and
tracked/untracked whitespace. The corrected ten-path candidate remains unstaged
for review. No production integration, migration, real-capture processing,
watcher activity, gameplay, commit or push is authorized by these results.

### Ownership-candidate review: reservation-role blocker

The ten reviewed files matched the SHA-256 receipt of the validation above.
Eleven targeted tests revalidated the cross-kind correction, the four earlier
regressions, active-intent rejection and pinned-reader cleanup. These passes
still do not establish M1 readiness: another synthetic probe found that
`publishPayload` accepts a different role from its reservation when owner,
pointer, hash, length and parent match.

The probe reserved `/summary` as `extensions`, then published it as `summaries`.
Publication wrote the different, unreserved summary path and changed the saved
extension payload to `ready`, although its reserved file was absent. The record
remained `pending`; finishing its original intent failed with `INVALID_STATE`.
Thus the final claim gate did prevent readiness, but publication had already
violated the exact-reservation contract and changed the payload state.

At that review the candidate remained blocked and unstaged. No implementation or test was
changed during this review. Follow-up must reject reserved role/derived-path
mismatches before file I/O or checkpoint changes, preserve the reservation and
intent, and cover an exact same-owner retry afterward. ADR requirements remain
unchanged; the earlier qualification results remain historical evidence, not
proof that this mismatched-input case is safe.

### Reservation-validation correction: current qualification

`publishPayload` now rejects a saved role or destination-path mismatch with
`OWNERSHIP_CONFLICT`, alongside its existing hash/length/parent checks. Validation
precedes cross-kind reservation, source iteration, file I/O and checkpoint updates.
No schema, ADR requirement, lifecycle rule, dependency or other behavior changed.

Two tests named `M1 regression: payload publication` failed **2/2** on the
defective implementation (missing expected rejection), then passed **2/2**
after correction. The final regression definitions were rerun against the
original check and again failed **2/2** before restoring the fix. They cover:

- The reproduced `extensions` reservation / `summaries` publication mismatch,
  both before and after a valid publication, including `evidenceOnly: true`.
  Rejection consumes no source, creates no unreserved file/directory and performs
  no artifact reads/writes. Generation, original properties, record status,
  reservation and publication-intent/checkpoint rows remain identical; existing
  reserved bytes and file metadata remain unchanged.
- A noncanonical saved path with otherwise matching role/hash/length/parent,
  seeded only in a synthetic database. Rejection preserves its metadata and
  directory contents without writing either destination. Restoring the fixture's
  original reservation allows valid publication and exact retries afterward.

Both fixtures finish with one payload, no remaining intent and supported `claim`
after matching publication/retries. The role fixture also verifies the pinned
original value. The earlier probe's record remained `pending` and its final
claim failed; it was not a false-claim defect. The formerly blocked reservation
case is now corrected, with the ten-path candidate still unstaged for review.

Final-code validation passed **32/32** focused storage tests (**28.012 s**),
**245/245** repository tests (**27.202 s**), and `npm run check`. The suites
revalidated publication/recovery, directory-fsync retries, committed score
retirement, complete bounded role snapshots, current review values, active-intent
rejection, cross-kind ownership, process concurrency and pinned overflow cleanup.
The unchanged runtime build is
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Impact assessment: the correction adds two bounded comparisons to the existing
single-row reservation lookup, with no additional SQL, payload access or streaming
allocation. Nevertheless the focused and repository suites each ran a fresh
600 MiB gate, rather than relying on historical measurements. The identified
focused run generated/verified **629,145,600 bytes** in **1.323 s / 63.19 MiB peak
RSS**; operations took **0.198 s / 71.09 MiB peak RSS**. Exact **10/1,000** row
assertions and unchanged 192 MiB heap, 256 MiB RSS and 60/30-second deadlines
passed. List/lookup/review/import operational SQL counts remained **2/1/11/25**
at both sizes. Metadata operations accessed zero payload bytes; imports accessed
only their new **12/14-byte** payloads (one verification open and seven streamed
chunk writes each). Existing payload file identities remained unchanged.

Documentation validation passed **36 local links, two anchors, two JSON examples**
and tracked/untracked whitespace checks. The historical qualification and blocked
review results above remain superseded records, not current readiness claims.
The correction task does not stage, commit, integrate, migrate or qualify
power-loss durability or additional platforms.

### Complete-candidate review: cleanup directory-fsync retry blocker

All ten candidate files matched the SHA-256 receipt for the 32/245-test
qualification above, including the corrected reservation validation. The later
16-test targeted verification also remains applicable. The complete staging
review nevertheless reproduced an additional recovery defect in `deleteFile`;
those passes do not establish complete M1 readiness.

Separate synthetic log and score fixtures published one owned file and committed
their authorized cleanup intent (`done` for the log, `retiring` for the score).
The probe injected `EIO` on every fsync of that file's parent directory. The first
deletion unlinked the file, failed directory fsync and left the intent's file
checkpoint `pending`. Retrying with the same injected failure still active
performed no further parent-directory fsync: because the path was absent, it
committed `deleted`. Final retirement then succeeded and removed the intent.
Both fixtures observed exactly one parent-directory fsync attempt across the
failed initial operation and successful retry.

This bypasses the interrupted cleanup durability step and discards its recovery
intent rather than completing the file operation before final retirement. It is
not a reproduced power-loss event, file resurrection, publication false claim,
or regression in the role/path fix. The existing durability/platform limitations
below remain; they do not justify skipping a required flush after an I/O failure.

At that review the complete candidate was blocked and remained unstaged. Only this qualification
record changed during review; implementation and tests were not modified.
Follow-up requires a narrow cleanup-retry correction: flush the affected parent
directory even when retry finds the authorized file already absent, before
committing `deleted`. Repeated fsync failure must preserve the checkpoint and
intent; a later successful flush must allow exact retry/final retirement. Cover
both log-done and explicitly committed score-retiring fixtures, retaining existing
ownership, missing-file and lifecycle rules without weakening ADR 0006.

### Cleanup durability correction: qualification (2026-10-04)

The narrow `deleteFile` correction moves parent-directory fsync outside the
file-exists branch and before the deletion checkpoint transaction. This completes
an interrupted unlink flush even when targeted retry finds the file absent.
An fsync error propagates without checkpointing deletion or removing the intent.
Ownership/hash checks and log-`done` versus committed score-`retiring`
authorization remain unchanged. No ADR requirement, schema, dependency,
publication behavior or lifecycle policy changed.

Two `cleanup retries directory fsync` regressions, one log and one score, failed
**2/2** against the defective implementation before correction, with missing
expected `EIO` on the absent-file retry. The same tests then passed **2/2** with
the correction. Each fixture demonstrates:

- Initial unlink succeeds, then an injected parent-directory fsync error leaves
  the file absent and deletion checkpoint `pending`.
- An absent-file retry attempts the flush again; repeated `EIO` leaves generation,
  record/review/property/payload/output rows, cleanup intent and checkpoints
  unchanged. Retirement rejects with `INVALID_STATE` after each failure.
- Allowing the directory flush succeeds before `deleted` is committed. The
  exact already-deleted retry remains valid, and final authorized retirement
  removes the record/intent and retains its retired identity.
- An unrelated owned file retains bytes and inode/length/mtime/ctime; its record,
  unknown properties, review checkpoints, map and replay association remain
  unchanged throughout. Its selected payload remains readable in a pinned
  snapshot after the other record retires.

Final-code validation passed **20/20** affected cleanup/recovery checks,
**34/34** focused storage tests (**28.221 s**), **247/247** repository tests
(**27.909 s**), and `npm run check`. Earlier publication fsync recovery,
role/path validation, cross-kind ownership, committed score retirement, complete
bounded snapshots, current reviews, active intents and concurrency/crash checks
remain covered. The runtime build is unchanged:
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Resource impact: ordinary deletion still performs one parent flush; an absent
authorized retry now performs that required bounded flush before the same
checkpoint transaction. Metadata/import queries, payload streaming and the scale
harness are unchanged. Both suites nevertheless ran a fresh **600 MiB** gate.
The identified focused run generated/verified **629,145,600 bytes** in
**1.474 s / 63.41 MiB peak RSS**; operations took **0.207 s / 71.06 MiB peak RSS**.
Exact **10/1,000** starting rows and the unchanged 192 MiB heap, 256 MiB RSS,
60/30-second deadlines passed. List/lookup/review/import operational SQL counts
remained **2/1/11/25** at both sizes; metadata operations accessed zero payload
bytes, and imports accessed only their new **12/14-byte** payloads. Existing
payload file identities remained unchanged. These instrumented counters retain
the exclusions below; directory fsync is not an OS-block-I/O measurement.

Documentation checks passed **36 local links, two anchors, two JSON examples**
and tracked/untracked whitespace. The cleanup blocker above is historical and
corrected; these current results supersede its qualification status without
removing prior findings. The ten-path M1 candidate remains unstaged for review.
The task did not integrate consumers, migrate/process real evidence, run a
watcher or gameplay, or stage/commit/push. Power-loss durability and additional
platforms remain unqualified.

### Complete-candidate review: snapshot setup handle-leak blocker

All ten files still matched the SHA-256 receipt of the corrected 34/247-test
qualification above. Cleanup retries and earlier corrections remained unchanged;
their passing results are retained. Complete review nevertheless reproduced an
additional exception-path resource defect in snapshot setup, which those tests
do not cover.

A temporary synthetic fixture published one summary and reached `claim`. The
probe injected `EIO` from `fs.fstatSync` for the selected artifact immediately
after `addFile` opened it. `withReadSnapshot` propagated the error without invoking
the callback and released its lock. However, the descriptor had not yet been
registered in `handles`, so the outer `finally` closed zero descriptors for that
artifact. After restoring the native functions, native `fstatSync` on the saved
descriptor still succeeded, establishing a live leaked descriptor. The diagnostic
then explicitly closed its leaked descriptor. Record status and artifact bytes
were not altered; this was not a supported analysis result or evidence loss.

ADR 0006 requires exceptions to close every snapshot handle. At that review the
complete candidate remained blocked and unstaged, despite passing qualification
of other cases. Only this record changed during review; no implementation or test
correction was made. Follow-up required exception-safe ownership of a descriptor
from successful open through inspection/registration, closing it if setup fails
before registration. Add an injected artifact-inspection failure regression that
proves callback withholding, descriptor closure, unchanged evidence/metadata and
a successful subsequent snapshot; preserve normal pinning and handle budgets.
Do not weaken the ADR or redesign storage. Power-loss/platform limits remain as
recorded below.

### Snapshot setup descriptor correction: qualification (2026-10-04)

`addFile` now owns a descriptor immediately after opening it, through artifact
inspection and handle registration. If either step throws before ownership
transfers to the snapshot's handle map, the local error path closes that
descriptor. Registered handles remain the responsibility of the outer snapshot
`finally`. A secondary close error does not replace the original setup error.
No ADR requirement, resource limit, schema, dependency, lifecycle rule or
publication behavior changed.

Three `snapshot setup closes descriptors` regressions failed **3/3** against
the defective implementation before correction, then passed **3/3** afterward.
They inject artifact-inspection `EIO`, handle-registration failure, and inspection
`EIO` with a secondary close error after native close. Each fixture first pins
another selected artifact, then verifies both descriptors close exactly once,
the original error propagates, analysis is withheld and the writer lock releases.
Record/review/property/association/map/operation metadata and artifact hashes,
inode, length and timestamps remain unchanged. A subsequent snapshot keeps both
descriptors open for the callback, reads the exact original values and closes
them once at callback completion; the escaped view rejects later use.

Final-code validation passed **8/8** affected snapshot checks, **37/37** focused
storage tests (**28.611 s**), **250/250** repository tests (**29.305 s**), and
`npm run check`. The suites also revalidated earlier recovery, ownership,
role/path validation, review, active-intent, concurrency and pinned-overflow
cases. The runtime build remains
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Resource impact is confined to bounded handle-setup error ownership: no new SQL,
payload reads/writes or corpus allocation is introduced. Scale metadata/import
paths are unchanged, but both suites nevertheless ran fresh **600 MiB** gates.
The identified focused run generated/verified **629,145,600 bytes** in
**1.408 s / 63.50 MiB peak RSS**; operations took **0.224 s / 71.80 MiB peak RSS**.
Exact **10/1,000** row assertions and the unchanged 192 MiB heap, 256 MiB RSS and
60/30-second deadlines passed. Operational list/lookup/review/import SQL counts
remained **2/1/11/25** at both sizes; metadata operations accessed zero payload
bytes and imports accessed only their new **12/14-byte** payloads. Existing
payload file identities remained unchanged. These remain local synthetic
measurements with the instrumentation exclusions below.

Documentation validation passed **36 local links, two anchors, two JSON examples**
and tracked/untracked whitespace checks. The handle-leak blocker is corrected;
the historical qualification/review findings above remain distinguishable from
these results. The M1 candidate remains unstaged for review. No consumer
integration, real-evidence processing, migration, watcher activity, gameplay,
staging, commit or push occurred. Power-loss durability and additional platforms
remain unqualified.

### Complete-candidate review: registered-handle cleanup blocker (2026-10-04)

All ten candidate files matched the corrected 37/250-test qualification receipt
at review start. The `addFile` inspection/registration correction remains intact,
as do its three regressions and the earlier corrections. Those results do not
cover a close failure in the outer `withReadSnapshot` cleanup loop.

A temporary synthetic fixture pinned two summary payloads. After native close
of the first registered descriptor, the probe injected a close `EIO`. The outer
`finally` stopped at that error: the second descriptor received zero close calls,
and native `fstatSync` still succeeded on it. This reproduced both after a
successful callback and after a deliberately failing callback; in the latter
case the close error also replaced the original callback error. The writer lock
was already released and the view was closed. Record/generation metadata and
artifact hashes remained unchanged. The diagnostic explicitly closed the leaked
descriptor after each case; a subsequent uninjected snapshot succeeded.

This is an exception-cleanup defect, not evidence loss, a power-loss result or a
failure of the local pre-registration guard. ADR 0006 requires every snapshot
handle to be closed on exceptions. Registered-handle cleanup must attempt every
close even if an earlier close reports an error, and define error propagation
without hiding the primary setup/analysis failure. Follow-up regressions should
cover successful and failing callbacks, setup failure with previously registered
handles, continued close attempts after an injected error, and normal descriptor
lifetime without double-close. An error injected after native close proves loop
interruption; it does not qualify arbitrary OS close-failure semantics.

At that review the complete candidate remained blocked and unstaged. Only this qualification
record changed during review; no implementation, tests or ADR requirement was
changed. The unchanged test/resource results above remain scoped qualification,
not complete M1 readiness. No production data or trial worktree was accessed or
modified by the synthetic probe; no integration, migration, watcher activity,
gameplay, staging, commit or push occurred. Power-loss durability and additional
platforms remain unqualified.

### Outer snapshot cleanup correction: current qualification (2026-10-04)

The narrow outer `withReadSnapshot` correction catches each registered-handle
close failure and continues attempting the remaining closes exactly once.
It records whether setup/analysis already failed, independently of that thrown
value's truthiness. Such a primary failure is rethrown unchanged; otherwise the
first cleanup failure rejects after all close attempts. The view closes before
cleanup begins. The local `addFile` guard, normal callback-scoped handle lifetime,
writer-lock release and all earlier corrections remain unchanged. No ADR
requirement, dependency, schema, resource budget or lifecycle rule changed.

Four `snapshot cleanup attempts every close` regressions failed **4/4** before
correction, then passed **4/4** afterward. They cover successful callbacks,
failing callbacks, a setup-inspection failure after two registered handles, and
a callback throwing `null`. Each injects close errors after native close on two
registered descriptors, ensuring later descriptors still receive their single
close attempt. Successful analysis reports the first cleanup error; failing
setup/analysis preserves the exact primary value. Native descriptor checks
confirm all opened fixture handles are closed, callback suppression during setup
failure and closed escaped views remain supported, and no lock remains. Record,
review, property, map/replay, operation and generation metadata, plus artifact
hash/inode/length/timestamps, remain identical. Subsequent uninjected snapshots
read the original values, preserve callback results and keep descriptors open
until callback completion, closing each once without double-close.

Final-code validation passed **12/12** affected snapshot checks, **41/41** focused
storage tests (**26.803 s**), **254/254** repository tests (**28.710 s**), and
`npm run check`. Earlier fsync retry/recovery, ownership, role/path validation,
review, active-intent, process concurrency and pinned-overflow checks remain
covered. The runtime build remains
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Impact assessment: cleanup still visits only the at-most-256 selected handles;
it adds bounded error bookkeeping, not new SQL, payload reads/writes or corpus
allocation. Metadata/import scale paths are unchanged, but both suites ran fresh
**600 MiB** gates. The identified focused run generated/verified **629,145,600
bytes** in **1.600 s / 63.19 MiB peak RSS**; operations took **0.251 s / 71.30 MiB
peak RSS**. Exact **10/1,000** row assertions, zero metadata payload access,
new-import-only **12/14-byte** payload access and **2/1/11/25** operational
list/lookup/review/import SQL calls at both sizes passed. Existing payload file
identities stayed unchanged. The 192 MiB heap, 256 MiB RSS and 60/30-second
deadlines remain unchanged; measurements retain the exclusions below.

Documentation checks passed **36 local links, two anchors, two JSON examples**
and tracked/untracked whitespace. The registered-handle blocker above is now
corrected; historical results remain distinguishable from this qualification.
These injected errors occur after native close, testing control flow rather
than proving closure when an arbitrary OS close call itself fails. Cleanup does
not retry ambiguous descriptors or promise power-loss/device-flush durability.
Additional platforms remain unqualified. The candidate remains unstaged for
review; no consumer integration, real-evidence processing, migration, watcher,
gameplay, staging, commit or push occurred. The unrelated working-tree deletion
of `prompt/analyze_logs.md` remains untouched and unstaged.

### Writer-lifetime correction: F1 qualification (2026-10-04)

The project audit (F1; cross-project report accompanies the later C1 candidate)
reproduced an EOF continuation publishing after its callback failed and another
writer acquired the lock. Earlier passing results above did not cover that
schedule. This follow-up corrects F1 only; the audit's publication-completeness,
fresh-handle recovery, C1 range-domain and screening-cache findings remain open.

The writer now tracks outstanding payload/output/deletion promises and owns each
temporary descriptor from successful open. Callback exit revokes the capability
and attempts every owned close before releasing the lock, without waiting for an
unbounded caller source. Every await-to-mutation boundary is guarded, including
iterator EOF, existing-file hashing, post-link verification and final reference
or checkpoint publication. The shared deletion helper also guards its hash-to-
unlink continuation; authorization/lifecycle rules are unchanged. Settled
operations are removed from tracking. An internal rejection observer handles
abandoned operations without changing the promise returned to callers.

Temporary close responsibility transfers exactly once: callback cleanup removes
it before closing, and a late operation finally cannot close a reused descriptor.
Primary callback/source errors, including thrown `null`, are not replaced by a
secondary temporary-close failure. A callback returning with work outstanding
fails explicitly rather than reporting success. This is cancellation of store
capabilities, not cancellation or rollback of caller code, already committed
metadata, or files durably published before expiry. Pending intents and failed
temporaries stay retained for exact retry; no orphan cleanup was introduced.

Eighteen `writer lifetime:` checks now pass. Seventeen negative regressions fail
against the saved pre-correction working module (including its unchanged C1
hooks), then pass with the correction; the ordinary concurrent awaited
publication/retry control passes on both. Initial regressions were executed
before the implementation edit, and all final regression definitions were also
run against that byte-preserved defective module in an isolated scratch copy.

- Reserved payloads, reserved score outputs and evidence-only payloads suspend
  after their last byte, before EOF. Both sibling rejection and callback return
  release the lock with descriptors closed. A second writer acquires it before
  source resumption; no destination or checkpoint appears, no successful
  reference returns, and pending metadata/intents remain identical.
- Existing-file retries cannot flush/checkpoint after synchronous callback
  failure. Post-link verification expiry retains its temporary and pending
  state. Final method continuations cannot return ready references after expiry.
- The deletion verification continuation cannot unlink or checkpoint after
  expiry; the subsequent authorized retry still retires the score correctly.
- Two suspended publications with injected errors after native descriptor close
  still receive all close attempts. The exact primary `Error` or `null` survives;
  descriptors are not double-closed and later writers work.
- Awaited publication, exact retries, concurrency within the callback, and
  subsequent recovery/claim succeed. Byte/hash/stat and full fixture checkpoint
  comparisons distinguish unchanged metadata from merely unchanged public status.

Final-code validation on native Node **24.19.0**, SQLite **3.53.3**, darwin/arm64
passed **18/18** targeted checks, **85/85** combined catalog/M1 tests
(**27.486 s**, including **59** storage tests), **298/298** repository tests
(**30.169 s**), and `npm run check`. No platform shim was used. The runtime build
remains `fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Resource impact is callback-local bookkeeping proportional to outstanding
operations/descriptors and constant checks at existing await boundaries. No SQL,
artifact reads or writes were added to valid awaited publication. Because the
shared streaming path changed, both suites ran fresh gates rather than reusing
earlier performance numbers. The combined-suite **600 MiB** gate generated and
verified **629,145,600 bytes** in **1.645 s / 63.55 MiB peak RSS**; operations took
**0.207 s / 71.52 MiB peak RSS**. Exact **10/1,000** row assertions, zero metadata
payload access, new-import-only **12/14-byte** access and **2/1/11/25** operational
SQL counts passed. C1's metadata gate took **1.245 s / 68.55 MiB peak RSS**, with
fixed counts at **10/1,000** anchors and zero payload access. The unchanged
192 MiB heap, 256 MiB RSS and 60/30-second deadlines passed. These are observations,
not performance guarantees; instrumentation exclusions below still apply.

Only the shared store, its tests, this record and the audit follow-up changed.
ADR requirements and the pending C1 implementation were not rewritten. Existing
qualification history remains historical; this correction does not establish
complete M1/C1 readiness. No integration, migration, real-evidence processing,
watcher, gameplay, staging, commit or push occurred. Power-loss durability,
arbitrary OS close-failure semantics and additional platforms remain unqualified.

The two edited documents passed **24 local links / seven anchors**; neither adds
a JSON example. Tracked and all four nonignored untracked text-file whitespace
checks passed. Before/after hashes of pre-existing tracked/nonignored files
confirmed only the four authorized paths changed, with C1 hooks outside
`writerCallback` byte-identical. Both trial worktrees and unrelated rules/images/
prompt changes were preserved. Production evidence was not opened or processed;
preservation is by non-access, not a fresh hash claim. HEAD remains
`48201957e5c69060085fd7f8e1609b140b1bfc57`, and the index remains empty.

### Output-completeness correction: F2 qualification (2026-10-04)

The F2 audit finding (cross-project report accompanies the later C1 candidate)
showed a log reaching `claim` with an absent pending output and an empty intent,
then losing that intent. The earlier green suites did not cover this false
readiness. This follow-up changes only `finishPublication` output validation;
F1's reviewed writer-lifetime correction and the pending C1 hooks are unchanged.

Finalization now looks up the unique output by its complete record owner, not
just files supplied by an intent. Any reserved/projected output, and every score,
requires an owned `ready` output whose path/hash match record projections. The
already identity-checked publication intent must contain that exact path with
`verified` state and matching hash/byte length. Missing, pending, incomplete or
inconsistent coverage rejects with `INVALID_STATE` before payload-reference
registration, status writes or intent removal. Existing intent-identity and
incomplete-file checks remain. No schema, ADR requirement, file-publication,
cleanup-policy or retry identity changed; finalization does not rehash files or
adopt them. It relies on the existing publication protocol's verified receipt.

The **27** `F2 output completeness:` tests were run before editing implementation:
**19** exposed the defect; **eight** existing rejection/positive controls already
passed. All **27/27** pass after correction. Both log and score fixtures cover:

- Empty intents with pending/ready outputs, and a fully verified summary-only
  intent omitting the output. Another intent's verified output is insufficient.
- Pending output, unverified checkpoint, mismatched checkpoint path/hash/length,
  mismatched or null record projections, missing reservation and omitted intent.
- Two consecutive rejections preserving generation, records, reservations,
  payloads, properties, reviews, map/replay metadata, checkpoints and intents,
  plus every selected file's hash/stat or absence. No payload I/O occurs during
  these metadata-only finalization attempts.
- Correcting incomplete receipt coverage, ordinary publication and exact retry,
  then successful finalization. A second pre-existing matching verified intent
  can finalize the already claimed record without duplicate evidence.
- Output-free evidence-only logs retain null output projections, repeated
  publication/finalization, and readable pinned payloads.

Projection corruption, missing reservation, independent pending/verified states
and a falsely verified wrong-path checkpoint are seeded/restored directly only
in synthetic fixture databases. Empty/omitted intents and checkpoint hash/length
mismatches also exercise the public APIs. Repair happens only after unchanged-
state assertions; it is not a production recovery command or silent normalization.

Native Node **24.19.0**, SQLite **3.53.3**, darwin/arm64 validation passed:
**56/56** affected publication/recovery checks (**10.627 s**), **112/112** combined
catalog/M1 tests (**36.470 s**, including **86** storage tests), **325/325** repository
tests (**39.254 s**), and `npm run check`. This includes F1 and prior ownership,
fsync, concurrency, lifecycle and snapshot regressions. No platform shim was used.
Runtime build remains
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Resource impact: one indexed owner lookup at publication finalization, plus one indexed
intent/path lookup for file-backed outputs (replacing the previous score-only
ready lookup). No corpus scan or payload I/O was added. Fresh M1 and C1 gates ran
in both combined and repository suites; historical scale results were not reused.
The identified combined **600 MiB** gate generated/verified **629,145,600 bytes**
in **1.523 s / 63.63 MiB peak RSS**; operations took **0.209 s / 71.81 MiB**.
Exact **10/1,000** starting rows and unchanged 192 MiB heap, 256 MiB RSS and
60/30-second deadlines passed. List/lookup/review/import SQL counts were
**2/1/11/26** at both sizes (previously import was 25). Metadata accessed zero
payload bytes; imports accessed only new **12/14-byte** payloads. C1's gate took
**1.600 s / 68.63 MiB**, with unchanged fixed SQL/row counts at **10/1,000** anchors
and zero payload access. These are local observations, not performance guarantees.

Historical F1 and earlier qualifications remain above. F2 is locally corrected
and unstaged for review, not a claim of complete M1/C1 readiness. F3–F5 remain
open; payload/review dependency coverage beyond the existing guards was not
expanded in this output-only correction. Power-loss durability, arbitrary OS
close-failure semantics and other platforms remain unqualified. No real evidence,
integration, migration, watcher, gameplay, staging, commit or push was involved.

Documentation checks passed **26 local links / nine anchors** and tracked plus
four nonignored untracked text-file whitespace checks. Neither edited document
adds JSON examples. Before/after hashes preserve all other pre-existing project
files and both trial worktrees; the F1 implementation/tests and C1 hooks are
byte-identical. Production evidence was not opened or processed. HEAD remains
`48201957e5c69060085fd7f8e1609b140b1bfc57`, with an empty index; all changes remain
unstaged. The only task paths are the store, its unit tests, this record and
the audit's F2 follow-up.

## Fresh-process hot-journal recovery F3 qualification (2026-10-04)

The historical hot-journal tests above reused a pre-crash handle. They did not
establish restart recovery: normal `openStore` validated through a read-only
connection even in write mode, so a hot journal prevented obtaining a new
writer handle. F1/F2 corrections remain intact; this change only adds the explicit
locked initial-validation branch described above. ADR requirements are unchanged.

Four new targeted tests failed against the saved pre-F3 module in an isolated
copy, then passed on corrected code. The two schema restart tests previously
returned `RECOVERY_REQUIRED` instead of entering lock acquisition; invalid
recovery opt-ins and descriptor replacement were not checked by the old open.
Tests use native Node **24.19.0**, SQLite **3.53.3**, darwin/arm64, with no shim:

- M1 schema 1 and C1 schema 2 discard the original handle, then a child owns the
  writer lock, spills an uncommitted SQLite transaction and dies by `SIGKILL`.
  Database/journal hashes, sizes and modification times stay unchanged through
  fresh-process ordinary read and write opens reporting `RECOVERY_REQUIRED`.
- An aged live-owner lock causes explicit recovery to fail `LOCKED` within the
  existing bounded acquisition window, without changing the hot files or owner.
  Restoring the terminated writer's original lock and aging it in the synthetic
  fixture exercises existing dead-owner recovery. A different, fresh process
  recovers through the public opt-in; no previous store handle participates.
- Recovery removes the interrupted changes and preserves every committed table
  row, including generation, records, properties, reviews, pending output and
  publication/cleanup intents, and C1 metadata. It performs no payload access.
  Subsequent ordinary reads/writes succeed; a real transaction increments
  generation once. Crash-left lock-owner temporaries remain retained; successful
  and blocked attempts leave no new owned lock temporary.
- Read-mode/nonboolean opt-ins, unsupported descriptor versions, mismatched
  database identities/schema versions and unsupported WAL are rejected.
  The runtime probe and rejected database connections close; owned locks release,
  and subsequent valid opens succeed. Replacing a valid descriptor/store while
  recovery waits for the lock is rejected before writable access to either DB.

Final checks: **4/4** targeted (**11.735 s**), **8/8** affected recovery/locking
(**25.089 s**), **116/116** combined storage/catalog (**48.173 s**, including **90**
storage tests), **329/329** repository (**50.286 s**), and `npm run check` passed.
F1/F2, busy timeout, live/stale/malformed locks, publication SIGKILL and prior
ownership/lifecycle/snapshot regressions remain covered. Build stays
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Resource impact is restricted to explicit recovery: one locked checked writable
connection, without catalog scans, payload I/O or a logical mutation. Ordinary
operation paths remain unchanged. Nevertheless both suites ran fresh M1/C1
resource gates rather than reusing historical measurements. The combined
**600 MiB** gate generated/verified **629,145,600 bytes** in
**1.447 s / 63.64 MiB peak RSS**; operations took **0.225 s / 71.86 MiB**.
Exact **10/1,000** starting rows and 192 MiB heap / 256 MiB RSS limits passed.
List/lookup/review/import retained **2/1/11/26** SQL calls at both sizes; metadata
accessed zero payload bytes and imports accessed only new **12/14-byte** payloads.
C1 took **1.619 s / 68.80 MiB**, with fixed SQL/row counts at 10/1,000 anchors and
zero payload access. These measure routine fixture gates, not a bound on native
rollback duration or arbitrary journal sizes. SQLite's existing busy timeout and
owner-lock acquisition are bounded; native recovery has no added time guarantee.

F3 is locally corrected and unstaged for review. F4–F5 remain open; this is not
broader M1/C1 readiness, integration/migration or power-loss/platform qualification.
No production data was accessed. Existing C1 work, gameplay/builds, dependencies,
unrelated files and both trial worktrees are preserved. Only the store, its tests,
this qualification record and the audit F3 entry changed for this task.
Documentation validation passed **27 local links / ten anchors**; the changed
documents add no JSON examples. Tracked and nonignored untracked text whitespace
checks passed. HEAD remains `48201957e5c69060085fd7f8e1609b140b1bfc57` with an empty
index; there was no staging, commit or push.

## Scope and remaining limits

### Isolated candidate validation — 2026-10-04

The M1-only export at `/tmp/pain-gain-candidates.wo4pqF/m1/` removes only pending
C1 hooks and the schema-2 restart branch. Schema-1 assertions and F1–F3 behavior
are retained. It passed 89 storage tests within **302/302** repository tests and
`npm run check`, with a fresh 600 MiB gate. Generation measured 5.528s / 63.55 MiB
peak RSS; operations 0.332s / 71.38 MiB. Exact 10/1,000-row and payload-access
assertions passed, with 26 import SQL calls at both sizes. This is independent
of the historical combined-working-tree counts above. The C1 candidate restores
schema-2 coverage; neither candidate is staged or production-qualified.

Metrics count instrumented operational SQL statements/rows, connections/lock
acquisitions, artifact opens and artifact read/write calls/bytes. They exclude
fixed runtime/connection PRAGMA probes, descriptor/lock housekeeping and SQLite's
internal filesystem I/O. They are not OS block-I/O or database-page byte counts.
The query-plan and fixed-count checks establish bounded selected metadata work;
SQLite B-tree/page/cache behaviour is not claimed constant across corpus growth.

These tests establish local process-failure and synthetic resource behaviour,
not power-loss qualification, reliable device flushes, other Node patches/OSes
or filesystems. Root declarations and capability probes cannot prove durability.
The Node SQLite API remains release-candidate. Large-value iteration still
depends on selected input size; no analyzer memory/speed improvement is claimed.

M2 consumer integration and lifecycle-policy orchestration, M3 streaming
migration/export/rehearsal/rollback, and separately authorized M4 production
migration remain unimplemented. Existing v2 captures/maps/reviews/backups and
both gameplay trial worktrees are outside M1; no real capture was accessed.
