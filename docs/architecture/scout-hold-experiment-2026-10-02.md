# Bounded scout hold experiment — 2026-10-02

## Evidence and scope

In retained replay `6abeef13d1c8561eb97fcc13` against Rozzel v18,
`pg_player1_scout_2` alternated between (47,49) and (47,50) on runtime ticks
52–1414. The already-owned first flag at (49,49) was occupied by our ranged
unit. The scout was healthy and never assigned an allocation objective; its
first-flag `moveTo` calls returned `OK`, with no duplicate attempts. This is
observed non-progressing fallback movement, not proof of a pathfinder error or
the cause of the user-reported loss.

The allocator's safety gates, one-attempt limit, and inconclusive live verdict
are unchanged. This experiment targets unnecessary fallback approaches only;
it does not establish strategic benefit, an alternative flag objective, or
permission to relax allocation gates. See the [allocation policy](combat-positioning-validation.md#one-scout-flag-allocation-experiment--2026-09-28),
[game rules](../pain_and_gain_rules.md), and [evidence boundaries](replay-evidence-contract.md#evidence-boundaries).

## Holding rule

`scoutHoldExperiment` is disabled by default. When explicitly enabled, movement
holds only when all of these conditions are true at the current observation:

- The actor is owned, alive, at full health, with zero fatigue, a nonempty body
  containing only MOVE parts, and at least one functioning MOVE part.
- The first flag is explicitly ours (`my === true`).
- The actor is within Chebyshev range **two**, inclusive, of that flag.
- No living enemy is within Chebyshev range **five**, inclusive, of either
  the actor or the first flag.
- No active allocation fallback override exists for that actor. An explicit
  null override (waiting on a neutral capture cell) also takes precedence.
- Escort handling has not already selected the actor's movement.

Two tiles includes both observed oscillation cells without holding scouts farther
away; it is a conservative screening distance, not a measured optimum. The
five-tile threat guard reuses the existing local movement engagement window.
Holding can affect both eligible scouts, not just the previously selected
candidate. It issues no movement call, adds no sticky state or timeout, and is
reevaluated each tick. Ownership loss, injury, fatigue, role/range changes, or
nearby enemies restore the existing movement policy immediately. An active
allocation or escort remains authoritative. Combat and healing selection are
unchanged; holding is not a new retreat or defense policy.

`moveCreeps` receives an optional disabled-by-default hold argument from
`runTick`. It enables the selector option only without an allocation override,
after the existing escort branch. Existing action evidence emits a movement
decision with outcome `hold`, reason `scout-owned-flag-hold`, and no action or
attempt. No logging schema or extra instrumentation is introduced.

## Local verification

Eight new tests cover inclusive range boundaries, eligibility, per-tick release,
enemy-distance boundaries, disabled/omitted behavior, allocation/null override
and escort precedence, unchanged other-role plans, and production tick-flow
hold/resume/assignment logging. Existing allocation and movement tests retain
their disabled-mode contracts. Their two isolated configuration mocks merely
export the new switch as false; baseline configuration assertions are not weakened.

Before preparing the enabled hold trial, the focused movement/allocation/escort/
build suite passed **49/49**, and `npm run check` passed. With the pre-existing
scout allocation switch still true and hold false, `npm test` passed **171/174**.
The three failures were unchanged deployment assertions requiring
`oneScoutFlagExperiment === false` in `tick-flow.test.js`,
`healer-escort-flow.test.js`, and `healer-escort-disabled-flow.test.js`.
These are configuration failures, not a passing full-suite claim.

An isolated temporary copy with scout allocation false, healer escort true, and
hold false passed **174/174** without changing those assertions. Replacing only
its movement/execution implementation with the original code caused four of
the eight new hold tests to fail, demonstrating that they detect absent holding.
The repository's final all-enabled temporary configuration again passed
**171/174**, with exactly the same three scout-allocation-default assertion
failures. Final `npm run check` and build-ID verification passed. No unrelated
behavioral failure appeared, and these configuration failures do not establish
a runtime defect or excuse changing the baseline assertions.

Using the existing claimed/examined records under
`codex/one-scout-objective-control-20261002`, the same-snapshot comparison covered
all 1,414 retained Rozzel runtime snapshots. No lifecycle updates were needed.
The disabled selector exactly matched the original selector on **19,796** owned
creep decisions. The enabled candidate changed only **2,746** scout fallback
decisions into holds: 1,376 for scout 1 and 1,370 for scout 2. Scout 2's sampled
tick-52 and tick-53 positions both qualify. All affected original decisions were
verified first-flag approaches with recorded `OK` attempts.

These comparisons reconstruct functioning parts from snapshots; affected scouts
were full-health MOVE-only units. They do not replay engine movement, predict
later positions or allocations, measure CPU savings, or establish live holding
or strategic benefit. Keeping a scout still can change subsequent allocator
candidate ranking and routes even though the allocation policy is unchanged.

## Temporary live-test preparation (historical)

The task started at HEAD `ab8717d097000799ac9f91c063c3c206877f39f3` with only
the allocator-enabled config and generated build artifact modified. Starting
runtime identity was
`679976566a4143ddc7637d0fc7ef4c5fff4571719157466e05589e085ea9602b`.
Scout allocation and healer escort were enabled for that preparation; neither was
newly promoted.

With the new implementation and hold **disabled**, the checked local build was
`47dd1f08215b8bb1aeb951456964a89a354df256cd2de9227d1f659fcd080d09`.
The prepared live variant changes only the new switch from false to true and
regenerates `src/debug/build-id.js` using `npm run build-id:generate`.
The prepared all-enabled runtime identity is
`8528f573aa57fc000f3105d71d0315de7b159472318771edf145c6ced898e872`:

```js
export const oneScoutFlagExperiment = true;
export const oneHealerEscortExperiment = true;
export const scoutHoldExperiment = true; // temporary; deployment default false
```

At preparation this was ready for one user-launched screening match, not yet
validated live behavior or a permanent default. No match, commit, push, or
capture lifecycle operation was performed during preparation. Existing retained
artifacts and reviews were unchanged and incomplete at that point.

The preparation instruction for the one-match screening run was to select this repository's `src/`, keep Arena,
logging, and launch procedure unchanged, play exactly one match, open its replay,
and provide its ID/completion signal. No match is launched by this task.
Future capture must verify the emitted prepared build and claim exact records
before inspection. A useful exercised case has an eligible scout near the owned
first flag: expect one hold decision, no movement attempt, and inspect the next
snapshot separately. Observe any eligibility loss or allocation activation for
immediate resumption/priority; do not treat an absent scenario as a pass.
The preparation gate was to stop on duplicate movement, suppressed active allocation/escort, missing
required resumption, runtime errors, or insufficient evidence. A win is neither
required nor proof of benefit. Restore the hold switch to false and regenerate
the build identity when the temporary trial is closed; that future restoration
must not silently alter the other experiment switches.

## Completed charcock v78 screening

The user selected this repository's `src/`, played one match, and opened its
replay. Bounded cache-key and exact metadata checks identified replay
`6abefda2d1c8563f587fcc9c`, created `2026-10-02T00:41:06.300Z`, against
charcock v78. All 20 exact log responses carried the prepared all-enabled build
`8528f573aa57fc000f3105d71d0315de7b159472318771edf145c6ced898e872`.
The replay-specific validated map checksum is
`b0067f47005ec4e8639aae5fc244d0ae8d84e54452a87f26515236de88d6f8ed`.
The 20 log responses cover runtime ticks 1–1946 without gaps or conflicts; all
1,946 diagnostic closures are complete, with no correlation issues. Separately,
20 retained frame responses cover `gameTime` 1–1947, and metadata validation is
partial. This screening did not establish runtime/frame alignment or a terminal
result; the behavior below uses runtime evidence only.

Scout `pg_player2_scout_2` was full-health, unfatigued, and unassigned at
`(49,49)` when the first flag was ours and no living enemy was within five
tiles of either. Runtime ticks **79–1946** contain **1,868** movement decisions
with outcome `hold` and reason `scout-owned-flag-hold`, with **zero** movement
attempts. All **1,867** available next-tick snapshots keep it at `(49,49)`.
The tick-1946 next position is unknown. This establishes live holding on the
flag cell; holding at distances one and two remains unexercised.

At tick **77**, the same scout otherwise satisfied the hold conditions, but the
allocator assigned `pg_flag_attack_reduction_b`. The allocation override won:
the scout issued one `moveTo` to that target (`OK`), and its next observed
position changed from `(49,49)` to `(48,50)`. At tick **78**, an enemy within
five tiles of the first flag caused the allocator to cancel. The scout issued
one first-flag approach (`OK`) and was back at `(49,49)` in tick 79. The
subsequent hold interval never lost eligibility, so a hold-to-release transition
was **not exercised**. Explicit-null allocation and escort precedence were
also unexercised live. Scout `pg_player2_scout_1` never qualified for a hold:
it was last seen at tick 43 with 90/100 health and was absent from tick 44.

No duplicate or rejected movement attempts, allocator-policy mismatch, or
hold-eligibility mismatch appeared. The compact log-only report has 208,310
passes, zero fails, and 41 unknown findings, including missing next-tick
observations for absent actors and the final captured runtime tick. `OK` proves
scheduling, not displacement; the next-tick observations above are separate.
The screening verdict is **holding and allocation priority verified; release
and off-flag holding unexercised; no observed implementation violation**.
Strategic benefit and the earlier scout-allocation experiment remain unproven.

The exact 20-log/21-score-source selection, per-scout tick observations,
summaries, and preservation audit are retained locally under
`replay_logs/local_audits/2026-10-02-scout-hold/hold-screening/` (ignored by Git).
Its compact report hash is
`e9098ee8c22cffa9bc1d27b826f837338d74475fd0636910fb1671826ed8d638`.
All 41 new records were claimed and examined by
`codex/scout-hold-screening-charcock-20261002`, with `completedAt: null`.
Prior records and reviews were preserved; no capture was completed or removed.

## Restored deployment configuration

The screening's all-enabled build above is historical. The delivered source
disables scout allocation and scout holding while leaving healer escort enabled:

```js
export const oneScoutFlagExperiment = false;
export const oneHealerEscortExperiment = true;
export const scoutHoldExperiment = false;
```

After regenerating `src/debug/build-id.js`, the deployment build ID is
`fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`.
The hold implementation remains behind its disabled switch. The next task is
to prepare a practical, reproducible live hold-to-release opportunity before
requesting another match; this screening supports no additional gameplay change.

## Hold-to-release preparation — follow-up

The retained charcock log selection was claimed under
`codex/hold-release-preparation-20261002` and screened through
`npm run scout-hold:screen -- 6abefda2d1c8563f587fcc9c codex/hold-release-preparation-20261002 8528f573aa57fc000f3105d71d0315de7b159472318771edf145c6ced898e872`.
The tool reuses the compact replay analyzer and keeps a derived report under the
ignored `replay_logs/analysis_cache/` directory. Its key includes evidence
fingerprints and bytes, diagnostic content and coverage, map bytes, analysis
code, configuration, and local build identity; a repeated run hit the cache.
The exact 20 managed log responses again yielded 1,946 complete runtime ticks,
1,868 holds, zero off-flag holds, zero hold-to-release transitions, and zero
five-tile guard violations. The analyzer reported 208,310 passes, zero fails,
and 41 unknowns. These findings use runtime snapshots and decisions only;
frame alignment and strategic benefit remain unknown.

The focused production tick-flow test now holds an eligible scout, places a
living enemy exactly five tiles from the owned first flag but seven from the
scout, observes one first-flag `moveTo` returning `OK`, removes the enemy, and
observes a new hold. This verifies the source path with controlled inputs, not
an Arena movement outcome. No runtime code or logging schema changed, and the
deployment switches remain allocation off, escort on, hold off at build
`fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`.

For a future live screen, the required sequence is: the same healthy,
unassigned MOVE-only scout is within two tiles of the owned first flag and
explicitly holds on tick *t*; at tick *t+1* a living enemy enters Chebyshev
range five of the flag or scout while the flag remains owned and the scout is
otherwise eligible; the movement decision changes to first-flag fallback, with
exactly one correlated `moveTo` attempt returning `OK`. Complete same-build
runtime snapshots and diagnostic closures are required on both ticks; inspect
tick *t+2* separately for observed displacement. A continued hold inside the
guard, a missing or rejected fallback command, or duplicate movement is a
failure. No qualifying transition is unexercised; a candidate with a nearby
enemy but incomplete command coverage is unknown. Other eligibility loss or an
allocation override does not establish the guarded fallback scenario. `OK`
alone does not prove displacement, and a single passing transition does not
establish benefit.

### Screen report status semantics

`enemyReleaseCandidates` counts nearby-enemy entries after a hold separately by
`pass`, `fail`, and `unknown`, including a continued hold inside the guard. The
aggregate `enemyRelease` precedence is **fail >
unknown > pass > unexercised**. A guard violation is a failure; otherwise any
failed candidate takes precedence, then any incomplete candidate, then a
supported command pass. `unexercised` means no qualifying enemy-entry
transition or guard violation was established. A passing transition therefore
cannot conceal another transition whose command evidence is incomplete.

Each transition's command verdict uses the hold and release ticks. Its
`observedAfter` coordinates are optional, independent next-snapshot evidence:
they are populated only when tick *t+2* exists, carries a compatible build ID,
identifies the scout, and has a source fingerprint. `followingPosition` holds
the same optional coordinates, expected tick, source fingerprint/tick/build
when available, and an explicit status (`observed`, `missing-snapshot`, `incompatible-tick`,
`incompatible-build`, `missing-provenance`, or `actor-absent`). A missing or
incompatible following snapshot does not change a supported command-only pass.
An observed position equal to the release-tick position, including on the flag,
is valid; it does not turn an accepted command into a failure or prove the
command caused movement. These checks supplement the CLI's upstream managed
evidence and expected-build validation. Isolated summarizer fixtures do not
demonstrate a CLI validation bypass.

No retained match or repository setup can deliberately put an enemy into this
guard after a scout has begun holding. Arena opponent movement is outside this
code's control. Another ordinary match has no reliable release opportunity,
so no temporary live configuration is prepared and no new match is requested
for this iteration. The least costly bounded alternative is the deterministic
tick-flow fixture above, plus screening an already played same-build replay if
one with the required transition becomes available. Keep the live criterion
open until such a replay is identified; do not infer a release from the long
charcock hold interval.

## One-random-match observational trial — preparation

The user clarified that all Arena matches are random and there are no
controlled-opponent or controlled-scenario options. This supersedes the prior
request for a reproducible live setup, without changing the earlier evidence
verdict. Exactly one ordinary random match is authorized for observation, not
as a guaranteed hold-to-release exercise or a strategic comparison. No match
or replay was operated during preparation.

Starting from clean `main` at
`fd6fdf20ea62c2b663185913d52b58f83f59612a`, a separate, detached local
Git worktree was prepared at
`/Users/zoltanka/Documents/Prog/JavaScript/ScreepsArena/pain_and_gain_hold_trial_2026-10-02/`.
Only its `src/config.js` and generated `src/debug/build-id.js` differ from
that base. Its switches are scout allocation **false**, healer escort **true**,
and scout holding **true**. After the final runtime edit,
`npm run build-id:generate`, `npm run build-id:check`, and `npm run check`
verified build
`41db9b8e0d17113b582b05c6447d386efa655def58248287840f0ac48728ba5a`.
The trial's focused hold/screen/build tests passed **16/16**, and its full
suite passed **189/189** without changing deployment assertions. Separately,
the untouched main checkout passed **189/189** and `npm run check` at stable
build `fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`
with allocation **false**, escort **true**, and holding **false**.

Before launch, re-run `npm run build-id:check` in the trial worktree and select
its `src/` directory in Arena; do not select main's `src/` or edit trial runtime
files during the match. Play exactly one random match, then open its replay and
provide the replay ID. From the main checkout, use the existing
`node tools/replay-logs.js watch` capture procedure while opening the replay,
then stop the watcher with Ctrl-C. No automatic repeat is planned. The next
task must identify the exact replay, verify emitted build IDs, follow managed
claim/examined rules, and then run the existing scout-hold screen on its
explicit evidence. The present task does not touch retained captures, caches,
or review claims.

Primary live observation: the same eligible scout explicitly holds near our
first flag on tick *t*, with no movement attempt, then loses hold eligibility
on consecutive tick *t+1* and follows the existing movement policy. Prefer a
real living enemy newly within Chebyshev range five of the scout or flag while
the flag remains ours and the scout is otherwise eligible. With complete,
compatible build-tagged snapshots, decisions, attempts, and closures, a
command-level **pass** requires the applicable release decision and exactly
one correlated accepted `moveTo`; a continued hold inside the enemy guard,
missing/rejected required command under complete coverage, or duplicate
movement is **fail**. Incomplete relevant coverage is **unknown**; no
qualifying transition is **unexercised**. A different eligibility loss may
illustrate release but does not pass the enemy-entry screen. Assess any
following compatible consecutive position separately, including a valid
stationary on-flag position; command acceptance does not prove displacement.
One pass would verify only that functional transition, not strategic benefit.

After the match, return Arena's selected source directory to the stable main
checkout's `src/` and run `npm run build-id:check` there. Keep the trial
worktree available until the replay has been identified and analyzed; do not
copy its enabled config into main or commit it as the deployment default.
If no qualifying transition occurs, report **unexercised** and stop after
this one match rather than automatically asking for another.

## One-random-match observational trial — recovered evidence

Arena's selected-directory screenshot supported the trial-path setup, but did
not prove execution. A preceding replay, `6abf13a2d1c8565ef57fcd46`, was
separately recovered with the stable build; it is **not** this trial. The next
default-cache request keys identified replay `6abf18062ea5a37141f736fe`:
`1/0/https://arena.screeps.com/api/game/6abf18062ea5a37141f736fe/log/85`
and matching game metadata. Metadata names the same replay ID, creation at
`2026-10-02T02:33:42.836Z`, and 85 game ticks; its validation is partial.
The single log response fingerprint
`33653c969b6e359bd7806f611a7969b55306118a7da109a5b0524c603ba0ea12`
carries the **expected trial build**
`41db9b8e0d17113b582b05c6447d386efa655def58248287840f0ac48728ba5a`.
The exact cache source was imported through the existing importer without a
broad scan or cleanup. Its replay-linked map is
`replay_logs/pain_and_gain_map_2026-10-02T02-36-55-478Z.json`, checksum
`5cabf4ccb222945c8652515d26a8a261dfa18741d894cab530a411bb5afedc22`.
The managed log is `replay_logs/6abf18062ea5a37141f736fe.jsonl`.

The imported runtime snapshots cover ticks **1–84** without gaps, with **84/84**
complete diagnostic closures and no reported decision/attempt correlation
issues. The metadata's game tick 85 has no runtime snapshot; it is not filled
in or treated as a terminal behavior observation. The existing compact
`scout-hold:screen` validated the one trusted log and map; its analyzer totals
were **10,849 pass, zero fail, 42 unknown** findings. Its ignored derived
report is `replay_logs/analysis_cache/scout-hold-6abf18062ea5a37141f736fe.json`
with byte SHA-256
`4f0815eb66a46a422fa71c176725a4a294dc2fb6b005ec3c28cab614288044a5`.
The source was claimed and then marked examined under
`codex/scout-hold-random-trial-review-20261002`; completion remains unset.
Older captures, caches, and claims were not cleaned up.

**Observation:** the screen found **zero holds**, **zero off-flag holds**,
zero hold-to-release transitions, and zero guard violations. Its
`enemyReleaseCandidates` are pass 0, fail 0, unknown 0, with aggregate
`enemyRelease: unexercised`—not a functional pass or failure. The first flag
was neutral on ticks 1–43, ours on 44–82, and enemy-owned on 83–84. Across
the two owned scouts there were 37 scout-tick observations within two tiles
while it was ours (24 for scout 1, 13 for scout 2); **every one** also had a
living enemy within the five-tile guard. Of these, 15 scout-ticks were
full-health and 22 injured. No captured tick established the initial
hold-eligibility conditions, so there is no eligibility-loss transition or
release command to judge. Each scout instead made first-flag fallback
decisions on all its observed ticks: 67 and 58 decisions respectively, each
with one correlated `moveTo` return code `0`. These are scheduled commands,
not displacement. Separate consecutive snapshots show 90 changed positions,
33 stationary positions, and two next-tick actor absences across those
125 decisions; none is a hold-to-release following position.

**Decision:** this random trial verifies that the prepared build executed and
that observed non-holding is consistent with the nearby-enemy eligibility
guard. It does not verify live holding or hold-to-release in this build, prove
strategic benefit, or justify enabling holding in stable deployment. Do not
automatically request another match. Live hold-to-release validation remains
open. Reopening this same replay cannot create an absent hold transition; its
terminal missing runtime tick cannot supply a prior hold, so no specific
replay reopening is requested. Preserve the trial worktree and stable defaults
separately; Arena's post-match selected source directory has not been
independently rechecked. If Arena still selects
the trial worktree, select the main repository's `src/` for stable deployment.
Manual action: **NONE**.
