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
