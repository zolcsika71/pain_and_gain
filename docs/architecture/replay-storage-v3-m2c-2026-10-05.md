# M2c fixture-only analyzer integration qualification

Date: 2026-10-05. Base: `846d2a458d5776f974853aaad530ef4b71d25f6d`.
Status: corrected local unstaged candidate; fresh synthetic qualification passed
after the BigInt snapshot-iterator correction below. The earlier three fixes
remain intact. Awaiting another independent review;
no independent approval or production activation is implied.
Authority: the unchanged [reviewed M2c plan](replay-storage-v3-m2c-plan-2026-10-05.md)
and [ADR 0006](../decisions/0006-replay-storage-v3.md).
This record concerns synthetic temporary fixtures, not production integration,
general analyzer-memory bounds, migration or completion of M2.

## Implemented boundary

- [Fixture adapter](../../tools/replay-analysis-fixture.js): explicit asynchronous
  `analyzeFixtureReplay({root, schemaVersion, replayId, fingerprints, reportMode})`.
  Both schemas retain the core's canonical temporary-root/marker/runtime checks.
  Unknown/score options, empty/duplicate/oversized selections, unsafe roots and
  unsupported modes fail explicitly. The request selection is copied before
  awaiting storage. There is no CLI dispatch, default root or read-side recovery.
- [Shared analyzer](../../tools/replay-analysis.js): synchronous sessions reuse
  the existing validators, merging, derived checks and report finalization.
  `analyzeReplay` retains its synchronous v2 loader, score branch, CLI modes,
  native parsing and SQLite isolation. Neither session nor report owns a live
  filesystem/database capability. Transport preflight finishes before analysis.
- [Core accessors](../../tools/replay-store.js): callback-scoped `output` and
  `mapArtifact` expose already pinned reference metadata. Acquisition checks
  output ownership by its unique owner, ready state, original/projection fields
  and selected log/map linkage under the existing lock/read transaction.
  A null projection cannot hide a reservation. Missing maps are unavailable.
  No schema, writer policy, recovery or cleanup lifecycle was changed.
- Original properties are reconstructed with safe own keys and exact values.
  Diagnostics bind to `/otherEntries` and expand registered overflow through
  pinned handles. Unknown selected property payloads are validated too. Split-only
  reviews and out-of-line map/replay originals reject as unsupported, rather than
  being invented or omitted. Logical evidence locators remain legacy-shaped;
  sidecar paths/store IDs do not enter reports.
- Unavailable, corrupt or over-budget transport rejects without a partial
  report. Admitted map/JSONL schema, build, raw diagnostic and coverage problems
  retain fail/unknown findings. V3 rejection intentionally differs from v2
  missing-file findings and missing-selection unknowns. No universal malformed
  input parity is claimed.

Existing chunk, row, snapshot and handle limits are unchanged. Consumer caps
remain 1 MiB per map/value/wrapper/JSONL line, 8 MiB expanded metadata, 16 MiB
aggregate JSONL and 16 MiB aggregate encoded diagnostic wrappers. These are not
a proof of bounded derived analyzer structures for arbitrary selections.

## Independent expected results

Before modifying analyzer/storage implementation, an isolated Git export of
the base commit ran the deterministic [recipe](../../tests/fixtures/replay-analysis-m2c-recipe.js)
against its unmodified v2 analyzer/helpers. Fourteen scenarios froze complete
full/compact reports in the [oracle receipt](../../tests/fixtures/replay-analysis-m2c-oracle.json).
The scale scenario additionally freezes every selected artifact size/hash.
Known-answer assertions checked four selected/trusted records, three snapshot
ticks, zero complete diagnostic ticks and no absolute fixture references.

The fixed report hashes are SHA-256 of native compact JSON plus LF:

- Full: `d7a800bd0dbeafd2034a5e692766bb288f0149c1f90b0782d63233125e2f536b`.
- Compact: `d3cfc53e5fb6932aa79a9261481d760976e288afd9c4e6c94b78f52daf7f2e19`.

Tests never regenerate those expected reports from candidate code. They assert
the original frozen objects/hashes against both v2 and v3. Subset/local-build
controls use independent selection/provenance assertions, not candidate-generated
goldens. Changing the recipe or expected artifacts requires explicit review.

## Validation and preservation coverage

[Adapter tests](../../tests/unit/replay-analysis-fixture.test.js) and the
[synthetic worker](../../tests/fixtures/replay-analysis-m2c-worker.js) cover:

- Both schemas; file-backed/evidence-only records; compact/full oracle equality;
  legacy, M2, M3 and CPU generations; overlap/conflict/build and summary failures;
  Unicode/unknown values; explicit subsets, permutations and local provenance.
- Actual v2 CLI compact/full execution and score/missing-selection controls with
  a module hook forbidding SQLite. Existing analyzer and score tests remain
  unmodified and exercise their more detailed membership/action/scoring cases.
- Missing/retired/pending sources, active intents, owned output projections,
  bad map associations, missing/corrupt/symlink artifacts, invalid root/count/
  overflow bindings, malformed JSON/UTF-8, nonfinite outer values, unsupported
  representation, local-build and materialization/metadata/handle limits.
- Child-process cleanup after pinning retires the authorized selected log while
  the report remains identical to the frozen oracle. Other records/artifacts and
  maps remain unchanged; the next selection observes retirement. No lock is held
  during analysis, and subsequent readers/writers work.
- Setup, read, callback, session and close failures; all descriptor close
  attempts; primary errors including thrown null; closed-after-callback views;
  read-side hot-journal refusal. Store-handle close failures cannot mask an
  earlier callback/session error. Arbitrary OS close-failure semantics are not
  established by injected close-after-close exceptions.
- Success/error inventories hash persistent fixture files, database/generation,
  properties/reviews/intents and lifecycle state. Done logs and existing review
  checkpoints remain unchanged. Concurrent tests compare the explicit writer
  delta separately from the read-only adapter.

## Run history

All runs used native Node v24.19.0 on macOS arm64, SQLite 3.53.3 and declared
local APFS, with no platform shim or dependency changes. Temporary run logs and
the isolated oracle export are retained under `/tmp/pain-gain-m2c.YGkAd5/`.

1. Initial v2 analyzer/score regressions: 33/33 passed. Initial frozen-oracle/
   argument/subset selection: 30/30 passed.
2. First complete new adapter run: 56/57 passed. The `map-overflow` negative
   fixture setup failed with a SQLite foreign-key error before reaching the
   reader. The deliberate malformed-reference setup was corrected; no contract,
   implementation limit or assertion was relaxed. This failure remains retained
   in `focused-1.log`; its passing scale measurements are historical only.
3. Affected M1/C1/payload/M2a suite: 153/153 passed, including fresh gates and
   busy-time exhaustion (about 5.60 seconds). Targeted corrected/CLI checks:
   3/3 passed. Expanded adapter run: 66/66 passed before final request-copy and
   missing-map refinements; not substituted for final-candidate validation.
4. Final adapter plus analyzer/score run: 101/101 passed in 55.943 seconds,
   including the 68 new adapter checks and fresh both-schema resource gates.

5. Pre-review normal-concurrency `npm test`: **464/464 passed**, exit 0, in 91.636
   seconds (parent elapsed), from 11:00:03.958 to 11:01:35.595 UTC. Candidate
   code/test/package hashes were identical before and after the run. The
   [retained run receipt](replay-storage-v3-m2c-qualification-run-2026-10-05.json)
   contains those hashes, exact runtime, logs and resource measurements.
   This is one complete run, not a combination of passing subsets.
6. `npm run check` passed on the final code, including the new module and
   unchanged runtime build
   `fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Historical [M2b timing failures](replay-storage-v3-m2b-2026-10-04.md) and the
unresolved intermittent SQLite busy delay remain applicable limitations, even
when a current unchanged-limit busy test passes (5.343 seconds in the final
suite). That pass does not identify or resolve the intermittent delay's cause.

## Resource qualification contract

Each schema generates separate 10- and 1,000-record stores. Each has the same
four selected identities, 4,096 wrappers, three JSONLs, one map, four roots and
four overflow files, plus twelve distinct 50 MiB unrelated payloads (600 MiB per
store). Inodes, hashes, nlink, physical lengths and independent SQL record counts
are asserted. Expected artifact sizes/hashes come from the frozen receipt.

Fresh workers enforce 192 MiB heap, 256 MiB RSS, 60-second pair-generation and
30-second four-call operation limits. Separate bounded preservation hashing has
60 seconds. Output retention is capped; watchdog expiry fails, with TERM/KILL
and bounded reap rather than accepting a late success. Generation and
preservation I/O are outside adapter counters, not hidden as selected accesses.

The gate checks equal SQL/row/open/read counts and report hashes at both sizes,
exactly twelve selected opens per call, zero unselected payload traffic, zero
persistent writes and balanced descriptors. SQL includes application prepare/
exec calls, with connection PRAGMAs reported separately; it does not measure
SQLite's internal page I/O. The gate qualifies corpus independence for this
fixed selection only.

Measured pre-review-suite M2c gates (parent wall time includes subprocess startup and
exit; peak RSS is the complete child-process high-water mark):

| Schema | Generation seconds / MiB RSS | Four-call operation seconds / MiB RSS | Preservation seconds / MiB RSS |
| --- | --- | --- | --- |
| 1 | 4.320 / 95.95 | 0.407 / 98.67 | 0.674 / 68.02 |
| 2 | 4.390 / 96.86 | 0.414 / 101.31 | 0.672 / 67.95 |

Each full/compact call at either corpus size opened exactly 12 selected artifacts
once each, read 1,593,311 bytes in 40 positional reads (maximum chunk 65,536),
and performed zero unselected payload accesses and zero persistent writes.
Selected artifacts total 806,799 bytes; reads are below the unchanged 8× cap
of 6,454,392 bytes. Schema 1 used 47 non-PRAGMA SQL calls plus 14 PRAGMAs and
113 returned rows; schema 2 used 49 plus 14 and 115 rows. Each count is identical
at 10 and 1,000 records for each report mode. Both fixed report hashes and the
complete pre/post fixture inventory hashes matched. No threshold was relaxed.

Fresh existing gates also passed in that complete run: M1 600 MiB, C1 metadata,
M2a both schemas and M2b compact/pretty. M2a now performs one additional indexed
output-owner lookup per selected evidence-only record (core SQL 11 rather than
historical 10); selected rows, opens and byte bounds remain unchanged. M1 import
retains 26 SQL calls at both sizes, and C1 metadata operations read no payloads.
These are measured synthetic results, not production performance guarantees.

## Independent review corrections and fresh qualification

The independent read-only review matched the previous tested bytes but found
three uncovered failures. The 101/101 and 464/464 passes above remain historical,
not proof that those failures were absent. Corrections do not amend the plan:

1. The shared analyzer again finishes an empty log-only selection before
   snapshot coverage derivation. Score-only calls retain their existing merge
   and scoring path. A separate [empty-selection oracle](../../tests/fixtures/replay-analysis-m2c-empty-oracle.json)
   freezes full/compact reports for an empty manifest, an explicit empty
   selection, wholly missing fingerprints and a score-only control. It was
   generated before correction from an unmodified export of the base commit,
   not from the refactored analyzer. The original fourteen-scenario oracle is
   unchanged. Both oracle generators and the new export are retained in scratch.
2. Adapter ordering uses exact relational comparisons and ordinary numeric
   -1/0/1 results, including a deterministic key tie-break. Both schemas cover
   mixed Number/BigInt ordinals and adjacent above-safe-integer values through
   SQLite's maximum integer. Tests observe the actual session input order,
   independently of sorted public report fields; no ordinal is coerced to Number.
3. Snapshot acquisition records whether setup failed before closing its SQLite
   connection. A close failure cannot replace the original setup Error or null;
   without a primary error it still rejects. Both schemas inject close-after-close
   failures, verify one connection-close attempt, cleanup of the failing and
   earlier pinned descriptors, unchanged persistent fixture inventories, released
   locks and subsequent successful reads/writes. This inherited core defect
   predates M2c; the other two defects were introduced by the M2c candidate.
   No arbitrary OS close-failure semantics are qualified.

Before changing implementation, all eighteen targeted checks ran against the
preserved pre-correction source: fourteen failed (six v2 parity, four ordinal,
four primary-error cases) and four controls passed (score-only and close error
without a primary error). The same checks passed 18/18 after correction. Source
copies, pinned export, freeze/run scripts and complete logs are retained under
`/tmp/pain-gain-m2c-corrections.Hmr9Kj/`. No failure was removed from history.

Fresh qualification is recorded separately from the earlier receipt. The fixes
change analyzer/snapshot execution, so all prescribed gates are rerun rather
than reusing the previous resource measurements. No resource limit, busy timeout,
test selection or normal-concurrency full-suite command is relaxed.

The [correction receipt](replay-storage-v3-m2c-correction-run-2026-10-05.json)
records exact commands, native Node v24.19.0 / SQLite 3.53.3 / macOS arm64,
source hashes, log hashes, timestamps, exit results and all resource diagnostics:

| Fresh check | Actual result |
| --- | --- |
| Targeted regressions and controls | 18/18, after 14 demonstrated pre-fix failures |
| Adapter plus v2 analyzer/score tests | 119/119, exit 0, 69.173 seconds |
| Store, payload, catalog and M2a tests | 153/153, exit 0, 58.079 seconds |
| One normal-concurrency `npm test` | 482/482, exit 0, 105.474 seconds; no skipped/cancelled tests or retry |
| `npm run check` | Exit 0; runtime build unchanged |

The complete suite ran from 11:30:23.321 through 11:32:08.798 UTC on 2026-10-05.
All ten code/test/oracle/package hashes matched before and after each fresh run
and that three-fix candidate. The full-suite result is not assembled from subsets.
Fresh M1, C1, M2a, M2b and both-schema M2c resource gates passed. The SQLite busy
test passed at 5.383 seconds; this does not resolve its intermittent delay.

Corrected full-suite M2c measurements (parent wall time / complete child peak RSS):

| Schema | Generation seconds / MiB | Four-call operation seconds / MiB | Preservation seconds / MiB |
| --- | --- | --- | --- |
| 1 | 4.539 / 97.52 | 0.427 / 101.02 | 0.692 / 67.88 |
| 2 | 4.655 / 97.81 | 0.422 / 102.30 | 0.684 / 68.02 |

Both schemas retain exact 10/1,000 operational rows, four selected logs, 4,096
wrappers, three outputs, one map, four overflow dependencies and twelve distinct
50 MiB unrelated files per store. Each call retains twelve selected opens,
1,593,311 bytes in forty reads, 65,536-byte maximum chunks, zero unselected
payload access and zero persistent writes. Schema-1/2 SQL counts remain 47/49
plus fourteen PRAGMAs; returned rows remain 113/115, equal at both corpus sizes.
Both original full/compact oracle hashes and preservation inventories match.
The 192 MiB heap, 256 MiB RSS, 60/30/60-second phase limits and bounded shutdown
requirements are unchanged. This measures fixed-selection corpus independence,
not general analyzer-memory bounds or production performance.

The three-fix checkpoint checks passed: 84 local links, eight anchors, four parsed JSON
oracle/receipt files, tracked whitespace and all eleven new files' whitespace
(including the unchanged plan). No fenced JSON examples were added. All ten
qualified code/test/oracle/package hashes matched then; only qualification
documentation and its generated receipt were finalized after the test runs.
HEAD/index, the original oracle and historical receipt, reviewed plan, unrelated
prompt deletion, runtime/build/dependency bytes and both trial worktrees match
their pre-correction preservation baseline outside the eight intended correction
paths. Production evidence was not accessed for these checks.

## BigInt snapshot-iterator correction and fresh qualification

The subsequent independent review accepted the three corrections but identified
an inherited core decoding gap: snapshot property/payload iterators prepared
SQLite statements without BigInt reads. `normalizeRow` runs after decoding and
cannot rescue an out-of-range integer. The historical 482/482 result above did
not cover large ordinals in these two tables; its receipt is retained unchanged.

Before changing implementation, eight new checks used normal writer APIs in
fresh schema-1/2 fixtures. All four large-ordinal cases failed exactly as
predicted with `ERR_OUT_OF_RANGE` at `9007199254740993`; all four safe-integer
controls passed. Property setup uses `setProperty`; payload setup uses an owned
publication intent/reservation, normal publication and verified finalization,
not direct SQL corruption. Tests also store SQLite's maximum integer
`9223372036854775807n` and insert the probes in reverse ordinal order.

Only the two affected statements now call `setReadBigInts(true)` before
iteration. Existing `normalizeRow`, SQL ordering/indexes, metadata/handle budgets,
row limits, schema, ownership and lifecycle rules are unchanged. Safe ordinals
and payload byte counts still become Numbers; larger ordinals remain exact
BigInts. No analyzer, comparator, oracle, fixture recipe or runtime code changed.

All eight new checks pass afterward. They verify exact public-page and snapshot
property ordinals, selected payload consumption, full/compact frozen report
equality, callback lifetime and thrown-null rejection. Artifact descriptor
counts balance on success/failure; persistent fixture inventories and lock
release are checked even on the pre-fix setup failures. An unaffected subsequent
snapshot and writer remain usable. The eighteen earlier correction checks also
pass unchanged. No arbitrary OS close-failure qualification is implied.

The [BigInt run receipt](replay-storage-v3-m2c-bigint-run-2026-10-05.json)
retains commands, runtime, before/after source hashes, complete-log hashes,
regression evidence and fresh resource diagnostics. Native environment:
Node v24.19.0, SQLite 3.53.3, macOS arm64, declared local APFS, no platform shim.
Scratch source copies, runner and logs remain at
`/tmp/pain-gain-m2c-bigint.O4izjk/`. Both preceding receipts and all earlier
failures remain historical evidence; no oracle was regenerated.

| Fresh check | Result |
| --- | --- |
| Pre-fix iterator regressions/controls | 4 failures, 4 passes; exact reviewed decoding failure |
| Post-fix iterator plus earlier correction checks | 26/26 passed, exit 0 |
| Adapter plus v2 analyzer/score tests | 127/127 passed, exit 0, 72.721 seconds |
| Store, payload, catalog and M2a tests | 153/153 passed, exit 0, 57.692 seconds |
| One normal-concurrency `npm test` | 490/490 passed, exit 0, 109.284 seconds; no skipped/cancelled tests or retry |
| `npm run check` | Exit 0; runtime build unchanged |

The full suite ran from 11:58:26.357 to 12:00:15.643 UTC on 2026-10-05.
All ten code/test/oracle/package hashes were unchanged during each successful
run and match the final executable candidate. Documentation/receipt finalization
followed those runs. No assertions, concurrency, timeout or memory limits were
relaxed, and passing subsets were not combined into a full-suite result.
The busy-time test passed in 5.358 seconds; its intermittent delay remains
unresolved. Fresh M1/C1/M2a/M2b and both-schema M2c gates all passed.

Fresh full-suite M2c parent wall time / child peak RSS:

| Schema | Generation seconds / MiB | Four-call operation seconds / MiB | Preservation seconds / MiB |
| --- | --- | --- | --- |
| 1 | 4.457 / 96.91 | 0.413 / 99.61 | 0.676 / 68.23 |
| 2 | 4.433 / 97.27 | 0.417 / 102.48 | 0.686 / 68.39 |

Both schemas retain exactly 10/1,000 operational records, the same four selected
logs, 4,096 wrappers, three outputs, one map, four overflow dependencies and
twelve distinct 50 MiB unrelated payloads per store. Each call retains twelve
selected opens, 1,593,311 bytes in forty reads, a 65,536-byte maximum chunk,
zero unselected payload traffic and zero persistent writes. SQL/row counts remain
47/113 for schema 1 and 49/115 for schema 2, plus fourteen PRAGMAs, identical
across corpus sizes/modes. Both original report hashes and preservation
inventories match. The unchanged 192 MiB heap, 256 MiB RSS, 60/30/60-second phase
limits and bounded shutdown gates passed. This qualifies fixed-selection corpus
independence only, not general analyzer memory, production readiness or full M2.

This correction changes only `tools/replay-store.js`,
`tests/unit/replay-analysis-fixture.test.js`, this record and the new BigInt
receipt. The complete candidate therefore has eighteen paths below. The unchanged
plan remains a separate publication dependency, not silently added to that scope.

Final static checks passed: 85 local links, eight anchors, five parsed JSON
oracle/receipt files, tracked diff whitespace and all twelve new files' whitespace
(including the unchanged plan); no fenced JSON examples were added. All ten
tested code/test/oracle/package hashes still match the fresh receipt. Protected
non-evidence file digests, HEAD and index match the pre-task baseline outside
the four intended paths above; both trial worktrees match byte/status baselines.
The prompt deletion is still unstaged. No production evidence was read or
hashed, and no staging, commit, push or production activation occurred.

## Exclusions and protected state

No production evidence is read, copied or hashed. No existing command is wired
to v3. Score-source analysis, lifecycle orchestration, caches, historical/scout
consumers, C2, broader bounded-v2 integration, migration/export/rehearsal and
production activation remain excluded. Full M2 completion, production readiness,
power-loss durability, external in-place artifact mutation and additional
platforms remain unqualified.

The reviewed plan is preserved byte-for-byte (SHA-256
`ce2057fd3885b80f9f545613f25b0bcfed09ae85e0f6176698dc6c3cd6cc24fd`). HEAD
remains the base above and the index is empty. The unrelated
`prompt/analyze_logs.md` deletion remains unstaged. Both trial worktrees' HEAD,
status and tracked/untracked non-evidence file digests match their preservation
baseline. Gameplay/runtime/build/dependency files are unchanged; no production
evidence was accessed to establish preservation. No staging, commit or push ran.

Pre-review static checks passed: 82 local links, eight anchors, both JSON receipts,
tracked diff whitespace and all nine untracked candidate files' whitespace.
There were no new fenced JSON examples to execute. The nine pre-review code/test/
package hashes matched that historical full-run receipt. The correction receipt
tracks the changed executable bytes separately.

## Exact task change scope

Seven existing files modified:

```text
README.md
docs/architecture/README.md
docs/architecture/project-layout.md
docs/architecture/replay-analysis.md
package.json
tools/replay-analysis.js
tools/replay-store.js
```

Eleven files created (including the successive correction receipts):

```text
docs/architecture/replay-storage-v3-m2c-2026-10-05.md
docs/architecture/replay-storage-v3-m2c-qualification-run-2026-10-05.json
docs/architecture/replay-storage-v3-m2c-correction-run-2026-10-05.json
docs/architecture/replay-storage-v3-m2c-bigint-run-2026-10-05.json
tests/fixtures/replay-analysis-m2c-oracle.json
tests/fixtures/replay-analysis-m2c-empty-oracle.json
tests/fixtures/replay-analysis-m2c-recipe.js
tests/fixtures/replay-analysis-m2c-store.js
tests/fixtures/replay-analysis-m2c-worker.js
tests/unit/replay-analysis-fixture.test.js
tools/replay-analysis-fixture.js
```

The pre-existing untracked M2c plan remains unchanged and unstaged, separately
from those eighteen task changes. It is a **required future publication
dependency**: a self-contained implementation commit needs the plan committed
first or an explicitly authorized scope including it. This task does not stage
the plan, authorize that scope expansion or claim the eighteen-path tree alone
is ready to publish. The unrelated prompt deletion is not part of this candidate.
Generated databases/payloads were confined to temporary fixtures;
the committed-data candidate contains only code, synthetic oracle expectations,
documentation and measurement receipts.
