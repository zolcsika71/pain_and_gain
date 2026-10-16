# Adjacent ranged retreat: support and cycling audit — 2026-10-17

Decision: correct one **avoidable production escape choice**, not the rejected
pre-contact proposal. New source build:
`79790451f2c07eebd62902ffb77d5b7618fdd97ef5a9d9d93a2314a70e74e094`.
All switches are unchanged: escort on; closing, secondary objectives, scout
allocation/holding and pairing off. No match or activation is authorized.

## Scope and reproduction

The generated world/unit helpers from the rejected
[pre-contact evaluation](precontact-ranged-kiting-test-only-2026-10-17.md)
are now shared verbatim through `tests/fixtures/ranged-generated-world.js`.
The rejected test-only policy and its adverse assertions are unchanged. New
`tests/unit/adjacent-retreat-support.test.js` invokes the real production
movement selector, executor and healing/combat selectors. No alternate controller,
traffic simulator, damage model, replay body or hypothetical historical outcome.

On baseline `097a036fe433226c6dc24709f0cce04bdf8036ac395403531038e629fb05e192`:

| Generated observation | Original escape | Available alternative |
| --- | --- | --- |
| Ranged(10,10), melee(9,10), functioning healer(8,13) | (11,9), healing range4 | (11,10), healing range3 |

Both exits are adjacent, plain, unoccupied and outside every current melee
envelope; both retain the same enemy within ranged reach. Neither enters ranged
fire in this case. The initial y/x choice therefore loses available healing
unnecessarily. The regression expected the alternative and failed against the
unchanged production code. A second case also demonstrates avoidable direct-heal
band loss. These are generated production-selection defects, not claims that
this choice caused a recorded elimination.

## Narrow correction

Only `movement.js:rangedRetreat` changes gameplay. It still requires an adjacent
functioning melee enemy, a pure ranged actor, functioning movement and zero
fatigue. `localRetreatStep` and the executor are unchanged.

Remember the original first fully legal escape during the **same** eight-cell
scan. Prefer the first legal cell retaining every currently reachable living
owned functioning healer's current band: adjacent remains <=1, ranged <=3.
Fatigued, injured or immobile functioning healers still supply access. Their
selected target or healing amount is not promised. Unsupported/oversized support
observations do not create a new escape veto; bounded known candidates alone
participate in the preference.

A preferred cell must not regain a functioning ranged source escaped by the
original first legal choice. All original terrain, occupancy, reservation,
melee, new-ranged-envelope and selected-target-range gates remain. If no preferred
cell exists, **use the original escape**, including when healing access is lost.
Do not stay in adjacent melee merely to retain healing. With no available support
the original first escape is returned. No weights, thresholds, extra scan,
path search, reservation system, persistent state or waiting allowance is added.

The executor still issues one adjacent-goal `moveTo`, then ordinary tactics.
Accepted/rejected/unknown returns do not supply positions. Current-tick healing
and attacks use the original observation. Subsequent explicitly supplied positions
are the only progress evidence. The helper can now inspect more of its existing
eight-cell limit before falling back; incremental Arena CPU is unknown.

## What was not corrected or claimed

With a static melee enemy, a supplied escape is followed by range-two standoff:
no immediate approach/retreat bounce. A repeatable production cycle is possible
with reacting enemies. The retained sequence is:

`retreat(adjacent) -> hold(range3) -> approach(range4) -> hold(range2) -> retreat(adjacent)`.

Every actor/enemy supplied displacement is at most one cell. The new retreat
requires renewed actual adjacency; ordinary pursuit happens outside ranged reach.
One ranged attack opportunity is unavailable at the range-four observation.
That is the existing pursuit/spacing trade-off, not proof of an avoidable
static-enemy loop or a need for new anti-chase state. No latch is added.

Four distinct-cell partial outcomes reuse the moving-healer fixture. With ranged
(10,10), adjacent enemy(9,10), healer(8,13), other injury(4,16), offer only ranged
exit(11,10). The healer independently approaches that injury; its supplied plain
adjacent step(7,13) reduces distance to the injury4 ->3. If both move, healer
access becomes range4, whereas holding ranged at(10,10) retains range3. This is
real generated support loss, but holding also leaves the actor in current melee
reach and no support-preserving escape was available. It is **not** the avoidable
choice fixed above. The preference cannot guarantee support under independent
future healer movement, other actors' arbitration or reacting enemies.

## Verification and preservation

The initial new12-check run failed3 support-choice assertions and passed9,
including static/return/partial/ownership cases. The final new suite has14 checks.
The affected18-file suite passes **206 tests**,0 failures/skips: production ranged
and healer retreats, real tick flow, healing/compatible combat, melee waits/rejoin,
escort/ownership, disabled closing, secondary flow and the rejected pre-contact
experiment. The latter remains rejected; passing adverse assertions do not
promote it. Unaffected storage/CLI validation is reused and not run.

Build generation/check, `npm run check`, task-local diff and whitespace checks
pass. Runtime changes are limited to `movement.js` and generated build ID.
Shared fixture extraction leaves the rejected candidate implementation and its
assertions unchanged. Config and Git index bytes are unchanged; PNGs and managed
manifest are not accessed. No hydration, activation, replay read or match.

The focused206-test TAP output exceeded its tool output cap; the retained partial
receipt includes successful process exit and the complete206/0/0 summary. The
earlier39-test receipt and failing-before receipt are complete. No test rerun was
performed merely to recover omitted TAP lines.

Keep this general correction as an unactivated source candidate. Do not infer
guaranteed engine displacement, escaped damage, healed HP, prevented casualties,
survival or territorial benefit. No replacement experiment or trial is prepared.

Evidence and exact pre-edit source:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/adjacent-retreat-support-audit-20261017-0AbGo5/`.
