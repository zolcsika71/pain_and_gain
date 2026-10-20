# Opening deployment — inactive integration (2026-10-17)

Status: implemented behind `openingDeploymentExperiment = false`. Initial
integration results below are generated; a later bounded live observation is
recorded separately below. No capture or strategic benefit is established. All other
switch values are preserved, including healer escort on and secondary objectives,
healer closing and support-locked engagement off.

Current amendment: [retained-centre movement](opening-centre-support-test-only-2026-10-17.md#current-inactive-runtime-integration)
is now integrated under that same disabled switch. After departing preflight,
the two retained birth squads receive supported local steps/owned holds in the
same pass; scouts remain ordinary. Centre cancellation discards departing moves
too; capture/termination releases both groups immediately. Historical statements
below about ten ordinary centre fallbacks describe the earlier integration.
Current centre progress does not replenish any secondary timer or work budget.

The separate [inactive joint-proposal authority](opening-joint-proposals-test-only-2026-10-19.md#current-inactive-runtime-integration)
now permits bounded route-backed local certificates before departing subset
selection. It is default-off, rejects probe/adoption combinations before route
work, and retains all centre, support, cache, query and lifecycle limits below.
Its original test-only adverse findings remain evidence, not live qualification.

Original integration inactive build:
`55bf14a37328b727ede0f65d51c75f558f79b51251217bb68627364895958553`.
Current shared travel build is recorded in the subsequent
[support-scope correction](objective-travel-support-scope-integration-2026-10-18.md);
that correction is live-unverified.
The subsequent [opening occupancy/cache integration](opening-occupancy-routes-integration-2026-10-18.md)
adds occupied-cell matrices and bounded blocked-next refresh only to opening
requests. It is also inactive and live-unverified; historical counts below
remain evidence of their original revisions.
All292 explicitly selected generated checks pass, including19 new real-loop
checks; build generation/check, `npm run check` (including the new module) and
affected whitespace/link checks pass. Historical seed entry points were not run.

## Input mapping and ownership

The [tested design](opening-secondary-deployment-test-only-2026-10-17.md) is
promoted, not independently reimplemented. No observation owner is rewritten.

| Tested input/seam | Runtime source |
| --- | --- |
| Tick, flags, creep references/positions/HP/fatigue/body | `observeArena()`; shared closed-roster check derives completeness, never an unconditional true |
| Existing nominal roles, squad and member IDs | Original `updateMembership()` birth binding; no substitutions or healthier retained subset |
| Centre identity | Original `selectFlag(flags)` result; selector verifies vulnerability effect; destination never becomes centre |
| Routes and current terrain/occupancy | Injected Arena `searchPath`, `getTerrainAt`, complete observed `creeps` |
| Controller exclusions | Existing escort IDs; existing combat engagements and escort/pair context reach whole-group preflight |
| Commands | Existing `prepareSecondaryMovement` and one `moveCreeps` pass, followed by unchanged `executeTactics` |

`src/strategy/objectives.js` has fixed post-centre and opening entry points over
one private capture selector. The post-centre entry retains owned-centre and
unchanged retained-defence membership. The opening entry permits neutral centre,
scopes its reused defence probe to the mission force, and considers only neutral
secondary flags; the opening controller adds the unchanged stronger commitment.
Route continuity/endpoints, arrival margin, utility, threat, support and lifecycle
arithmetic are shared. No caller can change post-centre admission via an option.

`secondary-objective-plan.js` owns one shared collection/suffix/cache core.
Its opening entry is capture-only and receives only the already-admitted original
squad; it cannot fall through into contest. The opening controller replaces the
test-only implementation. Removed ranker/provider source-rewriting adapters are
not imported or deployed. The remaining test adapter only transports explicit
generated response tables and invokes production preflight/execution.

Opening uses the existing `secondaryObjective` state/ownership slot in `runTick`,
not a simultaneous objective processor. When requested, it suppresses competing
experimental planners and rejects configuration unless **all** of these are
false: secondary objectives, support-locked engagement, healer useful closing,
scout allocation, scout holding and squad pairing. Rejection spends the opening
with `incompatible-configuration`, zero route queries and ordinary fallback;
it does not run another objective budget. Healer escort remains supported with
its existing switch value. A missing/unknown competing switch value is not false.
With opening off, existing switches and their independent behavior are unchanged.

Combat approach, emergency escape, escort and injury-support movement win
preflight before any objective command. Pair ownership also remains an existing
preflight cancellation boundary; the combined experimental configuration is not
supported by this integration. Held squad actors remain objective-owned, not
unchecked ordinary pursuers. Attacks/healing use observed positions and original
actor order. No actor receives a second movement pass or command.

## Admission, progress and limits

Only tick1 can allocate exactly one existing three-pure-ranged/healer squad.
The other ten retain the centre mission (originally ordinary movement): at least six functioning
weapons/two functioning pure healers, every weapon within3 of a retained healer,
every retained healer supporting at least two weapons. All ten remain healthy,
mobile and unowned. This is a commitment, **not centre already defended** or a
combat sufficiency prediction. Departing health, capability/support and all
existing conservative enemy buffers revalidate every tick.

Pin original centre/squad/membership and selected neutral flag identity/position/
effect/owner. Missing opening, rejected admission, priority/support failure or
termination consumes the mission. No chaining or post-centre reacquisition.
Centre may later be observed owned by us; enemy ownership/binding change cancels.
Capture releases ownership only after an observed flag owner change.

Keep24 acquisition queries,4 refresh queries,1000 requested ops/query,40-cell
routes and five-tick cache age. Every search requests exact range0 with maxOps1000.
Unknown ops stays null, never zero; cost telemetry is not a selection input.
Use the original candidate-local geometric/known-overlong exclusions and all
structural/required-field failures. Reuse suffixes only at observed origins/path
nodes. Age5/off-path refresh cannot reset the original start/deadline.

Keep60 total ticks and four unchanged observations. Progress uses subsequent
positions only. Unknown/rejected returns and accepted commands without movement
do not replenish time. Duplicate ticks spend the mission; malformed observations
cannot rearm. Only strict new-match rewind to tick1 resets it. Current occupancy,
plain first-step terrain, all-outcome support and at most16 subset checks are
unchanged. No swaps, assumed vacating, retries, alternate routing, extra waiting
or extra waiting is added. The later centre coordination is scoped by the current
amendment above, not by changing these mission bounds.

## Diagnostics

No new records/stream. The existing pre-action `game-state.secondaryObjective`
has `mode:'opening'` and a compact projection after group preflight. Full IDs
remain in planner state and the same snapshot's existing rosters, not repeated
inside the diagnostic:

- `squadSlot`: index in that tick's production membership squads; -1 unavailable.
- `targetSlot`: index in the same snapshot's `flags`; -1 unavailable/terminated.
- `memberSlots`: up to four indices into the same snapshot's **creeps** array,
  in bound sorted-member order; never indices into a different tick/roster.
- Travel actor `slot` indexes `memberSlots`; proposed/admitted points and hold
  reason retain their existing meanings. A held actor owns its hold.
- First excluded candidate uses `flagSlot` into the same `flags` instead of ID.
- Phase/reason, original start/unchanged count, queries/known ops/cache hits,
  utility components and the original rejected-query scalar summary remain.

Slot references must be resolved against their own snapshot. No truncation or ID
hash collision is introduced. Complete diagnostics stay below the existing2700
JSON-character limit, including escaped/control-character128-character IDs,
active travel/exclusions and rejected-query/exclusion combinations. Slots bound
the additional size independently of identifier contents. This does not claim
a new size bound on the pre-existing full roster snapshot itself.

## Generated validation and evidence limits

Explicit opening entry points (no name filtering):

```sh
node --test tests/unit/opening-deployment-flow.test.js tests/unit/opening-secondary-deployment.test.js tests/unit/opening-secondary-route-provider.test.js
```

The real loop checks supported departure, observed partial movement, suffix reuse,
expiry refresh, unchanged tactical traces, at most one movement command, capture
release plus five observations, duplicate/stall/deadline termination, match reset,
actual escort ownership and unsupported combinations. The old generated checks
now call the same runtime policy, not source-derived policy copies. Supplied
reports are only generated API response transport; cache reuse correctly means
they are no longer repaid/reevaluated each tick. Exhausted/unknown report cases
are exercised at actual refresh. Provider-function changes cannot reset state.

The accepted seeded receipt is reused without reading its payloads. A separate
generated analogue retains compact friendly geometry, convergent diagonal
responses, whole-army ordinary commands and explicit adjacent next observations:
3→1→0 objective steps, bounded no-displacement at7; stationary centre healers
still produce defence-unavailable at4. Enemies/other flags in this analogue are
generated, not a new exact replay continuation. Historical seed tests are not
executed, and no route is tuned to erase adverse outcomes.

Generated arrival precedes the explicitly supplied secondary ownership event.
These are commanded decisions on supplied observations, not Arena arbitration,
resolved captures, safe arrival or survival evidence. Terrain/route quality and
CPU effects in Arena remain unverified. Ordinary centre movement can separate
support and cancel diversion; occupancy/convergence can spend the attempt.

Focused results, development failures, source before-copies, preservation hashes
and the inactive build are retained in:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-deployment-integration-20261017-UOplVf/report.json`.

## Bounded earlier live observation — not current-build validation

The retained completed-trial report identifies replay `6ad3b318abefcb0465c90ae7`,
versus temik911 v204, with emitted enabled build
`a0a80a0da58b334dd225fc92f35a23af0369241c6e113a1650a46b5dfe6b8f31`.
Exact inactive config/build restoration preceded review. The publication task
reuses that report only; no replay/cache response or historical fixture is read.
Native inspection was unavailable in that earlier review: recorded metadata and
the emitted opening build established identity, with its native-host binding
limitation retained rather than silently claimed resolved.

Coverage is ticks1–9, one opening mission, not a full-match strategy comparison.
Tick1 selected the supported ranged/healer squad with six weapons/two healers
committed to centre. Three admitted steps reached their requested cells at2.
Tick2 issued four numeric0 moves; only two actors displaced at3. Tick3 admitted
one move, accepted but not displaced at4. Occupied cells produced objective-owned
holds. Engine collision/arbitration causes are unknown; accepted calls are not
movement. The departing squad retained range1–2 functioning healer access.

At4, two centre-assigned melee units had exceeded range3 of both retained healers,
correctly ending the mission with `centre-mission-unavailable` before another
objective query. Ticks5–9 remained finished with ownership released and no
reassignment; ordinary fallback commands did not prove physical return.
All flags remained neutral: no capture, income or debuff effect was demonstrated.
Actual contact/healing, emergency priority handoff, stall/deadline termination,
capture release and later outcome remain unexercised or outside this window.

Objective routing used4 acquisition queries/434 known reported operations and
four cached suffix hits at2–3. Full routes/individual ops were not emitted;
ordinary `moveTo` path work is not included. Nine late after-action CPU samples
included24.851ms at1 and5.469–16.182ms subsequently. These exclude final closure
work, are not isolated policy overhead, and have no baseline comparison.

This verifies limited admission/partial departure and centre-support cancellation
on the earlier build, not coordinated centre advance, sustained arrival or
strategic effectiveness. Centre ordinary movement, traffic and documented support
loss after a priority handoff remain limitations of that observation. The centre-support candidate
was then test-only; see the current inactive amendment above. ID-only arbitration stays rejected. The later support-scope
promotion is covered by351 generated checks only and has no live confirmation.

Receipt (local evidence, not a Git payload):
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-deployment-functional-trial-20261017-cmyJAV/report.json`.

## Exact rollback

These are the original integration rollback instructions. For the later
support-scope/occupancy/centre corrections, first use their separate drift-checked rollbacks; do not
overwrite later changes using this older baseline's copies.

The candidate is already off; this task authorizes no activation or trial.
For a later independently authorized toggle, restore only
`openingDeploymentExperiment = false`, preserve every other switch, regenerate
and check the build, and require the inactive ID in this receipt. Do not assume
turning it off returns the older source build: the integrated code still exists.

To roll back the runtime integration to the pre-task build, first compare current
files against the receipt's final hashes and stop on unexpected drift. Restore
the receipt's exact `before/src/` copies of `config.js`, `loop.js`,
`strategy/objectives.js`, `strategy/secondary-objective-plan.js` and
`debug/build-id.js`. Move only the new `src/strategy/opening-deployment.js` outside
Arena's `src/` (preserve it in evidence; do not leave an unused .js file under src,
because build hashing includes it). Remove only the added package syntax-check
entry for that file, or restore the saved exact package before-copy after drift
checks. Verify build
`2db3ffea0c369f5003d16f96e3714ca536aa150dc3ed9a8932490c68fef04cbd`.
Test adapters/docs for the integration must then be reverted only in their
task-specific hunks; prior adapter copies are retained. Do not reset Git, overwrite
the unrelated README/layout hunks, access PNG/manifest data or repair index drift.
