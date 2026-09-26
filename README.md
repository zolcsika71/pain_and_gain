# Pain and Gain

Screeps Arena code for the Pain and Gain arena. The current strategy sends every owned creep toward the first ScoreFlag returned by the game API.

## Layout

- `src/main.mjs` exports Arena's `loop()` entry point.
- `src/loop.js` orchestrates each tick.
- `src/arena/observe.js` reads flags and owned creeps from the game API.
- `src/strategy/objectives.js` selects the first flag.
- `src/arena/execute.js` issues `moveTo` for each owned creep.
- `tests/unit/` contains local decision and action regression tests.
- `docs/architecture/`, `docs/decisions/`, and `docs/diagrams/` hold architecture notes, ADRs, and PlantUML diagrams.

Additional strategy, squad, tactical, state, config, and debug modules can be added when they have behavior to own.

## Development

With Node.js available, run `npm run check` to parse the game modules and `npm test` to run the local tests. There are no package dependencies or build step. The `package.json` ES module setting applies to local Node.js tooling; Arena loads the source files directly.

In the Screeps Arena client, set this arena's code directory to the project's `src/` directory, which contains `main.mjs`. Keep all local imports within `src/`. The current project checks do not execute an Arena match, so confirm module loading and movement in the client after selecting the directory.

Game rules are in `docs/pain_and_gain_rules.md`. The API and squad references are in `docs/architecture/`; code examples are in `docs/examples/`.
