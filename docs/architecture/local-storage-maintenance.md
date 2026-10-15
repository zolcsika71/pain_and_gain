# Local storage maintenance

Inventory before considering cleanup:

```sh
node tools/storage-inventory.js --dry-run
node --test tests/storage-inventory.test.js
node --check tools/storage-inventory.js
```

The standalone inventory also defaults to dry-run with no arguments. There is
no apply/delete/archive mode and no arbitrary target argument. It measures
allocated blocks (`lstat.blocks * 512`) and logical lengths separately, never
follows symlinks, and counts each device/inode once across the main checkout,
registered worktrees and shared Git directory. Errors are reported explicitly.
APFS clones, compressed/dataless files and snapshots mean block totals are not
a guarantee of physical free space reclaimed. Record `df -k .` too; background
disk activity can change it independently of this project.

Only architecture documents and test/fixture source are read for temporary-path
references. Inventory is limited to `/private/tmp`, the resolved OS temporary
directory, and project prefixes found in the fixture code (`pain-gain-`,
`scout-hold-cache-`, `historical-index-`). These names establish inventory scope
only. They do not establish ownership or eligibility for deletion. An absent
receipt path is a preservation gap, never proof that this task reclaimed space.

Treat all `replay_logs/` contents, including local audits and analysis caches,
as protected evidence. Count their metadata only: do not open, hash, analyze,
archive or delete them during a storage task. Also preserve candidate files,
frozen oracles, reviewed plans, original receipts, failed/interrupted fixtures,
reproduction material and trial worktrees. Do not hydrate dataless worktree
files merely to measure storage. No Git clean, worktree removal, reflog expiry,
history rewriting or aggressive pruning is part of this procedure.

Before any separately reviewed synthetic cleanup, build an explicit absolute
path allowlist with per-target provenance, reproducer, reference/retention
review and disposition. Check processes, working directories and open handles
(for example `ps` and `lsof +D <exact-root>`); inability to establish inactivity
blocks deletion. A quiet process list, old timestamp, fixture marker or matching
prefix alone is insufficient. Recheck path identity, symlinks, hard links and
ownership immediately before acting; fail closed on uncertainty or change.

Completed historical runs may be archived only when their retention contract
permits it and active work does not require the original tree. Keep original
receipts immutable. Add a separate mapping of original absolute root to archive,
archive hash, file manifest and restoration procedure. Before removing originals,
extract into a new isolated directory and verify all bytes, paths, file types,
permissions and required metadata against the original. Archive testing must
also reject traversal and escaping links. Restore first to an empty isolated
directory, verify that same manifest, then deliberately restore to the required
original path without overwriting anything. If device/inode/allocation identity
matters to unresolved failures, retain the original tree: an archive cannot
recreate that identity. Archive plus verification copies consume space until
eligible originals are actually removed; moving on the same disk saves nothing.

No current target justified destructive tooling in the
[2026-10-07 audit](local-storage-audit-2026-10-07.md). It adds inventory and this
procedure only. Future cleanup must remain dry-run by default with explicit
allowlists and small synthetic safeguard tests. Do not alter qualification
workloads, concurrency, limits, frozen expectations or claims to reduce space.
Account for at least 36 × 600 MiB (21.09375 GiB) of unrelated payloads per full
M2h run, plus artifacts and retained prior runs, before scheduling such work.

Temporary directories are not a durable retention location. Before an OS cleanup
or restart, required evidence needs an explicitly reviewed durable copy/archive
and verified restoration; never silently rewrite historical receipt paths.
Missing originals require recovery from a known backup or mapped archive, not a
new qualification run pretending to reproduce the historical failure evidence.

## Consolidation closeout — 2026-10-15

Publication consolidation was pushed through `1e79f5e`. The subsequent,
individually approved retirements removed only these generated fixture files:

| Completed retirement | Files | Removed target allocation (bytes) |
| --- | ---: | ---: |
| Duplicate `runtime/node` copies in `PhWKp2` and `4f1xKb` | 2 | 242,614,272 |
| Deterministic M2e filler payloads in `DTUJvW`, `cWL1EZ`, `btgOnr` and `h75AIp` | 48 | 2,516,590,592 |
| **Verified total** | **50** | **2,759,204,864** |

These are removed allocated blocks attributed to the approved targets, **not
verified physical free-space gains**. Global free space decreased during both
measurement windows; APFS shared extents/snapshots, delayed reclamation and
unrelated activity prevent attribution. The earlier 17,548,709,888-byte temporary
inventory is historical, not a freshly measured remaining-storage total.

Both runtime fixtures and the four filler-bearing stores are intentionally
offline/incomplete. Original manifests, selectors, databases, unique code, maps,
selected evidence, controls and results remain retained. Restore the exact pinned
runtime bytes or deterministic filler bytes at the original paths before reuse;
do not repair references or regenerate unique stores. Content reconstruction
cannot recover original inode/allocation identity. Original run attribution for
the filler stores remains unresolved, as explicitly accepted for retirement.

The immutable receipts retain per-file verification, reconstruction instructions,
scoped preservation checks and limitations:

- [Two-runtime retirement and read-only preservation supplement](/Users/zoltanka/.local/share/pain-and-gain-runtime-retirement-20261015-jL5dhb/retirement-receipt.json).
- [48-file filler retirement](/Users/zoltanka/.local/share/pain-and-gain-filler-retirement-20261015-s9i8CV/retirement-receipt.json).

The first runtime post-check stopped on the emptied directories' link-count
changes; the retained read-only supplement confirmed those expected changes.
Other payload/database contents were not reread for preservation: exact scoped
metadata/path comparisons and retained control hashes establish the recorded
coverage, not a complete filesystem or transient-write audit. Residency and
metadata/open/unlink race limitations remain.

The final four-runtime attempt deleted **zero** files. Its prerequisite check
returned `ENOENT` for `pain-gain-production-release-fixture-S2X5Ce`; the cause of
that directory's absence is **unknown**. Neither its absence nor any unverified
other disappearance counts as reclamation. The remaining files were untouched;
binary verification did not begin. Preserve the
[stopped-at-prerequisite receipt](/Users/zoltanka/.local/share/pain-and-gain-runtime-retirement-four-20261015-zUeLnB/prepare-failure.json).
There is no automatic retry, restoration, repinning or further cleanup scope.

`/docs/examples/` remains ignored and untracked after the earlier removal of 241
tracked entries. All 1,820 inventoried local entries, including nested repository
metadata, remain present with matching path/type/size/mode/inode. Historical
device/ctime, 43 allocation and 66 mtime differences are disclosed in the closeout
receipt; their cause is not established and no example content hash audit is
claimed. This closeout preserves the current local tree and does not read example
payloads. Retained releases, backups, qualification evidence,
failed records, authorizations and gates remain protected.
