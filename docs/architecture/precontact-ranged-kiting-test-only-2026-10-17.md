# Pre-contact ranged kiting — test-only evaluation, 2026-10-17

Decision: **reject runtime integration of this exact candidate**. Snapshot
separation works in generated cases, but moving support can leave a ranged
actor outside healing access when baseline holding would retain it. A generated
enemy retreat/reapproach also produces a repeated approach/kite cycle. These
outcomes are retained, not repaired with a new latch, formation or threshold.

Runtime/build/switches remain unchanged:
`097a036fe433226c6dc24709f0cce04bdf8036ac395403531038e629fb05e192`.
Closing, secondary objectives, scout allocation/holding and pairing stay off;
escort stays on. No trial, replay read, path search or runtime integration.

## Reference and scope

Apex `runRanged` in the local, ignored reference
`docs/examples/screeps-rl-main/samples/bots/apex-v3/src/combat.ts:258`
backs away from functioning melee within two while retaining ranged attacks.
That reference snapshot is not included in the published repository.
Its World APIs, broad flee search and possible second movement request are not
copied. The local [Arena API](screeps-arena-api.md) documents adjacent melee,
range-three ranged attacks, one-square moves and scheduling-only return codes.
This motivates testing separation before contact, not a claim of prevented damage.

The single proposal is
`tests/fixtures/precontact-ranged-kiting-candidate.js:improveRangedHold`.
It imports production `localRetreatStep`; it has no independent neighbour
implementation. No runtime module imports the fixture. It never issues a call,
mutates reservations or stores persistent state.

Only an ordinary `hold/combat-in-range` of a living owned pure ranged actor can
change. Require zero fatigue, functioning MOVE/RANGED_ATTACK and no nominal
ATTACK/HEAL, including destroyed parts. An adjacent functioning melee enemy
keeps existing retreat or blocked-hold behavior. Otherwise at least one
functioning enemy melee must be exactly two away. Use the baseline engagement's
selected enemy; do not rerank targets or replace an approach/owner.

Require known bounded roster/body/position observations and consistent occupancy.
Inspect at most eight cells with existing y/x order, known plain terrain,
occupancy and caller-supplied retreat reservations. Reject any destination
within two of any current functioning melee; keep the selected target within
three and enter no new functioning ranged envelope. Existing ranged exposure
can remain. Bounds:14 friends/14 enemies/28 occupants/50 parts per actor.

Every currently reachable living functioning healer must retain its current
band to the ranged actor: adjacent stays <=1; ranged stays <=3. Injury, fatigue
or loss of healer MOVE does not remove functioning healing access. No minimum
healer count is introduced: if no functioning healer has current access there
is none to preserve. This is not a claim of sufficient support or an allocated
heal. Unknown input returns the original baseline, never synthetic neutral data.

## Generated evaluation

`tests/unit/precontact-ranged-kiting.test.js` compares production baseline
movement and tactics with the test-only decision on supplied successive inputs.
Mock commands record calls only; they do not update positions, health or body
parts. Direct candidate requests use adjacent directions, not a path search.
Production healing and combat selectors are unchanged and use original positions
on the current tick. Full selected attack/healing call traces are compared.
No engine collision/arbitration or damage/healing resolver is installed.

Positive cases show range-two baseline holds versus range-three candidate
destinations, retained current healing bands and original ranged attacks.
A supplied successful step followed by a static enemy stays at range three.
Blocked/reserved/unknown terrain, multiple melee, new ranged exposure, current
support-band loss, fatigue, destroyed parts, nominal hybrids, invalid rosters
and owner conflicts retain baseline. Partially damaged functioning parts remain
eligible. Existing adjacent retreat is returned unchanged. Rejected, unknown
and accepted-without-displacement requests repeat without inventing progress.

Competing candidates reuse a caller's tick-local reservation, including after
failed/unknown returns. The fixture does not install runtime arbitration or
reserve ordinary healer movement. Actual escort/pair holds are exercised through
the production executor; candidate owner guards cover capture/contest as well.

### Adverse cases retained

1. Supplied ranged positions (10,10) -> (11,9) -> (10,10) with enemy
   positions (8,10) -> (7,10) -> (8,10) produce kite -> ordinary approach ->
   kite. Ranged attacks cease at the range-four observation, in both planners
   on that same observation. A separate baseline controller stays at (10,10)
   against those supplied enemy positions and keeps all four ranged attacks;
   the candidate has only two. This is a generated pressure trade-off, not
   simulated damage. This proves the candidate has no general
   anti-oscillation property; it does not prove a historical or static-enemy loop.
2. With ranged at (10,10), healer at (10,11), and an injury at (10,16), the
   ordinary healer approaches the distant injury despite currently selecting
   adjacent healing for the ranged actor. Four supplied distinct-cell outcomes
   (ranged only/healer only/both/neither) show that a healer move to (10,12)
   downgrades direct to ranged access. This downgrade also occurs under baseline
   holding: it is not by itself a candidate-specific regression.
3. The stronger counterexample starts ranged (10,10), healer (8,13), enemy
   melee (8,10), and a separate injury (4,16). The only offered ranged exit is
   (11,10). It passes current ranged-heal access at distance three and increases
   melee separation from two to three. Production healer movement selects the
   distant injury while current healing selects the ranged actor. Supply the
   healer's plain unoccupied adjacent step to (7,13), reducing its distance to
   that injury from four to three. If both move, ranged-to-healer distance is
   four; baseline ranged holding would retain distance three. Production healing
   now selects the other injury, while the baseline still selects the ranged
   actor. The healer step is a legal generated neighbour, **not** a recovered or
   guaranteed `moveTo` path. This establishes a concrete possible support loss,
   sufficient to withhold integration, not its frequency or live inevitability.

## Recommendation and verification

Keep the fixture as a rejected evaluation and leave runtime unchanged. Do not
add waiting state, retune ranges or weaken support gates to make this pass.
Snapshot admission does not establish the required support preservation under
independent allied movement. No activation or follow-up match is authorized.

The focused experiment passes18 checks, including assertions of the adverse
outcomes, not18 successful strategies. Existing combined baseline validation is
reused; no unrelated test reruns, build regeneration or npm check is necessary
because runtime is unchanged. Scoped build/source/index hashes and new-file
diff/whitespace checks are retained in the evidence receipt. PNGs and the managed
manifest are not accessed.

Limits: generated positions are not Arena arbitration, guaranteed displacement,
resolved healing, damage prevention, survival or scoring benefit. Local work is
bounded per evaluation, not measured Arena CPU; failures can repeat indefinitely.

Evidence:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/precontact-ranged-kiting-20261017-R7PpVL/report.json`.
