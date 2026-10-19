# One-shot opening route substitution — test only

## Status and scope

Retain as a test-only comparison, **not for runtime promotion**. The retained
Arena alternative removes one local conflict. Under favorable supplied outcomes
it also enables eight supported command/observation batches, but the unchanged
ordinary refresh can subsequently have no supplied occupancy-compatible route.
Failed execution and renewed convergence retain early termination/no-benefit
cases. No historical alternative trajectory, Arena displacement, capture,
survival, CPU or strategic benefit is established.

Runtime and the production diagnostic remain unchanged at inactive build
`2ed9e822f3c5b9e5fcd7fb7e0b6778347b2291130c49cd6b204d9fc01c433aa8`.
Opening deployment and its probe remain off. This test does not make diagnostic
paths gameplay routes in production or authorize another trial.

Dependencies remain the [opening ownership/lifecycle contract](opening-deployment-integration-2026-10-17.md),
[occupancy route/cache contract](opening-occupancy-routes-integration-2026-10-18.md),
[subset-scoped support order](objective-travel-support-scope-integration-2026-10-18.md),
[centre integration](opening-centre-support-test-only-2026-10-17.md#current-inactive-runtime-integration)
and [one-shot probe contract](opening-route-probe-2026-10-18.md).

## Retained one-step evidence, separate from continuations

Replay `6ad528d5abefcb3a9dc921e8`, System, emitted enabled build
`b7df648c613e56ee8016391c0770b45e0b21cc819e8c39cf418fdc626023b534`.
Only the already-extracted review window was read, not original responses,
cache, terrain payloads or a managed manifest. Its recorded SHA-256 was verified:
`ec71fff2b31e43affea97eda79b2e1316ccf60b0c38c58b09e65dceb83919c54`.

At tick 5, birth squad C had the following same-tick positions and proposals.
The alternative changes only `pg_player1_ranged_3`'s first step.

| Actor | Position | Original proposal | Substituted proposal | Original intersection | Counterfactual intersection |
| --- | --- | --- | --- | --- | --- |
| `pg_player1_healer_3` | (14,13) | (14,14) | unchanged | move | move |
| `pg_player1_ranged_3` | (15,15) | (16,16) | (15,16) | hold | move |
| `pg_player1_ranged_4` | (11,15) | (10,16) | unchanged | hold | hold |
| `pg_player1_ranged_5` | (16,15) | (16,16) | unchanged | hold | move |

Production subset/support helpers reproduce the recorded healer-only result
(two equally large safe subsets, size two, with only the healer in common).
The substituted first step yields a unique size-three safe subset; every
success/failure combination preserves the helper's support condition. Functioning
body-part observations are used as capabilities, not reconstructed part HP.

The sampled actor was original birth slot 1; diagnostic actor slot 1 resolves
through the same-tick member mapping to snapshot index 8. Both diagnostic paths
were complete, length 34, origin (15,15), goal (13,49), range zero, maxOps 1,000.
Their first steps were (16,16)/(15,16), with 91/105 reported operations. Neither
was executed. The extracted probe records occupancy-v1 and frozen exclusion
(16,16). Exact encoded paths are retained as static fixture data.

Historical cache reports, insertion ages, original `from`/`searchedAt` values
and the full historical terrain remain unavailable to this comparison. Prior
derived checks recorded plain terrain for the returned paths; that is not a
reconstructed map. The one-step reproduction does not establish later route
availability or historical alternative movement.

## Generated experiment and insertion semantics

[Fixture](../../tests/fixtures/opening-route-substitution.js) and
[explicit test entry point](../../tests/unit/opening-route-substitution.test.js)
use production membership, opening planner/provider/cache, preflight, shared
subset/intersection logic, centre preparation, reservations and executor. There
is no source rewriting, independent planner, pathfinder, collision simulator,
ranking change or additional query.

The generated full roster uses distinct cells and explicitly supplied plain
terrain. Four successful prelude observations reach the retained local geometry
at tick 5. Other routes, cache metadata and centre positions are generated, not
historical reconstruction. Centre commands execute through the production pass,
but centre displacement is supplied as **stationary in both arms**. Consequently
this is not a demonstration of sustained whole-army centre progress.

At tick 5, the test transport spends one substitution attempt and clones only
the sampled report: the observed alternative path, `from` = current position,
`tick = searchedAt = 5`, `incomplete = false`, `ops = 105`. The three other
reports retain `searchedAt = 1`; selection, mission start and progress are
untouched. This explicitly gives the inserted report a new present-test age;
it does not claim the historical cache had that age. Stale/off-path reports
skip the spent attempt; no later retry occurs. Production validates the resulting
report and rejects malformed endpoints, coordinates and lengths.

At tick 6 the unchanged peers expire at age five, causing the normal four-query
group refresh in both arms; all reports then receive the normal tick-six search
age. Thus the one inserted cache entry is not pinned or repeatedly reinstated.
Differences in subsequently supplied positions can persist, but later responses
come from the same declared response law in both arms, not from reusing an
unlimited diagnostic route.

Injected searches return fixed API-shaped tables/suffixes for the observed
origin. Complete results must respect **every cell** of the actual occupancy
matrix. If a table intersects a current blocker or has no suffix at the observed
origin, it returns a declared incomplete response rather than inventing a detour.
No teammate is assumed to vacate. Complete responses report 100 operations;
these are generated values, not Arena measurements.

Both arms receive the same per-actor return/outcome law. Each advances only to
its own previously admitted adjacent empty destination, with no shared admitted
destination, swaps or co-location. Unknown return codes do not imply movement;
the next generated observation explicitly supplies stay/move. All 16 move/stay
combinations per squad are checked for support; retained centre healer support
is checked separately. Current-tick tactical traces are compared with unchanged
production tactical execution on the same observations. Escort cancellation
releases objective ownership before the ordinary movement pass; no test-owned
post-release fallback is added.

## Qualified generated outcomes

Counts below are **departing direct-step calls / supplied displacements**,
including the 16 successful prelude moves through tick 4. Termination refers to
the unchanged production mission state, not the match outcome.

| Supplied case | Baseline | One substitution |
| --- | --- | --- |
| Favorable | 27/27; no-displacement at 16 | 47/47; objective-unavailable at 13 |
| Partial: sampled actor alone moves at 5, all stay afterward | 23/16; no-displacement at 9 | 31/17; no-displacement at 10 |
| Sampled command rejected, others succeed | 27/27; no-displacement at 16 | 19/18; objective-unavailable at 6 |
| Sampled return unknown, supplied stay; others succeed | 27/27; no-displacement at 16 | 19/18; objective-unavailable at 6 |
| Accepted commands, no displacement after 4 | 23/16; no-displacement at 9 | 25/16; no-displacement at 9 |
| Renewed convergence in declared refresh routes | 27/27; no-displacement at 16 | 35/35; no-displacement at 18 |
| Functioning HEAL lost at 7 | 19/19; squad-unavailable at 7 | 23/23; squad-unavailable at 7 |
| Explicit generated off-path cache metadata | 27/27; no-displacement at 20 | identical; substitution skipped |
| Incomplete ordinary refresh | 17/17; objective-unavailable at 6 | 19/19; objective-unavailable at 6 |
| Occupied declared route from initial observation | no-useful-objective at 1; no assignment | identical; no substitution attempted |

In the favorable case, ticks 5–12 yield eight supported batches, and the farthest
armed member's objective distance decreases from 34 to 27 by observation 13
(baseline remains 34). At tick 13, the declared `bow2` refresh path crosses
`bow1`'s observed (13,23): no compatible complete response is supplied, so normal
admission ends the mission. This is conditional useful progress, not capture.
With rejected/unknown sampled movement, the next declared refresh is blocked
at (16,16), now occupied by the other successful ranged member, terminating at 6.
The partial case adds only one supplied move and delays stall termination one
tick; accepted-without-displacement adds calls but no progress or extra allowance.
Renewed convergence still stalls. Retained adverse outcomes are not tuned away.

The occupied-route case fails at acquisition because its declared healer route
passes the supplied blocker. It does **not** qualify as a tick-five insertion
test; current destination fencing is also asserted on every admitted frame.

Acquisition/active requests stay within 24/4, each maxOps 1,000; observed maximum
is four searches per frame. Favorable baseline/substitution use 12/16 generated
live searches total. Insertion itself invokes zero searches. A separate frame
field references the already-observed two-query/196-operation diagnostic pair
at the zero-live-query tick 5; it is not a new search or production probe run.
The combined reference remains within four. Routes remain at most 40 cells,
cache age five, subset bound 16, one movement command per actor, start tick 1,
four-unchanged stall rule and original deadline 61. A separate supplied deadline
observation verifies timeout at 61 without queries; it does not simulate omitted
ticks 6–60. Centre progress never resets secondary progress or ownership.

## Qualification and retained limitations

Explicit generated-only command (no name filter or historical entry point):

```sh
node --test tests/unit/opening-route-substitution.test.js
```

18 checks passed. The test's optional `PAIN_GAIN_SUBSTITUTION_OUTPUT` directory
retains full generated frames, intermediate positions, proposed/admitted steps,
cache snapshots/evictions, calls/returns, supplied next observations and requests.
The final receipt and qualified artifacts are under external evidence directory
`opening-route-substitution-test-only-20261018-TJlLao`; they are not Git payloads.
Runtime validation is reused because every runtime byte remains unchanged.

Earlier local passing runs used some complete response tables that crossed
their own occupancy matrices. Those results are preserved as **unqualified**,
including the earlier tick-20 progression claim; they are not evidence of the
candidate's qualified behavior. Enforcing matrix consistency produced four
obsolete-expectation failures. The final assertions retain the resulting earlier
termination/no-assignment outcomes, without adding paths, tuning policy or
extending timers. Final results use only `qualified-results/` and
`qualified-summary.json` in the receipt directory.

Recommendation: **retain test-only; do not promote**. The supported one-step
opportunity is real in the retained observations, but useful continuation is
conditional on supplied later routes and execution. This experiment neither
qualifies a runtime substitution trigger/cache insertion policy nor establishes
joint actual Arena alternatives. It warrants no automatic retry, another policy
variant, match or activation. Both production switches remain disabled.
