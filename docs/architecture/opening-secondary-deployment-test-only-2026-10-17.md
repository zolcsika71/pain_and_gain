# Opening secondary mission allocation — test-only (2026-10-17)

Current status: promoted into an **inactive runtime candidate**, with
`openingDeploymentExperiment = false`. See the
[integration contract](opening-deployment-integration-2026-10-17.md) for current
ownership, validation and rollback. The source-rewriting test adapters described
below are historical and have been removed; tests now use production code.
Original receipts/results remain unchanged. The following sections record the
earlier test-only evaluations, not a deployment or Arena result.

Publication includes the generated-only tests and shared transport. Retained
tick1/whole-army payloads, readers and adapters remain local evidence rather than
Git payloads. Historical commands below that name those entry points require
those local extracts; they are not the current generated-only validation command.
Use the [current shared-support entry points](objective-travel-support-scope-integration-2026-10-18.md#generated-evidence-and-limitations)
for the published generated validation. No historical tests were rerun to publish.

Original decision: **retain this bounded test-only prototype**, not runtime integration or
activation. It admits useful generated departures, not merely an assignment,
and keeps its adverse outcomes. Runtime remains
`2db3ffea0c369f5003d16f96e3714ca536aa150dc3ed9a8932490c68fef04cbd`.
No switch, package, production source, build or index change is intended.

## Separate opening contract

This is initial mission allocation, not a relaxation or invocation of the
[post-centre policy](general-strategy-secondary-objectives-2026-10-16.md).
Production still rejects unowned centre. Only tick1 can allocate this mission;
missing/rejected admission consumes it. There is no later acquisition poll,
rearrangement into a healthier squad, chaining, contest or retry.

Use the unchanged `updateMembership` birth squads. Exactly one eligible existing
four-member squad must contain three nominal pure ranged actors and its nominal
pure healer. Missing, hybrid, incapable, fatigued or already owned members cannot
be replaced. Pin squad/member IDs, original centre ID/position, secondary target
ID/position/effect/ownership and original start. Centre remains the explicit
vulnerability flag and the fallback/rejoin reference, never the secondary target.
Initial centre must be neutral. Later observed centre capture by us may coexist
with the opening mission; enemy ownership or changed binding cancels it.

The other ten actors keep ordinary centre-oriented movement and tactical rules.
Require at least **six functioning weapons and two functioning pure healers** in
that remaining force. Every remaining weapon must currently be within3 of a
remaining healer, and each remaining healer must cover at least two weapons.
All ten must be healthy, living, mobile, unfatigued and free of other controller
ownership. This keeps the preset's four melee, two other ranged, two healers and
two scouts on the centre mission in the generated comparison. No healthy subset
is substituted. It is a deliberately conservative supported-force requirement,
not measured sufficient combat strength and **not defence already at centre**.
The generated opening has no friendly within3 of centre.

All departing members must likewise be healthy/mobile with functioning roles
and current ranged-heal access. Armed enemies within5 of centre, departing
actors or any member of the remaining force fence diversion. Support, force and
observations revalidate each tick. An injury or independent support/ownership
failure returns movement to ordinary centre/combat/support behavior immediately;
it does not force every actor to walk centre against an emergency.

## Reuse and exact test-side adaptation

- [Candidate](../../tests/fixtures/opening-secondary-candidate.js).
- [Generated observations/executor adapter](../../tests/fixtures/opening-secondary-generated-world.js).
- [Focused checks](../../tests/unit/opening-secondary-deployment.test.js).

The former test-side ranker (now the shared
[production selector](../../src/strategy/objectives.js))
reads `src/strategy/objectives.js` as source, asserts the
exact seam occurrences, and imports a derived ES module with only these changes:

1. Neutral centre is allowed; enemy-owned centre still rejects.
2. The two retained radius predicates (health scope and defence membership)
   become mission-force scope rather than presence within centre range3.
   The wrapper strengthens this to the six-weapon/two-healer requirement above.
3. Candidate flags must be neutral, not enemy-owned.

Original observations, HP, body parts and centre ownership are never falsified.
Production validation, support tests, route continuity/endpoints, threat/arrival
admission, utility arithmetic, ranking, state binding and stall/deadline rules
are reused. No independent utility formula/planner is maintained. A changed
source seam fails loading instead of silently weakening validation. This adapter
is deliberately **not a deployable integration technique**; future production
reuse would require an explicit shared ranking/route-validation seam, without
altering post-centre admission.

The original low-level selector fixtures supply at most24 reports initially and4 for the pinned target on later
ticks, each with known integer ops<=1000 and path<=40 cells. Maximum known
reported totals are24000/4000. Unknown ops rejects, never becomes zero. No path
search is executed. The supplied current reports do not implement production's
five-tick cache: the five-observation positive case consumes24+4+4+4+4 reports,
not a claim of equal search cost to production suffix reuse. A future bounded
route provider/cache was outside that first slice; the follow-up below now reuses
the production provider/cache through injection. Selector work stays within6
candidates,24 routes,960 cells and13440 route/threat comparisons.

Reuse unchanged `prepareSecondaryMovement`, `secondaryStepSupport`,
`selectSecondaryTravelSteps`, `moveCreeps` and `executeTactics`. Only ordinary
flag fallback can be replaced. Existing combat approach (including retained
range-six targets), emergency escape, injury support, escort and pairing win
before any objective command. The same executor pass issues at most one movement
command per actor; attack/healing selection and original execution order remain.
Require known plain first-step terrain; unknown/wall observations cancel.
The supplied route is not independent proof of future terrain or occupancy.

Every admitted move/stay outcome retains functioning within3 healing support.
Four-member congestion examines at most16 subsets; tied maxima admit only common
moves. Held actors remain objective-owned, so they cannot fall through into
unchecked approach. No swap, vacating-cell entry, new reservations, alternate
route search, movement simulator or collision arbitration is introduced.

Original60-tick lifetime and four unchanged observations apply. Only subsequent
positions establish progress; accepted, rejected and unknown calls do not move
actors or refill time. Duplicate ticks cancel rather than reissue commands;
malformed ticks cannot reopen a spent mission. Only explicit strict new-match
rewind to tick1 may allocate again. Observed target ownership terminates and
releases ownership; the test's supplied confirmation is not a demonstrated
arrival or an Arena capture. Fallback does not prove physical return.

## Comparison and retained outcomes

All trajectories below are generated inputs using distinct occupied cells.
Command stubs return values without changing any observed position or HP.
Successful squad observations advance only into previously admitted adjacent
cells, empty before any step, without assuming another actor vacates first.

| Case | Centre-only | Split candidate |
| --- | --- | --- |
| Supported opening | Fourteen ordinary centre fallbacks | Four direct secondary steps, ten ordinary centre fallbacks |
| Five successive observations | No supplied secondary progress | Four actors each advance five supported cells; same target/start, unchanged tactical traces |
| One occupied first step | Ordinary movement unchanged | Three direct steps; blocked actor keeps owned hold; all16 outcomes support-safe |
| Two converging destinations | No arbitration assumed | Only two independent common moves proceed; contenders hold |
| Weapons move, healer stays | No alternate outcome predicted | First partial observation retains support, but next proposed steps fail preflight and cancel |
| All four proposals occupied | No physical vacating assumed | Four owned holds; original stall bound terminates at5 after start1 |
| Centre-force support later separates | Ordinary movement still owns that force | Diversion cancels; prototype cannot guarantee the other force coordinates |
| Enemy approach / competing wound | Existing attacks, retreat and healing | Cancellation retains identical current-tick tactical/movement priority traces |
| No existing pure-ranged birth squad / insufficient support / invalid route | Centre-oriented baseline | No split, no reconstruction or retry |

The deliberately support-invalid blocker relocation is also retained as an
independent rejection, not misrepresented as congestion. Another fully blocked
fixture relocates a whole supported nonmember squad and verifies actual bounded
holds. Positive progress therefore does not come from vetoing every departure.

## Income and army-wide combat trade-offs

The complete preset has base nominal capacities960 ATTACK,300 RANGED_ATTACK and
216 adjacent HEAL HP/tick:1476 combined heuristic units. Diverting three ranged
actors and one healer removes nominal180 ranged and72 adjacent-heal capacity
from the centre-assigned force; range2–3 healing is only24 for that healer.
Those are capacities, not damage/healing scheduled or resolved, and range3
access does not promise adequate healing under concentrated incoming fire.

| Neutral flag, if subsequently captured | Added income/tick | Whole-army nominal penalty |
| --- | --- | --- |
| Attack reduction | 3 | 192 ATTACK HP/tick; centre-assigned melee960→768 |
| Ranged reduction | 3 | 60 RANGED HP/tick, including36 from the diverted weapons |
| Healing reduction | 4 | 54 adjacent HEAL HP/tick; both centre healers and diverted healer affected |

Production ranks `income/(slowest steps+1) * (1-loss/current total capacity)`
here: denial and enemy penalty relief are zero for neutral flags. Equal geometry
across separate worlds ranks healing above ranged above melee by this heuristic;
a distinct two-target case also selects a healing flag over the melee flag.
This is not predicted travel time, retained income or strategic superiority.
No added flag is observed owned in the positive progress case. Capturing centre
would separately add5 income and army-wide x1.1 incoming damage; neither centre
capture nor sufficient defence is established by keeping its mission identity.

## Validation and recommendation

Focused command (no name filter or historical entry point):

```sh
node --test tests/unit/opening-secondary-deployment.test.js
```

Final49 checks pass,0 fail/skip, on Node24.19.0. Earlier39/44/45/46-check development
runs also passed; these are successive suites, not additional distinct coverage.
Checks include original membership, all-outcome support, input/order/actor-ID
renaming and mirrored non-tied geometry, command returns versus observations,
route/query/work bounds, deadline/spent/reset, priority/tactical compatibility,
adverse force loss and unknown/malformed inputs. Exact utility ties retain
production's flag-ID tie-break; invariance does not claim renamed tied flags pick
the same physical flag. Existing unaffected generated validation is reused.

Retain as a test-only opening allocation mechanism: useful bounded departure is
demonstrated on supplied observations. Do not integrate or activate here.
Remaining limits are actual tick1 birth geometry/terrain, bounded route provision
and cache reuse, unowned centre-contest risk, and support changes in the remaining
force which this controller does not own. Early combat may legitimately cancel
every split. The6/2 threshold is a conservative policy choice, not evidence that
ten actors can acquire/retain centre against an opponent. There is no proof of
Arena movement, capture, safe arrival, survival or a winning trajectory.

Protected hashes, focused outputs and findings:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-secondary-deployment-test-only-20261017-Fpj5Mw/report.json`.
No replay/historical payload, managed manifest or PNG is read; no package/runtime
edit, new switch, activation, match or Git mutation is authorized by this result.

## One retained start and whole-army observations — follow-up

This follow-up uses exactly one already-extracted tick1 state from replay
`6ad252c5abefcb1649c8ed4e` (Vincent Kocher v8), created
`2026-10-16T16:37:25.445Z`. Source:
`secondary-objective-fresh-trial-20261016-LpZXGX/matched-replay-projection.json`
under the external evidence root; SHA-256
`89720f7ae0e4d58ac4027a56a49baac9d6bb3bf0ccff00e8feb08ee4bb7392e2`.
The18,449,632-byte resident projection was already extracted; no original cache,
other match, later historical observation or historical route/terrain was used.
The retained record is from build
`440478537d5b49a1b1fc5860d0ebebac5371bb6d5207a4f1242886fd8de87a7b`,
not the current runtime. These are current production decisions on a historical
starting observation, not a claim that the opening candidate ran historically.

The local single seed `tests/fixtures/opening-secondary-retained-tick1.json`
retains28 actors,7 flags, membership baseline and closed tick1 coverage record.
All actors are full health; functioning body counts exactly sum to hitsMax/100,
and original role/count evidence agrees. Counts therefore suffice for complete
role/capability bodies here; original body-part ordering is not recovered or
needed. HP, fatigue, positions, roles and flags are not changed to qualify.
`updateMembership` reproduces every historical squad/member binding and role.

| Initial readiness, independent of routing | Result |
| --- | --- |
| Complete roster/flags, neutral centre | 14 actors per side;7 neutral flags; valid |
| Existing eligible squad | C: original healer3 and ranged3/4/5, no substitutions |
| Health and mobility | All14 healthy, functioning MOVE, fatigue0 |
| Departing healing access | All three weapons at range1 from their healer |
| Remaining centre-mission force | Six weapons and two pure healers; each weapon at range1 of a retained healer; each healer covers three |
| Armed enemy buffers | Nearest centre37, departing force74, remaining force74; all exceed5 |
| Competing owners | Production escort planner returns no assignment with neutral centre; other relevant experiments remain off |
| Already defended centre | No friendly within3; only a mission allocation |
| Routes omitted | `no-useful-objective`; readiness passes, route availability remains unknown |

Use the local isolated seeded checks `tests/unit/opening-secondary-whole-army.test.js`,
not a broad fixture reader. Its
local whole-army adapter `tests/fixtures/opening-secondary-whole-army-world.js`
is not imported by the generated-only opening suite. Existing pure-generated
commands/import boundaries are unchanged; package configuration is untouched.

### Supplied route and observation experiment, not replay continuation

Supply diagonal complete reports only to the secondary family whose maximum
geometric length is<=40; other reports are explicitly incomplete. This selects
the observed ranged-reduction flag with max38 steps, income3 and nominal global
ranged-capacity loss60. Generated plain first-step terrain and100 operations per
report are declared inputs, not recovered terrain or measured search costs.
No query runs and no alternative path is introduced after blocking.

Both sequences preserve the exact starting positions and use unchanged production
ordinary movement for all centre-assigned actors, including its escort planner.
Each subsequent centre position is a fixed supplied input consistent with an
issued centre `moveTo` and an adjacent step closer to centre, into a cell already
empty in the original observation. No vacating-cell entry, shared destination
or engine arbitration is assumed. Return0 never changes a position. No centre
controller or subset selector chooses which centre commands succeed.
Enemy positions, health, fatigue, parts and flag ownership stay at supplied
initial values; these are not observations from later replay ticks.

| Generated sequence | Outcome over seven observations |
| --- | --- |
| Eight centre weapons/scouts advance; two centre healers initially stay, then lag one observation | Remaining weapon/healer gaps1→2 and stay2. Split issues3 steps at1,1 at2, then0. Occupancy/convergence holds3–6 end `no-displacement` at7, start1 unchanged. Ordinary centre traffic also occupies a proposed secondary cell at4. |
| Same advancing centre units; both centre healers never displace despite repeated accepted calls | Remaining gaps1→2→3→4. At4 the reused support-quorum probe returns `defence-unavailable`; the stronger unchanged six/two requirement independently fails too. Finished state and ordinary fallback persist through7. |

The centre-only comparison on the **same initial state** issues14 ordinary centre
fallbacks. Split issues3 direct steps,10 unchanged centre fallbacks and one owned
hold. Later per-frame baseline calls are comparisons on that same supplied frame,
not a second counterfactual centre-only movement history. No casualty, capture or
relative outcome can be inferred. The initial formation is not the admission
blocker, but these routes do not produce sustained departure; the adverse outcomes
are retained without reshaping the formation or tuning thresholds.

### Validation and recommendation

```sh
node --test tests/unit/opening-secondary-deployment.test.js tests/unit/opening-secondary-whole-army.test.js
```

The combined affected run passes54 checks:49 pure-generated and5 authorized
one-seed/generated-sequence checks. A final added assertion specifically verifies
crossing centre traffic; the isolated5-check entry point passes again afterward,
reusing the unchanged49 results. No other historical callbacks execute.
The first combined run had53 passes/1 failed assertion: the expected higher-level
`centre-mission-unavailable` label was wrong because the reused support probe
already returned `defence-unavailable`. Only that expectation was corrected;
no observation, threshold or policy was changed to pass it.

Recommendation: **bounded test-only route-provider work is justified**, with
existing24/4 caps and cache semantics, to replace the provisional geometric
reports and determine whether checked, usable steps exist from this actual birth
geometry. It is not integration/trial authorization or a new routing framework.
No readiness-policy revision is demonstrated by this one start. Supplied route
convergence and ordinary centre traffic are concrete progress blockers, while
centre-healer partial execution can invalidate support. A provider is not promised
to solve them; keep the policy test-only and retain no-departure/cancellation
results rather than weakening the six/two requirement. Runtime/package/build/
switches/index remain unchanged. No historical departure, Arena capture,
coordination guarantee or strategic benefit is established.

Full supplied observations, requests/returns, failed/final outputs and protected
hashes are retained in:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-secondary-whole-army-evaluation-20261017-dvMrwy/report.json`.

## Injected Arena route provider/cache — follow-up

Decision: **retain test-only**. The opening wrapper now accepts
`context.searchPath`. This replaces per-tick report submission for provider-backed
runs. The direct-report seam remains only for the original selector/admission
regressions. Changing between these modes mid-mission terminates, not reacquires.
No runtime/package/build/switch change is made.

- [Shared provider, promoted from the removed source adapter](../../src/strategy/secondary-objective-plan.js).
- [Explicit generated API response table](../../tests/fixtures/opening-secondary-search-api.js).
- [Pure-generated provider tests](../../tests/unit/opening-secondary-route-provider.test.js).
- local Seeded whole-army checks `tests/unit/opening-secondary-whole-army.test.js`.

The adapter derives the production `secondary-objective-plan.js` module with
asserted source seams, importing the **same** opening ranker as the wrapper.
It permits neutral centre without altering the observed owner, restricts targets
to neutral flags, removes contest processing/fallback and exposes the existing
evaluation for assertions without a second ranking call. The wrapper supplies
only its already-admitted original squad (full14-member membership retained).
Collection, geometric exclusions, required-field validation, operation accounting,
capture refresh and cache suffix code remain production code. No duplicate cache
algorithm or pathfinder is introduced. Source derivation remains a test technique,
not deployable Arena code.

### Search and cache contract

Call the injected interface as:

```js
searchPath(observedActor, {pos: observedFlag, range: 0}, {maxOps: 1000})
```

The [Arena API](screeps-arena-api.md#searchpathorigin-goal-opts) documents `path`,
`ops`, `cost` and `incomplete`; absent a cost matrix the search uses terrain only.
The Arena tutorial's `tutorial-terrain/typings/game/path-finder.d.ts` agrees.
This adapter preserves production's strict integer0–1000 ops, array path and
boolean completeness requirements. `cost` is not consumed; unknown ops is **not**
converted to zero. An exception, absent/invalid ops, non-array path or non-boolean
completeness fails the poll. Incomplete/invalid coordinate/continuity/endpoint
routes cannot qualify. A known over40 acquisition path excludes only that flag;
unknown required completeness still fails conservatively. The existing active
overlong-route failure is unchanged; no alternate target is opened.

Keep24 acquisition/4 refresh queries,1000 requested ops/query,40 cells and
five-tick search age. Initial geometric lower bounds over40 exclude before search.
Cached `searchedAt` and original returned ops remain attached to the report.
Each observed actor must be at the cached origin or a cached path node; reuse
rebases only that observed suffix. Non-displacement keeps the full remaining path,
not an assumed consumed step. Off-path positions or age>=5 require at most four
refresh calls to the pinned target, not per-blocker retries. A cache hit incurs
zero new queries/reported ops; it does not erase original search accounting.
Unknown aggregate ops is null, even after earlier known calls. Ownership, binding,
health/support, deadline and stall checks may terminate before any refresh.
Cancellation after a paid search retains its query/ops diagnostics.

The unchanged movement preflight still admits only supported move/stay outcomes,
checks current occupancy and priority, and owns holds. It does not assume cells
will vacate or that accepted commands displace actors. No new path searches,
reservations, swaps, timers, waiting allowance or congestion resolution exist.

### Results and limits

Generated API responses are copied from the existing fixture report table, bound
to exact tick/origin/goal. The responder records and asserts options and origins;
it does **not** inspect terrain to find paths. Generated plain terrain and returned
ops100 are inputs, not measured search quality/cost. Seeded paths are unchanged
from the previous evaluation. Later observations remain supplied, not replay
continuation or engine simulation.

| Case | Queries / known reported operations | Observed test decisions |
| --- | --- | --- |
| Pure-generated supported six-observation progression | 16/1600 initially;0/0 at2–5;4/400 at6 | Four supported steps each observation; cached suffixes and age5 refresh; start1/deadline61 unchanged |
| Exact retained start plus generated centre-healer lag | 4/400 at1,0/0 at2–5,4/400 at6,0/0 at7 | Same3→1→0 objective steps; occupancy/convergence/centre traffic preserved; no-displacement at7 |
| Same seed with stationary centre healers | 4/400 at1, cache hits at2–3; no later searches | Same defence-unavailable at4 and spent fallback through7 |

The seeded run excludes five impossible flag families geometrically and searches
the remaining family. Comparing provider-backed and prior report-backed frames
asserts identical positions, support facts, proposed/admitted steps, holds,
baseline/split commands and returns. Nothing was retuned to erase congestion or
centre-force separation. Other checks cover partial movement, off-path refresh,
expiry, target/centre binding, ownership, required-field failures, candidate
ordering/exclusion, full24/4 boundaries, valid40-cell paths,40/41 geometric bounds,
unknown/zero ops, immutable reports, priority cancellation and input-order invariance.
The prior admission/priority/mirror/rename cases are rerun, not replaced.

Run only these explicit entry points:

```sh
node --test tests/unit/opening-secondary-deployment.test.js tests/unit/opening-secondary-route-provider.test.js tests/unit/opening-secondary-whole-army.test.js
```

All96 affected checks pass:49 original generated checks,40 provider checks and7
single-seed/generated-sequence checks. Development failures were invalid test
expectations/response construction, not demonstrated runtime defects: effect
mutation first broke the observation schema; the geometric-boundary case assumed
rejection unnecessarily; a generated40-cell detour initially had invalid steps.
The final valid, distinct-cell detour and schema-preserving binding case pass
without a production change. Failed outputs remain in the receipt.

This uses the one already-retained tick1 JSON seed only. No original cache,
additional replay, profile search, managed manifest or PNG is opened. Validation
counts, development failures and preservation hashes are retained in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-route-provider-test-only-20261017-fQcK9w/report.json`.

### Concrete boundaries and next recommendation

Production inputs already have bounded equivalents: `observeArena()` supplies
tick, full creep references/body/HP/fatigue and flags; completeness must be derived
using the coordinator's closed-roster checks, not asserted blindly. Use original
`updateMembership`, the selected original centre object (validate vulnerability
identity; never substitute the travel flag), `searchPath` and current
`getTerrainAt`/occupancy. `runTick()` already computes scout/pair/escort ownership;
those IDs must fence admission, and its engagements/escort/pair plans must reach
the same preflight before the existing single `moveCreeps` pass. Attacks/healing
remain based on observed positions. Keep one mission/ownership slot: opening and
post-centre processing must not acquire simultaneously or replenish an attempt.
The remaining ten retain ordinary movement, with observed support failure cancelling
diversion rather than granting this controller ownership of them.

Next recommendation: a **separately scoped inactive integration task** may expose
shared capture-route/ranking seams and connect this pinned opening mission to that
existing ownership slot, with disabled-equivalence/tick-flow checks. Do not deploy
source rewriting, add a second controller pass or automatically prepare a trial.
There is no missing invented runtime input, but actual Arena route quality,
terrain/cost effects, live displacement, CPU cost and sustained centre coordination
remain unverified. Congestion can still consume the attempt, and centre-force
partial execution can cancel it. These results establish adapter decisions, not
safe arrival, capture, damage prevention, survival or strategic benefit.
