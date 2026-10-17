# Scoped secondary health readiness — inactive integration (2026-10-17)

Build: `0bec72b13084579ea07b3e2d3d15b260f8c141a3d5e06317db4253528cbb391f`.
Starting build: `79790451f2c07eebd62902ffb77d5b7618fdd97ef5a9d9d93a2314a70e74e094`.
Secondary objectives and healer useful closing remain disabled. Other switches,
including escort enabled, are unchanged. The pending frozen-build retreat trial
was completed/reviewed before this task; no replay was read for integration.

## One predicate, unchanged defence membership

Promote the [accepted comparison](secondary-scoped-readiness-test-only-2026-10-17.md)
at the existing health gate in `src/strategy/objectives.js`. Full health is
required for the union of the departing squad and every living non-member
within centre range3 who is not unavailable to this controller. The latter is
exactly the existing production retained-defence set, including unarmed or
surplus actors. No healthy subset is selected. Relevant injury still returns
`army-injured`; an outsider's injury alone no longer does.

Keep original HP, body parts and all roster entries. Validate complete supported
observations first, including outsiders. Functioning MOVE/weapons/HEAL, fatigue,
healing access, retained armed quorum, centre/group danger, controller ownership,
route/arrival limits, utility and all remaining guards retain their order and
meaning. Active capture and shared contest readiness use the same predicate.
Remove `tests/fixtures/secondary-scoped-health-candidate.js`; its in-memory
source variant is no longer needed. The 27 comparison cases now import the
production selector and shared readiness caller directly.

This is a deliberate policy-scope change, not a newly discovered bug in the
earlier blanket-health contract or proof that historical rejected squads could
safely depart. Actual outsider injuries still affect ordinary healing selection
and the whole-army utility capacities; no values are repaired or ignored.

## Support demand and spent attempts

Positional non-membership is not proof of unrelated healing demand. Existing
movement preflight runs before objective commands. If an injured outsider needs
the departing healer, ordinary ranged-healing/hold or support approach takes
precedence and the assignment finishes with `capture-movement-priority`.
Ordinary healing/approach then executes; no objective direct step is issued.
The original start and spent attempt persist even if that outsider is healthy
on the next observation. Terminal diagnostics intentionally clear active member
IDs; pinned squad identity and attempted-query actors remain available.

There is no added wait, refresh, query, route, state, switch or second attempt.
Capture/contest share the existing 24 acquisition / 4 refresh query caps,
maxOps1000 per query, 40-cell routes, four unchanged observations and original
60-tick deadline. Higher-priority movement, partial-step support preflight,
capture handoff and reviewed support-aware adjacent retreat are unchanged.

## Generated verification

Before promotion, the new selector and real tick-flow expectations fail:
`army-injured` / `no-eligible-squad` instead of selection, and idle instead of
support-priority termination. The exact disabled injured-outsider command trace
already passes. After promotion:

- 27 scoped production checks pass: full preset rosters, unrelated/multiple
  injuries, every departing and retained actor, inclusive defence radius,
  unavailable membership, independent danger/capability/support/route guards,
  malformed outsiders, ownership, deadlines/spent state and deterministic
  renaming/permutations/reflections.
- 60 generated real tick-flow checks pass, including three added checks for
  remote-injury direct travel, needy-outsider cancellation/spent state, and
  disabled healing/movement equivalence. Existing capture/contest/handoff,
  refresh budgets, movement priority and partial displacement checks are reused.
- 26 explicitly allowlisted generated selector checks pass. The two callbacks
  named `reviewed ...` are excluded; the allowlist cannot match the empty root
  name. No historical-fixture reader runs in this task.

One initial post-promotion assertion expected terminal diagnostics to retain
active member IDs. Existing diagnostics intentionally emit an empty list once
finished. The regression now verifies pinned squad membership and query actors
instead, without a runtime or diagnostic change. Its earlier failure is retained.

Build generation, build verification, `npm run check`, diff and whitespace review
are recorded in the receipt. Unchanged retreat, combat, healing and escort
implementations retain accepted validation; they are not redundantly rerun.

## Limits and handoff

Generated routes/positions are inputs, not Arena terrain, arbitration, movement,
damage, capture or survival evidence. Narrowing health scope can admit more
otherwise compliant candidates but does not establish sufficient combat healing
or future retained-defence safety. Conservative support and route gates may
still prevent departure. No strategic benefit or activation is claimed.

Keep experiments disabled. No further match or investigation is implied.
Task-local before-copies, failing/passing results, source/hash preservation and
reviewed diff are retained in:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-scoped-readiness-integration-20261017-9I4dov/report.json`.
