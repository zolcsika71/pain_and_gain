# Project status — 2026-10-29

## Published baseline and local development

Published gameplay baseline: `28a3373268ef66d62fbdb714c01aa6e3adb6819e`,
“Integrate inactive hold-aware opening joint proposals.” Published runtime build:
`2897411faede1db7f18be6e2a7966ce8c01ab7b88fec840228256d7228dbe749`.

The working checkout also contains unpublished retreat, formation, flag-raid,
healing, diagnostic and tooling work. Its inactive composite build is
`3ba63f5d7eb36350143b57ac5ced4b640caa762743352d8251e69e3c7e6d3179`.
All experimental switches are off except the existing healer escort. This
maintenance update does not publish those local changes or activate gameplay.
Registered trial worktrees and the selected external Arena source are retained.

`docs/examples/` is already ignored and has zero tracked entries. It stays local;
there is no need to delete it or rewrite Git history. Replay payloads, credentials,
local databases and evidence folders are not part of this maintenance commit.

## Latest completed test

One optimized group-detour test against **zGeneral v37** ended in **defeat at
1953 ticks**, match `6ae371130f32d77120bf0287`, trial build
`ce287172fd137135e24988bd5f06d5b1f9072027733836c25745d7719b7b8240`.

- All 200 selected ticks (1–150 and 1903–1952) passed observable safety checks.
- Ordinary CPU peaked at 67.08/100 ms, below the 80% stop; no full-game or causal
  CPU improvement claim follows from these windows.
- 58 planned-detour ticks produced 204 observed member arrivals. All 12 army units
  moved early; both scouts and all 14 friends survived the reviewed windows.
- Late income remained 12 versus 13 with friendly units stationary. Winning play
  and sustained control of the high-value flags remain unresolved.
- Original source restored, trial workspace inactive, one-start budget closed.

[Detailed retained review](/Users/zoltanka/.local/share/pain-and-gain-evidence/group-detour-cpu-20261029-fy8mbxm0/live-preparation/execution/REVIEW.md).
This is local evidence; the link is not portable to a fresh clone.

## Next gameplay task — retain this priority

**Explain the group's tick 80 `stalled` release despite recent detour movement.**
Use the already-selected observations and current progress accounting to build a
focused generated regression. Distinguish real displacement, distance-to-goal
progress and oscillation before deciding whether a correction is warranted.
Preserve fixed travel/defense deadlines, support, strength withdrawal, query/work
bounds and the single movement pass. Do not treat movement alone as useful
progress or weaken a safeguard to keep a losing group active.

Acceptance: a reproduced mechanism, the smallest justified correction if a
runtime defect is demonstrated, and focused generated/caller validation. Existing
accepted coverage should be reused where bytes are unchanged. A future match
needs its own bounded package; the completed match budget is not reusable.

## Storage and remaining work

Archived 95 completed-run metadata inventories across 25 external folders, with
full isolated extraction/hash/metadata verification before removing originals.
Net allocated reduction: **4,790,116,352 bytes (4.46 GiB)**. Archives remain in their
original parent folders; unique candidates, match evidence, original receipts,
failures, supervisor holds/locks and restoration material are preserved.
APFS/background activity prevents equating allocated reduction with free-space gain.

[Storage procedure and archival record](architecture/local-storage-maintenance.md#metadata-inventory-archival--2026-10-29).
The external source folders remain because they contain unique required material.
Older storage backups and unresolved/failed runs were not bulk-deleted.

Keep gameplay development separate from parked storage/M2h and supervisor work.
The repository failure gate's administrative resolution does not relabel its old
attempt successful or authorize unrelated work. No workers, matches or activation
were used for this maintenance task.
