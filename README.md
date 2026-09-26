# Pain and Gain

Screeps Arena code for the Pain and Gain arena. Every owned creep moves toward the first ScoreFlag returned by the game API and uses available attacks or healing against in-range targets.

## Layout

- `src/main.mjs` exports Arena's `loop()` entry point.
- `src/loop.js` orchestrates each tick.
- `src/arena/observe.js` reads flags, owned creeps, enemies, and damaged allies from the game API.
- `src/strategy/objectives.js` selects the first flag.
- `src/arena/execute.js` issues movement and tactical actions for each owned creep.
- `src/tactics/` checks functioning body parts, chooses deterministic in-range targets, and selects compatible healing and combat actions.
- `src/debug/game-state.js` writes one JSON game-state snapshot to the console every tick before actions.
- `tests/unit/` contains local decision and action regression tests.
- `docs/architecture/`, `docs/decisions/`, and `docs/diagrams/` hold architecture notes, ADRs, and PlantUML diagrams.

Additional strategy, squad, state, and config modules can be added when they have behavior to own.

## Development

With Node.js available, run `npm run check` to parse the game modules and `npm test` to run the local tests. There are no package dependencies or build step. The `package.json` ES module setting applies to local Node.js tooling; Arena loads the source files directly.

In the Screeps Arena client, set this arena's code directory to the project's `src/` directory, which contains `main.mjs`. Keep all local imports within `src/`. The current project checks do not execute an Arena match, so confirm module loading and movement in the client after selecting the directory.

Game rules are in `docs/pain_and_gain_rules.md`. The API and squad references are in `docs/architecture/`; code examples are in `docs/examples/`.

## Per-tick console output

Every tick emits one compact JSON line with `type: "game-state"` and the Arena tick number. It includes the selected flag ID, all observed creeps (ID, ownership, position, health, fatigue, and functioning body-part counts), and flags (ID, position, ownership, effect, and score per tick). Flag ownership is `me`, `enemy`, or `neutral`. Flag scoring rates are not accumulated match scores.

Snapshots are logged before movement and combat commands. Compare consecutive ticks by creep ID to inspect health changes; those changes alone do not establish which attack or heal caused them. Logging is enabled every tick without sampling. In the Arena console, use the current-tick filter to inspect one snapshot or disable it to see the tick history. This logging change is locally tested; it has not yet been run in Arena.

## Verification checkpoint

`npm run check` and `npm test` passed (7 unit tests). With `src/` selected in Arena, Idle replay `6ab82f27e035135b5891e7b0` ended in victory at tick 1674 (8,180–0). The active match against Katterton v1, replay `6ab8352ae03513193991e7f2`, ended in defeat at tick 70 (displayed score 160–87); movement and flag scoring were observed. Neither replay had entries in the full-match console. Enemy damage and friendly healing were not confirmed from the replay, so both remain live-verification checks; the replay also did not establish which flag was first in the API's returned order.
