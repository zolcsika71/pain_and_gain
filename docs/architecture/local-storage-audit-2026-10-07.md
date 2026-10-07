# Local storage audit — 2026-10-07

Scope: storage accounting and prevention only. M2h remains **unqualified** for
this task; its implementation, plan, receipts, frozen expectations and test
configuration are excluded from publication. No Arena operation, evidence
analysis, resource gate or full qualification suite was run.

## Findings and disposition

**Reclaimed space: 0 bytes. Removed paths: none. Archived paths: none.**
No currently present synthetic output was established as disposable. Do not
interpret the missing historical roots as this task's cleanup or savings.

At entry, HEAD, local main, origin/main and server main were
`a14cac014b1c7ec7db50250699437917cb6d5036`; the index was empty. Origin was
`git@github.com:zolcsika71/pain_and_gain.git`. The 24 pre-existing changed or
untracked paths comprised the M2h candidate, its reviewed plan and the unrelated
`prompt/analyze_logs.md` deletion. Candidate hashes and inventory measurements
are in the [audit receipt](local-storage-audit-2026-10-07.json).

Initial `du -k` measurements, before edits, counted shared Git only once:

| Area | Allocated KiB |
| --- | ---: |
| Main checkout including shared Git | 273,076 |
| Shared Git, included above | 1,488 |
| Production `replay_logs/`, included above | 239,216 |
| Tests and frozen fixtures, included above | 26,192 |
| Documentation, included above | 5,160 |
| Hold trial worktree, excluding shared Git | 0 |
| Pair trial worktree, excluding shared Git | 12 |
| Total main plus trial trees | 273,088 |
| Historical project temporary trees found | 0 |

An intermediate after-check measurement was 273,200 KiB for the main checkout
(1,592 KiB shared Git included), 468 KiB for the hold trial and 16 KiB for the
pair trial: **273,684 KiB combined**, an increase of 596 KiB. This precedes the
audit documents and commit. A trial `git status` attempted to hydrate macOS
dataless files and was stopped when it stalled; some worktree/Git allocation
increased. Subsequent preservation used metadata and locally available bytes.
The audit's own small temporary reports are accounted separately in the receipt.
No increase or ambient disk-space change is presented as reclaimed space.

The metadata inventory measured production evidence at 244,957,184 allocated
bytes versus 2,971,458,733 logical bytes. It is the largest present consumer;
all 493 entries were counted without content reads or hashing. Git objects
occupied 1,392,640 allocated bytes. Tests/frozen candidate data occupied about
25.6 MiB. No dependency, build, coverage or cache root outside the protected
evidence area was found. Protected evidence and required source/oracle data
cannot supply eligible cleanup under this task's constraints.

`df -k .` initially reported 287,753,872 KiB available and at the intermediate
after-check reported 287,518,012 KiB. These are whole-volume measurements subject
to other processes, APFS compression/clones and snapshots, not project savings.

## Missing retention material

The receipt records absent referenced temporary roots in `/private/tmp` and
`/private/var/folders/dy/9msg37jj549dkw5k__ct1kv00000gn/T`. A generator prefix
ending in `-` is excluded from concrete root references. No historical fixture
tree was present in either parent. Only this storage task's new audit directory
was found. No moved archive location was established.

In particular, the following were already absent when checked:

- `/private/tmp/pain-gain-m2h-qualification-MrqXru`, which receipts describe as
  containing the published baseline export, generators, frozen manifests,
  complete run logs and `pre-optimization-candidate.tar`.
- `/private/var/folders/dy/9msg37jj549dkw5k__ct1kv00000gn/T/pain-gain-m2h-gate-TasAb9`.
- `/private/var/folders/dy/9msg37jj549dkw5k__ct1kv00000gn/T/pain-gain-m2h-gate-rSC3B8`.
- `/private/var/folders/dy/9msg37jj549dkw5k__ct1kv00000gn/T/pain-gain-m2h-gate-IEhzNP`.

The last three are the original two generation deadline failures and preservation
RSS failure. Their recorded fixture roots are also absent. The repository's
original unqualified receipt remains intact, SHA-256
`9b9eeb3feb80902301cccbc3b6f51ea641e31c98827902815c4e4240f5b6f340`.
Preserving that receipt does not restore its missing external evidence. Recovery
requires a known backup/archive location; reproducing a workload now cannot
replace the original failure state. This is a pre-existing retention limitation,
not permission to rerun or qualify M2h.

The proposed follow-ups already exist in the untouched candidate:
`expectedRetirement` computes the one-clone final effect and the single
`tests/unit/replay-score-retirement.test.js` imports six case modules. A newer
untracked document and receipt claim a 1,633-test successful run. This audit
preserves them as found but neither validates nor adopts that qualification
claim. The original 1,629/1,632 run remains failed.

## Preservation and checks

Before storage edits, 466 non-production tracked/untracked paths were captured
with hashes or explicit absence. After edits, only README differed among those
paths. All 24 pre-existing candidate/deletion states remained unchanged.
Production evidence, caches and dependencies were excluded from hashing.

Both detached worktrees retained their registrations, index hashes, recorded
file identity/size/mode/mtime and locally available content hashes:

- Hold: `fd6fdf20ea62c2b663185913d52b58f83f59612a`; 352 recorded files,
  335 dataless at preservation capture.
- Pair: `8c0ce181bca388f38cbf569913527dd7b31cc1ad`; 360 recorded files,
  359 dataless at preservation capture.

Dataless content and a full working-tree status could not be verified without
downloads. They were left in place; no worktree was removed or reset.

The four standalone inventory tests passed, covering metadata-only accounting,
hard-link deduplication, symlink exclusion, explicit missing-path errors,
temporary-parent allowlisting and refusal of destructive/arbitrary-path CLI
options. `node --check` passed for tool and tests; `npm run check` passed. The
inventory is read-only, so no destructive execution was exercised. Documentation
links, JSON and allowlisted whitespace are checked before publication.

Publication is limited to README, the inventory tool and standalone test, this
audit and its JSON receipt, and the [maintenance procedure](local-storage-maintenance.md).
M2h paths, its plan, package changes and the prompt deletion remain unstaged.
The maintenance procedure preserves existing retention contracts and documents
the evidence needed before any future cleanup or lossless archive restoration.
