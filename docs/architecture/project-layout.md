# Project layout

The Screeps Arena client loads `src/main.mjs` from the selected `src/` code directory and calls its exported `loop()` once per tick. This entry point delegates to `runTick()` in `src/loop.js`.

The current tick flow is:

1. `src/arena/observe.js` reads the tick number with `getTicks()`, calls `getObjectsByPrototype` for ScoreFlags and Creeps, retains all observed creeps for logging, then separates owned creeps, living enemies, and damaged living allies.
2. `src/strategy/objectives.js` selects the first ScoreFlag in the returned order.
3. On the first successful tick, `src/arena/observe.js` samples the 100×100 terrain and all non-creep game objects; `src/debug/game-state.js` emits one `map-state` JSON line. It then emits one `game-state` line on every tick with the tick, selected flag ID, creep ownership/positions/health/fatigue/functioning body-part counts, and flag ownership/effects/scoring rates. Both are before actions. The map is an initial snapshot and does not retain later ownership changes.
4. `src/arena/execute.js` calls `moveTo` on each owned creep with that flag.
5. `src/tactics/healing.js` and `src/tactics/combat.js` select eligible actions, which `src/arena/execute.js` issues for each owned creep after movement.

The log is an observation before this tick's actions, not a report of their results. Health changes across ticks do not by themselves prove action causality. Logging does not change target selection or action order.

`src/tactics/body.js` checks for functioning body parts (`hits > 0`). `src/tactics/targets.js` chooses the nearest in-range target, breaking equal-range ties by ID and then observation order. A damaged healer heals itself first; otherwise it heals the nearest damaged ally within range 1 or uses `rangedHeal` within range 3. Available healing takes priority over conflicting attacks: `heal` can accompany `rangedAttack`, but not `attack`; `rangedHeal` excludes both attacks. Without healing, adjacent creeps with both attack parts can use both attacks. There is no chasing or combat-driven movement: every owned creep still moves toward the first flag each tick.

The bot does not maintain match state, pair units, form squads, retreat, or draw overlays. Those modules belong under the requested `src/` folders only when the corresponding behavior is introduced.

Local Node.js tests import the pure selection and execution modules. Arena-specific imports stay in `observe.js`; `package.json` and Node.js test APIs are for local tooling only. Relative imports remain inside `src/`, because Arena uses the directory containing `main.mjs` as the code root.

## Local replay imports

`tools/replay-logs.js` is a separate Node.js CLI outside the Arena code directory. It reads cached replay-log responses at startup and polls for changes while the user controls replay playback. Request metadata establishes replay identity; supported version-5 cache framing and gzip payloads yield the original console JSON strings. Arena may join multiple console calls from one tick with a newline; the importer separates and validates each before preserving game-state strings in JSONL. Distinct response contents receive separate captures under `replay_logs/`, with hash suffixes when the replay's canonical filename is occupied. A response's observed tick range does not establish full replay coverage.

The importer extracts the creep-free `map-state` entry, saves its map content as JSON under `replay_logs/pain_and_gain_map_<UTC-date>.json`, and registers its canonical SHA-256 checksum and map ID in manifest version 2. A map is validated only when its saved file passes schema and checksum checks. Identical content reuses a validated registration even across replays. Each replay has its own explicit active map association; there is no global active map. A game-state response arriving before its replay's map is deferred, not written as JSONL, and retried when the map arrives. Every imported record names its map ID, checksum, and file. The JSONL preserves only original game-state console strings. No map is inferred for older unlinked captures.

`replay_logs/manifest.json` has `maps`, `replays`, and `records` collections. Waiting records retain source fingerprint, output ownership and hash, coverage, other console entries, and per-task review state. Pending imports are recorded before atomic file publication so a retry can finish an interrupted import. Manifest updates and cleanup share a process lock. Claims retain captures until every claiming task explicitly records examination and completion. Only then does the record become `done`; cleanup checks the managed path and content hash before deleting the JSONL and its record. Map files and registrations remain. A replay association retains retired fingerprints to prevent unchanged cache responses from reimporting, but not the deleted log's review history. Existing reference files are never adopted for cleanup. Empty version-1 manifests migrate automatically; nonempty version-1 manifests require deliberate migration before using this importer. CLI commands and format limitations are documented in `README.md`.
