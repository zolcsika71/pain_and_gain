# Project layout

The Screeps Arena client loads `src/main.mjs` from the selected `src/` code directory and calls its exported `loop()` once per tick. This entry point delegates to `runTick()` in `src/loop.js`.

The current tick flow is:

1. `src/arena/observe.js` calls `getObjectsByPrototype` for ScoreFlags and Creeps, then filters the creeps to those with `my` set.
2. `src/strategy/objectives.js` selects the first ScoreFlag in the returned order.
3. `src/arena/execute.js` calls `moveTo` on each owned creep with that flag.

The modules issue the actions intended by the original sample loop, whose nested declarations were invalid JavaScript. They do not maintain match state, pair units, form squads, fight, heal, retreat, or draw overlays. Those modules belong under the requested `src/` folders only when the corresponding behavior is introduced.

Local Node.js tests import the pure selection and execution modules. Arena-specific imports stay in `observe.js`; `package.json` and Node.js test APIs are for local tooling only. Relative imports remain inside `src/`, because Arena uses the directory containing `main.mjs` as the code root.
