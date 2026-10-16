# One secondary army objective — 2026-10-16

Recommendation: **reject runtime integration of this candidate**. The income
problem is demonstrated, but this bounded fallback substitution does not
demonstrate a coordinated departure from the recorded centre position.
Runtime remains
`411650f86bacec4876fd32e472c983fbed6b5a8a65e8053c2c22d5ce72871a9c`.
Ranged spacing is unchanged; allocation off, escort on, holding/pairing off.
No scout, rally or post-capture hold experiment is repeated or activated.

## Evidence and one concrete choice

Player replay `6ad236fd74ae43435a65c66f`, Dr. John H. Watson v9:
[completed review](/Users/zoltanka/.local/share/pain-and-gain-evidence/ranged-spacing-live-trial-20261016-LIqhBE/player-review-kYb472/report.json).
All 28 creeps survived at full health; minimum observed separation was seven;
no combat. We held centre from pre-action tick 39 and finished at five versus
20 points/tick, losing 6,205–24,288. Ranged units made 6,390 flag-fallback
decisions. `selectFlag(flags)` still selects `flags[0]` after ownership, and
ordinary unsupported/unengaged movement continues toward that same flag.

Existing initial membership already defines squad C: healer 3 and ranged 3–5.
At tick 39 these are respectively (50,50), (49,50), (49,49), (48,53), with
functioning MOVE and full health. The three ranged weapons have healing access
within three, not guaranteed healing capacity against combat. Choose exactly
**attack-reduction flag B (31,67)**, then neutral. No alternatives are ranked.
The other ten units remain on ordinary centre behavior: four melee, two ranged,
two healers and two scouts. Three retained armed units are within centre range
three at departure. This is a presence check, not a guarantee of defence.

The prior review omitted full terrain/positions. One necessary additional read
used its exact pinned resident `/log/100` response, 91,520 bytes, SHA-256
`1bb15174b3be4a614f75d541d833214e94ec92bee8697620d52c16d9626a5c57`.
Existing parsing verified replay/build/map; bounded reads used one MiB raw,
16 MiB decoded, 64 KiB buffers, 180 seconds and 256/512 MiB heap/RSS. Only
pre-action 39–99, initial membership and map terrain are retained for this test.
The dataless managed manifest stayed unopened; no hydration or managed lifecycle
update is asserted. Residency/open race limitations remain.

## One test-only transition

[`secondary-army-candidate.js`](../../tests/fixtures/secondary-army-candidate.js)
uses the existing per-actor fallback map seam. The original centre object is
still supplied to `selectFlag`, escort and defence checks; the source flags and
scout safety references are not rewritten. Squad C contains no melee or scouts,
so changing these four fallback destinations does not substitute the secondary
for a melee rejoin anchor or scout's defended first flag. Ordinary combat,
injury support, spacing and explicit escort priority remain ahead of fallback.

- One attempt, entered with owned centre by tick 80. Pin the four identities,
  centre ID/coordinates and the single target. No target switching or reacquisition.
- Require the original three-pure-ranged/one-pure-healer composition, functioning
  MOVE, full health, zero fatigue and ranged members within three of the healer.
  Keep a living non-group functioning weapon within centre range three.
- Entry terrain-route estimates must be complete, at least geometric distance,
  and at most 40 steps for each member. Test estimates are 19/18/18/17 steps in
  healer3/ranged3/ranged4/ranged5 order. These are bounded grid estimates, not
  Arena routes or arrival promises. The 40-step/60-observation envelope reuses
  existing local assignment scales; it does not establish optimal limits.
- Cancel on centre loss/binding change, defender or member loss, injury/fatigue,
  lost role/MOVE, separation from healing, escort ownership, altered/occupied
  target, changed target ownership, or functioning armed enemy within five of
  the centre, group or objective. Unarmed occupants still block capture.
- At most 60 active observations; four consecutive unchanged group-position
  observations terminate blocked progress. These are deadlines, not extra waits.
- Confirmed own target ends the attempt. Every terminal state immediately drops
  the four fallback overrides and remains terminal until match/tick reset.
  Normal centre/support/combat behavior resumes; physical return is not guaranteed.
  There is no holding, patrol, chained flag or automatic repeat.

## Generated movement comparison

[`secondary-army-objective.test.js`](../../tests/unit/secondary-army-objective.test.js)
calls real movement, escort and tactical APIs on generated evolving positions.
The local BFS traverses only verified plain terrain, expands at most 5,000 cells
per call and evaluates eight neighbour directions. Occupied next destinations,
including vacating cells, reject; all duplicate requested destinations reject.
Every step checks terrain and distinct occupancy. No swaps, Arena arbitration,
combat/healing effects or opponent adaptation are simulated. This conservative
stress model can block movements Arena would resolve successfully.

| Scenario, ticks 39–99 | Result |
| --- | --- |
| Baseline centre fallback | No secondary capture; maximum group distance to the objective never improves below 19. |
| Candidate, enemies frozen at observed 39 | Starts at 39; ranged3/4 remain blocked near centre, healer3 moves to (50,51), ranged5 moves to (46,52) by 40. Its healer distance becomes four. Cancel `support-separated` at 41; group is within two of centre after that step. No capture or collective route progress. |
| Candidate, recorded enemy-coordinate playback | Same cancellation at 41. Playback caused zero occupancy divergences, but is not a prediction of enemy response to departure. The recorded approach first brings armed enemies within five of target B at tick 51; a separate guard check rejects that observation. Actual source ownership changes to enemy by pre-action 57. The cancelled rollout does not reach that branch actively. |
| Candidate, all group movement blocked | Four unchanged observations terminate at 43. No target switching/retry. With blocking maintained, a member remains range four from centre through 99: fallback does not guarantee return. |
| Independently generated capture-terminal control | Place the group near the target on real plain cells, remove opponents: a legal generated step reaches the flag; hypothetical ownership is confirmed next observation and releases overrides. This tests completion only, not reachability from the replay start. Return-to-centre fallback can still stall in the conservative model; no bounded physical recovery is claimed. |

All replay-shaped cases retain at least three non-group centre defenders. The
unblocked candidate's minimum armed-enemy separation is seven; no generated
combat/survival outcome is calculated. Whole-group maximum target distance does
not improve below 19. A single member's movement is not successful army progress.
No ownership income is added in these failed source-shaped departures.

## Supported income/penalty arithmetic

One attack flag adds three points/tick and lowers our entire army's ATTACK to
80%; centre's incoming-damage x1.1 remains. Squad C's ranged weapons are not
affected by ATTACK reduction, but all four melee left at centre are. At their
recorded full eight ATTACK parts each, aggregate nominal melee capacity would
fall 960 → 768 if all could attack, not a prediction of actual damage.

If we took and retained this flag while the other five non-central flags had
their recorded final ownership, income would be **8 versus 17**, still nine
points/tick behind. Taking an enemy-held three-point flag produces a six-point
ownership swing, not income parity. It also removes one attack penalty from
the opponent: with their other attack flag held, ATTACK would be 80% rather
than the observed two-flag 60%. No final score, safe capture, recapture timing,
survival or winning trajectory is projected.

## Checks and decision

47 focused checks passed on Node 24.19.0: six new transition/terrain/multitick
checks plus existing objective-priority, movement, escort and ranged-spacing
checks. Initial retained failures were a range-three synthetic ranged fixture
expecting a move despite valid in-range hold, then a generated near-target
control blocked by the conservative resolver. The control was explicitly made
an adjacent-capture terminal fixture; the replay-shaped negative result and
candidate safety bounds were not loosened.

The defence, enemy-approach, support-loss, capture/ownership invalidation,
route/timeout, blocked-progress, stable identity/reset and override contracts
pass. Test success includes evidence that the proposed departure is unsuitable,
not qualification for integration. Runtime/build/index remain unchanged.

**Reject integration of this candidate.** It demonstrates a coherent objective
binding and bounded safe cancellation, but not group-level progress under the
tested occupancy rules. No movement framework, extra latch, relaxed safety
threshold or live trial is added to force a positive result.

## Movement-model fidelity audit — 2026-10-16

The rejection remains a **lack of qualification**, not proof that Arena cannot
move squad C toward B. Its immediate cause is now explicit: on synthetic tick
39 ranged3 and ranged4 both request (48,50); the resolver rejects **both**.
Both route searches completed (996/995 expanded cells), so this initial stall
is not search-budget exhaustion. On 40 healer3 also fails to displace under
the model; separation reaches four and the policy cancels at 41. These are
hypothetical commands/trajectories, not historical attempts or return codes.
The resolver does not arbitrate a winner, reroute another actor, allow entry
into a vacating cell, or model swaps. Neither retained trace verifies those
specific simultaneous cases. There were no entries into pre-occupied cells
among the 308 inspected historical movement calls; absence does not prove
that vacating-cell entry is forbidden.

The [Arena API](https://arena.screeps.com/docs/) specifies that `moveTo` uses
`findPath`, which avoids obstacles by default. Numeric zero means scheduled,
not displacement. `searchPath` is terrain-only without a cost matrix and can
return an incomplete path. Its documented weighted A* defaults (50,000 ops,
plain/swamp costs 2/10) are not this plain-only 5,000-cell BFS. The inspected
Arena API does not establish collision arbitration or swap/vacating rules;
World-engine and third-party simulator behavior is not substituted for it.

A bounded retained scout comparison gives a concrete discrepancy. Replay
`6ad2243574ae43eb6165c3dd`, build
`91425eea54c3d74ca608c7c4bc56dcb91cf6282fad69dd05ddaada07853faeb9`,
uses the same ordinary scout `moveTo` mechanism, not the secondary candidate.
Ticks below are pre-action → next pre-action; all listed calls returned numeric
zero. Its full terrain was not retained and its map checksum differs from the
squad-C map, so no exact BFS first-step prediction is claimed for that map.

| Historical command | Conservative prediction / bound | Observed next position |
| --- | --- | --- |
| Scout2, 44, (51,46) → flag A (67,31) | Observed destination unoccupied; exact route unverified | (52,45) |
| Scout2, 58, (65,32) → A | Observed destination unoccupied; exact route unverified | (66,32) |
| Scout2, 59, (66,32) → A | Observed destination unoccupied; exact route unverified | (67,31); capture confirmed separately in the original review |
| Scout1, 44, (50,49) → centre (49,49) | Direct final step rejected by model occupancy; no API rejection inferred | Still (50,49), despite return 0 |
| Scout2, 76, (52,46) → centre | All eight goal neighbours occupied: no complete model route even on an all-plain relaxation | (51,47) |
| Scout2, 77, (51,47) → centre | Same closed goal ring; full-route prerequisite predicts no step | (50,47) |
| Scout2, 80–81 → centre | Same ring; no complete route | (48,47) → (47,48) → (48,47): movement, not capture/progress into centre |

All 16 outbound calls at 44–59 displaced one tile. The bounded sample covers
22 command ticks (44–59 and 76–81), 308 friendly movement attempts: 89 displaced,
219 did not. These counts are descriptive, not route-success estimates.
For the closed-ring case a regression reuses the **existing** BFS on a favorable
all-plain board. It still yields no next step. The complete-route prerequisite
therefore demonstrably cannot represent every accepted Arena move, even without
knowing the actual terrain. This does not establish whether Arena used an
incomplete path, special occupied-goal handling, or another implementation detail.

The test helper is extracted unchanged in routing behavior; traces now separate
`model-search-budget`, `model-no-complete-route`, occupied-next rejection,
all-contenders rejection and modeled displacement. No partial-path algorithm,
new collision model or tuning was added. A search failure is **not** a rejected
Arena destination, and an accepted command without displacement is not evidence
of a specific collision cause. No recorded nonzero movement rejection occurs
in this selected sample. The mock's unconditional return 0 remains a test stub.

Still supported: the observed scoring deficit; conditional income/penalty
arithmetic; original centre identity and guard/termination behavior; failure
under the declared conservative stress model. Not established: inevitable
congestion/separation in Arena, impossibility of an alternative route, safe
collective capture, physical return, or strategic benefit. The closed-ring
discrepancy does not itself explain the earlier two-contender departure stall.

**Next step:** before reconsidering this candidate, compare same-command
multi-actor traces with retained full terrain and both pre/post rosters at an
actual contested first step. The current sample lacks such a case; do not
invent arbitration or revive/promote the candidate to fill that gap.

[Bounded comparison, focused checks and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/movement-model-audit-20261016-ghZMha/report.json).

[Commands, measurements, pins and scoped preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-army-objective-20261016-VPC7Om/report.json).
