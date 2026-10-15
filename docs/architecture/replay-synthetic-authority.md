# Synthetic authority and bounded post-write rollback

The separately guarded [rehearsal lineage connection](replay-backup-rehearsal.md#rehearsal-consumers-and-independent-recovery--2026-10-14)
now reuses recovery and selected consumers for receipt-bound converted copies.
It does not relax the synthetic roots, requests or selectors documented here.
Real qualification remains separately authorized; the existing scale/crash
receipts cover their original synthetic candidate only.

This is an opt-in synthetic milestone, not production activation. It exercises
the conditional, small legacy-export route in [ADR 0006](../decisions/0006-replay-storage-v3.md#rollback-boundaries).
The [migration plan](replay-production-sqlite-migration-plan-2026-10-11.md) still
requires a qualified compatible SQLite release/current-state restore for
production post-write rollback. No production-sized legacy export is supported.

## Selection and consumer access

[replay-authority-fixture.js](../../tools/replay-authority-fixture.js) is the
single explicit dispatcher. Its input root must be an existing canonical,
direct OS temporary `pain-gain-store-v3-fixture-*` root, schema 1, with both
map-independent-score and map-repair capabilities. Older stores reject without
migration. Rehearsal, backup, production and trial roots are not accepted.

`.synthetic-authority.json` binds scope/version, the retained SQLite descriptor
hash/store ID, backend, exact target, epoch, rollback receipt and
`productionAuthority: false`. The original `manifest.json` stays unchanged.
This separate synthetic selector is **not** the production activation descriptor.
The production protocol's sole v3 manifest activation point remains unimplemented.

The existing owner-token lock protocol also supplies `.authority.lock`. A
consumer holds that outer lock for its entire call; existing backend writer and
snapshot locks stay inside it. Transitions and consumers therefore serialize.
Selection is revalidated under the outer lock; source facts and eligibility are
checked under the SQLite writer lock. There is no dual write or v2 fallback.

Sticky member controls fence incomplete initialization and inactive roots.
Private, callback-lifetime leases bind accesses to the selected backend/root and
selector hash. Bound stores reject direct `--synthetic-sqlite` access and old
handles; use the authority dispatcher instead. Legacy importer/analysis/index
access checks also reject an inactive prepared v2 root. An escaped lease is not
usable after its callback. These are cooperative tooling contracts, not an OS
security boundary against direct database or filesystem modification.

SQLite dispatch reuses all current synthetic routes: log/score import, review,
selected analysis, indexing, screening/cache, list, maps, other output, status
migration, local registration, checksum repair, lifecycle, scan and bounded watch.
Existing operation-specific selection and limits still apply. Option data is
copied before lock acquisition; accessors and unsupported values reject.

After v2 selection, all 23 named commands in the existing synthetic SQLite
dispatcher have a restored-v2 connection through
[replay-authority-v2.js](../../tools/replay-authority-v2.js). Data access and writes
use the selected `replay_logs/` exclusively. The anchor still supplies the immutable
descriptor/member/selector controls and the outer lock; no retained SQLite
database handle, record, cache or payload is used as a fallback. Ordinary unbound
production dispatch retains its existing defaults and behavior.

| Commands | Reused restored-v2 implementation |
| --- | --- |
| `import`, `score-import` | `importCacheFile`, `importScoreCacheFile`; generated full Chromium transport is validated by the same bounded parser as synthetic SQLite admission |
| `claim`, `examined`, `complete`, `done`, `score-claim`, `score-examined`, `score-done` | `updateReview`, `updateScoreReview`; existing ownership and completion/deletion semantics |
| `score-verify`, `score-cleanup` | `verifyScoreSource`, `cleanupScoreSource`; existing retiring intent and tombstone recovery |
| `reconcile`, `list` | Exact selected `reconcileSelectedLog` reuses private v2 cleanup; `reconcileCleanup` supplies corpus list/status migration and retirement |
| `analyze`, `index`, `screen` | `analyzeReplay`, `buildHistoricalIndex`, `screenReplay`; explicit selection, original projections and independently enforced provenance/identity gates |
| `maps`, `other`, `migrate-status`, `register-local`, `upgrade-map-checksums` | Original v2 registration metadata, ordered output serializer, status/local parser and checksum replacement |
| `scan`, `watch` | Existing finite discovery/retry/cancellation loop with v2 import, exact pending-source inspection and startup reconciliation callbacks |

This completes named command connections for the supported capped workflow.
It does not qualify arbitrary legacy states, production rollback or equivalent
API report shapes: for example, v2 list returns its manifest, whereas SQLite list
also reports generation/counters. Scan's internal v2 snapshot token is the current
manifest hash, never a fabricated SQLite generation.

### Restored command bounds and recovery

Manifest reads/writes stay within 4 MiB, 32 combined current records, eight maps
and eight associations, 128 reviews/16 per record, 2,048 original-property rows,
512 retained identities and 4,096 wrappers per log. Source cache files keep the
1 MiB/4 MiB compressed/decoded admission limits. Maps remain at most 1 MiB;
registered current artifacts stay within the 32 MiB budget. Existing selected
analysis limits retain 16 MiB raw/diagnostic arrays. Local JSONL retains the
4 MiB file, 4,096 lines, 64 KiB line and 10,000-tick span limits. The authority's
256 MiB charged direct I/O and 60-second cooperative deadline remain controlling.
Limits can only be reduced. These are cooperating-tool checks, not hard native
I/O/RSS/time guarantees. Recovery archives remain unchanged and separate from
the current registered artifact set; unowned/private files are not a disk census.

Bounded access callbacks are attached only for a selected restored-v2 lease.
They check residency/canonical files before reads, validate the actual planned
manifest before saving, and check retirement growth before deletion. Imports,
local admission and map replacement preflight projected artifact growth.
Non-finite values, excessive nesting, identity conflicts and unsupported shapes
reject without normalization. JSON structural iteration is bounded by the
existing manifest-byte ceiling and depth 64. Whole manifests are materialized
only inside this small 4-MiB contract; no production reader is added or qualified.
Directory enumeration used for v2 map recovery is capped at 64 entries.

Imports retain v2's own pending manifest and exclusive file publication, rather
than inventing SQLite checkpoints inside the legacy format. One pending source
must match the selected cache path/fingerprint; changed/foreign/multiple pending
inputs reject. Repetition preserves first provenance and reviews. Exact retry
recovers missing pending outputs. Score cleanup retains its `retiring` intent and
allows a missing file only after that intent; log cleanup uses v2's existing
done/history retry behavior. Limits are checked before deleting required files.
These paths do not promise SQLite's transactional publication or power-loss
guarantees. Unknown recovery states remain unsupported.

Historical/screen cache data stays below the selected v2 `analysis_cache/`.
Dependency hashes come from the resident implementation root because the export
does not contain copied tooling. Existing source/map/configuration/selection
cache keys and current claim/build gates remain; caches default to disabled on
this route. No SQLite cache is consulted. Screening rejects evidence that fails
the analyzer even if an earlier cache was valid.

Scan/watch reuse unchanged file/byte/attempt/cycle limits and fail-fast semantics;
they discover generated **log** caches only. Startup exact-source recovery
precedes list reconciliation. Same-cycle changes invalidate completion; earlier
commits remain retained for explicit retry. API cancellation awaits active work.
The authority CLI supplies temporary SIGINT/SIGTERM handlers, returns confirmed
shutdown and exits 130 on cancellation. It installs no background worker.

Remaining differences are explicit: custom SQLite `sql`/`pageSize` limit options
are unsupported on v2; reduced list `rows` counts logical record/review properties,
not native SQL results. Maintenance `pageSize` overrides likewise reject. V2 score
review after tombstone retirement rejects because the current source is absent;
score cleanup itself is repeatable. Broader transport/state/segmented variants
and capacities beyond the existing contract remain separate gates. Fencing an
unsupported representation or option is not evidence of its qualification.

## Post-write export and recovery

Create a new, empty canonical direct temporary directory named
`pain-gain-authority-v2-fixture-*`. `prepareSyntheticRollback` binds this destination
to current source store ID, generation, complete bounded metadata facts and
limits before publication. A changed source cannot resume that preparation.

While holding both locks, preparation:

1. Rejects pending publication, retirement, migration progress, pending map repair,
   unknown schema tables and unsupported representations.
2. Uses SQLite's backup API to retain `recovery/index.sqlite`; checks integrity,
   foreign keys, store/generation and every bounded source table against it.
3. Streams current maps/original outputs and a legacy-shaped manifest into
   `replay_logs/`, preserving current reviews, log/score identities, omissions,
   nulls, unknown properties, associations, explicit history and relative ordering.
   Diagnostic leaves use the existing verified wrapper iterator, not a collected
   diagnostic array. The supported external score `/validation` JSON leaf is
   hash-verified and materialized within 1 MiB before exact emission; its raw bytes
   remain in the recovery archive. Child/overflow references are unsupported.
4. Retains `recovery/source-facts.json`, exact diagnostic payload bytes and exact
   old/new map-repair journal files, with source-path mappings and hashes.
   Administrative conversion/import checkpoints remain in these recovery facts
   and the database backup, not as invented legacy application properties.
   Exact database ordinals (including holes) remain in that archive; legacy array
   positions reflect the same remaining relative order.
5. Rehashes copies, performs a bounded actual v2 JSON load/count check and compares
   a second streaming logical encoding. Source projection, review-owner/inline,
   output reservation, diagnostic-leaf and retired-identity checks precede a
   prepared receipt. Independent synthetic tests compare complete records,
   reviews, metadata/order, diagnostic values and subsequent analyzer results.

`selectSyntheticV2Authority` rechecks the prepared manifest, artifacts, recovery
archive, current generation/facts and all current source artifact hashes. Only
then does it durably publish the new selector. New SQLite writes after prepare
invalidate that receipt; they are not overwritten or merged. Repeated verified
prepare is byte-neutral. Repeating an interrupted transition verifies the actual
published state. A verified transition can be repeated while the restored state
is unchanged; later v2 writes invalidate the old preservation receipt rather
than being reverted.

Both stores, intents, successful backups and incomplete private files remain.
An interrupted export can resume only with the same source/limits and exact
already-published bytes. Corrupt/incomplete database backups reject; they are
not replaced automatically. Unknown/ambiguous state fails closed. Missing or
unverifiable required evidence is never fabricated. Source reads and snapshots
do not call retirement; lifecycle deletion is exercised only on newly generated
test payloads by the existing explicit command.

## Finite scope

| Dimension | Ceiling / restriction |
| --- | --- |
| Logs and scores combined | 32 current records |
| Maps / replay associations | 8 each |
| Reviews | 128 total, 16 per record |
| Retired identities | 512 |
| Properties | 2,048 rows total, 128 per owner, 4 MiB charged table metadata |
| Registered payloads / outputs | 64 / 32 |
| Manifest | 4 MiB UTF-8; actual bounded legacy load required |
| Maps | 1 MiB each, valid checksum and exact registered raw hash |
| Required originals plus recovery payload copies | 32 MiB |
| Database backup | 32 MiB preflight page count × page size |
| Diagnostic leaf | 16 MiB, 4,096 wrappers; existing reader token limits retained |
| Instrumented direct I/O / time | 256 MiB / 60-second cooperative deadline per call |
| Control files | 16 KiB, including the receipt (may impose a smaller practical inventory) |
| Stream buffers | 64 KiB; scalar/metadata materialization remains separately bounded |

Limits may only be reduced. Root properties and collection headers need explicit,
unambiguous safe-integer ordinals/counters; larger SQLite integers reject rather
than being rounded. Empty destinations use a one-entry directory probe, not a
whole-directory inventory. In particular, an existing importer can assign colliding
root ordinals when adding previously absent score collections: that state is
rejected, not silently reordered. The demonstrated workflow starts from a
converted source with explicit empty optional score collections. External metadata
other than the bounded score `/validation` JSON leaf, segmented metadata, oversized
selections and unsupported legacy shapes reject.

The implementation retains bounded table metadata and, independently, loads the
at-most-4-MiB exported manifest for the legacy compatibility gate. It does not
claim end-to-end constant memory, production-scale capacity, universal RSS bounds
or native SQLite I/O measurement. Deadline checks are cooperative. Metadata/open
and check/rename races against non-cooperating writers remain; no atomic OS-level
no-hydration or arbitrary power-loss guarantee is claimed. Failure-injection tests
are not crash/power-loss qualification.

## Production-scale endpoint decision — 2026-10-14

The post-write endpoint required by the migration plan is a **compatible SQLite
release operating on a verified restore of current state**, including writes made
after conversion. It is not a larger instance of this document's conditional v2
export. ADR 0006's [rollback boundaries](../decisions/0006-replay-storage-v3.md#rollback-boundaries)
require qualification of the receiving release and its readers/writers. The
inspected plan and latest receipts identify no such qualified release. Selecting
one is a prerequisite to claiming usable operational rollback; a copy opened by
the same evolving candidate demonstrates restoration, not an independently
qualified fallback release.

The 533,731,722-byte manifest is a historical snapshot size, not a measurement of
the UTF-16 length, future export size or peak legacy-reader memory. The following
implementation barriers are independently sufficient to reject a limit-only fix:

- Source inventory: `writer.authorityExportFacts()` in
  [replay-store.js](../../tools/replay-store.js) retains whole capped table arrays:
  32 records, eight maps/associations, 128 reviews, 2,048 properties and 4 MiB
  metadata. A larger restore needs bounded ordered table verification and a
  streamed artifact/operation inventory bound to the locked current generation
  and source content.
- Database snapshot: `backupAuthorityIndex()` uses the SQLite backup API, but
  caps the database at 32 MiB and writes `recovery/index.sqlite` for the small v2
  export. A usable restore also needs the descriptor, originals, diagnostics,
  operation metadata and map-repair recovery bytes, independently verified.
  Database-only copying is insufficient.
- Usable authority: `state()` permits SQLite only at the original anchor;
  `selectSyntheticV2Authority()` selects a v2 destination. The missing connection
  must explicitly select the verified SQLite restore and chosen compatible
  release, fencing both inactive stores and old handles.
- Legacy consumption: `exportAuthoritySnapshot()` performs an actual
  whole-manifest JSON load; `runRestoredV2Command()` loads/validates it on access,
  within 4 MiB. Keep those guards. Split manifests, discarded diagnostics or
  increased limits cannot establish a supported production endpoint.

This is a source/contract assessment, not a new production-scale implementation.
The current backup helper also excludes rehearsal stores, and the selected
consumer guards require generated temporary roots. None is relaxed. Existing
SQLite consumer limits must be checked against the receiving release; connection
of all command names does not demonstrate their aggregate capacity. For example,
the current list contract charges at most 64 MiB of registered artifacts and
maintenance output allows 4,096 wrappers. Whether a particular selection fits is
not established by total snapshot counts alone.

### Proposed next implementation and scale gate

The consequential decision is which exact retained SQLite reader/writer release
will be qualified as the recovery target (runtime, source/dependency hashes,
schema capabilities and command surface). Recommended direction: designate an
independently retained, pinned schema-1 candidate as that target, then qualify it
before any activation proposal. Do not label the current dirty checkout or old
qualification labels as an already-qualified release. A different schema would
require its own approved lossless transformation; no automatic migration.

After target designation, the smallest connection is a synthetic current-state
SQLite snapshot/restore route reusing the backup API, bounded pages, artifact
hashing/publication and authority lock. Its intent must bind the target release,
source store/generation, full inventory digest, destination and limits. Under the
lock, verify all metadata/projections and references, copy required files with
bounded buffers, independently compare the restored database and payloads, then
publish a prepared receipt. Select only after rechecking source state and target
compatibility. Stale or partial snapshots cannot become authority. Retain the
source, both generations and failed artifacts. Recovery must distinguish an
interrupted preparation from a completed selection and reject changed bindings.

Start with generated fixtures and reduced budgets covering post-conversion
imports/reviews, retirement, unknown properties, ordering, map repairs, changed
source bytes without generation changes, stale generations, incomplete exports,
interrupted publication/selection and access to inactive roots. Preserve the
existing capped v2 tests separately. Exact integer ordinals and administrative
recovery state must survive without routing through legacy array reconstruction.

At that assessment, a future scale run was **not runnable or authorized**: there was
no current-state SQLite restore/select CLI to invoke, and no pinned target release.
The existing `prepare-rollback`/`select-v2` commands below cannot substitute for it.
Once the small connection passes, issue a separate execution plan with the actual
implemented commands, candidate hashes and fresh isolated paths. Proposed fixed
run envelope: Node 24.19.0; generated shape of at least 291 logs, 95 scores,
45 maps/associations, 670 reviews, 11 historical identities and 1,076,573 diagnostic
wrappers, plus explicitly measured post-conversion changes; 600 MiB generated
legacy input maximum, 1 GiB database and 2 GiB required-artifact maxima; 16 GiB
retained-output/disk budget with at least 20 GiB free before starting; 2 TiB charged
JavaScript I/O; 64 KiB copy buffers, at most 128 rows per verification page,
256/512 MiB heap/RSS checks; 1,800-second cooperative and 1,860-second outer limits
per phase. Keep existing individual token/property limits and reject excess
rather than tune the run. These are proposed bounds, not demonstrated capacity.

Use one preparation, one isolated restore/verification and one recovery repetition;
no automatic retries. Compare complete ordered tables/properties, store identity,
generation, reviews/history, all artifact hashes and diagnostic ordering before
selection. Exercise a selected read and controlled post-restore write only in the
generated destination and prove the retained source is unchanged. Report native
SQLite I/O as unmeasured unless separately instrumented, and retain cooperative
memory/time and metadata/open-race limitations. Release compatibility, scale,
crash/power-loss, production authority and M2h remain separate acceptance gates.

Assessment and focused existing-boundary checks:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/rollback-endpoint-20261014-4Jb0rf/report.json`.

## Explicit commands

Use resident Node 24.19+ within major 24. Paths below are placeholders for newly
generated marked fixtures, never the production or rehearsal roots:

```sh
node tools/replay-authority-fixture.js select-sqlite "$fixture_root"
node tools/replay-authority-fixture.js claim "$fixture_root" "$fixture_root/claim-options.json"
node tools/replay-authority-fixture.js analyze "$fixture_root" "$fixture_root/analysis-options.json"
node tools/replay-authority-fixture.js prepare-rollback "$fixture_root" "$empty_v2_fixture_root"
node tools/replay-authority-fixture.js select-v2 "$fixture_root"
node tools/replay-authority-fixture.js analyze "$fixture_root" "$fixture_root/analysis-options.json"
```

The bounded JSON options file must be directly inside the authority root. It
contains only the underlying operation's options, never another storage root.
The corresponding exported JavaScript functions require `synthetic: true`.
Tests: [replay-authority.test.js](../../tests/unit/replay-authority.test.js).
Restored command coverage/recovery:
[replay-authority-v2.test.js](../../tests/unit/replay-authority-v2.test.js).
Validation, retained generated fixtures and preservation limits:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/restored-v2-coverage-20261013-ikSDa3/report.json`.

Production authority, broader rollback representation coverage, capacity qualification,
fresh crash/resource evidence and M2h remain separate, open gates. Historical
hydration, evidence loss, fixture disposal and incomplete-census disclosures are
not changed by this synthetic result.

## Independent SQLite recovery candidate — 2026-10-14

The operator designated the resident candidate **for qualification**, not as a
qualified rollback release. A pre-edit dependency/runtime bundle and a separate
augmented restore bundle are retained with SHA-256 inventories outside the checkout.
The task receipt and exact follow-up commands are in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-recovery-release-20261014-SY8oNY/`.
These bundles include the Node 24.19.0 macOS binary, complete local module closure,
minimal ESM package descriptor and protocol documents; macOS system libraries
remain explicit platform dependencies. Read-only modes and macOS immutable flags
protect the retained copies, not against an owner/root deliberately removing them.
They are independent copies, not links or off-device disaster protection.

[replay-sqlite-recovery-fixture.js](../../tools/replay-sqlite-recovery-fixture.js)
connects current-state backup, independent restore and explicit selection.
[replay-recovery-launch.cjs](../../tools/replay-recovery-launch.cjs) verifies the
operator-pinned release inventory and every bundled file before importing tools.
Use its retained runtime, never a mutable-worktree launcher:

```sh
"$release/runtime/node" "$release/tools/replay-recovery-launch.cjs" "$release_sha256" prepare "$prepare_request"
"$release/runtime/node" "$release/tools/replay-recovery-launch.cjs" "$release_sha256" restore "$restore_request"
"$release/runtime/node" "$release/tools/replay-recovery-launch.cjs" "$release_sha256" select "$restore_request"
"$release/runtime/node" "$release/tools/replay-recovery-launch.cjs" "$release_sha256" command "$consumer_request"
```

Prepare request: `{synthetic:true,root,backupRoot,destination}`. All roots are
distinct canonical direct children of the canonical OS temporary directory;
source/destination use `pain-gain-store-v3-fixture-`, backup uses
`pain-gain-sqlite-backup-fixture-`. Backup/destination initially must be empty.
Restore/select request: `{synthetic:true,backupRoot,destination,receiptHash}`;
pin the hash returned by successful preparation separately from the package.
Consumer request: `{synthetic:true,root:destination,command,options}`. The JSON
launcher supports result-returning consumers; streamed `other` output still uses
the retained authority CLI/API and its sink contract. It adds no consumer feature.
Optional `limits` only reduce fixed bounds and must agree on recovery. No real,
rehearsal or arbitrarily nested roots are accepted; ordinary production stays v2.

Preparation holds the authority and writer locks, takes a native SQLite backup,
copies original descriptor/marker/selector bytes and all referenced payload/map
and verified map-repair artifacts, and compares ordered typed rows and hashes.
Only then does it fence the original selector and publish the destination-specific
handoff. **The source selector changes deliberately; database/payload bytes do not.**
The source remains retained and inaccessible through normal authority commands.
Restoration needs only the pinned package and retained release, not the old root.
An incomplete restored destination is fenced before data publication. Explicit
selection makes that destination its own SQLite authority anchor. Repeating restore
after new writes rejects rather than rewinding them; repeating selection preserves
current writes. Partial files/uncertain publication reject and stay retained;
tested phase-boundary interruptions recover exactly, not arbitrary torn files.

Schema/payload version 1 alone is insufficient: require the exact ordered
`sqlite_schema` fingerprint plus map-independent score association capability,
map-qualified repair journal and synthetic authority support recorded in the
release inventory. No transformation or automatic upgrade occurs. Pending import,
retirement, migration or incomplete map repair rejects; completed administrative
rows and old/new repair bytes are retained. Segmented/child payload references
remain unsupported. Review owner/inline projection and reservation checks remain
strict; null review projections are allowed. Exact table hashes preserve integers,
types, nulls, property/diagnostic ordering and unknown metadata without v2 export.

Fixed recovery bounds: 1 GiB database, 2 GiB referenced artifacts, 8,192 files,
1,000,000 total table rows, 64 KiB text cells, 256 KiB encoded rows, 128 properties
per review, 1 MiB controls, 64 KiB copy buffers, 2 TiB charged JavaScript I/O and
1,800-second cooperative deadline per invocation; sampled heap/RSS 256/512 MiB.
The external scale plan adds an aggregate I/O/disk cap and 1,860-second watchdog.
Native SQLite I/O is not measured; native statements and metadata/open races are
not hard OS-level resource or no-hydration guarantees. Existing consumer limits
remain unchanged: this endpoint does not certify every large consumer workload.

[Focused retained-fixture tests](../../tests/unit/replay-sqlite-recovery.test.js)
cover post-write import/reviews, retirement/history, repaired maps, downstream
analysis, independent child restore/reads, interruption, stale generation, corrupt
artifacts/controls/reviews, incompatible schema, limits, concurrent restore,
wrong release pin and primary/cleanup errors. Initial SQLite authority selection
now checks storage capabilities independently of the old 32-record v2 exporter;
the capped v2 rollback path and its limits remain unchanged. At that implementation
milestone, full-size and actual process-crash recovery remained unqualified.
Subsequent seven-boundary SIGKILL checks and the separately approved full-scale
generated run are recorded in the
[migration milestone](replay-production-sqlite-migration-plan-2026-10-11.md#demonstrated-process-crash-and-full-scale-synthetic-recovery--2026-10-14).
Those results cover the named synthetic scope. Power-loss/platform durability,
real-data recovery scope integration, production release compatibility and M2h
remain separate gates. The
[isolated real-data plan](replay-real-data-recovery-qualification-plan-2026-10-14.md)
does not relax these fixture entrypoints or authorize another run.
