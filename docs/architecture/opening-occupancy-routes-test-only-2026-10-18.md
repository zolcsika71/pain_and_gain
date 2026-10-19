# Occupancy-aware opening route requests — test-only (2026-10-18)

Historical experiment below is preserved. The accepted mechanism is now
[integrated, inactive](opening-occupancy-routes-integration-2026-10-18.md).
The superseded request/cache adapter was removed; generated tests now call
the single production implementation. Earlier comparison and validation counts
below describe the original test-only revision, not current live evidence.

Decision: **retain test-only** as a bounded request/cache mechanism. Not runtime
integration, activation, a new tie-break or a gameplay recommendation. Runtime,
package, build, switches and Git index remain unchanged at inactive build
`cdf6e4eb2289e0b24f2a16df6b21b3c9029666826dfbbde1a3dc647a90d67afd`.
Original intersection ties and the test-only centre-support candidate are unchanged.

## Missing handling established before implementation

Production `secondary-objective-plan.js` requests
`search(actor,{pos:target,range:0},{maxOps:1000})`. It supplies no `costMatrix`.
Suffix reuse binds an observed origin/path node, validates the rebased reports,
then checks age<5. A currently occupied next cell does not invalidate that cache.
Executor preflight still correctly withholds occupied moves; this is missing
request/cache handling, not permission to weaken that safety gate.

Before adding the adapter, the original generated provider established a fresh
tick1 route. At2 a scout occupied bow1's cached next cell(28,19). Production
recorded4 cache hits,0 queries and an occupied-cell owned hold for bow1.
`gate-before-adapter.json` retains this reproduction before implementation.
No replay, historical fixture or cache response is read. The prior
[ID-only re-evaluation](opening-travel-id-tie-test-only-2026-10-18.md#re-evaluation-with-current-subset-scoped-support)
remains rejected; its sources/tests/findings are not changed by this task.

## API and cache adapter

- [Promoted implementation](../../src/strategy/opening-deployment.js).
- [Injected matrix/API transport](../../tests/fixtures/opening-occupancy-api-world.js).
- [Generated checks](../../tests/unit/opening-occupancy-routes.test.js).

Use the documented [CostMatrix](screeps-arena-api.md#costmatrix) constructor,
`set(x,y,cost)` and `get(x,y)`, passed through
[`searchPath` options](screeps-arena-api.md#searchpathorigin-goal-opts).
255 means unwalkable;0 retains default terrain cost. The local Arena tutorial
`tutorial-terrain/typings/game/path-finder.d.ts` confirms the interface. No World
API, `roomCallback`, substitute pathfinder or traffic simulator is used.

The adapter injects `CostMatrix` and `search` around the real production opening
planner. For every paid request, create a separate initially-zero matrix, mark
all currently living observed actors' cells255, except the searching actor,
and explicitly leave its origin0. Team members are blocked, never assumed to
vacate or swap. All other options and the original goal/range are forwarded.
No observation, actor, route result or caller-owned matrix is edited. Matrix
construction failure follows production's conservative unsupported-search path;
missing ops is never supplied as0. The test double stores matrix costs only;
it implements no route search.

For an active production-origin cache, inspect at most four reports of at most
40 cells. If the actor is at the saved origin or an actual path node, inspect
the immediately following node. If it is currently occupied, evict that report
from a **copied** route-control cache. Do not falsify `searchedAt`, report origin,
selection, membership, progress or deadline. Off-path inputs are left to
production's existing refresh; terminal outer missions are not changed.

Production sees a missing report and performs its original one group refresh,
up to4 queries, even if several reports were evicted. All full observation,
current-support, centre-force, binding, route, utility and lifecycle validation
still runs. Real `prepareSecondaryMovement`, intersection subset admission,
reservations and one executor pass remain. Priority ownership still cancels
movement; escort can win after the bounded route work has already been paid.
No second planner invocation or retry loop is added.

Original caps remain24 acquisition/4 active queries,1000 requested ops/query,
40-cell paths, five-tick cache age,60 original elapsed ticks and four unchanged
observations. Each matrix fills at most28 observed actor cells plus its origin;
the complete matrix storage/all-cell scans in tests are not adapter neighbour
work or Arena CPU measurements. No fairness, persistent blockage counter,
reservation framework or waiting allowance is introduced.

## Generated comparison and response assumptions

The declared response tables contain fixed corridors and an explicitly selected
bow1 detour. They do not calculate paths from matrix costs, terrain or obstacles.
At2 the test operator selects that API response family under both policies;
only the candidate's refresh requests it. Both use the same medic corridor and
initial input, rather than comparing different initial routes. Positive supplied
responses respect all request matrix blocks and production route validation.
This demonstrates correct handling **if** Arena returns such a usable route,
not that the real search finds it within1000 ops.

For five generated observations, a stationary scout remains at(28,19). No
tick1 displacement is supplied; at later observations only previously admitted,
empty, distinct adjacent moves are supplied as successful.

| Evidence | Baseline | Matrix + blocked-cache eviction |
| --- | --- | --- |
| Admitted secondary commands at1–5 | 4,3,3,1,3 | 4,4,4,2,4 |
| Query counts at1–5 | 16,0,0,0,0 | 16,4,0,0,0 |
| Bow1 at observation5 | (27,19), held behind blocker | (29,18), three supplied detour steps |
| Other three departing actors at5 | medic(27,18), bow2(29,20), guardR2(29,21) | Same positions |

Both retain functioning support for all16 move/stay combinations of each squad,
original start/deadline and unchanged current-position tactical traces. This
five-observation window supplies no ownership/capture event and does not cover
a later active refresh after the initial detour. It is not Arena movement or
a full successful mission. Both continuations use the **same test-only centre
controller**, so combined deployment progress remains conditional, not standalone
runtime qualification or a fix for ordinary centre-force separation.

## Adverse outcomes and accounting

- Moving blockers are reflected in new matrices. A cleared next cell does not
  evict early; later occupied path cells are inspected only when actually next.
  Cache expiry remains age5. Partial movement uses observed nodes, not calls.
- Four blocked cached reports cause at most one4-query refresh, not16 retries.
  Acquisition stress still caps at24 with unchanged maxOps1000 options.
- All eight healer exits can be blocked while current squad/centre support is
  intact. An explicitly supplied incomplete response causes
  `objective-unavailable` after4 requests/4000 known reported ops. The adapter
  neither invents a path nor grants more attempts.
- Two actors can still request a shared **currently free** destination. Matrix
  requests do not arbitrate future convergence: original equal-best intersection
  withholds both contenders; only medic/guardR2 common moves proceed.
- Accepted0, rejected-11 and unknown returns without supplied displacement all
  finish at5. No command acceptance, cache refresh or new route resets progress.
- If a blocker alternates across two cached first steps while actors stay put,
  active refresh spends4 queries at2,3,4 **and5**. Eviction exposes missing routes
  before production's later route-dependent stall branch; at5 the bounded
  refresh is paid before `no-displacement`. Total16+4+4+4+4=32 queries over the
  attempt, never above a per-tick cap, and no extra observation/time allowance.
  This extra work on a terminal stall tick is a retained cost, not hidden as0.
  Absolute timeout61 still stops before new search.
- Lost current squad or centre support cancels with0 new queries. Escort cancels
  all objective movement after the allowed4-query refresh in its case, preserving
  the existing ownership order rather than claiming zero planning work.
- Active overlong response rejects after1 query; incomplete group responses
  reject after4. Unknown/over-budget ops retain null aggregate telemetry.
  Acquisition overlong handling still excludes only that candidate when required
  fields are known; unknown completeness still fails conservatively.

These are generated facts/decisions, not guaranteed escape, fairness, better
damage/healing, capture, survival or a competitive trajectory. Current healthy
no-contact inputs emit no attack/heal actions; actual contact compatibility is
not newly exercised. Existing unaffected validation is reused.

## Validation, preservation and recommendation

```sh
node --test tests/unit/opening-occupancy-routes.test.js
```

24 focused generated checks pass,0 fail/skip. All10000 matrix costs are checked
against occupancy in the request test; per-request matrices and clones are
independent. Tests preserve source observations/previous cache and check actual
commands/returns separately from supplied subsequent positions. Static import,
link and whitespace checks are separate from these results. Runtime is unchanged:
reuse accepted build validation, with a read-only final identity check; do not
regenerate the build or run unrelated suites.

Development failures are retained: a partial-movement fixture briefly placed its
blocker on the actor's now-occupied origin; it was corrected to the real next
node with an explicit legal response. A query assertion incorrectly expected0
on the terminal stall observation; the actual bounded4-query cost is now tested
and disclosed above. Additional declared response corridors keep positive mocks
clear of currently occupied future cells; they are not candidate route searches
or tuning of the controller. An initial aggregate evidence print exceeded its
output bound; separate compact generated captures retain complete relevant
positions, command/return and sparse matrix/request data without a broader read.

Retain this **test-only bounded request/cache adapter**: it addresses a verified
missing input/cache condition and enables supported generated local progress
with explicit usable API responses. Real route availability/quality, operation
cost and Arena CPU remain unverified; incomplete search can consume the mission,
convergence and support loss remain, and terminal refresh can add bounded work.
Do not integrate, activate, prepare a trial or add another routing mechanism here.

External before/gate records, failed/final results, generated comparisons and
preservation hashes:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-occupancy-routes-test-only-20261018-NsBKfx/report.json`.
Prior ID-only findings and unrelated work stay byte-identical. No replay/raw
extract, managed manifest, PNG, hydration, Git mutation or match is involved.
