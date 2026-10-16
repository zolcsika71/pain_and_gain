# Useful-healing range closing — inactive integration, 2026-10-17

Status: **integrated behind `healerUsefulClosingExperiment = false`**.
Current inactive build:
`097a036fe433226c6dc24709f0cce04bdf8036ac395403531038e629fb05e192`.
Every previous switch is unchanged, including secondary objectives off and escort
on. No match is prepared or authorized. The test-only evaluation and convergence
follow-up below are retained as historical evidence; the current integration
contract and exact rollback instructions are at the end of this document.

## Existing behavior and action timing

Ordinary pure healers first try the existing pressure retreat, otherwise approach
an injured ally at range4–5, hold when injury is within3, or use flag fallback.
`selectHealingDecision` independently ranks capped nominal healing capacity and
chooses `heal` at0–1 or `rangedHeal` at2–3. That selector is unchanged; the current
executor's default-off integration is described below. Escort/pair ownership and
secondary travel preflight stay unchanged.

The [official heal](https://arena.screeps.com/docs/#Creep.heal),
[rangedHeal](https://arena.screeps.com/docs/#Creep.rangedHeal) and
[movement rules](https://arena.screeps.com/docs/#Creep.move) were checked against
the local API reference and tutorial examples. Movement and healing may be
scheduled together; an accepted call is not a resolved action. Adjacency must
exist for the selected `heal` call. This evaluation therefore keeps the current
tick's ranged-healing selection and counts an adjacent opportunity **only at a
subsequent supplied observation**, never from issuing movement first in JavaScript.

For functioning HEAL count `n`, known friendly flag multiplier `m`, target
pre-action injury `D`, and observed Chebyshev range `r`, potential useful capacity
is `min(D, n * m * (r<=1 ? 12 : r<=3 ? 4 : 0))` HP per available healing call.
This is a single-healer, injury-capped, flag-adjusted estimate—not resolved HP,
cross-healer allocation, incoming-damage prediction or restored weapons. The
unchanged healing selector itself still ranks nominal capacities, not modifiers.

## Exactly three retained holds

Source: replay `6ad29e3babefcb34fac8f3d3`, Golden Eagle v92, verified frozen build.
Only the prior trial's `retained-observation.json` was read, not Arena responses,
cache entries, managed captures or missing chunks. Samples are independent
pre-action observations. Body mocks retain initial nominal types and use
positive/zero HP sentinels for recorded functioning counts, not body reconstruction.
All three healers have6 functioning HEAL; both friendly healing flags are neutral
(`m=1`). Their selected targets are injured at range2; recorded rangedHeal returns0.

| Tick / actor → selected target | Baseline position / potential HP | Closing cell / conditional potential HP | Admission and trade-off |
| --- | --- | --- | --- |
| 76 H3 → H2, injury53 | (50,51),24 | (49,50),53; or(49,52),53 | First cell retains ranged_5 exposure and gets closer to it. The threat-free second cell drops injured R5 from range3 to4. (49,51) is occupied. Closing rejected. |
| 77 H1 → R1, injury1002 | (49,51),24 | (48,51) or(48,52),72 | Both target-adjacent cells retain ranged_5 reach; the latter also loses R5 healing access. No threat-free adjacent step. Closing rejected. |
| 80 H3 → R1, injury1014 | (50,51),24 | (49,51),72 | Geometrically unoccupied, no current weapon reach there, no injured-band or armed-support loss. **Terrain unknown**, so no historical legal move is established. |

H/R labels refer to recorded player2 identities. They are evidence labels, not
policy inputs. All8 neighbouring cells and their occupancy/threat/support reasons
are retained in `tests/fixtures/healer-useful-closing-window.json`. Terrain was
not retained by the prior extraction. Unknown terrain rejects; no map is borrowed
from another match. Replacing terrain with plain in tests is explicitly generated.
Under that assumption only tick80 selects(49,51), potential gain48 HP/call.
It is not evidence that the historical move was legal, would resolve, or would
increase healing next tick: the target, actor, parts, injury and other actions can
change. At76 the selected healer target actually moved in the recorded trial.

## One narrow test-only rule

The original test-only policy improves only an explicitly
ordinary `injured-ally-in-range` hold of a living, mobile pure healer. Functioning
HEAL/MOVE, zero fatigue and no nominal weapon parts are required; hybrids stay
unchanged even with destroyed weapons. Existing selected movement, emergency
retreat, escort, pair and objective-owner plans are returned unchanged.

It uses the **unchanged existing8-neighbour evaluator**, including world bounds,
known plain terrain, observed occupancy and reading existing retreat reservations.
During test-only evaluation, the private helper had no runtime export: the loader
appended an export in memory. Promotion now exports the unchanged evaluator
directly. Both retained fixture modules are simple re-exports of the runtime
policy/evaluator, with no independent algorithm or source-rewriting loader.

Require no current enemy weapon reach, no weapon reach at the proposed cell,
the unchanged selected ranged-heal target at range2, a move to range1 and a
strictly greater capped potential capacity with known `m` in1/.75/.5. Retain
every current injured ally's band (adjacent<=1, ranged<=3), and every current
functioning armed ally's range3 support, including healthy allies. No other
ally's present healing opportunity is sacrificed for the selected target.
Range3→2 alone gives no one-step capacity increase and is not pursued. There is
no second-stage chase, target rewrite, wait counter, reservation, formation,
path search, logging stream, policy threshold change or opponent input.

## Generated verification and integration recommendation

The explicit focused suite passed **97 tests**, including14 new closing tests.
Current runtime healing, movement, pressure escape, ranged spacing, escort and
real tick-flow checks passed unchanged. No runtime build generation or npm check
rerun is needed for this test-only change. Runtime/config/generated-build and
index hashes are verified separately; task-local diff and whitespace reviewed.

Generated cases use distinct starting cells and supplied successive observations:
safe closing then stable adjacent hold; blocked/reserved/unsafe/unknown cells;
moving target, target recovery, lost HEAL/MOVE and fatigue; accepted, rejected or
unknown movement returns without displacement; pressure-retreat precedence;
injured-band/healthy-weapon preservation; modifier/injury caps; hybrids and owner
precedence; bounded work, malformed observations, renaming/order invariance and
unique-cell mirrored world-edge cases. A static approach produces potential24→72
only when a later input explicitly places the healer adjacent. HP is never
advanced by mocked healing. The14 new tests prove decisions, not Arena movement.

The **initial evaluation rejected integration** because two independently
evaluated healers can request the same currently free cell. That was an
unresolved-outcome concern, not a demonstrated safeguard violation. The original
receipt remains unchanged as historical evidence. The follow-up below resolves
that narrow concern without changing the candidate or adding arbitration.

[Findings, focused checks and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/healer-useful-closing-test-only-20261017-2SbDou/report.json).

## Convergence outcome follow-up — 2026-10-17 (historical, before integration)

The original generated fixture is now shared by the original convergence test
and its outcome tests: A(5,4), B(5,6), injured armed target(7,5), shared plain
cell(6,5),6 functioning HEAL each, target200/1200 HP, healing multiplier1. Standing
cells are explicitly plain as well; this does not create another admissible
closing destination. The target-adjacent cell is free only at the initial
observation. Exactly three types of next observation are supplied, **not chosen
from return codes or computed by an arbitration/physics simulator**. No
co-location or both-move outcome is permitted. Other positions/injury/parts stay
fixed for this narrow comparison. Healthy and7-HP-injured healer variants pass.

At the current observation, both baseline and candidate issue `rangedHeal` with
potential24 HP each, even after both mock `moveTo` calls return0. Neither call
changes positions or HP. The next supplied observation determines later capacity:

| Supplied outcome | Next positions A / B | Next healing calls / combined potential | Subsequent static decisions |
| --- | --- | --- | --- |
| A moves | (6,5) / (5,6) | heal72 + rangedHeal24 =96 HP | A holds adjacent; B holds because the only closing cell is occupied. |
| B moves | (5,4) / (6,5) | rangedHeal24 + heal72 =96 HP | Symmetric: both hold. |
| Neither moves | (5,4) / (5,6) | rangedHeal24 + rangedHeal24 =48 HP | Both re-propose(6,5), without displacement. |

Baseline holds at the initial positions with48 HP combined potential. These
totals are capped once by the target's1000-HP deficit and are not actual healed
HP. Each winning outcome retains every checked injured-ally healing band and
functioning armed ally's range3 access; no current or destination weapon reach
is present. The loser has not moved, and the winning pure healer is now adjacent
to it, so mutual healing access is not downgraded, including in the injured
healer variant. The winner's other relations are exactly those checked against
stationary allies by admission. Thus **convergence alone** cannot break these
snapshot safeguards in the supplied winner/stay outcomes. This is not a proof
about arbitrary simultaneous third-actor or enemy movement.

Five subsequent observations per outcome show no positional oscillation. With a
winner, no further closing proposals occur while it occupies the cell. With no
winner, ten proposals (two per observation) leave useful healing and positions
equal to baseline holding. Each candidate evaluation still has at most8 terrain
checks and at most one proposed movement call per healer. This is **bounded
per-tick work and loss of an improvement opportunity, not a bounded stall
duration**: without a new counter there is no eventual-progress guarantee.
Actual movement/diagnostic CPU overhead is not measured here, and repeated
commands may continue; they are not evidence of oscillation or physical travel.

After a no-displacement observation, a new adjacent melee threat to either
healer triggers the unchanged actual pressure-retreat selector. The closing
adapter returns that plan unchanged without another neighbour scan; the unmodified
executor calls the mocked retreat API and retains current-position ranged healing. No
stale closing ownership, waiting state or counter suppresses this response.
Another generated subsequent observation restores the target's HP and makes a
healthy melee guard eligible for the actual escort planner: escort assigns, then
the unmodified executor's mock call uses its target rather than the old closing cell. This
health change is an explicit input, not simulated healing. Pair/capture/contest
owner plans also remain identical through the adapter after failed closing;
those seam checks do not claim new objective/pair admission or integration.

The **19-test affected file passes**:14 retained closing tests and5 new tests
(three outcome types, urgent response and later ownership). The unaffected83
checks from the prior97-check suite are reused, not rerun. Candidate, private
helper loader, runtime/config/build and index are unchanged. Task edits are
limited to this design and its test file. No new reservations, counters,
movement arbitration, simulator, replay-response reads or matches were added.
Preservation also found ctime-only changes on two referenced squad PNGs, with
inode/size/mtime unchanged. Their payloads were not deliberately opened or
edited. Before flags/block counts were not captured, so hydration cannot be
ruled out; cause is unresolved. No repair was attempted; the receipt retains
the exact metadata exceptions instead of claiming complete preservation.

**Recommendation:** convergence alone is not a sound reason to reject a
prospective inactive runtime integration. A separately requested integration
through existing movement/ownership seams is justified, retaining all current
threat/support gates, observed-position revalidation and ordinary healing
selection. This task keeps the candidate test-only and authorizes no activation
or match. Engine arbitration, arbitrary dynamic non-oscillation, the historical
tick80 cell's legality, prevented damage and survival benefit remain unproven.

[Outcome traces, focused results, exact diff and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/healer-closing-convergence-audit-20261017-BIKrLg/report.json).

## Current inactive runtime integration

The runtime policy now lives only in `src/tactics/healer-closing.js`.
`tests/fixtures/healer-useful-closing-candidate.js` and the neighbour fixture
are compatibility re-exports. The original19 cases still exercise that single
implementation. Ordinary selection in `movement.js` changes only by exporting
the existing neighbour helper; pressure-retreat behaviour is not rewritten.

`healerUsefulClosingExperiment = false` is the sole new switch. Existing scout,
holding, pair and secondary switches remain false; healer escort remains true.
When false (or missing in an isolated fixture config), neither closing policy
nor its flag adapter is called. A throwing-module test verifies this bypass and
the exact frozen command trace for hold, flag fallback, distant injury, pressure
retreat and hybrid cases. The same trace also passes when the saved pre-integration
loop/executor are loaded read-only in memory. This is scoped command equivalence,
not identical build-tagged logs: adding a switch/module changes the build ID.

When enabled in isolated tests, the loop computes a multiplier only from the
bounded complete seven-flag inventory: known IDs, positions, existence,
ownership, effects/counts and scores. Unknowns return null, never assumed1.
The promoted policy conservatively rejects unsupported creep observations
(existence, IDs, positions, integer HP and known bounded body-part data).
These are representation checks, not changed threat/support thresholds or tuning
to the replay. Every original admissible generated case remains covered.

Execution priority is per actor: escort and pair owners execute first, existing
ordinary/pressure selection runs unchanged, then prepared capture/contest steps
or holds retain ownership. Only an ordinary injured-ally hold can reach closing.
A missing direct-move API leaves baseline intact. Closing does not participate
in or cancel secondary preflight, reset an attempt, or alter shared24/4 budgets.
There is no global traffic/priority arbiter; other actors' concurrent movement
and future enemy pressure remain outside these snapshot checks.

A successful plan records `healer-useful-close` through the existing bounded
action-decision stream. It uses the existing adjacent `move(direction)` actuator,
with the checked target coordinates and a correlated attempt/return. There is
at most one movement command per actor; no new path search. No closing
reservation is added—even a failed/unknown closing return reserves nothing.
Existing retreat reservations are read, not extended to closing. Repeated
stalls create no persistent closing state, extra waiting allowance or progress
claim. Geometry is re-evaluated against each new actual observation.

Healing-target selection, heal/attack compatibility and action order are
unchanged. On the closing tick, the healer still calls rangedHeal if the
observed target is at range2. Only a later supplied observation of adjacency
permits a direct-heal opportunity; no intended move repairs HP or HEAL capability.
Convergence outcomes A-only, B-only and neither are generated inputs, not an
Arena arbitration model. No historical legal tick80 step or survival effect is
claimed. Incremental live CPU overhead is unknown.

### Verification and trial boundary

The first real-tick closing regression failed before implementation with
`injured-ally-in-range` rather than a close. The affected movement/healing/
evidence/secondary-flow suite passes186 checks, including real direct steps,
current-tick healing, all three partial/converging outcomes, accepted/rejected/
unknown returns without displacement, subsequent retreat, actual escort
acquisition, unsafe/occupied/unknown inputs and live/destroyed nominal hybrids.
Executor seam checks preserve pair and capture/contest step/hold ownership.
Default-off tests throw if the new adapter or policy is evaluated and reproduce
the pre-integration command trace.

Inactive build generation/check and `npm run check` pass. Existing unrelated
storage/CLI validation is reused, not rerun; no dependency, installation or Git
mutation is required. The PNG preservation exceptions remain metadata-only
references: their payloads are not opened or repaired by this task.

No failing functional/build check currently blocks a separately requested
trial-preparation task. This is **not** activation or approval to launch a match.
Actual Arena direct-step displacement, current flag observations, dynamic
congestion/support changes and measured CPU remain live-unverified. They are
limitations, not claims of prevented damage, improved healing or survival.

### Exact rollback instructions (not executed)

Operational disable is `healerUsefulClosingExperiment = false`—already the
checked-in state. If a future authorized trial enables it, restore its exact
saved config/build checkpoint; do not change any other switch.

To remove this integration and recover the pre-integration source build
`d1e95a106a708f10826cf472be65e143bab86f44ef84f5d537bb3c07f6639e0f`:

1. Use the exact per-file before-copies and hash guards in
   [rollback.json](/Users/zoltanka/.local/share/pain-and-gain-evidence/healer-closing-integration-20261017-K2f1sR/rollback.json).
   First compare current bytes against that receipt's after-hashes; stop on
   intervening changes rather than overwriting them.
2. Restore the15 listed pre-existing source/config/build, fixture, package and
   documentation files byte-for-byte using those copies. Preserve every other
   file, the Git index and both PNGs. Do not use Git checkout/reset or a broad
   directory restore.
3. Park the four newly added files listed in the manifest in a separate owned
   evidence directory, outside the repository. In particular remove the new
   `src/tactics/healer-closing.js` from the runtime source tree: merely removing
   its import would not restore the digest. Retain the parked files recoverably.
4. Verify restored before-hashes, then run the resident Node
   `tools/build-id.js check` (not generate). It must report the exact old build
   above. Restore the original five switches, including escort on and
   secondary off; the new switch is absent in that exact prior config. No
   index refresh, new match or PNG read is part of rollback.

[Integration checks, exact before-copies and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/healer-closing-integration-20261017-K2f1sR/report.json).
