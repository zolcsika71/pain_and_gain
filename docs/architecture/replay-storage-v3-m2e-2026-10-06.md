# Replay storage M2e: combined fixture analyzer qualification

Date: 2026-10-06. Base: `859f5ab33ac4b9385e70b04c273fad79a5897527`.
Status: validation gaps reproduced and corrected; fresh bounded synthetic
qualification passed, unstaged candidate awaiting independent review. No production dispatch or
lifecycle work. The development-time read-scope incident below remains part of
the execution record; passing gates do not erase it.
Authority: the unchanged [reviewed plan](replay-storage-v3-m2e-plan-2026-10-06.md),
[ADR 0006](../decisions/0006-replay-storage-v3.md) and existing
[analyzer](replay-analysis.md)/[score evidence](replay-evidence-contract.md#replay-score-source-retention) contracts.

## Implemented boundary

- [Combined adapter](../../tools/replay-combined-analysis-fixture.js): explicit
  canonical temporary root, numeric schema 1/2, one replay and two distinct,
  nonempty fingerprint arrays. The 64-source budget is aggregate, checked before
  element traversal; requests are copied before awaiting the read handle.
- [Store](../../tools/replay-store.js): additive exclusive `combinedSelection`
  mode. One owner-lock/read transaction resolves log readiness, score presence/
  missing/retired facts, original properties, indexed ownership and pinned roots,
  outputs and log maps. Score map metadata adds no dependencies. Setup closes
  its connection/releases the lock before invoking the callback.
- The [log](../../tools/replay-analysis-fixture.js) and
  [score](../../tools/replay-score-analysis-fixture.js) loaders share their
  existing bounded materialization, with one expanded-metadata account for M2e.
  `/otherEntries` pointer bytes are charged to that account; wrappers have their
  own unchanged aggregate account. M2c/M2d defaults remain unchanged.
- [Detached finalization](../../tools/replay-analysis.js) accepts ordered original
  records and occurrence-keyed bytes, then uses the existing analysis session,
  score finalizer and score algorithms. It does not combine finished reports.
  The synchronous v2 API/CLI stays SQLite-free. Unavailable logs and current score
  transport failures reject; genuinely missing scores retain unknown findings.
  Raw score bodies retain malformed/unsupported/native-number semantic findings.

No schema, dependency, writer-policy or recovery changes. The callback owns all
reads/analysis; expired access rejects and every owned close is attempted.
Explicit failure flags preserve primary errors, including null.

## Independent oracle

Before implementation, `/tmp/pain-gain-m2e.vjGeD5/published/` exported only BASE's
tooling, runtime code, synthetic tests/fixtures and package metadata, not captures.
Every exported source was byte-compared with Git. The retained generator
`/tmp/pain-gain-m2e.vjGeD5/freeze.mjs` and finalization script hashed the copied
pure declarations and input recipe, froze 30 scenarios in both report modes and
checked the scale known answers. No candidate analyzer supplied expectations.

The [oracle receipt](../../tests/fixtures/replay-combined-analysis-m2e-oracle.json)
contains export/source/generator hashes, timestamps, complete reports, artifact
sizes/hashes and exact scenario inputs' deterministic recipe correspondence.
The [recipe](../../tests/fixtures/replay-combined-analysis-m2e-recipe.js) and
[BASE declarations](../../tests/fixtures/replay-combined-analysis-m2e-definitions.js)
remain byte-identical to their frozen hashes. Scale report hashes (native compact
JSON plus LF):

- Full: `452d47460a2a818004812e4e937d4452f82be209599a618d07107b390c1d6c44`.
- Compact: `9e61326039d8a2a69af33ebc24261b88071fe405fe5989038535c28b76977059`.

Known answers: two trusted logs, two snapshots and complete diagnostic ticks,
two verified score sources, player1 mapping, unique offset +1, associated build
`a` repeated 64 times, two noncausal event associations and unknown terminal state.
Full/compact assertions use their respective existing field locations.

## Development history (not final qualification)

All logs and command receipts are retained in `/tmp/pain-gain-m2e.vjGeD5/`.

1. Initial parity: 62/64. The adversarial conflicting-build recipe was correctly
   rejected by the public writer's replay/build association rule under both
   schemas. Its fixture now publishes owned artifacts normally and explicitly
   fault-injects the contradictory metadata. The writer and frozen oracle were
   not changed. Both targeted controls then passed. The fixed scale fixture
   uses public writer operations only, without this fault injection.
2. Development bounds/resource checks: the gates passed, but the new CLI test
   failed. Its initial harness incorrectly assumed `cwd` selected the CLI root;
   the module-relative CLI read the repository manifest and local build input
   instead of the synthetic manifest. The fake replay selected no production
   captures, and no lifecycle command or write occurred. This was an unintended
   read outside the authorized synthetic scope, not an analyzer defect. The test
   now copies tooling into a canonical temporary root. No production evidence
   was copied or hashed for preservation. This incident must not be omitted from
   claims about the task's execution.
3. First copied-CLI control failed with empty output because a `/var` alias did
   not match the module's canonical `/private/var` main-entry check. Canonical
   temporary-root construction corrected the harness; both actual CLI modes
   then matched frozen expectations under a SQLite-denying import hook.
4. Connection-close injection first targeted the open handle's earlier identity
   validation, not snapshot setup. The next version also injected into lock
   release. Both failed runs are retained. The final one-shot artifact-inspection
   injection targets snapshot setup only; six both-schema controls passed,
   including null/Error primary values and no-primary cleanup failure.

Existing M2b–M2d failures and the unresolved intermittent SQLite busy delay remain
historical evidence; this task neither changes their limits nor resolves them.

## Historical qualification before validation corrections

Native macOS, Node 24.19.0, bundled SQLite 3.53.3; no platform shim. The
[run receipt](replay-storage-v3-m2e-run-2026-10-06.json) retains executable/version
details, exact commands, timestamps, exit status, complete-log locations and
SHA-256 digests, tested source hashes and resource results. Every historical run
below exited zero with unchanged before/after code, test, oracle and package
hashes, verified against the then-delivered candidate. Only documentation and
the aggregate receipt were finalized afterward. These hashes precede the
validation corrections below and do not establish current-byte qualification.

| Settled check | Result | Elapsed |
| --- | --- | --- |
| Final request/acquisition controls (`targeted-final`) | 4/4 | 9.029s |
| Combined plus log/score analyzer suites (`focused-settled`) | 344/344 | 229.575s |
| Store, payload, catalog, diagnostic and legacy-reader suites (`affected-core-settled`) | 166/166 | 59.404s |
| One normal-concurrency `npm test` (`repository-final`) | 707/707, no skips/cancellations | 258.247s |
| `npm run check` (`check-final`) | Build identity and syntax passed | 1.365s |

The focused run includes the 125 new M2e checks and retained M2c/M2d resource
gates. Affected-core includes existing M1/C1/M2a/M2b gates. All were also exercised
by the single complete repository run. `focused-final` and `affected-core-final`
are retained preliminary passes, superseded because they preceded the last
aggregate-count and acquisition-race controls; they are not substituted for the
settled runs. All development failures and successful diagnostics remain in the
receipt. No test limit, concurrency or expectation was relaxed, and passing
subsets were not combined into a purported complete pass.

The historical both-schema gates within `repository-final` measured:

| Schema | Paired generation | Four analysis calls | Preservation verification | Peak worker RSS across phases |
| --- | --- | --- | --- | --- |
| 1 | 4.416s | 0.285s | 0.694s | 104.750 MiB |
| 2 | 4.413s | 0.291s | 0.686s | 104.313 MiB |

These are startup-through-exit measurements against unchanged 60/30/60-second
phase deadlines, 192 MiB heap and 256 MiB RSS caps, not general guarantees.
The inherited bounded child harness retains its 1 MiB output cap and two-second
TERM/three-second KILL-reap handling, including inherited pipe closure. Failed
fixtures/logs are retained rather than silently deleted or retried for a pass.

Each store has exactly 10 or 1,000 records: two selected logs, two selected
scores, and six or 996 pending score records. Six reserved pending score intents
own the twelve distinct, non-sparse 50 MiB unrelated payloads (600 MiB per store).
Selected layout and bytes match the independent oracle: one map, one JSONL,
two raw score responses, two diagnostic roots, two overflow children, two score
validation summaries and two overflow notes: twelve files, 551,858 bytes total.
All four full/compact calls per schema have:

- Twelve selected opens, 30 reads, 948,312 bytes read, maximum 65,536-byte chunk;
  no selected pathname reopening, no unselected payload access and no persistent
  writes. Read bytes are below the unchanged eight-times-selected-bytes bound.
- Schema 1: 63 non-PRAGMA SQL calls and 124 returned rows. Schema 2: 65 and 126.
  Both have 14 PRAGMA calls and nine metadata opens. All counts match exactly
  across 10/1,000 stores; full/compact report hashes match the frozen values above.
- Identical complete persistent inventory hashes before/after analysis. Synthetic
  generation/verification access is separate from measured selected-reader access.

Local documentation links/anchors and examples, JSON receipts, source syntax,
tracked/new-file whitespace and candidate scope are checked separately without
executing documentation examples. The receipt excludes its own hash; the final
qualification document's hash and all other candidate hashes are recorded.

## Validation-gap corrections (2026-10-06)

Independent review identified two uncovered admission checks. New isolated
[validation workers](../../tests/fixtures/replay-combined-analysis-m2e-validation.js)
reproduced both defects before correction: **12/16 failed, four valid controls
passed**, under schemas 1 and 2. Every negative failed with missing expected
rejection and recorded one combined analyzer entry. Complete logs and retained
failed synthetic fixture paths are in `/tmp/pain-gain-m2e-correction.QEv5Y3/`.
The new [correction receipt](replay-storage-v3-m2e-validation-run-2026-10-06.json)
is separate from the immutable historical run receipt above.

- Non-diagnostic log originals now require the exact property/root pointer,
  null inline slot, `json-v1` encoding and summaries/extensions role before
  decoding in combined mode. Existing owner/parent checks remain. The public
  writer permits same-owner indirection; M2e's admitted representation is
  deliberately narrower. Tests also retain M2c's prior admission behavior.
- Combined snapshot acquisition now checks each selected payload root and
  recursive dependency, plus each required map, against the other path-owner
  tables using the existing indexed helper under the lock/read transaction.
  There is no corpus scan, writer-policy change, or change to ordinary M2c/M2d
  snapshot defaults. Tests inject cross-table corruption: selected root/child
  versus an unrelated map, and required map versus an unselected pending output.
- Invalid role and encoding are tested separately. The role case is published
  through the writer; encoding-only corruption explicitly disables SQLite CHECK
  constraints in its isolated fixture connection, not in production code.
  Valid summaries/extensions controls retain frozen full-report equality.

After correction all **16/16 targeted checks passed**. A first-root ownership
conflict rejects before opening artifacts; later failures balance all acquired
descriptor closes. Rejections precede combined analysis, preserve full persistent
inventories, release the lock and permit another writer. After explicitly undoing
only the injected fault/binding, subsequent combined analysis matches the frozen
report without deleting retained artifacts. Frozen oracles and scale recipe are
unchanged. The first-root control's close assertion was clarified to allow zero
opens; no rejection assertion or expected report was relaxed.

Fresh final-byte qualification passed on native macOS, Node 24.19.0 / SQLite
3.53.3, without a platform shim, assertion changes or relaxed budgets:

| Correction run | Result | Elapsed |
| --- | --- | --- |
| `pre-fix` (historical negative proof) | 4 passed, 12 expected regression failures | 11.928s |
| `targeted-final` | 16/16 | 12.146s |
| `focused-final` (combined and M2c/M2d/analyzer suites) | 360/360 | 242.551s |
| `affected-core-final` (store/payload/catalog/M2a/M2b) | 166/166 | 60.152s |
| Single normal-concurrency `repository-final`, `npm test` | 723/723; zero skips/cancellations | 287.517s |
| `check-final`, `npm run check` | Build identity and syntax passed | 1.277s |

Each final command has matching before/after source/test/oracle/package hashes;
those hashes also match the delivered files. No executable bytes changed between
the targeted pass and full qualification. Only this record and the new aggregate
receipt were finalized afterward. Complete logs/commands/runtime versions,
pre-fix and final hashes, exit status and resource receipts are retained. Existing
M1/C1/M2a/M2b/M2c/M2d resource gates were freshly exercised by the focused/core
commands and again by the one complete suite; none was substituted by a historical
pass. Historical 344/166/707 passes remain above, not current-byte qualification.

The full-suite M2e gates measured:

| Schema | Paired generation | Four analysis calls | Preservation | Peak worker RSS |
| --- | --- | --- | --- | --- |
| 1 | 4.501s | 0.279s | 0.678s | 104.859 MiB |
| 2 | 4.500s | 0.284s | 0.682s | 104.609 MiB |

The unchanged 10/1,000-record recipe, twelve selected artifact hashes and both
frozen reports matched. Each call still opens twelve artifacts, performs 30
reads / 948,312 bytes with 64 KiB maximum chunks, and accesses no unrelated
payloads or persistent writes. SQL totals are now **81/83** for schemas 1/2,
respectively: 18 additional indexed checks (two for each of eight payloads and
one map). Returned rows remain 124/126; PRAGMAs remain 14 and metadata opens nine.
Every count and report hash agrees across corpus sizes. All phase deadlines,
heap/RSS caps, shutdown and preservation requirements remain unchanged; prior
63/65 SQL measurements above are historical, not the corrected implementation.

The CLI incident remains a scope violation:
its evidence supports empty capture selections and no lifecycle execution, not a
comprehensive filesystem-write audit. No production evidence was accessed during
this correction task.

## Candidate scope

Exactly 20 candidate paths (the pre-existing reviewed plan is additional and
unchanged, not silently included in this list):

1. `README.md`
2. `docs/architecture/README.md`
3. `docs/architecture/project-layout.md`
4. `docs/architecture/replay-storage-v3-m2e-2026-10-06.md`
5. `docs/architecture/replay-storage-v3-m2e-run-2026-10-06.json`
6. `package.json`
7. `tests/fixtures/replay-combined-analysis-m2e-definitions.js`
8. `tests/fixtures/replay-combined-analysis-m2e-faults.js`
9. `tests/fixtures/replay-combined-analysis-m2e-oracle.json`
10. `tests/fixtures/replay-combined-analysis-m2e-recipe.js`
11. `tests/fixtures/replay-combined-analysis-m2e-store.js`
12. `tests/fixtures/replay-combined-analysis-m2e-worker.js`
13. `tests/unit/replay-combined-analysis-fixture.test.js`
14. `tools/replay-analysis-fixture.js`
15. `tools/replay-analysis.js`
16. `tools/replay-combined-analysis-fixture.js`
17. `tools/replay-score-analysis-fixture.js`
18. `tools/replay-store.js`
19. `tests/fixtures/replay-combined-analysis-m2e-validation.js`
20. `docs/architecture/replay-storage-v3-m2e-validation-run-2026-10-06.json`

The new suite covers 30 independent full/compact report scenarios under both
schemas, current/missing/retired selection policies, collection presence,
cross-kind ownership, optional score-map independence, exact large ordinals,
aggregate caps and corruption. Fault workers cover pre-acquisition changes,
post-acquisition authorized log cleanup versus explicit score retirement,
callback/read/analysis/close failures, expired views and subsequent operations.
Existing M2c/M2d suites retain their single-source, empty-selection,
duplicate-occurrence and raw-number controls. Successful and rejected ordinary
analysis compares complete synthetic persistent inventories; concurrency tests
compare against the explicitly authorized writer's state change instead.

Temporary databases, payloads, generator exports, run logs and failed synthetic
fixtures are not candidate paths. Neither the unrelated prompt deletion nor any
trial-worktree changes are included.

## Preservation and limits

The reviewed plan stays unchanged, SHA-256
`2e16ab1dcbe168811e021f6a8cfc158b3d734987828f0a7ed10288236ab8d418`.
It remains an untracked, pre-existing publication dependency; it is not silently
included in an authorized commit. All candidate changes remain unstaged.

Qualification concerns fixed-selection synthetic corpus independence only, not
general analyzer-memory bounds, full M2 completion, production readiness,
power-loss durability, arbitrary OS close-failure behavior, additional platforms
or resolution of intermittent SQLite timing. Lifecycle orchestration, imports,
caches, broader v2 work, C2, M3 and M4 remain excluded.
