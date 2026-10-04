# Audit consolidation and isolated commit candidates — 2026-10-04

## Status and boundary

F1–F5 passed their focused reviews in the [project audit](project-audit-2026-10-04.md).
This task consolidates status and prepares separate patch artifacts; it does not
stage, commit, push, redesign, or change implementation in the main working tree.
Base: `48201957e5c69060085fd7f8e1609b140b1bfc57`. The real index remains empty.

Artifacts and isolated exported trees are retained at
`/tmp/pain-gain-candidates.wo4pqF/`. This temporary location is not a durable Git
object or production backup. `candidate-receipt.json` records exact per-path
before/after hashes and patch hashes; recheck correspondence before later staging.
No temporary database, evidence, audit receipt, or patch artifact belongs in Git.

## Actual dependency split

| Candidate | Tested base | Scope / dependency |
| --- | --- | --- |
| `m1.patch` | HEAD alone | F1 writer lifetime, F2 owned-output readiness, F3 schema-1 restart recovery; no catalog import, schema-2 hooks, or C1 syntax requirement |
| `f5.patch` | HEAD alone | Current selected-input screen validation/cache history; independent of M1/C1 |
| `c1.patch` | HEAD plus `m1.patch` | Catalog implementation and integrity/F4 fixes; restores schema-2 adapter/restart coverage over corrected M1, plus consolidated documentation |

Recommended publication order: M1, F5, C1. C1's **code** depends on M1, not F5;
it was tested without F5. The final C1 document bundle carries the cross-project
audit and this preparation record, so placing F5 before it keeps published
closeout documentation aligned with published corrections. Composition of all
three patches is checked separately. None of this authorizes publication.

### M1 candidate — three paths

- `tools/replay-store.js`: F1/F2 and explicit F3 `recover: true`; schema-1 only.
- `tests/unit/replay-store.test.js`: F1/F2 regressions and schema-1 F3 checks;
  no catalog import. All original assertions remain; only schema-2 execution and
  setup are deferred to C1.
- `docs/architecture/replay-storage-v3-m1-2026-10-03.md`: recovery interface,
  historical correction evidence, current status and isolated validation scope.

The isolated store is mechanically separated from the reviewed combined source:
C1 imports, schema-version factories/checks, typed adapter and metadata-snapshot
hooks are removed; F1/F2 bodies and F3 lock/recovery logic remain. The existing
schema-1 factory/identity checks are retained. C1 later restores the exact
reviewed combined source/tests. This is patch partitioning, not a new gameplay
or storage behavior design. Two qualification links to the not-yet-added audit
are plain references in M1; C1 restores the links when it adds the report.

### F5 candidate — three paths

- `tools/scout-hold-screen.js`
- `tests/unit/scout-hold-screen.test.js`
- `README.md` — only the screen-cache documentation hunk

These files match the focused-review bytes. No storage changes, audit report,
rules changes, images, or prompt deletion are needed for this candidate.

### C1 candidate — twelve paths

- `tools/replay-catalog.js`
- `tools/replay-store.js` — only the remaining C1 hooks over corrected M1
- `tests/unit/replay-catalog.test.js`
- `tests/unit/replay-store.test.js` — schema-2 restart setup/coverage and import
- `package.json` — catalog syntax-check addition only
- `docs/decisions/0006-replay-storage-v3.md`
- `docs/decisions/README.md`
- `docs/architecture/README.md`
- `docs/architecture/replay-catalog-c1-2026-10-04.md`
- `docs/architecture/replay-storage-v3-m1-2026-10-03.md` — restore audit links
- `docs/architecture/project-audit-2026-10-04.md`
- `docs/architecture/audit-candidates-2026-10-04.md`

The earlier eight-path C1 list was insufficient after F3 added schema-2 tests to
the shared storage test file. Do not stage that whole file as part of M1 from the
combined main working tree: it imports the pending catalog. Do not stage the
whole shared store for M1 either. Later staging needs the exact prepared patch
and validation receipt, not blind whole-file staging.

## Independent validation

Native Node 24.19.0, macOS/arm64, SQLite 3.53.3; temporary synthetic roots only.
Each candidate is a HEAD export with only its declared changes/dependencies;
there are no symlinks back to the main tree and no production data copied.
Each runs `npm test` and `npm run check` from its own directory. The full suites
include focused tests and fresh resource gates, not merely reused suite counts.

| Tree | Full suite | Registered syntax/build checks | Scope |
| --- | --- | --- | --- |
| M1 only | 302/302 | passed | 89 storage tests; schema 1, no C1 |
| F5 only | 271/271 | passed | 24 screen tests; committed pre-fix M1 baseline remains outside F5 |
| M1 + C1, without F5 | 339/339 | passed | 126 storage/catalog tests, including schema-2 restart and 36 catalog tests |
| Recombined M1 + F5 + C1 | 356/356 | passed | Final combined code, exported without unrelated changes |

Fresh 600 MiB gates assert exactly 10/1,000 initial records, bounded selected
payload access and the ADR heap/RSS limits. M1-only measured generation 5.528s /
63.55 MiB peak RSS and operations 0.332s / 71.38 MiB; simultaneous test execution
can affect timing. Import uses 26 SQL calls at either fixture size, accessing only
its new 12/14-byte payload. F5's baseline core retains its original 25-call import;
that difference is expected because F2 belongs to M1, not F5. C1 runs its own
paired metadata gate and the corrected M1 gate. These measurements do not qualify
power-loss durability, arbitrary OS close-failure semantics, additional platforms,
production performance, or concurrent v2 file snapshots.

Patch application, final composition, documentation/example checks, exact hashes
and preservation results are recorded in the artifact receipt. All three patches
passed `git apply --check --whitespace=error-all` against their declared bases;
applying M1, F5, then C1 to a fresh export reproduces the validated combined tree.
Candidate-local documentation checks cover links/anchors and JSON examples;
the unchanged representative SQL example compiles on native SQLite. No whole
working tree or alternate Git index was used to assemble the candidates.
Historical full
working-tree results in qualification documents retain their original scope;
they are not substitutes for these independently executed candidates.

## Preservation and next action

Excluded throughout: rules edits, all `docs/images/` additions, and deletion of
`prompt/analyze_logs.md`; the baseline prompt/rules remain in exported candidates.
Main runtime/builds, dependencies, existing commands, prior F1–F5/C1 implementation
bytes, both trial worktrees and the empty index are preserved. Only current-status
documentation and this new record are edited in main. Production captures,
manifests, reviews, backups and caches are not opened, copied or processed.

Next: review the exact prepared candidates, then request separate staging/commit
authorization. The temporary patches are not staged commits. No open reproduced
F1–F5 blocker remains; this is not a new project-wide audit or production-readiness
verdict. Optional D1–D3 work and C2/M2–M4 remain separate, with no automatic
integration, migration, lifecycle operation, watcher activity or gameplay.

Manual action: NONE.
