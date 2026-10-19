# Opening centre support movement — test-only (2026-10-17)

Current status: **integrated, inactive**. The dated title and evaluations below
are retained history; the [current integration](#current-inactive-runtime-integration)
supersedes their test-only recommendation, not their recorded evidence limits.
No switch is enabled and no trial is prepared.

Original decision: **retain test-only**, not runtime integration or trial preparation.
The original evaluation below predates shared support-scope and occupancy routing;
the [current generated reevaluation](#occupancy-provider-reevaluation-2026-10-18)
uses both corrections without changing this candidate. At that evaluation it remained test-only;
the [shared support contract](objective-travel-support-scope-integration-2026-10-18.md)
and [opening occupancy contract](opening-occupancy-routes-integration-2026-10-18.md)
remain authoritative for production.
Only generated tests/helpers are published. The bounded retained-window extract
and its separate reader entry point remain local evidence; they are not fetched,
hydrated or executed by publication or generated-only validation.
The original evaluation pinned inactive build
`55bf14a37328b727ede0f65d51c75f558f79b51251217bb68627364895958553`.
No runtime, package, switch, build or index changes. Existing preservation
exceptions remain disclosed and untouched; no PNG/managed manifest access.

## Scope and production reuse

The [candidate](../../tests/fixtures/opening-centre-support-candidate.js) intervenes
only during an already active [opening mission](opening-deployment-integration-2026-10-17.md).
It uses the two unchanged retained four-member birth squads; it neither chooses
a healthier force nor changes the departing squad. The two scouts keep ordinary
movement. Centre identity remains the original vulnerability flag, not the
secondary destination. No force is claimed already defending centre.

Reuse production `selectMovementPlan`, `localRetreatStep`,
`secondaryStepSupport`, `selectSecondaryTravelSteps`, `moveCreeps` and
`executeTactics`. The [test transport](../../tests/fixtures/opening-centre-support-world.js)
merges admitted centre steps/owned holds and the already prepared secondary
steps into **one** existing executor pass. There is no second movement pass,
copied combat/healing selector, path search, formation, staging quorum,
persistent pacing state, retry or additional waiting allowance.

Before proposals, evaluate actual ordinary movement and escort/pair ownership.
Any combat, retreat, injury support, melee recovery, escort or pair conflict
hands off before commands and ends the test opening through its existing cancel
seam. Emergency movement/tactics then execute unchanged. This boundary does
**not** promise retained support after ownership is released. Inactive/finished
missions bypass evaluation. The prototype adds no deployed switch.

## Local steps, reservations and safety

For each of the eight centre squad actors, scan at most eight neighbours through
the existing local evaluator. Require known plain terrain, functioning MOVE,
zero fatigue, current vacancy, no existing reservation, no melee reach or newly
entered ranged envelope. Unknown/throwing terrain gives an owned hold. Require
strictly smaller Chebyshev distance to centre; among those cells prefer smaller
Chebyshev then Manhattan distance. Equal-best cells hold rather than introducing
an ID, input-order or reflection-dependent winner. No detour is invented.

Use the existing tick-local reservation `Set` representation, seeded with
external reservations and prepared secondary destinations. This is a local
projection, not persistent arbitration. Cross-centre-squad equal destinations
hold all contenders, before subset admission; no first squad wins. Ordinary
scout `moveTo` next steps remain opaque and can still contend with a destination.
Current occupancy never assumes vacating, swapping or successful engine moves.

Keep each unchanged birth squad's functioning weapon/healer support within3.
In addition to the shared weapon-to-healer check, retain the opening contract's
existing healer-to-at-least-two-weapons quorum for all independent move/stay
outcomes. This is conservative: a weapon keeps one healer covering every
current/next pair; a healer keeps two weapons covering every pair. It is not a
new staging threshold or summed damage/healing prediction. It preserves range3
access, not full adjacent-healing capacity for every healthy unit.

The complete proposed group must pass this support preflight. Otherwise hold
that group, rather than call the selector's support-unchecked fast path. Reuse
the shared maximum-size/common-move subset rule for within-squad convergence,
at most16 unique subsets per four-member squad. Removing moves preserves the
checked success/failure safety; held actors stay owned, not unchecked fallbacks.
At most64 neighbour terrain observations and two bounded subset selections are
added per tick. Existing selector/ordinary movement work remains separate.

The original centre-support cancellation, 24/4 objective query caps,1000 query
ops,40-cell routes,five-tick cache age,60-tick deadline and four unchanged
observations are unmodified. Accepted calls do not advance state; only the next
supplied positions can show progress. Persistent blocking still spends the
opening; there is no rearm/chaining or extra allowance.

## Retained reproduction and explicit evidence gaps

The separate local bounded extract `tests/fixtures/opening-centre-retained-window.json`
contains existing extracted ticks1–4 from replay `6ad3b318abefcb0465c90ae7`, build
`a0a80a0da58b334dd225fc92f35a23af0369241c6e113a1650a46b5dfe6b8f31`.
Its source path/SHA and original membership are recorded in the fixture. No
original cache/replay response, further match, map or terrain was read.
All actors are full health here; functioning counts sum to hitsMax/100 and
suffice for capability/nominal roles. Body-part order is not recovered.

Production reproduces all retained centre `moveTo(centre)` calls at ticks1–3.
At tick4 melee3/4 are (13,15)/(12,15), versus retained healers (12,10)/(15,9):
both weapons are ranges5/6 from them. The unchanged production opening controller
reproduces `centre-mission-unavailable` before a route query. Terrain, ordinary
`moveTo` adjacent paths, collision arbitration and intended centre steps are
missing; **no historical legal alternative or prevented separation is proven**.

The exact start can initialize production membership. All later candidate
terrain/routes/positions are explicitly generated. Supplying unknown terrain
produces no centre steps, not evidence that an alternative was legal.

## Comparisons and retained adverse outcomes

Generated successful positions are supplied only into prior admitted adjacent,
currently empty, distinct destinations. Return stubs do not mutate observations.
These are not a movement simulator or Arena arbitration.

| Case | Result |
| --- | --- |
| Role-separated full roster | Five observations progress both retained squads and the departing squad; initial routing only, unchanged start/deadline |
| Centre healers never displace | Ordinary generated weapons separate; candidate weapons advance within support then hold at its boundary while other useful progress remains |
| Centre/secondary crossing | A centre actor could reach a secondary-reserved (12,12) cell at the next observation; it does not issue that conflicting step. A retained healer's supplied failure remains support-safe |
| Within/cross-squad convergence | Shared bounded common-move subset selection or both cross-squad contenders hold; unrelated safe moves continue |
| All centre proposals blocked/unknown | Owned holds; no invented route. Mission still ends at the original stall/deadline bounds |
| Lost support or higher-priority owner | Cancellation before candidate commands; emergency/healing/attack traces match ordinary execution |
| Rejected/unknown/accepted-without-displacement | No inferred progress or new time; next observation rechecks |

Starting from the retained layout with generated plain terrain/diagonal reports,
centre move counts are **8,2,8,7,4,4** at ticks1–6, while secondary counts are
**3,1,0,0,0,0**. Centre support does not cancel, but secondary congestion still
terminates `no-displacement` at7. This adverse result is retained, not tuned away.
It demonstrates neither a historical alternative trajectory nor useful Arena
arrival/capture. The retained-layout continuation itself has no adjacent
secondary-destination reservation conflict; the separate generated crossing case
establishes that boundary, not this historical start.

## Validation and recommendation

Pure generated checks, with no retained reader in the import graph:

```sh
node --test tests/unit/opening-centre-support.test.js
```

Historical, separately authorized **local-only** retained-extract checks plus
generated continuation (reader and payload intentionally not published):

```sh
node --test tests/unit/opening-centre-support-retained.test.js
```

Combined focused result:24 checks pass (21 generated,3 bounded retained-extract),
no skips. Unaffected accepted production validation is reused. Tests verify all
16 independent movement outcomes per squad, ownership handoffs, real tactical
actions, one-command bounds, determinism under pinned-member renaming/input
order/reflection, malformed fencing, non-displacement and unchanged mission
bounds. No other historical-fixture entry points or existing gameplay suites
are run. The three explicitly selected retained checks read only the bounded
extract above, not an original response.

Development failures were fixture/harness errors: a duplicate observation,
consumed engagement state in a comparison, a convergence fixture with an
unrecognised equal-best tie, and an assumed diagonal rather than the fixture's
supplied horizontal-first route. Receipts retain those failures. No production
defect is claimed or hidden by a runtime change.

Retain this bounded test-only mechanism: it demonstrates useful centre progress,
not just universal holds, while preserving specified support/priority rules.
Do not promote or prepare a match. Unknown terrain, greedy one-step ties,
inability to detour, birth-squad conservatism and opaque ordinary scout/priority
movement remain limitations. The exact-start continuation still stalls the
departing squad. No Arena CPU cost, capture, safe arrival, prevented damage,
survival or strategic benefit is established.

Evidence, outputs and protection hashes:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-centre-support-test-only-20261017-C8eWOD/report.json`.

## Occupancy-provider reevaluation (2026-10-18)

Decision: **retain test-only**. Current inactive runtime is
`af6918502ec81ae1f4f9ebc6f65bf0e2cbfe800ba8a925c03ce4ff7c144fb0ae`.
The centre candidate and its executor transport are byte-unchanged. The new
[generated comparison](../../tests/unit/opening-centre-occupancy.test.js) calls
the existing [occupancy API transport](../../tests/fixtures/opening-occupancy-api-world.js),
production opening controller/cache, group preflight/subset helpers and single
movement/tactics pass. No independent route provider, controller, ID arbitration,
centre threshold, membership, timer or waiting allowance is introduced.

The task's RickStallion review is motivation, not an input: no replay, original
response, extracted observation or historical fixture is read here. Plain terrain,
fixed Arena-shaped corridor responses and next positions are explicitly generated.
The storage CostMatrix double does not find paths. Positive corridor responses
are checked against occupied-cell255 requests, with only the searching origin0.

### Comparison and observation semantics

Centre-only, ordinary split and supported split receive identical complete
observations, production membership and response families for eight ticks.
Only supported split supplies the reference next observations, through its prior
admitted adjacent, empty, distinct steps. Those same positions are then supplied
to the other two modes for a **decision comparison**. This does not predict the
ordinary modes' movement or claim they would produce that trajectory. Unused
legacy report tables are excluded from equality: the current provider reads the
fixed corridor family, not those tables. Return0 alone never changes positions.

| Mode/case | Generated result |
| --- | --- |
| Centre-only on the common observations | Fourteen ordinary centre `moveTo` calls per tick; no opening route requests or objective ownership |
| Ordinary split on the common observations | Same secondary assignment/cache decisions; ten ordinary centre fallbacks, without candidate centre ownership |
| Supported split, successful supplied steps | Centre commands7,8,8,8,8,8,8,8; secondary4,4,1,4,4,4,4,4. Across the seven observed transitions,55 centre and25 secondary admitted steps are supplied as displaced. Every retained weapon/healer and departing member finishes closer to its mission target |
| Centre healers never displace | Ordinary generated advancing weapons trigger `defence-unavailable` at4. Candidate centre-weapon commands6,6,3,1,0,0,0,0; secondary still progresses. Two repeated healer commands at5–8 are **not observed centre progress** |
| Mixed partial execution | Non-displacing retained healers, then departing healer, plus blocked centre actors retain support across seven observations; original start remains1 |
| Unchanged generated congestion | Secondary3,1,0,0,0,0,0; centre8,2,8,7,4,4,0; `no-displacement` at7,28 total queries. This adverse outcome is preserved |
| Escort or new centre injury | Ownership ends before candidate commands; ordinary tactical/priority trace is unchanged. Range-two injury uses the production `rangedHeal`, not prospective adjacent healing |

The positive case pays16 acquisition queries and4 age-five refresh queries at6,
with four cache hits on each other active tick. It demonstrates useful supported
progress, not just assignment or universal holds. An indefinitely stationary
centre healer still limits its weapons' progress; this mechanism cannot promise
sustained whole-army progress under arbitrary failures.

The congestion test imports only the existing **generated** `congestedWorld`,
not the similarly shaped retained payload. Its diagonal response tables and
intersection ties are unchanged. These deliberately convergent responses may
include occupied cells; they test conservative preflight/termination, not what a
real occupancy-aware pathfinder would return. Earlier congestion query counts
changed8→28 when occupancy refresh was integrated, not in this reevaluation.
The earlier generated ordinary support-loss cancellation at4 remains covered;
its first rejection is `defence-unavailable`, not the later stronger centre gate.
No historical alternative to the live tick-eight cancellation is established.

### Validation and limits of this reevaluation

Explicit generated-only entry points (no name filtering):

```sh
node --test --test-reporter=spec tests/unit/opening-centre-occupancy.test.js tests/unit/opening-centre-support.test.js tests/unit/opening-occupancy-routes.test.js
```

The60 checks pass. The21 existing centre checks and30 occupancy checks retain
cross-group reservations/traffic, all move/stay support outcomes, within/cross-squad
convergence, unknown terrain, no-safe-progress holds, current-support loss,
priority/emergency/rejoin/pair boundaries, malformed routes, blocked-cache refresh,
cache expiry/off-path changes and determinism. Nine new comparisons add the
common-observation three-mode chain, longer progress, partial execution, realistic
injury/escort cancellation, all three return classes and unchanged congestion.
Current-tick tactical calls remain production-selected and unchanged; the positive
healthy/distant-enemy chain itself exercises no healing or attacks.

Bounds stay eight centre actors/eight neighbours each,16 subsets per retained
four-member squad, shared reservations, one movement command per actor,24/4
objective queries,maxOps1000,40-cell routes,age5, start1/deadline61 and four
unchanged observations. All-stationary execution ends at5 for accepted, rejected
and unknown return values; absolute timeout still spends no queries at61.
No reservation for opaque ordinary scout steps, detours for centre ties, pacing
state, stronger post-priority-handoff guarantee or extra time is added.

Initial failures were comparison/expectation errors, retained in the receipt:
unused report-table differences; the earlier defence rejection; expecting direct
instead of range-two healing; counting repeated healer commands as progress.
No policy or supplied route was tuned in response. The first run's very large
assertion output was tool-truncated; its available output is retained, not claimed
complete. Subsequent results are compact and retained in full.

Keep this a bounded test-only candidate. Sustained support-safe progress is
demonstrated on supplied geometry, while original congestion and stationary-healer
limits remain. Runtime integration, Arena routing quality/displacement, arrival,
capture, CPU cost and strategic or survival benefit are **not established**.
Evidence and preservation receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/centre-support-occupancy-reevaluation-20261018-12TYsL/report.json`.

## Current inactive runtime integration

Starting build:
`af6918502ec81ae1f4f9ebc6f65bf0e2cbfe800ba8a925c03ce4ff7c144fb0ae`.
New inactive build:
`3aa8a15f0e2923f8df93cbb56ba0f1f23350eb1f8cba25874b17139bd9d67782`.
All config bytes remain unchanged: opening deployment, secondary objectives,
engagement and closing are off; existing healer escort remains on.

### One policy and the single movement pass

[opening-centre-support.js](../../src/strategy/opening-centre-support.js) promotes
the tested policy, without changing its predicates, scoring or bounds. The old
[fixture](../../tests/fixtures/opening-centre-support-candidate.js) re-exports
that implementation and retains only test transport. No parallel planner remains.

[runTick](../../src/loop.js) calls it only after the departing squad has passed
`prepareSecondaryMovement`, while the opening state is active. Inputs are the
same complete pre-action observation, production birth membership, original
`centreId`, prepared four-member secondary move map, Arena terrain lookup and
existing engagement/escort/pair contexts. There are no predicted positions or
fabricated centre ownership. The two retained birth squads contribute eight
actors; the two scouts remain ordinary. No member or route-cache set is enlarged.

Reserve admitted secondary destinations first. Reject cross-centre-squad
convergence, then apply the unchanged stronger full-proposal support quorum and
shared intersection subset selector separately to each retained squad. Null
entries are owned holds. All admitted move/stay combinations retain weapon/healer
access and the two-weapons-per-retained-healer quorum. Current occupancy forbids
vacating-cell entry, swaps and assumed command success. Opaque scout movement
still has no known next-cell reservation.

Only the ephemeral executor map is merged. Centre membership, positions and steps
never enter secondary route caches, progress counters or deadline state. Centre
preparation adds at most eight neighbour checks per eight actors and two selections
of at most16 subsets; it adds no path query. Original24/4 queries, maxOps1000,
40-cell/cache-age5 bounds, start/deadline and four unchanged observations remain.
Centre-only movement cannot replenish a stalled departing mission.

Combat, emergency escape, escort, injury support, melee recovery and explicit
owners are checked before centre proposals. Any failure cancels the existing
mission and **discards the entire prepared map**, including departing steps,
before state persistence, logging or commands. Ordinary priority actions then
execute in the existing pass. No stronger support guarantee applies after release.
Capture and other terminal states release both groups on that tick. Duplicate
ticks spend the attempt; strict new-match rewind resets it. Disabled, rejected,
captured and otherwise inactive missions bypass centre evaluation and its terrain
scans. Post-centre processing is unchanged.

### Per-actor diagnostic provenance

Use existing movement `action-decision.reason` values `opening-centre-step` and
`opening-centre-hold` for retained actors. Departing travel retains
`capture-route-step`/`capture-route-hold`; ordinary/priority reasons remain unchanged.
`actorId`, action coordinates and matching attempts/return codes already identify
the actor and command. No extra records, paths, centre ID arrays or diagnostic
stream are added. Reasons are fixed labels; maximum-length escaped IDs still pass
the existing action validators and complete opening snapshot limit2700.
The four-member snapshot indices continue to refer **only** to the departing
squad, resolved against that same tick's roster; they are not eight centre slots.
Final steps/holds do not explain every internal proposal tie: generated tests
inspect the pure policy result for that finer detail.

### Generated verification and limitations

Before promotion, the new real-tick provenance regression fails `0 !== 8` retained
owned actors; the original23 flow cases pass. After promotion31 flow cases and
372 total explicitly selected generated checks pass. The complete command list
and results are retained in the receipt below. No historical reader is run.

New real-loop coverage includes eight supported observations, partial execution,
cross-centre holds and departing-first reservations, permanent retained-healer
non-displacement, priority cancellation after departing preparation, missing
members, current-support loss, capture plus five released observations, other
termination, duplicate ticks and strict match reset. Every admitted move/stay
outcome is checked per squad, with unchanged current-tick tactical traces and
at most one movement command. The late ownership-conflict case supplies an
explicit generated escort context at the preparation seam; a separate real
escort-selector case retains earlier admission fencing. Neither is a live event.

With supplied horizontal-first responses, centre commands are7,8,8,8,8,8,8,8 and
secondary4 each tick. Only previously admitted empty/distinct adjacent steps are
supplied as subsequent positions. Queries remain16 at1 and4 at6. The earlier
occupancy corridor comparison retains its different secondary sequence4,4,1,4,
4,4,4,4: different supplied response families, not a changed policy threshold.
Ordinary baseline support loss remains covered by the unchanged comparison.
The real-loop congestion still has secondary3,1,0,0,0,0,0, terminating at7 with28
queries. Stationary retained healers eventually stop their weapons, not indefinite
whole-army progress. An all-stationary secondary attempt ends at5 even while
centre actors advance. Terminal diagnostics retain the preceding active counter.

Generated steps, captures and subsequent ownership are supplied observations,
not Arena arbitration or effects. No historical alternative, Arena routing
quality, coordinated arrival, capture, CPU, survival or strategic benefit is
established. Ties, blocked terrain, opaque scouts, congestion and support loss
after priority release remain concrete limitations. No trial is prepared.

### Exact rollback — separately authorized only

Evidence root:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-centre-support-integration-20261018-SmTnzn/`.

1. Compare current runtime/config hashes with final `report.json`; stop on drift.
   Preserve later work and existing index/PNG/oracle metadata exceptions.
2. Restore only saved `before/src/loop.js`, `before/src/arena/execute.js` and
   `before/src/debug/build-id.js`. Config requires no change; its exact copy is
   retained as a verification pin, not authority to overwrite unrelated drift.
3. Move this task's new `src/strategy/opening-centre-support.js` outside `src/`,
   retaining it in evidence. Leaving an unused module there changes the build.
4. Check, do not regenerate, and require the starting build above. All other
   runtime/package bytes must match their original pins. Do not reset Git.
5. Revert only task-specific test/docs hunks from saved copies/diff after checking
   for later edits; restore the original test-side policy before removing the
   runtime module if those generated comparisons must remain runnable.

This candidate is already inactive. Rollback is not a switch activation or trial
instruction. No package changes, staging, commits or publication occur here.
