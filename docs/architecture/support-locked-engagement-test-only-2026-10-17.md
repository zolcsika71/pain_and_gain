# Support-locked squad engagement — test-only evaluation (2026-10-17)

Subsequent status: the corrected policy now has a separately reviewed
[default-off runtime integration](support-locked-engagement-integration-2026-10-17.md).
The original fixture re-exports that sole implementation. Historical test-only
scope/results below remain unchanged; integration adds its own priority-yield
regression, generated tick-flow checks and inactive build receipt.
That contract also records the completed bounded live review: priority yielding,
recovery termination and attacks during spent holds were observed; coordinated
advance and rearming remain unexercised. The experiment remains disabled.

**Historical test-only decision: corrected lifecycle passes the generated scope;
recommend a separately scoped inactive integration review, not activation.**
The original anchor-only rearm version was rejected for repeated pursuit. Its
counterexample and receipt remain historical below; the authorized correction
now requires clearance around both the fixed anchor and surviving bound members.
The documented priority-healer support limitation is unchanged.

Runtime remains `275a7eaafd5de6fa2acfd8f7734aa9d6d1946863164cf6c058153d388e21ff77`.
Secondary objectives and healer useful closing remain disabled. No runtime,
switch, package, generated build or Git-index edit is part of this evaluation.

## Scope and reuse

The sole candidate is
`tests/fixtures/support-locked-engagement-candidate.js:planSupportLocked`.
`tests/fixtures/support-locked-generated-world.js` adapts the real executor;
`tests/unit/support-locked-engagement.test.js` supplies successive observations.
No runtime imports these files.

The generated full roster is derived from `secondary-generated-world.js`.
Production `updateMembership` binds one existing squad with three pure ranged
actors and one pure healer at birth. Neither controller nor tests pick a new
healthier subset or replace the pinned healer. Nominal hybrids remain ineligible,
even when their extra action parts are destroyed.

Reused production mechanisms:

- `selectMovementPlan`, `selectHealingDecision`, `moveCreeps`, `executeTactics`
  and the actual healer-escort planner. Combat and healing selection are not
  reimplemented; complete current-tick tactical command traces are compared.
- `localRetreatStep` for its existing bounded terrain/occupancy neighbour scan.
  The candidate explicitly supplies its offensive threat checks: ranged weapons
  may enter one current ranged envelope, whereas healers may enter none. This
  is not a change to production retreat or revival of pre-contact kiting.
- `secondaryStepSupport` and `selectSecondaryTravelSteps`, with an additional
  bound-healer healing-band predicate. No independent subset selector exists.

The prior Apex reference supplied only the shared-readiness idea. Its World
APIs, rally fractions and march latch are not copied. The rejected
[pre-contact candidate](precontact-ranged-kiting-test-only-2026-10-17.md) remains
rejected. The [squad reference](screeps-squads-and-pairing.md) and local
[Arena action contract](screeps-arena-api.md) were consulted; no images or replay
payloads were opened.

## State, observation and ownership contract

Input comprises a complete bounded roster, current HP/body/fatigue/positions,
known terrain/occupancy, production membership, explicit centre, and actual
escort/pair/objective-owner plans. Unsupported observations cannot admit travel
or rearm an episode. Centre ID/coordinates, squad membership, healer, anchor and
start tick remain pinned. The anchor is the unique weapon medoid, with centre
distance breaking unequal physical ties; an unresolved anchor tie declines
acquisition rather than inventing an ID winner. Movement focus ranks current
weapon access, then centre distance; unresolved focus ties recover/hold. Current
attack selectors retain their own targets.

States are `Ordinary -> Assess -> Engage -> Recover -> Spent`:

- Ordinary leaves legacy behavior alone until one eligible contact binds.
- Assess records the binding and holds for its first observation.
- Engage issues checked adjacent steps or owned firing-line holds. Three
  unchanged observations while trying to advance spend the episode. A purposeful
  in-range firing hold is not stalled travel, but still consumes total lifetime.
- Recover forbids renewed pursuit. Support/capability loss, competing healing,
  observed pressure or movement priority can enter it. With intact support and
  no priority conflict it can issue exposure-reducing steps; otherwise it holds
  non-priority members. Recovery never transitions directly back to Engage.
- Spent suppresses pursuit and retains owned holds, except for higher-priority
  movement. It rearms only after two consecutive complete supported observations
  without a functioning armed enemy within five of the fixed anchor **or any
  surviving bound member**, including injured/incapable survivors. A missing
  bound actor is unknown unless production membership previously confirmed death;
  no actor is dropped from the pinned binding to obtain clearance. A gap restarts
  that count; malformed/unknown observations clear it. No new timer is added.

The limits are three unchanged observations, five recovery ticks and24 total
episode ticks. The earliest limit wins; recovery, partial progress and retargeting
cannot extend the start/deadline. Tick rollback resets the test controller;
duplicate ticks hold and do not count as progress/clear observations or reissue
coordinated moves. These numeric bounds are not strategic optimum claims.

Before a batch, identify existing emergency retreat, injured-ally support and
explicit owners. Any conflict invalidates the coordinated batch. Production
executes the priority member's movement; every remaining member holds rather
than falling through into an independent chase. The controller does not probe
emergency neighbours and then repeat that scan: the real executor alone chooses
the escape. No emergency escape is suppressed by a group support requirement.
Pair/objective plans are supplied through existing executor seams; a real escort
acquisition/approach is also exercised. This is not live `runTick` integration.

For controlled travel, all four current/next weapon/healer combinations must
preserve functioning access and the original band: adjacent stays<=1, ranged
stays<=3. The full proposal must pass before production subset selection; a
band/support failure is not salvaged. Tests enumerate every admitted move/stay
combination with distinct occupied cells. Selected outsider healing demand
invalidates the batch instead of pretending the healer is reserved for its squad.
Uncoordinated outsider motion and higher-priority travel have no group-support
guarantee; the explicit adverse example below demonstrates that boundary.

Known plain, currently unoccupied cells only; no shared admitted destination,
swap or entry into a cell merely expected to be vacated. A step never leaves the
fixed five-cell contact leash. Preserve two functioning retained centre weapons
with functioning-healer access, using the original non-group/non-owned set.
No flag selection, territorial admission, secondary budget or lifecycle changes.

## Capability and pressure are observations, not a combat model

Current enemy functioning ATTACK/RANGED_ATTACK and their geometric reach yield
potential exposure sets. Two sources are concentration, not summed incoming
damage. Advancing into multiple such sources is refused. An injured exposed
member not selected by the bound healer, or consecutive observed HP/functioning
part deterioration under current reach, requests recovery. These are conservative
signals; neither intended healing nor nominal capacities prove adequate support.

All coordinated recovery destinations strictly reduce the moving actor's current
exposure without entering a new source. Some actors may hold. Enemy movement
afterwards can change exposure; no reacting-enemy simulation or safe-combat proof
is installed. Current-tick attacks/healing use original positions even after
movement commands return0. Only supplied next observations establish progress.

## Generated outcomes

| Case | Decision-level finding |
| --- | --- |
| Supported approach | Four direct steps admit; supplied next positions bring all three ranged actors from range4 to3; then firing holds retain all three attacks |
| Partial execution | Every subset of the four requests retains the bound healer's current band; one actor's observed displacement counts without resetting the deadline |
| Concentrated exposure | Existing firing support does not authorize further advance into two current ranged sources |
| Deterioration/lost HEAL | Recover/hold, then bounded termination; no replacement healer or fabricated restored capability |
| Coordinated withdrawal | Three weapon steps reduce current ranged exposure while the healer holds; every move/stay outcome retains support |
| Occupancy/convergence | No occupied-cell entry; equal-best production subsets admit common moves and hold unresolved contenders |
| Blocked/unknown terrain/returns | No inferred displacement; three unchanged observations spend an advancing episode |
| Priority movement | Emergency retreat/escort/support wins before commands; remaining members cannot independently pursue |
| No safe support or unresolved focus | Non-progress is retained, not converted to an assignment by weakening guards |

### Historical rejection counterexample: anchor clearing is not contact clearing

All positions below are supplied generated observations, not engine resolution.
Initial weapons occupy x52 at y49/50/51, healer(50,50), armed contact(56,50).
The fixed anchor is(52,50). The first admitted batch has weapons x53, healer x51.
The episode spends at tick25, its original24-tick deadline.

The enemy is then observed at x57 on26 and x58 on27–28. It is now six from the
old anchor, so two valid armed-clear observations rearm the controller, although
it remains only five from the advanced weapons. At29 the same enemy starts a new
Assess episode anchored at(53,50); at30, Engage requests weapons x54/healer x52.

In the original version, that second episode spends at53. Enemy x59 on54–55 is six from its fixed anchor
but five from the advanced weapons. It rearms again; Assess56/Engage57 requests
weapons x55/healer x53 toward the same enemy. Each individual episode obeys its
deadline and the specified clear rule, but the repeated pursuit acceptance gate
failed. The original adverse assertion and its passing receipt remain in the
original evidence directory. The current test converts this case into the
required rejection regression rather than asserting reacquisition as acceptable.

### Authorized rearm correction and failing-before regression

Only the test-only Spent clearance predicate changes. Check the same functioning
armed enemies against the union of the fixed anchor and current living members
from the **original pinned IDs**. Every bound actor must have a supported current
observation or be a confirmed casualty in production membership. A missing actor
with `presence:missing` is not treated as dead. A confirmed corpse need not retain
a position after disappearance; membership/anchor are never shrunk or replaced.

The old adverse test was first rerun unchanged and reproduced both reacquisitions.
After conversion, the new expectation failed on old code: at27 it accumulated
clearCount1 instead of0 despite the enemy still being five from a bound weapon.
After the predicate correction, ticks27–30 stay Spent with clearCount0, original
start1, original member IDs/anchor and no objective movement command.

This is not permanent suppression. Enemy x59 on31 is outside both protected
regions and gives only one clear observation. A second complete clear observation
at32 rearms without issuing pursuit. Enemy x58 returning at33 starts a fresh
Assess episode; Engage34 admits supported steps toward it. The new start is33,
not a reset inside the spent episode. No target blacklist or chase history exists.

New generated cases cover alternating anchor-only/squad-only threats, inclusive
range5, single/duplicate/gapped clears, incomplete/malformed observations,
incapable survivors, confirmed and missing casualties, functioning versus
destroyed enemy weapons, and legitimate fresh contact. The existing invariance
matrix now exercises blocked rearm, genuine clearance and fresh engagement under
renaming, observation/member order and x/y/both reflections. All original advance,
firing-line, recovery, partial-execution and current-tick tactical checks remain.

The change does not reserve a healer, alter priority handoffs, extend any of the
3/5/24 bounds, change movement/support/subset logic, or touch runtime/package/
switch/build files. It closes the demonstrated anchor-only lifecycle defect;
it is not proof that arbitrary future enemy reactions cannot cause another fight.

### Retained boundary: competing healer movement can lose access

After the first supplied advance, weapons x53 have healer x51 at range2. An
injured outsider at(46,50) requests existing healer approach. The coordinated
batch is invalidated and all weapons hold. Supplied one-cell healer observations
x50 then x49 leave those weapons at range4. The controller remains Recover/Spent
and does not pursue, but cannot promise support while yielding this priority.
The healer's path is not inferred from its `moveTo`; these are explicit generated
inputs. Preventing that loss would require a separately agreed ownership trade-off,
not an assumption that higher-priority movement stays inside the group checks.

## Verification and disposition

Focused command: `node --test tests/unit/support-locked-engagement.test.js`.
Original33 checks passed including adverse assertions. The corrected suite has
40 passing checks,0 fail/skip. They include the retained support limitation, recovery,
rearm/gaps/malformed/reset/duplicate cases, priority owners, unchanged current-tick
tactics, and renaming/order/mirrored non-tied physical decisions. Existing
production selector tie behavior is not rewritten or claimed ID-invariant.

Bounds: four members, at most eight neighbouring cells each, one proposal each,
at most16 production subsets; zero explicit controller path queries. Emergency
and ordinary-group scans are mutually exclusive. There is no new reservation
system; ordinary unowned `moveTo` remains legacy behavior, not a controller search
or a mocked guarantee about Arena internals. Tests also verify one movement
command per controlled actor. No CPU/engine displacement/effectiveness measurement.

Initial receipts preserve fixture errors: repeated setup reset production birth
membership, and the supposed enemy melee was actually a healer in the preset
array. Negative tests also initially reused a helper requiring Engage, and one
expected a transition reason after the final movement reason had replaced it.
Corrections use real intended observations/transitions, not relaxed safety gates.
The neighbour preflight was tightened to avoid repeating the emergency scan.
No runtime defect was established or corrected.

The demonstrated rearm blocker is corrected, with failing-before/passing-after
evidence and no additional lifecycle blocker demonstrated in this generated
scope. Recommend a **separately authorized inactive integration review** of this
narrow slice, conditional on retaining the explicit priority-support boundary.
That is not automatic integration, deployment or match authorization. The
priority-support trade-off remains demonstrated and unchanged: the controller
cannot promise continued healing access when a higher-priority healer departs.
Any stronger support guarantee still needs a separately agreed ownership change.
No survival, prevented damage, captures, competitive advantage or victory follows.

External receipts, passing/failing focused results and preservation snapshots:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/support-locked-engagement-test-only-20261017-v23mjO/`.
The original receipt is not relabelled or overwritten. Rearm-correction receipts:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/support-locked-rearm-correction-20261017-RwKr6M/`.
Unrelated coordinator/storage work, PNGs and the managed manifest remain untouched.
