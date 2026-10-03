# One squad leader–follower experiment

Status: disabled deployment candidate; one enabled live screen supports opening
following and lifetime release, not strategic benefit or promotion.
The `squadPairExperiment` switch in `src/config.js` is false. Allocation and
scout holding remain off; healer escort remains on. This adapts only the pair
concept in [the reference](screeps-squads-and-pairing.md) to the documented Arena
`findPathTo` and `moveTo` APIs. No World memory, room, or formation APIs are used.

## Selection and precedence

`src/squads/pair.js` consumes the existing membership state without changing it.
At its first initialized observation, it selects at most one healthy pair:
ascending squad ID, then melee before ranged leader, then ascending member ID;
the follower is that squad's pure healer. Members must participate and have
functioning MOVE and their original role's action part. Uninitialized membership
stays inactive with its recorded reason; no eligible pair ends the attempt with
`no-eligible-squad-pair`. Partner IDs remain fixed. Tick restart resets pair state
alongside membership, escort, allocation, and engagements.

The pair coordinates only when **both** ordinary movement plans select the
existing first-flag fallback. An active escort involving either partner takes
priority, followed by explicit objective overrides (including null), combat
movement/holds and injured-ally support. Any such conflict releases the entire
pair before commands; the ordinary policy executes that same tick. An unrelated
escort continues independently. The pair never changes the selected global flag,
targeting, healing selection, or attack/heal compatibility.

Waiting is allowed only while both partners are healthy, present, capable,
within five tiles of each other, and neither has a living enemy within five.
Partner death, absence, membership participation loss, capability loss, injury,
unsafe proximity, excessive separation, reaching the objective, or losing the
ordinary fallback ends the attempt. Release is permanent for that match, even
if eligibility later returns. This intentionally conservative opening-movement
scope avoids repeated partner selection and contention with combat policies.

## Joint movement and bounded fallback

- Adjacent, unfatigued members: request the leader's next path step toward the
  existing flag. Require an adjacent in-bounds tile unoccupied in the current
  snapshot. The follower plans a step into the leader's old position.
- Separated members: the leader holds while the follower requests a step toward
  it. The leader is ignored only as a pathfinding obstacle at the goal; the
  chosen immediate step must still be empty. The follower cannot enter the
  waiting leader's tile.
- Fatigue on either member, an empty path, or an invalid/occupied step holds
  both under the same safety conditions. No swaps, pushing, reservation of
  other creeps' future destinations, or alternate formation search is attempted.
- Planning requests at most one obstacle-aware `findPathTo` per tick, with
  `maxOps: 1000`. A returned first step is a bounded local attempt, not proof of
  a complete route or eventual progress. Terrain/structures are handled by the
  documented default pathfinder; observed creeps are checked again explicitly.
- The executor issues the leader first. Only its numeric `OK` permits the
  follower command into the vacating position, using `ignore: [leader]`.
  Rejection or an unknown return produces `pair-leader-command-rejected` and no
  follower attempt. Each actor still receives at most one movement attempt.
  Engine contention may prevent a scheduled move; acceptance is not displacement.
- Three consecutive failed-progress observations release before the fourth
  coordination tick. Regrouping progress requires reduced separation; adjacent
  progress requires both positions to change on consecutive ticks. Gaps do not
  establish progress. Fatigue, blockage, and accepted commands without movement
  share this limit. Progress resets the counter, but a hard 24-tick lifetime
  prevents indefinite recovery/oscillation. Release resumes ordinary movement,
  including its existing handling of fatigue or missing MOVE; it adds no second
  pair command.

Movement planning and execution are separate. `executeTactics` always runs
after movement using actual observed positions, including on pair waits. Safety
gates ordinarily hand control back before a nearby combat/healing opportunity;
the pair does not suppress either tactical channel.

## Evidence and validation limits

Existing action decisions carry optional `pair` context for the two partners:
squad/partner IDs, leader role, active/released status, reason, start tick,
stalled count, and objective ID. An inactive selection reports context on one
owned actor. Release context is emitted on its transition tick only. Existing
actor/tick/build identity, target coordinates, decision/attempt correlation,
numeric return codes, and version-2 diagnostic closures are unchanged. No new
record type is introduced; the importer retains optional context and validates
the existing action envelope. The generic analyzer does not independently
validate this new policy. Live screening must inspect the pair context and
compatible consecutive snapshots explicitly.

The enabled fixture covers selection, stable membership, advance/regroup,
fatigue, blocked/occupied steps, partner/capability loss, permanent release,
priority handoffs, match reset, tactical continuity, single movement attempts,
and diagnostic closure. Paths and engine responses are mocked: these are
decision/command tests, not simulated future movement. Historical captures
were not reopened or reanalyzed for implementation. Known costs are one bounded
planning path search and two extended existing movement records per active tick;
the subsequent screen below adds observed opening displacement and CPU samples,
not a causal overhead comparison or congestion-robustness validation.

Original local validation on 2026-10-02: **59/59 focused tests** and **211/211 full-suite
tests** passed; `npm run check` verified the generated build and syntax, and
whitespace checks passed. The compact fixture adds **344 JSON bytes** across
two existing movement records, with zero additional records; actual ID lengths
affect volume. This fixture does not measure live CPU. The disabled deployment build
is `fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.

Separate commit-candidate review on 2026-10-03 used HEAD `9714fe59` (including
the committed importer fix) plus only the staged pairing changes. An isolated
copy passed **59/59 focused tests**, **213/213 full-suite tests**, and
`npm run check`, with the same disabled build ID. Staged whitespace and
documentation links were checked separately. Runtime and tests were unchanged
by review; documentation was refreshed to distinguish historical and recovered
coverage. No replay analysis, recovery, promotion or additional match followed.

Reproduce focused checks with:

```sh
node --test tests/unit/squad-pair*.test.js tests/unit/membership.test.js tests/unit/movement.test.js tests/unit/*flow.test.js tests/unit/replay-evidence.test.js
npm test
npm run check
git diff --check
```

A separate pairing-enabled worktree was subsequently prepared with build
`5ed39cf263f61ad9273d4ae8d63c3d0dec913c962449565e408408abf2bbfc3d`.
Its local `docs/architecture/squad-pair-screening-2026-10-02.md` predefined
pass/fail/unknown/unexercised checks for advance, recovery, priority handoff,
bounded release, commands, following positions and CPU samples. The detailed
results below preserve captured build identity and compatible consecutive
positions separately from command acceptance. One enabled match supports only
opening following and lifetime release; absent opportunities remain unexercised.
The trial stays separate and retained, deployment pairing remains disabled,
and no automatic retry or strategy promotion is justified. Manual action: **NONE**.

## Reported pairing screen — captured disabled build

On 2026-10-02 the user reported a completed match against けろぴー v22 after
correcting Arena's selected source directory. Exact cached game metadata
identifies replay `6abfde79d1c8567df27fd551` against **けろびー v22** (cached
spelling), with bushdoctor2008 v22 in player slot 0. The metadata request key is
`1/0/https://arena.screeps.com/api/game/6abfde79d1c8567df27fd551`, cache file
`229a397b4f3391d2_0`, response SHA-256
`442b511ce4528e9f775be97b1ab51ce400fc9b837f3f1fcd9405c2038b910a66`.
It records creation at `2026-10-02T16:40:25.832Z`, finished status, winner 0,
and 1,279 ticks. These metadata facts do not establish final score or pairing.

The existing watcher automatically imported 13 log responses. All carry the
**disabled candidate build**
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`,
not the expected enabled trial build
`5ed39cf263f61ad9273d4ae8d63c3d0dec913c962449565e408408abf2bbfc3d`.
Their importer metadata covers ticks 1–1,278 with 1,278 complete closures and
no reported per-response gaps, conflicts, or correlation issues. Terminal
runtime tick 1,279 is absent. The linked map is
`223dbc190aee5dd8c35a48d48aa0b944b6e12f2e20bf0299e968c7e1b9ba857b`,
file `pain_and_gain_map_2026-10-02T16-42-09-305Z.json`.

The bounded body review selected only the first response, fingerprint
`f10f8696435e3aea2527380e34f1e87296f97aaca97f82b22f020ae27062b80f`,
requested at `/log/100`, JSONL `6abfde79d1c8567df27fd551.jsonl`. Reproduce its
existing compact validation with:

```sh
node tools/replay-analysis.js 6abfde79d1c8567df27fd551 f10f8696435e3aea2527380e34f1e87296f97aaca97f82b22f020ae27062b80f
```

The analyzer trusts this response, revalidates the map and source hashes, and
reconstructs 100 snapshots and 100 complete diagnostic ticks. Raw snapshot and
diagnostic tags agree with the disabled build. The tick-1 membership baseline
is at console key `1:1`. In ticks 1–26 there are **zero pair contexts and zero
pair movement reasons**, 364 ordinary movement decisions and 364 correlated
movement attempts, all returning 0, with no duplicate actor/tick movement
attempt. These are disabled-policy observations, not enabled pair passes.

The same bounded window has one first-tick CPU sample: 14,520,841 ns of
1,000,000,000 ns (key `1:60`). Of 25 ordinary samples, the peak is 7,367,976 ns
of 100,000,000 ns at tick 2 (key `2:58`), leaving 92,632,024 ns sampled headroom.
None crosses the predefined 90% warning threshold. These measurements describe
the disabled build only and exclude subsequent logging; enabled pairing cost
and final headroom remain unverified.

**Screen disposition: build-provenance gate failed; enabled pairing remains
unexercised.** No pair leader/follower was controlled by the experiment, so
leader vacating/follower arrival, separation waits, congestion recovery,
bounded release, priority handoffs, and rejected pair commands cannot be
evaluated here. This is neither a functional pass nor a demonstrated pairing
defect. Why the client executed the previously uploaded source remains unknown;
both this match and accidental replay `6abfdb69d1c856c9d27fd538` reference own
code version 22 / code ID `6abfdb31d1c85683a97fd531` in exact metadata. The
earlier accidental replay is against MBFishhh v14 and stays separate.

The first-log record was claimed/examined under
`codex/pair-screen-kerobee-20261002`; completion remains unset. Other imported
responses were not body-reviewed or completed. Captures and previous reviews
remain retained. The owned watcher was stopped after capture; no gameplay,
source/configuration edit, build regeneration, tests, commit, or push followed.
Both prepared trials remain retained. The enabled trial still passes its build
check, but local readiness does not prove execution. Reopening this same replay
cannot change its captured runtime build, and no retry is requested. Before
any future screen, resolve client source/upload identity; no strategy decision
follows from this mismatch. Restore Arena to the main `src/` manually; restoration
is unconfirmed. Manual action: **NONE**.

## Fresh one-game screen — temik911 v208

On 2026-10-02 the user completed one newly dispatched Fame game and opened and
played its replay. Exact metadata request
`1/0/https://arena.screeps.com/api/game/6abff2962ea5a31135f73f90`, cache file
`c5035d5a027b6577_0`, identifies **temik911 v208** and our **v23** upload
`6abff28c2ea5a3241ff73f8e`. Creation time is `2026-10-02T18:06:14.551Z`;
metadata lists 1,699 ticks. Own runtime actors have the `pg_player2_` prefix.
This match is distinct from the earlier disabled-build screens. Its captured
build matches the prepared trial in full:
`5ed39cf263f61ad9273d4ae8d63c3d0dec913c962449565e408408abf2bbfc3d`
(pairing on, allocation off, holding off, escort on). This verifies execution
for this match, not the cause of the earlier source mismatch.

At the original screening review, the watcher automatically imported **14 responses**, runtime ticks
**1–1,400**, with **1,400 complete diagnostic closures** and no reported gaps,
conflicts, or decision/attempt correlation issues in those responses. All share
the expected build and linked map
`c1996e5b397f8eb4006d39826b6e16e76d8c7e580d67c5a3d2200a160fd91818`,
file `pain_and_gain_map_2026-10-02T18-07-51-197Z.json`. The watcher reported
`Invalid string length` for cache responses `/log/1500`, `/log/1600`, and
`/log/1699` (files `169a5ef159ea02c4_0`, `678d3cfb58088004_0`, and
`0178b1f7a1e59dbf_0`). At that time they remained in the source cache without managed
imports. Ticks after 1,400 were therefore unavailable to that managed review;
do not call the entire replay captured or infer a terminal runtime observation.
No importer fix or replay reopening was attempted in the opening review: these late responses are
unnecessary for the predefined opening screen. The failure's cause was not
diagnosed here.

Subsequent targeted recovery on 2026-10-03 imported those three exact responses
after the compact-manifest fix. The retained replay now has **17 responses,
1,698 consecutive snapshots and 1,698 complete diagnostic closures**, matching
the same full trial build and linked map. Runtime tick 1,699 remains absent;
neither truncation nor zero events is inferred. Exact recovered fingerprints,
backup, preservation checks and capacity limits are recorded in the
[importer recovery record](replay-import-performance-2026-10-02.md).
This extended retention did not repeat the opening analysis, broaden its
ticks-1–26 verdict, or verify later pair permanence or strategic benefit.

Bounded body review selected only `/log/100`, fingerprint
`96992c30e2d1aee352f7beba33eed4196ff9b973218e1ded938be61478c4ff74`,
JSONL `6abff2962ea5a31135f73f90.jsonl`. Reproduce compact validation with:

```sh
node tools/replay-analysis.js 6abff2962ea5a31135f73f90 96992c30e2d1aee352f7beba33eed4196ff9b973218e1ded938be61478c4ff74
```

The analyzer revalidated the selected map, source/output hashes, raw build
tags, 100 snapshots, and 100 complete diagnostic ticks: **15,770 pass, 0 fail,
42 unknown**. The unknowns are 28 health-delta and 14 displacement checks at
the selection boundary (tick 100 has no following snapshot in this selection).
They do not affect opening ticks 1–26. These are generic evidence checks, not
an independent pair-policy validator. Its `tagged-unmatched` label is relative
to main's disabled local build; the captured tag matches the separate trial.

| Criterion | Supported observation and scope |
| --- | --- |
| Selection/stability | Pass: tick-1 membership baseline (`1:1`) supports squad A, combat leader `pg_player2_melee_2`, healer follower `pg_player2_healer_1`. Both are healthy, unfatigued and capable; these fixed IDs appear in all active pair decisions. |
| Commands | Pass for ticks 1–24: 48 correlated pair movement attempts, all returning numeric 0; leader attempt precedes follower each tick. Leader destinations are empty in the pre-action snapshot; follower destinations equal the leader's old position. No other logged movement target equals the leader's immediate destination. This is command acceptance, not displacement. |
| Actual following | Pass for all 24 consecutive transitions, ticks 1→2 through 24→25: leader reaches its intended step and follower reaches the leader's old tile. Tick 1: leader `(88,87)` → `(87,86)`; follower `(89,87)` → `(88,87)`. Decisions/attempts: `1:4`/`1:5` and `1:26`/`1:27`; JSONL lines 1–2 independently show positions. Last pair step: tick 24 leader `(65,64)` → `(64,63)`, follower `(66,65)` → `(65,64)` at tick 25. |
| Lifetime release | Pass: tick 25 records `released` / `lifetime-limit`, start tick 1, stalled count 0 (`25:8`, `25:24`). Both resume ordinary `flag-fallback` that tick with one accepted attempt each. Tick 26 positions are leader `(63,62)` and follower `(64,64)`. No further pair context occurs in covered ticks 26–100; permanence beyond this bounded body selection is not independently checked. |
| Duplicate/rejected commands | No duplicate actor/tick movement attempt or rejected movement command in ticks 1–26: 364 ordinary-plus-pair attempts, all 0. The rejected-leader suppression branch remains unexercised. |
| Recovery/priority/tactics | Separation waits, fatigue, blocked/congested progress, three-stall recovery release, partner loss, and override/escort/combat/injury handoffs are unexercised. Partners remain adjacent with stalled count 0 throughout active pairing; no living enemy is within five tiles. Each partner still has healing and combat decisions on every active tick (96 decisions, all `no-action`). Actual combat/healing while waiting is unexercised, not a live pass. |
| CPU | Opening samples pass the predefined budget screen: first tick `1:60` is 14,292,025 ns / 1,000,000,000 ns. Active ordinary peak `12:58` is 7,110,136 ns / 100,000,000 ns (7.110136%, headroom 92,889,864 ns). Post-release ticks 25–26 peak is 6,185,042 ns at `26:58`. No evaluated sample reaches 90%. These samples exclude subsequent logging and are not a causal pairing-overhead comparison. |

**Decision:** supported functional pass for this match's opening following and
lifetime release, with the other opportunities explicitly unexercised. Twenty-four
ticks are one match, not 24 independent trials. Sustained combat teamwork,
congestion robustness, strategic benefit, and promotion remain unverified.
No gameplay change or automatic retry follows. Existing fixtures retain their
mocked scope; no gameplay tests or benchmarks were rerun for this review.

The first response is claimed/examined under
`codex/pair-screen-temik911-20261002`, completion unset. Other responses were
not body-reviewed; all captures, maps, cache responses and prior reviews remain
retained. The watcher was stopped after capture/review. Only this documentation
and the separate trial screening result were updated; runtime sources, switches,
generated builds and both trial configurations were preserved. Restore Arena's
source manually to the main repository's `src/` and retain the pairing trial;
restoration is not verified. Manual action: **NONE** (no new match or replay
reopening required).
