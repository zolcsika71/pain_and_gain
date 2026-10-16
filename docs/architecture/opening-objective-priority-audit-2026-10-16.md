# Opening objective-priority audit — 2026-10-16

Recommendation: **do not integrate a flag-priority override from this evidence**.
This investigation replaces the pending healer catch-up experiment; neither it
nor the rejected fixed-point rally is implemented or activated. Runtime remains
`c14daba6f8c054218bbe32d3c3f890fdb3fa467b4615a91ec9fdf3af3924b07f`,
allocation off, escort on, scout holding/pairing off.

## Evidence and scope

Replay `6ad152e374ae4378a665afb2`, Golden Eagle v19, our side player2, emitted
historical build
`4896ef3596bcca45755413fa8d090a7518bb1ece2ed8d416ea17461109e89215`.
Only retained reviews/projections were used; no original-response or managed
manifest reads. Reconstruction covers pre-action ticks 1–44 and their next
observed positions, ending at resolved frame 44. Tick N snapshots align with
frame N−1. Accepted movement calls do not prove successful displacement.

- [Contact review](/Users/zoltanka/.local/share/pain-and-gain-evidence/contact-wait-live-review-20261016-SwoCqP/report.json)
- [Targeting audit](/Users/zoltanka/.local/share/pain-and-gain-evidence/first-contact-targeting-audit-20261016-izMPzC/report.json)
- [Prior rally evaluation](opening-rally-experiment-2026-10-16.md)
- [Exact decision/position reconstruction](/Users/zoltanka/.local/share/pain-and-gain-evidence/objective-priority-audit-20261016-MXjhTL/analysis.json)

The retained projection's SHA-256 is
`d23b787672a187449a519900e2bfcd429b25bb898d98d29551c9ba2d8b8bee26`.
Its explicit `neutral`/`me`/`enemy` owner labels are mapped to Arena's
undefined/true/false flag ownership for escort reconstruction. Functioning-part
counts reconstruct capabilities, not exact per-part HP. All **616** historical
movement reasons and selected target IDs/coordinates match the current selector
sequentially with engagement state: 568 movement attempts returned numeric 0;
48 decisions made no movement call. There was no escort assignment.

The earlier source comparison found movement, healing, objective selection and
escort unchanged (14/18 runtime files identical overall). Current combat,
executor, loop and generated identity differ due to guarded ranged spillover.
This audit does not equate historical attack allocations with current spillover
or simulate alternate resolved combat.

## Actual priority hierarchy

[`selectFlag`](../../src/strategy/objectives.js) always returns `flags[0]`:
it chooses a fallback destination, not a command overriding every other rule.
[`runTick`](../../src/loop.js) prepares optional allocation, escort and pairing,
then issues movement and compatible tactics separately.

In [`moveCreeps`](../../src/arena/execute.js), active escort takes precedence,
then optional paired movement (disabled), then the ordinary selector. Optional
allocation changes an actor's fallback, not its combat objective (also disabled).
Within [`selectMovementPlan`](../../src/tactics/movement.js):

1. Optional unassigned-scout holding (disabled).
2. For actors without functioning weapons, healers approach an injured ally at
   range four–five, or hold for an injury within three; otherwise flag fallback.
3. For weapon actors, active bounded rejoin precedes normal local enemy choice;
   nearest living enemy within five wins, with the existing one-observation
   range-six retention. Local support/contact pauses share two observations.
   Attack-range holds, pursuit latch and rejoin rules remain intact.
4. Flag fallback only when no applicable combat/support objective remains.

Pure scouts and weaponless former melee also use fallback; there is no general
threat-avoidance rule for them or healthy healers. Escort acquisition requires
owned centre and no friendly injury. In this opening the centre was neutral
before injury, then injuries prevented acquisition once owned. Healing/attack
selection uses pre-action observations independently of the movement target.

## Where flag priority actually matters

M/R/H refer to our melee/ranged/healer suffix IDs; S denotes scout.

| Tick | Issued reason/command and observed next position | Interpretation |
| --- | --- | --- |
| 1–35 | All 14 actors select flag fallback to vulnerability flag (49,49). At 35 M3 (54,52) → (53,51); nearest enemy six away. | Shared objective does not assemble roles. M3–H2 and M3–R2 separation is six at tick 1 and seven at 30–39. Initial stagger persists, but no available local combat objective is overridden. |
| 36 | Five weapon actors switch to `combat-approach`; nine retain fallback. M3 (53,51) targets enemy ranged 3 (50,46) → (52,50). | Combat already wins before first ranged attack. |
| 37 | Six weapon actors have combat approach/hold; eight fallback. H3 (51,51) issues accepted flag move → (50,50). | Against unmoved tick-37 enemies, that observed step enters three enemy ranged envelopes from none. This is a real flag-directed exposure opportunity, not proof those enemies attacked H3. It also puts H3 adjacent to R4; H3 remains full-health through frame 44 and supplies healing from tick 38. No demonstrated lost useful support position. |
| 38–39 | H1/H3 use injury support at 38. H2 still fallback at (55,56), nearest injury R4 six away; → (54,55), within five at 39, then `injured-ally-approach`. | Range boundary, not flag defeating an eligible injury target. The observed tick-38 step closes the injury distance too; an alternative path is not established. H2 first heals at 42. |
| 39–40 | M3 (51,48) issues accepted `combat-approach` toward enemy ranged 3 (50,46), observed next (50,47). At 40 it attacks/holds there with 1,420 HP; only H3 at range three offers 24 nominal healing. | Movement increases distance from centre from one to two. The commitment is combat-driven, not flag-driven. Melee contact begins at 40; healing access does not prove sufficient capacity or an actual allocation to M3. |
| 39–42 | S1 continues accepted flag calls: (52,51) → (51,50) → (50,49) → (49,49), then remains there. Centre ownership first appears at resolved frame 42 / snapshot 43. S2 also uses fallback. | Flag approach exposes a scout and enables a scoring/debuff trade-off. No weapon command is diverted to capture. Other actors' routes can be congested; command targets alone cannot establish that the scout blocked a useful route. |
| 40–43 | Only the two scouts use flag fallback. All nine weapon actors use combat approach/hold; all three healers use injury support. M2 holds at (49,47) on 41–43. | Immediate frontline commitment is not capture-priority movement. No support pause was replaced by a flag command. |
| 44 | M2 (49,47), 250 HP, zero ATTACK, issues accepted fallback toward centre; it disappears in frame 44. Other fallback actors are scouts. | Weapon loss precedes fallback; this call does not demonstrate that capture displaced an available attack or caused the casualty. No surviving displacement is observed. |

No functioning weapon's flag-directed observed step in this window enters an
attack envelope against unmoved enemies. The three fallback steps entering such
envelopes from outside belong to H3 at 37 and S1 at 39/40. This is a geometric
comparison, not a threat-safe path claim: enemies move, and simultaneous actions
limit causality. H3's exposure is genuine risk, but withholding its approach
could also reduce direct-healing access. A healthy-healer hazard rule would need
its own evidence; it is not justified here as a flag/combat precedence repair.

## Capture cost and interpretation

The selected centre earns five points/tick and, while held, multiplies incoming
combat damage by 1.1 ([rules](../pain_and_gain_rules.md)). The scoring lead is
therefore not free readiness. Delaying capture forfeits income and may allow
enemy ownership; it might avoid/delay the vulnerability penalty. Neither effect
establishes that delayed capture changes this casualty or match. No alternate
capture timestamp, individual damage attribution or survival is computed.

The user's hypothesis is supported only in the limited sense that the default
opening sends every role toward the first flag without a readiness assessment.
It is **not demonstrated** that flag priority overrides a better available
combat/support position or is the cause of premature melee contact. Near contact,
combat pursuit/holding and reactive support policy explain the commands. A broad
"combat before flags" change would be redundant; a bounded override solely of
`flag-fallback` would leave the relevant M3 combat advance unchanged.

## Focused checks and decision

[`objective-priority-audit.test.js`](../../tests/unit/objective-priority-audit.test.js)
adds six contract checks, not a candidate policy: combat wins despite a closer
flag/any ownership; injury range boundary; shared two-pause release returns to
combat rather than flag; weapon-loss fallback; and escort precedence/acquisition.
A generated four-tick sequence keeps all units on distinct cells: blocked
combat movement stays blocked without issuing a second flag command, progresses
when vacated, and resumes flag approach when the enemy withdraws. It proves
command priority and bounded test progress, not Arena pathfinding or exposure
improvement. Baseline movement has no guarantee against physical blocking.

Node 24.19.0, 34/34 checks passed:

```sh
node --max-old-space-size=256 --test --test-reporter=tap \
  tests/unit/objective-priority-audit.test.js \
  tests/unit/movement.test.js tests/unit/healer-escort.test.js
```

**No override candidate is justified or implemented.** Consequently there are
no candidate activation/release/reset thresholds, claimed coordination gains,
capture-delay estimates or alternate outcomes. Reject integration of a generic
flag-priority reduction; retain existing precedence. The rally stays rejected,
and the healer catch-up experiment is not pursued. Runtime/switches/index and
unrelated changes remain unchanged; only this note and focused tests are new.
