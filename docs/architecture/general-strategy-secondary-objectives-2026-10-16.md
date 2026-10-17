# General strategy and guarded secondary objective — 2026-10-16

Status: connected to `runTick` behind **`secondaryObjectiveExperiment = false`**.
Current inactive scoped-health/shared safe-subset travel build:
`275a7eaafd5de6fa2acfd8f7734aa9d6d1946863164cf6c058153d388e21ff77`.
The [scoped-health integration](secondary-scoped-readiness-integration-2026-10-17.md)
changed only the health veto below. The subsequent
[safe-subset integration](secondary-partial-travel-integration-2026-10-17.md)
changes occupancy/convergence handling, not admission. Reviewed adjacent ranged
retreat and every switch are preserved; healer closing also remains disabled.
The completed operator trial is reviewed in the
[readiness audit](secondary-readiness-audit-2026-10-16.md); the switch remains off
and no further match is authorized. The prior
contested-movement investigation is stopped; its evidence, test-side corrections
and rejected secondary-army experiment remain intact.

## One opponent-independent strategy

A separate [supported-contest integration candidate](supported-contest-objective-2026-10-16.md)
defines validated stand-off travel to an isolated unarmed occupant, whole-group
movement preflight and a same-attempt capture handoff. It shares the existing
disabled switch and24/4 route budgets and changes none of the safe-capture rules
below. Its generated decisions establish no combat or capture benefit.

- **Territory:** centre is the initial anchor and retained defence reference,
  not a permanent destination for every available actor. Seek additional flag
  income with a supported existing squad when defence and observed conditions
  permit. Denying enemy income matters separately from gaining neutral income.
- **Engagement:** preserve local attack opportunities, spacing, support pauses
  and bounded rejoin ahead of travel. A scoring lead does not justify entering
  unsupported combat, and proximity to a healer does not guarantee sufficient
  healing. Do not chase an opponent name, version or a replay-specific position.
- **Support:** keep functioning weapons and healing together and retain armed
  centre defence with healing access. Existing escort ownership wins; do not
  commandeer its healer or a pair-controlled actor.
- **Persistence:** commit to one eligible objective rather than greedily switch
  each tick. Capture, changed ownership/binding, danger, lost support, lack of
  displacement and a deadline end the bounded assignment.
- **Fallback:** release the objective and return control to ordinary centre,
  combat and support movement. This is not guaranteed physical return. Later
  reassessment/chaining requires a separately reviewed orchestration component.

This is one strategy across opponents, with observable conditions deciding
whether to pursue territory or retain combat readiness. It does not promise
that every scoring deficit has a safe territorial solution.

## Counterexamples, not fitted trajectories

Watson replay `6ad236fd74ae43435a65c66f` ended 6,205–24,288, all 28 alive and
full-health, five versus twenty final income. Owned-centre fallback alone is
insufficient. The [previous evaluation](secondary-army-objective-evaluation-2026-10-16.md)
does not demonstrate an Arena movement constraint or a successful departure.
Its actual tick39 squad C contains the only healer within centre range3: the
new defence requirement rejects that particular departure before route checks.
No threshold was lowered to make C qualify, and no historical capture is inferred.

Golden Eagle replay `6ad152e374ae4378a665afb2` had contact at37, melee contact40
and first casualty44 despite the early lead. The retained tick43 snapshot has
injured friends and armed contact; the selector refuses territorial departure.
The regression uses a labelled generated group binding on that snapshot, not
invented historical membership. Its build predates current support/spacing/
spillover changes; it supplies observations, not a current-runtime replay.
Both regressions reuse resident repository projections, not original responses
or the dataless manifest. Generated favorable routes are a separate case.

## Pure contract and eligibility

`selectSecondaryObjective(input, previous)` in
[`objectives.js`](../../src/strategy/objectives.js) consumes a complete current
observation, explicit `centreId`, **one caller-supplied existing squad**
`{id,memberIds}`, bounded routes and `unavailableIds` for other controllers.
It does not form/reassign squads, choose between squads, search paths, issue
commands, log, read files, mutate arguments or reserve an actor.

Require all seven distinct flags with known ownership (`true`, `false` or
`undefined`, never `null`) and the rules' exact effect counts/scoring rates.
Require at most14 actors per side, unique identities, valid observed positions,
health/fatigue and at most50 known body parts. `observationComplete:true` is a
caller attestation, not something the selector can independently establish.
Unknown or oversized representations reject explicitly, never truncate.

Centre must be the explicit vulnerability flag and owned. The existing squad
has2–4 distinct living, functioning-MOVE actors, each with a functioning weapon
or HEAL, zero fatigue, and no competing controller ownership. Every departing
member and every actor in the unchanged retained-defence set must be full-health.
Require a squad weapon and healer, with every squad
weapon within ranged-heal distance3. Retain at least two non-squad functioning
weapons and a functioning healer within centre range3, excluding unavailable
actors; both retained weapons must also be within3 of a retained healer, not
merely at opposite edges of the centre radius. This conservative presence gate
is not a combat-strength calculation.

The health scope is the union of the proposed squad and **all** living
non-members within centre range3 who are not unavailable to this controller.
This is exactly production's retained-defence set, not a chosen healthy quorum:
surplus and unarmed members of that set must also be healthy. Injury outside
both sets alone no longer vetoes entry or continuation. Do not omit an actor,
normalize its HP or ignore malformed observations; complete original health and
body observations still feed validation and utility. Full health is necessary
inside this union, never sufficient: check
functioning weapons/HEAL/MOVE, fatigue, current healing range, independent retained
defence and local danger as well. Healing access means an observed functioning
healer within range3; it neither reserves that healer's action nor establishes
adequate healing capacity against incoming damage. An injured outsider can still
require the departing healer: ordinary healing/support ownership then cancels
capture travel before any objective step, with the existing attempt spent.

`no-eligible-squad` is the coordinator's aggregate result. Membership
participation/capability/mobility filters run first; surviving groups reach the
pure selector's availability, scoped health, squad support, retained defence and
local-combat checks in that order. A first failure can mask independent later
failures. The [three-poll reconstruction](secondary-readiness-audit-2026-10-16.md)
found no otherwise compliant departure incorrectly rejected by the health scope;
removing that scope would not qualify any examined squad. That historical audit
remains a no-defect finding. The later generated policy comparison and inactive
integration intentionally change health scope, not those historical conclusions.

Reject armed enemies within5 of centre/group. Secondary choices are any unowned
attack, ranged or healing flag; no family/name/coordinate is preselected. Reject
occupied targets, armed enemies within5 of the flag or any reported route node.
All enemies, including unarmed scouts/healers, must have geometric distance to
the target **strictly greater than** the slowest group route length +5. That is
a conservative arrival lower-bound comparison, not a route, occupancy forecast,
recapture prediction or proof of safety against enemy movement.
Even best-case travel plus one observation must leave time before tick2000;
otherwise there is no useful scoring opportunity and the candidate rejects.

Each route report binds actor/flag IDs, current validation `tick`, exact `from`, `path`,
`incomplete:false` and integer `ops<=5000`. Paths must be contiguous one-cell
steps, finish at the selected flag and have at most40 cells. Missing/stale/
incomplete/conflicting/malformed reports cannot qualify. The caller must obtain
real reports (or observation-rebased cached suffixes as specified below)
through existing bounded Arena routing; the pure function cannot
certify terrain or resolve moving obstacles. Tests' generated paths make no
Arena traversability claim. No movement simulator is introduced.

### Route adapter contract and unresolved live rejection — 2026-10-16

The [official Arena API](https://arena.screeps.com/docs/#searchPath), local
`screeps-arena-api.md` searchPath section, and bundled tutorial typings agree:
`searchPath(origin, {pos: target, range: 0}, {maxOps: 1000})` returns an object
with `path` (positions), `ops` (number), `cost` (number) and `incomplete`
(boolean). No cost matrix means terrain-only routing. `maxOps` caps search
operations, not path length or cost; no explicit `maxCost` is supplied. Range0
requests the exact flag cell. None of those result fields is marked optional
by the inspected API contract. The adapter does not consume `cost` or extra
telemetry, so their presence/absence does not affect selection. That tolerance
does not make them optional in the documented API.

The coordinator additionally requires integer `ops` in0–1000 per call and a
path array of at most40 cells. Missing/invalid operation counts or a thrown
search set `reportedOps:null`, never an invented zero. A zero is meaningful
only when no query occurred or every counted result explicitly reported zero.
In the pre-instrumentation build, after adding valid ops, a non-array/over40
path or a non-boolean `incomplete` returned `route-result-unsupported` and
abandoned that poll (or terminated an active attempt). A legitimate long API
path therefore exceeds this policy's
bound; that build deliberately did not truncate it or search a
fallback squad. `incomplete:true` is a supported result but cannot qualify its
objective. Within-bound paths still require integer in-map coordinates,
adjacency, endpoint, freshness and all threat/support/defence checks in the
pure selector. Cost telemetry is not a substitute for any of these gates.

Replay `6ad27ca2abefcb58b4c8f18e` visibly emitted the accepted enabled build.
Only four retained polls are available: ticks39/49/59/69 each report9 queries
and numeric operations498/312/311/311. In this exact implementation that
excludes the thrown/missing/invalid-ops branch and narrows the ninth result to
the path-array/path-length/completeness-type predicate. It does **not** identify
which field failed. Distinct generated results reproduce the same aggregate
diagnostic. A long path, absent boolean, or non-array path remain hypotheses,
not recovered native values. No adapter incompatibility or corrective runtime
change is established. Keep the experiment disabled; do not weaken validation.

The smallest missing observation is the original failed query's tick, ordinal,
actor/target IDs, result-container type, `Array.isArray(path)`, path length,
`typeof incomplete`/value and ops type/value, bound to the emitted build and
`maxOps:1000` call. Full path bodies are unnecessary. That build's diagnostics
did not retain these fields; another read of its console summaries cannot
recover them. The audit made no cache read, new observation mechanism,
activation or match.

Five added real-flow checks cover documented objects/unconsumed telemetry,
operation boundaries and unknown counts, diagnostic ambiguity, malformed and
non-finite coordinates, continuity/endpoints, incomplete routes, the40/41-cell
boundary and active-refresh fencing. Existing tests retain default-off
equivalence, safety, ranking and one-attempt coverage. These are synthetic
guard checks on unchanged runtime, not failing-before/passing-after evidence
for a fix or proof of native movement/capture. Focused results and preservation
are retained in the
[audit receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-route-adapter-audit-20261016-90onoF/report.json).

### Bounded branch-specific route diagnostics — 2026-10-16

The initial inactive instrumentation changed evidence, not route acceptance
(the acquisition-only follow-up below supersedes its whole-poll limit handling):

| First rejecting predicate (existing order) | Diagnostic reason |
| --- | --- |
| Search throws, result missing, or invalid/out-of-budget ops | `route-result-unsupported` |
| `path` is not an array | `route-path-unsupported` |
| Path array exceeds40 cells | `route-limit-exceeded` |
| `incomplete` is not boolean | `route-incomplete-unsupported` |

An oversized path is a **route-limit** rejection, not an unsupported API shape.
The initial instrumented build stopped the poll at its first rejected query;
it neither trimmed a path, tried another squad nor changed cadence.
Active-refresh rejection still finishes
the same one-attempt state. Query order,24/4 call caps,1000 requested ops per
call, operation accounting, selector/ranking/safety and tactics are unchanged.
The returned `ops` gate still precedes all three path/completeness gates.

Only on the rejecting tick, the existing `game-state.secondaryObjective`
includes one `rejectedQuery` object with these fixed fields:

- `ordinal`: one-based query count within that planner call;
- `origin` and `goal`: `{x,y}` copied from the validated actor/flag coordinates;
- `pathType`, `pathIsArray`, `pathLength`: controlled type label, array status,
  and array length only (otherwise `null`);
- `incompleteType`, `incomplete`: controlled type label and actual boolean only
  (otherwise `null`);
- `ops`: known nonnegative safe integer count, otherwise `null`. A known1001
  can be reported here while aggregate `reportedOps` remains `null` because
  the existing1000-op validation rejected it. Missing counts are never zeroed.

Type labels are `undefined`, `null`, `array`, or a JavaScript `typeof` label
(`boolean`, `number`, `string`, `object`, `function`, `symbol`, `bigint`). A thrown
search has no returned fields: type labels become `unknown`, array status and
values become `null`. No exception message is retained. Missing fields on a
returned value use `undefined`, distinct from explicit `null` and unavailable
fields after a throw. Valid/non-rejecting ticks omit `rejectedQuery`; it is not
cached in match-local state or repeated on later terminal/cadence ticks.

No path cells, raw objects, unbounded strings, stack, new record type or logging
stream are added. The summary has fixed keys and bounded scalars even for a
maximum-length sparse array or malformed values. Generated checks require the
summary below400 JSON characters and the complete planner diagnostic below1500.
The existing pre-action snapshot emits it; no route is re-executed and no command
is added. This does not measure its CPU/logging overhead in Arena.

The branch and compact values in a future independently authorized, build-bound
execution could identify the first rejecting predicate and its observed result
shape/limit. They would not recover the historical ninth result, describe later
unexecuted queries, prove an API defect or establish movement/capture/benefit.
This change authorizes no activation or trial; the experiment stays off.

Failing-before/passing-after synthetic results, inactive build and preservation:
[instrumentation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-route-diagnostics-20261016-muC0EB/report.json).

### Candidate-local acquisition route limits — 2026-10-16

The fresh instrumented execution of build
`690bd5a45b9d3351c4b7cfc4768cfa8f1fa371304522f2b4ced8e7ab67fbaf1a`
visibly reported tick39, `route-limit-exceeded`, query9, origin(45,43),
goal(90,8), array length45. Its individual ops and completeness fields remain
unreadable; neither those values nor a useful alternative in that match is
inferred. A separate generated real-flow reproduction demonstrated that a
later overlong result discarded four already-computed valid nearby routes.
That is an acquisition-coordination defect, not a change to route admissibility.

Acquisition now excludes only an inadmissible **flag**, using two bounded stages:

1. After existing eligibility/occupancy/threat/time screening and deterministic
   flag-ID ordering, compute the maximum Chebyshev distance from any selected
   squad member to the flag. For the documented range0 goal, every route must
   reach the exact cell. A one-cell diagonal step reduces this distance by at
   most1; obstacles cannot shorten it. A lower bound **greater than40** therefore
   excludes that flag before search. Equality40 remains searchable. This is an
   impossibility proof, not an estimated traversable route or a new threshold.
2. For searched acquisition results, still require valid in-budget integer ops,
   an array path and a boolean `incomplete`. An array over40 cells then excludes
   that flag: discard its previously collected member reports, skip its remaining
   queries, and continue the same ordered candidate list. No path is truncated,
   traversed or presented as valid merely because it was excluded. Overlong path
   cells are not inspected: they are never eligible input to the selector, and
   iterating unbounded arrays would violate the work bound. `incomplete:true`
   cannot qualify either an overlong or a within-limit route.

Missing/invalid ops, a thrown result, non-array path or non-boolean completeness
still aborts the poll conservatively, even when a returned array is overlong.
Thus acquisition checks completeness before treating an oversized array as a
candidate exclusion; unknown required data is not hidden behind a size limit.
Within-limit paths retain the unchanged selector's coordinate/continuity/endpoint,
freshness, threat, support and defence checks. No excluded flag can be selected
from a subset of its members' reports. If no useful flag remains, ordinary
`no-useful-objective` fallback/cadence applies; no fallback squad or retry is added.

Active assignments **do not use these exclusions**: refresh still rejects an
over40 array with `route-limit-exceeded` before the existing completeness check,
finishes the same one-attempt state, and cannot reacquire. Ranking, retained
defence, readiness, controller ownership, tactics and all switches are unchanged.
Each member/flag pair is queried at most once. Acquisition stays at most24
calls/24,000 requested ops; refresh stays4/4,000; each call still uses maxOps1000.
Skipping work never replenishes either budget. Selector path-cell/threat bounds
are unchanged; no oversized array is mapped or scanned.

The existing diagnostic optionally adds `excludedCandidates` with `geometry`
and `routeLimit` counts (at most6 in total) and only one `first` example:
`{flagId,reason,lowerBound,queryOrdinal,pathLength}`. Geometry uses reason
`geometric-route-limit` and null query ordinal/path length. Searched exclusions
use `route-limit-exceeded` and known ordinal/array length. The first example is
from the deterministic geometry prepass, then queried exclusions; it is not a
claim that later flags were searched. Counts and example are local to this call.
The top-level reason remains selection/fallback or an actual poll failure;
`rejectedQuery` remains reserved for poll/active-refresh failure, not exclusions.
Both diagnostics may coexist if a later searched result fails structurally.
No path arrays, raw objects, second stream or roster copies are added. Tests
bound the exclusion summary below400 and complete diagnostic below1500 JSON
characters, including maximum-length IDs.

Six new generated flow checks plus affected selector/integration checks cover
failing-before/passing-after mixed objectives, flag/input ordering, all-overlong
fallback, malformed long envelopes,40/41 boundaries, original maximum budgets,
partial-candidate discard, bounded diagnostics, active refresh and default-off
equivalence. These are not a replay resimulation or demonstrated Arena capture,
survival or strategic benefit. The candidate remains disabled; no match is
authorized. [Correction receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-candidate-route-limits-20261016-Er74ae/report.json).

## Ranking and explicit uncertainty

For each eligible flag:

1. `swing = captureIncome + deniedIncome`: neutral gives3/4, enemy-owned6/8.
2. Sum current nominal capacities across each living army: functioning ATTACK
   parts×30, RANGED_ATTACK×10, HEAL×12, multiplied by current owned-flag effects.
   The vulnerability flag affects incoming damage, not these outgoing capacities.
3. Added own loss is20% of base ATTACK/RANGED capacity or25% of base HEAL
   capacity. For enemy-owned flags, also record capacity restored to the enemy
   when its corresponding penalty disappears. First/second penalties use the
   rules' additive multipliers (e.g.1→.8→.6), not repeated multiplication.
4. `utility = swing / (maxRouteSteps + 1) * (1 - ownLoss/currentOwnCapacity)
   / (1 + enemyRelief/currentEnemyCapacity)`. Enemy relief is zero when the
   observed enemy army has no relevant capacity. All terms are returned.
5. Highest utility, then shorter maximum route, then lexicographic **flag ID**.
   Only exact ties depend on flag identity. Friendly/enemy ID renaming, input
   permutations and reflection do not otherwise alter the decision.

This deliberately simple ranking mixes nominal offensive/healing HP per tick
as a heuristic. It is **not** expected damage, healing allocation, retained
income, route travel time or win probability. Ranged healing supplies4 rather
than12 per part at distance2–3;12 is an optimistic adjacent-capacity index,
not an assertion of available healing. Unknown future combat/traffic is not
normalized away. Higher income can still be strategically worse. No optional
weights, opponent profiles, simulation or threat-prediction framework is added.

## Selection audit: two retained acquisition polls — 2026-10-16

Replay `6ad28460abefcb0237c8f1fe` emitted the corrected enabled build
`5fe52fec396442e31ef96b76efb0c25cd6bac656068aa6107ae623ef085ae4e4`.
The tick49/129 audit leaves runtime unchanged and disabled at
`d1ca04f0f3d6a804dceff08302231042a874c5769292c2bd5b928c0f98b4639f`.
Opponent identity is an evidence label only.

`no-useful-objective` means the candidate evaluation array is empty, before
sorting; there is no minimum-utility or positive-net-score veto. Candidate
occupancy/threat, route validation, remaining time and enemy-arrival checks
all precede utility calculation. Enemy ownership alone does not reject a flag;
it adds denied income and restored enemy combat capacity to its evaluation.
The arrival guard includes unarmed enemies, deliberately: every living enemy
must be farther from the target than the slowest squad route plus5. This is
the accepted conservative competition gate, not proof of enemy intent or a
physical inability to capture. Removing it would change policy.

All three squads passed the tick49 pre-route readiness screen; A/C tied at
maximum weapon/healer gap2 and three weapons, so A won the stable ID tie.
At129, B failed support (gap4); A/C again tied at2 and A won. These inferences
use retained membership, full-health functioning-part snapshots and controller
rules; neither poll has an active escort, and the other controllers are off.

In the table, `Lmin` is the maximum member-to-flag Chebyshev distance, in
cells; `d` is nearest-enemy distance. A valid route has `L >= Lmin`.
The arrival guard rejects `d <= L+5`. Pre-search exclusions occur before any
route report exists. The selector may reject a malformed/incomplete/unsafe
report earlier than the independent arrival failure shown here.

| Flag suffix | Tick49 decision | Tick129 decision |
| --- | --- | --- |
| vulnerability | Owned centre; excluded from secondary candidates | Same |
| attack_reduction_a | Searched; independent arrival failure: Lmin20, armed enemy d19 <=25 | Enemy occupies flag (ranged_2); excluded before search |
| attack_reduction_b | Armed ranged_3 at distance4 <=5; excluded before search | Enemy melee_1 occupies flag; excluded before search |
| heal_reduction_a | Geometry43 >40; excluded before search | Enemy ranged_1 occupies flag; occupancy takes precedence over geometry43 |
| heal_reduction_b | Geometry42 >40; excluded before search | Enemy ranged_3 occupies flag; occupancy takes precedence over geometry41 |
| ranged_attack_reduction_a | Searched; independent arrival failure: Lmin37, armed enemy d22 <=42 | Four searched member reports; independent arrival failure: Lmin36, unarmed scout_2 d2 <=41 |
| ranged_attack_reduction_b | Armed melee_4 at distance3 <=5; excluded before search | Query5 returns41 cells: candidate excluded; Lmin37, enemy d7 also fails arrival if a valid bounded route existed |

Tick49 searched only attack-A and ranged-A. Five calls and one route exclusion
mean one flag supplied four bounded envelopes and the other was excluded on
its first call; the first-exclusion diagnostic recorded a geometry exclusion,
so it **does not identify which searched flag was overlong or its ordinal**.
Both searched flags independently fail the arrival bound. Tick129 identifies
the overlong flag explicitly. No candidate reached ranking at either poll.
The exact first route-level predicate for the other returned reports remains
unknown: no path bodies, per-query ops or completeness values were retained.
Known aggregate operations are202/454 for five queries at49/129. No searches
were rerun to manufacture historical results.

For both full preset armies, base nominal capacity is ATTACK960 + RANGED300
+ HEAL216 =1476 HP/tick. Our current total is1476 at both polls. Enemy current
capacity is1416 at49 (one ranged penalty),864 at129 (both penalties of every
secondary family). Internally capacities and losses both carry the same
factor100; their ratios cancel it. There is no percentage-unit arithmetic bug.

These are **counterfactual components**, not executed rankings. `g/d` denotes
income gained/denied in score per tick; loss/relief are nominal HP per tick.
All actual utilities and exact maximum route lengths remain unavailable.

| Flag family/ownership | Tick49 g/d; own loss; enemy relief; utility if admissible | Tick129 g/d; own loss; enemy relief; utility if admissible |
| --- | --- | --- |
| Attack A/B | 3/0;192;0; 2.609756/(L+1) | 3/3;192;192; 4.270510/(L+1) |
| Heal A/B | 4/0;54;0; 3.853659/(L+1) | 4/4;54;54; 7.253945/(L+1) |
| Ranged A | 3/0;60;0; 2.878049/(L+1) | 3/3;60;60; 5.382325/(L+1) |
| Ranged B | 3/3;60;60; 5.522110/(L+1) | 3/3;60;60; 5.382325/(L+1) |

Own multipliers would change1→.8 for attack/ranged or1→.75 for healing.
At49 only ranged-B relieves an enemy penalty (.8→1); neutral captures give no
enemy relief. At129 the enemy changes .6→.8 for attack/ranged or .5→.75 for
healing. The scalar formula is
`(g+d)/(L+1) * (1-loss/ownTotal)/(1+relief/enemyTotal)`.
`L+1` is an optimistic step/observation delay, not measured travel time,
pathfinder terrain cost, cumulative future income or a win estimate. Available
time would be at least1830 ticks for any bounded route at129 (1910 at49), so the
2000-tick gate cannot exclude an otherwise valid <=40-cell report here.
Healing uses nominal adjacent12 HP/part/tick, not guaranteed ranged healing.
No prior score deficit enters this heuristic, and no weights are tuned.

Five generated full-preset tests show low-threat scoring-deficit selection,
independently normalized utility, safety/support/arrival rejection, absent and
oversized routes, ownership termination and deterministic invariance. Together
with affected real-flow checks,56 pass on Node24.19.0. The initial test-only
expectation for a healer with zero functioning HEAL was corrected to the
earlier `squad-unavailable` gate; this was not a runtime failing-before case.
No general selection defect or otherwise contract-compliant rejected candidate
is demonstrated. Keep disabled; do not infer capture or a winning trajectory.
[Evidence and limitations](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-selection-audit-20261016-K7wUqL/report.json).

## Shared validated capture/contest travel — 2026-10-16

The completed functional trial selected ordinary capture at99 and cancelled
at102 when observed ranged/healer distance became4. Independent `moveTo`
commands did not establish coordinated displacement. The retained
[lifecycle review](/Users/zoltanka/.local/share/pain-and-gain-evidence/supported-contest-functional-trial-20261016-xlyPVh/capture-lifecycle-review.json)
is historical evidence, not a replay resimulation or a claim that this revision
would have captured. No replay was reread for this correction.

All active secondary travel now exposes first adjacent cells from the already
validated, selected-target reports to the existing `prepareSecondaryMovement`.
Capture uses the same direct `move(direction)` actuator, occupancy/collision
hold and group support preflight as contest. No second planner, search or
formation/traffic framework is introduced. Capture admission/ranking and
contest admission/handoff remain separate and unchanged.

| Owner | Preflight movement priority |
| --- | --- |
| Ordinary capture | Only `flag-fallback` is replaceable. Any combat approach/hold, recovery, emergency/support, escort or pair ownership cancels the whole assignment before objective commands; ordinary priority movement then executes. |
| Contest origin, including capture handoff | Existing behavior: compatible combat approach/in-range movement can be replaced by validated travel; emergency/support/escort/pair conflicts cancel first. |

Each weapon needs one functioning selected healer whose current and requested
positions cover **all four** weapon/healer moving-or-stationary combinations
within range3. Capture may have multiple healers: test each without relying on
ID/input order; a different healer can support each weapon. This is a sufficient
conservative check, not nominal combat-capacity or reserved-healing evidence.
The one-healer contest case is unchanged. Current observed functioning support,
retained centre defence and all existing selector safety gates still revalidate
before route reuse/refresh. Unsafe prospective support cancels with
`capture-step-support-unavailable` (existing contest reason unchanged).

After original priority, validated-step, full support and known-occupancy checks,
occupied/converging cells can admit a safe subset for a four-member group.
The shared selector examines at most16 subsets, using only currently empty,
distinct original cells and the same all-outcome support check. Among equal
maximum-size subsets, only their common moves proceed; unresolved contenders
remain **objective-owned holds**. Two/three-member blocked groups retain whole
holds. No swap/vacating-cell assumption, alternate route, reservation or fairness
state is added. Full support failure still cancels, never salvages a subset.
Unknown occupancy/route steps cancel. Every hold consumes the original elapsed/stall
allowance; it creates no grace period. Even failed or unknown returns do not
advance cached positions. Only subsequent observations can rebase a route or
reset the existing unchanged-position counter. Four unchanged observations or
60 original elapsed ticks still terminate; terminal attempts cannot reacquire.

Acquisition stays<=24 queries/24,000 requested ops; active refresh/handoff
stays<=4/4,000; routes<=40 cells, maxOps1000/query, five-tick freshness. There
is no budget/deadline reset or additive preflight search. Diagnostics use the
existing movement record: `capture-route-step` / `capture-route-hold` versus
unchanged `contest-route-step` / `contest-route-hold`, position/null-ID targets
and actual return/null. Attack/healing selectors/order and disabled commands
remain unchanged. No new switch or logging stream is added; the optional
snapshot extension is specified below.

The current pre-action `secondaryObjective` additionally includes `travel` only
after valid active preflight: `{examined,bestSize,tied,actors}`. At most four
actors have `{actorId,proposed:{x,y}|null,admitted:{x,y}|null,holdReason}`.
Reasons are `null` for admitted moves, otherwise `occupied`, `converging`,
`no-step` or `group-hold`. These are intentions, not returns/displacement or
proof that a safe tied singleton was chosen. No paths or raw objects are copied.
The extension is <1200 JSON characters at maximum128-character IDs, while the
original diagnostic excluding `travel` retains its <1500 bound; combined <2700.
No log records/queries are added. See the linked integration for exact semantics,
generated coverage, limitations and rollback instructions.

Generated distinct-cell multi-tick regression first fails on the old independent
capture calls: only weapons move and range3 becomes4. The corrected candidate
refuses those steps before issuance. Separate positive generated observations
advance along validated cells through suffix reuse and a four-query refresh;
all16 moving/stationary subsets satisfy support at each permitted step. Tests
also cover unknown/rejected returns, blocked/colliding cells, stale malformed
refresh, support/capability loss, priority conflicts, multiple healers, mirrored
geometry, contest/handoff and disabled equivalence. These positions are supplied
test inputs, not an Arena coordination, capture or causal-benefit demonstration.

Remaining limitations: unresolved ties/fully occupied steps can still deadlock
range0 routes or prevent a feasible departure. Partial progress can later cause
support cancellation rather than complete departure. No queue, alternate route or
wait extension is added to force capture. Observation gaps, external enemy
movement, terrain fatigue and fallback after release remain live uncertainties;
preflight protects only the issued one-step/stay outcomes, not guaranteed return
or combat safety. The experiment stays off; no match is authorized.

Validation:187 affected generated checks pass, including11 new capture-travel
checks; build generation/check, `npm run check` and whitespace review pass.
The failing-before regression, full results, task-local diff and preservation
are retained in the [inactive-candidate receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-shared-travel-20261016-ZmGw2g/report.json).

## Persistence, termination and integration boundary

Pin centre identity/coordinates, squad/member IDs, target identity/coordinates/
effect/score, owner at selection, start tick and observed group positions.
Revalidate the same target each observation, ignoring more attractive alternatives.
Capture ends it; neutral↔enemy ownership change ends it rather than silently
changing the bargain. Binding changes, eligibility/route loss or danger end it.
Terminate at60 elapsed ticks or four consecutive **unchanged-position**
observations. Moving detours do not count as stalled; absolute lifetime still
bounds them. Same-tick repeats do not spend another observation. Terminal
state remains terminal until a strict tick rewind/new match-local state; no
same-match automatic reacquisition, patrol, retry or repeated capture exists.
Idle pre-entry rejection may be reconsidered on a later bounded call.
Malformed tick values do not reset an active attempt: they terminate it while
preserving the last valid tick, so later valid input cannot replenish the attempt.

Return `centreId` separately from `objectiveId`, reason, evaluation, work counters
and a fresh state. Terminal/idle results use centre fallback; malformed centre
bindings cannot establish a safe destination and must be fenced by a future
caller. Previous state must be this selector's own caller-owned match-local output.

The shared preflight above owns validated adjacent travel, not independent
secondary `moveTo` fallback. Capture still replaces only `flag-fallback` intent;
other movement priorities cancel ownership for the whole group first. The
objective is **not** passed as the original flag argument to `selectMovementPlan`:
centre/rejoin anchors remain unchanged. At most one movement command per actor
is issued. The old standalone `ordinaryFallbackById` executor seam remains for
compatibility; integrated active travel uses the guarded direct-step map.
Post-assignment chaining remains unwired.
Unchanged `selectFlag(flags)` still identifies the original centre, including
its existing API-observation-order behavior. Equivalent-order tests preserve
that binding and reorder actors, squads and secondary flags, not redefine centre.

## Pure-component bounds and accepted validation

At most28 input route reports (7×4), each40 nodes and5000 reported search ops:
140,000 reported ops maximum, **zero searches performed by the selector**.
At most6 candidates ×4 members =24 evaluated routes,960 path nodes and13,440
route-node/armed-enemy distance checks (14 enemies). Validation/body/defence
scans are also capped by the fixed roster/flag/body bounds. These are operation
counts, not measured Arena CPU cost. No successful capture/return is simulated.

[`secondary-objective-selection.test.js`](../../tests/unit/secondary-objective-selection.test.js)
covers utility, penalties, income/denial, deficit/contact counterexamples,
threats, unavailable roles/routes, ownership, persistence, termination,
immutability, finite budgets, stable ties, ID renaming,20 deterministic input
permutations and horizontal/vertical/both reflections. Affected movement,
escort, membership, scout and tick-flow checks passed:21 new selector tests and
39 compatibility tests,60 total on Node24.19.0. `npm run check` and whitespace
checks passed. WebStorm found no errors and three weak inference warnings
(guarded rule fields and a test-side `Array.from` overload); none suppressed.

Dormant-component source build:
`4e89a11724985e99fcc0c8d59e01e38ba68bdd7785527d3bdeaba647fc45feb4`.
This was the completed pre-integration identity/validation, not the current
integrated candidate. No capture, survival or victory was demonstrated.

[Commands, intermediate failures, pins and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/general-secondary-objective-20261016-nSa9dx/report.json).

## Default-off tick integration

`runTick` invokes `planSecondaryObjective` only when the new switch is exactly
true. Existing scout off / escort on / holding off / pairing off are unchanged.
The original centre is still logged as `selectedFlagId` and supplied to all
existing safety and tactical code. Scout overrides, escort healer **and ally**,
and actors in paired movement are excluded before secondary selection, including
from its retained-defence count.

Use only initialized, current existing membership, at most3 squads/14 members.
Each candidate member must still participate, be capable and mobile. Apply the
unchanged pure selector with empty routes as a zero-search eligibility screen;
only a `no-useful-objective` result has passed its global role/support/defence
gates. Choose the eligible squad with the smallest maximum weapon-to-nearest-
healer distance, then most functioning weapon actors, then stable squad ID.
No roster is formed or rearranged. One squad is evaluated per acquisition poll,
not every possible squad/flag pair; this is a cost bound, not global optimality.
Another group can qualify when the previously preferred group is unavailable.

First poll occurs when centre is owned and membership usable; subsequent idle
polls are at least10 observed ticks apart. Filter occupied/near-armed targets
and those whose geometric best case cannot leave scoring time before tick2000,
then query all remaining secondary flags for that squad through Arena
`searchPath(actor,{pos:flag,range:0},{maxOps:1000})`. Queries are terrain-only
under the documented API default; they do not resolve dynamic occupancy.
At most6 flags×4 members =24 queries/24,000 requested ops per acquisition tick.
Unknown, over-budget or thrown results stop that poll with an explicit reason
and baseline movement. Acquisition-only candidate exclusions above remove
geometrically impossible or structurally known overlong results without cancelling
other flags. Incomplete paths cannot qualify their objective.
Unknown/invalid operation reports use `reportedOps:null`, not a claimed zero.
There is no same-poll retry or fallback-squad search. Idle polls are bounded by
the arena's2000 ticks, not an unlimited watch or background process.

After assignment, retain only the4 selected-target routes (at most160 nodes).
Every tick, match each **observed** actor position to its cached origin or a
remaining path node; trim only the verified prefix. The derived report has the
current validation tick/from, while `searchedAt` and original reported `ops`
remain explicit. It is not relabelled as a new search. Recheck all selector
safety, ownership, route-node threats, support/defence and termination gates
against current observations on each tick. Reusable suffixes are valid for less
than5 ticks from search; expiry or off-path observation permits at most4 fresh
queries/4,000 requested ops that tick. Refresh uses the previous selector state,
not the provisional revalidation result, so no observation is counted twice.
Known terminal results do not search. An off-path route ambiguity may need a
bounded refresh before final eligibility can be determined.

Accepted `move` or `moveTo` does not advance this state. Four unchanged-position
observations terminate even when every command returned0. Cache expiry does not
replenish waits, change target or restart lifetime. Terminal state stays spent;
strict tick rewind resets the secondary attempt with the rest of match-local
state. Duplicate ticks cannot reset secondary state; invalid tick observations
cannot erase its last valid tick. Existing legacy bookkeeping still treats a
duplicate tick as a reload, so an inconsistent duplicate can terminate the
trial rather than reopen it.

## Diagnostics, rollback and trial prerequisites

No new record type or logging framework: when enabled, the existing pre-action
`game-state` includes `secondaryObjective` with phase/reason, squad/target/member
IDs, start/stall values, per-tick query/reported-op/cache counts and selected
utility/income/capacity costs. No paths, bodies or duplicate rosters are logged.
Generated flow checks keep this field below1500 JSON characters. Existing action
decisions now distinguish `capture-route-step`/`capture-route-hold` from the
unchanged contest names, and record requested positions and actual return/null;
next observations, not this planner summary, establish displacement.
Existing game-state parsing tolerates extra properties; no evidence schema,
admission policy or frozen compatibility artifact is changed.

Disabled behavior emits no new field, runs no planner/search and preserves
command choices. Imports remain Arena-compatible and relative within `src/`.
Operation bounds are not measured live CPU/headroom; nonowned `moveTo` navigation,
existing scout/pair searches and diagnostic work are additional costs. Owned
secondary travel performs no actuator path search. No
capture, safe return, defended outcome or strategic benefit is established.

Rollback after any separately approved future trial: change **only**
`secondaryObjectiveExperiment` to `false` in `src/config.js`; run
`npm run build-id:generate`, `npm run build-id:check`, `npm run check` and verify
the integrated-disabled build recorded below. Do not restore old objective,
executor or tactical files, reset the worktree, or alter earlier switches.
The switch is already false here; do not activate as part of this task.

Before one future operator-run trial: review this integration, explicitly
authorize enabling that one switch, verify the generated enabled build and
Arena's selected `src/`, then identify the emitted build in that match. Live
route completeness, progression, CPU and benefit remain unverified. Preserve
the one-attempt budget and restore the integrated-disabled identity afterward.

Integrated-disabled build:
`c4848e0778a69a178208a69cfa397031c962e7097a2c31e42660b540e74968fc`.
Focused validation:90 distinct checks, including15 new real-flow integration
checks, the21 accepted pure-selector regressions and54 affected compatibility
checks. `npm run check` and whitespace checks passed. No errors in completed
WebStorm inspections; weak inference warnings remain reported, not
suppressed. No Arena effect or live CPU measurement is inferred from these tests.

[Integrated commands, tests, review and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-objective-flow-20261016-3gyNga/report.json).
