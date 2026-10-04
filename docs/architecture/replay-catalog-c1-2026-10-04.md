# Replay catalog C1: isolated qualification, 2026-10-04

Status: integrity corrections implemented and locally tested on synthetic
temporary fixtures; the reported integrity defects and F4 passed focused review.
Separate commit-candidate preparation is recorded in the
[consolidation record](audit-candidates-2026-10-04.md). Candidate remains unstaged. No production
integration, migration, real-capture processing or new catalog-owned file
publication is implemented or authorized.

Contract: [ADR 0006](../decisions/0006-replay-storage-v3.md#separate-synthetic-milestone-c1-catalog-metadata-foundation).
The [M1 qualification](replay-storage-v3-m1-2026-10-03.md) retains its original
scope and limitations. C1 does not modify existing replay commands or analyzers.

## Implementation and API correspondence

[replay-catalog.js](../../tools/replay-catalog.js) implements the typed metadata
schema and catalog interface. Minimal typed hooks in
[replay-store.js](../../tools/replay-store.js) reuse M1's temporary-root checks,
owner lock, connection-local SQLite settings, transaction generation, rollback
and bounded queries. There is no public arbitrary-SQL fixture hook.

Fresh C1 fixtures have schemaVersion 2, catalogVersion 1 and payloadVersion 1 in
descriptor/database metadata. Schema-1 M1 readers reject them; C1 rejects schema
1 without upgrading it. Both factories require explicit, empty, canonical OS
temporary roots with the existing fixture prefix and declared local APFS. No
default root or production-capable CLI exists. The catalog's `evidence` handle
provides existing M1 mechanics for synthetic fixture setup only.

| ADR interface | C1 implementation |
| --- | --- |
| create/open/close, writer transactions | Explicit version-2 factories; synchronous, nonnested transactions; escaped capabilities reject; a caught invalid operation poisons and rolls back its complete transaction |
| registerIdentity, appendProperty | Stable subjects and natural evidence identities; original inline JSON values/presence and ordinal order; non-owning artifact references validated against existing M1 ownership |
| provenance, coverage, questions | Append-only scoped assertions/intervals and explicit comparison links; unknown/conflicting/invalid values retained rather than adjudicated |
| runs and sources | Planned source pages with exact retries; seal records count, semantics version and ordered logical digest; unrelated catalog generation/rows do not affect that digest |
| result/finding/evidence publication | One bounded transaction validates declared counts and selected evidence, publishes findings/links and completed workflow together; append primitives are unavailable outside this result batch |
| conclusion revisions/support | Complete support batch supplied to appendConclusionRevision; contiguous predecessor and expected-head CAS; exact retry resolves before head checks; histories/support immutable; standalone appendSupport rejects |
| experiment revisions/run arms | Immutable hypothesis/criteria/baseline/candidate references; explicit arm assignment and provenance; no strategy-promotion inference |
| review/workflow/artifact events | Task-attributed immutable events, checked projections and exact retry receipts; catalog reviews cannot complete/retire operational captures; artifact receipts cannot relocate or delete files |
| lookup/pages/resolveEvidence | Indexed, bounded metadata only; relationship pages are separate from bodies; generation/query-bound cursors reject stale requests |
| withCatalogSnapshot | Explicit metadata/availability closure under M1 lock/read transaction; callback runs after release on a closed-after-use borrowed view; no artifact open or implicit graph hydration; selected active operational intents reject setup |

API inputs are bounded synthetic validator receipts, not automatic extraction.
Finding/revision verdict values include criterion, unit, semanticsVersion, all
four counts, opportunities and coverage information. Supported command/position/
outcome verdicts additionally require established provenance and a verified
selected-source receipt. Aggregate precedence is failed, unknown, passed,
unexercised; missing opportunities cannot establish unexercised. Assertions used
as build/config/map references must match the evidence capture and role. The
catalog checks these structures, not whether the observations are true.

Finding evidence and revision support remain relationship rows, not duplicated
inside their body JSON. Result workflow receipts store declared counts and the
batch digest rather than embedding all findings. Original result/revision input
digests support exact retry ordering. Historical artifact registration retries
still work after the original operational owner retires; changed expectations
remain conflicts. Retirement affects current reproducibility, not historical
verdicts or citations.

Existing 64 KiB row, 128-row/8 MiB complete transaction/page, 64-source selection,
8 MiB metadata snapshot, runtime and lock budgets are unchanged. Oversized inline
bodies/results explicitly reject; C2 file spill and multi-page publication are
not substitutes implemented here. C1 metadata snapshots do not expose the
deferred general evidence-snapshot API. Existing M1 payload/overflow pinning
remains available through the core and is regression-tested separately.

## Acceptance evidence

Environment observed: Node v24.19.0, `node:sqlite` SQLite 3.53.3, macOS; filesystem
declared local APFS. No dependencies added. Runtime build remains
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Reproduce with synthetic fixtures only:

```sh
node --test tests/unit/replay-catalog.test.js tests/unit/replay-store.test.js tests/unit/replay-store-payloads.test.js
npm test
npm run check
```

Pre-correction implementation validation: 18 catalog tests; combined catalog/M1 59/59;
repository 272/272; syntax/build checks passed. Earlier development runs with
incorrect test harness expectations are superseded by these final runs.
Documentation checks passed: 40 local links, two anchors, three JSON examples,
one SQL example, and tracked/untracked candidate whitespace. The ADR's example
now spells out the explicit uncertainty/count receipt fields; no requirement
or resource limit was relaxed. Comparison links reject absent/empty scope.

| C1 gate | Synthetic coverage |
| --- | --- |
| 1: preservation | Unicode/exact identity, ordinal, unknown fields, absent/null/false/zero, scoped independent provenance and five coverage states; wide gaps retained without tick expansion |
| 2: traceability/integrity | Sealed run to findings, evidence, two revisions, explicit experiment arms and revision reviews; invalid actor, artifact role/scope, source range, dangling support and unsupported provenance reject atomically; explicit cross-question comparison required |
| 3: verdict/workflow | Four verdicts in completed runs, null draft, errored run with no findings, deferred interpretation; aggregate unknown preserved; insufficient coverage cannot become unexercised or pass |
| 4: atomicity/retries/concurrency | Before-COMMIT injected failure, after-COMMIT receipt failure, SIGKILL before commit, old revision/event retries, planned source retries and two-process expected-head CAS; independent review writers retained; SQL immutability and invalid workflow/count/support cases |
| 5: lifecycle | Schema-2 core log-done and explicit score-retiring cleanup; score done retains its file; historical references/reviews/support survive; catalog citations confer neither ownership nor retention veto; core pinned payload remains readable after unlink |
| 6: bounded/scalable | Independent fixtures assert exactly 10/1,000 capture anchors, accompanying table counts, indexed plans, fixed selections, identical SQL/returned-row counts and zero payload access; source/row overflow and stale cursors reject |
| 7: regression/preservation | Full M1 suite rerun, including overflow pinning, active intents, fsync retry, cross-kind ownership and descriptor cleanup; fresh 600 MiB gate because shared core paths changed; project/protected-state checks and documentation validation |

## Measured resource gates

Measured qualification runs used 192 MiB V8 heaps, 256 MiB RSS limits and ADR
deadlines. Concurrent test activity affects these observations; no speed or
memory guarantee is implied.

Catalog paired-fixture worker: 0.696 seconds, 68.33 MiB peak RSS. Both fixtures
have one replay, question, run/source, finding/evidence link, conclusion/revision/
support and catalog review/event; two tasks and four workflow events. Subject
counts are 18/1,008; capture counts are exactly 10/1,000. Other catalog collections
are empty in this resource fixture, not claimed exercised by the scale gate.
Functional tests exercise those collections separately.

| Fixed operation | SQL calls at both sizes | Returned rows at both sizes | Time, 10 / 1,000 anchors |
| --- | --- | --- | --- |
| selected ten-capture page | 2 | 11 including generation | 1.465 / 1.051 ms |
| capture lookup/availability | 5 | 2 | 0.924 / 0.719 ms |
| one support page | 2 | 2 | 0.852 / 0.710 ms |
| one revision history page | 2 | 2 | 0.939 / 0.747 ms |
| selected review write | 11 | 4 | 27.506 / 6.693 ms |

Each measured catalog operation opened/read/wrote zero payload bytes. These
counters measure application SQL/rows and payload I/O, not SQLite internal page
or physical-disk I/O; bounded indexed statements update selected metadata only.

Fresh M1 streaming gate: 629,145,600 unique accumulated ASCII payload bytes;
generation 3.798 seconds / 63.70 MiB RSS; operation worker 0.306 seconds / 71.41
MiB RSS. Exact 10/1,000 metadata row assertions and fixed selection bounds passed.
Listing/lookup/review read no payload bytes. Imports used 25 SQL calls at both
sizes, read/wrote only their new 12/14-byte payloads and no unrelated payloads.
Generation streams/hash-verifies its new bytes; it never materializes a corpus
string. The full repository run also passed fresh catalog and 600 MiB gates.

## Review blockers, 2026-10-04 (superseded by correction below)

All eight candidate files matched the final validation receipt before this
documentation correction. The preceding suite/resource results remain measured
results for those bytes, not proof of C1 readiness. Fresh probes used only
temporary synthetic roots and the existing test fixture helpers; no production
evidence or project implementation was changed.

1. **Finding/evidence batch integrity:** an evidence child supplied on the second
   finding with `findingId` naming the first finding overrides the parent ID in
   `appendFinding()`. With otherwise identical child evidence, publication accepts
   declared counts of two findings/two links, commits `completed`, but stores only
   one link on the first finding and none on the second. A caller must not redirect
   a child's association or deduplicate away a declared occurrence. Reject such
   conflicting input atomically; regression coverage must check the actual
   per-finding links, declared counts and unchanged running state after rejection.
2. **Conclusion/comparison scope:** a completed finding cites ticks 1–2; a stored
   cross-question comparison also explicitly permits only ticks 1–2. A passed
   revision scoped to ticks 100–101 is nevertheless accepted and advances head 0
   to 1. The same-question variant also accepts that unsupported scope.
   `support()` checks question IDs and criterion/unit but does not enforce the
   stored scope. Structural scope compatibility must be checked against exact
   supporting references and the named comparison policy; incompatible support
   must reject without publishing a revision/support/head. This does not require
   rerunning an analyzer or adjudicating whether an observation is true.

Those green tests did not exercise either input. The review left the candidate
unstaged for implementation corrections and targeted regressions. ADR
requirements, M1 contracts and qualification limits were unchanged.

## Integrity correction and current validation, 2026-10-04

Changes in this correction are confined to the catalog implementation/tests,
this record and ADR status. The other four candidate paths are unchanged.

- Child evidence IDs, when supplied, must equal the enclosing finding ID.
  Parent ID and occurrence ordinal are assigned after copying child fields.
  Before `completed`, indexed bounded queries check every stored finding and
  its nonempty, complete, contiguous evidence-link set against the batch input.
  Aggregate counts alone cannot authorize completion. Duplicate occurrences
  remain distinct rows; matching explicit parent IDs and exact batch retries work.
- Conclusion interval claims accept inclusive `scope.range` or the ADR's
  `scope.ticks` pair; contradictory aliases reject. Support resolves the exact
  finding's evidence references and intersects any declared finding interval.
  Supported verdicts require complete interval unions, not just minimum/maximum
  ticks. Distinct replays, dimensions and supplied build/config/map provenance
  receipts cannot fill each other's gaps. The default tick dimension is
  `runtime-tick`; an explicit range dimension remains distinct.
- Named cross-question comparisons independently bound the conclusion interval.
  Other supplied comparison-scope constraints must agree exactly, and supplied
  criterion/unit constraints must match. An authorized comparison is not evidence
  of coverage outside its scope. Explicit unknown/draft interpretations may cite
  partial or unknown interval coverage without manufacturing known bounds;
  known disjoint finding/evidence scope still rejects. No analyzer is rerun and
  no observed value is adjudicated true by these metadata checks.
- Evidence inspection uses indexed per-finding pages with a bounded lookahead
  and an 8 MiB cumulative metadata-byte budget. Valid support across multiple
  bounded pages is permitted; byte overflow rejects atomically. No payload is
  opened, no tick rows are expanded and no whole-catalog graph is hydrated.

Before implementation, the corrected regression harness ran five new checks:
ownership, same-question disjoint scope, cross-question disjoint scope and
coverage-gap checks failed with missing expected rejection; the independent
missing-per-finding-evidence check already passed. All eight added checks pass
on the corrected candidate. They cover inclusive endpoints, alias disagreement,
comparison bounds distinct from actual evidence coverage, incomplete/unknown
coverage, incompatible provenance/dimensions, declared occurrence preservation,
bounded multi-page support and byte-limit failure. Invalid inputs leave prior
findings/links, new reference registration, run/workflow receipts, revision/head
and support unchanged; valid subsequent publication and exact retries succeed.

Final-code validation: **26/26 catalog tests, 67/67 combined catalog/M1 tests,
280/280 repository tests and `npm run check` passed.** The M1 regression suite
includes locking, concurrent processes, interruption/recovery, active intents,
payload/overflow pinning, ownership, publication/deletion fsync and descriptor
cleanup. The runtime build is unchanged. No ADR requirement was relaxed.
Final documentation checks passed: 40 local links, two anchors, three JSON
examples, one SQL example with seven negative cases, and tracked/untracked
candidate whitespace.

Fresh catalog gate (focused run): **0.488 seconds, 68.14 MiB peak RSS**, under
the unchanged 192 MiB heap/256 MiB RSS/30-second limits. Both fixtures retain
exactly 10/1,000 capture anchors and the accompanying table counts described
above. Fixed-operation SQL/row counts remain identical at both sizes, and
catalog operations access zero payload bytes. New interval validation adds only
selected metadata queries; byte overflow has explicit atomic regression coverage.

Shared M1 modules and tests match the pre-correction hashes: the correction adds
no M1 publication, snapshot, cleanup, connection or locking path. Nevertheless,
fresh 600 MiB gates also passed in combined and repository runs. In the final
repository run, streaming generation measured **1.319 seconds / 63.48 MiB RSS**;
operations measured **0.230 seconds / 71.67 MiB RSS**. Exact 10/1,000-row assertions
and payload-access bounds passed; metadata operations read zero payload bytes,
and imports used 25 SQL calls at either size and only their new 12/14-byte payloads.
These are measurements, not new performance or durability guarantees.

## Sealed finding-evidence domain correction F4, 2026-10-04

The [project audit](project-audit-2026-10-04.md#f4--p1-c1-sealed-selection-ignores-evidence-range-dimension)
subsequently found a gap not covered by the preceding validation: a run selected
`runtime-tick` 1–2 but accepted finding evidence at `game-time` 1–2. Numeric bounds
alone do not establish compatible domains. Earlier results remain historical;
F1–F3 have separately passed focused review and remain unchanged by this task.

`appendFindingEvidence` now compares the selected range's domain with the linked
evidence range's domain before its existing numeric-containment and provenance
checks. A range object constrains the domain even if its bounds are unknown.
Missing or null **dimension fields** use the existing C1 `runtime-tick` default,
consistent with conclusion scope checks; original absent/null properties remain
unchanged in stored values. A missing/null **selection range** is unrestricted,
not an invented runtime interval. Unknown evidence bounds remain permitted when
the selection has no numeric restriction and the domain is compatible; a known
selected interval still requires contained known bounds, as before. An `unknown`
verdict cannot authorize evidence outside the sealed domain.

C1 has no typed domain-mapping/alignment conversion API. Its existing explicit
cross-question links authorize support subject to comparison scope/criterion/
unit checks, not translation between game time and runtime ticks. Opaque metadata
claiming `alignment: verified` or equal numeric bounds is not authorization.
Cross-domain conversion therefore remains unsupported here; no new alignment
mechanism, schema or ADR relaxation was added. Conclusion interval/provenance
grouping and earlier support validation are unchanged.

Nine new negative checks failed against the pre-fix implementation with missing
expected rejection; the independent compatibility-control test already passed.
All **10/10** pass after correction (**2.432 s**), covering both domain directions,
passed and unknown verdicts, omitted/null dimension defaults, a domain-only
selection and a claimed opaque alignment. Each rejected batch first inserts a
valid finding, then encounters invalid evidence in a second finding, including
a newly registered evidence reference. Two rejections preserve every synthetic
table row, generation, sealed selection/digest, workflow, findings/links and
result receipts. Matching same-domain evidence subsequently publishes with an
inclusive endpoint and exact retry; unknown verdicts remain unknown. Controls
retain unrestricted selections, unknown bounds and original null/absent values.

Native Node **24.19.0**, SQLite **3.53.3**, darwin/arm64 validation passed:
**36/36 catalog tests (7.293 s)**, **126/126 combined catalog/M1 tests (48.446 s)**,
**339/339 repository tests (50.287 s)** and `npm run check`. Earlier parent-link,
per-finding completeness, coverage-gap, comparison, unknown-evidence, multi-page
support, atomicity/retry and resource-limit regressions remain covered, as do
F1–F3 storage tests. Runtime build remains
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Resource impact: one scalar domain comparison on already selected metadata;
no added SQL, scans, payload access or per-tick expansion. Fresh gates ran rather
than relying on old results. Focused C1's exact **10/1,000-anchor** gate took
**0.408 s / 68.45 MiB peak RSS**, within the unchanged 192 MiB heap/256 MiB RSS
and 30-second limits; fixed SQL/row counts and zero payload access passed.
The combined **600 MiB** gate generated/verified **629,145,600 bytes** in
**1.298 s / 63.42 MiB RSS**; operations took **0.206 s / 71.52 MiB**. Exact
10/1,000-row checks and unchanged payload-access limits passed: metadata read
zero payload bytes, imports used 26 SQL calls at each size and only new 12/14-byte
payloads. Fresh C1/M1 gates also passed in the repository suite. These are local
measurements, not performance or durability guarantees.

Only `tools/replay-catalog.js`, `tests/unit/replay-catalog.test.js`, this record
and the audit F4 entry changed in this task. M1 modules/tests, F1–F3, ADR contracts,
unrelated work and both trial worktrees are preserved. No production evidence,
integration, migration, watcher, gameplay, staging, commit or push was involved.
Documentation checks passed **28 local links / ten anchors**; the changed
documents add no JSON examples. Tracked and four nonignored untracked text-file
whitespace checks passed. HEAD remains
`48201957e5c69060085fd7f8e1609b140b1bfc57`; the index is empty.

## Limits and next boundary

Independent candidate check, 2026-10-04: HEAD plus the isolated M1 fixes and C1,
without the F5 cache patch, passed **339/339** repository tests, including
**126 storage/catalog tests** (36 catalog), `npm run check`, and fresh C1/M1
resource gates. The store/tests match the reviewed combined implementation;
only their prerequisite split differs. Exact scope and artifacts are in the
[candidate record](audit-candidates-2026-10-04.md). These results supersede neither
historical runs nor production qualification: they establish isolated candidate
correspondence for later review/staging authorization.

C1's earlier two review defects and F4 are corrected and locally validated, with
focused review recorded in the project audit. F1–F5 have passed focused review;
the dependency-separated candidate still needs its own staging/commit authorization.
It is not qualified for production use. Earlier “open”/“awaiting review” statements
above are historical checkpoints, not current finding status.
No existing importer/analyzer/cache is integrated; no evidence was imported,
reviewed, migrated, cleaned or completed. Catalog body files, relocation, large
result staging, general evidence snapshots and cleanup-event integration remain
C2; consumer integration, backup/migration/rehearsal remain separately authorized
later milestones. Historical metadata is a receipt, not current verified bytes.

Power-loss durability, arbitrary OS close-failure semantics and additional
platforms/filesystems remain unqualified. Fixture primitive tests and SQLite
FULL/rollback-journal settings do not establish those guarantees. Existing M1
qualification is not broadened by this record.

Manual action: NONE.
