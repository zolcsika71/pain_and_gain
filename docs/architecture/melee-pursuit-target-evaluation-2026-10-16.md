# Melee 3 pursuit-target experiment — 2026-10-16

Decision: **reject integration of the equal-range shared-target candidate**.
There is a concrete shared-weapon opportunity, but no demonstrated better-supported
movement trajectory. Runtime remains unchanged at
`c14daba6f8c054218bbe32d3c3f890fdb3fa467b4615a91ec9fdf3af3924b07f`;
allocation off, escort on, holding/pairing off. No match or follow-on task is
authorized by this result.

## Scope and existing protections

This follows the [objective-priority audit](opening-objective-priority-audit-2026-10-16.md),
not a repeat of it. Replay `6ad152e374ae4378a665afb2`, Golden Eagle v19,
emitted historical build
`4896ef3596bcca45755413fa8d090a7518bb1ece2ed8d416ea17461109e89215`.
Current movement/healing/escort are unchanged from that build; current guarded
ranged spillover is a later combat/executor/loop change. We do not reconstruct
an alternate current-build match.

The existing selector picks the nearest living enemy within Chebyshev range
five, then ID; it preserves a previous enemy for one range-six observation only
when none is within five. Movement holds in attack range. Local support/contact
pauses share two observations across retargeting; the separate pursuit/rejoin
policy requires spent pauses, absent healing access and observed non-closing
ranged pursuit. It pins a healer for at most five rejoin observations and latches
the abandoned target. Escort has executor priority. None of these budgets or
protections changes here.

Only retained projections were read, with residency and hash verification:

- [Prior audit receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/objective-priority-audit-20261016-MXjhTL/report.json)
- Retained contact `cache-review.json`, SHA-256
  `d23b787672a187449a519900e2bfcd429b25bb898d98d29551c9ba2d8b8bee26`.
- [Full eligible-target/contact-cell comparison](/Users/zoltanka/.local/share/pain-and-gain-evidence/melee-target-support-evaluation-20261016-HbPuB1/analysis.json)

Reconstruction is limited to pre-action ticks 36–40. A tick-N snapshot aligns
with resolved frame N−1. Adjacent cells are geometry, not pathfinding results:
terrain, congestion, opponent responses and simultaneous damage are not simulated.
The fixture preserves positions/functioning counts; positive per-part HP is a
synthetic reconstruction, not original body-part HP.

## Eligible alternatives

M3 is ours; enemy R/M mean ranged/melee suffix IDs. Shared weapons exclude M3
and functioning healers; they count potential ATTACK-at-one/RANGED_ATTACK-at-three
access, **not accepted attacks on that target**. Ranged single-target power has
no range falloff through three. Healing access is nominal and competes with
healing selected for other allies.

| Tick / M3 position | Default and acquisition alternatives | Support and exposure comparison |
| --- | --- | --- |
| 36 / (53,51) | R3, R4, R5 all range five; ID chooses R3. | None has shared weapon access. Closest unoccupied contact cells require at least four geometric steps and have no current healing access. No better-supported eligible target. |
| 37 / (52,50) | R3, R4, R5 all range three. | All have the same two friendly ranged weapons in reach. Closest contact cells offer 24 nominal healing and three enemy attack envelopes. Current M3 access is 96 (H3 adjacent 72 + H1 ranged 24), not enough to assert sustainable healing. No strict target advantage. |
| 38 / (52,49) | R3/R5 range two, R4 three, R2 five. | R3/R4/R5 each have two shared weapons; default R3 is already covered. R2 has none. Closest contact cells for the tied targets offer 24 healing/three envelopes. No support gain. |
| 39 / (51,48) | Default R3 (50,46), range two, no shared weapon. R4 (49,47) also range two, with friendly R4/R5 in reach. R5 range two but no shared weapon; R2 three with none. Enemy M2 at four and M3/M4 at five each have three shared weapons. | R4 is a concrete equal-range alternative. Unoccupied (50,47) contacts both R3 and R4; (50,48) contacts R4. Both cells offer only H3 ranged healing (24) and four enemy ranged envelopes. More distant melee targets require three/four geometric steps to nearest free contact cells and can add armed melee exposure; shared coverage alone does not make them preferable. |
| 40 / (50,47) | R3 adjacent; M2/R2/R4/R5 at two; M1/M3 three; scouts/M4 four; H1 five. | Preserve adjacent attack/hold, even though M2 has three shared weapons and cells with up to 48 healing. Switching would abandon a productive adjacent attack and can enter additional melee exposure (five envelopes near M2). |

At tick 39, friendly R4/R5 actually issued accepted ranged attacks on **enemy M2**,
not the alternative R4. Friendly R3 attacked enemy M4. H3 healed friendly R4,
not M3. Therefore the candidate's two shared weapons are access only; unchanged
attack/healing selection would not coordinate them onto the alternative.

The recorded tick-39 move toward R3 was accepted and followed by M3 at (50,47),
where it attacked at tick 40 with 1,420 HP and seven functioning ATTACK parts.
These observations cannot establish that another target would avoid damage or
that an Arena route toward R4 would choose a different cell.

## One minimal test-only candidate

[`melee-shared-target-candidate.js`](../../tests/fixtures/melee-shared-target-candidate.js)
first obtains the production movement plan. It changes only a pure melee
`combat-approach` toward a pure ranged opponent, with existing healing within
three and no active/prior pursuit or rejoin bookkeeping. If the default has no
shared weapon access, choose a living pure ranged alternative at **exactly the
same range, at most five**, with shared access; rank by shared count then ID.
Roster/body bounds remain 14/50; there is no path search.

All holds, pauses, mixed roles, escort, adjacency, rejoin/latch and normal fallback
retain priority. The returned engagement changes target identity but preserves
spent waits. Support loss, loss of eligibility or absence of a tied alternative
returns to the ordinary plan; no extra wait, reservation or timer is added.
The candidate deliberately has no new target latch. That limitation is tested,
not concealed by inventing another policy layer.

## Generated successive decisions and recommendation

[`melee-shared-target-experiment.test.js`](../../tests/unit/melee-shared-target-experiment.test.js)
compares the retained observations and generated successive positions:

- Fixed observations 36–40 change only tick 39, R3 → R4. At 40, the adjacent
  R3 hold/attack remains. These are not evolving alternate replay snapshots.
- A separate tick-39-seeded four-observation rollout freezes enemies/support
  and takes one direct Chebyshev step, rejecting occupied destinations. Every
  unit stays on a distinct cell. Both policies move (51,48) → (50,47), then hold
  adjacent R3. Initial target differs, displacement/contact timing does not.
- With a newly generated blocker at (50,47), both remain at (51,48) for all four
  observations. No command implies progress through blockage; Arena may choose
  a different route. No extra movement command or path-search budget is used.
- Equal stable observations give stable choices, but alternating shared weapon
  availability produces B → A → B → A. The spent pause count remains two.
  Thus this candidate fails the non-oscillation requirement for integration.

Measured in those generated traces: zero change to first-step timing, melee
contact timing or flag range; no reduction of fixed-enemy exposure or improved
healing access. No capture is simulated and no scoring difference is assigned.
A different unverified route might transfer exposure rather than reduce it.
Blocking has no physical-progress guarantee under either policy; no new waiting
layer causes or solves that limitation.

**Reject integration.** Better potential target overlap is real at tick 39, but
it is not actual coordinated attacks, stronger healing, lower exposure or a
demonstrated better pursuit. Target flicker adds instability. No latch, healer
rewrite, broader target ranking or runtime promotion is added to rescue it.
No prevented casualty, alternative kill or gameplay benefit is claimed.

Node 24.19.0: 29/29 focused checks passed (six new experiment checks, 23 existing
movement/rejoin checks):

```sh
node --max-old-space-size=256 --test --test-reporter=tap \
  tests/unit/melee-shared-target-experiment.test.js \
  tests/unit/movement.test.js tests/unit/melee-rejoin.test.js
```

Checks cover frozen comparisons, stable choices, support loss, acquisition
fallback, unchanged adjacent attacks/tactics/escort, spent waits and rejoin,
distinct occupancy/blockage, and explicit rejection evidence from flicker.
Runtime/switches/index and unrelated files remain unchanged. Only test-side
candidate, retained window, experiment checks and this document are added.
