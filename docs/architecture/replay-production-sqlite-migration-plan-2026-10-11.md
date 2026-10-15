# Minimal production replay-storage migration plan

Created: 2026-10-11. Status updated: 2026-10-15. **This plan grants no execution,
migration or activation authorization.** Separately authorized backup-snapshot
rehearsal results are recorded below. Production remains file-based managed v2. This plan
applies [ADR 0006](../decisions/0006-replay-storage-v3.md), not a competing schema
or a relaxation of its M2/M3/M4 gates. Automatic collection and coordinator work,
tactical work, arrival hold and unrelated storage diagnostics remain paused.

## Current state and evidence

### Publication consolidation — 2026-10-15

The current source/runtime dependency set matches retained candidate-11; the
qualification plan also contains the independently verified documentation edit
from the failed coordinator task. Document verification does not convert that
failed supervisor workflow into acceptance or authorize execution. Consolidation
reuses retained focused validation and records current checks separately, without
rerunning any snapshot qualification or reading protected payloads.

Candidate-11/harness-v8's consolidated cache/import/scan/post-write recovery run
is still the next separately gated project milestone. Production stays managed
v2; fresh-source inventory, quiescence/old-writer fencing, compatible retained
release, durability decision, cutover/write-enable and recovery approvals remain
required. M2h remains paused and unqualified. Converter performance tuning and
supervisor development are stopped for this consolidation; the archived formatter
pilot's v5/v7 smoke mismatch is parked and grants no authority.

### Inventory-bound rehearsal continuation — 2026-10-15

Selected log/score imports and a bounded approved-log scan now connect through a
distinct rehearsal capability pinned to release, original source inventory,
snapshot binding, destination and operations. Original transports remain read-only;
no synthetic relabelling, production lease or arbitrary directory discovery is used.
The scan's existing reconciliation is neutral-only; status migration/deletion
remain excluded. Converted no-ops preserve generation/reviews/provenance, and new
responses retain already-verified map bytes instead of requiring reserialization.

The [consolidated plan](replay-real-data-recovery-qualification-plan-2026-10-14.md#consolidated-successor--2026-10-15)
adds exact cache classification, 291 log reimports/scan and 95 separate score
imports to conversion, permitted isolated review writes and independent recovery.
Generated validation is retained under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-inventory-imports-20261015-2mP9Yd/`.
Candidate-10 and previous releases remain unchanged. Real cache/snapshot execution
requires the new pinned scope's separate authorization; current-source freshness,
production authority, durability decisions and M2h are not established here.

### Oversized score validation — 2026-10-15

The bounded cache inspection recorded `/validation` up to **69,624 bytes**, affecting
74 provenance files. That read-only result is reused; no real payload is reread for
this correction. Generated imports now publish values above 16 KiB through the
existing external-property intent and reconstruct them through the existing score
reader. Both inline ceilings are unchanged; external validation is capped at 1 MiB
and aggregate score metadata at 2 MiB, with all other limits preserved.
See [the exact contract](replay-synthetic-imports.md#external-score-validation--2026-10-15).

Candidate-10 and the updated harness are retained separately under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/score-validation-property-20261015-GDBRFY/`;
`report.json` records exact hashes, focused results, self-review and preservation
limitations. Candidate-09 and older bundles remain unchanged. This demonstrates
generated import/reimport, analysis, converted no-op, current-state recovery and
the existing **capped** administrative export—not real import/scan qualification.

The next required scope is one consolidated candidate qualification that includes
original-transport import/reimport/scan behavior and post-write recovery, bound to
an exact independently verified cache inventory. The old eight-phase snapshot-only
harness cannot establish that coverage; no additional snapshot-only run is proposed
or authorized. Its successor real plan is deliberately execution-blocked pending
that concrete combined scope/authorization. Existing snapshot evidence is retained,
not repeated. Fresh-source/quiescence, durability, authority/cutover approvals and
M2h gates remain separate and open.

The earlier consolidated preparation identified the concrete connection blocker:
candidate-10's rehearsal dispatcher has no original-cache import/score-import/scan
scope. Production leases are not a substitute without genuine qualification and
approval. Candidate-10/harness-v7 remain immutable/fenced. The inventory-bound
successor described above addresses this connection with generated validation.
The [historical blocker](replay-real-data-recovery-qualification-plan-2026-10-14.md#historical-candidate-10-preparation-blocker--2026-10-15)
retains the exact control-derived input sets and original limits. Only the new
consolidated command may be considered for separate execution authorization.

The original 2026-10-11 assessment recorded main ref
`9434c5f5d8dd44fa3a3ec5f786be3b2ba32bc64c` and a production
`replay_logs/manifest.json` size of **533,731,722 bytes**. These are historical
observations, not fresh production/ref certification in this update. The backup
snapshot's manifest has that same recorded size; no payload is reread here.
File bytes are not UTF-16 string length; no safe remaining write allowance is
established by subtracting this size from Node's string limit.

| Area | Demonstrated / implemented | Production gap |
| --- | --- | --- |
| Operational index | [Storage core](../../tools/replay-store.js), schema 1, guarded fixtures/rehearsals and [descriptor-bound production wiring](replay-production-authority.md), tested on generated fixtures only | No actual activation; fresh production-candidate qualification, required consumer representations and approvals remain open |
| Payloads | [Payload layer](../../tools/replay-store-payloads.js): immutable owner-qualified files and ordered diagnostics; exact preservation demonstrated for the selected backup snapshot | Other legacy variants, individual-value capacities and lifecycle operations need their own coverage |
| Conversion | [Bounded streaming converter](replay-bounded-conversion-fixture.md) and separate receipt-bound rehearsal interface converted/resumed the 533,731,722-byte snapshot | No current-production conversion or activation; post-write recovery is demonstrated only for the isolated snapshot and selected writes |
| Readers/reviews | Existing bounded consumers now connect to an explicit production descriptor lease as well as their unchanged fixture routes | Deployed/default routes remain v2; full caller/report compatibility and fresh production lifecycle/M2h acceptance remain open |
| Verification | Eight real-backup snapshot phases passed, including selected consumer writes, current-state backup, independent restore/repeat and restored authority/consumer access; synthetic SIGKILL and scale evidence is retained separately | Current-production freshness, complete production routing, candidate/platform durability, cutover and M2h remain open |
| Runtime/platform | Rehearsal used Node 24.19.0 and the existing guarded local macOS storage contract | Broader runtime/filesystem qualification remains; no default-Node substitution or weakened guards |

Evidence references (local, retained; not new runs):

- Assessment: `/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-assessment-20261011-xMFTTr/assessment.md`.
- Correction/tests: `/Users/zoltanka/.local/share/pain-and-gain-evidence/v2-conversion-fixes-20261011-AIGR0D/report.json`.
- Reviewed slice: `/Users/zoltanka/.local/share/pain-and-gain-evidence/v2-conversion-fix-review-20261011-JEamTX/report.json`.
- Operational backup/restore: `/Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/report.json`.
- Real-backup execution/preservation: `/Users/zoltanka/.local/share/pain-and-gain-evidence/real-backup-1800s-20261013-1adlVw/report.json`.
- Completion summary: same execution directory, `completion.json`.
- Process-crash recovery: `/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-recovery-crash-20261014-BY9UKe/completion.json`.
- Full-scale synthetic recovery: `/Users/zoltanka/.local/share/pain-and-gain-evidence/full-recovery-qualification-20261014-LOVvn7/report.json`.
- Completed eight-phase snapshot qualification: `/Users/zoltanka/.local/share/pain-and-gain-evidence/real-data-recovery-qualification-vf0qzG-20261014-01/execution-report.json` (SHA-256 `26c09fe43b61b5a7847c5bc9b3a304756961968b7d5da45c78548285c2511a90`).

### Demonstrated backup-snapshot milestone

One authorized conversion and one gated resume succeeded in a new isolated
destination, with `productionAuthority: false`. Independent preservation checks
after each covered **291 logs, 95 score records, 45 maps and 45 replay associations,
670 reviews, 11 explicit historical fingerprints and 1,076,573 diagnostic
wrappers**, including 8,471 metadata/property comparisons. Store ID
`44ea0428-ef38-4e96-ad4c-4b060df05c9e`, generation **1615**, commitments and all
**799 retained file hashes** remained unchanged across resume. All 432 backup
source files / 778,354,114 bytes and pinned controls remained unchanged; checked
repository/index state was preserved. Child exits and normal lock release were
confirmed. Previous failed destinations were retained and untouched.

Conversion took 841.162 seconds; resume took 538.819 seconds. Independent
verification took 214.355 and 199.554 seconds. All phases exited zero under the
authorized 1,800-second internal / 1,860-second outer limits. Charged JavaScript
I/O was 90.5 GiB against 2 TiB; retained output was approximately 817 MB against
8 GiB. Peak sampled heap/RSS was approximately 103/377 MiB. Native SQLite I/O
was unmeasured; memory/output sampling and cooperative checks are not universal
hard guarantees. The tested residency batching improvement is retained; further
converter performance tuning is stopped.

This is preservation evidence for a **recorded operational backup snapshot**,
not current production, a complete historical archive or off-device disaster
protection. It establishes no consumer parity, authority switching, lossless
post-write rollback, whole-match analysis readiness or renewed M2h qualification.
Unsupported legacy variants and remaining gates below stay explicit.

### Completed real-backup snapshot recovery qualification — 2026-10-14

The separately authorized eight-phase run **completed**: source verification,
conversion, independent preservation, selected consumers, post-write recovery
preparation, independent restore, unchanged repeat and restored authority/consumers.
All eight children and the parent exited zero, with confirmed shutdown and no
retry. The prepared run is no longer awaiting authorization; **do not rerun it**.

The receipt above pins immutable release-06 (`release.json` SHA-256
`a65751640f4dcb8788c7337cfcfd9db778e333b7ee4f4982cfcb5f5dbf4aa0ec`),
harness-v4, Node 24.19.0, schema/capabilities, controls and isolated destinations.
Coverage was **432 source files / 778,354,114 bytes; 291 logs, 95 scores, 45 maps,
45 associations, 670 original reviews, 11 historical fingerprints, 1,076,573
diagnostic wrappers and 8,471 property comparisons**. All 431 original payloads
/ 244,622,392 bytes matched; post-write recovery preserved ordered typed state
and all **796 referenced artifact hashes / 806,469,143 bytes**. Repeat restore
changed no retained bytes. Store `82a158ce-e849-4db3-aa7a-472975d91ad5` advanced
from generation **1615 → 1619 → 1623**, solely through the permitted new log/score
claim/examined operations on converted and restored copies (reviews **670 → 672
→ 674**). Original snapshot reviews and all source files/13 controls remained
unchanged. The original selector stayed recovery-fenced; only the restored
isolated authority was selected, always `productionAuthority: false`.

The run took approximately 28.1 minutes across phases; instrumented JavaScript
I/O was 96,822,015,299 bytes, sampled heap/RSS approximately 103/399 MiB and
retained output approximately 2.45 GB. Fixed per-phase 1,800/1,860-second,
256/512 MiB, 16 GiB retained-output and 2 TiB I/O budgets held. Native SQLite
I/O and some module-loader I/O were unmeasured; cooperative/polled checks and
metadata-check/open races retain their limitations.

This closes the isolated **recorded 2026-10-11 operational snapshot** recovery
gate for those operations, not every synthetic command or legacy representation.
Selected analytical JSON matched; this is not a claim that every analytical
finding passed, nor live ownership/alignment or gameplay benefit. Historical
exclusions remain preserved, not archived by this scoped backup. Same-filesystem
copies are not disaster protection. Current-production freshness, arbitrary
power-loss durability, production routing/cutover and renewed M2h qualification
are **not** established. No payload verification or execution is repeated here.

### Demonstrated process-crash and full-scale synthetic recovery — 2026-10-14

Seven SIGKILL cases around backup completion, source fencing, restore publication
and authority selection recovered through the retained release. The normal
dead-owner lock protocol, independent restore, incomplete-access fencing and
source data preservation held at those named boundaries. This is process-crash
evidence, not arbitrary instruction-boundary, torn-write or power-loss evidence.

One separately authorized full-scale **generated** source then passed generation,
independent verification/source pinning, backup, restore, unchanged repeat,
restored authority selection and selected consumer operations. All seven child
exits were zero with confirmed termination and no retries. Coverage was 291 logs,
95 scores, 45 maps/associations, 670 source reviews, 11 explicit historical
identities and 1,076,573 diagnostic wrappers. Serialized diagnostic collections
measured 533,731,722 bytes (physical envelopes: 562,475,892 bytes); original
artifacts measured 244,622,392 bytes. This directly generated SQLite state,
not a new conversion of the production manifest or a real-data distribution.

Store `9e1babd7-a899-4ef5-9514-b4701606557d`, generation **1164**, complete ordered
typed table facts and **724 referenced artifact hashes** matched through backup,
restore and repeat. Restored consumer reads and claim/examined writes succeeded.
Those later writes intentionally change the restored state; its post-consumer
generation was not separately queried. Source data stayed unchanged except the
planned authority fence. The checked repository/index and retained release/control
bytes were preserved; no production authority or real evidence was accessed.

Combined child phase time was 236.441 seconds. Instrumented JavaScript I/O was
26,260,057,877 bytes (about 24.5 GiB), sampled peak heap/RSS about 46.8/176.5 MiB,
and retained artifacts about 2.44 GB, within fixed 1,800/1,860-second per-phase,
256/512 MiB, 16 GiB retained-output and 2 TiB I/O budgets. Native SQLite I/O is
unmeasured; module-loader interception, cooperative checks and 500-ms monitoring
do not establish universal hard resource guarantees. Same-filesystem copies are
not off-device disaster protection. Full receipts and independent control copies:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/full-recovery-qualification-20261014-LOVvn7/`.

The retained release inventory is pinned at
`94365c8f527fa534a4182958f27436887127594b9df004eddc6b5f8c42d4f90b`;
exact runtime/schema/capabilities and the next isolated run are recorded in the
[real-data qualification plan](replay-real-data-recovery-qualification-plan-2026-10-14.md).
At that planning point it was blocked on the rehearsal scope connection.
The subsequent guarded connection below closes the small-fixture interface gap;
the later snapshot qualification is recorded above. The original synthetic
consumers/selectors/recovery accept synthetic fixture roots; the real
converter creates a distinct receipt-bound rehearsal root. Neither markers nor
real evidence may be relabelled to bypass that boundary. These results qualify
the demonstrated synthetic workload only; the later real-data result has its
own limited scope and does not qualify a production release. Remaining gates
are not closed by adding prior passing test counts.

M2h remains **paused and unqualified**. Its lost supporting evidence is not
restored by old passing labels or by this slice. The local historical
`replay-storage-v3-m2h-acceptance-retention-2026-10-07.md` addendum, the
[retention requirements](local-storage-maintenance.md) and unchanged acceptance
gates remain controlling. That unreviewed M2h preparation stays local, outside
this publication; this plan does not reopen it.

## Minimum storage boundary and consumer inventory

Reuse schema-1 operational tables and existing interfaces: indexed identities,
records, map/replay/build links, review owners/checkpoints, property/collection
presence and ordinals, retired identities, output reservations and operation
state. Keep originals (JSONL, score bodies, maps, receipts) as immutable files
with exact path, owner, hash and length. Large diagnostics/unknown values use
existing sidecar encodings, not database blobs or one giant JSON column. Keep
existing artifact names. Static WebStorm DDL is editor assistance, not schema
authority. No catalog expansion or diagnostic occurrence index is needed.

The following is the inspected production consumer surface. Recheck it against
the eventual candidate before cutover; external/ad-hoc callers and retained
trial binaries must be explicitly fenced, not assumed absent or silently edited.

| Consumer / entrypoints | Current whole-string dependency | Required removal / integration |
| --- | --- | --- |
| [replay-logs.js](../../tools/replay-logs.js): log/score imports, map association/checksum upgrade, local registration, status migration | `readManifest` parses all JSON; `saveManifest` stringifies all records | Indexed lookups, bounded property access, short transactions and existing publication intents; preserve deferral, exact retry, conflict and global path-ownership rules |
| Same module: log claim/examined/complete/done; score claim/examined/done/verify/cleanup | Review/status writes and score verification use the same whole-manifest helpers | Reuse [review checkpoint](../../tools/replay-review-fixture.js) seam; integrate other lifecycle paths only after their own gates; no fallback writes to frozen v2 |
| Same module: `scan`, `watch`, `list`, `reconcileCleanup`, maps and `other` | Scanning/listing can reconcile and delete; maps/other load all metadata | Paginated indexed traversal and bounded diagnostic output; distinguish mutating legacy commands from read-only store APIs; never invoke reconciliation during migration |
| [replay-analysis.js](../../tools/replay-analysis.js), `replay:analyze` | `analyzeReplay` reads entire buffer/string; selects afterward | Reuse [log](../../tools/replay-analysis-fixture.js), [score](../../tools/replay-score-analysis-fixture.js) and [combined](../../tools/replay-combined-analysis-fixture.js) pinned-view seams; selected metadata only; update async callers together |
| [replay-score-analysis.js](../../tools/replay-score-analysis.js) | Receives full manifest from analysis; global ownership/optional-collection checks | Receive selected originals plus indexed global ownership and collection-presence facts; retain raw-response validation and unknown/fail semantics |
| [historical-index.js](../../tools/historical-index.js), `evidence:index` | `buildHistoricalIndex` parses whole manifest | Indexed selections/current-retired distinction, claims and associations; use ADR's versioned cache domain and selected logical inputs, not database-wide hashes |
| [scout-hold-screen.js](../../tools/scout-hold-screen.js), `scout-hold:screen` | `selectedEvidence` parses whole manifest; hashes materialized diagnostics | Share one pinned selection with analysis; incremental ordered diagnostic/raw-string hashes and versioned cache domain; no tactical activation |
| [replay-other.js](../../tools/replay-other.js) | Production caller supplies already-materialized `otherEntries`; legacy writer stringifies one wrapper | Stream selected diagnostic envelopes and overflow values with backpressure; no unbounded wrapper string or array reconstruction |

### Command coverage reconciliation — 2026-10-13

The table distinguishes **implemented/tested synthetic subsets**, **unsupported
cases**, **unconnected APIs** and **unverified production behavior** at that earlier
reconciliation. Deployed/default production still uses v2; the later descriptor
wiring below now connects the candidate's ordinary entrypoints. V2 references in
this historical table describe the default branch, not an absence of that new
wiring or qualification of it. The retained receipt for this table is
`/Users/zoltanka/.local/share/pain-and-gain-evidence/synthetic-import-routes-20261013-8xgqCR/report.json`:
221 distinct focused checks (44 imports, 102 review, 45 analysis and 30 historical/
screening compatibility) on Node 24.19.0. At the prior coverage reconciliation,
inspected candidate bytes matched that receipt. Those results describe that
synthetic subset, not missing commands; the subsequent map-independent extension
and its new validation receipt are recorded in step 3 below.

| Command / consumer | Implemented-and-tested synthetic connection | Remaining coverage gap |
| --- | --- | --- |
| Selected log cache import | [replay-logs.js](../../tools/replay-logs.js) `main` → [importSyntheticCache](../../tools/replay-import-command-fixture.js): map-bearing/reused-map logs, map-only and diagnostic-only responses; mapless logs defer | Ordinary `importCacheFile` remains v2; pre-existing-state adoption, missing-output repair, large admission and broader transport/state variants unsupported. The `import` CLI keyword exists only in synthetic mode |
| Selected `score-import` | Same synthetic dispatcher/`importSyntheticCache`, original `parseScoreCacheEntry` and `scoreImportRecord`; linked scores and guarded map-independent scores without associations are supported | New fixture-schema capability is required for association-free insertion; older databases reject before checkpoints without automatic migration. Invalid existing links still reject; repeat/recovery covers only its own commitments |
| `claim`, `examined`, `score-claim`, `score-examined` | [updateSyntheticLogReview / updateSyntheticScoreReview](../../tools/replay-log-review-fixture.js) → [updateFixtureReviewCheckpoint](../../tools/replay-review-fixture.js); selected ownership, atomic updates and neutral no-ops | Ordinary `updateReview` / `updateScoreReview` still rewrite v2. Claim/examined coverage is not completion, retirement or artifact-availability qualification |
| `replay:analyze`: log, score and combined selections | [replay-analysis.js](../../tools/replay-analysis.js) `main` → [analyzeSyntheticReplay](../../tools/replay-analysis-command-fixture.js) → existing pinned adapters | Ordinary `analyzeReplay` still loads v2. Selected diagnostic arrays remain bounded by the existing 16 MiB cap; no end-to-end streaming claim or broad input qualification |
| `evidence:index`, `scout-hold:screen` | Their `main` dispatchers → [buildSyntheticHistoricalIndex / screenSyntheticReplay](../../tools/replay-evidence-consumers-fixture.js); selected ordering, claims, current/missing/retired distinctions and unchanged screening projection | Production `buildHistoricalIndex` / `screenReplay` remain v2. Synthetic selection is explicit and bounded; it is not corpus enumeration or tactical activation |
| Derived-report cache handling | Opt-in synthetic `--cache` / `cache:true` uses [versioned cache handling](replay-analysis.md#opt-in-synthetic-derived-report-caches); store/selection/dependency binding, coherent generation and fresh claim/integrity revalidation. Default remains disabled | Ordinary v2 `cacheInput` / `cachedReport` / `selectedEvidence` / `screenReplay` remain unchanged. Synthetic hits still recompute analysis; no performance or production-cache qualification |
| Cache `scan` / `watch` | [Bounded synthetic routes](replay-synthetic-imports.md#bounded-synthetic-scan-and-watch): sorted marked-cache inventories, exact pending recovery, startup list reconciliation, deferred map retries, finite polling and confirmed cancellation | Generated log-cache fixtures only; corrupt/unsupported inputs fail closed. Not arbitrary Arena cache access, unattended collection, general publication repair, lossless catch-up or production authority. V2 dispatch unchanged |
| `list` | [Bounded synthetic list](replay-log-checkpoint-integration.md#bounded-synthetic-list-and-reconciliation): one writer lock, ordinal pages, atomic waiting-to-claim migration, journaled done-log retirement, then v2-shaped output | 512 logs / 4,096 reviews; inline displayed/review metadata and leaf diagnostic counts only. Explicit limit failures; no partial successful listing. Pending/publication variants and larger corpora remain unsupported; ordinary v2 route unchanged |
| `maps`, selected `other` | [Synthetic maintenance routes](replay-synthetic-maintenance.md): bounded map/association pages and exact map checks; selected pinned diagnostic output with awaited serialization | Inline metadata / leaf diagnostics within explicit caps. Segmented/overflow output remains fenced; ordinary v2 dispatch remains unchanged |
| `register-local`, `migrate-status` | Same module: shared v2 local parser, private writer-owned adoption proof, exact-source publication intent/checkpoint; migration-only list planner preserves done records | Generated fixtures only. Existing records without adoption commitments and unsupported planner representations reject; no automatic source/identity repair |
| `upgrade-map-checksums` | [Map-owned repair journal](replay-synthetic-maintenance.md#map-owned-checksum-repair): v2-equivalent missing-checksum bytes, exact old/new retention, locked publication/recovery and atomic raw-hash projection update; ready maps are neutral no-ops | New synthetic schema-1 `map-repair-v1` capability required; older/catalog/rehearsal stores reject without migration. Inline map metadata and explicit finite bounds only; production routing remains unchanged |
| Log `complete` / `done`, `score-done`, `score-verify`, `score-cleanup` and reconciliation | [Exact synthetic lifecycle commands](replay-log-checkpoint-integration.md#selected-synthetic-lifecycle) plus bounded corpus list reuse completion, pinned readers and journaled retirement; fixtures exercise v2 parity, owners and interrupted recovery | Inline log history is capped at 128; overflow/external history and larger score verification inputs reject. Production lifecycle dispatch and fresh M2h qualification remain open |

Standalone [completeFixtureScoreReview](../../tools/replay-score-review-fixture.js)
and [retireFixtureScore](../../tools/replay-score-retirement-fixture.js), backed by
[scoreRetirementWriter](../../tools/replay-store-retirement.js), already exist.
They now supply the explicit synthetic score lifecycle connection above; the
retirement machinery also has a collection-qualified log path. This remains
unaccepted for production lifecycle coverage and does not restore lost M2h
evidence. Raw-HTTP admission remains a
separate unsupported format, not solved by SQLite routing.

The bounded v3 descriptor JSON is not the oversized path. The
[legacy scanner](../../tools/replay-legacy-json.js) and
[legacy reader](../../tools/replay-legacy-reader.js) now support bounded member
and diagnostic streaming for the documented converter subset, including strict
duplicate-key rejection. Individual-value and profile limits remain explicit;
the successful snapshot does not cover every possible legacy variant. No
whole-manifest parse may become a production fallback. No regenerated
monolithic JSON compatibility mirror, hidden full-corpus array or buffer is
acceptable. Bounded legacy reads remain necessary for frozen-source verification.
Legacy v2 writes remain unchanged only while v2 is authoritative, not after cutover.

Collection/discovery/handoff spools are outside this storage boundary.
`retrieve-match.js` imports pure validators from replay-logs, not managed storage;
preserve that separation. Fixture/qualification commands stay fixture-only and
cannot be used as production dispatch paths.

## Minimum remaining production-adoption work — 2026-10-14

The completed snapshot run removes the need for another converter optimization,
consumer framework or repetition of that qualification. **The production authority/
cutover/recovery seam is now implemented and tested with generated fixtures only.**
See its [contract and exact gates](replay-production-authority.md); this is not an
activation or a new real-data qualification. Existing consumer capacity/adoption
restrictions were not weakened to make the wiring appear complete.

| Actual boundary | Candidate connection | Remaining acceptance / restriction |
| --- | --- | --- |
| Imports, reviews, lifecycle, list, maps, scan/watch | [replay-logs.js](../../tools/replay-logs.js) `main` and selected public APIs resolve the descriptor; [production dispatch](../../tools/replay-production-authority.js) reuses the shared SQLite consumers with `production:true` only inside a lease | Verified converted-record no-ops and proof-pinned paginated `converted-corpus-v1` traversal support generated 291-log/95-score continuation. Defaults remain 64 records; individual cache/payload and 64-file scan-discovery bounds remain explicit. Real workload/caller qualification is open; no silent skips or broader repair |
| Analysis, historical indexing, scout screening and caches | [analysis](../../tools/replay-analysis.js) `analyzeReplay`/`main`, [index](../../tools/historical-index.js) `buildHistoricalIndex`/`main`, [screen](../../tools/scout-hold-screen.js) `screenReplay`/`main` connect the same selection; production callers await the bounded adapters | Existing selected-array/claim/integrity/cache rules remain. APIs are asynchronous for SQLite; caller/report compatibility and accepted production selections still need qualification |
| Authority and low-level access | [production scope](../../tools/replay-production-scope.js) and [core](../../tools/replay-store.js) enforce descriptor/proof/schema/release binding, pre-open residency, locked writes and read-only activation; legacy accesses and escaped leases reject | Production authority remains disabled until explicit approved publication; old/ad-hoc binaries require external fencing. Fixture/rehearsal scopes remain distinct |
| Conversion and recovery administration | [replay-store-migrate.js](../../tools/replay-store-migrate.js): `prepareProductionCutover`, `cutoverProduction`, `enableProductionWrites`, `prepareProductionRecovery`, `restoreProductionRecovery`, `selectRestoredProduction` | Preparation consumes an independently verified frozen-copy conversion and qualification receipt; it does not issue qualification or convert live input. Compatible-release current-state restore and explicit isolated selection are fixture-demonstrated; real transition approval remains open |

### Implemented seam and converted-corpus continuation

The seam reuses the existing owner-token locks, bounded SQLite APIs, independent
backup/restore and publication machinery. Generated fixtures exercise read-only
cutover, separate write approval, post-write backup/fencing, package-only restore
through an independent release, restored read-only selection and further approved
writes. Source stores/copies remain retained. Interruption, stale/corrupt controls,
source/artifact changes, residency rejection, conflicts, no-ops, bounds and error
separation are tested. No actual production state was selected or changed.

The generated-fixture wiring receipt is
`/Users/zoltanka/.local/share/pain-and-gain-evidence/production-authority-wiring-20261014-xgbst2/report.json`.
It records focused coverage and retained intermediate failures, including final
self-review corrections for pinned restored-state acceptance, committed recovery
budgets, retained controls and fresh destination/approval binding. No full-size
or current-production qualification is inferred from these checks.

**Converted-corpus import/scan continuation is implemented, using generated inputs
only.** Both prior blockers were reproduced before correction. The shared importer
now verifies completed conversion membership, identity/provenance, original fields,
owned ready output reservations, exact payload bytes and diagnostic leaves before
returning a generation-neutral duplicate. It writes no historical import commitment
and does not infer builds or replace reviews. Unsupported conversion representations
and corrupt or missing evidence still reject.

An explicit authority-proof `importBudget` selects `converted-corpus-v1`: at most
320 logs, 128 scores, 64 maps, 64 associations, 1,024 root properties, 8 MiB root-row
bytes and 128 operation rows. Counts/checkpoints are paginated; reduced budgets,
prepared recovery and prospective checkpoint sizes are checked before mutation.
Absent opt-in, existing defaults remain. A generated 291-log/95-score corpus accepts
one new log and score (292/96), preserves original reviews/provenance and supports
duplicate scanning. This is a **count-shape demonstration**, not full real diagnostic
volume or production throughput qualification. Without the later explicit cache
profile below, scan remains bounded to 64 cache
files per directory/invocation; selected imports retain 1 MiB cache, 4 MiB decoded
output and 2 MiB/4,096 diagnostic bounds.

Receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/converted-import-continuation-20261014-Jap79O/report.json`.
See [import contracts](replay-synthetic-imports.md#verified-converted-record-repetition)
for exact verification and unsupported cases. Keep discovery failures explicit and
required lifecycle/overflow/repair variants accounted for; fencing a required case
is not completed production coverage. Raw HTTP admission is still unsupported.

**Retention completed; qualification remains scoped.** The consolidated candidate
is retained independently at
`/Users/zoltanka/.local/share/pain-and-gain-evidence/production-candidate-retention-20261014-HBqEEr/release-candidate-08`.
Its manifest SHA-256 is
`9ac3ace03ca0f42108ef5ad72b3e4b21ab28a8dddef91d872855e580af363344`:
58 independent files, Node 24.19.0, exact schema/capability declarations and
dependency hashes, sealed read-only with macOS immutable flags. Conversion and
production authority/recovery tooling are included. The first retained attempt
omitted two dynamically required source files; that failed artifact is preserved
and excluded from the usable candidate. No earlier release was modified.

Twelve focused checks passed against the retained candidate/harness: four converted
no-op cases, four generated production-routing/import/scan/recovery cases, and four
harness checks including all eight small snapshot phases. Worktree and earlier
evidence access were blocked for the production/converted checks; post-write logs,
scores, reviews, payloads and the corpus budget survive independent recovery.
The accepted 145-test continuation evidence and earlier applicable validation are
reused. No production-sized or real payload was read in this retention task.

The [successor snapshot qualification scope](replay-real-data-recovery-qualification-plan-2026-10-14.md#consolidated-candidate-08--prepared-snapshot-scope)
is ready for authorization with a separately pinned harness and fresh destinations.
It does **not** close production import/scan capacity: a recorded log has 5,882
wrappers, exceeding the unchanged 4,096 import/other-output cap. Its 2,871,940-byte
raw diagnostic-array span is not a canonical diagnostic-JSONL byte measurement;
the 2 MiB comparison remains unresolved. Actual Chromium-cache file/decoded sizes,
individual score-field sizes and current discovery-directory coverage are also
unverified. A 71,590-byte whole score member alone proves no 16 KiB field violation.
The 64-file discovery limit remains. Original transports excluded from the scoped
backup must not be recreated by wrapping retained bodies.

### Import and discovery capacity follow-up (2026-10-14)

The candidate-08 limits above are historical, not the current opt-in capacity.
An optional authority-proof `cacheCapacity` selects
[`replay-cache-v1`](replay-synthetic-imports.md#proof-pinned-cache-capacity):
8,192 wrappers / 4 MiB canonical diagnostic JSONL, 2,048 files, 4,096 directory
entries, 1,048,576 cumulative directory iterations, 64 MiB/cycle, 512 MiB discovery,
256 MiB attempted source bytes, 4,096 attempts and 2 MiB reports. All fields are
finite, explicitly supplied and reducible; the descriptor proof hash pins them.
Default 4,096-wrapper/64-file behavior and every per-file/decoded/field/deadline
limit remain unchanged. The separate corpus budget remains required.

Generated 5,882-wrapper import/reimport and converted no-op cases preserve exact
diagnostics; the enlarged boundary rejects excess rather than truncating.
Discovery uses at most 128 sorted identities at a time, explicit unrelated results,
v2-style shallow directory exclusion, content fingerprints and stable-source
verification. Per-file residency is not cached; page scope checks remain under
the writer lease. Cancellation and exact-source publication recovery stay bounded.

Metadata-only two-pass inspection measured the default `Cache_Data` at 1,388
regular files / 31,996,663 bytes (maximum 503,192), plus one directory. The 20-file
retained provenance cache totals 1,405,882 bytes (maximum 86,426). All 386 original
provenance references match recorded residency/metadata; no cache payload was
opened. The 1 MiB transport cap covers these measured files. Actual decoded bytes,
canonical diagnostic bytes, individual score fields and supported transport kinds
remain unknown; raw-array/whole-member sizes do not establish those quantities.
Directory contents can change; future execution must refresh these measurements.
Other-output and selected-reader limits have not been expanded by this task.

Receipt and successor qualification controls are retained under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/import-scan-capacity-20261014-8klTHY`.
The successor is a candidate, not newly qualified. See the
[current qualification scope](replay-real-data-recovery-qualification-plan-2026-10-14.md).
The original candidate-08 and all earlier evidence remain unchanged.
Candidate-09 manifest: `7f829d0fa196f6ce1815ccb8cdf9046ce62677fae21ac61c95cd1ac36e34948e`.
Harness-v6 and its fresh-target snapshot plan are separately pinned; no real run
was executed. Real decoded/field/transport compatibility remains unverified, not
silently included in snapshot qualification or established by filesystem metadata.

**Next gate:** qualify only the exact retained snapshot scope if separately
authorized, and establish required production input/discovery coverage before
adoption. Unsupported required cases remain blockers. Current-source inventory,
quiescence, fresh backup/restore, caller qualification, durability decisions and
separate activation approvals below remain open; M2h remains paused/unqualified.
Retention, failures, commands and limits:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/production-candidate-retention-20261014-HBqEEr/report.json`.

### Fresh-source, transition and approval gates

1. **Establish current requirements and quiescence.** Obtain separate approval
   for current-production reads/backup and writer quiescence. Identify every
   writer, watcher and ad-hoc/retained binary; agree how to stop/fence them without
   silently changing services. Confirm shared owner-token `.manifest.lock`
   coverage, then inventory resident source/dependencies, pending/recovery inputs,
   receipts and unknown properties without reconciliation. The 432-file snapshot
   and its historical exclusions are not a current dependency inventory. Missing,
   dataless, ambiguous, unsupported or changing required inputs stop the gate.
2. **Prepare a fresh recovery point and staging store.** Under proven quiescence,
   independently copy/hash the current complete operational set and verify an
   isolated restore before mutation. Freeze/pin source bytes and controls, exact
   release/runtime/capabilities, finite budgets and fresh destinations. Convert
   the frozen copy and compare complete logical state and payload hashes using
   bounded readers. Reuse prior evidence only for unchanged, applicable paths;
   the snapshot result is not permission to convert current production.
3. **Qualify and authorize activation separately.** Complete required consumer,
   concurrency/resource/error/crash and M2h acceptance for the exact candidate and
   platform. Decide and record durability acceptance: local filesystem fsync,
   atomic rename/parent sync, SQLite DELETE/FULL behavior and any required further
   power-loss/torn-write evidence. SIGKILL is not power loss; ADR 0006 specifies
   no standalone machine-power-cut procedure. That evidence/decision remains open,
   not implicitly waived. Same-disk recovery is not off-device disaster protection.
4. **Cut over initially write-fenced.** Only with explicit production cutover
   approval, fence all writers, reacquire the shared lock, revalidate descriptor/
   store and stream-compare current source/dependencies to the frozen receipt.
   Any change stops publication; never silently merge. Close staging connections,
   verify durable/clean journal state, atomically publish the sole bounded v3
   descriptor, retain both generations and receipts, and verify ordinary read-only
   consumers. Uncertain rename/fsync, lock ownership, integrity, capability or
   budget results mean stop while fenced, retain artifacts and inspect; no blind
   retry, automatic fallback, deletion or limit increase.
5. **Enable writes or recover only by explicit decision.** Write enablement needs
   separate approval after read-only parity and accepted rollback readiness.
   Before any logical write, the exact frozen v2 manifest may be restored only
   after proving unchanged state and a usable legacy endpoint. After any write,
   never restore the stale v2 backup: fence writers, pin a coordinated backup of
   current SQLite state plus all artifacts/controls, restore independently through
   the retained compatible release, verify post-write state/hashes and explicitly
   select the restored production descriptor. If verification or receiving-release
   compatibility fails, remain fenced with both stores retained. Recovery/rollback
   execution requires its own concrete approval; oversized v2 export is no escape.

These are separate gates, not a new authorization bundle. Production cutover,
write enablement, real recovery execution and renewed M2h work remain unauthorized.

## Ordered implementation and acceptance gates

Every step below needs separate authorization. No production mutation precedes
the independent backup/restore gate. Retain exact source/runtime hashes, commands,
limits, logs, inventories, failures and preservation results for each future run;
a summary label without supporting evidence is not acceptance.

### 1. Bounded legacy input boundary — demonstrated supported subset

**Status:** the reviewed member/diagnostic reader is implemented and was reused
for the successful snapshot rehearsal. Reuse it rather than implement another
parser. The requirements below remain controlling for unsupported dimensions.

**Scope/deliverable:** a fixture-only incremental record/property event reader
reusing `replay-legacy-json.js`, with source byte spans and original ordinals.
Do not create a production converter or change root guards. Preserve unknown
values through streamed spans; reject duplicate keys and unsupported structure
with precise source locations. Bound nesting, key bookkeeping, tokens and pages;
large value retention must not require a JavaScript string. If a supported limit
cannot be met, return an explicit resource error, never drop the field.

**Dependencies:** existing scanner/protocol and reviewed slice; explicit resident
Node 24 runtime. **Validation/gate:** newly generated synthetic fixtures covering
optional collections, null/absence, unknown/large values, duplicate keys, exact
ordering and changed/truncated sources; compare a streamed event reconstruction.
Record finite resource limits before execution. Accept only this input seam;
no SQLite production opening, mutation, cutover or migration-readiness claim.

### 2. Unpublished converter and independent preservation verifier

**Status:** the supported streaming subset and isolated backup-snapshot
conversion/resume have passed preservation checks. This does not establish the
full supported-state matrix below, production administration or rollback.

**Scope/deliverable:** build the ADR's explicit administrative prepare/verify/resume
seam around the existing core, not a second store. Extend beyond the slice to all
supported v2 states: evidence-only null outputs, map-only/deferred associations,
map-independent scores, optional collections, waiting/pending/done/retiring
states, retired fingerprints/tombstones, unknown root fields and overflow reviews.
Absent legacy aliases must remain absent; do not synthesize slice-required
map `path`/`hash` properties into original registrations.

**Dependencies:** step 1; an explicit supported-input matrix and unchanged ADR
invariants. Use multiple bounded passes/staging indices if references appear
before dependencies; never hold the corpus in memory. Stream map/body hashes and
canonical map checks separately. Register verified existing evidence ownership
explicitly in unpublished staging; do not bypass the core's refusal to adopt
unowned paths. Originals stay untouched; derived sidecars publish exclusively.

**Checkpoint contract:** commit source/backup hash and length, converter/encoding
version, selection, parser boundary/collection/property ordinal and store ID.
Commit pending reservations before file publication; fsync bytes/directories,
verify owner/path/hash/length, then transactionally commit ready references and
progress. Resume under the same lock only with matching commitments and verified
outputs. Pending is not ready; corrupt reservations/checkpoints fail without
repair. Reuse exact published bytes, never overwrite or delete unknown remnants.

**Validation/gate:** independent streamed logical comparison of every original
value and occurrence, not converter self-reported counts alone. Include repeated
resume, concurrent attempts, interruption at each publication/commit boundary,
changed source, corrupt output reservations and combined operation/cleanup errors.
No verified result after partial comparison. Synthetic success permits only the
next separately authorized gate.

### 3. Consumer integration, authority selection and rollback tooling

**Status:** production integration remains unsatisfied. The successful snapshot
makes preserved SQLite record/review state available for subsequent gates. The
selected-log/score claim/examined seam below is implemented and tested with synthetic
stores only; it does not switch a production consumer or authoritative store.

**Completed synthetic consumer seam:** selected-log `claim`/`examined` and
selected-score `score-claim`/`score-examined` in
[replay-logs.js](../../tools/replay-logs.js) now have an explicit
`--synthetic-sqlite` mode using the existing
[review-checkpoint seam](../../tools/replay-review-fixture.js). The
[integration contract](replay-log-checkpoint-integration.md) records its exact
fixture-only access and bounded output contract. The score extension reused the
unchanged checkpoint/core APIs and fixture guards; 44 score and 58 accepted log
checks (102 total) passed on Node 24.19.0, including semantic v2 parity on independent synthetic input,
unknown/owner preservation, locked known-build conflict rejection, atomic faults,
no-op/concurrent calls, strict score ownership/readiness, map-independent scores,
collection-separated reviews and operation/cleanup errors. Production dispatch and
fixture-root permissions remain unchanged; no whole-manifest fallback is added.

Logical checkpoint semantics are retained, with an explicit bounded selected-task
CLI result rather than a complete reviews dump. Operational metadata checks do
not certify artifact availability/integrity. No identity inference, repair or v2
fallback is permitted. This seam avoids a whole-manifest rewrite only in its
guarded synthetic route. Production roots, authority cutover/rollback, score
verification, completion, retirement, imports and cleanup remain separate gates; no
next implementation or production activation is authorized by this status update.

**Completed synthetic analysis connection:** `replay-analysis.js` has a separate
explicit fixture-root route to the unchanged log, score and combined adapters.
Forty-five small retained route checks and 106 database-free hash-pinned score
compatibility checks passed on Node 24.19.0. Supported selected reports match v2;
transport corruption/unavailability still reject separately from semantic findings.
Analysis preserves generation, review state and retained file hashes; it never
claims or marks examined. Selected diagnostic arrays remain materialized within
the existing 16 MiB cap, with decoded correlation structures retained by the
analyzer: no end-to-end streaming or general memory guarantee is established.
The [command contract](replay-analysis.md#explicit-synthetic-sqlite-route) records
selection rules and inherited limits. Ordinary production dispatch, source
authority and frozen/versioned expectations remain unchanged. Other consumers,
production administration, cutover/rollback and qualification stay gated.

**Completed synthetic derived consumers:** `historical-index.js` and
`scout-hold-screen.js` now have explicit `--synthetic-sqlite` fixture routes,
reusing the bounded pinned loaders, compact analyzer and unchanged index/screening
projections. Historical selections retain match/source order, claims and explicit
current/missing/retired distinctions; screening requires named logs and retains
claim/build/validation gates and its existing policy. The
[contract and limits](replay-analysis.md#synthetic-historical-index-and-scout-screen)
describe the default read-only `cache: "disabled"`, generation coherence fencing
and selected array materialization. The later separately tested opt-in cache and
lifecycle connection below adds synthetic capabilities. Ordinary v2 dispatch and
caches remain unchanged. Production activation remains unauthorized.

**Completed bounded synthetic import connection:** selected log and score cache
imports now have an explicit fixture route, documented in
[synthetic cache imports](replay-synthetic-imports.md). It reuses the original
transport/parsing and metadata construction, plus locked SQLite reservations,
publication intents and exact-source checkpoints. New known association builds do
not fill unknown record provenance; repetition preserves reviews and unrelated
records. The selected-task claim/read seam is pinned coherently so the accepted
review and derived consumers can operate on these newly admitted synthetic records.
Ordinary production dispatch and parser defaults remain unchanged. Supported input
and finite limits are deliberately narrow: notably **broader legacy states/adoption,
large admission and lifecycle repair remain unsupported**.
This is not production import qualification or activation; all ordinary consumers
still use v2. Authority, rollback, broader lifecycle and M2h gates stay open.

**Completed synthetic map-independent score extension:** the previously prioritized
import-parity task now accepts original `mapId: null` with no replay association,
without fabricating links or identities. New isolated schema-1 stores use a nullable
virtual association foreign-key projection, with strict log/linked-score insertion
checks; older databases remain unchanged and reject this new capability before
checkpoint publication. The [import contract](replay-synthetic-imports.md#association-free-storage-boundary)
defines its exact representation, repeat/recovery and reader boundaries.

Small retained fixtures compare v2 record properties/order and original payloads,
exercise score reviews/readers, interruption, unchanged repetition, later map
arrival and corrupt/conflicting links. Linked log/score and accepted consumer
compatibility checks remain controlling. The task receipt is
`/Users/zoltanka/.local/share/pain-and-gain-evidence/map-independent-score-imports-20261013-Hhor9L/report.json`.
This closes only the tested synthetic import case, not real admission, adoption of
broader legacy states, production database upgrades or cutover. Lifecycle commands,
production cache integration and the other table gaps remain separate gates.

**Completed selected synthetic lifecycle/cache milestone:** exact log complete/done
and targeted reconciliation, score done/verify/cleanup, and opt-in historical/scout
caches now connect through the existing APIs. No schema migration is added. The
[contract](replay-log-checkpoint-integration.md#selected-synthetic-lifecycle)
documents bounded reviewer/history/file handling and retained recovery artifacts.
Small end-to-end fixtures cover import → claim/examined → analysis/cache →
completion → applicable retirement/recovery, plus conflicts, stale cache rejection
and explicit unsupported capability failures. Receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-lifecycle-cache-20261013-h09uQD/report.json`.

**Remaining concrete consumer blockers:** the following routes are deliberately
fenced in synthetic dispatch, with no fallback to the v2 authoritative store:

- `list` beyond its supported bounded metadata/ready-state subset remains fenced:
  pending logs, external displayed/review fields, segmented diagnostic counts and
  exceeded corpus/I/O limits reject without successful truncation.
- `scan` / `watch` beyond the bounded marked synthetic cache subset: arbitrary
  Arena caches, unsupported transport, oversized collections and legacy
  pending/adoption/repair states remain fenced. Real unattended polling and
  lossless catch-up are unqualified; no service is activated.
- `maps` / `other` beyond their supported bounded subset: external map/association
  metadata and segmented/overflow diagnostics remain unsupported by these CLI
  connections; the selected leaf/inline output path is now implemented.
- `register-local` for records lacking exact adoption commitments and unsupported
  status-planner states remains fenced. Supported local admission and atomic
  status-only migration are now connected; neither is general repair.
- `upgrade-map-checksums` now supports missing-checksum replacement in new
  capable synthetic stores. Older schemas, unsupported map/property shapes,
  corrupted commitments and exceeded bounds reject; no automatic schema migration.
- Log history overflow/external history, oversized selected score verification,
  and unsupported import/recovery variants still reject at their documented caps.

**Completed bounded synthetic list:** `listSyntheticLogs` and the locked core
`reconcileLogList` preserve the v2 waiting/done sequence and ordered output for
the documented subset. Limits precede mutation, destructive work uses the
existing journal, and incomplete passes fail without emitting a successful
partial list. Current-generation checks and resumed retirement protect repeated
and concurrent calls; maps, scores and unrelated owners remain intact. Contract
and remaining representation limits are [documented here](replay-log-checkpoint-integration.md#bounded-synthetic-list-and-reconciliation).
Receipt: `/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-list-20261013-vwsqmA/report.json`.

**Completed bounded synthetic scan/watch:** generated log caches now connect to
the same selected importer, exact-source publication recovery and startup list
reconciliation. Finite inventory/byte/attempt/cycle/deadline bounds fail explicitly;
deferred map arrivals retry without resetting attempt accounting. Cancellation
awaits in-flight operations and confirms shutdown, including CLI child exit.
Small fixtures compare v2 record/provenance results, exercise concurrent changes
and interrupted recovery, and complete the selected review/analysis/list workflow.
The [contract](replay-synthetic-imports.md#bounded-synthetic-scan-and-watch) records
fail-fast differences and remaining limitations. Receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-scan-watch-20261013-0Cldh1/report.json`.

**Completed supported map/output/adoption subset:** bounded map/association
enumeration, exact selected diagnostic JSONL output, shared-parser local admission
and status-only waiting migration connect through existing SQLite primitives.
Private adoption proofs preserve ordinary unowned-file rejection; reserved,
published and verified checkpoints reuse exact file intents and existing recovery.
Empty diagnostic roots keep adopted logs readable through established analyzers.
The [maintenance contract](replay-synthetic-maintenance.md) records finite bounds,
v2 parity, corruption rejection and the specific unsupported representations.
Receipt: `/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-consumer-completion-20261013-IXPYpu/report.json`.

**Completed synthetic missing-checksum repair:** the restricted repair handle
uses a map-qualified journal without changing record publication ownership.
Exact original/replacement copies precede the durable intent; ordinary access is
fenced until recovery validates publication and atomically commits the raw hash
and existing hash-property projection. Links, reviews, metadata order and unknown
properties remain preserved. Already-upgraded maps are generation-neutral.
Capability detection is explicit; old stores are never migrated. The
[maintenance contract](replay-synthetic-maintenance.md#map-owned-checksum-repair)
records bounds, fail-fast reporting, retained recovery files and race/durability
limits. Receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-map-repair-20261013-k1Rfnr/report.json`.

This closes the named missing-checksum consumer gap for its tested synthetic
subset. Remaining consumer coverage includes external/segmented metadata and
diagnostic representations, unsupported pre-existing import/recovery states,
larger bounded selections and real-cache integration/qualification. Production
authority selection and lossless rollback remain separate implementation gates;
this milestone does not claim full production coverage or activate either gate.

Keep four separate open gates: **consumer coverage** (all required commands/caches
integrated or explicitly fenced), **authority selection** (one reviewed production
descriptor/root, no mixed authoritative stores), **lossless rollback** (including
new writes), and **fresh qualification** (exact candidate/runtime evidence,
including required lifecycle gates). This completed synthetic seam closes none of
the latter three gates.

### Synthetic authority and bounded v2 rollback — 2026-10-13

#### Rehearsal lineage connection — 2026-10-14

[Rehearsal operations](replay-backup-rehearsal.md#rehearsal-consumers-and-independent-recovery--2026-10-14)
connect verified conversion to selected log/score analysis, maps and claim/examined,
then current-state backup, independent restore and explicit restored selection.
The same locking/recovery machinery is reused with a pinned rehearsal lineage,
original provenance and `productionAuthority:false`; synthetic and production
routes retain their existing guards. New stores include existing recovery-required
map-repair tables; older stores reject without migration. Unsupported consumer
commands remain fenced, including imports and deletion in this rehearsal route.

A new independently retained release includes the conversion CLI and runtime.
Small generated backup-shaped tests exercise post-write preservation, interruption,
residency/conflict rejection and operation with original/worktree reads blocked.
Exact validation, failures and release pins are retained in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-recovery-integration-20261014-0NMipc/`.
The [real-data plan](replay-real-data-recovery-qualification-plan-2026-10-14.md)
records the actual launcher commands and remaining execution gates. Prior scale
results are reused, not attributed to this successor as fresh scale qualification.
No real payload, old destination or production authority was accessed in this task.

The [separate qualification harness](replay-real-data-recovery-qualification-plan-2026-10-14.md#prepared-harness-and-exact-authorization-command--2026-10-14)
now supplies the complete eight-phase orchestration, bounded preservation/selection
gates and confirmed child shutdown around unchanged release-06. Thirteen small-fixture
harness checks passed; the 95 integration checks and accepted scale evidence are
reused. Preparation read no real payload. The separately authorized run has now
passed all eight phases, as recorded in the completed snapshot milestone above;
that execution is finished, not awaiting another authorization or rerun. No
production or renewed M2h gate is closed by either preparation or execution.

Consumer coverage, production authority, independently qualified rollback,
platform durability and M2h remain separate gates. This connection establishes
the tested isolated scope, now including the named real snapshot and selected
post-write recovery operations; it does not activate production or establish
power-loss durability.

The explicit [synthetic authority dispatcher](replay-synthetic-authority.md)
now binds all supported synthetic consumers to one backend/root under an outer
owner-token lock; backend writer locks and integrity checks remain in force.
Bound roots and old handles cannot bypass selection using the earlier direct
SQLite command route. Production dispatch and its activation descriptor remain
unchanged. Ambiguous selectors and incompatible schema capabilities reject.

Separately, the small **conditional v2-export route** from ADR 0006 is implemented
for generated fixtures: retain a verified current SQLite backup and exact metadata,
stream a bounded legacy manifest/current payloads, verify it, then select the
restored v2 root. The workflow includes writes after conversion, reviews, analysis,
retirement/history and repaired maps; rollback is not restoration of the old v2
input. Changed generations, source bytes, corrupt/incomplete exports and ambiguous
root ordinals block selection. Both stores and recovery artifacts remain retained.

The detailed contract lists finite bounds and the restored-v2 consumer subset.
The subsequent scoped connection below completes the named commands within those
bounds; this does not establish broader representation coverage or a production
rollback release. In particular, introducing
previously absent score collections can leave conflicting root ordinals in
existing import metadata; those states require a separate preservation decision,
not normalization during export. The demonstrated source has explicit optional
score collection presence. Existing external/segmented representation limits also
remain. Receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/synthetic-authority-20261013-eFTjUl/report.json`.

**Separate results/gates:** synthetic selection and the capped post-write v2
restore are demonstrated only by the focused retained fixtures. Production
selection, a complete compatible rollback release, production-size/resource and
crash/power-loss qualification, and fresh lifecycle acceptance remain open.
The production post-write rollback requirement below still selects a qualified
compatible SQLite release/current-state restore; this optional synthetic export
does not replace it or renew M2h qualification.

#### Restored-v2 command connections — 2026-10-13

All 23 commands in the supported synthetic SQLite authority dispatcher now have
a [selected restored-v2 route](replay-synthetic-authority.md#restored-command-bounds-and-recovery).
This includes subsequent original-cache log/score imports, review/completion,
selected analysis/index/screen and their v2 caches, local registration, maps/other,
status/list/selected reconciliation, checksum repair and bounded scan/watch.
The existing v2 implementations and finite discovery loop are reused. No command
falls back to the retained SQLite data or cache. The ordinary production routes
and authority descriptor remain unchanged.

Focused generated fixtures compare current v2 metadata/payloads and analytical
results, preserve unknown properties and ordering, and exercise imports/reviews
after rollback, map-independent scores, lifecycle/history, map repair, exact
pending-source recovery, interrupted retirement and confirmed watch shutdown.
Retained SQLite files and the earlier map-repair/recovery archive remain hash
identical. Planned manifest, artifact and retirement growth are bounded before
file mutation. Corruption, conflicting selectors, unsafe paths, changed sources
and exceeded limits fail explicitly; partial progress remains for exact retry.
Receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/restored-v2-coverage-20261013-ikSDa3/report.json`.

Named command coverage is complete only for this small supported workflow.
Different v2 API report shapes, unsupported SQLite-specific budget overrides,
broader recovery/segmented representations, production-size exports and native
resource/crash/power-loss behavior remain unqualified. Consumer coverage,
production authority selection, a qualified current-state rollback release and
fresh qualification remain separate gates. Production cutover and M2h remain
outside this milestone.

#### Production-scale rollback endpoint assessment — 2026-10-14

The required post-write route remains a qualified compatible SQLite release and
verified restore of **current** logical state/artifacts. At that assessment the
receipts identified no qualified receiving release. The small v2 backup API
helper is a recovery archive, not a selectable SQLite restore: authority selection
still requires the SQLite target to be the original anchor. Source facts collect
capped table arrays, and restored-v2 readers/writers still materialize the complete
manifest inside a 4 MiB contract. Raising export limits alone would not produce a
usable endpoint for the recorded 533,731,722-byte snapshot.

The [endpoint assessment and proposed scale gate](replay-synthetic-authority.md#production-scale-endpoint-decision--2026-10-14)
records the historical implementation boundaries and receiving-release decision.
At that point designation of a compatible retained candidate and its isolated
restore/selection connection were missing. The subsequent designation,
implementation, generated-scale qualification and completed real-snapshot run
are recorded separately above/below; this is no longer a pending release-selection
request or missing isolated restore entrypoint. Production-scope wiring and
qualification remain open. Command coverage, conversion and a database copy alone
never discharged the gate. Original blocker receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/rollback-endpoint-20261014-4Jb0rf/report.json`.

#### Retained SQLite recovery candidate and isolated restore — 2026-10-14

The operator subsequently designated the current candidate **for qualification**.
Independent pre-edit and augmented recovery bundles now retain the required local
code, Node 24.19.0 runtime, protocol documents and SHA-256 inventories. Exact
schema DDL/fingerprints and map-independent score/map-repair capabilities are
recorded; schema version alone is not treated as compatibility. The bundles are
read-only/immutable-flag protected local copies, not off-device or owner-proof
archives. This designation is not a qualified-release or production declaration.

The [independent recovery contract](replay-synthetic-authority.md#independent-sqlite-recovery-candidate--2026-10-14)
and [retained-fixture tests](../../tests/unit/replay-sqlite-recovery.test.js) connect
locked current-state SQLite backup, referenced artifacts and control retention,
isolated restore and explicit restored-authority selection. Ordered typed table
digests and streamed payload hashes include post-write reviews/history, repaired
maps and administrative state. A destination-specific handoff fences the original
selector before restoring; its database/payload bytes remain unchanged. Restored
consumers use the independent retained release, never the original store or a
mutable-worktree fallback. Incomplete/pending operations and unsupported reference
representations reject rather than being normalized. Small-fixture validation
does not qualify process crashes, power loss or full production-sized workloads.

Evidence, exact candidate identities and the fixed-budget follow-up plan:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-recovery-release-20261014-SY8oNY/report.json`
and `execution-plan.md` in that directory. Initial SQLite selection is no longer
coupled to the capped legacy export's 32-record preflight; old v2 rollback limits
and production dispatch are unchanged. Recovery uses bounded row iteration and
independent files, not an oversized monolithic JSON rollback endpoint.

The subsequent generated-scale run, guarded rehearsal connection and completed
eight-phase real-snapshot qualification are recorded above. The
[bounded real-data run plan](replay-real-data-recovery-qualification-plan-2026-10-14.md)
is the retained preparation contract; the execution receipt records its completed
authorization and results. It is not a pending run to repeat. The production
authority/administrative seam is now fixture-tested above; converted-corpus import
continuation and fresh candidate acceptance remain, not more converter preparation.
Production release qualification, current-source freshness, remaining
crash/platform durability evidence and M2h stay separate.

**Scope/deliverable:** adapt or explicitly fence every inventory entry. Reuse core
`withWriter`, keyset pages and pinned snapshots; no simultaneous authoritative
manifest/database and no automatic v2 fallback. Introduce production access only
through a separately reviewed explicit root/descriptor contract; retain synthetic
guards. The small ADR v3 descriptor at `replay_logs/manifest.json` is the sole
activation point, bound to schema/payload version, store ID and migration receipt.
Open never creates missing storage. Reject unsupported/mismatched descriptors.

**Lock/transaction contract:** all mutations and cutover use the existing
owner-token `.manifest.lock`; revalidate descriptor/store ID after acquisition.
Writable connections, including journal recovery, stay inside that lock. Preserve
DELETE journal, FULL synchronization, foreign keys, finite busy/lock limits and
generation-coherent pages. Pin selected artifacts/metadata before releasing the
snapshot lock. Propagate operation errors with separate cleanup failures; the
assessment's unqualified core/helper cleanup paths require focused verification.

**Validation/gate:** exact import/review/report parity, optional-collection and
ownership checks, concurrent readers/writers, retry/deferral/missing-file semantics,
cache invalidation and stale binary rejection. Collection completion cannot mark
reviews done. Log done and score done/cleanup retain their distinct contracts.
Unqualified lifecycle commands must fail closed rather than call v2 or delete
evidence; fencing is not completion of ADR M2. Full production cutover remains
blocked until required lifecycle gates, including M2h, have fresh acceptance.
Provide and rehearse the rollback routes below before any activation proposal.

### 4. Independent backup/restore and isolated real-copy rehearsal

**Status:** the scoped operational backup/restore, initial conversion/resume and
subsequent complete eight-phase real-snapshot qualification are demonstrated.
The latter includes selected consumer writes and independent current-state
backup/restore/repeat with restored authority and further writes, through the
guarded rehearsal lineage. The generated-scale and named process-crash evidence
remain separately scoped. The
[isolated real-data qualification plan](replay-real-data-recovery-qualification-plan-2026-10-14.md)
was executed once under its explicit authorization; do not repeat it. This closes
the recorded-snapshot gate, not step 3 production routing, all legacy/lifecycle
states, current-production freshness or crash/power-loss durability acceptance.

**Dependencies:** steps 1–3, approved finite resource/disk budgets and explicit
permission for real-evidence copying; none is granted here. Stop/fence writers,
acquire the lock, check residency and inventory without reconciliation. First
stream-copy the exact frozen manifest and every referenced original/map/response,
pending recovery input and receipt to an independent backup destination. Do not
assume APFS clones, compression or an existing backup make this independent or
complete. Budget backup, restore, index, sidecars, journals and staging headroom.

**Deliverables/gate:** restore the backup to an isolated root and independently
verify all lengths, hashes, ownership and required references. Preserve explicitly
permitted pre-existing missing/pending artifacts as such; unsafe, corrupt or
unexplained missing inputs block acceptance. A database-only backup is insufficient.
Only then rehearse conversion on the frozen copy, never production. Run SQLite
integrity/foreign-key checks and the complete preservation contract below.

Retain fresh bounded resource, concurrency, EIO/ENOSPC/busy, interruption,
process-crash/hot-journal and rollback evidence for the exact runtime/filesystem
and candidate. Include data exceeding the former single-string limit, overflow
tokens and many reviewers. Establish finite phase deadlines, heap/RSS/output,
disk and retry limits beforehand; do not weaken frozen requirements or pool old
passing subsets. Process-crash success does not prove arbitrary power-loss safety.
Any failed phase blocks qualification. M2h remains paused until separately authorized.

### 5. Separately authorized cutover, initially write-fenced

**Dependencies:** independent review, complete retained evidence for all preceding
gates, verified current backup/restore, compatible rollback release, all callers
upgraded/fenced and explicit production authorization. No implicit rollout.

Stop all writers again and take the shared lock. Rehash the full source and
referenced artifact inventory by streaming; any change since the frozen receipt
blocks cutover rather than being silently merged. Close staging connections,
verify clean journal/durable store and atomically publish the bounded descriptor
(temporary file, fsync, rename, parent fsync). Retain the original manifest and
both generations. Uncertain rename/fsync outcome requires inspection while fenced,
not blind retry. Verify read-only consumer parity first. Enabling new logical
writes requires its own explicit decision after that verification and rollback
acceptance. No migration step invokes review completion, retirement or deletion.

## Complete preservation and rollback contracts

Preservation must cover **all** source collections and root properties, including
absent versus empty/null, JSON types and original property/array ordinals; exact
log/score/replay IDs and domain-qualified fingerprints; owners, task IDs,
claimed/examined/completed timestamps and unfamiliar review fields; map/replay/build
links; status and retired identities; conflicts, overlapping/duplicate diagnostic
occurrences and their original order/raw strings. Keep source/cache/body hashes
and canonical map checksums distinct. Preserve old logical evidence locators via
the ADR resolver and frozen source, not volatile store generations in findings.

Compare every projected field against its original property, every reservation
against its unique owner/path/hash/length/readiness, and every referenced original
artifact by streamed exact bytes/hash. Independently reconstruct metadata and
diagnostic values as bounded events; never stringify/canonicalize the whole
manifest or sum sampled checks into a full-preservation claim. Conversion does
not revalidate gameplay interpretations or normalize historical unknowns.
Unsupported/ambiguous input is a blocking result with originals retained.

Rollback is an explicit operation with stopped writers and the lock held:

- **Before activation:** v2 remains authoritative. Retain unpublished staging for
  diagnosis/resume; do not delete it as error cleanup.
- **After activation, before new logical writes:** only after proving the cutover
  logical state/artifacts are unchanged may the exact frozen manifest be restored
  atomically. This restores authority, not a promise that oversized legacy
  consumers become usable. If they cannot operate safely, remain fenced.
- **After any new import/review/status/map write:** the frozen manifest is stale
  and forbidden as rollback. The required route is a previously qualified
  compatible SQLite release using the **current** verified logical state and
  immutable artifacts. Take a fresh coordinated database-backup-API snapshot,
  descriptor/artifact/operation inventory, restore it in isolation and compare all
  post-cutover state before switching binaries/store location. Retain both stores
  and receipts; resolve pending operations only under their existing contracts.
  A pre-write database backup also loses writes and is not sufficient.
- If a schema transformation is necessary, it needs its own lossless bounded
  transform/restore qualification before cutover. If current state cannot be
  verified/restored, stop writes and retain it; do not advertise safe rollback.
  No route depends on exporting an oversized monolithic v2 JSON string. An optional
  streamed administrative export is not operational rollback unless every target
  consumer can safely read it; this plan does not rely on that option.

## Separate gaps, deferrals and task preservation

The local `replay-collection-roadmap-2026-10-10.md` remains paused and is not
part of this storage publication.
Managed importers accept original Chromium cache transport, not downloaded raw
HTTP bodies. SQLite does not fix that provenance/admission incompatibility; a raw
response adapter needs a separate task. Planned-response retrieval, runtime-emission
completeness, managed admission and analysis alignment remain separate claims.
No catalog expansion, occurrence index, coordinator change, tactical change,
dataset publication or retention cleanup is part of this minimum path.

The original planning and documentation-only status tasks inspected resident
source/control receipts and manifest metadata without database or payload access,
test reruns or execution. The later production-wiring implementation uses only
newly generated fixtures for tests, transitions and recovery; it does not repeat
real-data qualification or touch live/backup/rehearsal payloads. Its source/tests
and contracts remain unstaged. Preserve the original evidence/claims, prompt deletion, frozen
expectations, IDE state and both trial worktrees; trial contents are not inspected.
Historical hydration of `.git/objects/82/33017b99ca850635f943d51cb8deec362431aa`
and the observed residency change of
`pack-cf828b5a16e0174af147af2403981bc63a8bfd13.pack` (cause unestablished) remain
disclosed. No historical full no-hydration compliance or restored M2h evidence is
claimed. The original planning/status update did not authorize implementation.
Subsequent separately authorized synthetic log/score checkpoint integrations are
recorded in step 3; they do not change production authority. Authority
selection, complete consumer coverage, lossless rollback and fresh qualification
remain required before any cutover proposal. Production cutover and M2h stay
outside this task.
