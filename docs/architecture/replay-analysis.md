# Deterministic replay analysis

`tools/replay-analysis.js` implements milestone M4 of
[ADR 0004](../decisions/0004-replay-evidence-and-analysis-roadmap.md). It is an
importable Node.js analyzer with a guarded CLI. It reads existing manifest
version 2 evidence and writes one deterministic JSON report to stdout. It does
not import captures, acquire review ownership, migrate statuses, reconcile
cleanup, or write report files.

The separate [M2c fixture adapter](replay-storage-v3-m2c-2026-10-05.md) exercises
v3 input through `createReplayAnalysisSession`, the same synchronous validators,
merge logic and report finalization used below. Its asynchronous fixture-only
API does not replace `analyzeReplay` or add SQLite to the ordinary v2 dependency
path. The separately guarded synthetic command route below connects the existing
log, score and combined adapters without enabling production storage. Strict v3 transport errors reject; admitted semantic evidence
problems retain the analyzer's fail/unknown findings. Qualification is scoped
to synthetic fixtures, not production integration or general analyzer memory.

## Interface and input selection

The library interface is:

```js
analyzeReplay({ root, replayId, fingerprints?, scoreFingerprints?, reportMode? })
```

The CLI uses the repository root and accepts a replay plus optional full
response fingerprints:

```sh
npm run replay:analyze -- <replay-id> [fingerprint...]
```

Without fingerprints, every current manifest record for that replay is selected.
With fingerprints, only matching records are selected and each absent requested
fingerprint is reported as unknown. File-backed and evidence-only records are
both supported. Review claiming, examination, saving a report, and completion
remain separate operations documented in the README.

Scoring analysis is opt-in and requires a nonempty list of full managed
score-source fingerprints:

```sh
npm run replay:analyze -- <replay-id> [log-fingerprint...] --score <score-fingerprint...>
```

The `--score` marker separates log fingerprints from score fingerprints.
Omitting it keeps analysis log-only; full API mode preserves the existing
log-only report shape. A score-only API call can pass `fingerprints: []`; the
CLI without log fingerprints preserves its established default of selecting all
current log records.

The CLI uses compact mode by default. `--full-detail` selects the original
exhaustive report:

```sh
npm run replay:analyze -- <replay-id> [fingerprint...] \
  --score <score-fingerprint...> --full-detail
```

The importable API defaults `reportMode` to `"full"`, preserving existing
programmatic consumers and the version-1 full report shape. Callers may request
`reportMode: "compact"` explicitly. An invalid mode is rejected before any
evidence is read.

The analyzer reads `manifest.json` directly. It deliberately does not call the
importer's `list` command or `reconcileCleanup()`, because those lifecycle paths
may migrate or remove records. It requires `replay_logs/`, the manifest, saved
map, and any selected JSONL to be real non-symlink files within the supplied
root. Source cache entries are provenance metadata and are not reopened.

### Explicit synthetic SQLite route

On supported resident Node 24.19+ within major 24, an existing schema-1 synthetic
fixture can be selected explicitly:

```text
node tools/replay-analysis.js --synthetic-sqlite <fixture-root> <replay-id> <log-fingerprint...> [--full-detail]
node tools/replay-analysis.js --synthetic-sqlite <fixture-root> <replay-id> --score <score-fingerprint...> [--full-detail]
node tools/replay-analysis.js --synthetic-sqlite <fixture-root> <replay-id> <log-fingerprint...> --score <score-fingerprint...> [--full-detail]
```

The flag must be first. Unlike the ordinary production CLI, **no source means
rejection**, never selection of every log. `--score` without named logs is
score-only; named logs and scores use the existing combined adapter. At least
one explicit source is required, with at most 64 sources in total. Empty score
lists, duplicates within a collection and invalid full fingerprints reject
before store access. Full/compact defaults match the existing CLI (compact);
the new API defaults to full.

[analyzeSyntheticReplay](../../tools/replay-analysis-command-fixture.js) accepts
`{synthetic:true,root,replayId,fingerprints?,scoreFingerprints?,reportMode?}`.
Inputs and nested selection arrays are copied into private state before awaits;
accessors, sparse/custom arrays, unknown options and caller-supplied schema/
recovery/task overrides reject. It reuses the unchanged
[fixture access checks](replay-log-checkpoint-integration.md), not another backend:
canonical direct temporary `pain-gain-store-v3-fixture-` root, resident fixture
controls/database/sidecars, bound schema-1 descriptor and independent control files.
Production, backup, cache, trial and rehearsal roots are not accepted. This is
not an OS-level no-hydration guarantee; metadata-check/open races remain.

Dispatch uses the existing pinned log/score/combined snapshots and payload readers.
It never calls review commands or reads the monolithic v2 manifest. It builds
only the adapters' bounded selected logical inputs. All unselected diagnostic
and body payloads stay excluded; indexed global ownership/collection facts may
still be consulted. The original v2 API/argument parser and production command
route remain unchanged and ordinary imports remain SQLite-free.

The adapters **materialize selected arrays**, as explicitly authorized for this
integration: 16 MiB aggregate decoded diagnostic-wrapper bytes, 16 MiB aggregate
log JSONLs, 8 MiB expanded metadata and existing 1 MiB field/wrapper/line bounds;
score bodies retain their 4 MiB per-source / 16 MiB aggregate limits. No limits
were raised. Oversized inputs reject without truncation. The analyzer retains
decoded diagnostic/context arrays for overlap and correlation; these loading
caps do not qualify arbitrary derived memory use or end-to-end streaming.
Incremental JSON report output does not change that distinction.

Supported transport-valid selections retain exact v2 analytical results,
provenance, independent ownership/alignment gates and conflict/unknown semantics.
Invalid transport, unavailable selected identities/files, wrong ownership or
corrupt hashes reject without a partial report. Transport-valid semantic failures
remain findings. CLI analytical failures return a JSON report and exit 1;
transport rejection returns no report and a nonzero exit. No winner or action
timing inference is added. No claim/examined state is automatically changed.

Verification on Node 24.19.0: 45 retained synthetic route checks plus 106 unchanged
database-free versioned score-contract checks. Coverage includes both report modes,
log/score/combined parity, selection isolation, ordered wrappers, empty/over-limit
requests, corruption/unavailability and unchanged generation, review properties
and retained file hashes. No large cases, historical Git-object tests or full
database-backed qualification suites ran. Frozen recipe/oracles and the 24
authorized expectation deltas remain unchanged. WebStorm tracing confirms the
three existing adapters; errors/warnings and preservation limits are retained in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/synthetic-analysis-routes-20261013-1z3RVZ/report.json`.
This is synthetic consumer integration only, not production authority, general
analysis capacity or renewed M2h qualification.

### Synthetic historical index and scout screen

The two remaining derived-report commands have explicit schema-1 fixture routes:

```text
node tools/historical-index.js --synthetic-sqlite <fixture-root> <selection.json>
node tools/scout-hold-screen.js --synthetic-sqlite <fixture-root> <replay-id> <codex/task-id> <expected-build-id> <log-fingerprint...>
```

[The shared route](../../tools/replay-evidence-consumers-fixture.js) reuses the
same fixture access guard, bounded loaders and detached compact analyzer. Ordinary
v2 commands, caching and imports remain unchanged; SQLite is lazily loaded only
for the explicit flag. Production, backup, cache, trial and rehearsal roots reject.
Neither route writes reviews, reports or caches. The normal short snapshot owner
lock is still used; generation, relational reviews and retained file hashes remain
unchanged. Transport corruption/unavailability rejects the operation, rather than
being converted into an analytical finding or a partially successful index.

The [synthetic import seam](replay-synthetic-imports.md) additionally exercises
these readers after actual fixture checkpoint commands. The selected task's
relational review is optionally pinned in the same metadata snapshot; its owner
binding and inline/original `claimedAt` must agree. Null inline projections use the
original checkpoint. A missing relational row retains the legacy original-review
gate; an existing conflicting or unclaimed row never falls back to stale metadata.
This validates a claim, not every unknown review field or gameplay conclusion.
Neither reader changes the record's original `reviews` property or relational rows.

Historical input retains the existing version-1 selection schema: a task ID and
1–8 ordered matches with explicit log/score fingerprints, opponent, configuration
label/basis/expected build and optional reported final tick. At most **64 sources
across the whole request** are allowed. Each current record must already be claimed
by that task. Selected missing and retired identities remain distinct unavailable
rows, in the requested order; missing records do not imply retirement. Available
log selections check original association history against indexed retirement facts.
Score-only selections retain their separate identity/collection checks. Matches are
processed one at a time, never pooled into one corpus analysis or cross-match view.

Screening requires **explicit nonempty log fingerprints**, at most 64, rather than
implicitly selecting all current logs. Every selected log must be current, claimed,
of the exact expected build and accepted by the analyzer. Existing fingerprint
ordering, membership/scout selection, hold/release decisions, diagnostic closures,
conflict rejection and following-position observations are unchanged. Analysis and
screening consume the same pinned, verified selected inputs; no second pathname
read or controller evaluation is added. Scheduling, observed displacement and
gameplay benefit remain separate conclusions.

Options and nested values are privately snapshotted before awaits; accessor,
inherited/custom-prototype, sparse, duplicate and coercible identity inputs reject.
Selection controls are at most **64 KiB**, depth 16, 2,048 values and 128 properties
or array members per object. The existing adapter limits remain: 8 MiB expanded
metadata, 16 MiB selected diagnostic wrappers, 16 MiB JSONLs, 1 MiB individual
metadata/wrapper/JSONL line and map, 4 MiB per score body / 16 MiB aggregate, and
256 pinned handles. Selected arrays and analyzer correlation structures remain
materialized; this is not end-to-end streaming or a general heap bound.
There is a **60-second cooperative deadline**, checked around loading/analysis and
between matches, not a hard interruption of synchronous analyzer work. Normal
finite lock/busy limits remain. No budgets are automatically increased.

Indexed availability is read before pinning; a monotonically changing store
generation across assembly causes `CHANGED_INPUT`, with no retry. Generation is
used only as a coherence fence, never as evidence identity or a cache key. This
does not make separate matches one global snapshot or prevent metadata-check/open
races and unsupported out-of-protocol filesystem mutation. Those existing access
limitations remain. Control-reader operation errors retain separate cleanup errors;
no broader fault qualification of unchanged adapters/core is implied.

Synthetic results use **`cache: "disabled"`** (or the existing `"none"` for an
unavailable-only historical row). All analytical report fields remain equivalent
to supported v2 inputs. No old cache is consulted or written. ADR 0006's versioned
v3 cache domains are **deferred**, not implemented by this read-only seam; production
cache integration/invalidation still needs its own gate.

Focused retained fixtures verify v2 parity, ordered current/missing/retired
selections, selection isolation, claim/build/link gates, an exercised hold/release,
payload corruption, finite limits, generation-change rejection and unchanged
store/review/evidence state. The new task receipt is
`/Users/zoltanka/.local/share/pain-and-gain-evidence/synthetic-history-screen-20261013-ct8IC1/report.json`.
Frozen score contracts and accepted review/analysis routes are unchanged. No real
capture, import, review command, cleanup, production activation or qualification
is performed. Production cutover and M2h remain outside this synthetic integration.

## Report contract

Full reports have `reportVersion`, `replayId`, sorted selected fingerprints,
sorted findings, and pass/fail/unknown totals. Volatile timestamps and absolute
paths are excluded. Repeated analysis of unchanged bytes produces identical
data. Full mode retains every finding, alignment candidate, score observation,
event, and provenance chain exactly as before.

Compact reports add `reportMode: "compact"`, `evidenceSummary`,
`findingSummary`, and an explicit non-exhaustive `detail` declaration. Finding
totals remain exact. Finding summaries group by rule, verdict, and build
provenance and provide counts, evidence-reference counts, tick/game-time spans,
and up to three deterministic representative references, messages, and bounded
observed-value summaries. Scoring sources, validation, coverage, groups,
mapping, build association, terminal
uncertainty, every direct/derived measurement, and every mapped difference are
retained. Per-source validation retains layer statuses, item-status counts,
blockers, issue counts by kind, covered ranges, and representative assessments;
full mode retains every assessment and issue. Repeated frame identities use
segment IDs plus counts/endpoints; relationships use counts/ranges and labeled
representative records. Alignment
alternatives use exact candidate counts and offset ranges plus representative
contributors. Event output gives exact counts/ranges and representative events.
These abbreviations never select an alternative or turn an unknown into a
conclusion. The report names `--full-detail` as the reproducible route to every
omitted evidence chain.

The CLI serializes either mode as deterministic two-space-indented JSON
incrementally, so output does not require one process-sized string. Each
submitted write must complete before the next one, output errors and premature
closure reject the operation, and the writer neither ends nor destroys its
caller-owned destination. Compact analysis aggregates findings as they are
produced and discards exhaustive contributor lists for ambiguous alignment
candidates. Parsed inputs, normalized timelines, score progression,
comparisons, and event analysis remain materialized; compact mode is not a
streaming analyzer.
When scoring is selected, the report additionally has sorted
`selectedScoreFingerprints` and `scoring` with source limitations, segments,
groups, relationships, mapping, alignment, build association, observations,
slot-derived comparisons, event associations, and explicit unknown terminal
status. Invalid selected sources remain visible with `integrity: "invalid"`
but contribute no segments or measurements.

Every finding contains:

- the replay ID;
- a stable rule name and `pass`, `fail`, or `unknown` verdict;
- project-relative file, fingerprint, line, diagnostic key/record, tick, or
  actor evidence as applicable;
- build provenance status and the relevant build ID;
- a short evidence-limited message and optional observed values.

Provenance is `local-source-match` when all supporting tagged evidence matches
the checked-in generated build ID, `tagged-unmatched` for one valid other build,
`legacy-unknown` when supporting evidence is untagged, and `conflicting` for
multiple tagged builds. A nonlocal valid build is not a failure by itself, and
an untagged or missing requested record is never assigned another response's
build. A replay-level build conflict remains visible, but does not erase a
finding whose own dependencies all have one compatible build. Conclusions that
would cross incompatible builds are unknown.

## Validation and merging

The analyzer revalidates manifest record fields and source identity, replay/map
association, map registration, JSONL byte hashes and schemas, raw typed
diagnostics, record build IDs, and stored coverage summaries. The registered,
embedded, and recalculated canonical map payload checksums must agree. The
saved-file byte hash is reported separately and is never substituted for the
payload checksum.

Stored per-response diagnostic summaries are recomputed with their original
`otherEntries` keys. Replay-wide merging uses fingerprint-qualified keys so
that identical local key names from different responses remain distinct.

Snapshots with the same tick and diagnostics with the same `recordId` are
compared canonically by recursively sorting object keys while preserving array
order and all values. Exact overlaps retain all source references and are
deduplicated for analysis. Conflicting variants are reported and withheld from
dependent conclusions. Replay-wide coverage is recomputed from raw evidence;
stored per-response summaries are only consistency checks.

Complete M2 closures support membership evidence only. Complete M3 closures
support membership and action evidence. A complete closure with zero records is
an explicit covered zero; a recorded hold or no-action is an explicit decision.
Missing records, unsupported versions, missing closures, gaps, conflicts, and
correlation failures remain distinct unknowns.

Current version-2 closures additionally cover exactly one `runtime-cpu` sample.
For a valid complete sample, rule `cpu.measurement` reports raw `elapsedNs`, the
applicable `limitNs`/`limitKind`, and derived `headroomNs`. This is elapsed CPU
through the sampling call, not exact final-tick CPU or differential diagnostic
overhead. Negative headroom is retained as an observation without imposing a
threshold. M2/M3 closures remain valid but yield unknown CPU availability;
missing, malformed, unsupported, conflicting, incomplete, or build-incompatible
CPU dependencies cannot produce a measurement pass.

For supported M3 producer evidence, action completeness also requires exactly
one movement, healing, and combat decision for each owned creep in a compatible
same-tick snapshot. Holds and no-actions satisfy that requirement. Covered zero
action events are established only when the compatible snapshot has no owned
actors; without the snapshot, the expected actor/channel set is unknown.

## Derived checks and limits

Membership reconstruction starts only from a valid baseline and stops at any
coverage gap or contradictory transition. A valid reset must be followed by a
same-build full baseline at the declared next epoch. An unexplained rebaseline
or epoch jump is rejected; an epoch-one rebaseline or incompatible-build
baseline starts an independent boundary whose continuity is unknown. The
analyzer checks late additions, presence transitions, stable assignments,
dead-member nonreactivation, and agreement with compatible owned pre-action
snapshots.

Action checks use recorded attempts and same-tick pre-action state; they never
rerun selectors. Before tactical range checks, the actor must be owned and the
recorded target identity and coordinates must agree with a compatible snapshot.
Contradictions are reported while dependent range remains unknown. The analyzer
also checks required functioning parts, Chebyshev range for attack/heal methods,
and same-actor command compatibility. `heal` with
`rangedAttack`, and `attack` with `rangedAttack`, are allowed. `rangedHeal` with
either attack and `heal` with `attack` are conflicts.

A null return code still proves the call occurred without a numeric result and
reports `schedulingAccepted: null`; zero reports `true`, and a nonzero integer
reports `false`. Even zero proves scheduling only. Movement findings report the
attempt separately from displacement observed in tick `n + 1`; remaining
stationary is not labeled an engine failure. Health findings report positive,
negative, or zero deltas only for consecutive compatible-build snapshots.
Neither kind of state change is assigned to a command, and missing ticks are
never bridged.

## ADR 0005 scoring analysis

Every selected score artifact is rechecked as a safe uniquely owned regular
file. The analyzer verifies its response and request-qualified hashes, reparses
the exact body, recomputes layered validation and coverage, and accepts legacy
numeric gap arrays only through the Milestone 1 comparison normalization. It
never trusts `sourceEntry`, timestamps, filenames, import order, requested-time
order, or review state as sequence evidence.

Strict `gameTime` decreases and malformed frame elements create local segment
boundaries. Exact canonical frames create candidate edges only between sources.
The complete candidate graph is evaluated before grouping; a component with
two same-source segments or a cycle in source-proven overlap order is rejected
whole as `ambiguous-overlap-bridge`. No compatible subset is selected.
Accepted overlaps are deduplicated with all source references, while different
same-time frames in an accepted group fail integrity. Same-time frames in
unrelated groups remain `ambiguous-segment` rather than being merged.

Direct slot observations come only from recomputed valid item assessments.
Derived score change requires the previous integer `gameTime` in the same local
segment or accepted group and two valid cumulative scores. Gaps, conflicts,
missing scores, and decreases produce an explicit non-derived status. A decrease
breaks that pair without proving a reset; the current observation can begin a
later consecutive pair. Displayed gain is always direct and may differ from the
derived change, including repeated-score terminal-style frames.

Cross-evidence mapping recognizes the original stable string `id` and the
observed production `_id` only on typed replay objects (`prototypeName` plus
`type`). If both fields are present, both must be nonempty and equal. Duplicate
IDs must have identical normalized evidence. An explicit
`user: "player1"` or `user: "player2"` links each recognized object to a payload
slot; selected trusted runtime snapshots can then establish ownership through
the same ID and `my` field, with both slots supported and opposite.

The bounded production metadata adapter separately recognizes only the observed
`game` wrapper whose current `user`, two `_id`-identified `users`, two uniquely
identified `codes` with user references, and nested two-entry `game.usersCode`
form a complete reference chain. Numeric `firstPlayerIndex: 0` maps
`usersCode[0]` and `[1]` to `player1` and `player2`; numeric `1` reverses
that resolved code/user order. No other values or coercions are supported.
Usernames and array position in `users`/`codes` have no meaning.
Present wrapper/nested match IDs must agree with the hash-verified selected
record and request. Legacy omissions remain omissions. Present code versions
must be nonnegative safe integers; omitted versions remain unknown. Selected
metadata sources must agree on slot code IDs and on every known version for
the same code. Code/version identity is not a runtime build identity.
Every present legacy identity array is assessed before mapping: a malformed
representation prevents establishment, while valid simultaneous arrays must
exactly agree with the derived slot order. Simultaneous `id`/`_id` fields must
agree. Absent, malformed, duplicate, unresolved, or conflicting forms remain
unknown or conflicting.
This analyzer result is reported as `metadataIdentity`; it neither changes nor
replaces the retained Milestone 1 validation summary.

Winner-index interpretation is deliberately separate and unsupported by this
adapter: neither nested `game.result` nor score ordering supplies player
identity or a terminal winner. The terminal conclusion remains unknown.
No winner-index semantics are adopted from reference repositories. Supporting
a winner result would require separately established payload semantics and
validation, not reversal of an assumed score index. The reversed-slot extension
is covered by original synthetic tests in
`tests/unit/replay-score-metadata.test.js`, not a new live qualification.

### Synthetic metadata contract v2 (2026-10-12)

The historical `replay-score-analysis-m2d-recipe.js` and its two frozen JSON
oracles remain byte-for-byte unchanged. The original recipe's metadata uses
`_id: "game"`, whereas its request identifies `dddddddddddddddddddddddd`.
The strict adapter must reject this contradiction; retaining the historical
`established` expectation would weaken the identity gate.

`tests/fixtures/replay-score-metadata-contract-v2.js` pins the unchanged recipe
and both oracle SHA-256 identities before parsing or importing any input.
Its shared loader snapshots the bytes, rejects unsupported versions/inputs,
and checks fixed inventories of sixteen main cases, five supplemental cases
and exactly `full`/`compact` report/hash modes before comparisons. Missing,
extra, reordered or empty inventories fail; coverage never derives from an
unchecked oracle. The recipe is imported from its verified byte snapshot,
not reread from a potentially changed pathname. Detached tests, ordinary tests,
their worker and the transitive storage-fixture helper use this same gate.
The module derives a separate, versioned expectation in memory. It
authorizes only the following changes for the twelve explicitly named scenarios
that select this metadata, in full and compact modes:

- `scoring.metadataIdentity`: established becomes conflicting; resolved slots
  become null; its one source reports `match-identity-disagrees`.
- The single `score.metadata-identity` finding: pass becomes fail, with the
  corresponding message and observed identity (or compact representation).
- Summary counts: one fewer pass and one additional fail. Expected report
  hashes are recomputed from these explicit deltas, never from actual reports.

All source hashes, inputs, selections, other findings, mapping/alignment,
scores and unknown terminal conclusions retain exact historical expectations.
The four unaffected main scenarios and all five supplemental cases stay exact.
Both the existing compatibility test and its worker use the same versioned
expectation layer; no parity assertion is excluded. This does not execute or
renew the database/storage qualification suites.

`tests/unit/replay-score-contract-v2.test.js` compares all sixteen main and five
supplemental cases through the detached, database-free analyzer in both modes.
A separate synthetic valid-ID variant recomputes all body-dependent references
and tests both orientations. Malformed, null and mismatched IDs still conflict;
metadata alone still cannot certify runtime ownership, alignment or a winner.
Run this file and `tests/unit/replay-score-metadata.test.js` with resident Node
24.19+ within major 24. `tests/unit/replay-score-contract-inputs.test.js` adds
database-free altered-input, exact-inventory and pre-import validation checks;
it inspects ordinary/worker integration statically, without running database
paths. Historical receipts and qualification limitations remain
unchanged; this contract reconciliation establishes synthetic compatibility only.

Reversed mapping is valid. Metadata-derived mapping applies to a sequence group
only when that group independently contains both slot labels; snapshot-derived
and metadata-derived results must agree for every available slot observation,
including partial snapshot evidence. Mapping is not carried across an
ambiguous or rejected boundary. Missing or conflicting evidence keeps
ours/opponent differences unknown.

Alignment compares normalized frame `objects` (supported identity, position,
health, fatigue) and flags (identity, position, ownership when present, score
rate) with selected snapshots. A production flag is an object whose
`prototypeName` is exactly `ScoreFlag`; its `user` is not reinterpreted as the
runtime `owner`. Original top-level `flags` remain supported. If both flag
representations occur, their normalized ID sets and shared fields must agree;
an explicitly empty representation is present rather than absent, and a
malformed present representation is conflicting. Identical duplicates
deduplicate, while conflicts suppress alignment. One offset must have at least
two compared times, no conflicting frame, and no
structural frame gap across its supporting interval; zero or multiple fitting
offsets remain unknown. Each candidate records the exact snapshots and build
IDs that support it. Mapping and alignment are independent. Build association
is valid only when every contributing snapshot carries the same valid build ID;
legacy-only or mixed tagged/legacy contributors remain unknown, while different
tagged contributor builds conflict. Objective and escort-decision associations
are limited to the established interval and compatible tagged snapshots and
diagnostics. Score records retain `embeddedBuildId: null`, and all associations
explicitly disclaim causality and strategic benefit.

Synthetic fixtures verify these rules and byte-for-byte read-only behavior. The
[M5 live-validation checkpoint](replay-validation-2026-09-30.md) records one
current-build replay, deterministic report, captured coverage, CPU/headroom,
diagnostic size, timeout observations, and exercised state changes. The absent
terminal tick, live reset behavior, exact final CPU, differential diagnostic CPU
overhead, engine causality, and strategic benefit remain unknown.

## Opt-in synthetic derived-report caches

Historical indexing and scout screening accept a final `--cache` only in their
explicit `--synthetic-sqlite` CLI routes. Their APIs accept `cache: true`; omission
or false preserves the previously tested read-only `cache: "disabled"` behavior.
Plain `replay:analyze` has no report cache dependency and remains read-only.

The [cache adapter](../../tools/replay-analysis-cache-fixture.js) uses ADR domains
`historical-store-v3-v1` and `scout-hold-store-v3-v1`. It binds store identity,
ordered selected logical values, associations/history, metadata and hashes,
selection/configuration, local build and reader/analyzer dependency hashes.
Claims and selected payload integrity are rechecked before every hit; the current
implementation also recomputes analysis and compares the complete report digest.
It demonstrates cache correctness, not analyzer speedup. Unselected records and
reviews do not enter the key. Generation guards coherent selected assembly and
is recorded in the cache envelope, never included in the key: unrelated commits
can reuse a fully revalidated identical report. Future/foreign generation or
store bindings and altered report hashes reject; changed selected inputs miss.

Caches are derived regular files under the guarded fixture's `analysis_cache/`.
There are no database/review mutations. Cache inputs are bounded at 64 MiB,
reports at 8 MiB, each fixed dependency at 1 MiB and reads at 64 KiB. Existing
selected metadata/diagnostic limits and the 60-second cooperative consumer
deadline remain. This is bounded materialization, not end-to-end streaming.
Publication fsyncs an exclusively created temporary, links without overwriting,
then syncs the directory. Only that successful operation's temporary link is
removed; failed/concurrent temporaries remain. Earlier cache versions are not
read or deleted. No automatic cleanup, pruning, repair or schema upgrade runs.
Malformed, symlinked or dataless cache/control files reject before reuse.

Historical/scout report parity, misses/hits, metadata invalidation, claim and
integrity revalidation, unrelated-generation reuse and interrupted publication
are exercised with new synthetic fixtures. See the
[lifecycle integration](replay-log-checkpoint-integration.md#selected-synthetic-lifecycle)
for the combined workflow and retained receipt. Ordinary production v2 cache
behavior is unchanged. Production cache activation and fresh qualification remain
open; no gameplay improvement is claimed.

## Synthetic report-mode benchmark

Run the bounded benchmark with:

```sh
node tests/benchmarks/replay-report-modes.mjs
```

It creates and removes an isolated synthetic root, then runs full and compact
analysis in separate fresh Node.js processes over the same 180-frame selection.
The fixture has 167,992 selected artifact bytes, repeated provenance, and many
valid alignment offsets so alternative handling dominates the full report. Both
modes produced the same 554 pass, zero fail, and 547 unknown totals and the same
unknown alignment outcome. On the 2026-10-02 verification environment:

| Mode | Serialized bytes | Peak RSS (`maxRSS`) | Elapsed |
| --- | ---: | ---: | ---: |
| Full | 61,189,120 | 139,808 KiB | 1,441.875 ms |
| Compact | 217,138 | 75,504 KiB | 92.013 ms |

That run reduced output by 99.65% and peak process RSS by 45.99%. Elapsed time
also fell because the exhaustive candidate graph was neither retained nor
serialized. These are one-run synthetic measurements, not production replay
performance guarantees. Peak RSS includes process startup and all analysis;
the remaining parsed evidence, timelines, measurements, comparisons, and event
work still scale with selected input.
