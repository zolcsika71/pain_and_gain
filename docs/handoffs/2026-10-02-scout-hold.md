# Scout hold experiment handoff — 2026-10-02

## Code and configuration

The experiment adds a disabled-by-default movement option for an unassigned,
owned, full-health, unfatigued MOVE-only scout. Within Chebyshev range two of
our owned first flag, it holds only when no living enemy is within five tiles
of the scout or flag. Eligibility is reevaluated every tick. An allocation
override, including explicit null, and escort movement retain priority. The
switch changes fallback movement only; the allocator gates, healing, combat,
and diagnostic schema remain as before. The policy and tests are recorded in
the [experiment record](../architecture/scout-hold-experiment-2026-10-02.md).

The tested live screening configuration had all three switches enabled:

| Switch | Screening | Delivered deployment |
| --- | --- | --- |
| `oneScoutFlagExperiment` | `true` | `false` |
| `oneHealerEscortExperiment` | `true` | `true` |
| `scoutHoldExperiment` | `true` | `false` |

Screening build:
`8528f573aa57fc000f3105d71d0315de7b159472318771edf145c6ced898e872`.
The restored deployment build, regenerated with `npm run build-id:generate`
and checked by `npm run check`, is
`fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`.
The screening build is historical; the delivered source does not enable either
scout experiment. Healer escort remains enabled at its established setting.

## What the retained matches establish

The preceding scout-allocation trial had one disabled baseline against a
different opponent and four enabled matches on differing opponents/maps. It
did not form a controlled B/E/B/E comparison. The enabled matches showed one
assignment/completion against System, one assignment/cancellation against
宰 v17, no assignment against 宰 v2, and no assignment in the Rozzel v18 match.
The allocator followed its observed gates, but the small, noncomparable sample
does not establish tactical reliability or strategic benefit. The Rozzel
scout's repeated first-flag approaches motivated this separate hold trial;
they did not prove a pathfinder defect or explain the user-reported loss.

For the hold trial, the user selected this repository's `src/`, played one
match against charcock v78, and opened replay
`6abefda2d1c8563f587fcc9c` (created `2026-10-02T00:41:06.300Z`). Exact
cache request keys, metadata, and all 20 captured log build IDs identify the
screening build. A validated replay-linked map has checksum
`b0067f47005ec4e8639aae5fc244d0ae8d84e54452a87f26515236de88d6f8ed`.
The 20 log responses cover runtime ticks 1–1946 with 1,946 complete
diagnostic closures and no gaps, conflicts, or correlation issues. Twenty
retained frame responses cover `gameTime` 1–1947; metadata validation is
partial. Runtime/frame alignment and terminal coverage were not established,
so the behavior findings use runtime evidence only.

Scout `pg_player2_scout_2` held at `(49,49)` on ticks 79–1946: **1,868**
explicit hold decisions, **zero** movement attempts during them, and **1,867**
stationary next-tick observations. Tick 1946 has no later runtime snapshot.
At tick 77 the otherwise hold-eligible scout was assigned
`pg_flag_attack_reduction_b`; allocation took priority, its one `moveTo`
returned `OK`, and the next snapshot moved from `(49,49)` to `(48,50)`.
The allocator cancelled at tick 78 because an enemy came within five tiles of
the first flag. One first-flag approach returned `OK`, and the scout was back
at `(49,49)` at tick 79. Scout `pg_player2_scout_1` never qualified to hold;
it was last seen at tick 43 with 90/100 health and absent from tick 44.
There were no duplicate or rejected movement attempts and no observed
allocator or hold-eligibility mismatch.

**Screening verdict:** on-flag holding and allocation priority were verified;
hold-to-release, holding one or two tiles off the flag, explicit-null
allocation priority, and escort priority were unexercised live. No
implementation violation was observed. `OK` is a scheduled call, not proof
of movement; displacement is reported from the following snapshot. This one
match does not establish a final result or strategic improvement.

## Evidence and review state

Managed captures and the manifest remain under ignored `replay_logs/`.
The charcock selection is exactly **20 log records and 21 score sources**
(one metadata response and 20 frame responses), plus its linked map. They
were claimed and examined by
`codex/scout-hold-screening-charcock-20261002` with `completedAt: null`.
Earlier retained reviews are also preserved; none were completed or cleaned
up in this delivery.

The exact selections, bounded analyses, and preservation audits copied from
the three temporary directories are available locally at:

- `replay_logs/local_audits/2026-10-02-scout-hold/hold-screening/`
- `replay_logs/local_audits/2026-10-02-scout-hold/four-replay-capture/`
- `replay_logs/local_audits/2026-10-02-scout-hold/four-replay-review/`

These directories are ignored by Git. The copies matched the original
temporary directories byte for byte. `hold-screening/selection.json` names
every exact new fingerprint; `behavior-summary.json` and the two scout
observation files contain the tick checks; `final-preservation.json` records
source, index, prior-review, and artifact checks. The compact log-only report
has SHA-256
`e9098ee8c22cffa9bc1d27b826f837338d74475fd0636910fb1671826ed8d638`.
The copied `.mjs` scripts preserve historical absolute `/tmp` paths and should
be read as audit provenance, not rerun unchanged. Future managed-body review
must follow the repository claim and examination procedure.

## Verification and next task

Under the restored deployment switches, `npm test` passed **174/174** and
`npm run check` passed the build-ID and runtime/tool syntax checks. The
scout-hold tests cover eligibility, boundaries, per-tick release, disabled
fallback, allocation and explicit-null precedence, escort priority, and tick
flow. The enabled live run previously had **171/174** tests passing; three
unchanged assertions correctly required the disabled scout-allocation
deployment switch. No assertion was weakened to make that temporary state pass.
Documentation links, whitespace, and staged-patch checks are part of the
delivery review; the exact final commit is available from `git log -1` after
publication.

**Next task:** prepare a practical, reproducible live hold-to-release case
using the existing switch and evidence workflow before asking for another
match. Define how the scout first enters a hold and then loses eligibility
(for example, a real enemy entering the five-tile guard), with a complete
same-build runtime observation on both sides of the transition. Keep the
allocator's priority and first-flag safety gates intact. No additional
gameplay change is justified by the current evidence.

## Follow-up: release preparation

The follow-up added `npm run scout-hold:screen -- <replay-id> <codex/task-id>
<expected-build-id>` for claimed, same-build managed log evidence. It runs the
existing compact analyzer, caches the derived runtime report by evidence and
analyzer/configuration fingerprints, and reports sourced hold/release
transitions. The charcock screen found 1,868 holds, no release transition, no
off-flag hold, and no guard violation across 1,946 complete runtime ticks.
The new tick-flow regression exercises enemy entry at the five-tile guard,
fallback command, and re-hold. No gameplay or logging code changed. See the
[updated experiment record](../architecture/scout-hold-experiment-2026-10-02.md#hold-to-release-preparation--follow-up)
for exact command, provenance, acceptance criteria, and limits.
Final `npm test` passed 177/177, `npm run check` passed at the unchanged
deployment build ID, and `git diff --check` passed. The new review task claimed
and examined all 20 log records; its completion checkpoints remain unset.

There is no reproducible live enemy-entry setup in the retained material.
Leave the deployment switches at allocation off, escort on, hold off; build
`fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`.
Do not ask for a random match solely to exercise release. Revisit only if the
user can arrange a controlled opponent/scenario or already has a replay with
the required transition. The new review claims remain retained and incomplete.

## Evidence-status correction

The screen now reports a nearby-enemy candidate with incomplete command
coverage as `unknown`, including when another candidate passes. Aggregate
precedence is fail, unknown, pass, then unexercised; candidate counts are
explicit. `observedAfter` is present only for a sourced, consecutive,
same-build following snapshot, with `followingPosition` explaining any missing
or incompatible observation. The command verdict remains independent of that
later position, including when a scout stays on the flag. This corrects the
reporting semantics without changing gameplay, logging, deployment switches,
captures, or review lifecycle state. The [experiment record](../architecture/scout-hold-experiment-2026-10-02.md#screen-report-status-semantics)
has the precise field meanings. No replay review or live trial was repeated.
Focused summarizer tests passed 7/7; the full suite passed 181/181,
`npm run check` passed at the unchanged deployment build ID, and
`git diff --check` passed.

## Bounded historical index follow-up

`npm run evidence:index -- tools/selections/escort-injury-2026-10-02.json`
now reproduces a three-replay, explicit-source index from retained local
evidence. Two current healer-escort-build responses were claimed and examined
under `codex/historical-cycle-escort-20261002` and remain incomplete; the two
older selected fingerprints are retired and reported unavailable. The first
run analyzed only the two current selections; a repeat used both valid compact
report caches. Distinct opponents, maps, build provenance, incomplete final
ticks, and analyzer unknowns remain separate. No historical win/loss or
strategic-benefit comparison is inferred.

The selected live evidence still verifies only the inclusive range-five
unrelated-injury release, not remote-injury escort retention beyond five.
There is no concrete defect to fix and no reproducible live scenario to request.
No gameplay, logging, or deployment configuration changed. The complete
[cycle record](../architecture/historical-evidence-cycle-2026-10-02.md)
contains the exact sources, acceptance criterion, no-change decision, and
remaining evidence limit. Focused index/escort tests passed **21/21**; the
full suite passed **189/189**; `npm run check` passed with deployment build
`fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`.
The documented index command reanalyzed the two current rows after the tool's
final code change and hit both caches on repetition; the retired row had no
cache. Manual action: **NONE**.

## Scout non-progress evidence triage

The next bounded review reused the retained four-replay scout audit and its
explicit local selection without reopening managed capture bodies. Same-build
System replay `6abeee11d1c856288b7fcc0e` records repeated first-flag
fallback commands and one completed scout diversion; Rozzel v18 replay
`6abeef13d1c8561eb97fcc13` records repeated first-flag approaches without
an allocation. They have different maps and opponents. The audit reports no
allocation policy problem or analyzer failure, and command acceptance alone
does not establish movement or strategic value. The all-enabled charcock hold
trial is a different build and still lacks release evidence.

The [follow-up decision](../architecture/historical-evidence-cycle-2026-10-02.md#follow-up-triage-scout-first-flag-non-progress)
is **no gameplay or logging change**: these examples do not justify changing
the stable defaults or relaxing safety gates. Captures, caches, and all review
claims remain untouched. The missing criterion is a reproducible threat-release
scenario plus a comparable build-identified outcome comparison; no such setup
is available. Keep this investigation parked until new relevant evidence, a
feasible targeted experiment, or a distinct unanswered question arises.
Manual action: **NONE**.

Validation for this documentation-only decision: focused scout tests **36/36**,
`npm test` **189/189**, `npm run check` at unchanged deployment build
`fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`.

## Prepared one-random-match holding observation

The user clarified that Arena has only random matches, with no controlled
opponent or scenario. This supersedes the earlier reproducible-setup gate for
one bounded observational match; it does not change the historical conclusion
or guarantee a release event. A separate detached local worktree is ready at
`/Users/zoltanka/Documents/Prog/JavaScript/ScreepsArena/pain_and_gain_hold_trial_2026-10-02/`.
Select **that worktree's `src/`**, not the stable checkout. Its switches are:

| Switch | Trial | Stable main |
| --- | --- | --- |
| `oneScoutFlagExperiment` | `false` | `false` |
| `oneHealerEscortExperiment` | `true` | `true` |
| `scoutHoldExperiment` | `true` | `false` |

The trial build ID, generated and checked after the final runtime edit, is
`41db9b8e0d17113b582b05c6447d386efa655def58248287840f0ac48728ba5a`.
Only its config and generated build-ID module differ from base commit
`fd6fdf20ea62c2b663185913d52b58f83f59612a`. Trial focused tests passed
**16/16**, full suite **189/189**, and `npm run check` passed. The untouched
main checkout separately passed **189/189** and `npm run check`, retaining
stable build `fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`.

Before playing, run `npm run build-id:check` in the trial worktree, select its
`src/` in Arena, and leave it unchanged. Play **exactly one random match**,
open its replay, and provide the replay ID. To retain evidence, run
`node tools/replay-logs.js watch` from the main checkout while opening the
replay, then stop it with Ctrl-C. The next task will verify the exact replay,
emitted build, and managed source coverage before analysis; no match or replay
was operated in this preparation. Captures, caches, and review claims were
left untouched.

Look for the same eligible scout holding without a movement attempt on tick
*t*, then losing eligibility on consecutive tick *t+1* and following the
existing movement policy. Prefer real enemy entry within five tiles of the
scout or owned first flag. The [experiment record](../architecture/scout-hold-experiment-2026-10-02.md#one-random-match-observational-trial--preparation)
defines the sourced command-level pass/fail, unknown for incomplete evidence,
unexercised for no qualifying transition, and separate following-position
observation. A stationary on-flag position is valid; one functional pass does
not establish strategic benefit. Do not automatically repeat the random match
if release is unexercised.

After the match, select the stable main checkout's `src/` again and run
`npm run build-id:check` there. Retain the trial worktree until replay
evaluation; never copy or commit the enabled trial config as a stable default.
Manual action: **NEW MATCH THEN REPLAY**, exactly one match.

## Recovered random-trial replay and decision

The newly opened replay is `6abf18062ea5a37141f736fe`, identified by its
exact `/api/game/<id>/log/85` cache request key and matching game metadata
(created `2026-10-02T02:33:42.836Z`, 85 game ticks). Unlike the preceding
stable-build replay `6abf13a2d1c8565ef57fcd46`, this log emitted the
prepared trial build
`41db9b8e0d17113b582b05c6447d386efa655def58248287840f0ac48728ba5a`.
Its one imported response has fingerprint
`33653c969b6e359bd7806f611a7969b55306118a7da109a5b0524c603ba0ea12`
and linked map checksum
`5cabf4ccb222945c8652515d26a8a261dfa18741d894cab530a411bb5afedc22`.
It covers runtime ticks 1–84 without gaps, all with complete closures and no
reported command-correlation issues. The game metadata's tick 85 is not in
the log. The compact analyzer reported 10,849 pass, zero fail, and 42 unknown
findings. This exact managed record was claimed and marked examined under
`codex/scout-hold-random-trial-review-20261002`, with completion unset; no
cleanup or older-review change occurred.

The existing scout-hold screen found **zero holds**, **zero off-flag holds**,
and **zero hold-to-release candidates**. Enemy release is **unexercised**,
not pass or fail; there were no candidate-specific unknowns. The first flag
was ours on ticks 44–82, but all 37 observed owned-scout positions within
two tiles of it also had a living enemy inside the five-tile guard. The two
scouts produced 125 first-flag fallback decisions and 125 correlated
`moveTo` returns of `0`; next-tick positions were changed 90 times,
stationary 33 times, and actor-absent twice. These later positions are
separate from command acceptance and are **not** release observations. The
[experiment record](../architecture/scout-hold-experiment-2026-10-02.md#one-random-match-observational-trial--recovered-evidence)
has exact source and report references, coverage, and eligibility limits.

The prepared build executed, but this random match did not provide a hold or
release opportunity. Live hold-to-release validation remains open. Do not
promote holding or request an automatic retry. Reopening this replay cannot
add an absent hold transition, so no replay reopening is requested. Main
remains allocation off, escort on, holding off;
the separate trial worktree remains available, and Arena's post-match source
selection is unconfirmed. If Arena still selects the trial worktree, select
the main repository's `src/` for stable deployment. Manual action: **NONE**.
