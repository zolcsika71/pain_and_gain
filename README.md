# Pain and Gain

Screeps Arena code for the Pain and Gain arena. Every owned creep moves toward the first ScoreFlag returned by the game API and uses available attacks or healing against in-range targets.

## Layout

- `src/main.mjs` exports Arena's `loop()` entry point.
- `src/loop.js` orchestrates each tick.
- `src/arena/observe.js` reads flags, owned creeps, enemies, and damaged allies from the game API.
- `src/strategy/objectives.js` selects the first flag.
- `src/arena/execute.js` issues movement and tactical actions for each owned creep.
- `src/tactics/` checks functioning body parts, chooses deterministic in-range targets, and selects compatible healing and combat actions.
- `src/debug/game-state.js` writes one JSON game-state snapshot per tick and one map snapshot per match before actions.
- `tests/unit/` contains local decision and action regression tests.
- `docs/architecture/`, `docs/decisions/`, and `docs/diagrams/` hold architecture notes, ADRs, and PlantUML diagrams.

Additional strategy, squad, state, and config modules can be added when they have behavior to own.

## Development

With Node.js available, run `npm run check` to parse the game modules and `npm test` to run the local tests. There are no package dependencies or build step. The `package.json` ES module setting applies to local Node.js tooling; Arena loads the source files directly.

In the Screeps Arena client, set this arena's code directory to the project's `src/` directory, which contains `main.mjs`. Keep all local imports within `src/`. The current project checks do not execute an Arena match, so confirm module loading and movement in the client after selecting the directory.

Game rules are in `docs/pain_and_gain_rules.md`. The API and squad references are in `docs/architecture/`; code examples are in `docs/examples/`.

## Per-tick console output

Every tick emits one compact JSON line with `type: "game-state"` and the Arena tick number. It includes the selected flag ID, all observed creeps (ID, ownership, position, health, fatigue, and functioning body-part counts), and flags (ID, position, ownership, effect, and score per tick). Flag ownership is `me`, `enemy`, or `neutral`. Flag scoring rates are not accumulated match scores.

Snapshots are logged before movement and combat commands. Compare consecutive ticks by creep ID to inspect health changes; those changes alone do not establish which attack or heal caused them. Logging is enabled every tick without sampling. In the Arena console, use the current-tick filter to inspect one snapshot or disable it to see the tick history. Live log observations are recorded in the verification checkpoint below.

On the first successful tick, the logger also emits one `map-state` JSON entry with its capture tick before the game-state entry. It samples the documented 100×100 terrain grid and all objects returned by `getObjects()` except creeps, including their available serializable data and public flag fields. This is a starting-map snapshot, not a later ownership history; per-tick flag ownership remains in `game-state`. A terminal tick is not a reliable capture point because matches can end early. A failed map read is reported to the console and retried on at most two subsequent ticks without stopping game actions.

## Verification checkpoint

In a live Fame match against OoPaul壞神oO v44, the Arena UI reported a defeat at tick 106 for replay `6ab867aee03513115f91edc0`. Two cached log responses contained game-state ticks 1–100 and 101–105 and exactly one `map-state` entry. The imported map `pain_and_gain_map_2026-09-27T00-50-14-071Z.json` contains all 10,000 terrain cells and seven ScoreFlags, with no creeps; all seven flags match the tick-1 state by ID, position, effect, and scoring rate. Both response manifest records linked to that map, including the response imported before the map arrived. Reimporting both unchanged responses created no additional map or manifest records. The reviewing task then explicitly completed both captures, so the utility removed their managed JSONL files while retaining the map. The cached responses do not establish whether the terminal tick produced a log.

The previous local `npm run check` and `npm test` runs passed (12 tests); these checks do not prove live Arena behavior. Earlier replays: Idle `6ab82f27e035135b5891e7b0` was reported as a victory at tick 1674 (8,180–0), and Katterton v1 `6ab8352ae03513193991e7f2` as a defeat at tick 70 (displayed 160–87). Movement and scoring were observed against Katterton; neither earlier replay had console entries.

In replay `6ab8419fe03513801491e8c6` against あぶらむし v3, the replay reported victory at tick 64 (130–0). Separately, its inspected full-match console contained consecutive pre-action `game-state` snapshots for ticks 1–63, enemy health loss, and no runtime-error entries. All 14 owned creeps stayed at full health in those snapshots, so that match offered no friendly-healing opportunity.

In replay `6ab84434e0351372bc91e8fe` against AlbaVika v1, the replay UI reported defeat at tick 72. With “Show current tick only” off, the console showed pre-action `game-state` entries for ticks 1–71 and no separate runtime-error entries. Owned `pg_player1_melee_1` rose from 990/1600 hits at tick 52 to 1134/1600 at tick 53. Owned `pg_player1_ranged_2` rose from 177/1200 at tick 64 to 249/1200 at tick 65 and 321/1200 at tick 66. At tick 66, owned `pg_player1_healer_3` was at (48,48), one tile from `ranged_2` at (47,48), with four functioning HEAL parts; the healer itself was damaged (936/1200), so self-healing was also possible. These health increases are observed recovery and consistent with healing, but the snapshots do not record issued heal actions, and the console view did not expose the complete tick 64–65 healer records. A specific heal action and its target therefore remain unconfirmed. The selected code-directory path was not independently visible in the replay view.

## Local replay-log importer

Run `node tools/replay-logs.js watch` from the project root, then manually open or start a replay in Arena. The standalone Node.js process scans the existing Arena cache at startup and polls it every two seconds for new or rewritten entries; stop it with Ctrl-C. `node tools/replay-logs.js scan` makes one pass. Both commands accept an optional cache-directory argument; the default is `~/Library/Application Support/screeps_arena/Cache/Cache_Data`. The tool does not control replay playback, run in Arena, or modify the cache.

The supported cache entry has Chromium simple-cache version 5 framing, a request key of `https://arena.screeps.com/api/game/<replay-id>/log/<tick>`, a gzip body, and trailing `content-length` and `content-encoding` metadata. The decompressed body is an object whose values are original console strings; Arena can join multiple console calls from one tick with a newline. The importer separates those calls, then saves valid `game-state`/`before-actions` strings unchanged, one per line, under project-relative `replay_logs/`. The usual filename is `<replay-id>.jsonl`; if that name is already occupied or reserved, a content-hash suffix prevents overwriting it. The pre-existing reference capture remains user-owned. Non-game-state entries are kept separately in `replay_logs/manifest.json` and can be viewed with `other` below. Incomplete entries are retried up to five times per unchanged file state; malformed or unsupported replay-log responses are reported. A complete cached response is not proof of complete replay coverage, and a missing terminal-tick log is not automatically a defect.

When a response contains `map-state`, the importer validates its 100×100 terrain, arena metadata, and non-creep objects, then writes only the map content as JSON to `replay_logs/pain_and_gain_map_YYYY-MM-DDTHH-mm-ss-SSSZ.json` (UTC import time, milliseconds). The map ID and checksum are SHA-256 of canonical map JSON plus a newline. The saved file is checked against both schema and checksum. If the name is occupied by different content, a hash suffix prevents overwrite; an identical validated map is reused across replays. `manifest.json` explicitly associates each replay with its own active map; no global active map is assumed. A response without a validated active map for its replay is deferred without creating JSONL, then retried when that map arrives. Earlier chunks can therefore import after a later map-bearing chunk. Every created log record carries `mapId`, `mapChecksum`, and `mapFile`; use `list` and `maps` to resolve its saved map. Do not infer a map for older unlinked captures. JSONL lines remain original game-state strings.

Manifest version 2 has `maps` (validated registrations), `replays` (active associations and retired fingerprints), and `records` (waiting or pending log imports). Records include source entry, replay ID, content fingerprint, output path and hash, map reference, import time, tick coverage, other console entries, and review state. Map-only responses establish an association without creating a log record. Completed log records are removed; replay associations retain only their fingerprints to prevent unchanged cache content from reimporting. Empty version-1 manifests migrate automatically, but a nonempty version-1 manifest needs deliberate migration before using this importer. Captures, maps, and the manifest are ignored by Git. Use the replay ID and full fingerprint printed on import or by `list`:

```sh
node tools/replay-logs.js list
node tools/replay-logs.js maps
node tools/replay-logs.js other <replay-id> <fingerprint>
node tools/replay-logs.js claim <replay-id> <fingerprint> <codex-task-id>
node tools/replay-logs.js examined <replay-id> <fingerprint> <codex-task-id>
node tools/replay-logs.js done <replay-id> <fingerprint> <codex-task-id>
```

Claim before a Codex task examines a log, using a task identifier unique to that review. New logs are `waiting`, even while claimed. These commands require explicit invocation; the utility does not connect to Codex or discover task completion automatically. Record `examined` only after the task has actually read it, then call `done` only when that task's analysis is explicitly finished (`complete` remains an alias). A log becomes `done` only after every claiming task has recorded both steps. Cleanup then deletes that managed JSONL and its manifest record, retaining the map, replay association, and retired fingerprint; an active claim retains the log. No time limit or process exit implies completion. The importer refuses to delete a changed file, a symlink, an unmanaged pre-existing capture, or a path outside `replay_logs/`. Interrupted completed reviews are reconciled on the next `scan`, `watch`, or `list`. After an interrupted writer, an abandoned manifest lock can be recovered once it is over 30 seconds old; a running owner retains its lock. Pending imports require the source response to remain in the cache for recovery.

In an earlier live monitoring check, opening replay `6ab85550e03513394c91eb0d` produced three cached responses reporting ticks 1–100, 101–200, and 201–235. The first response's 100 imported JSONL records exactly matched its cache payload and the manifest output hash. A watcher restart retained its review claim and deduplicated unchanged content; after explicit examination and completion, the utility deleted only that managed capture and did not reimport it on another restart. The later two captures were not independently examined. These response ranges do not prove complete replay coverage. The version-2 map-gated lifecycle described above has not been verified in a live match.
