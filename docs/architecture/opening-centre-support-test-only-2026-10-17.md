# Opening centre support movement — test-only (2026-10-17)

Decision: **retain test-only**, not runtime integration or trial preparation.
This is the original evaluation, not validation of the later shared support-scope
build. The candidate remains test-only; current production identity and generated
validation are in the [shared support contract](objective-travel-support-scope-integration-2026-10-18.md).
Only generated tests/helpers are published. The bounded retained-window extract
and its separate reader entry point remain local evidence; they are not fetched,
hydrated or executed by publication or generated-only validation.
Production remains inactive build
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
