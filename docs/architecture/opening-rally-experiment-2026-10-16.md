# Opening rally-and-advance experiment — 2026-10-16

Status: **reject runtime integration of this candidate**. The experiment is
test-only. Runtime, selectors, deployment switches and build remain unchanged:
`c14daba6f8c054218bbe32d3c3f890fdb3fa467b4615a91ec9fdf3af3924b07f`.
No match or activation is authorized by this evaluation.

## Observed opening, not a formation-causality finding

Replay `6ad152e374ae4378a665afb2` (Golden Eagle v19, our side player2)
emitted `4896ef3596bcca45755413fa8d090a7518bb1ece2ed8d416ea17461109e89215`.
Analysis uses the retained projection and audits, not original responses:

- [Contact review](/Users/zoltanka/.local/share/pain-and-gain-evidence/contact-wait-live-review-20261016-SwoCqP/report.json)
- [Targeting audit](/Users/zoltanka/.local/share/pain-and-gain-evidence/first-contact-targeting-audit-20261016-izMPzC/report.json)
- [This evaluation and complete bounded timeline](/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-rally-evaluation-20261016-ajtKRQ/observed.json)

Pre-action tick N aligns with resolved frame N−1. M/R/H mean melee/ranged/healer;
IDs below are suffixes of `pg_player2_*`. These are observed positions and issued
calls, not reconstructed alternate outcomes.

| Tick | Positions and effective participation |
| --- | --- |
| 30 | M1 (59,62), M2 (59,58), M3 (59,57), M4 (60,57); leading R3–5 (54–55,57–58), trailing R1 (59,63), R2 (61,64). H1 (60,60), H2 (63,64), H3 (57,58). H2 is seven tiles from M3. The initial deployment was already staggered. |
| 37 | First contact: R3–5 at (47,51), (49,50), (48,50) issue three accepted ranged attacks. R1/2 remain eight/nine tiles from the nearest enemy. M2–4 are three/four tiles away; M1 seven. H1 (53,53), H2 (56,57), H3 (51,51). All four melee have some healing access; M2/3 each could access H3's adjacent 72 plus H1's ranged 24. M4 has only two ranged capacities (48 total); M1 one (24). No injured ally yet, so no healing calls. |
| 38–39 | Three ranged attackers remain active. H1 schedules ranged healing (24) and H3 adjacent healing (72) on R4; H2 still has no healing call. |
| 40 | First melee attack: M3 (50,47), 1,420 HP, seven functioning ATTACK parts. H1/H3 at ranges four/three offer only 24 accessible healing to M3. Three ranged attacks; healing goes to R5. |
| 41 | Two melee and four ranged attacks. R1 joins; R2 remains outside range. M2 (49,47), 1,576 HP, has two healers at range three (48 potential); H1 schedules 24 to M2, H3 24 to R5. H2 is six tiles from M2. |
| 42 | Three melee and three ranged attacks. H2 first schedules healing, 24 to R4; H3 schedules 72 to R4 and H1 24 to M4. |
| 43 | Four melee and four ranged attacks. Centre is ours (resolved frame 42). M2/M3 each have 1,020 HP and three ATTACK parts. H2 is now (50,51), H3 (50,50); both heal R4, H1 heals M4. |
| 44 | All five ranged units attack, but only M1 has an adjacent attack. M2 is still present pre-action at (49,47), 250 HP, zero functioning ATTACK. It disappears in resolved frame 44, the first friendly casualty. H1 heals M4; H2/H3 heal M1 at range. |

Six functioning HEAL parts provide nominal 72 adjacent or 24 ranged healing.
Per-ally access is **not additive across allies**: a healer cannot spend its full
capacity on each simultaneously. Neither proximity nor scheduling proves that
incoming damage can be sustained. Single-target ranged attacks retain full
power through range three. Accepted calls and resolved markers support action
selection, not individual damage attribution under simultaneous resolution.

Role separation persists during the approach, but it began before contact;
this evidence does not isolate movement as its cause or explain elimination
by formation alone. The centre was neutral before injuries, then owned after
injuries: existing escort acquisition cannot be assumed to have assembled this
opening. Pairing is disabled.

Historical/current comparison: 14 of 18 runtime files are byte-identical,
including movement, healing and escort. Combat, executor, loop and generated
build differ for the later guarded ranged-spillover integration. Thus historical
tick-43 targeting is not the current targeting trace. The experiment invokes
current movement and ordinary tactical selectors, without claiming to simulate
the observation-dependent spillover guards or replay combat.

## One candidate

Implementation: [test-only planner](../../tests/fixtures/opening-rally-candidate.js)
and [multi-tick checks](../../tests/unit/opening-rally-experiment.test.js).

- Enter once, while the first flag is neutral and the closest pure weapon is
  within eight tiles. Pin that weapon's current tile as the fixed staging point
  (distance then ID). Pure scouts/mixed roles keep ordinary routing.
- Require at least three pure melee, three pure ranged and two pure healers,
  healthy, mobile and unfatigued. Bound each roster to 14 and bodies to 50 parts.
  Pin participating identities/roles; reject duplicates and changed/lost members.
- Participants within three tiles hold; others approach that point. Release when
  three melee each have healing within three, three ranged are within three of
  those melee, and two distinct healers have melee access, all in the staging zone.
  This quorum is not a proof of shared enemy reach or sufficient healing.
- At most two rally observations; elapsed tick two resumes normal routing even
  without quorum. Any living enemy within five of participants, stage or flag,
  injury/fatigue/lost MOVE, changed ownership or active escort terminates earlier.
  Escort retains priority. All terminations are terminal until a match/tick reset;
  there is no reacquisition or patrol.
- A held melee consumes that many observations from its existing two-pause
  allowance. The test harness transfers this once into its first local engagement;
  actors that kept moving retain unused pauses. No fresh allowance is repeatedly
  seeded after disengagement. This is a tested proposal seam, **not runtime wiring**.
  The planner is called once per tick; a non-increasing tick resets match state.

Attack/healing selection remains unchanged and available during rally. There is
one movement command per actor. No new pathfinder, collision arbitration or
formation controller is introduced.

## Generated comparison and limits

The fixture preserves the exact retained tick-30 positions/health/part counts.
Ticks 30–44 afterward are generated: enemies take one Chebyshev step toward the
flag; friendly commands use existing movement decisions. No terrain, damage,
healing resolution, capture or opponent adaptation is simulated.

| Generated resolver | Baseline first ranged / melee contact; flag-tile reach | Candidate result |
| --- | --- | --- |
| Permissive empty grid | 37 / 39; 39 | Quorum release 32; contact 38 / 40; flag tile 41. Three instead of zero melee have adjacent healing at first contact, but units overlap (six excess occupants at candidate contact). This is an optimistic diagnostic model, not physically valid Arena movement. |
| Conservative blocking stress | 37 / 40; 39 | Timeout 32 without quorum (one melee, three ranged, two healers local); contact 38 / 42; no flag-tile arrival through 44. Two instead of zero melee have adjacent access initially; that advantage is gone by tick 42. |

The stress resolver rejects occupied destinations even if vacating, plus all
contested destinations: deliberately pessimistic, not Arena arbitration. It has
zero overlapping occupants. Neither model makes melee available at first ranged
contact. Flag-tile arrival is not capture timing; delayed pressure could also
delay centre income (five points/tick), but no counterfactual score is calculated.
Holding can improve local proximity while reducing initiative and concentrating
exposure. Missing/blocked support cannot stall this gate indefinitely, but timeout
can release an uncoordinated group. No survival or gameplay benefit is established.

## Validation and recommendation

Node 24.19.0, bounded allowlist:

```sh
node --max-old-space-size=256 --test --test-reporter=tap \
  tests/unit/opening-rally-experiment.test.js \
  tests/unit/frontline-support-multitick.test.js \
  tests/unit/movement.test.js tests/unit/tactics.test.js
```

36 checks passed (10 experiment, 26 affected compatibility). Tests cover quorum
release, blocked/missing support, enemy approach/adjacent attacks, two-observation
timeout, wait-budget handoff, escort, loss/injury/fatigue, ownership, role/identity
conflicts, deterministic anchor/reset, scout/mixed isolation and unchanged
same-observation attack/healing calls. The earlier 35/36 run exposed overlapping
healers in a generated fixture; it is retained, and their setup now uses distinct
positions. No original responses, managed manifest, tests outside this allowlist
or live matches were accessed/run for this experiment.

**Reject integration of this rally gate.** Its idealized access gains do not
establish coordinated contact, while the blocking stress case delays melee by
two ticks and flag arrival beyond the window. Keep runtime and all switches
unchanged. This result authorizes neither a revised policy nor a live trial.
