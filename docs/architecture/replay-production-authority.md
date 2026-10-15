# Production authority and administrative transitions

Implemented 2026-10-14; validated only on newly generated fixtures. **No live
cutover, production qualification or renewed M2h acceptance is granted here.**
Apply [ADR 0006](../decisions/0006-replay-storage-v3.md) and the
[migration gates](replay-production-sqlite-migration-plan-2026-10-11.md).

## Selection and consumer wiring

V2 remains the ordinary default. A bounded `replay_logs/manifest.json` v3
descriptor with `production.scope: "production-authority-v1"` selects SQLite.
It binds the canonical project root, store ID, relative database path, schema/
payload versions, exact schema hash, proof/release hashes, mode and epoch.
The descriptor is the sole activation point. `.production-state.json` is a
sticky transition/recovery fence, not another backend selector. Inconsistent,
incomplete, unknown or changed controls reject; there is no v2 fallback.

[Production scope](../../tools/replay-production-scope.js) grants a short-lived
descriptor-bound lease; it never adds fixture/rehearsal markers to production.
[Production dispatch](../../tools/replay-production-authority.js) and the
[shared 23-command connections](../../tools/replay-sqlite-consumers.js) reuse
the existing bounded import, review, analysis, cache, lifecycle, maintenance,
list and scan/watch implementations. Explicit `production:true` is accepted by
those internal adapters only inside a valid production lease. Their existing
`synthetic:true` entrypoints retain fixture guards and cannot select production.
Legacy direct access is fenced; production store handles cannot escape the lease.

Ordinary replay-log, analysis, historical-index and scout-screen CLI entrypoints
select this descriptor. `--storage-root <canonical-project>` explicitly addresses
an already selected isolated/restored project; it cannot initialize a store or
choose arbitrary v2 roots. The public analysis/index/screen interfaces return a
Promise for SQLite; callers must await them (v2 retains its existing behavior).
Production commands expose the existing bounded SQLite result structures, not a
reconstructed whole-manifest object. Operational/report compatibility for the
required production callers remains a qualification gate.

All selected commands hold the outer owner-token authority lock. Backend writes,
snapshots and administration retain the shared `.manifest.lock`, descriptor
revalidation, DELETE/FULL SQLite settings and existing journals. Initial mode is
`read-only`; native read-only connections and mutation guards enforce that fence,
including transactions/publication/deletion. Logical writes and optional derived
cache publication need separately approved write enablement. Selection/array,
import, list, maintenance, scan/watch and recovery limits are unchanged. Analysis
still materializes only capped selected diagnostic arrays, not an entire corpus.
Index/screen CLIs disable optional cache publication during initial read-only
access; explicit API `cache:true` still rejects until write enablement.

Imports require explicitly approved canonical cache roots from the migration
proof. Production transport uses original Chromium-cache bytes without a
synthetic marker; original parsers and strict admission remain authoritative.
Raw HTTP bodies are unsupported. The inherited internal checkpoint key names
are not a claim that production evidence is synthetic. Unsupported representations
and exhausted bounds fail explicitly rather than being omitted or normalized.
The [converted-corpus import contract](replay-synthetic-imports.md#explicit-converted-corpus-budget)
adds a proof-pinned `importBudget` profile, `converted-corpus-v1`, with ceilings of
320 logs, 128 scores, 64 maps/associations, 1,024 root properties, 8 MiB root-row
bytes and 128 operation rows. All fields are explicit, privately validated and
reducible; absence retains the 64-record default. Paginated traversal does not
increase individual transport/metadata or scan-discovery limits. Verified converted
log/linked-score duplicates validate original identity/provenance, owned outputs
and payload integrity without fabricating import commitments or changing reviews.
Generated 291-log/95-score continuation is tested; the real snapshot and current
production import/scan workload are **not** thereby qualified.
Legacy `scanCache` seen/callback extensions reject for SQLite; use the bounded
selected scan/watch interface. Other legacy/overflow variants remain explicit.

An additional optional proof-pinned `cacheCapacity: replay-cache-v1` profile
supports up to 8,192 diagnostic wrappers / 4 MiB canonical diagnostic JSONL and
bounded 2,048-file shallow discovery. See the exact required object and independent
budgets in the [cache-capacity contract](replay-synthetic-imports.md#proof-pinned-cache-capacity).
Preparation, selection and recovery bind the original proof hash; this is not a
per-call limit increase. Absent that object, the existing defaults remain unchanged.
Transport, decoded/field, retry, deadline and all integrity limits are unchanged.
Real-cache inspection in this task was metadata-only, not admission qualification.

## Administrative controls

[replay-store-migrate.js](../../tools/replay-store-migrate.js) exposes `prepare`,
`cutover`, `enable-writes`, `rollback-before-writes`, `prepare-recovery`, `restore`
and `select-restored`. It has **no default root**. Invocation format:

```sh
<pinned-node-24.19+> <retained-release>/tools/replay-store-migrate.js \
  <action> <absolute-request.json> <request-sha256>
```

Every request contains `projectRoot`, `approval`, `approvalSha256`; the API also
accepts reduced `limits` and a test-only fault callback (not JSON CLI functions).
The existing recovery budget supplies 64 KiB streaming, 1 GiB database, 2 GiB
artifact, 8,192-file, 1,000,000-row, 1 MiB control, 2 TiB charged-I/O,
256/512 MiB heap/RSS and 1,800-second cooperative limits. Outer watchdog, free
space and retained-output limits must additionally be enforced by the authorized
execution harness. Native SQLite I/O is not fully charged. No larger profile is
introduced. The frozen input manifest remains limited to 600 MiB.
Transition/recovery intents commit the complete effective budget. Recovery with
different limits rejects rather than silently receiving a fresh/larger allowance.

An approval is an externally pinned `production-storage-approval-v1` control,
version 1, containing the exact action/project/subject hash, `approved:true`, a
named operator, and an `expiresAt` within the next 24 hours. It records stopped
writers and confirmed lock coverage, local-APFS eligibility, accepted fsync/rename
assumptions and a pinned durability decision. These are **operator trust inputs**,
not a signature service or automatic proof that all processes stopped or that
power loss is safe. Checksums alone do not establish qualification. No such real
approval/qualification control is issued by these fixture tests.

`prepare` additionally takes `proof` and `proofSha256`. The pinned version-1
`production-migration-proof-v1` control contains:

- Exact `projectRoot`, separate canonical `stageRoot`, `backupRoot` and
  `restoreRoot` data directories; `cacheRoots` is an explicit bounded allowlist.
- `inventory` / `inventoryHash`: a version-1 `files` array of unique relative
  `{path,bytes,hash}` entries including the complete frozen `manifest.json`.
- `release` / `releaseHash`: a retained `production-recovery-release-v1` manifest
  pinning Node, schema/capabilities and independent code/runtime files. The running
  tooling/runtime must match; schema number alone is insufficient.
- `logicalHash`, `artifactsHash`, `preservationVerified`,
  `requiredConsumersQualified`, `m2hAccepted`, and `qualification` /
  `qualificationHash`: a separately accepted `production-storage-qualification-v1`
  receipt binding those hashes, consumer/M2h acceptance and the durability decision.

This interface does not produce that qualification receipt or convert a source.
Reuse the existing separately authorized frozen-copy converter and independent
complete preservation verifier first. The planner then streams all three source/
backup/restore inventories under quiescence, validates the staging conversion's
verified checkpoint against the exact source-manifest hash/length, checks all
original artifact references and complete staged database/artifact commitments,
and copies independent files without replacing mismatched existing outputs.
Non-ready operations/unsupported schema representations block preparation.
Required historical/external dependencies cannot be excluded by filename alone;
the independently accepted dependency/preservation receipt remains required.

`cutover` binds its approval to the proof hash. It revalidates freshness, staging,
backup/restore, release and qualification under lock, retains the exact frozen v2
manifest and journals the intended descriptor. Only the administrative
`store_meta.receipt` binding may change: all other typed cells/order and artifacts
are compared with the preserved conversion. Descriptor publication uses temporary
file fsync, rename and parent fsync. Uncertain outcomes stay fenced; repeat only
the exact explicitly requested recovery action, never blind automatic retries.

`enable-writes` requires another approval bound to the current descriptor hash.
It journals the old/new descriptor and increments the authority epoch, not the
database generation. `rollback-before-writes` is restricted to initial read-only
activation and requires unchanged pre-write typed
state/artifacts and a genuinely parsed, at-most-1-MiB legacy manifest. It retains
the database and journals/frozen source. Larger legacy endpoints reject; the
approximately 534 MB corpus requires compatible-release SQLite recovery even
before writes, not an oversized JSON rollback promise.

## Current-state recovery

`prepare-recovery` takes separate `backupRoot` and `destination` (a fresh project
with an empty `replay_logs/`). Its approval binds the current descriptor hash and
exact `targets: {backupRoot, destination}`. Both roots must be outside the entire
source project and nonoverlapping; the backup must be empty or carry the exact
committed recovery intent. Existing unrelated content rejects before publication.
It uses the existing coordinated native SQLite backup and streamed artifact
inventory, retains the exact production proof, verifies the current post-write
state, then fences the source and publishes a destination-qualified handoff.
The package retains the exact proof, qualification and source-inventory controls
with pinned lengths/hashes; restore does not depend on their old external paths.
Interrupted handoff recovery compares both source and package with the pinned
snapshot before continuing; changed state rejects without repair.

`restore` takes `backupRoot` and `receiptSha256`; `projectRoot` is the new
destination. It reads only the package and retained compatible release, verifies
every typed row and required artifact, and leaves incomplete/complete-but-unselected
restores fenced. `select-restored` needs its own approval bound to that receipt;
it publishes the restored descriptor in read-only mode with a new epoch. To use
that root, every command must explicitly address it (or a separately approved
deployment must adopt it); the original project remains recovery-fenced. Nothing
silently redirects default project paths or enables both stores. Subsequent
write enablement is a separate approval. Repeating restore after logical changes
rejects rather than overwriting them. No stale v2 backup is used after new writes.
Selection rechecks the independent pinned backup receipt, handoff, controls and
snapshot. Rewriting a local restore receipt to agree with a corrupted database
cannot establish a verified restore or new authority.

## Remaining activation gates

This implementation has generated-fixture evidence only. The consolidated
release-candidate-08 is retained and independently small-tested; its exact pins,
snapshot qualification command and capacity blockers are in the
[candidate qualification plan](replay-real-data-recovery-qualification-plan-2026-10-14.md#consolidated-candidate-08--prepared-snapshot-scope).
Release-06 and earlier bundles are unchanged and do not contain this interface.
Retention is not qualification. Establish current dependency
coverage, writer/watcher/ad-hoc-binary quiescence and lock coverage, a fresh
independent operational backup/restore, frozen-source conversion/preservation,
all required consumer/report and lifecycle compatibility, fresh M2h acceptance,
and platform durability decisions. Current unsupported shapes must be resolved
or block cutover. Existing snapshot receipts do not supply these fresh approvals.

Prepare a pinned fixed-budget execution plan and obtain separate production-read/
preparation, cutover, write-enablement and recovery approvals. Metadata-check/open
and check/rename races against non-cooperating writers remain; there is no atomic
OS no-hydration guarantee. Process-crash tests do not prove power-loss durability;
same-filesystem copies do not provide off-device disaster protection. No real
execution, cleanup, automatic schema migration or M2h work is authorized here.
