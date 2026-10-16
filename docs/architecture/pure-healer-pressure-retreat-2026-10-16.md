# Pure-healer pressure retreat — 2026-10-16

Status: local general correction, no match or activation. Deployment switches
are unchanged: escort on, secondary objective/scout/holding/pairing off.
Current source build:
`d1e95a106a708f10826cf472be65e143bab86f44ef84f5d537bb3c07f6639e0f`.

## Demonstrated positioning defect

Replay `6ad29845abefcb7eecc8f354`, zGeneral v20, emitted historical build
`c52a37aa77c428fb8975c23643f86c99fa174c2324eef52578ee877a82e9bb30`.
The earlier trial established no secondary assignment. This correction is about
ordinary pure-healer movement, not rejected secondary travel or the opponent.

The exact resident `/log/90` response was reused, with unchanged SHA-256
`7b2fdfa27276103bcf841f8f64e18a799ec3acd14b774da68d53202802ef7a5e`.
Map schema was checked; the computed checksum is
`2d0c24396e9b62c828d45c231e4480b53501a9091095905587995503472bbc1b`.
The bounded trace covers38–68, starting one observation before first potential
weapon contact39 and ending one after first healer loss67. No other cache key,
frame, profile, managed manifest or network match response was read.

| Tick | Healer_1 observed state | Issued movement/healing; potential exposure |
| --- | --- | --- |
| 39 | (46,46),1200 HP,6 HEAL | Centre `moveTo` returned0; no enemy weapon in reach of this healer. Escort belongs to healer_3, then releases40 for injury. |
| 40–59 | Follows injured allies;1200 HP | Accepted approach calls sometimes have no next displacement; ranged/direct healing is recorded separately. |
| 60 | (60,61),1200 HP,6 HEAL | Approach returned0; `heal(melee_4)` returned0; one functioning ranged enemy at range3. |
| 61–62 | Same cell,1193→1160 HP | Two ranged enemies have reach; approach61 then injured-ally hold62. |
| 63 | Same cell,1131 HP,6 HEAL | Holds; `heal(melee_4)` returned0. Three ranged enemies have reach. |
| 64–65 | Same cell,1100→731 HP,5→2 HEAL | Holds, accepted self-heals; enemy melee with8 ATTACK is adjacent and four ranged enemies have reach. |
| 66 | Same cell,300 HP,0 HEAL/3 MOVE | Centre fallback returned0, no functioning healing. |
| 67 | Healer_1 absent | First initially identified healer no longer present; other two remain. |

At63, the plain unoccupied cell(60,60) is adjacent and was not reserved by an
earlier ranged retreat. Moving there drops ranged_3 at(63,64) from range3 to4;
remaining ranged_4(63,62) and ranged_5(62,62) still have reach. No new ranged
source or melee reach is entered. Their functioning ranged counts are6/4/6;
these establish potential access, not enemy attack selections or resolved damage.

The selected injured melee_4 remains adjacent at(59,61); the other reachable
injured ranged allies retain their range bands. Thus this step need not sacrifice
an available adjacent heal to improve the healer's position. Other healers are
12 and8 cells away at63, so cannot provide same-snapshot ranged healing to it.
The healer's actual HP loss63→64 is31; later losses are369 and431. These are net
observed deltas, not individual damage amounts or proof of which enemy attacked.
No counterfactual HP, prevented casualty or survival outcome is simulated.

## Narrow general rule

`movement.js` reuses the ranged-retreat eight-neighbour facility instead of
adding a formation, path search, threat map, timer or controller. Pure owned
living healers need functioning HEAL/MOVE, zero fatigue and no nominal ATTACK
or RANGED_ATTACK parts, even destroyed ones. Hybrids keep their prior movement.

Only current enemy weapon reach triggers this rule. Candidate cells must be
in bounds, known plain terrain, currently unoccupied and not already reserved.
They remove **all** current melee reach, enter **no new** functioning ranged
enemy envelope, and strictly improve exposure: remove melee access or drop at
least one current ranged source. No summed nominal damage or predicted enemy
orders are used. Stable y/x ordering is the existing bounded tie-break.

Every other currently reachable injured ally must remain within its current
healing band: adjacent stays<=1, ranged stays<=3. At least one living injured
or functioning armed ally must remain within3; every currently supported
functioning armed ally must also stay within3, even when healthy. Self-healing follows the healer
and is not retargeted. This deliberately refuses an escape that downgrades a
current healing opportunity or abandons all useful support; residual exposure
can remain. Approach to a distant injured ally can be deferred while escaping
current pressure, but useful local access is retained. No other healing ranking,
nominal capacity, method compatibility or scheduling order changes.

The executor uses the existing single adjacent-goal `moveTo` and shared retreat
reservation, including on rejected/unknown returns. It reserves no ordinary
movement and performs no extra explicit path search. Max8 neighbours,28 occupied
objects,14 enemies/14 friends,50 parts per inspected actor; this is a work bound,
not measured Arena CPU or a guaranteed engine step. Escort and paired movement
still execute first. Active capture/contest preflight already treats this new
emergency reason as incompatible, cancelling group ownership before execution;
none of its admission, support, query, stall or deadline gates is relaxed.

## Action rules, verification and limits

[Official Arena action rules](https://arena.screeps.com/docs/#Creep.heal), checked
alongside local `screeps-arena-api.md`, permit movement with healing. Direct heal
uses adjacency; ranged heal reaches3. Return0 schedules an operation, not its
observed success. The tutorial examples and existing local retreat facilities
were consulted; no World Room/PathFinder or formation code was copied.

The recorded-snapshot regression fails at63 before correction; both independent
63/64 comparisons pass afterward, retaining their healing selection. They are not consecutive simulated
outcomes of the candidate. Generated tests cover useful melee/ranged escapes,
unsafe/occupied/reserved exits, walls/swamps/unknown terrain, preserved healing
bands, hybrids, body/roster bounds, rejected/unknown calls, joint retreat
reservations, escort/pair precedence and successive observations with no bounce
in a static engagement. Real tick flow emits the correlated retreat/return and
unchanged heal. All205 affected checks pass; build generation/check,
`npm run check` and whitespace review pass.

No hysteresis or guaranteed global non-oscillation is claimed: distant injury,
allied/enemy movement or changing geometry may produce a later approach. Allies
may move out of reach independently. The escape can retain ranged exposure,
could be blocked by concurrent movement, and may not resolve as requested.
An isolated healer without useful supported allies is outside this correction.
Current exposure reduction is not a combat simulator, safe return or promise
that the first healer survives. Secondary travel remains disabled. No live
trial is prepared by this task.

[Source/read bounds, before/after regression and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/pure-healer-pressure-audit-20261016-mIpNRT/report.json).
