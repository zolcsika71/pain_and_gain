# Replay-watcher startup measurement (2026-10-02)

The committed watcher-reporting change made startup visible but did not shorten
the initial cache scan. A bounded production observation at commit
`af2648aad7f64d357b6c83228f51acf0aa6b27d1` reached polling readiness in
297 seconds. The default cache held 1,115 files, including 355 parseable replay
log responses: 239 matched current records, 11 were retired, and 105 had no
validated active map. The final 105 `deferred` reports appeared only after the
file loop. There was no new map-backed import candidate. This observation does
not reconstruct when the earlier silent watcher sessions stopped.

## Bounded profile and change

The baseline profile copied the existing 445 MB manifest and the first 60
sorted cache files, plus their referenced maps and captures, to an isolated
root. Of these files, 15 were replay-log responses: nine current, one retired,
and five unassociated. `scanCache` took 12,110 ms. It acquired the manifest lock
15 times, read and parsed the manifest 15 times (2,253 ms reading and 9,595 ms
parsing), read ten maps, and reported five mapless deferrals. Repeated manifest
loading accounted for nearly all measured scan time; this is a measured
bottleneck, not an inference from the 297-second run alone.

The importer now keeps one parsed manifest per `scanCache` call. Every parsed log response
still acquires and releases the same lock. Under that lock, reuse requires the
manifest's device, inode, size, nanosecond modification time, and nanosecond
change time to match the cached stamp. An atomic replacement by another
lock-using writer forces a reload. A failed action invalidates the in-memory
copy. A successful import that writes the manifest changes its stamp, so the
next response reloads. Replay-specific map validation, output verification,
deduplication, retired fingerprints, deferred retry, and review lifecycle
rules are unchanged. No scan-wide lock or cross-poll cache was introduced.

On an equivalent isolated copy of those 60 files, the changed scan took
1,121 ms: 15 lock acquisitions, one manifest read and parse (234 ms and 640 ms),
ten map reads, and the same five deferrals. A separate isolated copy of all
1,115 cache files and their referenced managed evidence completed the changed
scan in 9,160 ms with one manifest read, 250 map reads, 105 deferrals, and the
same 239 retained records. These are local wall-clock samples, not a guarantee
for another cache or a live Arena write. The full-copy result and the earlier
production 297 seconds are not a paired benchmark on identical destinations.
The full-copy `watch` CLI reached its polling-readiness line in 10,100 ms,
including reconciliation and the initial scan, and reported the same 105
deferrals with no import or error.

Startup still announces itself before reconciliation and prints readiness after
the scan. The full-copy scan no longer had a multi-minute silent interval, so
this change adds no periodic duplicate or per-file output. If future caches
make that interval long again, add coarse bounded progress separately from
import events; duplicate responses must remain quiet as evidence events.

## Compact serialization and targeted recovery (2026-10-03)

The later `Invalid string length` failure was independently reproduced at
`saveManifest`'s `JSON.stringify(manifest, null, 2)`, before pending publication.
The accumulated production manifest was 534,086,198 bytes; Node v24.19.0's
single-string limit was 536,870,888 characters. Each of the three valid late
responses for replay `6abff2962ea5a31135f73f90` would require approximately
537.27–537.34 million characters of indented manifest JSON. These are
accumulated serialization costs, not oversized or malformed individual responses
or evidence of heap exhaustion. The original diagnostic copies remain separate
from production.

`saveManifest` now omits indentation and preserves its trailing newline.
The data, schema, locking, cache invalidation, temporary-file publication,
fsync/atomic replacement, pending recovery and lifecycle rules are unchanged.
Readers accept both existing pretty and compact JSON. Unknown properties,
null/zero values, reviews, identities and optional score collections are not
filtered. This is **bounded capacity relief**: reads and writes still materialize
the entire manifest and will eventually encounter size/memory limits. Streaming,
sharding, cleanup and storage migration are deferred; increasing the heap does
not remove the demonstrated single-string limit.

### Validation before production writes

The new scaled-budget regression failed on the old serializer with the same
`RangeError` at `saveManifest`, then passed with compact output. It imports from
a pretty manifest with opaque/Unicode metadata and optional score collections,
checks semantic preservation and exact compact bytes, and retries without a
write. A second regression injects failed atomic replacement at both the first
pending save and final claim save, checking unchanged/pending disk state, lock
and temporary-file release, cache invalidation and targeted recovery. Existing
pending-restart, duplicate, map-validation and concurrent locked-writer tests
are reused rather than weakened.

Original validation in the working tree containing the separate uncommitted
pairing candidate passed **49/49 importer-focused tests** and **213/213 full-suite
tests**, plus `npm run check` and whitespace checks. That working tree's runtime
build remains
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.
For independent importer-only staging against HEAD `8c0ce181`, an isolated copy
of HEAD plus the staged four-file patch passed **49/49 importer-focused tests**,
**201/201 full-suite tests**, and `npm run check`. Its unchanged HEAD runtime
build is `fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`;
the separate pairing changes are not required or included. Documentation links
and staged whitespace were checked separately.
An isolated copy of the complete 267-record manifest also successfully imported
all three responses and retried them as duplicates, preserving every old record
and non-record collection. That bounded run took 13.47 seconds with 4.62 GB
peak resident memory; these are local measurements, not resource guarantees.

### Production recovery and preservation

Before recovery, a restorable byte-verified backup was retained at
`replay_logs/local_audits/2026-10-03-manifest-recovery/backup-Q4Ivfh/`.
It contains the original complete manifest, fourteen affected JSONLs, linked
map, three original cache responses and verification receipts. Production was
not replaced with the isolated replay-only subset. Only the three exact original
cache files were passed to existing `importCacheFile`; neither scan/watch nor
cleanup/review operations were run.

| Original cache file / request suffix | Response fingerprint | Recovered runtime ticks / complete closures |
| --- | --- | --- |
| `169a5ef159ea02c4_0` / `/log/1500` | `99255b60ac32597b3d091727197caaace4eefc0b199606e77b0864333aade6f4` | 1401–1500 / 100 |
| `678d3cfb58088004_0` / `/log/1600` | `d3e344bc59aaa55c9edc20ee6ccef99ff0416940ba8826335b8b5b97592de9ad` | 1501–1600 / 100 |
| `0178b1f7a1e59dbf_0` / `/log/1699` | `28d0db42f721777543c0045553544233c2e72b45b1e8618d6c54fc2b95118ae8` | 1601–1698 / 98 |

All new responses passed parser/diagnostic validation without gaps, conflicts,
missing closures or correlation issues. They match captured trial build
`5ed39cf263f61ad9273d4ae8d63c3d0dec913c962449565e408408abf2bbfc3d`
and the existing map
`c1996e5b397f8eb4006d39826b6e16e76d8c7e580d67c5a3d2200a160fd91818`.
The replay now has 17 records, **1,698 consecutive snapshots and complete
closures through tick 1,698**. Metadata tick 1,699 remains absent from runtime
evidence; neither truncation nor zero events is inferred. This extends retention
only; the completed pairing screen was not repeated.

The final manifest is **474,810,505 bytes**, 270 records total. All 267 prior
records compare identically, including reviews/completion state; all non-record
metadata, original cache hashes and 457 pre-existing evidence/artifact files
compare unchanged. The latter inventory also retains old owner temporary files.
All 1,061 protected project/worktree files compare unchanged. The three new
records remain `claim`, with empty review ownership and no inferred completion.
All three targeted retries were `deduplicated` and left manifest bytes unchanged.
The watcher remains stopped; no gameplay, configuration/build change, commit or
push occurred.

The initial preservation verifier incorrectly treated `.manifest.lock` as a
permanent evidence file and stopped when it was absent after recovery. This was
distinct from the original serialization failure: the importer recovered the
abandoned lock of terminated watcher PID 14734 through its existing locked
workflow. Read-only verification excluding that operational lock then passed;
the old owner temporary files remained unchanged. No manual lock deletion or
evidence rollback was performed.

To repeat only the targeted imports from the repository root (now duplicates),
without the scan/watch reconciliation path:

```sh
node --input-type=module <<'JS'
import path from 'node:path';
import os from 'node:os';
import { importCacheFile } from './tools/replay-logs.js';
const cacheDir = path.join(os.homedir(), 'Library/Application Support/screeps_arena/Cache/Cache_Data');
for (const name of ['169a5ef159ea02c4_0', '678d3cfb58088004_0', '0178b1f7a1e59dbf_0']) {
    const result = await importCacheFile(process.cwd(), path.join(cacheDir, name));
    console.log(JSON.stringify({ kind: result.kind, replayId: result.record?.replayId,
        fingerprint: result.record?.fingerprint }));
}
JS
```

Reproduce repository checks with:

```sh
node --test tests/unit/replay-logs.test.js
npm test
npm run check
git diff --check
```

Retain the backup and recovered JSONLs. Any later rollback needs stopped writers,
comparison against intervening changes and atomic restoration of the verified
complete manifest, not replacement with a subset or deletion of recovered
captures. Original captures/maps remain hash-verified and available for those
references. Manual action: **NONE**.

## Durable-storage design checkpoint (2026-10-03)

[ADR 0006](../decisions/0006-replay-storage-v3.md) records the accepted design
and implementation contracts for a SQLite operational index with immutable
per-response diagnostics/summary/extension files. It does not describe deployed
storage: the compact version-2 manifest and current importer remain unchanged.

The read-only structural profile at main commit
`52dba8bb8216afad12615f1a2098a0dfba7733b3` measured 469,562,405 bytes of
`otherEntries` (98.89% of the 474,810,505-byte manifest), across 957,196 entries.
No repeated `(source key, raw entry)` pairs were found within replays; dropping
duplicates is not a supported capacity fix. The profile streamed one collection
element at a time with a 60-second deadline; 7.37 seconds and 410,583,040 bytes
peak RSS include duplicate-hash bookkeeping, not a v3 performance measurement.

The ADR defines bounded metadata/payload access, preservation, locking and
file-operation journals, explicit migration/rollback, and
[M1's isolated core-only scope](../decisions/0006-replay-storage-v3.md#first-isolated-implementation-milestone-m1).
No storage implementation, rehearsal or production migration has run. Production
migration needs a fresh complete verified backup: the retained pre-recovery
backup alone lacks the subsequent recovered records. Existing evidence,
review states, gameplay/builds and both trial worktrees remain retained.

The subsequent separately authorized [M1 synthetic core qualification](replay-storage-v3-m1-2026-10-03.md)
implements only temporary-root storage mechanics. It does not change the v2
importer, introduce production storage, or perform migration/rehearsal.
