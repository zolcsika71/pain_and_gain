# Synthetic map, diagnostic output and local-log maintenance

Status: 2026-10-13. Explicit generated schema-1 fixtures only; production uses
the existing v2 dispatch. This connects supported remaining consumers in the
[migration plan](replay-production-sqlite-migration-plan-2026-10-11.md), including
map-owned missing-checksum repair in capable generated stores.

## Commands

Use supported resident Node 24.19+ within major 24:

```sh
node tools/replay-logs.js --synthetic-sqlite <fixture-root> maps
node tools/replay-logs.js --synthetic-sqlite <fixture-root> other <replay-id> <fingerprint>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> migrate-status
node tools/replay-logs.js --synthetic-sqlite <fixture-root> register-local <replay-id> <jsonl-basename>
node tools/replay-logs.js --synthetic-sqlite <fixture-root> upgrade-map-checksums
```

The [command module](../../tools/replay-maintenance-command-fixture.js) reuses
the existing direct temporary fixture guard, residency checks, SQLite APIs and
original v2 parsers. No default root, schema migration, authority selector or
alternative backend is added. Unsupported arguments reject instead of falling
through to production. The ordinary dispatcher remains unchanged. Local JSONL
validation is extracted as a pure shared `parseLocalLog` function; v2 uses the
same validation and its existing uncapped behavior. This is existing explicit
local-capture provenance, not raw-HTTP or fabricated Chromium admission.

## Map and diagnostic output

`maps` returns registration properties in stored ordinal order, including unknown
inline fields, with `activeReplays` in association ordinal order. Bounded map and
replay pages use generation-bound cursors. The writer lock keeps the inventory
and its artifact checks coherent; no transaction or generation write occurs.
Each map is checked for canonical safe path, residency, independent regular file,
exact saved-byte hash, validated registration, payload schema and canonical
checksum. All results are validated before the CLI emits its first line.

`other` selects one current log response. It uses the existing pinned snapshot,
ordered diagnostic iterator and JSONL output serializer. Supported inline arrays
or an exact owned `/otherEntries` leaf retain values, unknown wrapper fields and
order. A complete dry pass verifies integrity, count and output bounds before
emission. A second pass from the same pinned files awaits sink backpressure.
There is no diagnostic corpus reconstruction or accumulated wrapper array for
external payloads. One wrapper may be materialized within the existing 1 MiB
token bound. Selected segmented/overflow descendants remain explicitly unsupported
by this command; no missing file is ignored. Unselected records are not read.

Output failures may leave a prefix on stdout after emission begins, and reject
with the primary error. They do not mutate the store. Residency checks precede
snapshot opens; metadata-check/open races retain the existing platform limit.

## Status migration and local adoption

`migrate-status` uses the existing locked list planner in a separate migration-only
mode: validate the supported bounded corpus, atomically change waiting logs to
claim, preserve original status ordinals and all reviews/unknown metadata, and
**never retire done records**. Scores are untouched. No changes means no generation
increment. Pending/overflow representations outside the planner's established
contract reject. This is not broad status normalization or general repair.

`register-local` requires an independently identified replay and a matching safe
JSONL basename already inside the generated fixture root. The replay must have
a validated active map containing ScoreFlags. The shared v2 parser checks exact
flag identity/position/effect values on every game-state line, before-actions
phase, ticks and consistent build provenance. The original bytes, whitespace,
unknown state fields and line ordering are retained unchanged. The fingerprint
remains `SHA-256("manual-jsonl:" + replayId + "\n" + content)`. A missing build
remains a null log identity even when its association has a known build. Explicit
null/malformed build tags and genuine known-ID conflicts keep their v2 rejection.

Normal `reserveOutput` still rejects every existing unowned file. A separate
`prepareLocalLogAdoption` capability verifies a bounded exact file under the
writer lock and returns a private proof tied to that writer, record, path,
hash/length and file identity. Options and nested identity are copied before an
await; accessors and inherited/unknown options reject. The transaction consumes
the proof once, requires explicit `manual-jsonl` provenance, and reserves the
pending output plus existing publication intent. A forged or foreign-writer
proof cannot authorize adoption. This capability rejects rehearsal stores.

The checkpoint binds source hash/length, store identity, map hash, metadata and
ordinals before advancing publication. The existing publisher verifies/reuses
the already-present exact JSONL, fsyncs its directory, and publishes an owned
empty diagnostic root so established analysis readers can reconstruct the
original empty array. Output, empty diagnostics, intent removal and ready status
are checked through reserved → published → verified recovery. Repetition does
not rewrite reviews, payloads or timestamps. Corrupt reservations, review-owner
bindings, inline projections, checkpoints or diagnostic descendants reject
without repair. Cache imports and scan refuse pending local adoption; retry the
exact `register-local` selection before other work. A changed pending source
cannot create another record or bypass the retained intent.

As in v2, supported waiting-status migration precedes new local adoption, but
done-log deletion does not. Existing converted/adopted records without this
adoption commitment remain unsupported rather than being retroactively blessed.
Filename matching alone never establishes replay provenance; an operator must
already know the local capture's replay identity.

## Finite bounds

`MAINTENANCE_LIMITS` fixes: 64 maps, 128 associations, 512 current records,
128 properties per owner, 4 MiB aggregate encoded metadata, 4 MiB local file,
1 MiB map, 64 MiB charged artifact reads, 4,096 diagnostics, 16 MiB diagnostic
output, 4,096 local lines, 64 KiB per line, 10,000-tick span, 128-row pages and
a 60-second cooperative deadline. API options may only reduce these maxima and
are snapshotted before async work; CLI uses the defaults. Status migration also
retains the list planner's review/row/SQL bounds. Limits reject explicitly; no
successful truncation is returned.

Local JSONL parsing materializes one selected file within 4 MiB; it is not an
end-to-end streaming reader. Map/association reports collect only their explicitly
bounded metadata. Direct read counters charge selected bytes and repeated checks;
existing snapshot/publication hash passes and native SQLite I/O are separately
bounded by their finite selected-file/count limits, not claimed as aggregate
instrumented I/O. Deadlines remain cooperative across native calls and awaited
sink operations. Primary operation errors retain their system codes; close errors
are attached separately. Core artifact hashing now preserves that same error
contract on the directly affected adoption path.

## Map-owned checksum repair

`upgrade-map-checksums` now calls the restricted `openMapRepairStore` handle and
[map repair journal](../../tools/replay-store-map-repair.js). Its only operations
are repair and close; it cannot expose a general writer through the recovery
exception. New schema-1 synthetic stores have the exact `map-repair-v1` optional
table capability (`map_repairs`). Missing/altered capability rejects with
`UNSUPPORTED_STORE`; open/repair never installs it. Older stores remain readable.
Rehearsal and catalog stores do not acquire this capability. Existing
record-qualified `operations` / `operation_files` and their foreign keys are
unchanged; no record owner is fabricated.

Under `.manifest.lock`, the command validates every selected registration, raw
hash, schema and canonical identity before beginning repairs. It uses the same
`savedMapContent` as v2: add the top-level checksum and produce canonical JSON
plus a newline. Nested values and array order are preserved. Already-upgraded
maps return `verified` without rewriting bytes or advancing generation. Invalid
present checksums and changed data are never repaired. Unlike v2's per-map error
rows, a failure rejects the bounded operation; no successful partial report is
emitted. Earlier completed maps in a later failing invocation remain committed.

For each valid missing-checksum map:

1. Retain independent exact old/new byte files below
   `store-v3/<store-id>/map-repairs/<map-id>/`, with hash-qualified names.
   Flush the files and their directory chain. Partial private temporaries stay
   retained; retries reuse only complete, matching files.
2. Commit a map-FK intent binding its path, canonical ID, old/new raw hashes and
   lengths, original device/inode, map ordinal and exact ordered property hash.
   Source changes before this boundary reject. The intent starts `reserved`.
3. Revalidate the original bytes and inode, write/fsync a fresh private copy,
   rename it over the exact map, then fsync the replacement and directory.
   Record `published`. A crash after rename but before this checkpoint is
   recovered only when the current bytes exactly match the committed new bytes.
4. Verify both retained copies, checksum-generation equivalence, registration
   binding and current bytes. Atomically update `maps.hash`, an existing `/hash`
   original property (same ordinal), and the intent's `verified` state.
   Absent hash properties stay absent; no other property is added or normalized.

Any non-verified intent fences ordinary reads, writer callbacks and new pinned
snapshots with `RECOVERY_REQUIRED`, including already-open handles. Only the
explicit repair handle can recover it. Previously pinned descriptors keep the
old inode and metadata coherent across rename. Recovery does not repair corrupt
rows, infer hashes, overwrite changed/unrelated files or delete retained originals.
It validates the same commitments after repeated interruptions. Completed
intents and both copies stay retained, and cross-kind ownership prevents their
paths from being reserved as record/payload/map artifacts. Replay links, reviews,
record bytes and unrelated maps are untouched. Pending record publication or
retirement blocks starting this repair.

The repair has separately reduced-only bounds: 64 maps, 128 inline properties
per map, 4 MiB charged metadata, 1 MiB per old/new map, 64 MiB charged direct I/O,
64 KiB I/O chunks and a 60-second cooperative deadline. It retains small bounded
rows and materializes only the current bounded map/copies; no manifest is rebuilt.
Repeated verification and writes charge the I/O budget. Native SQLite I/O,
directory fsyncs and OS metadata are outside that byte counter. Limits can stop
a partially completed invocation explicitly; they never increase automatically.

Residency checks precede content opens. The writer lock excludes cooperating
writers, but metadata/open and final check/rename remain race windows against
out-of-protocol changes; there is no OS-level compare-and-swap or no-hydration
guarantee. Fault injection establishes recovery at the tested boundaries, not
arbitrary device/power-loss durability. Primary read/write/commit errors retain
their codes; descriptor/rollback cleanup failures are reported separately.

## Validation and scope

New retained fixtures exercise v2 map/other/local/status parity, shared maps,
selection and ordering, empty results, budgets, mutable/accessor options,
private-proof rejection, publication interruption/repetition, changed sources,
review/reservation/leaf corruption and primary/cleanup failures. They also run
local adoption → claim/examined → analysis → list. Related existing synthetic
consumer tests are reused; historical large and Git-object-reading cases are
excluded. Commands, intermediate failures, hashes, IDE findings and preservation
limits are retained at:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-consumer-completion-20261013-IXPYpu/report.json`.

The repair regression first reproduced `UNSUPPORTED_REPAIR`; the new retained
fixtures cover exact v2 bytes, map-only/shared ownership, pending access fences,
interruption, repeated/concurrent recovery, changed sources, corrupt commitments,
old capability rejection and primary/cleanup errors. Current commands, results,
hashes and inspections are retained at:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/sqlite-map-repair-20261013-k1Rfnr/report.json`.

Consumer coverage remains bounded by the stated representation/capability limits.
Authority selection, lossless rollback including new writes, cutover and fresh
qualification remain separate gates. Production migration and M2h stay paused
and unqualified; historical evidence-loss and test-scope disclosures are unchanged.
