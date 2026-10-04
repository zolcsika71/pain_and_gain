# Project-wide audit and completion plan — 2026-10-04

## Verdict and scope

**The audit confirmed five defects; all five local corrections have passed their focused reviews.**
Three affect committed storage M1, one affects the pending C1 candidate, and one
affects the deployed scout-hold screening cache. Existing green test/resource
results remain historical observations; the negative regressions and focused
reviews below specifically cover the formerly untested contracts.

The original highest-priority task was **A1, contain asynchronous publication
within the writer-lock lifetime**; its correction has now passed focused review.
F2/A2's output-completeness correction has also passed focused review.
F3/A3's fresh-handle recovery correction has also passed focused review.
F4/A4's evidence-domain correction has also passed focused review.
F5/A5's selected-input cache correction has also passed focused review.
**Audit status is consolidated; dependency-separated candidates are prepared in
the [candidate record](audit-candidates-2026-10-04.md).** The next step is review
of those exact patch artifacts and separate staging/commit authorization. This does
not authorize storage integration or migration. No gameplay change or new match is justified
by this audit.

This is a code/contract audit with native synthetic reproductions, not a new
historical-evidence review. No production capture, manifest, database, cache,
backup or review body was opened or processed. Historical match conclusions
below are attributed to existing repository records, not independently reanalyzed.

### Inspected state

- Main HEAD: 48201957e5c69060085fd7f8e1609b140b1bfc57, branch main.
  No fetch, commit, push or history change was performed.
- Committed M1 is isolated tooling. Pending C1 has eight paths: catalog module,
  shared store, catalog tests, package scripts, ADR 0006, both documentation
  indexes, and C1 qualification. All eight matched the prior final validation
  receipt before fresh checks.
- Index empty. Unrelated rules edits, new docs/images files and deletion of
  prompt/analyze_logs.md were present and remain outside this task.
- Hold worktree: pain_and_gain_hold_trial_2026-10-02, detached at
  fd6fdf20ea62c2b663185913d52b58f83f59612a.
- Pair worktree: pain_and_gain_pair_trial_2026-10-02, detached at
  8c0ce181bca388f38cbf569913527dd7b31cc1ad.
- Native environment: Node v24.19.0, SQLite 3.53.3, darwin/arm64.
  The temporary-root volume resolves to internal APFS, /dev/disk3s5.
  No platform shim was used. An initial diskutil lookup by directory did not
  resolve a disk; df followed by diskutil on the device established the volume.
- Main switches: pairing OFF, allocation OFF, holding OFF, escort ON.
  Fresh check verified build
  fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933.
  No build was generated or source-selection claim made.

Authority: [repository instructions](../../AGENTS.md),
[current rules](../pain_and_gain_rules.md), [ADR 0006](../decisions/0006-replay-storage-v3.md),
[M1 qualification](replay-storage-v3-m1-2026-10-03.md), and
[pending C1 qualification](replay-catalog-c1-2026-10-04.md).
The committed ADR was compared with its pending edits: status/API wording,
qualification links and example receipt fields changed; requirements were not
relaxed. This audit leaves those documents unchanged.

## Review matrix

Reviewed means contract and implementation were traced with relevant tests;
sampled means representative paths were checked, not every branch proved.
Passing a test is not proof of all error schedules or live Arena behavior.

| Area | Coverage | Evidence, result and remaining boundary |
| --- | --- | --- |
| Git, worktrees, scripts, configuration | Reviewed | HEAD/index/status, full pending scope, worktree inventory, file-hash preservation, package scripts and build check. No remote-state claim beyond local refs. |
| Runtime orchestration and observation | Reviewed | [loop](../../src/loop.js), observe/execute, map/game-state loggers, objectives; pre-action snapshot to commands to CPU/closure traced. No new confirmed gameplay defect. |
| Combat, healing, movement | Reviewed | Functioning parts, deterministic targets, attack/heal incompatibilities, local engagement/grace and healer support; full regression suite. Engine resolution is not simulated. |
| Squad membership and pairing | Reviewed | Stable membership/reset/tombstones, selection, movement precedence, leader-first command gating, three-stall recovery and 24-tick lifetime; waits leave tactics active. Congestion and live recovery remain unqualified. |
| Allocation, holding, escort | Reviewed | Disabled allocation/hold gates; explicit-null overrides; enabled escort release boundary. Existing evidence limits retained; no strategy promotion. |
| Diagnostics and correlations | Reviewed | [evidence contract](replay-evidence-contract.md), sequence/closure/count schemas, attempts after actual calls, null returns and CPU sampling. Complete closures do not prove final CPU or command effects. |
| V2 cache parser/import/map linkage | Sampled | Request identity, framing/gzip caps, build checks, canonical map hash versus file hash, deferred imports, pending publication and duplicate handling; importer tests pass. No live cache scan. |
| V2 reviews, cleanup and watcher | Reviewed representative lifecycle | Owner checkpoints, log automatic reconciliation, exact score retirement, watcher progress/cache identity/retries. Current v2 is not v3 durability; no lifecycle operations invoked on real evidence. |
| Replay analyzer | Sampled | Source/map/hash/summary validation, overlap/build conflicts, consecutive displacement/health, CPU and compact report writer; deterministic/malformed/read-only fixtures pass. Whole-input materialization remains. |
| Score analyzer | Sampled | Managed identity/hash, group mapping/alignment, contributor build association, separate cumulative/gain/delta and unknown terminal status; fixtures pass. No production score rerun. |
| Historical index and caches | Reviewed index; sampled analyzer integration | Exact selection, claim gates, unavailable sources, cache inputs, score summary and compatibility limits. Most index unit tests inject a compact analyzer; broad end-to-end coverage is not implied. |
| Scout-hold screening | Reviewed | Command versus position, consecutive/build gates, unknown counts and precedence. **F5** confirms incomplete cache validity. |
| Storage M1 metadata/payloads | Reviewed deeply | Temporary roots, connection settings, locking, transactions, ownership, publication, cleanup, bounded paging, overflow pinning, descriptor cleanup. **F1–F3** native reproductions on current and committed modules. |
| Catalog C1 | Reviewed deeply | Typed schema, frozen selections, atomic batches, immutable revisions, retries/workflows, non-owning references, bounded snapshots. Prior two fixes verified; **F4** remains. |
| Tests and resource gates | Reviewed/sampled | Targeted catalog checks, all storage/catalog tests, full repository suite and fresh scale gates. Adverse interleavings and selected-domain mismatch were missing. |
| Dependencies, generated files, typing | Reviewed setup; sampled typings | No npm dependencies. Node SQLite and registerHooks make generic “Node available” setup wording insufficient. Build generator/checker consistent; IDE typings are not an Arena engine test. |
| ADRs, architecture, handoff and diagrams | Reviewed relevant contracts; sampled historical chronology | All five workflow diagrams read; deployed v2 diagrams appropriately remain v2. Local link/anchor/JSON checks pass. Historical “current/unstaged” wording needs a navigation/status cleanup, not history erasure. |
| Bundled examples/reference material | Sampled/deferred | Squad reference contains Screeps World concepts, not drop-in Arena interfaces. No automatic deletion of unreferenced examples, typings or images. Exhaustive vendor/API-reference correctness deferred. |
| Production evidence/client state | Deliberately deferred | User prohibited real data processing and Arena operations. No claims about current capture hashes, queue, uploaded source, or client settings. |
| Other platforms/power-loss/OS close failures | Unqualified | Local process-crash/APFS observations only. Linux shim reports were leads, not qualification. No physical power-loss or arbitrary close-failure guarantee. |

## Representative end-to-end traces

1. **Runtime:** main.mjs → runTick → observation/membership/reset → objective and
   enabled escort (optional pair/allocation gated) → pre-action state →
   moveCreeps → executeTactics → CPU sample → diagnostic closure. Pair waits
   do not return from the whole tick. A follower uses the leader's old tile only
   after the leader's numeric OK; that remains scheduling, not displacement.
   [Tick-flow diagram](../diagrams/tick-flow.puml) matches these priorities.
2. **Capture:** exact cache request → bounded decompression/schema/build checks →
   validated replay-specific map → locked v2 manifest → pending/exclusive output →
   claim. Diagnostic-only logs have null output. Task claim/examined/completed
   is separate. Log done can reconcile automatically; score done retains bytes.
   [ADR 0005](../decisions/0005-replay-frame-scoring-evidence.md) explicitly allows
   exact re-import to restore a missing pending/done score file, but cleanup
   refuses missing done evidence before retiring. This is intentional, not a
   score-lifecycle defect.
3. **Analysis:** selected identities → source/map/output/raw-diagnostic validation →
   compatible merge/coverage → findings → optional score grouping/alignment →
   compact index/screen. Scores do not become terminal outcomes; accepted commands
   do not become displacement. Historical-index cache includes replay/map
   metadata; the scout-hold cache omits some of it (F5).
4. **Future storage/catalog:** fixture marker/descriptor → lock → write connection →
   short transaction → immutable publication → ready metadata → bounded pinned
   snapshot. C1 uses schema 2 and shared mechanics but does not wire existing
   readers/importers. F1–F3 break parts of this foundation; C1 must not bypass them.

## Confirmed findings

Severity P1 means a correctness/recovery blocker for the isolated storage/catalog
contract, not a demonstrated production incident. P2 means a narrower integrity
failure needing a bounded correction. Line references name the inspected
working files; M1 committed line offsets differ because of C1 adapter hooks.

### F1 — P1: asynchronous publication outlives its writer lock

Status: reproduced by the audit; corrected locally in the subsequent authorized
F1 task and passed focused review, still unstaged. The reproduction below records original
behavior, not current behavior. Other findings remain open.

- Code: [replay-store.js](../../tools/replay-store.js), writerCallback/publish,
  lines 409–493; withWriter, lines 531–535.
- Contract: ADR 0006 “Locking, publication and reader coherence”: all filesystem
  mutation remains under the owner lock; writer capabilities expire with callback.
- Minimal reproduction: start evidence-only publishPayload with an async source
  yielding its one expected byte, then suspend its next() before EOF. In the same
  callback await Promise.all of that publication and a sibling rejecting after
  the source suspends. Catch the outer rejection, acquire a second write handle's
  lock, then let the first source finish.
- Expected: no first-writer mutation after its lock is released; all started
  operations must settle or be safely prevented from mutating before another
  writer enters.
- Observed on both current and exact committed modules: lock was absent after
  the rejection; first destination did not yet exist. While the second writer
  held the lock, the first publication created the destination containing "0"
  and returned a ready reference.
- Root cause: active is checked for yielded chunks, but not the EOF continuation
  before fsync/link or every later awaited continuation. The callback finally
  expires the capability/releases resources without owning in-flight operations.
  A simple check at method entry is insufficient.
- Impact: overlapping writers can defeat callback-local ownership protection
  and publication serialization. No corruption of production data is claimed.
- Required regression families: sibling rejection/early return; EOF and
  existing-file verification suspension; output/payload/deletion continuations;
  second process/handle acquisition; primary-error preservation; valid sequential
  and concurrent-in-callback publication/retry. Bound fixtures and failure waits.

#### F1 correction follow-up

The writer now revokes outstanding file operations at callback exit, closes owned
temporary descriptors before releasing the lock, and guards await continuations
before filesystem mutation/checkpoints or successful publication references.
It does not drain an indefinitely suspended source. Returning with outstanding
operations rejects `INVALID_STATE`; callback failures retain their exact thrown
value, including `null`. Late otherwise-valid operations reject `CLOSED` without
mutation. Completed writes are not rolled back; pending intents, already-linked
files and failed temporaries remain recoverable. External iterator resources are
caller-owned, not forcibly cleaned up by the store.

Seventeen negative tests fail against preserved pre-fix bytes; all **18** new
checks pass after correction, including the positive concurrent/retry control.
Reserved payload/output and evidence-only EOF tests resume under a second writer's
lock and verify absent destinations, closed descriptors, unchanged checkpoints,
no successful reference and valid later retries. Existing-file, post-link and
final-return boundaries, deletion verification, and secondary close failures are
also covered. **85/85** combined catalog/M1 and **298/298** repository tests passed,
as did syntax/build checks and fresh M1/C1 resource gates. Details and measurements
are in the [M1 follow-up qualification](replay-storage-v3-m1-2026-10-03.md#writer-lifetime-correction-f1-qualification-2026-10-04).

This corrects F1's tested capability-lifetime defect without changing ADR
requirements. It does not fix F2–F5, qualify power loss/arbitrary OS close failure,
or authorize production integration/migration. No gameplay or evidence changed.

#### F1 focused review (2026-10-04)

No remaining F1 blocker was found. All ten files in the final F1 validation
receipt matched before review, including the four affected paths and shared C1
dependencies. The isolated F1 diff was compared with its saved pre-fix working
module, leaving C1 changes outside `writerCallback` intact. Review traced every
publication/deletion await continuation, callback revocation, descriptor ownership,
primary-error precedence and connection/lock release against ADR 0006.

The **18/18** writer-lifetime tests passed again on native Node 24.19.0/macOS.
One additional temporary synthetic probe suspended before the first source byte,
exited the callback with thrown `false`, then deliberately reused the closed
temporary's native descriptor number for another file. While a second writer
held the lock, resuming the source rejected `CLOSED`, produced no destination,
left metadata unchanged, and did not close the reused descriptor. A later writer
also succeeded. No platform shim or production evidence was used.

The unchanged **85/85** combined, **298/298** repository, syntax/build and fresh
M1/C1 resource-gate results were reused with byte correspondence; no whole-suite
or benchmark rerun was needed for this review. Only this audit documentation was
updated. Source, tests, ADR requirements, C1 work and both trial worktrees remain
unchanged. Caller-owned iterators may remain suspended, but do not retain the
revoked writer lock or store-owned temporary descriptor. This review does not
qualify arbitrary OS close-failure or power-loss behavior.

Next task: **F2/A2, publication completeness before log `claim`**. It was not
implemented or re-investigated here; F2–F5 remain open.

### F2 — P1: a log can be claimed with an unpublished reserved output

Status: corrected for reserved output completeness and passed focused review;
still unstaged. The following reproduction describes the pre-correction implementation.

- Code: [replay-store.js](../../tools/replay-store.js), reserveOutput and
  finishPublication, lines 325–336 and 350–405.
- Contract: pending → claim only after every expected owned artifact is durable
  and verified; evidence-only logs have null output fields, not missing JSONL.
- Minimal reproduction: create a map-linked pending log, reserve missing.jsonl,
  append a publish intent with files: [], then finishPublication with that intent.
- Expected: INVALID_STATE/incomplete publication, preserving pending record,
  output reservation and intent; no claim.
- Observed on both versions: status claim, output_path missing.jsonl, no file,
  zero remaining intents. Snapshot correctly rejects UNAVAILABLE.
- Root cause: completeness is checked against the supplied operation_files only;
  ready output ownership is independently required for scores, not file-backed
  logs. An empty/partial intent is mistaken for complete work.
- Impact: false operational readiness and lost targeted recovery intent.
  The snapshot guard limits downstream harm but does not repair the invariant.
- Required fix/test boundary: compare intent completion against the owning
  record's actual output/payload/review-payload reservations, including partial
  intents and mismatched expectations. Keep legitimate null-output evidence-only
  logs and exact retries working; rejection must be atomic.

#### F2 output-completeness follow-up (2026-10-04)

`finishPublication` now resolves the record's actual output ownership, requires
`ready` state and exact record path/hash projections, then requires the specified
matching publication intent to hold a `verified` checkpoint with that exact
path/hash/byte length. Validation precedes readiness writes and intent removal.
An empty/partial intent or another intent's receipt cannot satisfy this guard.
Output-free evidence-only logs and valid score publication/retries remain valid.
No file adoption, rehash-on-finalize, schema or ADR change was introduced.

Before correction, **19** of the new regressions failed; eight existing-behavior
controls passed. After correction, **27/27** pass across both collections: empty/
omitted output coverage, pending/unverified states, receipt/projection mismatches,
missing reservation/intent, atomic preservation and subsequent valid publication/
retry/finalization. Direct corruption is confined to synthetic fixture setup;
public-API empty/partial intents and hash/length mismatches are also exercised.
**56/56** affected checks, **112/112** combined storage/catalog and **325/325**
repository tests passed, along with syntax/build and fresh M1/C1 resource gates.
Measurements and scope are in the [F2 qualification](replay-storage-v3-m1-2026-10-03.md#output-completeness-correction-f2-qualification-2026-10-04).

F1 remains byte-identical and reviewed. This task did not extend other payload/
review dependency guards, repair F3–F5, or authorize integration/migration.
Unstaged C1 and unrelated work, gameplay/builds and both trial worktrees are
preserved; production evidence was not accessed. Broader readiness remains open.

#### F2 focused review (2026-10-04)

No remaining blocker was found in the reserved-output correction. All ten files
in the final F2 validation receipt matched before review. Comparing the storage
module with its saved pre-F2 working version isolated the finalization guards
from unchanged F1 and C1 work. The guards validate intent ownership/phase, owned
ready output, record path/hash projections, and the exact verified checkpoint
path/hash/length before any readiness write or intent removal. Rejection retains
committed pending state; finalization does not rehash files or adopt artifacts.

The **27/27** F2 checks passed again on native Node 24.19.0/macOS. They cover
empty/omitted coverage, pending/unverified state, receipt/projection mismatches,
missing reservations/intents, atomic rejection, subsequent matching publication
and retries for both collections, and output-free evidence-only logs. A separate
temporary synthetic probe used log and score records with identical replay and
fingerprint components: each rejected the other's intent with
`OWNERSHIP_CONFLICT`, preserving metadata/generation, checkpoints and file bytes.
Both then finalized with their own intents and opened a snapshot successfully.
Rejection accessed no payload bytes. `EXPLAIN QUERY PLAN` confirmed the two new
lookups use the unique owner and operation/path indexes, with no table scan.

The unchanged **56/56** affected, **112/112** combined, **325/325** repository,
syntax/build and fresh M1/C1 resource-gate results were reused with receipt byte
correspondence. The measured import remains 26 SQL calls at both 10 and 1,000
records, with unchanged payload-access bounds. No full-suite or resource-gate
rerun was needed for this documentation-only review. Only this audit record was
edited; implementation, tests, qualification record and ADR remain unchanged.

Next task: **F3/A3, fresh-handle hot-journal recovery under the writer lock**.
F3–F5 remain open. This review does not establish broader readiness, production
integration/migration, power-loss durability, arbitrary OS close-failure semantics
or additional-platform qualification.

### F3 — P1: no fresh writer handle can reach hot-journal recovery

Status: corrected and passed focused review; still unstaged. The reproduction
below describes the pre-correction implementation.

- Code: [replay-store.js](../../tools/replay-store.js), connection lines 162–184;
  openVersionedStore lines 218–234. Existing test:
  [replay-store.test.js](../../tests/unit/replay-store.test.js), lines 458–467.
- Contract: read-only access never recovers; a separately invoked writer can
  recover under the owner lock, validating descriptor/database identity.
- Minimal reproduction: close the fixture handle; child SQLite connection uses
  DELETE/FULL, small cache, BEGIN IMMEDIATE and uncommitted large property inserts;
  SIGKILL the child. Open fresh read and write handles.
- Expected: read reports RECOVERY_REQUIRED without mutation; an explicit fresh
  writer can obtain the lock and perform checked recovery.
- Observed in both versions: a 17,928-byte hot journal; both modes fail
  RECOVERY_REQUIRED, journal hash unchanged. No store handle exists through
  which to invoke withWriter.
- Root cause: open always runs read(() => null), including mode write. The
  existing crash test recovers using a handle created before the crash, hiding
  restart failure.
- Impact: public API dead end after restart despite recoverable SQLite state.
  Raw SQLite/manual lock removal is not an approved operational workaround.
- Required regression: process restart with no surviving handle, live-writer
  exclusion, unchanged read-only journal, bounded lock/busy failure, identity
  mismatch rejection and preserved committed metadata after writer recovery.

#### F3 restart-recovery follow-up (2026-10-04)

`openStore({root, mode: 'write', recover: true})` now provides explicit initial
validation/recovery under the existing owner lock; C1's `openCatalog` delegates
the same option to the shared core. After acquisition it revalidates the fixture
root and descriptor identity, then uses the existing checked writable connection
for native rollback and settings/database-version validation. Connections close
before lock release. Normal opens stay nonmutating; read-mode recovery is invalid.
No schema migration, generation increment, file-intent completion or raw SQL
escape hatch was added. Database identity is checked after SQLite can recover
its metadata, within the lock; descriptor identity is checked before writable open.

All **four** new tests failed against the saved pre-fix module and pass afterward.
Both schemas close original handles and kill a child with a spilled uncommitted
transaction, then recover in a different process through the public opt-in.
Fresh ordinary opens preserve database/journal bytes; live owners exclude
recovery; existing dead-owner rules allow it after termination. Full synthetic
table comparisons preserve committed metadata, generation and pending intents
while interrupted changes disappear. Version/identity/settings failures close
connections/release locks, descriptor replacement during acquisition fails, and
subsequent valid reads/writes succeed. Crash-left temporary artifacts are retained.

Validation: **8/8** affected, **116/116** combined and **329/329** repository tests,
syntax/build checks and fresh M1/C1 resource gates passed. See the
[F3 qualification](replay-storage-v3-m1-2026-10-03.md#fresh-process-hot-journal-recovery-f3-qualification-2026-10-04)
for measurements, exact scope and remaining limits. F1/F2 and C1 implementation
paths remain unchanged outside the shared initial-open branch. F4–F5 remain open;
no production evidence, integration/migration or gameplay was involved.

#### F3 focused review (2026-10-04)

No remaining F3 blocker was found. All ten files in the final validation receipt
matched before review. The diff against the saved pre-F3 working module changes
only explicit recovery-option validation and initial open; F1/F2 writer logic and
pending C1 adapters remain intact. Review traced runtime/root checks, descriptor
revalidation after owner-lock acquisition, checked writable SQLite access,
connection close before token-checked lock release, and unchanged default reads.
Recovery is not lifecycle cleanup and does not complete retained file intents.

The **4/4** restart regressions passed again on native Node 24.19.0/macOS,
covering both schemas in fresh processes, nonmutating ordinary opens, live/dead
owners, committed metadata/generation and intent preservation, interrupted
rollback, invalid modes/versions/identities/settings, and acquisition-time
descriptor replacement. Existing tests preserve crash-left lock-owner temporaries.
A separate temporary synthetic probe observed the same live owner token during
setting checks, metadata identity validation and connection close. Injected `EIO`
at a setting-check boundary and at identity-query preparation preserved the
original error, closed the connection before lock release, left database bytes
and a retained orphan unchanged, and allowed a subsequent recovery open.
The successful path verified the same ordering. No platform shim was used.

The unchanged **8/8** affected, **116/116** combined, **329/329** repository,
build/syntax and fresh M1/C1 resource-gate results were reused with byte
correspondence. No whole-suite or benchmark rerun was needed for this review.
Only this audit document was updated; implementation, tests, ADR and qualification
record were not changed. Both trial worktrees and unrelated project work remain
preserved, and production evidence was not accessed.

Next task: **F4/A4, finding evidence tick-domain compatibility**; F4–F5 remain
open. SQLite may recover before its metadata identity can be read, but only under
the lock and after descriptor validation. Native rollback duration, arbitrary OS
close-failure semantics, power-loss durability and additional platforms remain
unqualified; this review does not establish broader readiness or migration safety.

### F4 — P1: C1 sealed selection ignores evidence range dimension

Status: corrected and passed focused review; still unstaged. The following
reproduction records pre-correction behavior.

- Code: [replay-catalog.js](../../tools/replay-catalog.js), appendRunSources /
  appendFindingEvidence, lines 268 and 292–296.
- Contract: evidence belongs to the frozen selected range; runtime tick and
  frame game-time are separate dimensions until sourced alignment establishes
  a relationship. C1 gate 2 requires rejection outside sealed selection.
- Minimal reproduction: seal one capture with range
  {start:1,end:2,dimension:"runtime-tick"}. Publish a passed position finding
  citing that capture's evidence reference with range
  {start:1,end:2,dimension:"game-time"}, with no alignment relationship.
- Expected: reject the result atomically, retaining the running run and no
  new findings/links/receipt.
- Observed: completed run and passed finding. The exact mismatched ranges
  remain visible in the source/evidence rows.
- Root cause: finding publication checks numeric start/end containment but
  not the declared dimension. Conclusion interval checks cannot retroactively
  make the already published finding valid.
- Impact: a completed run can attribute an observation to an unselected
  evidence domain. Existing scope fixes are useful but incomplete at this boundary.
- Required regressions: both dimension directions, dimension-aware boundaries,
  missing/unknown dimensions under documented semantics, atomic rejection,
  compatible same-domain publication and exact retries. Do not invent alignment
  or expand C1 into frame analysis.

#### F4 finding-evidence domain follow-up (2026-10-04)

Finding publication now checks the sealed selection's range domain independently
of its existing numeric containment and provenance checks. Omitted/null dimension
fields use C1's existing runtime-tick default, without rewriting original values.
A domain-only selection still constrains its evidence; a missing/null selection
range remains unrestricted. `unknown` does not bypass domain restrictions, while
compatible unknown bounds remain supported where the selection allows them.
C1 has no domain-conversion interface: cross-question comparison policies and
opaque alignment metadata cannot turn equal tick numbers into sourced alignment.
No conversion mechanism or other finding fix was added.

**Nine** negative regressions failed before correction; all **10/10** targeted
checks now pass. They cover both directions, passed/unknown verdicts, defaults,
domain-only selections, alleged alignment, full transactional preservation and
successful matching publication/exact retry. **36/36** catalog, **126/126**
combined and **339/339** repository tests passed, with syntax/build and fresh
resource gates. The check adds no SQL or payload access and does not expand ticks.
See the [F4 qualification](replay-catalog-c1-2026-10-04.md#sealed-finding-evidence-domain-correction-f4-2026-10-04)
for exact semantics and measurements. Earlier C1 support/ownership fixes and
F1–F3 remain intact; F5 remains open. Broader readiness and durability/platform
qualification are not established.

#### F4 focused review (2026-10-04)

No remaining F4 blocker was found. All ten files matched the final validation
receipt before review. The isolated diff adds a domain check to
`appendFindingEvidence` without changing the existing numeric containment,
provenance, support grouping or transaction machinery. The check precedes link
publication/completion and applies to all verdicts, including `unknown`.
The result wrapper poisons a rejected transaction, so caught input failures
cannot commit partial findings or receipts.

Default semantics were checked against the pre-F4 implementation and earlier
qualification, not inferred from the new check: scope and conclusion-support
intervals already used `dimension ?? 'runtime-tick'`. This is comparison
normalization only; original omitted/null fields remain distinct in stored
receipts. A missing/null selection range is unrestricted, whereas a range object
constrains its normalized domain even without numeric bounds. Unknown evidence
remains permitted only within the selection's domain/numeric restrictions. C1
has no typed conversion path; cross-question authorization and opaque alignment
metadata do not map tick domains. Unrestricted selection does not authorize
later merging of incompatible intervals in conclusion support.

Fresh native checks passed **20/20**: all ten F4 cases, supported-verdict receipt
checks, parent/per-finding ownership, same/cross-question interval bounds,
coverage gaps, unknown coverage, incompatible domain/build support, bounded
multi-page inspection and explicit comparison/retry rules. F4 tests verify full
synthetic table/generation/selection preservation on rejection, successful
matching publication and exact retries, with zero payload access. No new probe
or implementation change was needed. The scalar check introduces no query,
corpus scan or tick expansion.

With byte correspondence established, the **36/36** catalog, **126/126** combined,
**339/339** repository, build/syntax and fresh resource-gate results were reused;
no full-suite/benchmark rerun was necessary. Only this audit record was updated.
F1–F3, pending C1 work, unrelated changes and both trial worktrees are preserved;
production evidence was not accessed. No staging, commit or push occurred.

Next task: **F5/A5, scout-hold cache validation of current replay/map
associations**. F5 remains open. This focused review does not establish broader
readiness, production integration/migration, power-loss durability, arbitrary
OS close-failure semantics or additional-platform qualification.

### F5 — P2: scout-hold cache bypasses changed replay/map validation

- Code: [scout-hold-screen.js](../../tools/scout-hold-screen.js),
  selectedEvidence lines 138–163 and cache hit lines 165–185.
- Contract: screening requires validated replay/map/build provenance; a cache
  hit must represent the inputs of the validation it reuses.
- Minimal reproduction: create a valid claimed synthetic analyzer fixture,
  screen once (miss), then change only its replay association mapId while
  retaining the selected record/map bytes. Screen again and run fresh analysis.
- Expected: changed association invalidates the cache or fails current validation.
- Observed: hit returns the old analyzer totals 33 pass / 0 fail / 4 unknown,
  while fresh analysis returns 8 pass / 2 fail / 1 unknown. Cached enemyRelease
  is unexercised in this fixture; it is NOT a reproduced false gameplay pass.
- Root cause: key hashes selected file/diagnostic bytes and several fields but
  omits replay association and relevant map registration metadata. Hit returns
  before analyzer validation. Historical-index cacheInput includes these inputs.
- Reproduction isolation: the screen module was evaluated in memory with only
  its fixed root redirected to a temporary synthetic fixture, local imports
  resolved to current modules, and its CLI entry guard omitted. No validation,
  cache or summarizer logic was changed; production cache was never accessed.
- Impact: cached screening can hide a newly invalid provenance relationship.
  No historical screening is declared invalid by this synthetic counterexample.
- Required tests: replay association and map registration invalidation,
  unchanged reuse, claim recheck, altered bytes and unavailable sources;
  do not replace this with unconditional expensive whole-corpus reanalysis.

#### F5 local correction — 2026-10-04, awaiting focused review

The original reproduction above remains historical evidence, not a claim that a
retained match was screened incorrectly. The correction in
[scout-hold-screen.js](../../tools/scout-hold-screen.js) includes the selected
association set (so duplicates matter), the first resolved registration, and
selected record validation fields in the cache key. Diagnostic wrapper identity
and version are hashed along with raw content; game-state and diagnostic coverage
remain distinct. Directory/manifest safety and schema, claims, selected file
availability/bytes, and expected build are checked before a hit. Unchanged valid
inputs still reuse the cached report; a changed invalid association recomputes
and fails the existing analyzer gate rather than returning stale success.

Legacy replay-only cache files are ignored and retained. New key-addressed files
also retain earlier selected-input reports; rejection does not overwrite a prior
report. No importer, analyzer, storage, gameplay, or summarizer behavior changed.
The [command documentation](../../README.md) describes the updated cache contract.

Before implementation, ten synthetic association/registration/record mutations
failed their expected-rejection assertions against the unchanged screen, and the
legacy-cache retention/recompute test also failed (11 failures, 8 passing controls).
The fixture executes exact copied tooling modules in temporary synthetic projects,
with the real compact analyzer, not an injected analyzer result. Later controls
cover valid provenance changes and fresh-summary equality, missing/altered map
bytes, diagnostic wrapper changes, manifest/directory aliases, unsupported schema,
claim/build rechecks, unrelated metadata hits, and restoration of prior cache keys.

Performance/access assessment: v2 still reads/parses its manifest and hashes only
selected capture/map files plus existing code dependencies. The extra association
filter and registration lookup inspect manifest metadata; no unrelated evidence
files, score sources, corpus hashing, or extra analyzer invocation on a valid hit
are introduced. Diagnostic hashes are computed per wrapper rather than joining all
raw diagnostics into one additional string. Synthetic unrelated records/maps point
to nonexistent files and still permit hits, guarding selected-file access. No
production timing or concurrency guarantee is claimed; v2 still lacks a coherent
snapshot against concurrent external mutation. Cache history can grow; cleanup or
storage redesign is outside this correction. M1/C1 resource algorithms and gates
are unchanged; their source-byte correspondence is checked separately below.

Final F5 validation on native macOS/arm64 Node 24.19.0:

- 24/24 screen tests (17 added cache checks and seven unchanged summarizer tests),
  within 78/78 affected screen/hold/analyzer/score/index tests.
- `npm test`: 356/356, including F1–F4/C1 regressions and fresh resource gates;
  `npm run check`: passed with the runtime build unchanged.
- Fresh 600 MiB M1 gate: generation 1.355s / 63.45 MiB peak RSS; operations
  0.201s / 71.91 MiB. Exact 10/1,000-record fixtures and selected-byte assertions
  passed; import used 26 SQL calls at each size. C1 gate: 1.423s / 68.66 MiB,
  identical fixed-operation counts at 10/1,000 anchors and zero payload access.
  These are observations under the existing limits, not new performance guarantees.
- Documentation: 41 local links, 12 anchors, no JSON examples in the two changed
  documents; tracked/untracked text whitespace checks passed.
- Before/after source hashes confirm no changes outside `README.md`, the screen,
  its tests, and this audit record. Both trial worktrees and all prior F1–F4/C1
  and unrelated work are unchanged; no production evidence was accessed.
  HEAD remains `48201957e5c69060085fd7f8e1609b140b1bfc57`; index remains empty.

Synthetic logs and preservation receipts are retained under
`/tmp/pain-gain-f5.X99x2i/`. F5 is **locally corrected, awaiting focused review**.
No historical screen was rerun. Production integration/migration, power-loss
durability, arbitrary OS close-failure semantics, and additional platforms remain
unqualified. This correction does not establish broader project readiness.

#### F5 focused review — 2026-10-04: passed

No remaining F5 blocker found. All four affected files matched
`/tmp/pain-gain-f5.X99x2i/validation-receipt.json` before this documentation-only
review update. The full non-evidence source hash inventory also matched that
validation run, including prior storage/catalog work and both trial worktrees.
The unchanged 78 affected / 356 repository tests, build/syntax checks, and fresh
resource-gate results above are reused, not reported as rerun here.

Dependency trace against [replay-analysis.js](../../tools/replay-analysis.js):

- `selectedEvidence()` checks current manifest/directory safety and supported
  container shape before lookup. Selected record membership, fingerprints,
  schema/provenance fields, output path/hash/bytes, map linkage, diagnostic
  wrapper key/type/version/raw content, and both coverage projections enter the
  key. Claims are rechecked independently; JSON review checkpoints do not affect
  analyzer findings and are deliberately excluded from the key.
- All selected replay associations (including duplicates) and the analyzer's
  first matching registration contribute their consumed fields. A reusable
  successful report required registration/record file equality; hashing that
  selected map's current bytes therefore covers the resolved map file as well.
  Invalid linkage changes miss and are rejected by fresh validation.
- Dependency hashes cover the screen, analyzer, importer validators, score
  analyzer, local build file, and configuration. There is no whole-corpus hash
  or unrelated evidence read. Legacy replay-only entries are not candidates;
  failed refreshes leave old key-addressed reports intact. Review/annotation
  and unrelated replay changes retain valid hits.

Fresh native synthetic review checks passed **26/26**: the 24 unchanged screen
tests plus two additional scratch probes. One checks all six dependency files
invalidate once, then hit, with prior entries retained. The other uses a real
file-backed snapshot and checks eleven invalid mutations (source key, status,
requested tick, source entry, import timestamp type, output hash/null pairing,
changed/missing/symlinked JSONL, and diagnostic coverage). Each is rejected in
agreement with fresh analysis; failed refresh preserves cached bytes and restoring
the original input restores a hit with matching analyzer totals. These probes
address gaps in the evidence-only cache fixtures without modifying project tests
or implementation. Artifacts: `/tmp/pain-gain-f5-review.lxZkEZ/`.

Only this audit record changed during review. Local documentation links/anchors
and tracked/untracked whitespace passed. HEAD and the empty index remain
unchanged; F1–F4/C1, unrelated rules/images/deletion, runtime/builds and both trial
worktrees were preserved. Production evidence/reviews were not accessed.

Next task: **audit-status consolidation and separate commit-candidate
preparation**, not performed or staged here. Passing F5 neither declares any
historical screening wrong nor measures production performance. Coherent reads
under concurrent external file mutation, storage integration/migration, broader
readiness, and durability/platform qualification remain outside this review.

## Original-audit C1 checks and retained limitations (historical)

This section records the original audit, before the subsequent F1–F5 corrections
and focused reviews above. It is not the current readiness verdict.

Fresh targeted checks passed 9/9, covering the earlier child-parent override and
unsupported interval claims plus atomic frozen runs/retries. Tests assert no
partial findings, links, new evidence references, workflow receipts, revisions
or advanced head after rejection, followed by valid submission and exact retry.
The missing-per-finding-evidence check also passes; declared totals cannot
substitute for each finding's own links. Inclusive endpoints, scope aliases,
cross-question authorization, actual interval unions, unknown bounds,
incompatible provenance, multi-page bounded support and byte overflow are tested.

C1 immutable histories, terminal workflows, concurrent expected-head writers,
before/after-commit failures, retirement traceability and metadata-only snapshots
also pass their existing tests. These results do not cover F4; they do not
establish truth of caller-supplied validator receipts. C1 additionally inherits
the M1 blockers through the shared core. Its candidate is not ready to close.

Earlier M1 fsync retry, committed score-retiring authorization, cross-kind
ownership, role/path validation, current review values, complete role-filtered
snapshots, overflow pinning, active-intent exclusion and every-close cleanup
regressions passed unchanged. F1 is an asynchronous-lifetime gap beyond those
ownership checks, not evidence that their narrow fixes regressed.

## Original-audit test quality and checks actually run (historical)

All data-processing probes used temporary synthetic roots. Existing tests create
and clean up only their own synthetic fixtures. Audit reproduction roots were
retained in OS temporary storage; no prior project file was deleted.

| Check | Actual result |
| --- | --- |
| Prior C1 receipt correspondence | All eight candidate file SHA-256 values matched the final correction receipt |
| Native M1 probes | All three reproduced on working tree AND byte-exact exported HEAD modules; no platform shim |
| C1 targeted corrections | 9/9 passed; separate domain probe confirmed F4 |
| Screen cache probe | Confirmed stale cache hit versus fresh provenance-validation failure |
| Catalog + M1 focused suite | 67/67, 26.796 seconds |
| Repository suite | 280/280, 27.600 seconds |
| npm run check | Passed all registered syntax checks and unchanged generated runtime build |
| Existing local docs scan | 29 non-vendored Markdown files; 442 local link targets, 318 anchors and 23 JSON examples; no failures |
| New report checks | 19 local links and four anchors passed; tracked diff and new-file whitespace checks reported no errors |

Fresh focused-suite resource gates (not reused performance estimates):

- C1: exact 10/1,000 capture anchors, 0.427 seconds, 68.41 MiB peak RSS.
  Fixed list/lookup/support/history/review SQL counts 2/5/2/2/11 and returned
  rows 11/2/2/2/4 at both sizes; zero payload access.
- M1: 629,145,600 unique accumulated bytes; generation 1.419 seconds,
  63.78 MiB peak RSS; operations 0.216 seconds, 71.53 MiB peak RSS.
  Exact 10/1,000 metadata counts; list/lookup/review/import SQL counts
  2/1/11/25 at both sizes. Metadata reads zero payload bytes; imports access
  only their new 12/14-byte payloads. The 192 MiB heap, 256 MiB RSS and
  60/30-second deadlines passed. Full suite independently reran both gates.
- These count application SQL/rows/artifact I/O, not SQLite internal page I/O.
  Fixtures measure bounded operations, not analyzer memory, arbitrary power loss,
  physical flush reliability or other platforms.

Strengths: known-answer command traces, source/build mismatch cases, explicit
unknowns, atomic rejection, process concurrency, fault boundaries and real scale
assertions. Gaps: hot-journal test keeps a pre-crash handle; publication tests
mostly await one operation before advancing; readiness tests assume a complete
caller-supplied intent; conclusion dimension tests do not test sealed-source
dimension mismatch; screen tests cover the summarizer but not cache provenance.
Dense one-line catalog methods/tests increase review cost. These are reasons to
add focused negative tests, not weaken contracts or substitute suite counts.

## Dependency-ordered completion plan

Each task needs separate implementation authorization. None was implemented by
the original audit; A1–A5 were subsequently authorized and locally corrected
as recorded above. A1–A5 passed focused review. “Complete” means its acceptance checks pass on exact reviewed
bytes; it does not mean production storage or strategic benefit is qualified.

| Task / priority | Scope and prerequisites | Acceptance and validation |
| --- | --- | --- |
| **A1 — focused review passed, unstaged** | F1 writer-lifetime correction, separately authorized after this audit; no C1 schema change. | 17 negative regressions fail before/pass after, positive concurrency control passes, 85 combined/298 repository tests and fresh resource gates pass. Fresh review: 18 targeted tests plus native descriptor-reuse probe pass; retain remaining qualification limits. |
| **A2 — focused review passed, unstaged** | F2 reserved-output completeness after A1; only finalization guards and targeted tests. Other payload/review dependency guards unchanged. | 19 regressions fail before/pass after; all 27 targeted, 56 affected, 112 combined and 325 repository checks pass with fresh resource gates. Fresh review: 27 targeted tests, cross-record intent rejection/preservation probe and indexed-query plans pass; retain remaining qualification limits. |
| **A3 — focused review passed, unstaged** | F3 explicit fresh-handle recovery after A1/A2; no raw DB recovery escape hatch. | Four pre-fix failures now pass across both schemas; 8 affected, 116 combined and 329 repository checks plus fresh resource gates pass. Fresh review: 4 restart checks and lock-token/connection-cleanup boundary probe pass; retain qualification limits. |
| **A4 — focused review passed, unstaged** | F4 at C1 finding-to-sealed-source validation; earlier integrity fixes preserved. No domain conversion API added. | Nine pre-fix failures now pass; 10 targeted, 36 catalog, 126 combined and 339 repository tests plus fresh gates pass. Fresh review: 20 domain/default, atomicity/retry, ownership and bounded-support checks pass; retain qualification limits. |
| **A5 — focused review passed, unstaged** | F5 selected-input cache dependency correction; independent of M1/C1. | 24 screen / 78 affected / 356 repository checks passed. Focused review: 26 synthetic checks, including file-backed invalidation and six code/config dependency changes; invalid refreshes preserve cache history. No historical screen rerun. |
| **A6 — consolidation and candidate preparation complete, unstaged** | All five focused reviews passed. M1 and F5 are base-independent; C1's schema-2 adapter and recovery coverage follow M1. Cross-project closeout documentation accompanies C1 last. | [Exact candidate scope and isolated validation](audit-candidates-2026-10-04.md). No open reproduced F1–F5 blocker; real index stays empty. Review of prepared patches and staging/commit/push authorization remain separate. |
| **D1 — documentation cleanup** | After correctness tasks or separately: current-state entrypoint and runtime prerequisites. Do not rewrite historical results. | README distinguishes generic Arena code from Node 24.19+/macOS/APFS storage tests; M1 “unstaged” wording identified as historical; link current build/status and open audit findings. Local links/examples and no source/build changes. |
| **D2 — optional maintenance** | After A6: improve readability and focused error-schedule fixtures in dense catalog/storage tests. No new abstraction without measured reuse. | Preserve public interfaces, schema, fingerprints and behavior; negative tests unchanged; full suite/check and selected resource parity. Avoid mass reformatting that obscures correctness patches. |
| **D3 — optional repository inventory** | Separately owned task: classify examples, typings, historical docs and unused convenience exports by provenance/callers. | Prove obsolescence before proposing deletion; keep reference World examples labeled rather than copying into Arena. No deletion based solely on no references. Preserve user rules/images/prompt changes. |

### Later milestones, not cleanup obligations

- **C2** remains deferred catalog-owned body publication, large result staging,
  general evidence snapshots and cleanup-event integration; requires its own
  bounded design/qualification after core repair.
- **M2** reader/importer/cache integration must cover every v2 consumer and preserve
  log versus score lifecycle, bounded legacy reads and fingerprint semantics.
  Current analyzers still materialize selected inputs and the v2 manifest.
- **M3** migration/export/verification/rehearsal/rollback requires fresh complete
  backup, frozen-source identity, resumable conversion and separately authorized
  isolated rehearsals. The old pre-recovery backup alone is insufficient.
- **M4** production cutover remains explicitly separate. No audit, commit or
  synthetic suite authorizes it. Rollback after new writes cannot restore an
  obsolete snapshot; oversized legacy export is not usable legacy rollback.
- Recorded v2 manifest capacity remains a real deferred operational risk:
  compact serialization still reads/writes a whole string. The 474,810,505-byte
  figure is the earlier documented measurement, **not reread in this audit**.
  Do not address it by deleting retained reviews or bypassing M2–M4.
- Large selected score analysis used 3,267,641,344 peak resident bytes in the
  [recorded production compact run](replay-score-production-validation-2026-10-02.md#compact-historical-index-follow-up--2026-10-02).
  Compact output/storage scale results are not proof of bounded analyzer memory.
  No new performance optimization is justified without a selected workload.

### Gameplay questions remain separately deferred

The [pair screen](squad-pair-experiment-2026-10-02.md#fresh-one-game-screen--temik911-v208)
records replay 6abff2962ea5a31135f73f90, 24 following transitions and tick-25
lifetime release on the enabled build; subsequent retention reached tick 1698,
not the advertised tick 1699. Recovery, congestion, priority handoffs and benefit
remain unexercised/unverified. Main pairing remains OFF.

[Scout release](scout-hold-experiment-2026-10-02.md#controlled-live-release-feasibility--follow-up)
remains pending/unexercised; available opponent selection is not proof of a
reproducible controlled setup. Do not request random retries.
[Escort comparison](historical-evidence-cycle-2026-10-02.md#follow-up-healer-escort-benefit-comparison)
remains inconclusive: same enabled policy, different maps/opponents, little
escort exposure and incomplete score provenance. Revisit only with a predefined
outcome, appropriate comparison design and compatible sourced observations.
No command scheduling, same-snapshot policy reproduction or isolated win
establishes strategic benefit.

## Reproduction and preservation record

Local scratch artifacts: /tmp/pain-gain-audit.vjK98x/. They include m1-probes.mjs,
byte-exact committed module copies, c1-domain-probe.mjs, screen-cache-probe.mjs,
native outputs, test/check logs, link-check script/results and preservation
receipts. Temporary paths are diagnostic conveniences, not durable evidence
identities. Rebuild synthetic probes from the finding-section recipes if they expire.

~~~sh
# From repository root; scratch probes retain only newly created synthetic roots.
node /tmp/pain-gain-audit.vjK98x/m1-probes.mjs
AUDIT_STORE_DIR=/tmp/pain-gain-audit.vjK98x/committed \
  node /tmp/pain-gain-audit.vjK98x/m1-probes.mjs
node /tmp/pain-gain-audit.vjK98x/c1-domain-probe.mjs
node /tmp/pain-gain-audit.vjK98x/screen-cache-probe.mjs
node --test --test-name-pattern='child evidence|every finding|conclusion scopes|comparison scope|interval unions|unknown coverage bounds|finding boundaries|support inspection|exact retries' tests/unit/replay-catalog.test.js
node --test tests/unit/replay-catalog.test.js tests/unit/replay-store.test.js tests/unit/replay-store-payloads.test.js
npm test
npm run check
~~~

All pre-existing tracked/nonignored-untracked file bytes (including candidate,
rules/images and both trial worktrees), missing-file markers, HEADs and index
state were compared before/after. Production evidence was excluded from hashing
as well as processing; preservation is by non-access and no production command,
not a new claim of byte-hash verification. No review claim/examination/completion
bookkeeping occurred. Only this new architecture document was created in the
repository. No source/configuration/dependency file changed.

Manual action: NONE.
