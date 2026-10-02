# Pain and Gain

Screeps Arena code for the Pain and Gain arena. Armed creeps approach nearby enemies to reach weapon range; other movement falls back to the first ScoreFlag returned by the game API. Creeps use available attacks or healing against targets in range at the start of the tick.

## Layout

- `src/main.mjs` exports Arena's `loop()` entry point.
- `src/loop.js` orchestrates each tick.
- `src/arena/observe.js` reads flags, owned creeps, enemies, and damaged allies from the game API.
- `src/strategy/objectives.js` selects the first flag.
- `src/squads/membership.js` maintains match-local squad-membership bookkeeping from pre-action observations; the tick loop updates it but no gameplay selector uses it.
- `src/debug/replay-evidence.js` emits versioned membership, action, and CPU evidence with per-tick coverage without feeding diagnostics back into gameplay.
- `src/arena/execute.js` issues movement and tactical actions for each owned creep.
- `src/tactics/` checks functioning body parts, chooses deterministic targets, selects movement, and selects compatible healing and combat actions.
- `src/debug/game-state.js` writes one JSON game-state snapshot per tick and one map snapshot per match before actions.
- `tools/replay-logs.js` manages map-linked console evidence and exact replay-score source retention with separate lifecycles.
- `tools/replay-analysis.js` reads explicitly selected managed log and scoring evidence and emits a deterministic read-only JSON report without changing review lifecycle state.
- `tests/unit/` contains local decision and action regression tests;
  `tests/benchmarks/` contains bounded synthetic tooling benchmarks.
- `docs/architecture/`, `docs/decisions/`, and `docs/diagrams/` hold architecture notes, ADRs, and PlantUML diagrams.

Additional strategy, squad, state, and config modules can be added when they have behavior to own.

## Development

With Node.js available, run `npm run check` to verify the runtime build ID and parse the game modules, and `npm test` to run the local tests. There are no package dependencies or compilation step. The `package.json` ES module setting applies to local Node.js tooling; Arena loads the source files directly.

In the Screeps Arena client, set this arena's code directory to the project's `src/` directory, which contains `main.mjs`. Keep all local imports within `src/`. The current project checks do not execute an Arena match, so confirm module loading and movement in the client after selecting the directory.

Game rules are in `docs/pain_and_gain_rules.md`. The API and squad references are in `docs/architecture/`; code examples are in `docs/examples/`.

An armed creep considers the nearest living enemy within five tiles, breaking equal-distance ties by ID. It approaches until that enemy is within range 1 for ATTACK or range 3 for RANGED_ATTACK, then holds position. A creep with both functioning weapon types closes to range 1. Without a nearby enemy or functioning weapon, it moves toward the first ScoreFlag. Each creep receives at most one movement command per tick. Attack and healing eligibility still uses the observed positions before movement.

The optional one-scout flag-allocation experiment is **off by default** (`oneScoutFlagExperiment = false` in `src/config.js`). To test it, set that constant to `true`, run `npm run build-id:generate` and `npm run build-id:check`, then verify Arena selects this project's `src/` before starting a match. The changed build ID distinguishes this configuration from the baseline. Only one full-health MOVE-only scout can make one bounded attempt at a neutral attack-reduction flag after the first flag is owned; combat and healer movement keep priority. The [experiment policy](docs/architecture/combat-positioning-validation.md#one-scout-flag-allocation-experiment--2026-09-28) defines safety gates and measurement. Return the switch to `false` and regenerate/check the build ID for baseline runs. Captured flags continue to score and impose their army-wide penalty after the scout leaves; a second capture is not automatically beneficial.

The separate one-healer escort experiment is enabled (`oneHealerEscortExperiment = true` in `src/config.js`); scout allocation remains disabled in the deployment configuration. One healthy pure healer can stay near one healthy pure melee creep already engaging an enemy. An injury to either partner, or to another friendly within five tiles of the healer, returns it to normal movement; a more distant unrelated injury alone no longer releases an existing pair, although any injury still blocks a new assignment. It does not change healing actions or mixed-role combat movement. The original policy's live execution was validated, but this narrower release rule has only synthetic coverage; healing effectiveness and strategic benefit remain unverified. Its [policy and evidence limits](docs/architecture/combat-positioning-validation.md#one-healer-pre-injury-escort-experiment--2026-09-28) distinguish the current configuration from earlier builds.

The separate `scoutHoldExperiment` is **disabled** in the deployment configuration. The [one-match hold trial](docs/architecture/scout-hold-experiment-2026-10-02.md)
temporarily enabled it alongside scout allocation and healer escort; neither scout
experiment was promoted. When enabled, eligible unassigned MOVE-only scouts
hold within two tiles of our first flag while healthy, unfatigued, and free of
nearby enemies. Allocation and escort movement retain priority. Existing action
diagnostics record `hold` / `scout-owned-flag-hold` with no movement attempt;
no diagnostic schema or instrumentation is added. The charcock v78 screening
verified live holding and allocation priority, while hold-to-release remains
unexercised. See the [session handoff](docs/handoffs/2026-10-02-scout-hold.md)
for the final switches and evidence locations.

## Per-tick console output

Every tick emits one compact JSON line with `type: "game-state"` and the Arena tick number. It includes the selected flag ID, all observed creeps (ID, ownership, position, health, fatigue, and functioning body-part counts), and flags (ID, position, ownership, effect, and score per tick). Flag ownership is `me`, `enemy`, or `neutral`. Flag scoring rates are not accumulated match scores.

Snapshots are logged before movement and combat commands. Compare consecutive ticks by creep ID to inspect health changes; those changes alone do not establish which attack or heal caused them. Logging is enabled every tick without sampling. In the Arena console, use the current-tick filter to inspect one snapshot or disable it to see the tick history. Live log observations are recorded in the verification checkpoint below.

New snapshots also include the generated `buildId` at the top level; a matching emitted ID and pre-launch check identify the logged runtime source bytes. Observing the selected code directory separately provides supplementary launch evidence.

On the first successful tick, the logger also emits one `map-state` JSON entry with its capture tick before the game-state entry. It samples the documented 100×100 terrain grid and all objects returned by `getObjects()` except creeps, including their available serializable data and public flag fields. This is a starting-map snapshot, not a later ownership history; per-tick flag ownership remains in `game-state`. A terminal tick is not a reliable capture point because matches can end early. A failed map read is reported to the console and retried on at most two subsequent ticks without stopping game actions.

The replay-evidence stream emits one version-1 `membership-baseline` for each loaded membership epoch, then change-only membership records. Existing movement, healing, and combat execution paths also emit an `action-decision` for every owned actor/channel, including explicit holds and no-actions, followed by an `action-attempt` immediately after each selected production call returns. Attempts record the actual method, target coordinates, and numeric return value or `null` when the call returned no number. After all gameplay commands and existing diagnostics, the loop samples `getCpuTime()` with the documented first- or ordinary-tick limit, emits one version-1 `runtime-cpu` record, then emits a version-2 `evidence-coverage` closure. The sample excludes its own formatting/emission and the closure; derived headroom is sampling-point headroom, not final CPU or differential logging overhead. Membership-only M2 and action-only M3 closures remain valid and distinguishable through `coveredTypes`; missing samples, closures, attempts, or ticks remain unknown. Diagnostics do not drive gameplay, and even an `OK` return does not prove an engine effect.

## Verification checkpoint

ADR 0004 M5 is complete for its bounded live-validation criteria. User-launched
replay `6abd2590212b1d5ce6ae89a0` produced current-build snapshots and complete
version-2 diagnostics for ticks 1–138; the UI reported final tick 139, which is
not present in the capture. Two explicit-fingerprint analyzer runs were
byte-identical with no failures. The retained
[M5 checkpoint](docs/architecture/replay-validation-2026-09-30.md) records the
implementation commit, fingerprints, map checksum, report hash, diagnostic
volume, elapsed CPU/headroom, exercised actions and state observations, exact
lifecycle operations, and remaining unknowns. The captures are claimed and
examined but intentionally not completed. This evidence does not measure
differential diagnostic CPU overhead or establish terminal execution, command
causality, reset behavior, or strategic benefit.

The local combat-positioning candidate is reviewed in [combat-positioning validation](docs/architecture/combat-positioning-validation.md), including same-snapshot comparisons on two explicitly map-linked replays. Their movement is consistent with the candidate, but exact code provenance and a new live-match check remain outstanding. Snapshot comparisons do not establish improved match outcomes.

Replay `6ab963a6fa7e227bfcc9abf8` adds four map-linked chunks covering observed ticks 1–400. Across all four, the controlled army stays at least 35 tiles from an enemy, so the candidate selects the same first-flag objective as the committed baseline for every owned creep snapshot. This confirms no combat-positioning decision in the available range; the live movement gate and complete-match coverage remain unverified. The [validation note](docs/architecture/combat-positioning-validation.md#additional-replay-check-6ab963a6fa7e227bfcc9abf8) records the four filenames, linked map, limits, and completed managed cleanup.

The two remaining imported replays, `6ab96679fa7e228fc9c9acd4` (observed ticks 1–58) and `6ab9624dfa7e224005c9ab9e` (1–137), do show combat-range approaches and holds. In the latter, owned ranged creeps move away from the first flag toward enemies at range 4–5 and then stay within weapon range. This is strong candidate-like behavior, but the snapshots do not establish which source revision Arena loaded or cover the entire console; the movement commit gate remains inconclusive. The [validation note](docs/architecture/combat-positioning-validation.md#remaining-imported-combat-replays) preserves the map links, positions, distances, and limits.

Four map-linked chunks from replays `6ab867aee03513115f91edc0` and `6ab9398a22f1123ef118f173` were analyzed in the [replay review](docs/architecture/replay-review-2026-09-27.md), with proposed improvements recorded in [ADR 0003](docs/decisions/0003-replay-informed-strategy-proposals.md). Both review tasks completed, so their managed JSONL and manifest records were cleaned up; the maps and retired fingerprints remain. This review completion does not satisfy the separate live movement gate.

In a live Fame match against OoPaul壞神oO v44, the Arena UI reported a defeat at tick 106 for replay `6ab867aee03513115f91edc0`. Two cached log responses contained game-state ticks 1–100 and 101–105 and exactly one `map-state` entry. The imported map `pain_and_gain_map_2026-09-27T00-50-14-071Z.json` contains all 10,000 terrain cells and seven ScoreFlags, with no creeps; all seven flags match the tick-1 state by ID, position, effect, and scoring rate. Both response manifest records linked to that map, including the response imported before the map arrived. Reimporting both unchanged responses created no additional map or manifest records. The reviewing task then explicitly completed both captures, so the utility removed their managed JSONL files while retaining the map. The cached responses do not establish whether the terminal tick produced a log.

The previous local `npm run check` and `npm test` runs passed (12 tests); these checks do not prove live Arena behavior. Earlier replays: Idle `6ab82f27e035135b5891e7b0` was reported as a victory at tick 1674 (8,180–0), and Katterton v1 `6ab8352ae03513193991e7f2` as a defeat at tick 70 (displayed 160–87). Movement and scoring were observed against Katterton; neither earlier replay had console entries.

In replay `6ab8419fe03513801491e8c6` against あぶらむし v3, the replay reported victory at tick 64 (130–0). Separately, its inspected full-match console contained consecutive pre-action `game-state` snapshots for ticks 1–63, enemy health loss, and no runtime-error entries. All 14 owned creeps stayed at full health in those snapshots, so that match offered no friendly-healing opportunity.

In replay `6ab84434e0351372bc91e8fe` against AlbaVika v1, the replay UI reported defeat at tick 72. With “Show current tick only” off, the console showed pre-action `game-state` entries for ticks 1–71 and no separate runtime-error entries. Owned `pg_player1_melee_1` rose from 990/1600 hits at tick 52 to 1134/1600 at tick 53. Owned `pg_player1_ranged_2` rose from 177/1200 at tick 64 to 249/1200 at tick 65 and 321/1200 at tick 66. At tick 66, owned `pg_player1_healer_3` was at (48,48), one tile from `ranged_2` at (47,48), with four functioning HEAL parts; the healer itself was damaged (936/1200), so self-healing was also possible. These health increases are observed recovery and consistent with healing, but the snapshots do not record issued heal actions, and the console view did not expose the complete tick 64–65 healer records. A specific heal action and its target therefore remain unconfirmed. The selected code-directory path was not independently visible in the replay view.

## Local replay-log importer

Before manually launching a match, run `npm run build-id:generate` after the last runtime-source edit, then `npm run build-id:check` immediately before launch. The latter only verifies: it fails if the generated module is missing, edited, or stale and never regenerates it. Confirm Arena selects this project's `src/` directory and leave its runtime files unchanged during the match. These commands do **not** control or attest to a manual Arena launch. The generated `src/debug/build-id.js` is imported by the loggers, so map, game-state, membership, action, CPU, and coverage records emit the running build ID.

The build ID is lowercase SHA-256 over all regular `.js` and `.mjs` files recursively under `src/`, sorted by project-relative POSIX path. For each file, hash its UTF-8 path, one NUL byte, its exact file bytes, and one NUL byte. `src/debug/build-id.js` itself is excluded to avoid circular hashing; `src/typings/` and non-JavaScript files are excluded, and source symlinks are rejected. The ID describes these source bytes, not Arena configuration or a match result. It is distinct from the map checksum and does not alter map deduplication.

The importer preserves each original tagged game-state JSONL line, stores its verified `buildId` on the response record, and associates it with the replay in `manifest.json`. Later tagged responses must agree; conflicting or internally mixed IDs are rejected and reported. Untagged legacy records remain usable with unknown provenance (`buildId` absent or null), even if a later tagged chunk identifies the replay. Never assign the current local ID to an older log. The manifest ID identifies only the tagged responses, not untagged historical chunks.

Run `node tools/replay-logs.js watch` from the project root, then manually open or start a replay in Arena. The standalone Node.js process scans the existing Arena cache at startup and polls it every two seconds for new or rewritten entries; stop it with Ctrl-C. `node tools/replay-logs.js scan` makes one pass. Both commands accept an optional cache-directory argument; the default is `~/Library/Application Support/screeps_arena/Cache/Cache_Data`. The tool does not control replay playback, run in Arena, or modify the cache.

The supported cache entry has Chromium simple-cache version 5 framing, a request key of `https://arena.screeps.com/api/game/<replay-id>/log/<tick>`, a gzip body, and trailing `content-length` and `content-encoding` metadata. The decompressed body is an object whose values are original console strings; Arena can join multiple console calls from one tick with a newline. The importer separates those calls, then saves valid `game-state`/`before-actions` strings unchanged, one per line, under project-relative `replay_logs/`. The usual filename is `<replay-id>.jsonl`; if that name is already occupied or reserved, a content-hash suffix prevents overwriting it. Unregistered reference captures remain user-owned. Non-game-state entries are kept separately in `replay_logs/manifest.json` and can be viewed with `other` below. Versioned membership, action, CPU, and coverage evidence is strictly validated and retained there as typed `otherEntries`; manifest `diagnosticCoverage` reports complete ticks, missing closures, sequence/count gaps, decision/attempt correlation issues, canonical duplicates, and conflicting record IDs. A response containing validated typed diagnostics but no game state is retained as an evidence-only manifest record with no JSONL; its zero game-state coverage does not imply an empty observed state, and its diagnostic gaps or missing closures remain unknown. Canonical comparison recursively sorts object keys while preserving array order and every value. Legacy captures remain readable with unknown diagnostic coverage, and M2/M3 closures retain their narrower meaning. Incomplete cache entries are retried up to five times per unchanged file state; malformed or unsupported replay-log responses are reported. A complete cached response is not proof of complete replay coverage, and a missing terminal-tick log is not automatically a defect.

When a response contains `map-state`, the importer validates its 100×100 terrain, arena metadata, and non-creep objects, then writes the map payload and a top-level `checksum` to `replay_logs/pain_and_gain_map_YYYY-MM-DDTHH-mm-ss-SSSZ.json` (UTC import time, milliseconds). The map ID and checksum are SHA-256 of the payload's canonical JSON plus a newline: recursively sorted object keys, unchanged array order, and only the top-level `checksum` excluded. The saved file must pass schema checks, and its embedded checksum, manifest checksum, and recalculated payload checksum must agree. If the name is occupied by different content, a hash suffix prevents overwrite; an identical validated map is reused across replays. `manifest.json` explicitly associates each replay with its own active map; no global active map is assumed. A game-state or typed-diagnostic response without a validated active map for its replay is deferred, then retried when that map arrives. Earlier chunks can therefore import after a later map-bearing chunk. Every created record carries `mapId`, `mapChecksum`, and `mapFile`; use `list` and `maps` to resolve its saved map. Do not infer a map for older unlinked captures. JSONL lines remain original game-state strings.

For existing registered maps without an embedded checksum, run `node tools/replay-logs.js upgrade-map-checksums` before importing. Under the manifest lock, it verifies each payload against its existing registration before atomically adding the field. It reports `updated`, `verified`, or `error` per map and exits unsuccessfully if any map fails; mismatched payloads or existing checksum fields are not repaired or overwritten. The command is safe to retry after interruption and does not change map identities, filenames, manifest contents, review state, or fingerprints, and does not import or clean up logs. Maps missing the field are rejected by normal validation until upgraded. The checksum detects content inconsistency, not authenticity against an attacker who can change both files and registrations.

Manifest version 2 has `maps` (validated registrations), `replays` (active associations and retired fingerprints), and `records`. File-backed imports use a transient `pending` state before JSONL publication and then `claim` while analysis is pending. Evidence-only records are atomically published directly as `claim`, with both `outputPath` and `outputFingerprint` set to `null`; existing file-backed records keep string values for both fields. `claim` is a record status, separate from the `claim` command that assigns review ownership to a task. Records retain source entry, replay ID, response fingerprint, map/build provenance, import time, game-state coverage, diagnostic coverage, other console entries, and review checkpoints. Pure map-only responses establish an association without creating a record. Completed records are removed; replay associations retain their fingerprints to prevent unchanged content from reimporting. `list` shows a null output path for evidence-only records, and `other` reads their retained entries normally. `migrate-status` converts existing `waiting` records to `claim` under the manifest lock without changing ownership, checkpoints, map links, or fingerprints. Normal importing, listing, and review commands also perform this migration. Empty version-1 manifests migrate automatically, but a nonempty version-1 manifest needs deliberate migration before using this importer. Captures, maps, and the manifest are ignored by Git. Use the replay ID and full fingerprint printed on import or by `list`:

```sh
node tools/replay-logs.js list
node tools/replay-logs.js maps
node tools/replay-logs.js upgrade-map-checksums
node tools/replay-logs.js migrate-status
node tools/replay-logs.js register-local <replay-id> <jsonl-filename>
node tools/replay-logs.js other <replay-id> <fingerprint>
node tools/replay-logs.js claim <replay-id> <fingerprint> <codex-task-id>
node tools/replay-logs.js examined <replay-id> <fingerprint> <codex-task-id>
node tools/replay-logs.js done <replay-id> <fingerprint> <codex-task-id>
```

### Managed replay-score sources

ADR 0005 Milestone 1 adds optional manifest-version-2 `scoreRecords` and
map-independent `retiredScoreSources`. These collections are separate from log
`records`: score sources do not imply game-state, diagnostic, map, or runtime
build evidence. Existing log writers round-trip the optional collections, while
log `list`, `scan`, `watch`, reconciliation, and cleanup neither display nor
manage them.

Import one explicitly identified Chromium cache file with `score-import`. The
only supported request keys are the exact Arena game-metadata URL and
`/replay/<game-time>` URL. Complete version-5 gzip transport is required; the
reader verifies the framed streams, EOF records, CRC-32 values, key hash when
present, one coherent HTTP status/header block, and any present HTTP content
length. The managed artifact is the exact
decompressed response body under the ignored
`replay_logs/replay-score-source-*.response` pattern. The record separately
stores the complete-cache-file hash, exact-response hash, and request-qualified
source fingerprint. Complete transport with malformed JSON, unsupported UI, or
partial frames is still retained with layered validation and nullable or partial
coverage. Retention alone never establishes valid scores or full replay
coverage.

Per-source coverage represents missing `gameTime` values as compact inclusive
ranges, keeping calculation and storage bounded by observed frames. Existing
numeric gap arrays remain readable through comparison-time normalization and
are not rewritten. Older score-aware tooling must be upgraded before managing
new records with nonempty compact ranges; log-only tooling continues to preserve
the optional collections without interpreting them.

Score publication uses `pending` then `claim`. Review ownership is explicit and
score-specific. `score-done` records completion but does not remove evidence;
only the separately invoked exact-record `score-cleanup` can persist
`retiring`, verify/delete the managed response, publish a top-level tombstone,
and remove the record. Retry the same exact import for pending publication or
the same exact cleanup after interruption. Do not use log reconciliation for
score recovery.

```sh
node tools/replay-logs.js score-import <cache-file>
node tools/replay-logs.js score-claim <replay-id> <fingerprint> <codex-task-id>
node tools/replay-logs.js score-verify <replay-id> <fingerprint>
node tools/replay-logs.js score-examined <replay-id> <fingerprint> <codex-task-id>
node tools/replay-logs.js score-done <replay-id> <fingerprint> <codex-task-id>
node tools/replay-logs.js score-cleanup <replay-id> <fingerprint>
```

Milestone 1 does not itself interpret retained score sources. ADR 0005
Milestone 2 adds explicit-fingerprint, read-only analysis without changing the
retention or review lifecycle.

For replay `6abd7222b72ca0c20fa0bce2`, Milestone 1 retained and hash-verified
the inventoried metadata source and all 17 inventoried replay-frame sources
through `gameTime` 1536. They remain claimed and examined with review
completion unset; no score cleanup has run. The frame-zero source has complete
frame structure but missing scoring items, so this retention result does not
claim valid scoring observations for that source or complete analysis coverage.

### Read-only deterministic analysis

For the scoped scout hold-to-release review, claim each managed log fingerprint
with a unique review task ID, then run:

```sh
npm run scout-hold:screen -- <replay-id> <codex/task-id> <expected-build-id>
node --test tests/unit/scout-hold.test.js tests/unit/scout-hold-flow.test.js tests/unit/scout-hold-screen.test.js
```

The screen requires every selected log record to carry the expected build and a
claim for that task. It runs the existing compact analyzer before interpreting
runtime decisions and snapshots. Its ignored cache at
`replay_logs/analysis_cache/scout-hold-<replay-id>.json` is keyed by selected
response fingerprints and bytes, diagnostic content/coverage, linked map bytes,
analyzer/tool code, local build identity, and configuration. A changed input
recomputes the report. It records hold decisions, off-flag holds, guard
violations, and consecutive-tick releases with their exact log fingerprints;
command returns and later positions remain separate observations. A missing
transition remains unexercised. Mark records `examined` after reading the
report; leave claims active while the experiment remains open.

After using the external review workflow to claim every managed response in the
intended scope, analyze all current records for a replay with:

```sh
npm run replay:analyze -- <replay-id>
```

Append one or more full response fingerprints to restrict the report to those
log records. To analyze scoring evidence, append `--score` and one or more full
score-source fingerprints:

```sh
npm run replay:analyze -- <replay-id> [log-fingerprint...] --score <score-fingerprint...>
```

The CLI emits a compact report by default. Append `--full-detail` anywhere after
the replay ID to reproduce the exhaustive finding/evidence contract:

```sh
npm run replay:analyze -- <replay-id> [log-fingerprint...] \
  --score <score-fingerprint...> --full-detail
```

Score selection is always explicit; omitting `--score` preserves log-only
analysis. Compact output retains exact selection, coverage, finding totals,
status/provenance summaries, every scoring measurement and difference, and
event eligibility. It replaces repeated finding evidence and ambiguous
alignment contributor chains with exact counts, ranges, stable references, and
labeled representative samples. Use the same explicit selection with
`--full-detail` whenever every finding, candidate, observation provenance chain,
or event record is required. Programmatic callers remain compatible:
`analyzeReplay()` defaults to `reportMode: "full"` and may explicitly request
`"compact"`.

The analyzer verifies exact managed response bytes and stored
Milestone 1 summaries, constructs source-qualified local segments, and groups
only complete exact-overlap components without same-source boundaries or
ordering cycles. Ambiguous bridges, unrelated repeated times, conflicts, gaps,
and decreases remain explicit and suppress only dependent conclusions.

Direct `cumulativeScore` and `displayedGain` remain distinct. A
`derivedScoreChange` is emitted only for consecutive compatible observations;
its status explains initial, gap, missing-score, conflict, decrease, or derived
continuity. Ours/opponent labels require stable replay-object identities whose
`user: "player1"`/`"player2"` slots agree with selected runtime snapshots or
with the separately validated production metadata reference chain. The analyzer
accepts `_id` only on the documented typed production object/`ScoreFlag` shapes;
simultaneous identity or flag representations must agree, including explicit
empty collections, while malformed present representations keep dependent
results unknown or conflicting. Nested metadata uses
current-user, user, code, and `usersCode` references, never usernames or raw
array position, and applies only to groups that independently contain both slot
labels. This analyzer compatibility result does not rewrite the retained source
or its stored validation summary.
Tick alignment independently requires exactly one offset supported by at least
two matching frame/snapshot pairs without a structural gap or conflicting frame
across the supporting interval. Build association comes only from the snapshots
that actually support that offset; legacy or mixed-build contributors cannot
borrow provenance from unrelated selected records. Objective and escort-decision
associations require mapping, alignment, and compatible tagged evidence and make
no causal or strategic-benefit claim. Selected frames never establish terminal
match state by themselves.

The analyzer reads `manifest.json` directly; it does not call `list`,
reconcile cleanup, change claims/checkpoints, or write a report file. It supports
file-backed and evidence-only records, revalidates raw evidence rather than
trusting stored summaries, merges canonical overlaps, and emits stable JSON to
stdout. Its incremental writer awaits each submitted write, rejects output
errors or premature closure, and never ends a caller-owned stream. The analysis
still materializes parsed evidence, timelines, score progression, comparisons,
and event analysis. Compact mode avoids retaining exhaustive findings and all
ambiguous-candidate contributor chains; streaming avoids an additional
process-sized JSON string in both modes. Save or redirect output separately if
the review requires a report artifact, then use `examined` and `done` only
through the documented lifecycle.

Every finding identifies its evidence and build provenance and uses `pass`,
`fail`, or `unknown`. M2 closures support membership only; legacy evidence keeps
unknown provenance; missing/incomplete/conflicting evidence stays unknown for
dependent conclusions. Complete current coverage reports raw elapsed tick CPU,
the applicable limit, and derived sampling-point headroom; older closures leave
CPU availability unknown. Complete M3 action coverage also requires the expected
movement/healing/combat decision for every owned same-tick actor; covered zero
actions require a known empty owned roster. Attempts distinguish accepted
scheduling (`0`), rejected scheduling (nonzero), and unavailable numeric results
(`null`). Movement and health comparisons use consecutive compatible-build
snapshots only. `OK` is scheduling evidence, stationary movement is an
observation rather than an engine failure, and health changes are not attributed
to attacks or healing. See [deterministic replay analysis](docs/architecture/replay-analysis.md).

When the optional scout experiment is enabled, relevant planning ticks emit a compact
`flag-allocation` JSON console entry with the runtime `buildId`. It records the
allocator event (`assign`, `reject`, `retain`, `cancel`, or `complete`), reason,
scout/flag IDs where applicable, resulting state and fallback objective, plus
evaluated route lengths/costs/completeness and enemy-arrival comparisons. These
are planning diagnostics, not issued commands or proof of movement/capture. The
eligibility rule requires enemy arrival to exceed scout route steps plus five;
equality rejects the target. The importer retains them as typed `otherEntries`
in the manifest; retrieve them with `other` after claiming the managed capture.
JSONL remains game-state only.
Older captures without this entry have unknown allocator decisions and route
results. Consecutive identical route-free rejections are collapsed; game-state
snapshots still cover those ticks. Missing diagnostics in disabled-mode captures
are expected.

When the healer escort experiment is enabled, `healer-escort` JSON console
entries record the build-tagged assignment or release and an assigned-healer
`hold`, `fatigue-pause`, or `move-attempt`. A move attempt includes the actual
`moveTo` target and return code; `OK` does not prove displacement. The importer
keeps these as typed manifest `otherEntries`, accessible with `other` after a
review claim, while JSONL remains game-state only. Older captures cannot
establish unlogged escort decisions. Live escort behavior has not yet been
verified.

Before examining a managed response, use `claim` with a task identifier unique to that review. Its public record status remains `claim`; `examinedAt` is an internal checkpoint, not another public status. Save evidence and recommendations in Markdown, then use `examined` after reading and `done` only when that task's analysis is complete (`complete` remains an alias). All ownership claims must have both checkpoints before the record becomes `done`. Cleanup verifies and deletes the managed JSONL when one exists, removes the manifest record, and retains the map, replay association, and retired fingerprint. Evidence-only cleanup has no file to verify or delete. The separate live gate for a proposed game-code change does not delay completion of an otherwise finished review. No time limit or process exit implies completion. The importer refuses to delete changed content, a symlink, an unmanaged capture, or a path outside `replay_logs/`. Interrupted completed reviews are reconciled on the next `scan`, `watch`, or `list`. Pending file-backed imports require the source response to remain in the cache for recovery.

For manually supplied JSONL already inside project-relative `replay_logs/`, `register-local` explicitly adopts a safe `<replay-id>.jsonl` or `<replay-id>-<hex>.jsonl` filename for managed review and later cleanup. Use it only when the replay identity has been independently established: JSONL itself contains no replay ID. The command requires that replay's existing active association to a checksum-validated map, checks every game's static flag IDs, positions, effects, and rates against that map, validates each game-state line, and records a content fingerprint and `claim` status. A filename or nearby map is not sufficient provenance. Unknown replay/map associations or unsupported manual map registration remain blocked until verified source evidence is available. Manual JSONL cannot establish whether other console entries or missing terminal ticks existed. An unchanged manual capture that was completed is not registered again, even if a copy reappears; that new copy remains unmanaged. Only explicitly registered local files become eligible for managed cleanup.

In an earlier live monitoring check, opening replay `6ab85550e03513394c91eb0d` produced three cached responses reporting ticks 1–100, 101–200, and 201–235. The first response's 100 imported JSONL records exactly matched its cache payload and the manifest output hash. A watcher restart retained its review claim and deduplicated unchanged content; after explicit examination and completion, the utility deleted only that managed capture and did not reimport it on another restart. The later two captures were not independently examined. These response ranges do not prove complete replay coverage. The later [M5 checkpoint](docs/architecture/replay-validation-2026-09-30.md) verifies a scoped two-response version-2 map-linked import and retained review; it did not exercise watcher reconciliation or cleanup.
