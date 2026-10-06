# Storage v3 M2e: fixture-only combined log-and-score analysis

Date: 2026-10-06. Status: proposed implementation contract, awaiting independent
review and separate implementation authorization. Inspected published commit:
`859f5ab33ac4b9385e70b04c273fad79a5897527` (BASE below).
This document reserves **M2e**, the next unused identifier after M2d. The committed
roadmap does not name or order a successor; this reservation records the agreed
planning choice. No implementation, oracle generation or qualification occurs
in this task. All M2e resource budgets and outcomes are **unmeasured**.

Authority: [ADR 0006](../decisions/0006-replay-storage-v3.md),
[ADR 0005](../decisions/0005-replay-frame-scoring-evidence.md), the
[analyzer contract](replay-analysis.md), and the
[evidence contract](replay-evidence-contract.md#replay-score-source-retention).
The [analysis](../diagrams/replay-analysis.puml),
[log cleanup](../diagrams/replay-review-cleanup.puml) and
[score retention](../diagrams/replay-score-retention.puml) diagrams retain their
existing workflow meanings.

## Choice, prerequisites and exclusions

Combine one explicit replay's selected logs and scores in one pinned view, then
reuse existing alignment, mapping, build provenance and event association logic.
This completes another analyzer input seam before lifecycle/import/cache wiring;
it adds no new evidence interpretation. Separate M2c and M2d calls cannot produce
a coherent combined result, even if their store IDs happen to agree.

Dependencies are [M1](replay-storage-v3-m1-2026-10-03.md) locking, recovery,
ownership and snapshots; [C1](replay-catalog-c1-2026-10-04.md) schema-2 evidence
access; [M2a](replay-storage-v3-m2a-2026-10-04.md) pinned payload iteration; and
the [M2c plan](replay-storage-v3-m2c-plan-2026-10-05.md)/
[qualification](replay-storage-v3-m2c-2026-10-05.md) and
[M2d plan](replay-storage-v3-m2d-plan-2026-10-05.md)/
[qualification](replay-storage-v3-m2d-2026-10-05.md).
[M2b](replay-storage-v3-m2b-2026-10-04.md) is a compatibility checkpoint, not a
runtime dependency. M2d's historical 582-test pass does not qualify M2e.

Excluded: lifecycle orchestration, claims/reviews/completion, import/list/map
administration, caches, historical-index/scout-screen integration, broader
bounded-v2 access, production dispatch/roots, C2 catalog bodies, M3 migration/
export/rehearsal/rollback, M4 cutover, gameplay and Arena operation. No catalog
finding or conclusion is written. Automatic completed-log reconciliation and
explicit score retirement remain in their existing callers. Writer operations
appear only as separately authorized synthetic test actors.

## Interface and expected implementation paths

New `tools/replay-combined-analysis-fixture.js` exports:

```text
analyzeFixtureCombinedReplay({root, schemaVersion, replayId,
  fingerprints, scoreFingerprints, reportMode = 'full'})
  -> Promise<existing combined replay report>
```

- Accept only a plain options object with these keys. `fingerprints` selects
  logs; `scoreFingerprints` selects scores. Both arrays must be explicit,
  nonempty and internally distinct, with lowercase full SHA-256 strings.
  Require one lowercase 24-hex replay ID and numeric schema 1 or 2. The identity
  includes collection: equal fingerprint strings in different collections are
  not duplicates. Copy both arrays before any await. No implicit select-all.
- Check array lengths before traversing elements. More than 64 requested
  identities **in total**, including missing scores, is `RESOURCE_LIMIT`.
  Invalid/duplicate/empty selection is `INVALID_IDENTITY`; unknown options are
  `UNSUPPORTED_OPTION`; unsupported report mode is `INVALID_ARGUMENT`.
- Require the core's canonical direct temporary root, bound fixture marker,
  `pain-gain-store-v3-fixture-` prefix, supported native Node/SQLite and declared
  local APFS environment. No default root, path alias, arbitrary-file argument,
  autodetection, recovery flag or production-capable dispatch.
- Lazily open `openStore({root,mode:'read'})` or schema-2
  `openCatalog({root,mode:'read'}).evidence`; close the owning handle. Existing
  synchronous v2 imports must remain SQLite-free. No implicit recovery/retry.
- Return a detached full/compact report only after callback and owner cleanup.
  No sink, iterator, view or background operation escapes. Read the fixture-local
  build input once using the existing safe 16 KiB rule; absent means null, never
  a repository-build fallback. No external in-place mutation guarantee is added.

| Expected path | Narrow responsibility |
| --- | --- |
| New `tools/replay-combined-analysis-fixture.js` | Request gates, one snapshot, bounded loading and shared combined analysis |
| [replay-store.js](../../tools/replay-store.js) | Additive exclusive combined-selection mode; per-collection policies within existing acquisition/cleanup |
| [replay-analysis.js](../../tools/replay-analysis.js) | Minimal detached combined finalization using the existing session and score-report helper |
| [replay-analysis-fixture.js](../../tools/replay-analysis-fixture.js), [replay-score-analysis-fixture.js](../../tools/replay-score-analysis-fixture.js) | Extract/reuse only necessary loading helpers; preserve both existing public interfaces and rejection behavior |
| [replay-score-analysis.js](../../tools/replay-score-analysis.js) | Reuse `analyzeLoadedScoreEvidence`; no new alignment/mapping algorithms |
| New `tests/unit/replay-combined-analysis-fixture.test.js`, `tests/fixtures/replay-combined-analysis-m2e-*` | Frozen oracle, fixture builders, fault/concurrency workers and resource receipts |
| Existing analyzer/score/store tests, `package.json`, directly relevant docs | Regression coverage, syntax registration and separate qualification record |

No schema, payload encoding, dependency or writer-policy change is planned.
Additional required capabilities outside this boundary must be reported as
blockers rather than silently widening the milestone.

## One coherent combined snapshot

Add this exclusive option to the existing `withReadSnapshot` implementation:

```text
withReadSnapshot({combinedSelection: {
  replayId, logFingerprints, scoreFingerprints
}}, async view => result)

view.combinedSelection() -> {
  logKeys,
  scores: {
    collections: {scoreRecords: {present, hasRows},
                  retiredScoreSources: {present, hasRows}},
    currentKeys, missingFingerprints, retiredFingerprints
  }
}
```

Reject simultaneous `recordKeys`, `mapIds`, `reviewKeys`, `payloadRoles` or
`scoreSelection`. Validate/copy the selections at the core boundary too. The
accessor returns immutable facts and rejects after callback lifetime. Ordinary
snapshot options and M2d's exclusive score mode keep their current defaults.
Reuse one lock, read transaction, descriptor revalidation and every-close loop;
do not compose nested snapshots or introduce another lock implementation.

During acquisition, under the existing owner lock:

1. Revalidate root, descriptor/store identity, schema and connection settings.
   Resolve all requested identities through indexed lookups, decoding SQLite
   integers as BigInt before normalization. Preliminary getters are advisory.
2. Require every requested log to be current, `claim` or `done`, without a file
   intent. Missing/retired logs reject the entire operation. Require original
   replay association, active status, validated map registration and exact log/
   replay/map projections as in M2c. Load their inline original properties.
3. Resolve the two score collection presence rows and indexed `hasRows` facts
   exactly as M2d. Absent and present-empty remain different. Missing presence
   metadata is unsupported; absent-with-rows or current-plus-retired conflicts
   reject. Resolve current/missing/retired score selections in this transaction.
   Current scores must be `claim` or `done`, have no active intent, and own a
   ready output. Pending/retiring/unreadable current scores reject the whole call.
4. Check each current output by unique owner and path, matching original fields,
   projections, ready state, expected bytes/hash and valid identity-bound name.
   Preserve indexed global cross-kind ownership checks for selected paths; do
   not scan/hydrate unrelated records to discover collisions. Null log output
   requires both original/projection fields null and no owned reservation.
   Scores always require an owned output, even when a projection is null.
5. Load all selected original record properties and pin their roots/dependency
   closure, outputs and log-required map once per path. Verify owner, role,
   parent, item count, safe regular-file identity and budgets. Distinguish each
   record's collection when choosing policy: optional score mapId fields neither
   add maps nor require their files. If the same map is required by a log, it is
   pinned because of that log. Score metadata cannot change log association.

The internal replay identity required by score foreign keys is not new evidence.
The log selection supplies the genuine public replay association and its map.
Do not copy that association's build into score `embeddedBuildId`, replace an
optional score map value, or infer player/time alignment from shared replay IDs.

Complete setup, close the read connection and release the lock before callback
reads/analysis. All payload reads use pinned `view.output`, `view.mapArtifact`,
`payloadChunks`, diagnostic and JSON iteration; no pathname reopen or later
metadata lookup. Retain the same snapshot until analysis finishes. The union
must fit one snapshot; automatic split-and-merge is forbidden.

## Detached loading and combined finalization

Expose a narrow synchronous boundary in `replay-analysis.js`:

```text
analyzeLoadedCombinedReplay({replayId, fingerprints, scoreFingerprints,
  reportMode, localBuildId, logicalManifest, mapEvidence,
  logEvidence, sourceEvidence}) -> existing combined report
```

`logicalManifest` contains the selected original logs, original replay/map
association and selected current score originals. Preserve score collection
absence by omitting `scoreRecords`, otherwise use an array (possibly empty).
`logEvidence` maps exact original record objects to detached output evidence or
null for evidence-only logs. `sourceEvidence` maps exact score record objects to
`{bytes: Buffer}`; retain M2d's occurrence-keyed contract. Map evidence is keyed
by original logical filename. No root, SQL/FS capability, live view or Promise
enters this boundary. Transport preflight for the whole union finishes first.

Construct the existing internal analysis session, accept logs in exact original
ordinal order, then call the existing `finishScoreReport` path with
`analyzeLoadedScoreEvidence`. The latter already consumes snapshots, merged
diagnostics and selected build IDs. Do not finalize a log report first or merge
two completed reports. Validate complete single-use session consumption. Keep
existing score fingerprint ordering and ordinary numeric-sign comparisons for
mixed Number/BigInt ordinals. Reuse existing finding order and full/compact
formatting without a second mapping/alignment/provenance/report implementation.

The synchronous v2 wrapper, score-only loaded boundary, M2c session interface,
CLI defaults/serialization and SQLite isolation remain unchanged. Internal
factoring may serve these wrappers only with exact regression parity. Preserve
v2 duplicate record occurrences with different loading outcomes, including
occurrence order; do not key loaded bytes solely by fingerprint.

## Admitted evidence, errors and limits

Reuse M2c's original log/replay/map representations and M2d's score originals:
safe own properties, original order, absent/null/false/zero, unknown fields and
complete bounded original reviews. Do not fabricate split reviewer containers.
Map/replay original values stay inline; out-of-line versions and split/nested
record-property shapes remain unsupported. Record JSON roots must have exact
owner/pointer/role/parent bindings. Diagnostics retain registered overflow trees.
Preserve logical manifest/output/map references; no UUID, generation, physical
sidecar path or transport-only hash enters a finding.

| Condition | Whole-call result |
| --- | --- |
| Missing/retired selected log; log association/map unavailable | `UNAVAILABLE` or existing specific linkage error, no partial report |
| Genuine absent/empty score collection; missing/retired requested score | Existing score selection unknown findings alongside the valid log analysis; no fabricated current record |
| Missing score presence metadata or unsupported original representation | `UNSUPPORTED_REPRESENTATION`, not an absent-collection result |
| Any current pending/retiring source, active intent, missing reservation/artifact | `UNAVAILABLE`, even if other selected sources are readable |
| Unsafe path, ownership/projection/binding mismatch, physical hash/length corruption | Preserve specific core error or `INVALID_REFERENCE`/`INVALID_ARTIFACT` |
| Oversized selection/value/body/dependency closure | `RESOURCE_LIMIT` before analysis; identify field/budget |
| Runtime/lock/busy/hot-journal failure | Preserve core error, including `RECOVERY_REQUIRED`; no read-side repair/retry |
| Valid transport with map/JSONL schema, diagnostic generation, coverage/build or score semantic problems | Existing fail/unknown findings and dependent-evidence suppression |
| Unexpected setup/read/analysis/callback failure, including null | Original rejection value survives cleanup |

In particular, pass complete score raw bodies unchanged to the existing
validators: malformed UTF-8/JSON, non-array bodies, unsupported UI and native
numeric parsing remain semantic evidence. Physical output integrity is distinct
from separately retained response/request-qualified identities, which the score
analyzer checks. Do not apply diagnostic JSON transport rejection to raw bodies.
Outer JSON originals/wrappers retain strict v3 finite-value/representation rules.
Never turn transport/resource rejection into an empty successful analysis.

Parity covers supported transport-valid representations, including semantic
failures and score absence facts. It deliberately excludes v2's file-error and
missing-log report behavior where M2c requires strict transport rejection.
Missing scores do not excuse a missing log. No new time-domain conversion or
alignment inference is allowed: use existing unique-offset, compared-frame,
gap/overlap, slot-mapping and contributor-build rules. Terminal certainty,
causality and strategy benefit cannot be inferred from combined input alone.

MiB means 1,048,576 bytes. Limits apply to the complete call, not independently
to two adapters:

| Account | Limit and counting rule |
| --- | --- |
| Requested source identities | 64 total log + score identities, including missing/retired requests |
| SQLite/row/page bounds | Existing 64 KiB inline rows, 128-row/8 MiB pages; indexed bounded queries |
| Snapshot metadata | Existing 8 MiB core account, including selected reference/selection facts; no duplicated unbounded receipt |
| Pinned artifacts | 256 handles across both collections, maps and overflow closure |
| FS reads | At most 64 KiB per chunk; no pathname reopening |
| Expanded original metadata | One shared 8 MiB account across logs, scores, unique replay/map originals; add UTF-8 pointer bytes and existing finite JSON encoded-size count per value, including unknown properties |
| Original property value / diagnostic wrapper / JSONL line | Existing 1 MiB materialization ceilings; no unresolved stream-value fallback |
| Map bytes | 1 MiB per selected map; only log-required maps are admitted |
| Log output bytes | 16 MiB aggregate JSONL bytes |
| Diagnostic wrappers | 16 MiB aggregate encoded logical wrapper bytes, counted after overflow expansion |
| Score response bytes | 4 MiB per source and 16 MiB aggregate; opaque raw bodies are not subject to the JSON token ceiling |
| Local build provenance input | Existing safe 16 KiB fixture-local input, read once |

For expanded metadata, count each selected owner/property once; shared replay/
map owners are not charged once per log. `/otherEntries` contributes its pointer
to metadata and its reconstructed wrappers to the separate diagnostic account,
not both full arrays. Raw outputs and map artifact bytes use their own accounts;
all their reference metadata still counts in the core snapshot account. Preserve
existing depth limits (including score JSON-root depth 1,024). Test exact limits
and one over, including a union that fits each collection separately but exceeds
the shared limit. These are consumer caps; larger retained evidence is not deleted
or rejected by writers. Analyzer-derived structures have no new general bound.

On every exit attempt all artifact closes and close the owner. Preserve primary
errors with an explicit failure flag, including thrown null; without a primary
error report the first cleanup failure after all attempts. No double-close or
escaped reads; accessors reject `CLOSED` after callback exit. Subsequent writers
and snapshots must succeed. Close-after-close injection does not qualify arbitrary
OS close failures. Reader operations create only transient owned lock state.

## Independent oracle and required functional tests

Before candidate implementation/refactoring, export unmodified BASE into an
isolated directory and verify all imported analyzer/helper source hashes against
Git. Copy only the pure fixture definitions specified below; do not import a
test module that registers/runs tests. Hash the generator and copied definitions.
Use new synthetic v2 fixtures with explicit `fingerprints` and
`scoreFingerprints`, invoking BASE's synchronous `analyzeReplay` in both modes.
Freeze complete reports and SHA-256 of UTF-8 native `JSON.stringify(report)` plus
one LF, exact original metadata, raw artifacts, summaries, sizes and hashes.
Store generator/export hashes, BASE and timestamps in a new oracle receipt.
Do this before candidate code supplies any expected value. Preserve M2c/M2d and
compatibility oracles unchanged. No volatile report fields are scrubbed; fixed
dates/identities/build input and logical locators make expectations deterministic.

Required future checks, on both schemas unless specifically v2-only:

1. Full/compact combined parity for file-backed and evidence-only logs, both
   score kinds, subsets and request permutations; correct diagnostic generations
   including legacy/M2/M3/CPU. Both nonempty request arrays remain mandatory.
2. Unique, absent, ambiguous and conflicting alignment; canonical/conflicting
   overlaps, gaps, rejected bridges/cycles, and reversed/contradictory mapping.
   Preserve contributor-specific build association for tagged, legacy, mixed and
   conflicting contributors. Unrelated tagged logs cannot upgrade unknown build
   evidence. Check event suppression, exact logical references and terminal unknown.
3. Absent/present-empty score collections, all missing/retired scores, mixed
   current/missing scores and contradictory presence facts. Every selected log
   still must be available. Preserve collection-qualified identity distinctions.
4. Corrupt transport versus transport-valid malformed schemas/summaries/provenance,
   native score overflow/underflow/negative-zero/rounded-large-number parsing,
   exact raw bodies and immutable request-qualified identities. Retain both-order
   duplicate-v2-occurrence and single-occurrence controls from M2d.
5. Keep frozen M2c log-only/empty/wholly-missing selection and M2d score-only
   reports, actual synchronous v2 API/CLI controls and import hooks that forbid
   SQLite. New combined arguments do not change either existing fixture API.
6. Current pending/retiring sources, missing outputs/maps, unsafe paths,
   cross-kind/global ownership conflicts, projection errors and unresolved
   intents. Optional score maps add no reads, including a registered optional
   map with an absent file; log-required missing maps still reject.
7. Safe and above-safe-integer ordinals through SQLite's maximum, strict original
   properties, ordinary/overflow diagnostics, malformed roots, wrong parent/
   owner/count, unsupported split reviews and oversized dependencies. Prove
   every budget rejection precedes combined analyzer entry.
8. Acquisition barriers: change readiness, collection presence, score retirement
   or log association before the lock is acquired. Observe one current state or
   reject; preliminary lookups never authorize stale input. Live-lock and
   recovery-required failures preserve state with no hidden retry/recovery.
9. Suspend after all pins, then let an independent writer perform log-done
   cleanup and separately explicit score done -> committed retiring -> cleanup.
   The original combined reader finishes with frozen bytes. A later read rejects
   a retired requested log, while a test retiring only the score retains the
   score-missing unknown result. Score done alone must not remove its response.
   Verify the writer acquires the lock while the reader is suspended.
10. Setup failures after earlier pins, interrupted reads, analyzer/callback
    errors, Error and null with failing cleanup, no-primary-error cleanup,
    every-close attempts, expired views and successful subsequent operations.
    Exercise both store connection and owning-handle cleanup.

For success/failure tests compare persistent descriptor/marker/database bytes
and generation, properties/reviews/intents/status/tombstones and all synthetic
artifact hashes/sizes. For concurrency cases assert exactly the authorized
writer delta and zero reader writes. Preserve retained temporary/orphan evidence;
reader setup is not maintenance. No test reads/copies/hashes production evidence.

## Exact deterministic scale recipe

For each schema independently create two stores with exactly N=10 and N=1,000
operational `records` rows across collections. Catalog entities, maps and replays
do not count. The same four selected records occupy ordinals 0..3: log L0, log
L1, score S0 (game metadata), score S1 (frames). Request logs [L0,L1] and scores
[S0,S1]. All remaining records are unrelated pending scores. There is no local
build file; `localBuildId` is null. Store UUID/path randomness is transport-only.

Fix R to 24 lowercase `b` characters, B to 64 lowercase `a` characters and
DATE to `2026-10-06T00:00:00.000Z`. All following JSON uses native compact UTF-8
with property order specified below; no LF unless stated, no BOM/random padding.
`H` is SHA-256 of exact bytes. Original projections/aliases are not inserted into
logical v2 records. Use the unmodified BASE exports `canonical`, `mapChecksum`,
`summarizeDiagnosticCoverage`, `validateScoreBody` and `scoreSourceFingerprint`.

The pure `scoreItems`, `replayObject`, `scoreFrame`, `gameState`, `mapFixture`,
`productionMetadata`, `actionDiagnostics` and `rawCoverage` function declarations
in BASE's [score tests](../../tests/unit/replay-score-analysis.test.js) are fixed
recipe definitions. Copy their exact declarations into the future generator,
binding their closed-over `buildId` to B. Do not invoke `workspace`, register
tests or copy evidence. They specify key order and actor/flag fields exactly.
Freeze their source hashes; later edits to project tests cannot change the recipe.

```js
const frames = [scoreFrame(1, [10, 1, 8, 1]), scoreFrame(2, [11, 1, 9, 1])];
const games = frames.map((frame, i) => gameState(i + 2, frame, 'player1', B));
const diagnostics = [2, 3].flatMap(tick => actionDiagnostics(tick, 'p1'));
const metadata = productionMetadata('user-a');
```

There are two frame occurrences at gameTime 1,2 and two snapshots at runtime
ticks 2,3, with positions establishing offset +1 and both player slots. The map
payload is `mapFixture()`; map ID is `mapChecksum(payload)`. Save
`canonical({...payload,checksum:mapId}) + '\n'` as
`pain_and_gain_map_2026-10-06T00-00-00-000Z.json`. Registration property order:
id, checksum, file, status `validated`, registeredAt DATE. Replay property order:
replayId R, mapId, buildId B, status `active`, associatedAt DATE,
retiredFingerprints []. Its original properties and the map's remain inline.

For i=0,1, Li's fingerprint is `i.toString(16).padStart(64,'0')`, an explicit
synthetic log identity. L0 saves both `games` as native JSON lines with one LF
after each, filename `R-FULL_FINGERPRINT.jsonl`; L1 is evidence-only with both
output fields null. Exactly one selected log output exists.

Each log has exactly 1,024 wrappers in j=0..1023 order, 2,048 total. L0's wrappers
are all `{key:String(j),raw:'x'.repeat(128),type:'other'}`. For L1, j=0..9 wraps
`diagnostics[j]` as `{key:String(j),raw:JSON.stringify(entry),type:entry.type,
formatVersion:entry.formatVersion}`; j=10..1023 uses the same other-wrapper rule.
Thus ten typed entries and 2,038 other wrappers are fixed. For each log, its
diagnostics root uses native `{ordinal:j,wrapper}` plus LF, except j=512 uses
`{ordinal:j,wrapperRef:'/otherEntries/overflow'}` plus LF. Store that exact wrapper
as one `extensions/json-v1` file without LF, pointer `/otherEntries/overflow`,
parent `/otherEntries`. Root role diagnostics, pointer `/otherEntries`, items
1,024, parent null. Both owners have distinct roots/children; no deduplication.

Original log property order is replayId R, requestedTick i+2, sourceEntry
`synthetic-m2e-log-I`, sourceKey `1/0/https://arena.screeps.com/api/game/R/log/T`,
fingerprint, outputPath, outputFingerprint (H(output) or null), mapId,
mapChecksum mapId, mapFile, buildId B, importedAt DATE, status `claim`, coverage,
diagnosticCoverage, otherEntries, reviews {}. Substitute decimal I=i, T=i+2 and
literal R. Coverage is `rawCoverage(games)` for L0, `rawCoverage([])` for L1.
Diagnostic coverage uses the corresponding log lines and parsed typed entries
with the wrapper keys above, through BASE's helper. Untyped x strings are not
parsed evidence. Store summaries/reviews inline and `/otherEntries` by root ref.

S0 body is native `JSON.stringify(metadata)`, S1 body native
`JSON.stringify(frames)`, with no LF. S0 requestedGameTime is null and URL
`https://arena.screeps.com/api/game/R`; S1 is 1 and URL ends `/replay/1`.
Let i=0,1 denote the score source index (operational ordinal i+2): sourceKey is
`'1/0/' + requestUrl`, responseFingerprint is H(body), fingerprint is BASE's
`scoreSourceFingerprint(sourceKey,body)`, output name is
`replay-score-source-R-FULL_FINGERPRINT.response`. Synthetic cache hash is H of
UTF-8 `m2e-cache-I`, one zero byte, then body. Recompute/freeze coverage and
validation with BASE's `validateScoreBody(kind,body,responseFingerprint)`.

Score original property order follows the fixed M2d profile:

```text
formatVersion:1, kind, replayId:R, requestedGameTime,
sourceEntry:"synthetic-m2e-score-I", sourceKey, requestUrl,
cacheEntryFingerprint, responseFingerprint, fingerprint, outputPath,
outputFingerprint:responseFingerprint, embeddedBuildId:null, mapId:null,
coverage, validation, importedAt:DATE, status:"claim", reviews:{},
fixtureNote:"n" repeated 65,536 times
```

Both `/validation` values are separate `summaries/json-v1` roots even when small;
both `/fixtureNote` values are separate `extensions/json-v1` roots, exactly
65,538 bytes each. All four use native JSON, no LF, parent null, exact property
binding and no item count. Other score fields are inline. Verify every inline
value is within 64 KiB and every expanded value within its consumer cap.

Logical manifest property order is version, maps, replays, records, scoreRecords,
retiredScoreSources, with values 2, [map], [replay], [L0,L1], [S0,S1], []. Both
score collection presence rows are explicit present=true, ordinals 4 and 5;
the retired table is empty. Record property ordinals follow the stated order.
Create ready selections through public writer reservations/intents/publication
and finalization, not direct SQL. Restore original properties as the prerequisite
fixture builders do. Raw outputs and sidecar reservations must all be verified
before claim; L1 needs no output reservation but its payloads remain owned.

Selected artifact layout, identical in both schemas:

| Kind | Files |
| --- | ---: |
| Log-required map | 1 |
| L0 JSONL output | 1 |
| Log diagnostic roots | 2 |
| Diagnostic overflow children | 2 |
| Raw score responses | 2 |
| Score validation roots | 2 |
| Score note roots | 2 |
| **Total, opened once each per call** | **12** |

Freeze literal selected identities, all twelve byte sizes/hashes and Hfull/
Hcompact through the independent procedure before adapter implementation.
Hmode = H(UTF-8 `JSON.stringify(BASE report)` plus LF). Verify known answers:
two selected/trusted logs, two snapshots, two complete diagnostic ticks, both
verified score sources, player1 mapping, established offset +1, associated log
build B, nonempty event associations and unknown terminal status. Full/compact
field availability differs; assert each at its existing report location. If
BASE contradicts these controls, stop and report the recipe discrepancy before
changing inputs or expectations. This plan fixes deterministic byte formulas;
it does not invent uncomputed literal sizes/report hashes or permit candidate
code to generate them. No report field is filtered during equality/hash checks.

Unrelated operational ordinals i=4..N-1 are pending score records under a second
internal replay of 24 lowercase `e` characters, fingerprint H of UTF-8
`m2e-unselected-I`, null map/build/output projections and no raw body. They are
legitimate pending storage fixtures, not ready score evidence. For i=4..9 use
publication intent `m2e-unrelated-I` to reserve two extension roots each. For
j=0..11, owner is i=4+floor(j/2), pointer `/large-J`, role extensions, json-v1,
parent null, file ordinal j modulo 2. Content is quote, ASCII byte 65+j repeated
50*MiB-2 times, quote. Stream at most 64 KiB, publish against exact reservations,
attach references and retain the six pending intents with verified file
checkpoints. Do not finalize score records lacking outputs or use the log-only
unreserved publication exception. Extra rows 10..999 have no large payloads.

Each store therefore has twelve physically distinct 50 MiB unrelated files
(629,145,600 bytes); each schema's pair has 1,200 MiB. Assert distinct hashes,
paths/inodes, nlink=1, exact lengths and allocated storage consistent with
streamed non-sparse files. Never materialize these strings. Independently assert
exact operational counts, selected identities/layout and six remaining intents
after generation; do not infer counts from construction loops or elapsed time.

## Proposed resource gates and qualification

Run schemas separately with fresh generation, operation and preservation workers,
each using `--max-old-space-size=192`, at most 256 MiB peak RSS including startup,
and no baseline-memory subtraction. All gates remain unmeasured proposals.

| Phase | Parent monotonic spawn-through-exit deadline and included work |
| --- | --- |
| Paired generation | 60 seconds: both 10/1,000 stores, all selected/unrelated bytes, hashing/publication/fsync, count/layout/oracle assertions and baseline persistent inventories |
| Paired operations | 30 seconds: full then compact at 10 records, full then compact at 1,000; imports/startup, fresh handle each call, snapshot/loading/analysis/cleanup, exact frozen report/hash checks and counters |
| Preservation | 60 seconds: bounded streaming inventories of both stores and exact comparison; separate from adapter access counters |

Cap combined stdout/stderr at 1 MiB per worker; emit receipts, not reports or
payloads. Deadline or output overflow marks permanent gate failure, sends TERM,
allows at most two seconds, then KILL and at most three further seconds to reap.
Include pipe closure; descendant-held pipes must not keep the parent waiting.
Late successful exit never converts timeout to a pass. Preserve failed fixtures,
stdout/stderr, status/signal and shutdown outcome. No automatic pass-seeking retry.

Reset counters around each complete public adapter call, including open/close.
Require twelve selected artifact opens, one per path, zero unrelated payload
opens/bytes and zero persistent writes. Count SQL prepare/exec calls, returned
rows, read calls/bytes/max chunk, artifact opens/closes and writes. Report PRAGMAs
and bounded descriptor/marker/database/lock/local-build access separately.
For each schema/mode require equal SQL/row/open/read/byte counts between 10 and
1,000 and the same independently frozen report hash. Schema SQL totals may
differ; reports may not. Payload bytes read per call must be at most eight times
the sum of twelve frozen artifact sizes; maximum chunk is 65,536 bytes. Detect
path reopening separately from core metrics and require balanced descriptor
ownership. Do not claim equal SQLite internal page I/O. Generation/preservation
instrumentation is outside the measured adapter, not hidden as selected access.

Future implementation qualification must run focused combined/analyzer/score
tests, affected store/payload/catalog and M2a/M2b/M2c/M2d regressions, all prescribed
M1/C1/M2a/M2b/M2c/M2d resource gates and the new both-schema gate, then one complete
normal-concurrency `npm test` and `npm run check` on settled final bytes. Validate
links/anchors/examples, JSON receipts, tracked/new-file whitespace and scope.
Retain commands, runtime/SQLite versions, complete logs, exit/signal, elapsed
time, RSS, access counts, before/after code/test/package hashes, oracle provenance
and preservation receipts in a separate M2e qualification record.

Retain earlier failures and the unresolved intermittent SQLite delay. Do not
relax assertions, busy timeout, concurrency, deadlines or memory limits. A failed
required gate leaves qualification incomplete. Justified diagnostics or a fresh
complete run are distinct records; passing subsets never form a fictitious
full-suite pass. Preserve the main HEAD/index, unrelated prompt deletion, both
trial worktrees, runtime/builds and dependencies; exclude production evidence
from preservation hashing. The future candidate needs its own independent review.

Completion means admitted-domain full/compact parity, all required preservation/
error/concurrency/resource tests and a complete prescribed suite on delivered
bytes. It qualifies fixed-selection synthetic corpus independence only, not
general analyzer-memory bounds, full M2 integration, production readiness,
power-loss durability, arbitrary OS close-failure semantics, additional platforms
or resolution of the SQLite timing issue. This planning document authorizes none
of its implementation, oracle generation or qualification steps.
