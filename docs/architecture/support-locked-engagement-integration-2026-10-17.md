# Support-locked engagement: inactive runtime integration

Status: inactive candidate with generated validation and bounded live review;
not promoted. Coordinated advance and rearming remain unexercised live.
Verified inactive build:
`2db3ffea0c369f5003d16f96e3714ca536aa150dc3ed9a8932490c68fef04cbd`.
All 209 initially selected affected generated checks passed. After the final
fencing correction, all 70 controller/adapter/tick-flow checks passed; the 140
unaffected results are reused (210 distinct generated checks covered).
`npm run check`, tracked diff and selected untracked-file whitespace checks
pass. Git index bytes and HEAD remained unchanged during integration and trial
review. Publication staging and commit changes are separately authorized.
The corrected [test-only design](support-locked-engagement-test-only-2026-10-17.md)
is promoted to `src/strategy/support-locked-engagement.js`. The old fixture
re-exports that sole implementation. `supportLockedEngagementExperiment`
defaults to false; every previous switch retains its value.

## Input mapping checked before integration

| Prototype input / decision | Bounded production equivalent |
| --- | --- |
| Tick; positions, HP/body/fatigue, ownership and methods | Current `observeArena()` objects, <=14 owned +14 living enemies, <=50 parts each |
| Observation completeness | Original <=28 roster count/ownership/reference consistency plus existing position, numeric, body and uniqueness guards; never fabricated true |
| Birth membership; absence vs death | Unchanged `updateMembership`; unknown absence cannot substitute for confirmed-dead membership evidence |
| Fixture nomination | Unique existing four-member production squad with three original ranged roles +one healer; strict current pure-role checks still apply. No shape/ambiguous shape leaves Ordinary behavior; no ID winner or healthier subset |
| Centre / anchor | Unchanged first `selectFlag` result; pinned ID/coordinates and existing unique weapon-medoid contact anchor |
| Movement focus / per-actor engagements | Same controller focus rule and production `engagements` Map; tactical targeting remains independent |
| Occupancy / terrain / reservations | Owned +living-hostile references, normalizing observed dead hostiles like `observeArena`; on-demand `getTerrainAt`. Initially empty planner reservations as in the fixture; execution-time ordinary retreat reservations are unchanged |
| Explicit owners | Real escort/pair plans; scout fallback and prepared secondary move-map keys, including null objective holds |
| Proposed steps | Existing bounded eight-neighbour evaluator; one adjacent, plain, currently free unique-best cell per actor. Unresolved physical ties hold |
| Admitted steps / holds | Existing support and <=16 subset helpers plus unchanged bound-healer band checks for every admitted move/stay outcome |
| State / progress | Loop-local pinned bindings and snapshots, strict rollback reset; shallow immutable replacement avoids relying on an undocumented `structuredClone` global. Returns do not supply positions |
| Execution / returns | Existing single movement pass; adjacent `move(direction)`, original return logging and <=one movement command per actor |

No fixture input required an unavailable battlefield observation. This does
not assume that outside actors stay still, priority movement preserves support
or Arena resolves any command. No map scan, path query or new reservation
framework is introduced by the controller.

## Ownership and lifecycle

Planning follows existing scout, escort, pair and secondary preflight. Those
owners win, as do existing adjacent emergency escape, healer pressure response
and injured-ally support decisions. Any conflict invalidates the coordinated
batch before commands: priority actors execute their original facility; every
remaining bound actor retains an owned hold, not unchecked pursuit.

The controller replaces only ordinary `flag-fallback`, `combat-approach`
and `combat-in-range` movement. The existing executor handles a distinct
engagement map inside the same pass, after escort/pair/objective ownership.
Per-actor engagement bookkeeping, attack/heal selectors, action order and
observed-position ranges remain unchanged. Melee recovery and hybrids are
outside the accepted shape. Closing cannot overwrite an engagement hold.

Ordinary -> Assess -> Engage -> Recover -> Spent retains three unchanged
attempted-progress observations, five recovery ticks and 24 total episode ticks.
Firing holds still consume the deadline. Recovery never resumes Engage.
Partial movement and retargeting never reset the start, binding or deadline.
Spent rearms only after two consecutive complete observations with no functioning
armed enemy within five of either the fixed anchor or any surviving bound
member. Unknown absence/observations cannot clear contact.

Production membership already invalidates/resets its epoch on duplicate ticks;
that behavior is not changed. A duplicate cannot replenish this controller and
may conservatively spend it on unavailable membership. Strict rollback resets
the controller for a new match.

### Demonstrated integration correction

A retained failing regression found that the prototype's second-clear return
reported a priority healer but retained its owned hold, suppressing an
independently selected injured-ally approach. That return now uses the existing
priority-yield path. Clearance and timing rules are unchanged. Incomplete-input
fencing also yields independently observable emergency/explicit owners rather
than masking them with group holds; it still admits no coordinated travel or
clearance.

A second retained counterexample shows why an unrelated malformed actor must
not erase a separately known adjacent emergency. Known bounded actor data is
used only to yield priority; unknown data still cannot authorize coordinated
movement or establish clearance. Existing downstream production selectors are
not generalized malformed-API parsers by this integration.

## Diagnostics and bounds

The existing pre-action snapshot optionally adds `supportLockedEngagement`:
phase/reason, squad/start/deadline/anchor/focus ID, stall/recovery/clear counts,
work and <=4 ownership entries. Entries use pinned production membership slots,
owner labels (`ordinary`, `engagement`, `priority`) and proposed/admitted
cells or null. Correlate slots with membership evidence and actions by actor ID.
Rearm's transition holds keep their diagnostic binding without starting another
episode. Old proposals are not emitted as current hold proposals.

No full paths, raw values, stacks or new records/streams are added.
Generated normal summaries are <1200 characters; worst escaped 128-character
focus IDs remain <2000. Existing secondary diagnostic bounds are unchanged.
Movement reasons are `support-locked-step` / `support-locked-hold`; attempts
and coverage keep the existing schema. Disabled mode bypasses evaluation and
emits no new field. The `neighbours` work counter counts acceptance-callback
candidates after terrain/occupancy filters; actual checks are <=8 cells/member,
<=32/batch. Subsets <=16; controller searches0. Existing secondary24/4 query
caps are not enlarged.

## Validation and limitations

Generated real-tick checks cover supported advance/firing holds, unchanged
current-tick tactical traces, returns0/-11/unknown, partial execution, blocking,
actual escort/emergency/injury-support handoffs, recovery steps, spent/rearm,
missing/confirmed-dead members and match reset. The original corrected suite
retains adverse support/band/convergence/reacting-enemy and rename/order/mirror
cases. Adapter checks cover production nomination, completeness and owner maps.
Unchanged combat/healing results are reused; historical fixtures are not read.

Priority healer travel can still subsequently break support. Other allies and
enemies may move; execution-time outside retreat reservations are not future
arbitration. Blocking/ties may hold or spend an episode. Late reload cannot
recover birth membership. These generated decisions are not Arena movement,
damage prevention, coordination, capture, survival or victory evidence.
No further activation or live trial is authorized here.

## Bounded live functional observation

Completed replay `6ad36cebabefcb0325c90554`, versus `temik911 v132`, uniquely
verified the emitted enabled build
`1defca62e034378d9e8e032aa5bc081732a918ba14ee3cf4c6b37ab94f6b3e03`.
Identity used recorded-time/player metadata and the exact resident opening-log
request, not opponent name alone or a readable native-screen reconfirmation.
The exact inactive config/build were restored before review. One opening response
covers ticks1–94 with complete correlated diagnostics; terminal tick95 is absent.
Detailed review follows context42, one episode43–48, post-window49–51 and the
next position observation52. It is not a whole-match outcome review.

- Squad C binds its original three ranged members and healer at43, with fixed
  anchor/centre(49,49), start43 and deadline67. Competing healing/priority movement
  enters Recover immediately; no separately emitted Assess or Engage is claimed.
- The healer yields to existing priority movement. Other members retain owned
  holds with no proposed/admitted coordinated step or unchecked pursuit. Their
  positions remain unchanged throughout the detailed window. Controller neighbour,
  subset and explicit search work are all0; ordinary `moveTo` internals are unknown.
- The healer's priority approach at44 returns0; the observation at45 shows movement
  from(48,51) to(49,52). Two bound weapons then lie at range4 from that healer,
  demonstrating the documented handoff limitation, not coordinated-step admission.
  Other functioning healers retain recorded range2–3 access; this establishes
  availability, not healing allocation or resolved effects. Centre ownership stays
  friendly and a bound ranged member holds the centre cell; coordinated-departure
  defence checks are not exercised.
- Recovery terminates at48:48−43=5, before deadline67, without reset or extension.
  Spent persists through94 with clearCount0. No two-clear rearm or reacquisition
  occurs. At51 all three ranged members issue range3 attacks returning0 while
  remaining in spent holds; healing also uses current observed ranges.
- Priority pressure retreat at49 returns0 without displacement in observation50;
  the request at50 returns0 and observation51 shows its destination reached.
  Neither an accepted command nor a planned step is treated as physical movement.

The six episode CPU samples span2.580–3.874ms (mean3.103ms), against recorded
100ms limits. Across93 ordinary opening samples, median3.043ms/max9.134ms;
first tick17.365ms against1000ms. These whole-runtime late samples exclude their
own emission/coverage closure, omit terminal95 and do not isolate controller cost.

Coordinated advance/direct-step displacement, partial-subset execution,
Engage firing-line holds, recovery movement, stall/absolute-deadline termination,
legitimate rearming and malformed-observation fencing remain unexercised live.
No contract violation was demonstrated. Keep the experiment disabled; this
review establishes priority yielding, bounded recovery and tactical continuity,
not coordination guarantees, prevented damage, kills, captures or survival benefit.
No automatic follow-up trial is implied.

Retained trial report and complete relevant observations remain outside Git:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/support-locked-engagement-functional-trial-20261017-QuewJh/report.json`.

## Exact rollback and preservation

Operational rollback: keep `supportLockedEngagementExperiment = false` in
`src/config.js`, then `npm run build-id:generate` and
`npm run build-id:check`. It is already false. Toggle no other switch.

Exact pre-integration runtime rollback: restore only `src/loop.js`,
`src/arena/execute.js`, `src/config.js`, `src/debug/game-state.js` and
`src/debug/build-id.js` from their UTF-8 bodies in the receipt's `before.json`;
remove only the new `src/strategy/support-locked-engagement.js`. Verify original
inactive build `275a7eaafd5de6fa2acfd8f7734aa9d6d1946863164cf6c058153d388e21ff77`.
Restore saved `package.json` only if also reverting its one added syntax check.
Preserve subsequent/unrelated changes; do not use Git reset.

Receipts/before copies:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/support-locked-engagement-integration-20261017-4uPmQf/`.
Existing index drift and PNG metadata exceptions are not repaired. No replay
payload, managed manifest, PNG or parked storage work is opened or modified.
