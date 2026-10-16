# Local frontline/healer support pause — 2026-10-15

Status: bounded pauses have live observations; the pursuit/rejoin and isolated
contact-wait successors are locally tested only. Allocation stays off,
escort on, holding/pairing off. No match or promotion is authorized here.

## Evidence and first loss

Replay `6ad13f8874ae43822e65af07`: our player2 (bushdoctor2008 v26), opponent
heiseNberg.0020 v8. Historical enabled build:
`195ad242a0db34be6b279b82d9f65e17acffc3eea6172aa10b986be94aba9697`.
The preceding review established frame-150 elimination (0 versus 13) despite a
560–264 lead. That does not implicate the scout diversion.

Only the already-selected resident `/log/100` and `/replay/100` responses were
read, pinned by the prior trial receipt. Raw SHA-256 values:
`3e5a9cfdc04a5d46c50667860e022e4c036dc1617e34ec51cbf4f2975b669ffc`
and `46bda5de287db71da95c32a46fd94de2b6dcf93699385db5887edf0fecc83014`.
Lengths/hashes/identities were checked before parsing and content-rechecked
afterward. The dataless managed manifest was **not opened or hydrated**. No
managed capture was read; no claim/examined/done update is asserted.

| Pre-action log tick | Recorded observation/action |
| --- | --- |
| 38 | First armed-friendly contact within five of an enemy; all 14 friends alive. Melee pursues a scout and then the retreating armed front. |
| 39–43 | Healer 1 escorts melee 2, following at range three after initial range-two hold. Other healers retain flag fallback. |
| 44 | Melee 4 has 1,270 HP / five ATTACK parts. Escort releases on injury. Healer 1 schedules `rangedHeal` at range three; the resolved marker agrees. |
| 45 | Full-health melee 3 (45,43), eight ATTACK/eight MOVE, advances toward enemy melee 1 (44,41). Nearest functioning healer is four away. Injured melee 4 also advances with nearest healer four away. Healers are catching up or treating melee 2. |
| 47–49 | Melee 3 falls 1,521 → 1,059 HP and eight → three functioning ATTACK parts. No heal command targets it; healers select other eligible injuries under the existing capped-capacity/range policy. Enemy markers show concentrated attacks, not individual damage amounts. |
| 50 → 51 | Melee 3 has 564 HP and no functioning ATTACK at 50. Healer 1 schedules `heal`, healer 3 `rangedHeal` to it, both return 0 with matching markers. It is absent at snapshot 51 / frame 50: the first friendly casualty. Simultaneous combat precludes a guaranteed saved-creep counterfactual. |

The first loss is frontline attrition under concentrated enemy attacks, with
support unavailable for earlier advances and later healing insufficient to
establish survival. This is **not** a demonstrated heal-selector defect. Our
central vulnerability flag also applies the rules' 10% incoming-damage penalty;
neither it nor positioning alone establishes the cause of defeat.

Separately, the sole central defender at 52–53 is melee 2. At 53 it is (46,46),
range three, 833 HP / one functioning ATTACK; its accepted move targets enemy
melee 3. At 54 it is (46,45), range four, **905 HP / two ATTACK**. The allocator's
`no-first-flag-defender` therefore comes from **movement out of range**, not that
defender's death or role loss. No flag-policy change is made.

## One correction

An owned living, zero-fatigue, functioning-MOVE **pure melee** actor pauses a
combat approach when no living owned functioning healer is within range three,
but a full-health, zero-fatigue, functioning-HEAL/MOVE pure healer is within the
existing support radius five (therefore at four or five).

Return `hold` / `await-local-healer`, with no movement call. Preserve enemy
selection and existing one-tick range-six engagement bookkeeping. Re-evaluate
current observations each tick, with at most **two support pauses per continuous
engagement**, recorded as `supportWaitTicks` in the existing per-actor engagement
state. No pair assignment, reservation, path search or extra controller is added.
Normal approach resumes immediately when heal access becomes available, wait
conditions cease, or the two-pause budget is exhausted.

Two is the existing local support gap (five minus ranged-heal range three): a
nominal two-step catch-up opportunity, not a guarantee of healer movement or an
empirically optimal delay. The third eligible observation advances even without
support. Spent budget persists across enemy retargeting, adjacent combat and
temporary support arrival, so these cannot replenish a pause loop. Existing
engagement clearing (no enemy after range-six grace, loss of weapon role, actor
removal, or match reset) resets the budget. Failed movement does not refill it.
This bounds deliberate support holds, not fatigue/pathfinding/congestion stalls
or legitimate `combat-in-range` holds.

Any functioning in-range healer counts as current access even if injured,
fatigued, mixed-role or unable to move. An out-of-range injured, fatigued,
immobile, armed, dead or enemy healer cannot trigger waiting. Original mixed
ATTACK/HEAL or ATTACK/RANGED bodies are excluded even if mixed parts are destroyed.
Adjacent attacks/holds, ranged/healer movement, healing selection, compatible
attacks, scout/escort controllers and flag fallback remain unchanged. Without
local suitable support, retain the old approach instead of inventing a healer,
except for the narrowly scoped pursuit/rejoin follow-up below.

This prevents one **unsupported advance**, not future exposure. A healthy nearby
healer is not guaranteed to approach, find a route, select this creep or arrive.
Holding can delay pressure, leave a unit under fire, or continue while the same
conditions persist for the remaining two-pause allowance. After exhaustion a
unit can advance unsupported: this is the explicit liveness/safety trade-off.
The pause itself does not predict enemy motion. These trade-offs require live
validation; the follow-up below reacts to already observed retreat.

Additional work scans the friendly roster/body parts for an approaching pure
melee actor: O(friends × body parts), bounded by this arena's 14-creep roster.
No extra pathfinding, retries or movement calls; one saturated counter is retained
per existing engagement. This is not a measured Arena CPU bound.

## Regression, compatibility and limits

`tests/fixtures/frontline-support-6ad13f88.json` is a minimal provenance-labelled
tick-45 projection retaining the **original** accepted move. Mock positive HP
values encode functioning-part counts, not reconstructed per-part HP. The new
hold regression failed against the unchanged baseline; no positions/HP advance
and no winning trajectory is invented.

Before the original edit, independent fixed-snapshot reconstruction matched all
**205** recorded commands and **53** tactical markers at ticks 38–51. The initial
unbounded candidate audit
suppresses exactly four moves: melee 4 at 42, melee 3 and 4 at 45, melee 4 at 48.
Every other command is compared exactly, including healing/combat selection.
Historical baseline results are retained separately, not regenerated.
Those four suppressed moves describe the initial candidate, not a new oracle for
the bounded successor; repeated waits may now exhaust the allowance.

Four ordinary synthetic compatibility tests explicitly reconcile unsupported
melee move expectations to holds. Healer targets/returns, escort transitions,
tactical calls and immutability remain checked. Frozen historical healing
fixtures and their 128 movement decisions, 83 moves and 38 attack calls still
pass unchanged. Focused checks cover support limits, mixed roles, unavailable
support, adjacency, one movement per actor, expiry, reset and unchanged tactics.

The local MIT TypeScript `skirmish-main` heal-intent implementation distinguishes
intent, markers and accumulated effects but is a different engine, not proof of
Arena resolution. The TypeScript `apex-v3` example is a classic Screeps port
using Room/Memory/CommonJS, unsuitable as an Arena controller. No code or
dependencies were copied; the correction is original plain JavaScript.

Analysis, baseline bytes/calibration, command logs and preservation checks:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-coordination-20261015-gryUCT/`.
An initial inspection exited successfully but its stdout exceeded the tool's
display limit. The same two pinned responses were reread within fixed bounds,
retaining only relevant frame fields. No unrelated payloads were read.

Initial unbounded candidate disabled-allocation build (superseded):
`a38c2f0bd0d8bca27d45854ac8c90ad57e8e60644874e13136ac440f1d6a7dcf`.
This is not the replay build or an upload/deployment attestation.

### Bounded-wait follow-up

`frontline-support-multitick.test.js` runs production movement, escort selection
with its one assignment already consumed, and tactics on generated successive
observations. Queued moves resolve together by one Chebyshev step on an empty
grid. A healthy healer stays at the flag or moves to another flag destination;
the healthy melee and healer cannot create a permanent support-pause loop. This
is a toy movement resolver, not Arena routing, combat damage or an alternate replay.
The stationary baseline repeats the same hold indefinitely; both generated
traces show repeated holds and the regression fails before correction. With the
counter, melee pauses twice, advances on the third observation, and still attacks
an adjacent enemy.
A healer actually arriving at range three releases on observation two, without
waiting for exhaustion. Further checks cover target/support changes, expiry and
real `runTick` match reset. No new replay reads or live match were used.

Before/after tests, scoped before-copies, final diff and preservation receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/melee-wait-bound-20261015-ubNuw2/`.

Bounded successor disabled-allocation build:
`ee23f7bf96f708816e038a5a49502a9316c9c6cd91ea3cf7fc2628aee1012f1b`.

### Unsupported ranged pursuit / bounded rejoin follow-up

Retained review of replay `6ad147cb74ae4345be65af30` against Glaucous v5,
using the bounded-wait build above, exercised both pause releases: support
arrival and exhaustion. It also recorded melee 4 pursuing enemy ranged 3 without
an attack attempt during ticks 42–49. These are pre-action positions and
functioning ATTACK counts, not a reconstruction of simultaneous damage:

| Tick | Melee 4 position / ATTACK | Enemy position | Nearest heal range | Movement evidence |
| --- | --- | --- | --- | --- |
| 42 | (44,52) / 8 | (45,55) | 3 | `moveTo` returned 0; next position (45,53) |
| 43 | (45,53) / 8 | (44,56) | 3 | returned 0; next (44,54) |
| 44 | (44,54) / 7 | (44,56) | 3 | returned 0; next (43,55) |
| 45 | (43,55) / 5 | (43,57) | 4 | second cumulative support pause; unchanged next position |
| 46 | (43,55) / 4 | (42,58) | 5 | exhausted budget, returned 0; next (42,56) |
| 47 | (42,56) / 2 | (42,58) | 6 | returned 0; next (41,57) |
| 48 | (41,57) / 1 | (41,59) | 7 | returned 0; next (40,58) |
| 49 | (40,58) / 0 | (42,60) | 8 | weaponless flag fallback, returned 0; next (41,57) |

Tick 48 exposes an observed non-closing interval: melee moved closer to the
enemy's previous position, the enemy moved farther from melee's previous
position, but their current separation did not shrink. This does not prove the
move return caused displacement, identify individual damage, or establish that
a retreat would save melee 4. Melee 2's earlier death (absent log tick 46 / frame
45) and central-flag loss at frame 56 remain **separate findings**, not fixes
claimed by this policy.

The new entry condition requires all of:

- Living owned pure melee with functioning ATTACK/MOVE, zero fatigue and a flag
  fallback; the existing two support pauses are already spent.
- A non-adjacent selected enemy with functioning RANGED_ATTACK but no functioning
  ATTACK, no living owned functioning healer within range three, and no previous
  rejoin attempt in this continuous engagement.
- Consecutive eligible observations of the same target showing the three
  non-closing/retreat conditions above. A blocked actor, a productive closing
  step, current heal access or merely an accepted move command is insufficient.
- An available living owned functioning pure healer. Choose nearest with the
  existing deterministic ID tie-break, then pin its identity for this attempt.

Move toward that healer's current position (`melee-rejoin-support`) for at most
**five active observations**, including any adjacent-combat holds. Seven tiles
was the recorded separation at entry: four nominal steps to range three plus
one spare observation. This is a finite opportunity, not a routing/safety or
optimal-time guarantee. Do not extend it for fatigue, congestion or failed moves.
Finish on range-three arrival, support loss, or the observation after those five
opportunities, then use the existing flag fallback. Adjacent combat always holds
and attacks normally, **including arrival/loss/timeout boundaries**.

The abandoned target remains latched for the rest of continuous contact: do not
immediately chase it again when support arrives. Other selected enemies retain
ordinary movement and adjacent attacks remain available. There is at most one
rejoin attempt per continuous engagement, not a patrol or retry loop. An active
return can finish its five-observation allowance even when the abandoned enemy
moves beyond normal engagement range. Its disappearance ends the return and
normal enemy selection resumes. After the return, full disengagement under
existing range/grace rules clears engagement state, as do actor removal or match
reset; loss of pure-melee eligibility or flag cancels the rejoin. Neither target
changes nor support arrival refill the two-pause budget.

This trades ranged-target pressure for a bounded return toward available support.
The anchor can move away, be injured or choose another heal target; reaching heal
range does not guarantee healing. There is no new threat-safe route or guarantee
against exposure at the flag, and a newly selected different enemy can still be
approached. Ranged/healer movement, attacks/heals, scout/escort and switches are
unchanged. Added work is bounded roster/body scans and constant state per actor;
there is no extra route search or second movement command. Live CPU cost remains
unmeasured.

`tests/unit/melee-rejoin.test.js` uses generated successive ticks and production
movement/tactics with simultaneous empty-grid one-step mock displacement. Before
correction, four of five checks failed and the actor chased for all later ticks;
afterward the trajectory pursues → rejoins → reaches heal range → uses fallback
without re-chasing, while still attacking an adjacent enemy. These controlled
positions are **not an alternate replay or survival prediction**. Checks also
cover blocked timeout, pinned/tied anchors, support loss, role/flag cancellation,
pruning, productive/supported approaches and completion-boundary attacks. All
97 focused movement/tactical/tick checks pass, including existing healing,
escort, allocator and two-pause compatibility. No raw replay/cache or managed
manifest was read for this follow-up; only retained review records were used.

Evidence, before/after results, timeline, scoped preservation and final review:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/melee-rejoin-20261015-OeiaIp/`.

Historical disabled-allocation pursuit/rejoin candidate build:
`a83ba9df092ad9dffc52052717ffa6645ee7e8d02c193823baaf1b7ba92743f3`.

### Isolated contact under ranged fire — 2026-10-16

Replay `6ad14cc074ae432a5565af4f`, temik911 v191, emitted the pursuit/rejoin
build above. The review observed **no** support pauses or rejoin/latch decisions;
all 16 pure-melee approaches had functioning healing within three. Those branches
remain unexercised in this match. This is not proof that nominal heal access is
sufficient: the first casualty was melee 1 at frame 52 / absent log tick 53.

At pre-action tick 48, healthy melee 1 (45,49) selected enemy melee 3 (43,47),
with eight functioning ATTACK parts at range two. Enemy ranged 4 was already
within three. None of the other eight friendly weapon-bearing creeps could hit
that selected target from their current positions (nearest were at range four).
Only healer 1, at (47,50), could heal melee 1: six HEAL at range two means **24**
nominal HP, not 72. The accepted approach was followed by (44,48). Evaluating
that observed next position against **unmoved tick-48 enemies** raises nominal
potential exposure from 66 to 462 after our central flag's x1.1 damage modifier.
This is a geometric comparison, not a prediction of pathfinding or enemy orders.

The actual enemy motion also produced concentrated fire. Healer 1 stayed at
(46,49) during ticks 49–52; it did not skip an available healing command:

| Log tick | Melee 1 HP / ATTACK | Enemy markers aimed at its pre-action position | Nominal marked damage with x1.1 | Issued nominal healing | Next observed HP |
| --- | --- | --- | --- | --- | --- |
| 48 | 1600 / 8 | ranged 4 | 66 | 0 (healthy pre-action) | 1534 |
| 49 | 1534 / 8 | melee 4 + ranged 3 | 330 | 24, `rangedHeal` | 1228 |
| 50 | 1228 / 5 | melee 3 + melee 4 + ranged 3 | 495 | 24, `rangedHeal` | 757 |
| 51 | 757 / 0 | melee 3 + melee 4 + ranged 3 | 462 | 24, `rangedHeal` | 319 |
| 52 | 319 / 0 | melee 2 + melee 3 + melee 4 + ranged 3 | 693 | 72, `heal` | absent |

All four healing calls returned 0 with matching frame markers. Nominal
marker damage minus issued nominal healing exactly matches the four observed
surviving HP deltas, but markers contain no per-hit amounts: this consistency
does not isolate simultaneous body damage/repair or individual damage causation.
Positional upper capacity is separately retained and exceeds marked fire at
several ticks; do not assume every in-range enemy fired at melee 1. Healers 2/3
were six–seven tiles away at 49–50 and five away at 52, supporting the other
front. Advancing healer 1 into adjacency alone would raise nominal healing to
72, still below marked pressure, and could put it into enemy melee reach.

One narrow correction therefore addresses the **earlier isolated contact step**,
not HP decline, healer/attack selection, all combat exposure or weaponless fallback.
Before approaching, a living owned, zero-fatigue, functioning-MOVE pure melee
may return `await-close-combat-support` only when:

- The selected enemy has functioning ATTACK and is exactly two away; a distinct
  living enemy with functioning RANGED_ATTACK is already within three.
- No other living owned unit without functioning HEAL has a functioning weapon
  in range of that selected target (ATTACK one, RANGED_ATTACK three). This is
  potential cover, not a guarantee of that ally's selected attack.
- No functioning owned healer is adjacent, but a healthy, zero-fatigue, mobile
  pure healer is at range two–three. Injured, immobile or fatigued adjacent HEAL
  still counts as direct access; an unavailable distant healer cannot create a wait.

Reuse the **same** `supportWaitTicks` allowance: at most two combined local-healer
and contact waits per continuous engagement, not two extra waits. The maximum
range-three to direct-heal range-one gap is two nominal steps. Release as soon
as direct heal access or potential combat cover exists, geometry/eligibility
ceases, or the shared budget is spent. Existing retarget/reset rules and all
rejoin thresholds remain. Adjacent attacks are never delayed. No path search,
new controller, counter, pair assignment or damage estimator is added.

Generated multi-tick checks reproduce the unsupported advance before correction,
then wait → cover/adjacent-heal availability → advance → adjacent attack. With
stationary support, exhaustion still releases; lost cover cannot refill the
budget. These use a labelled empty-grid one-step mock, not an alternate match
or predicted survivor. The five-tick original-observation audit changes only
melee 1's tick-48 movement among 20 melee decisions; original snapshots and
baseline results remain separate. Holds may still take ranged damage, lose
pressure or exhaust without better support. Current support could choose another
target, and enemy movement can invalidate any apparent safety advantage.
The nine new checks and affected movement, healing, escort and tick suites pass
91 checks, including unchanged historical healing expectations. An initial added
mixed-role boundary fixture accidentally supplied adjacent HEAL (legitimate direct
access); its expectation failed, the fixture was corrected to the intended
non-adjacent position, and both the failure and final passing run are retained.

Evidence, regression failures, tests and scoped preservation:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/frontline-capacity-diagnosis-20261016-KTpZHv/`.
No original cache response or managed manifest was opened for this follow-up;
only hash-pinned retained review data was used. Examples in `apex-v3` and
`skirmish-main` were inspected for separation of movement, healing and effects;
they are different engines/APIs, not authoritative Arena resolution or copied code.

Current disabled-allocation candidate build:
`4896ef3596bcca45755413fa8d090a7518bb1ece2ed8d416ea17461109e89215`.

## Future live-validation criterion

After separate authorization, require a build-identified opening with an
`await-local-healer` hold, actual support arrival and resumed movement. Measure
frontline heal-range access before first casualty, useful attacks/heals,
casualties, flag retention and sampled CPU. Explicitly record prolonged waiting
or lost pressure when a healer does not approach. A hold alone is not successful
coordination. Random opponents and one match cannot establish survival/win-rate
benefit; no automatic launch, promotion or threshold adjustment follows.
For the new candidate, separately require a build-identified non-closing ranged
pursuit after budget exhaustion, a `melee-rejoin-support` command and observed
displacement toward the pinned healer, then arrival/loss/timeout and no immediate
same-target re-chase. Record attacks/heals, exposure, flag retention and sampled
CPU; distinguish intents from displacement. No new live trial is authorized here.
For isolated-contact waiting, observe the exact entry geometry, shared pause
count, release reason and subsequent displacement/attacks. Record whether support
actually engages/heals rather than merely being in range, plus exposure and lost
pressure. No prevented casualty or gameplay benefit follows from the offline test.
