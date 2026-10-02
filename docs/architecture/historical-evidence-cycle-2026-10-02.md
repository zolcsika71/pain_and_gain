# Bounded historical-evidence cycle — 2026-10-02

## Selection and reproducibility

This iteration indexes the exact three-replay selection in
[`tools/selections/escort-injury-2026-10-02.json`](../../tools/selections/escort-injury-2026-10-02.json).
On the machine retaining the ignored `replay_logs/` captures, run:

```sh
npm run evidence:index -- tools/selections/escort-injury-2026-10-02.json
```

The two current log fingerprints were claimed under
`codex/historical-cycle-escort-20261002` before analysis, then marked
`examined`. Their `completedAt` checkpoints remain `null`; prior owners,
captures, maps, and review state are retained. The two older fingerprints are
already retired and have no current capture body to claim or analyze. The
command reads only this selection and calls the existing compact analyzer for
current sources. An ignored per-replay cache is used only while exact evidence,
map, selection, analyzer/tool, and configuration/build inputs still match;
prior full reports have no such validity key and are historical context, not
cache hits. The CLI does not alter the manifest or run a game.

## Compact cross-match finding

| Replay, opponent | Runtime build and map | Captured/closed ticks | Analyzer findings | Availability |
| --- | --- | --- | --- | --- |
| `6abd6917f59cc86960103f32`, dd v5 | `cc9d4e61…bccf1f85`, map `4389b28c…654d44f` | 1–88 / 1–88; metadata reports 89 | 11,229 pass, 0 fail, 42 unknown | One current claimed log source |
| `6abd6940f59cc80c91103f38`, MetalicaX v12 | Same build, map `63589e20…1479df4` | 1–72 / 1–72; metadata reports 73 | 10,498 pass, 0 fail, 42 unknown | One current claimed log source |
| `6ab867aee03513115f91edc0`, OoPaul壞神oO v44 | Legacy build/configuration unknown, map `e14c3648…6447ee2` | Historical report only | No current reanalysis | Two selected fingerprints retired |

The exact current fingerprints are
`7c81e752648dd681fcad7d9b6ccdfe1e5a82c35bf4d18eb9de176459e11afccd`
and `4cc6f8c121d6d0897e3ee720785784f9e6c244f630b993617af51dc2d3ae4033`.
The retired fingerprints are
`8d7b83bb1b3a5042dbf308835e23400006b7c366939d7a566a65477224a98217`
and `eca5add01cd3e83dcd0d59f3795e4b1a66697791be05078840c3e5ad4001676d`.
The current build is the historical healer-escort-enabled, scout-allocation-off
configuration documented in the [injury-release live record](healer-escort-injury-release-validation-2026-09-30.md),
not today's deployment build. The index checks the selected runtime build IDs;
the opponent, switch labels, and reported final ticks come from that record,
not from a fresh metadata import. The older map and retirement provenance are
also documented in the [map-linked replay review](replay-review-2026-09-27.md).

The analyzer's positive groups support selected source integrity, build/map
linkage, diagnostic closure, decision/attempt correlation, and bounded movement
and health comparisons. They are *finding counts*, not independent matches or
escort successes. The 42 unknowns in each current replay are 28 health and 14
movement comparisons at the final captured tick, where the following snapshot
is absent. That absence neither proves a terminal failure nor negates supported
command-level observations. The two opponents and maps differ, and the retired
legacy source has no comparable current body. No win/loss or strategic-benefit
comparison is made across them.

## One question and decision

Question: does the current healer-escort continuation rule retain an acquired,
otherwise eligible pair when *only* an unrelated friendly more than five tiles
from the healer becomes injured? The intended value is to avoid needlessly
abandoning a local escort for a remote injury; it does not promise better match
outcomes. The predeclared command-level acceptance criterion is a same-build,
consecutive, closed runtime sequence showing acquisition, an unrelated injured
friendly at range greater than five while both partners remain eligible, then
continued escort decision and its appropriate hold or attempted movement.
Release solely for that remote injury under complete comparable evidence would
fail. Missing transition, build/coverage mismatch, or ambiguous injury context
is unknown. Subsequent displacement and strategic value are separate questions.

The [second attempt](healer-escort-injury-release-validation-2026-09-30.md#second-attempt--replay-6abd6917f59cc86960103f32)
never acquired an escort. The
[third attempt](healer-escort-injury-release-validation-2026-09-30.md#third-attempt--replay-6abd6940f59cc80c91103f38)
records acquisition and an accepted escort movement attempt at tick 50, then
release at tick 51 for a different injured friendly exactly at range five.
That supports the inclusive local-release boundary and release-before-ordinary-
movement ordering. It does not exercise remote-injury retention. Existing
selector and tick-flow tests cover the remote boundary synthetically, including
ranges six and nine, but a reconstructed historical snapshot does not predict
the later trajectory or show live execution of the unexercised branch.

**Decision: no gameplay or logging change.** The selected evidence contains
no concrete violation of the current rule and no live observation of its
unexercised branch. More instrumentation cannot be recovered by reopening an
old replay. The smallest missing evidence is one *controlled*, current-build
match with the defined acquired-pair/remote-injury sequence and complete
consecutive diagnostic coverage. No reproducible setup is available now, so
there is no prepared trial and no request for a random match. Hold-to-release
remains a separate, unexercised question; this iteration does not repeat it.

## Implementation, checks, and next decision

Only the local index, explicit selection, focused cache/status tests, and
documentation changed. It uses existing Node.js dependencies and the existing
compact analyzer. No `src/` code, deployment switch, diagnostic emission, or
build identity changed. Cache tests cover hit reuse, evidence/map/analyzer/
configuration/selection invalidation, per-replay reanalysis, changed managed
bytes, claim/build gating, duplicate records, and unavailable or retired rows.
Focused index and escort tests passed 21/21; `npm test` passed 189/189; `npm run check` passed
at unchanged deployment build
`fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`.
The documented command then showed misses only for the two current sources and
hits for both on repetition. `git diff --check`, with new files included
temporarily as intent-to-add, passed; the index was then restored without
staging the changes.

Next decision: leave the deployed escort rule as-is. Revisit only if a
controlled scenario or already retained compatible replay supplies the precise
missing remote-injury transition; then claim it, index its exact sources,
evaluate the criterion above, and separately assess later movement/outcomes.
Manual action: **NONE**.

## Follow-up triage: scout first-flag non-progress

Starting from clean commit `901549f39a168d9491ad3d2f7d3ffabb59bffc7b`,
this iteration reviewed the completed, explicit four-replay audit at
`replay_logs/local_audits/2026-10-02-scout-hold/four-replay-review/` before
considering any new capture. Its `selection.json`, `scout-results.json`,
per-replay compact reports, and saved [scout handoff](../handoffs/2026-10-02-scout-hold.md)
already answer the bounded command/decision question. No managed capture body
was reopened, no analyzer was rerun, and no new review claim or lifecycle
checkpoint was needed. The ignored local audit is not available from GitHub;
the exact selections remain retained on this machine.

The issue is repeated first-flag fallback by healthy MOVE-only scouts after
that flag is owned. The strongest two examples share historical scout-allocation
build `679976566a4143ddc7637d0fc7ef4c5fff4571719157466e05589e085ea9602b`
but **not** opponent or map:

| Replay and opponent | Map checksum and selected source references | Bounded observation |
| --- | --- | --- |
| `6abeee11d1c856288b7fcc0e`, System | `c40017bf486b12b976ff901eaacf0a00bf240b4f4878f19ee7a64f76e196f91b`; first log `49ee1232d1f47c15357fe41dd3428135f5b3ba5d5e45b55d90d029aaf8baa6c2`, last `b340952dbab86f3a4898a8d73d203720b4a30e9b46cdf980c3ca5eb6e12555e7` | Captured/closed ticks 1–1527. Scout 1 selected first-flag fallback on all 1,527 ticks and attempted movement each time; 1,483 available following-position comparisons were stationary. Scout 2 was assigned at tick 39 and completed an attack-reduction flag capture at tick 62. |
| `6abeef13d1c8561eb97fcc13`, Rozzel v18 | `50e5de7e88afce9efd5b171f0edc60131de7722fb41f6253f24faec84e6e422d`; first log `5c1c88f8ef5832fbff977445573a660bbf4466a7704847aca21a55dca1216dde`, last `2840605ede1fa5dcc1a9c4a574e0124da5ac933d51d3e42a16e584c3e6a47ea8` | Captured/closed ticks 1–1414. No scout allocation occurred; scout 2 repeatedly approached the first flag, with the documented (47,49)/(47,50) alternation on ticks 52–1414. |

All four audited allocation replays had zero reported policy problems and zero
compact-analyzer failures. Their outcomes are not pooled: System and Rozzel
have different opponents and maps, and the one successful capture cannot
establish a scoring or survival benefit. An accepted `moveTo` is scheduling,
not proof of displacement; a stationary next snapshot does not identify why
the pathfinder failed to progress. The separate all-enabled charcock v78 hold
screen verified on-flag holding under build
`8528f573aa57fc000f3105d71d0315de7b159472318771edf145c6ced898e872`,
but did not exercise hold-to-release or establish net benefit. Its different
build/opponent/map cannot be treated as a paired comparison.

**Hypothesis and criterion.** Suppressing some redundant fallback movement
could reduce non-progressing commands, but changing scout objectives or
promoting holding might also lose a useful response to a new threat or alter
flag/scoring outcomes. A concrete defect would require a complete same-build
decision/attempt trace violating the existing allocation or movement priority,
or duplicate movement for one actor/tick. A strategic promotion would require
comparable, build-identified enabled/disabled scenarios with first-flag
retention, other-flag uptime, casualties, score trajectory, and threat-release
behavior measured separately. The retained audit establishes repeated
commands and the one diversion, but neither a policy violation nor that
comparison. Snapshot-based selector evaluation cannot predict the trajectory
of a changed policy.

**Decision: no gameplay, logging, or tooling change.** Do not relax allocator
safety gates or enable the holding switch from these unmatched examples.
The smallest missing evidence for reconsideration is a reproducible scenario
that includes both a non-progressing scout and a subsequent eligibility loss,
with compatible build-tagged decisions/commands and a matched outcome
comparison. No such setup or new retained evidence is established, so this
iteration neither prepares nor requests a random match. Hold-to-release and
remote-injury retention remain parked. Deployment switches and runtime build
`fe78c1a86aa6127152561cf4cedc05257e7a537d7a244a183a38f7394961ef8c`
remain unchanged. Manual action: **NONE**.

Focused scout allocation/movement/hold tests passed **36/36**. The unchanged
runtime passed `npm test` **189/189** and `npm run check` with the deployment
build ID above. No replay analysis, gameplay, or review-lifecycle command was
run in this follow-up. The final diff contains documentation only.
