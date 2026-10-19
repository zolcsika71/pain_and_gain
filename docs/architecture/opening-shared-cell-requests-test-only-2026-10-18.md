# Shared-next-cell exclusions at one normal opening refresh

Status: **retain test-only request comparison, not runtime integration**.
Inactive runtime/build remains
`3aa8a15f0e2923f8df93cbb56ba0f1f23350eb1f8cba25874b17139bd9d67782`.
No switch, candidate ranking, package, cache rule or deadline changes.
The [objective-distance refinement](opening-progress-tie-test-only-2026-10-18.md#frozen-policy-successive-outcome-comparison)
remains rejected and is not used in this comparison.

## One test-side seam

[Adapter and generated tables](../../tests/fixtures/opening-shared-cell-requests.js)
wrap only the injected `context.search` reached through the existing production
`planOpeningDeployment`. There is no source rewriting, alternate provider,
pathfinder, retry loop, actor winner ranking or sequential path reservation.
The [occupancy integration](opening-occupancy-routes-integration-2026-10-18.md#one-implementation-opening-only-boundary)
remains authoritative. See the API [matrix](screeps-arena-api.md#costmatrix) and
[searchPath](screeps-arena-api.md#searchpathorigin-goal-opts) contracts.

Before any query in a frame, require the complete generated observation and
derive current next nodes from the existing cache only when each actor is at
its declared origin/path node. Freeze every shared next cell, independent of
actor IDs/query order. In each already-paid request, set those cells255 on the
provider's new occupancy matrix, except the searching origin. Other living
occupants remain255; origin remains0, other cells retain terrain defaults.
No observation, previous state or other request matrix is mutated.

The fixture starts four actors on distinct cells in a vertical strip. Four
successful supplied eastward steps place them on declared cached nodes at tick5.
The next cached proposals converge in two pairs on empty cells `(30,20)` and
`(30,21)`. The fresh cache is **not evicted**, so tick5 makes no request. Age5
naturally causes the original four-query refresh at6; the same frozen two-cell
set is overlaid in all four requests. Queries remain production-ID-sorted, not
chosen by the adapter. The response tables depend only on the request matrices,
observed origins, fixed target and declared scenario, not earlier returned paths.

The underlying production provider/coordinator, complete route validation,
current-support/priority preflight, at-most16 subset proofs and intersection
ties, centre support, reservations and movement/tactical executor are unchanged.
The existing test transport calls these directly; this is not a full `runTick`
integration qualification. Membership is initialized by production code in
each identical generated arm; original roles and retained centre force remain.
Retained centre actors' supplied observations stay stationary, so no live
centre-coordination conclusion is made.

## Supplied responses and observations

All terrain is supplied plain. Ordinary responses use declared common corridors;
overlay responses either use explicit detours respecting the **entire** request
matrix, report incomplete, or converge on different free cells. They are not
routes discovered from terrain. Paths, costs and operation counts are injected
test values. Alternatives are **not established for any actual match**.

Each decision records pre-action positions, fixed exclusions, route diagnostics,
cache origins/ages, commands/return codes and separately supplied next positions.
Only empty adjacent destinations previously commanded may be supplied as moved;
return0 alone never moves a fixture. Every independent move/stay combination
of each admitted squad batch retains production healer support, with exclusive
destinations and no assumed swaps/vacating. The ordinary and overlay arms use
identical initial worlds and displacement laws; later observations legitimately
diverge after different admitted steps.

| Scenario | Ordinary requests | Shared-cell overlay |
| --- | --- | --- |
| Supplied distinct detours | Holds from5; no-displacement stop9 | Admitted counts6–10: `4,4,3,3,4`; supported supplied progress, still active at10 |
| No supplied complete detour | Stop9 | Four incomplete responses at6, objective-unavailable; no fallback/retry |
| Responses converge on other free cells | Stop9 | Same stop9, bestSize2/tied4/intersection empty |
| Only one actor displaces at6, then all stay | Stop9 | Cache rebases that actor; no-displacement stop11, no extra refresh |
| All return0 but none displaces after refresh | Stop9 | 12 extra calls at6–8, same stop9 |
| Convergence starts in a fresh tick1 cache | Stop5, no refresh | Same stop5, no overlay query ever runs |

In the positive case all four actors change position over the supplied detour
continuation, and the farthest weapon's objective range decreases from15 to14
by the supplied observation after tick10. Some healer holds remain necessary
while a backward detouring weapon catches up; this is not guaranteed whole-group
pace, arrival or capture. The bounded positive case stops before a second normal
refresh could become due; it does not claim full mission completion.

## Work, lifecycle and adverse boundaries

Both arms spend16 initial acquisition queries, then **only4 at tick6**:
20 total,100 reported ops/query,2000 reported ops total. Per-tick caps remain
24 acquisition/4 active, maxOps1000; route length<=40, cache age5, four unchanged
observations, original start1/deadline61 and spent attempt are untouched.
Positive refresh suffixes reuse cache at7–10; no convergence-triggered eviction
or extra search is hidden in the wrapper. The separate deadline check preserves
timeout61 with0 searches, and no-displacement can stop before expiry refresh.

Each matrix gets at most two extra fixed set calls during the existing paid
batch. This is bounded request-construction work, **not measured Arena CPU**.
Full matrices, options, origins/goals and path compliance are asserted in tests;
the receipt retains only nonzero matrix cells, avoiding bulky full-grid output.

Symmetric exclusion does not arbitrate new convergence, guarantee an available
corridor, preserve support for arbitrary detours, or cure fresh-cache stalls.
An excluded goal or sole corridor could force failure; no goal-range relaxation
or extra grace is provided. Generated successful responses demonstrate adapter
request/accounting/validation flow only. Priority cancellation and route/API
error coverage from the unchanged occupancy suite remain applicable.

## Generated-only verification and recommendation

[Focused checks](../../tests/unit/opening-shared-cell-requests.test.js) cover
all matrix cells/origin/blockers, immutable input and prior cache, common frozen
exclusions, options/ID-sorted query order, suffix/age accounting, partial outcomes,
all-outcome support, fresh-cache non-eviction, no-detour/re-convergence and original
termination. Reversed roster/flag order, renamed actors and mirrored geometry
preserve corresponding decisions and supplied positions without ID arbitration.

```sh
node --test --test-reporter=spec tests/unit/opening-shared-cell-requests.test.js tests/unit/opening-occupancy-routes.test.js
node --check tests/fixtures/opening-shared-cell-requests.js
node --check tests/unit/opening-shared-cell-requests.test.js
```

40 generated checks pass (10 new,30 existing occupancy checks). Static import
inspection confirms no historical payload reader or name-filtered mixed suite.
Optional `PAIN_GAIN_SHARED_REQUEST_OUTPUT` points to a fresh external directory
to retain generated comparison traces using the existing no-clobber publisher.
No gameplay/runtime/package edit, build regeneration, activation or trial.

Recommendation: **retain the test-only mechanism**, not promote it. A normal paid
refresh can carry symmetric exclusions and injected valid alternatives can make
supported progress without a new ranking rule. Actual route availability,
sustained arrival, failure frequency and CPU remain unproven; documented stalls
and incomplete outcomes remain decisive. No historical repair, Arena benefit,
automatic variant or match is implied.
