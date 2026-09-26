# ADR 0001: Keep Arena source modular without a build step

Status: Accepted

## Context

The project started with a single root `main.mjs` containing the intended sample strategy. Its nested `import` and `export` declarations made it syntactically invalid. The project needs a clear Arena entry point and room for future strategy work without introducing unused modules or a compilation pipeline.

## Decision

Place the Arena entry point at `src/main.mjs` and select `src/` as the Arena code directory. Use relative ES module imports for plain `.js` implementation files. Split the current behavior into tick orchestration, game observation, first-flag selection, and action execution. Add further modules only when they own actual behavior. Use Node.js with `type: module` for local syntax checks and tests; this package setting does not configure Arena.

## Consequences

The entry point and all of its local dependencies live under the Arena code directory. The existing target and movement choices remain unchanged. Local tests can cover pure logic, while API loading and in-match behavior require a client run. No bundler or package dependencies are needed for the current source.
