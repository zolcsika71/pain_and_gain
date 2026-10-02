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
