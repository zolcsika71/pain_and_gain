# Supported stand-off contest — design and inactive integration, 2026-10-16

Status: runtime integration candidate implemented behind the existing
`secondaryObjectiveExperiment = false`. Other switches are unchanged. No match,
activation, capture or strategic benefit is established. The original test-only
proposal and rejection below are historical; the current integration is here.

Current inactive shared-travel candidate build:
`275a7eaafd5de6fa2acfd8f7734aa9d6d1946863164cf6c058153d388e21ff77`.
Includes [shared safe-subset travel](secondary-partial-travel-integration-2026-10-17.md)
and [scoped health readiness](secondary-scoped-readiness-integration-2026-10-17.md).
Includes the independent [pure-healer pressure correction](pure-healer-pressure-retreat-2026-10-16.md),
which yields to escort/pair ownership and is incompatible with active travel.
Original integration build was `56501f03b5715c055311b3a770329b0437c362a52efad8cd29e4d6336733bdd0`.
Ordinary capture now reuses this preflight/actuator under its stricter movement
priority rules; see the [shared travel contract](general-strategy-secondary-objectives-2026-10-16.md#shared-validated-capturecontest-travel--2026-10-16).

## Current integration: ownership, budget and handoff

[`supported-contest.js`](../../src/strategy/supported-contest.js) supplies pure
admission and route/support checks. The existing secondary coordinator owns all
searches, cache, selection and attempt state. There is no second controller or
new switch. The unchanged safe-capture branch has first refusal and keeps its
existing query order, ranking and safety gates. Ordinary capture travel now
uses shared validated steps but yields to all higher-priority movement.
Only when it does not assign may one eligible existing ranged/healer squad
evaluate isolated unarmed occupied flags using the remaining acquisition work.
Opponent labels never enter the policy.

The role, full-health, mobility, available healing and retained-centre gates are
reused from the unchanged capture selector. Contest still requires one pure
functioning healer and2–3 pure functioning ranged actors. It rejects an armed
occupant, local enemy healing, approach threat or other enemies that can enter
the bounded approach window. Every report and every tick is revalidated against
current observations. Nominal capacities are never converted into a win claim.

The original shared range4 anchor is replaced by actor-specific route goals:
`searchPath(actor,{pos:flag,range:3 or 4},{maxOps:1000})`, range3 for ranged
actors and4 for the healer. Complete routes must finish exactly at that range,
on the centre side, and keep every current/path position outside the same
minimum range. Coordinates, adjacency, ops, current origin, incomplete status,
<=40 cells, armed-enemy range5 and other-enemy arrival lead remain checked.
Reinforcement distance is measured to the flag and all route endpoints.
An occupied flag is never a contest travel destination.

| Movement priority | Ownership rule before execution |
| --- | --- |
| Emergency retreat, escort, paired control, healer injury support, incompatible recovery/hold | Cancel the entire contest-origin assignment before any actor executes movement; ordinary priority paths then execute |
| Ordinary combat approach | May not redirect assigned travel: replace it with the first validated adjacent route cell |
| Combat in range | Attack/healing selection remains unchanged; the movement destination still comes from the validated report (normally empty at stand-off) |
| Ordinary flag fallback | Assigned actors consume validated route steps; nonmembers retain ordinary centre fallback |

`prepareSecondaryMovement` runs for the whole assigned group after planner
revalidation and before the game-state snapshot or any movement. It inspects
the existing pure movement plans using the original centre reference. Any
priority conflict invalidates ownership and the selection becomes terminal.
The finalized state/diagnostic is stored before normal execution; there is no
partially executed objective group followed by an emergency override.

For each weapon, all four current/next weapon and current/next healer position
combinations must remain within functioning heal range3. This one-step check
permits either actor to move or remain blocked; it is not a multi-tick traffic
or combat simulator. Unknown occupancy cancels. After those unchanged gates,
four-member capture/contest groups may admit a bounded safe subset around an
occupied/converging cell; tied maxima admit only common moves, and every other
member retains an objective-owned hold. Smaller blocked groups still all hold.
There is no swap/vacating-cell assumption or alternate path. Support exposure
still cancels rather than salvaging a subset or inventing an alternate step.
Actual next observations are rechecked every tick. The existing snapshot gains
only bounded proposed/admitted cells and controlled hold reasons; see the
linked shared integration for exact fields and limits.

The executor issues `Creep.move(direction)` for the adjacent validated cell,
using the [documented Arena1–8 directions](https://arena.screeps.com/docs/#Creep.move).
It never calls `moveTo` for contest-origin travel, so it cannot perform another
path search or silently detour to the flag/enemy. At most one movement command
per assigned actor is issued. Attacks and healing remain in their original
order with their original selectors. A scheduled move is not displacement.

One query counter and ops accounting cover all work: capture plus contest
acquisition stays<=24 queries/24,000 requested ops; active refresh or capture
handoff stays<=4/4,000. Each query is capped1000 ops. Unknown ops remain unknown,
not zero. Occupied contest targets are disjoint from ordinary capture targets;
no extra same-poll budget or fallback-squad search loop is introduced. Candidate
overlong routes exclude that flag as before, while malformed required results
stop conservatively. Active overlong refresh terminates.

Selected routes use the existing observed-position suffix rebasing and five-tick
freshness window. Off-route/expired observations permit one bounded refresh,
never assumed progress from command returns. Contest progress uses the best
observed maximum weapon-to-flag distance. Four elapsed ticks without improvement
(including blocked or in-range engagement) or60 ticks from original selection
terminate the attempt. `mode` and `progressAge` are bounded additions to the
existing acquisition diagnostic. No path/roster copies or separate log stream
are added. Strict match rewind resets coordinator state with the existing loop;
duplicate observations do not replenish deadlines or stall progress. Legacy
duplicate ticks after initialization can still terminate on unavailable membership.

When the pinned occupant leaves, the desired mode changes to capture before
any refresh. Only same-flag range0 reports may be collected, with the existing
four active queries. The unchanged capture selector receives the original active
state: centre/squad/owner binding, `startedAt`, lifetime and attempt are retained.
The contest progress clock is retained too. Unsafe arrival, nearby departing or
replacement occupants, or any other capture failure terminate the same attempt.
Successful handoff changes only the mode and reports; it retains direct-route
ownership and preflight protection through capture/termination. It cannot return
to contest, retarget, reset a spent attempt or gain a second search allowance.
Injury/support loss also cancels before normal healing/recovery executes.

The evidence reader/analyzer recognizes the actual `move` method in the existing
movement channel, with a position-only, null-ID in-map target. Its coordinates
record the requested adjacent cell, not a creep target or an engine result.
Compatibility counts `move` and `moveTo` together; two movement calls fail.
Existing closure, return-code and observed-displacement semantics are retained.
Old records remain readable; ordinary-capture direct moves now use that same
position-only action shape with `capture-route-step` / `capture-route-hold`.

Current generated real-flow tests cover direct route travel and all8 directions,
compatible ranged attacks, emergency/support/escort preflight, current and
partial-success heal separation, occupied-cell wait, failed/accepted blocked
commands, reinforcement, inherited timeout/progress, shared24/4 query caps,
capture refusal/replacement, match reset, identity/order/reflection invariance
and disabled behavior. Positions are supplied test observations, not a model of
Arena movement success. No kills, captures or live coordination are demonstrated.

All148 final focused runtime, capture, contest, movement, escort and analyzer
checks pass on Node24.19.0. Build generation/check, `npm run check` and whitespace
checks pass. A broader canonical-temporary-root run passed194 of196 checks,
with two isolated importer CLI fixtures blocked because they copied only
`replay-logs.js` without its authority-module dependencies. Those fixtures were
subsequently repaired: all50 affected checks pass with guards/assertions intact.
The additional all8-direction actuator check passed in the final focused set.

No further implementation blocker was found for preparing a separately scoped
single functional trial. Remaining live uncertainties are route availability,
terrain fatigue, engine blocking, conservative group waits, runtime CPU, opponent
movement between observations, and whether any assignment/capture is exercised.
Release restores ordinary behavior; it does not guarantee a safe physical return.
The original isolated-CLI failures remain historical evidence; their repair is
retained at `/Users/zoltanka/.local/share/pain-and-gain-evidence/isolated-cli-fixture-repair-20261016-7oNY4M/report.json`.
No authority/residency guard was changed to obtain those passes.

[Current integration checks and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/supported-contest-integration-20261016-OUd9FK/report.json).

## Original test-only proposal (historical)

The [capture contract](general-strategy-secondary-objectives-2026-10-16.md)
remains authoritative and unchanged. Its arrival-lead rule deliberately rejects
occupied flags. The separate policy here asks whether an existing supported
ranged squad can approach **one isolated unarmed occupant**, preserving an
opportunity for existing combat. It does not admit an armed assault, forecast
damage, guarantee expulsion, or relax capture admission. No replay was reread
or used to choose these generated positions, roles or constants.

Implementation: [test-only candidate](../../tests/fixtures/supported-contest-candidate.js).
Validation: [generated tests](../../tests/unit/supported-contest-candidate.test.js).
Nothing under `src/` imports the candidate.

## Intent and admission

| Decision | Intent | Movement destination / handoff |
| --- | --- | --- |
| Existing safe capture | Reach an admissible flag cell | Unchanged capture selector, including occupancy, all-enemy arrival lead, utility and safety gates |
| Contest approach | Reach observation/engagement distance of an isolated occupant | Centre-side stand-off point at range4 from the flag; never the occupied cell |
| Contest engagement | Leave weapon decisions to existing local tactics | Ranged actors may hold/engage at range3; healer's ordinary fallback stays at the range4 stand-off point |
| Capture eligible | Current, separate safe-capture admission succeeded after occupant left | Terminal eligibility result only; no fallback override or capture command |
| Cancel / expire | Release the temporary intent | Empty override map; ordinary centre/combat/support behavior resumes |

The caller supplies one **existing** squad binding and current complete
observation. This pure prototype cannot independently certify that membership
or visibility attestation, and does not form squads or choose members. It
reuses the unchanged capture selector with empty routes as its representation
and readiness gate: seven valid flags; bounded known bodies/owners; at most14
actors per side; full-health friends; mobile, unfatigued selected actors; no
other controller ownership; accessible healing; two retained functioning
centre weapons with functioning healing within range3; owned centre; and no
armed enemy within5 of centre or the group. None of those gates is bypassed.

Additional contest requirements:

- Exactly one functioning healer and two or three functioning **pure ranged**
  actors in the supplied 3–4 member squad. Functioning roles, not nominal body
  labels or summed combat power, decide membership. Mixed functioning combat/
  healing roles and melee actors are outside this proposal. Losing all HEAL,
  any required weapon/MOVE, current support access, health or mobility rejects.
  A single functioning ranged weapon is insufficient for this policy.
- One living enemy occupies the candidate secondary flag. It has no
  functioning ATTACK, RANGED_ATTACK or HEAL. Even a single armed defender is
  refused regardless of our nominal superiority. Any enemy functioning HEAL
  within3 of the occupant rejects; healing outside3 is still subject to the
  reinforcement guard. No healing-capacity-versus-damage calculation is used.
- One supplied stand-off point is exactly4 from the flag and strictly closer
  to the centre than the flag is. It is not occupied by an unrelated friendly.
  This is a reference point for existing movement, not a formation or traffic
  reservation. It may be unreachable in real terrain; caller route evidence
  is required, not inferred from distance.
- Each member supplies a fresh report from its observed position to that
  point: matching actor/flag/tick, contiguous integer in-map coordinates,
  exact endpoint, `incomplete:false`, at most40 cells, known integer ops0–1000.
  Current positions and route nodes keep the healer at least4 from the occupied
  flag, ranged actors at least3, and every armed enemy farther than5.
  Unknown fields, non-finite coordinates, stale/incomplete reports, oversized
  arrays and unsupported observations fail conservatively.
- For every enemy other than the pinned occupant, distance to **both** flag
  and stand-off point must exceed the slowest approach report length +5.
  This includes other unarmed scouts. Equality rejects. One-cell-per-tick
  Chebyshev distance is a lower bound on possible arrival, not an enemy order
  prediction. It excludes observed near reinforcements; it cannot establish
  future isolation. Reobserve each tick and cancel when this uncertainty gate
  fails. Full visibility is a caller attestation, not inferred absence.

The two-weapon quorum adds redundancy but proves no kill capability. One HEAL
part provides functioning support against a currently unarmed isolated enemy;
it does not imply sufficient healing against future damage. Admission refuses
observed armed opposition rather than converting nominal HP/tick totals into
a promise of winning. Existing army penalties still affect real combat and
would require evidence before any integration decision.

## Stable choice, lifecycle and work

At entry consider at most6 caller-supplied offers, ranked by potential scoring
swing divided by maximum approach cells +1, then shorter approach. Enemy-owned
flags include potential denied income; neutral flags do not. This is a bounded
opportunity ordering, not realized income or a combat valuation. Exact ties
refuse admission (`ambiguous-contest`), so arbitrary IDs, input order or compass
directions cannot choose a different objective. No utility weights or opponent
labels enter the policy.

Pin squad/member IDs, centre and flag bindings/owner, stand-off point and
occupant identity. New offers cannot retarget an active attempt. A changed
binding/owner, support or centre loss, exposure, enemy healing/reinforcement,
unavailable route or invalid time ends it. If someone else makes the flag ours,
record `captured-externally`; do not claim this candidate caused capture.

`approach` becomes `engage` only when all selected weapons are observed within3
of the pinned occupant. The progress metric is the greatest current weapon
distance to the flag. Only a new best observed distance advances progress;
lateral displacement or an accepted command does not. Four elapsed ticks
without improvement finish, including at engagement range. This deliberately
allows only a short engagement window and may abandon a viable slow contest.
Absolute lifetime is60 ticks. Duplicate observations issue no new intent and
spend no budget. Rewind terminates; only an explicitly new caller-owned match
state can reset the spent attempt. Finished attempts cannot reacquire.

If the occupant leaves its exact flag cell, do not chase or infer death. Run
the existing safe-capture selector on fresh reports to the **same** flag. All
original gates, including the arrival lead over that departing enemy, remain.
Success emits terminal `capture-eligible` with an empty movement override; no
automatic handoff/second controller/attempt is created. Missing reports, a
nearby departing scout or a replacement occupant yield `capture-not-admitted`.
That conservative terminal outcome can miss a later safe opportunity.

The prototype performs zero route searches or API calls. Reports across all
offers and any capture recheck are capped together at24,40 cells/report,
1000 known ops/report,24,000 total reported ops; oversized representations
reject before cell traversal. Only four reports can belong to one selected
offer. These are **input/work bounds**, not live query/CPU measurements.
There is no cache or query orchestration in this proposal. Future integration
would have to share, not add to, existing24-query acquisition /4-query refresh
budgets and fresh/suffix validation. No such integration is implemented.

Fallback releases all overrides. Existing tactical retreat, healer recovery,
escort, pairing and centre references retain their current priority. Release
does not guarantee physical retreat or a safe return.

## Original facilities and integration rejection (historical)

The generated seam check passes a stand-off `ordinaryFallbackById` into the
existing `moveCreeps`. It leaves centre/rejoin references intact and sends each
actor at most one movement command. At distance5 existing ranged movement
approaches the local enemy; at3 it holds and existing combat selects a ranged
attack. Pure-healer fallback references the stand-off point. No actor is given
the occupied flag as a travel goal. No target selector or combat scheduler is
rewritten, and the focus ID is context only, not a forced combat target.

Reject integration now for concrete reasons:

- Existing combat approach can override the checked stand-off route. Terrain,
  occupancy and command-to-next-observation exposure along that actual movement
  have not been established. A pure intent selector cannot certify them.
- Members share a reference point and ordinary routing; there is no guarantee
  of simultaneous displacement, healer spacing, traffic clearance or retreat.
  Revalidation can cancel after separation; it cannot prevent every unsafe step.
- The reinforcement lower bound and four-tick engagement window are conservative
  design limits, not calibrated safety/utility evidence. The policy covers only
  isolated unarmed occupants and does not solve supported armed defence.
- No runtime arbitration exists between this intent, the safe-capture lifecycle
  and other controllers. Query/cache budgets and a capture handoff require a
  separate bounded integration design before they could be exercised.

Twenty-one new generated checks plus56 affected capture/real-flow checks pass
on Node24.19.0 (77 total). Coverage includes isolated occupant approach and
engagement, armed defence, enemy healing/reinforcement and equality boundaries,
lost friendly support, unknown data, approach exposure, blocked progress,
timeouts, ownership, capture eligibility and deterministic two-candidate choice
under renaming, input order and mirrored geometry, including exact ties.
External snapshots drive all multi-tick positions; attacks and movement calls
do not alter health/ownership in these tests. No kill, displacement, capture,
live CPU/headroom or strategic benefit is established. Runtime remains disabled.

[Focused results, development failures and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/supported-contest-design-20261016-GkqLrw/report.json).
