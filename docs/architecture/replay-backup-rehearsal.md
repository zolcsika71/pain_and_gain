# Explicit backup conversion rehearsal — unpublished scope

## Inventory-bound cache continuation — 2026-10-15

The rehearsal dispatcher now accepts `import`, `score-import` and one bounded
`scan` through `rehearsal-cache-inventory-v1`. This is a separate capability;
neither original transports nor rehearsal stores acquire a synthetic marker or
production lease. Classification remains a separate read-only operation.

Each command supplies `options: {capability, capabilitySha256, source}` (scan
omits `source` and may supply reduced `limits`). The SHA-256-pinned JSON capability
has exactly `version: 1`, `scope`, `productionAuthority: false`, `releaseHash`,
`destination`, `snapshot: {inventorySha256, receiptSha256}`, `operations`,
`importBudget`, `cacheCapacity`, and `files`. Each file has exactly its original
absolute `path`, `bytes`, `sha256` and approved `operations`. Operations are
`classify`, `import`, `score-import`, and `scan`; score permission cannot grant
log admission. Duplicate paths, changed controls, aliases, unlisted files,
changed bytes, wrong destinations and mismatched snapshot pins reject.

The executing retained release must advertise `inventory-bound-rehearsal-cache-v1`;
its hash and the executing capability module are checked. The pinned launcher
verifies the full release/runtime dependency inventory before loading commands.
The destination must be the selected rehearsal lineage with matching original
backup binding. A restored copy requires its own separately approved destination
binding before cache operations. A checksum-pinned capability records approval;
it does not itself prove backup provenance or grant execution authorization.

Finite existing `converted-corpus-v1` and `replay-cache-v1` objects are explicit
and reduced-only. No default ceiling changes. Controls are capped at 1 MiB,
inventories at 2,048 files and 64 MiB, transports at 1 MiB with 64 KiB reads.
The original transport parsers, external score validation, duplicate verification,
writer lock and publication intents are reused. Every consumed source is resident,
canonical, independently stored and content-checked before parsing and at existing
publication boundaries. Existing registered maps retain their verified original
bytes; importing another response does not require reserializing those maps.

Scan consumes the exact sorted approved log inventory without directory discovery,
uses the existing finite retry/recovery loop and reports cancellation/shutdown.
Its reconciliation is neutral-only: `waiting`/`done` or other states requiring
migration/deletion reject before mutation. Classification-only entries and score
entries are excluded from scan, not silently admitted. The consolidated harness
requires every snapshot-associated import/scan result to be an unchanged duplicate;
deferred map eligibility or any unexpected write stops qualification.

Generated tests retain both successful recovery and explicit fences. A failure
before exclusive linking can recover from the exact approved source. A failure
after linking but before temporary-link removal still fails the existing
independent-file guard; both files remain retained, with no automatic cleanup or
repair. Metadata/open races and cooperative resource checks remain limitations.
Tests: [replay-rehearsal-cache.test.js](../../tests/unit/replay-rehearsal-cache.test.js).
The [consolidated plan](replay-real-data-recovery-qualification-plan-2026-10-14.md)
records the retained successor and separately authorized execution scope.

## Rehearsal consumers and independent recovery — 2026-10-14

The separate [rehearsal dispatcher](../../tools/replay-rehearsal-operations.js)
connects the receipt-bound converted copy to `maps`, selected `analyze`, `claim`,
`examined`, `score-claim` and `score-examined`. The later inventory capability above
adds selected imports/scan; lifecycle deletion, cleanup, arbitrary commands,
production selectors and synthetic flags remain excluded.
Original synthetic entrypoints still reject rehearsal roots.

First select with `selectRehearsalAuthority({authorization})`, where authorization
is the exact conversion request. This revalidates the frozen source inventory,
requires a verified conversion checkpoint and current schema capabilities under
the authority/writer locks, then retains `.rehearsal-lineage.json`. The lineage
pins the original origin/package/data root, receipt/inventory hashes, conversion
checkpoint, store ID and exact descriptor bytes. Pin the returned `lineageHash`.
Bound store reads/writers recheck the complete conversion checkpoint hash against
that lineage; a changed checkpoint cannot be accepted by consumers or backup.
Partial selection remains fenced and can be repeated with the same authorization.

Subsequent `runRehearsalCommand({root,lineageHash,command,options})` calls use only
the converted/restored copy. Unknown options/accessors reject; nested command
options are privately copied (64 KiB, depth 16, 4,096 values). Existing selection,
analysis-array, ownership, integrity and maintenance limits still apply. Analysis
does not infer a local build from the receiving release. Maps/analysis are
generation-neutral; claim/examined reuse the existing checkpoint transaction.
Every call holds the outer selector lock and a callback-lifetime authority lease.
Ordinary/direct accesses and old handles reject once bound; no v2 fallback exists.

The historical `.synthetic-authority.json` and member filenames are retained by
the shared fencing protocol. Their **scope value is `rehearsal-authority-v1`**,
their origin remains `verified-backup` or `synthetic-backup`, and
`productionAuthority` remains false. These administrative filenames do not relabel
real data as generated fixtures. A restored member also requires matching restore
intent/receipt and the same pinned lineage.

The existing recovery API accepts a disjoint `rehearsal:{lineageHash}` request
instead of `synthetic:true`. Prepare binds the current selected root, new backup,
new restored destination, release hash, lineage and unchanged recovery limits.
It retains exact descriptor/marker/selector/lineage controls, ordered typed SQL
state and independent artifact copies. The source selector is deliberately fenced
after verification. Restore and selection need only that pinned recovery package
and retained release; they never reopen the original backup or source store.
The rehearsal descriptor is copied byte-for-byte, avoiding JSON reserialization.
Repeat restore before new writes is neutral; later writes reject stale restore.
Interrupted states remain fenced and retained under the existing recovery rules.

Real recovery roots must be direct canonical children of the evidence directory:
`replay-sqlite-recovery-backup-*` and `replay-sqlite-recovery-restored-*`.
Generated backup-shaped tests use direct canonical OS temporary roots
`pain-gain-rehearsal-recovery-backup-*` and
`pain-gain-rehearsal-recovery-restored-*`. Origin determines the permitted family;
roots cannot overlap the original backup package, production, cache, trials or
one another. All required files remain resident independent regular files;
only the existing owner-lock hardlinks are exempt. Metadata/open races remain.

New rehearsal stores include the existing map-repair journal tables so the exact
recovery schema can be checked. Older rehearsal stores reject the missing
capability without automatic schema migration. No map-repair consumer is exposed
by this new route. Recovery preserves any supported existing repair artifacts.

The retained launcher adds `rehearsal-convert`, `rehearsal-select` and
`rehearsal-command`; existing `prepare`, `restore`, `select` accept the disjoint
rehearsal request. Full command/request shapes and pinned release are in the
[real-data plan](replay-real-data-recovery-qualification-plan-2026-10-14.md).
All execution in this implementation task uses newly generated small fixtures.
Real-data qualification still requires its concrete authorization. Process-crash,
scale and power-loss evidence retain their original scope; M2h remains paused.

Tests: [replay-rehearsal-recovery.test.js](../../tests/unit/replay-rehearsal-recovery.test.js).
Commands, intermediate failures, candidate inventories and preservation receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-recovery-integration-20261014-0NMipc/`.

## Original conversion interface

Implemented and tested with **small generated synthetic backup-shaped inputs
only**. Real-backup execution needs separate authorization. Production remains
managed-v2; no cutover, admission, review update or M2h qualification is enabled.
This follows the [migration plan](replay-production-sqlite-migration-plan-2026-10-11.md)
and [ADR 0006](../decisions/0006-replay-storage-v3.md).

## Explicit contract

[`rehearseBackupV2`](../../tools/replay-backup-rehearsal.js) requires ordinary own
data options: `sourceRoot`, `root` (destination), `inventory`, `inventorySha256`,
`receipt`, `receiptSha256`, `acknowledge: 'backup-rehearsal-only'`, and optional
`layout` (`flat-v1` by default) and `deadlineMs` (600,000 by default). Options are
privately copied. An API-only fault callback supports isolated tests. There is
no default root, discovery, automatic retry or capacity override.

Source must be the canonical `backup` child of `scoped-v2-backup-*` directly
under `$HOME/.local/share/pain-and-gain-evidence`. Tests use
`pain-gain-backup-input-*/backup` under canonical OS temp. Origins are recorded
as `verified-backup` or `synthetic-backup`, respectively; real data is never
labelled synthetic. The destination must be a **new empty directory**, directly
under the external evidence directory with prefix `replay-backup-rehearsal-`, or
under canonical OS temp with prefix `pain-gain-backup-rehearsal-` for tests.
Production/cache/trial roots, overlapping paths and symlink aliases reject.

In flat mode, receipt/inventory must be independent resident files beside `backup`, outside
both roots. Operator-pinned SHA-256 digests are checked before parsing. The
inventory is bounded to 1 MiB/513 files, the binding receipt to 16 KiB. Only flat
basename paths and independent regular resident files are supported; hardlinks,
symlinks and dataless files reject. Every file is checked with 64 KiB streamed
hashing before destination initialization. Missing, extra, duplicate, changed
or malformed entries reject; there is no whole-manifest parse.

Versioned formats (illustrative values only, not evidence):

```json
{"schema":"replay-backup-inventory-v1","files":[{"path":"manifest.json","bytes":123,"sha256":"<64 lowercase hex>"}]}
```

```json
{"schema":"replay-backup-binding-v1","sourceRoot":"<canonical backup path>","inventorySha256":"<inventory digest>","files":1,"bytes":123,"complete":true,"verified":true,"origin":"verified-backup"}
```

All source files must be listed; counts/bytes must equal the inventory totals.
Unknown, omitted or null binding fields are not silently accepted. These are
operator-pinned declarations, **not signatures or proof of backup quality**.
Before a real run, a separately reviewed binding must be prepared and checked
against independent backup/restore receipts. Historical receipt formats are not
automatically reinterpreted. No actual backup binding was created in this task.

### Explicit nested operational-backup layout

`layout: 'scoped-managed-v2-v1'` (CLI `--layout scoped-managed-v2-v1`) selects
exactly the existing package shape `backup/data/replay_logs/`. `sourceRoot`
continues to mean the canonical **backup package**; `dataRoot` is derived as
`sourceRoot/data/replay_logs`, never supplied as an option. Both fixed directory
components must be canonical resident directories, without symlinks/aliases.
The destination must be outside the entire package. No arbitrary nested root,
alternate path prefix or layout inference is accepted.

This mode accepts the original `backup/inventory.json` bytes directly, pinned by
their SHA-256. Its schema is `format: 'scoped-managed-v2-backup-v1'`, with
`sourceRoot`, `totalBytes` and `files`. Each row's original
`relativePath: 'replay_logs/<basename>'`, `bytes` and `sha256` remains unchanged.
The row path is relative to the package's fixed `data/` prefix: thus its
package-relative location is `data/replay_logs/<basename>`. Only the bounded
private lookup strips `replay_logs/` for converter-relative names. The inventory
is never rewritten or normalized. Original source metadata, references and
purpose remain in the raw pinned inventory; its historical `sourceRoot` is
provenance metadata, **not** a path this interface opens.

Duplicate mapped names, traversal, absolute paths, backslashes, alternate
prefixes, incorrect totals and extra/missing data files reject. Existing byte,
file-count and per-artifact caps remain unchanged. `data/` must contain only
`replay_logs/`; the package may contain `data` and the known control names
`inventory.json`, `COMPLETE.json`, `scope.json`, `source-consistency.json`,
`RESTORE.md`, `restore.mjs`, `io.mjs`. These controls must be resident independent
regular files if present; they are not converted or executed. Control presence
alone does not establish provenance. The separately authorized binding review
must verify the original completion/backup/restore proof chain and rehash all
432 data files for the recorded real snapshot.

The new binding remains **beside** the package, not inside it. Its exact v2 shape
is the v1 binding fields plus the explicit `layout` and canonical `dataRoot`:

```json
{"schema":"replay-backup-binding-v2","sourceRoot":"<canonical backup package>","inventorySha256":"<original inventory SHA-256>","files":432,"bytes":778354114,"complete":true,"verified":true,"origin":"verified-backup","layout":"scoped-managed-v2-v1","dataRoot":"<canonical backup package>/data/replay_logs"}
```

This is a schema illustration, not an issued real binding. The marker,
descriptor and checkpoint bind the layout, package root, data root and exact
inventory/receipt hashes. A changed layout/binding cannot resume another scope.
Flat mode keeps its original v1 binding bytes/shape, including when `flat-v1` is
explicitly selected. Existing fixture guards and storage schema are unchanged.

## Reuse, isolation and recovery

An opaque immutable capability selects separate reader/converter/store entrypoints.
Existing fixture exports retain their markers/root guards and reject rehearsal
roots. The destination uses `.storage-v3-rehearsal`, not `.storage-v3-fixture`.
Marker, descriptor and conversion checkpoint bind exact source root, origin,
receipt/inventory hashes, `scope: 'backup-rehearsal-v1'` and
`productionAuthority: false`. Nothing changes the production descriptor.

The existing streaming planner, schema-1 core, writer lock, property/order
preservation, reservation/review/history/leaf checks, streamed payload comparison
and primary/cleanup error handling are reused. Source/receipt access is read-only.
The [supported subset](replay-bounded-conversion-fixture.md) now preserves legacy
log `buildId: null` as explicit unknown provenance, separately from omission and
known IDs. Scores and replay associations still reject null build IDs. No identity
is inferred from a linked association; strict known-ID and map/match checks remain.
This extension is tested only with generated synthetic inputs, including flat and
nested rehearsal layouts. The failed real destination remains retained and its
execution authorization exhausted; a new real run requires review and renewed
authorization. Later real-data gates remain unassessed. Explicit history and
unknown metadata/diagnostic preservation otherwise retain their existing contracts.

The historical `backup-sized-synthetic-v1` numeric preset is reused unchanged:
600 MiB input, 320 MiB originals, 8,000,000 structural values, 320 logs, 128 scores,
64 maps/associations and existing per-record/token/review/path limits. Its name
does not relabel the data's origin. The default 600-second cooperative deadline and
256/512 MiB heap/RSS checks remain; scope preflight also has those bounds. Future
execution must fix independent outer timeout/disk/I/O budgets. No performance
tuning, score-retirement support or new capacity is added.

Initialization publishes the core's exclusive marker and descriptor. Partial
initialization (marker without descriptor) fails explicitly without rebuilding,
repairing or deleting artifacts. Concurrent initializers cannot overwrite the
marker; a loser may report incomplete/conflicting initialization and needs
assessment before an explicit retry. Initialized attempts serialize under the
existing writer lock and reconcile to the same job/checkpoints.

### Destination residency before access

The shared rehearsal-store create/open boundary now performs a metadata-only
destination walk before opening any destination content or SQLite database.
It reuses the existing macOS residency check, rejects dataless, symlinked or
unverifiable entries, and bounds enumeration to 4,096 entries and depth eight.
Directory handles close on failure; primary errors retain separate cleanup
failures. An empty new destination remains valid; required marker/descriptor
files on resume must exist and be resident before either is opened.

Existing handles recheck marker/descriptor residency on descriptor access and
database plus existing `-journal`, `-wal`, `-shm` files before native SQLite opens.
Only `ENOENT` permits an absent optional sidecar. Rehearsal lock-owner reads,
artifact hashing and selected snapshot payload opens also check residency.
These checks apply to direct rehearsal-store callers as well as the wrapper;
fixture entrypoints keep their existing behavior and root permissions.

For the nested layout only, each package-boundary check batches the at-most-seven
allowlisted control files into one fresh `/usr/bin/stat -f %Sf` invocation.
Each file still receives regular-file, symlink, canonical-path and hardlink
checks; every returned flag row must be present and well-formed. Dataless flags,
incomplete/unverifiable output or subprocess failures reject before content
access. The flag output is capped at 4 KiB. No result is cached between calls.
Directory checks still precede enumeration; destination marker/descriptor,
database/sidecar and payload access checks are unchanged. This does not batch
arbitrary inventory paths or remove any source-content verification.

A retained small nested synthetic probe with seven controls and 4,096 wrappers
measured 3,761 → 2,189 residency subprocesses and 9.52 → 6.14 seconds, with the
same 156,934,209 instrumented read bytes. This is one instrumented before/after
pair, not a full-size prediction or native SQLite I/O measurement. Existing
600-second defaults, all profiles and non-time budgets remain unchanged.
Commands, retained fixtures, guard regressions and final review are recorded in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/rehearsal-access-review-20261013-AQnSi0/`.

Checks are cooperative metadata preconditions on the supported macOS platform,
**not an OS-level no-hydration guarantee**. Eviction or replacement after a check
and before an open remains a race; no atomic no-hydrate open primitive or source
writer freeze is introduced. Future real execution requires stable resident
source/destination storage and remains separately gated. Mocked metadata tests
intercept premature opens; no actual placeholders are opened to test this.

Every resume verifies source commitments, immutable payloads and stored bindings.
The entire pinned inventory is reverified at final locked acceptance barriers.
This adds inventory reads beyond the fixture optimizer's 14/12 full-source hashes;
no rehearsal performance claim follows from fixture measurements. A changed
source or binding rejects. Source validation is not a source-writer lock or atomic
snapshot: future use requires a frozen independent backup. Unsupported formats
can leave initialized/partial unpublished state, never a successful verified result.

### Explicit rehearsal deadline

The rehearsal API accepts `deadlineMs` as an ordinary own integer value from 1
through 1,800,000 milliseconds; the CLI accepts `--deadline-ms 1800000` for the
proposed 30-minute attempt. Strings/coercion, null, nonfinite/fractional values,
accessors, duplicate CLI flags and values above that ceiling reject. Omission
keeps the existing 600,000-ms default. Options are privately copied before use.

The scope's overall clock includes streamed source authorization and remains
active through publication, verification and resume. The scanner and converter
use the same selected deadline, while the overall scope clock prevents phase
restarts from extending the invocation. API `limits.elapsedMs` may still reduce
the selected ceiling. Existing memory checks and every non-time limit remain
unchanged. Fixture entrypoints and exported capacity presets keep their existing
deadlines. This is invocation policy, not a source identity or new capacity
profile; it does not alter marker/descriptor/checkpoint bindings.

The proposed real invocation also requires an independent **1,860-second outer
watchdog**, with 8 GiB retained output and 2 TiB instrumented JavaScript I/O across
the conversion, preservation checks and conditional resume. These budgets are
fixed before execution and never increased after failure. Native SQLite I/O
remains unmeasured by the JavaScript counter. Blocked synchronous/native work
can outlast a cooperative check; outer termination may leave partial state and
requires confirmed child exit, without cleanup or an automatic retry.

Preparing this option does not authorize real execution. The plan permits one
conversion into a newly created isolated destination; one invocation of the
identical command against that destination is allowed only after verified
conversion **and** complete preservation checks succeed. Any failure retains
artifacts and prevents resume. Production authority/cutover and M2h remain
separate gates.

## Future command — separate execution gate

After independent interface review, binding preparation/verification, supported
format checks, finite execution budgets and explicit real-backup authorization,
the operator may create the new empty destination and run:

```sh
"$NODE24" tools/replay-backup-rehearsal.js \
  --source "$BACKUP_ROOT" \
  --inventory "$VERIFIED_INVENTORY" --inventory-sha256 "$INVENTORY_SHA256" \
  --receipt "$VERIFIED_BINDING" --receipt-sha256 "$BINDING_SHA256" \
  --destination "$NEW_REHEARSAL_ROOT" --ack-backup-rehearsal-only
```

`NODE24` selects resident Node major 24, version 24.19+. Other variables are
operator-selected canonical paths/hashes satisfying this contract. Resume uses
the identical command/destination. Success is marked `backupRehearsal: true` and
`productionAuthority: false`; failures exit nonzero and retain partial state.
No real invocation was performed or authorized by this implementation.

For the unchanged real package, the future command is the following **only
after** separate complete binding verification, binding review and execution
authorization. The destination and binding paths below have not been created;
`VERIFIED_BINDING_SHA256` must come from that later verification, not an example:

```sh
"$NODE24" tools/replay-backup-rehearsal.js \
  --layout scoped-managed-v2-v1 \
  --source /Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/backup \
  --inventory /Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/backup/inventory.json \
  --inventory-sha256 823496672c853d6feb827fe930e489027e53f1ba1e11f587c821af3b8bf1d1e6 \
  --receipt /Users/zoltanka/.local/share/pain-and-gain-evidence/scoped-v2-backup-20261011-vf0qzG/rehearsal-binding-v2.json \
  --receipt-sha256 "$VERIFIED_BINDING_SHA256" \
  --destination /Users/zoltanka/.local/share/pain-and-gain-evidence/replay-backup-rehearsal-vf0qzG-reviewed \
  --ack-backup-rehearsal-only
```

The historical inventory digest must be freshly confirmed before use. The
recorded 432 files / 778,354,114 bytes are a scoped operational snapshot, not a
complete historical archive or current-production certification. The earlier
layout-blocked binding task read no payload bytes; this implementation does not
replace that missing verification. Same-filesystem backup and check/open race
limitations remain. No evidence was moved, copied or relabelled for this layout.

Tests: [replay-backup-rehearsal.test.js](../../tests/unit/replay-backup-rehearsal.test.js).
Commands, exit codes, hashes and retained synthetic roots:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/backup-rehearsal-interface-20261012-zDqK6F/`.
Historical missing-exit captures, accidental large tests, fixture disposal,
incomplete census, hydration/residency and lost-M2h evidence disclosures remain.
Real-backup compatibility, production conversion/cutover and M2h remain unqualified.
