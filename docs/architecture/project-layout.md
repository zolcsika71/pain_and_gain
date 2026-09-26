# Project layout

The Screeps Arena client loads `src/main.mjs` from the selected `src/` code directory and calls its exported `loop()` once per tick. This entry point delegates to `runTick()` in `src/loop.js`.

The current tick flow is:

1. `src/arena/observe.js` calls `getObjectsByPrototype` for ScoreFlags and Creeps, then separates owned creeps, living enemies, and damaged living allies.
2. `src/strategy/objectives.js` selects the first ScoreFlag in the returned order.
3. `src/arena/execute.js` calls `moveTo` on each owned creep with that flag.
4. `src/tactics/healing.js` and `src/tactics/combat.js` select eligible actions, which `src/arena/execute.js` issues for each owned creep after movement.

`src/tactics/body.js` checks for functioning body parts (`hits > 0`). `src/tactics/targets.js` chooses the nearest in-range target, breaking equal-range ties by ID and then observation order. A damaged healer heals itself first; otherwise it heals the nearest damaged ally within range 1 or uses `rangedHeal` within range 3. Available healing takes priority over conflicting attacks: `heal` can accompany `rangedAttack`, but not `attack`; `rangedHeal` excludes both attacks. Without healing, adjacent creeps with both attack parts can use both attacks. There is no chasing or combat-driven movement: every owned creep still moves toward the first flag each tick.

The bot does not maintain match state, pair units, form squads, retreat, or draw overlays. Those modules belong under the requested `src/` folders only when the corresponding behavior is introduced.

Local Node.js tests import the pure selection and execution modules. Arena-specific imports stay in `observe.js`; `package.json` and Node.js test APIs are for local tooling only. Relative imports remain inside `src/`, because Arena uses the directory containing `main.mjs` as the code root.
