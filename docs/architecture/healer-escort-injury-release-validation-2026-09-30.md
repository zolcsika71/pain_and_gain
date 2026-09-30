# Healer-escort injury-release live validation — 2026-09-30

## Scope and result

This checkpoint records three user-launched matches and partial live validation
for the committed healer-escort injury-release refinement. Runtime commit
`0e6b6dddb8de2ca9aecd9d1bdd08528b119c8932` retains an existing escort when
only unrelated injured friendlies beyond Chebyshev range five from the assigned
healer are injured. Partner injuries and other friendly injuries at range five
or less still release before ordinary action selection. Acquisition remains
blocked by any friendly injury.

All three matches carry runtime build
`cc9d4e61eaac6962dde089593d5779d094b8ec58d1ae27c07228f136bccf1f85`,
which matches that commit. Healer escort was enabled and scout allocation was
disabled. Capture and analyzer integrity passed for all three attempts. The
first two never acquired an escort. In the third, an unrelated friendly injury
at exactly Chebyshev range five released an otherwise continuable escort before
ordinary movement selection. Ordinary support then approached on ticks 51–52
and attempted `rangedHeal` with return code 0 on tick 53. That return establishes
scheduling acceptance, not healing effectiveness. This is partial live
validation: remote-injury retention beyond five and assigned-partner injury
release remain unexercised on this build and retain synthetic coverage only.

## Replay identity and provenance

- Replay: `6abd64cbf59cc87ab9103ecd`.
- Cached game metadata identifies bushdoctor2008 v17 against temik911 v84. The
  game was created at `2026-09-30T19:36:43.312Z` (21:36:43.312
  Europe/Budapest), is marked finished, and records winner index 0. The current
  user and bushdoctor2008 code occupy index 0, so the cached API metadata
  supports a Victory result.
- The user did not supply a usable replay ID, opponent, outcome, displayed final
  tick, or launch time. The replay was identified from its exact cached game
  metadata and request keys; it was not selected from timestamp or list order
  alone. UI-displayed metadata remains unavailable.
- Cached game metadata reports 1,875 ticks. Nineteen exact `/log/<tick>`
  responses cover snapshots and closed diagnostics for ticks 1–1,874 without
  gaps, overlaps, duplicates, conflicts, missing closures, or correlation
  issues. The response requested at 1,875 ends at tick 1,874, so tick 1,875
  execution, CPU, closure, terminal state, and timeout status remain unknown.
- All selected responses carry the expected build ID above. Responses embed a
  runtime build ID, not the Git commit SHA; the commit association comes from
  the independently checked runtime source and generated build ID.
- Active map association:
  `pain_and_gain_map_2026-09-30T19-44-16-927Z.json`, map ID and canonical
  payload checksum
  `59723eb22e8c38156bd3e9b3d38b3ed8259c8cfdfc16a18c4d6259af4d1d4357`.
  The saved map is 21,376 bytes with file SHA-256
  `0bbc07d72a6aa8466ca4639aec44a872d8f806ff9d072c983632d970ab37eb6a`.

## Selected evidence

The selected response records are:

| Requested tick | Captured ticks | Fingerprint |
| ---: | ---: | --- |
| 100 | 1–100 | `7fb25c7877ef09adf29c8b6d26c36dcd2a5b11d9b6302fc3983089aba49001e8` |
| 200 | 101–200 | `9f6a5777129bd24acb8666f3d3cd6a0310d74bf1d21228f9f4cec25d5417ba25` |
| 300 | 201–300 | `49d493678f0339898b2308bb87dec30567f90222f33baf70cc3ba503dfac4607` |
| 400 | 301–400 | `d5e68acd6ccdc303f4e950360ef837a55d44718dd871afa1bbf140932ed916ea` |
| 500 | 401–500 | `91d219f3269196665b96c64c5f813776b75e360d5296dfb807e8ce81b5cf7b8d` |
| 600 | 501–600 | `c618df316b49336a14f3c135063ef8d521428202ffe37a0fcc54dc0199d0469c` |
| 700 | 601–700 | `a412e857a3c12ae4de4fdfcdd03b1bbe84ecd346fb228c8453bb46f1f79e6b02` |
| 800 | 701–800 | `ed8f02f97b50eb4dca0409994c11c68d1e7e5053c897d8b9e7adb0c555b9d108` |
| 900 | 801–900 | `9193498b7265b1753907ebd9726888b6c26ace1d8d8b3c1e5d160cd12cb7cc1d` |
| 1,000 | 901–1,000 | `624f985e5560b2334c9c05f11558dd0ab13a77419a3db572cbb976be9ab031ec` |
| 1,100 | 1,001–1,100 | `0a03ad5708cd50a9cd3a0b70fc8c9dd482645b345b9d91cbecd5c9547dd37288` |
| 1,200 | 1,101–1,200 | `73cbc329588397a0e0c0fbcee61a40b006270e824e5535f79bc3e4cbbacb6438` |
| 1,300 | 1,201–1,300 | `3cf4d1740023475ed31c36dbeb1ab42ee5f1713d56379308125249ca6b7ec269` |
| 1,400 | 1,301–1,400 | `f765be53f592877515c31be6df5bb606c3f9124aed17ecc56d1504cf95ff217d` |
| 1,500 | 1,401–1,500 | `8f13541edc0c1ec6971a3a49280ebf1dfd6fa0c0cdc4ca9d94e2073c988e4631` |
| 1,600 | 1,501–1,600 | `097c9b2631162ed92c90499a7b498b4acb6ba0bba5698e89c0f939eb50a47f7b` |
| 1,700 | 1,601–1,700 | `ce62cb9b9efe36e08cb11862aba0be477375d93c4ded13dc59a6bf5577e993fa` |
| 1,800 | 1,701–1,800 | `3dd57d7874e1225de4f71ed656f4785aaef37f5a4bef93251f8785f765ea7620` |
| 1,875 | 1,801–1,874 | `abf75b09f306a353d6dd61121170068388b9130c38ae213a9e4ed4af5029bbec` |

All 19 records are retained under review task
`codex/healer-escort-refinement-live-0e6b6dd-20260930`, marked examined after
this checkpoint was saved, and left with `completedAt: null`. Existing review
owners and timestamps were preserved. No record was marked done and no cleanup
was run.

## Analyzer report

The ignored, local-only report is
`replay_logs/replay-analysis-6abd64cbf59cc87ab9103ecd-refinement-2026-09-30.json`.
It is 351,258,141 bytes with SHA-256
`0fceede08e2eb22cf93f30082dcbb3ca879274de6777bb24bac164ca79d1c6f1`.
A repository clone does not include this report or the retained inputs required
to reproduce it.

Two analyzer runs with the same explicit fingerprint selection produced
byte-identical output. Reproduce into temporary output without overwriting the
retained report:

```sh
tmp_report=$(mktemp /tmp/healer-escort-refinement-analysis.XXXXXX.json)
node tools/replay-analysis.js 6abd64cbf59cc87ab9103ecd \
  7fb25c7877ef09adf29c8b6d26c36dcd2a5b11d9b6302fc3983089aba49001e8 \
  9f6a5777129bd24acb8666f3d3cd6a0310d74bf1d21228f9f4cec25d5417ba25 \
  49d493678f0339898b2308bb87dec30567f90222f33baf70cc3ba503dfac4607 \
  d5e68acd6ccdc303f4e950360ef837a55d44718dd871afa1bbf140932ed916ea \
  91d219f3269196665b96c64c5f813776b75e360d5296dfb807e8ce81b5cf7b8d \
  c618df316b49336a14f3c135063ef8d521428202ffe37a0fcc54dc0199d0469c \
  a412e857a3c12ae4de4fdfcdd03b1bbe84ecd346fb228c8453bb46f1f79e6b02 \
  ed8f02f97b50eb4dca0409994c11c68d1e7e5053c897d8b9e7adb0c555b9d108 \
  9193498b7265b1753907ebd9726888b6c26ace1d8d8b3c1e5d160cd12cb7cc1d \
  624f985e5560b2334c9c05f11558dd0ab13a77419a3db572cbb976be9ab031ec \
  0a03ad5708cd50a9cd3a0b70fc8c9dd482645b345b9d91cbecd5c9547dd37288 \
  73cbc329588397a0e0c0fbcee61a40b006270e824e5535f79bc3e4cbbacb6438 \
  3cf4d1740023475ed31c36dbeb1ab42ee5f1713d56379308125249ca6b7ec269 \
  f765be53f592877515c31be6df5bb606c3f9124aed17ecc56d1504cf95ff217d \
  8f13541edc0c1ec6971a3a49280ebf1dfd6fa0c0cdc4ca9d94e2073c988e4631 \
  097c9b2631162ed92c90499a7b498b4acb6ba0bba5698e89c0f939eb50a47f7b \
  ce62cb9b9efe36e08cb11862aba0be477375d93c4ded13dc59a6bf5577e993fa \
  3dd57d7874e1225de4f71ed656f4785aaef37f5a4bef93251f8785f765ea7620 \
  abf75b09f306a353d6dd61121170068388b9130c38ae213a9e4ed4af5029bbec \
  > "$tmp_report"
shasum -a 256 "$tmp_report"
```

The report contains 296,170 pass, zero fail, and 42 unknown findings. The
unknowns are exactly 28 health comparisons and 14 movement-displacement
comparisons at tick 1,874 for which tick 1,875 snapshots are unavailable. They
do not imply damage, healing, failed movement, death, or timeout.

## Escort-policy observations

The selected vulnerability flag was neutral through tick 38 and ours from tick
39 through the captured interval. All 14 owned and 14 enemy creeps were present
and healthy at both ticks 1 and 1,874; no owned injury occurs in any captured
snapshot. After flag ownership, every one of the 1,836 captured ticks is blocked
at the acquisition stage because no healthy pure melee is within range five of
a living enemy. The closest recorded pure-melee/enemy pairing is
`pg_player1_melee_1` at (50,50) and `pg_player2_melee_3` at (69,69), range 19,
at tick 70.

Consequently:

- there is no assignment, hold, escort movement, fatigue pause, release, or
  timeout event;
- remote injury beyond five, injury within five, either partner's injury, and
  other safety-release precedence are unexercised and unknown;
- no escort decision or attempt exists to compare with displacement or later
  health; and
- the absence of assignment is consistent with the documented engagement gate,
  not evidence of a release-policy defect.

Across all complete action evidence, 26,236 movement attempts have numeric
return code 0 and no actor/tick has duplicate movement attempts. No combat or
healing attempt was selected in this non-engaging, injury-free capture. These
facts validate general decision/attempt correlation and command uniqueness for
the captured baseline, but do not validate escort execution or an engine effect.
API acceptance remains scheduling evidence only.

## CPU and diagnostic volume

Every captured tick has one valid build-matching CPU sample immediately before
its version-2 closure. Tick 1 records 13,429,865 ns elapsed against the
1,000,000,000 ns first-tick limit, leaving 986,570,135 ns of sampling-point
headroom.

For the 1,873 ordinary samples using the 100,000,000 ns limit, elapsed CPU has a
minimum of 1,920,013 ns at tick 43, median 8,392,236 ns, arithmetic mean
8,524,048.886 ns, nearest-rank p95 9,639,494 ns, and maximum 21,356,638 ns at
tick 76. Minimum ordinary sampling-point headroom is 78,643,362 ns at tick 76.
No acceptance threshold is invented.

CPU is elapsed execution only through the late sampler. It excludes construction
and emission of its own record, the following closure, and later work. It is not
exact final-tick CPU or differential diagnostic overhead, and headroom is not
guaranteed final headroom. Missing tick-1,875 CPU is unknown, not zero and not
proof of a timeout.

Diagnostic volume counts every retained typed diagnostic JSON string encoded as
UTF-8 plus one LF. It excludes game-state and map records, cache framing and
wrappers, and manifest wrappers. The 19 non-overlapping responses contain
108,693 records and 40,274,123 LF-framed bytes, so captured and canonically
deduplicated totals are equal. Representative ticks are tick 1 at 59
records/24,928 bytes, tick 10 at 58/21,207, tick 100 at 58/21,407, and tick
1,874 at 58/21,607. These serialization sizes are not CPU-overhead measurements.
No runtime-error or untyped console entry was observed in the captured output;
the terminal tick and output outside these responses remain unavailable.

## First-attempt conclusion and remaining work at that point

Capture, map, build, closure, schema, action-correlation, CPU, and deterministic
analysis integrity pass for the available ticks. The match supplies no evidence
against the refinement, but it also supplies no live evidence for its changed
release predicate because no escort was acquired and no injury occurred.
Prevented damage, healing effectiveness, causality, and strategic benefit remain
unproven.

At that point, later validation still needed a current-build match that first
acquired an escort and then recorded an unrelated injury beyond five or a local
or partner injury while the pair otherwise remained eligible. The third attempt
documented below subsequently supplies the inclusive range-five local-injury
observation, but not remote-injury retention beyond five or assigned-partner
injury release. This checkpoint does not request another match or change the
enabled configuration. All evidence and claims remain retained; no done or
cleanup operation was used.

## Second attempt — replay `6abd6917f59cc86960103f32`

### Identity, integrity, and retention

Exact cached game metadata identifies bushdoctor2008 v17 against dd v5. The
game was created at `2026-09-30T19:55:03.390Z` (21:55:03.390
Europe/Budapest), is marked finished, and records winner index 0. The current
user and bushdoctor2008 code occupy index 0, so the cached API metadata supports
a Victory result. UI-displayed metadata was not supplied and remains unknown.

The response requested at tick 89 carries runtime build
`cc9d4e61eaac6962dde089593d5779d094b8ec58d1ae27c07228f136bccf1f85`
and fingerprint
`7c81e752648dd681fcad7d9b6ccdfe1e5a82c35bf4d18eb9de176459e11afccd`.
It contains snapshots and complete version-2 diagnostic closures for ticks
1–88, with no internal gap, duplicate, conflict, missing closure, or correlation
issue. Metadata reports 89 ticks, but tick 89 is absent from the response;
terminal execution, CPU, closure, state, and timeout therefore remain unknown.

The active map is
`pain_and_gain_map_2026-09-30T19-58-38-194Z.json`, with map ID and canonical
payload checksum
`4389b28c8ca571b2823b792b269362bad285c7051dc31588822b02f0e654d44f`.
The saved map is 21,376 bytes with file SHA-256
`19f458ed6ae80ef1d9250eb00ed825bc718b66b03fdb0adc4282b5e7a435e3d4`.

The record is retained under the unique task
`codex/healer-escort-refinement-attempt2-0e6b6dd-20260930`, marked examined
after this section was saved, and left with `completedAt: null`. Earlier owners
and timestamps were not changed.

The ignored, local-only analyzer report is
`replay_logs/replay-analysis-6abd6917f59cc86960103f32-refinement-attempt2-2026-09-30.json`.
It is 12,978,762 bytes with SHA-256
`b6ea9d6676b7e4ea44c6a620b6c7b7748a31f03d2fb93591b4fbbf056957d4fc`.
Two runs were byte-identical. A clone alone does not include the report or its
retained input. Reproduce without overwriting it:

```sh
tmp_report=$(mktemp /tmp/healer-escort-refinement-attempt2.XXXXXX.json)
node tools/replay-analysis.js 6abd6917f59cc86960103f32 \
  7c81e752648dd681fcad7d9b6ccdfe1e5a82c35bf4d18eb9de176459e11afccd \
  > "$tmp_report"
shasum -a 256 "$tmp_report"
```

The report contains 11,229 pass, zero fail, and 42 unknown findings. As in the
first attempt, the unknowns are exactly 28 health and 14 movement comparisons
at the final captured tick, where the next snapshot is unavailable.

### Policy observation

The selected vulnerability flag was not ours for ticks 1–43. At tick 40 an
owned pure melee was already adjacent to an enemy, but flag ownership barred
acquisition. From tick 44 through tick 88 the flag was ours, but at least one
owned creep was injured on every snapshot; tick 44 already shows seven injured
friendlies. The unchanged global acquisition injury gate therefore barred all
45 remaining ticks. There is no `healer-escort` assignment, execution, or
release record.

This attempt supports the acquisition gate's continued operation. It does not
exercise remote-injury retention, range-five local release, assigned-partner
release, escort movement, timeout, fatigue, reset, or another safety release;
all remain unknown for this replay.

All 928 recorded attempts have return code 0. There are 679 movement, 84
healing, and 165 combat attempts, with no duplicate actor/tick movement attempt
and no correlation issue. These are ordinary action records, not escort
effects.

### CPU and diagnostic volume

All 88 captured ticks contain one CPU sample. Tick 1 records 14,103,196 ns
against the 1,000,000,000 ns limit, leaving 985,896,804 ns of sampling-point
headroom. The 87 ordinary samples use the 100,000,000 ns limit: minimum
320,802 ns at tick 88, median 1,897,969 ns, arithmetic mean 2,412,542.552 ns,
nearest-rank p95 5,981,262 ns, and maximum 7,266,232 ns at tick 11. Minimum
ordinary sampling-point headroom is 92,733,768 ns at tick 11.

The response contains 3,856 retained diagnostic records and 1,417,258 UTF-8
bytes including one LF per record. Representative sizes are tick 1 at 59
records/24,928 bytes, tick 10 at 58/21,207, tick 50 at 53/19,553, and tick 88
at 7/2,584. There is no overlap, so captured and deduplicated totals are equal.
No untyped or runtime-error entry was observed in the captured response.

## Third attempt — replay `6abd6940f59cc80c91103f38`

### Identity, integrity, and retention

Exact cached game metadata identifies bushdoctor2008 v17 against MetalicaX
v12. The game was created at `2026-09-30T19:55:44.877Z` (21:55:44.877
Europe/Budapest), is marked finished, and records winner index 0. The current
user and bushdoctor2008 code occupy index 0, so the cached API metadata supports
a Victory result. UI-displayed metadata was not supplied and remains unknown.

The response requested at tick 73 carries the expected runtime build and
fingerprint
`4cc6f8c121d6d0897e3ee720785784f9e6c244f630b993617af51dc2d3ae4033`.
It contains snapshots and complete version-2 closures for ticks 1–72 with no
internal gap, duplicate, conflict, missing closure, or correlation issue.
Metadata reports 73 ticks; absent tick 73 leaves terminal execution, CPU,
closure, state, and timeout unknown.

The active map is
`pain_and_gain_map_2026-09-30T19-58-40-360Z.json`, with map ID and canonical
payload checksum
`63589e202fb8ef06e1b5db94844061d860312c4627a65dd564679831e1479df4`.
The saved map is 21,376 bytes with file SHA-256
`6b260179ffa57a80d341784d82f2d4ff50ed2295f2de0a50b91c7499bb3b1193`.

The record is retained under the unique task
`codex/healer-escort-refinement-attempt3-0e6b6dd-20260930`, marked examined
after this section was saved, and left with `completedAt: null`. Earlier owners
and timestamps were preserved.

The ignored, local-only analyzer report is
`replay_logs/replay-analysis-6abd6940f59cc80c91103f38-refinement-attempt3-2026-09-30.json`.
It is 12,231,809 bytes with SHA-256
`d718c55018ec79c7a42f03e8170b9d362093f4b41493fb715440cbefeabaaea9`.
Two runs were byte-identical. Reproduce into a temporary file:

```sh
tmp_report=$(mktemp /tmp/healer-escort-refinement-attempt3.XXXXXX.json)
node tools/replay-analysis.js 6abd6940f59cc80c91103f38 \
  4cc6f8c121d6d0897e3ee720785784f9e6c244f630b993617af51dc2d3ae4033 \
  > "$tmp_report"
shasum -a 256 "$tmp_report"
```

The report contains 10,498 pass, zero fail, and 42 unknown findings: 28 final
health comparisons and 14 final movement comparisons lacking a tick-73
snapshot.

### Assignment and range-five release

The vulnerability flag was neutral through tick 38 and ours thereafter. Ticks
39–49 were healthy but had no pure melee within five of a living enemy. At tick
50, key `50:2` assigns `pg_player1_healer_1` to
`pg_player1_melee_4` at range three. Both partners were healthy and unfatigued;
the melee was five from its nearest enemy and the healer eight from its nearest
enemy. Movement decision key `50:24` selects `escort-approach`; attempt key
`50:25` and escort execution key `50:26` record the same `moveTo` target and
return code 0. The healer moves from (52,47) at tick 50 to (52,48) at tick 51;
this is observed displacement after an accepted attempt, not proof of engine
causality.

At tick 51, the assigned partners remain healthy, unfatigued, and at range
three. A different creep, `pg_player1_ranged_5`, is injured at 1,068/1,200 hits
at (51,53), exactly Chebyshev range five from the healer. Release key `51:3`
records `friendly-injured` before movement selection. This is direct live
evidence that the refined inclusive local-injury boundary releases an otherwise
continuable escort.

Ordinary support is restored after release:

- keys `51:25`–`51:26` select and attempt one move toward the injured creep at
  range five, return code 0; the next snapshot places the healer one tile closer;
- keys `52:24`–`52:25` repeat that ordinary approach from range four, return
  code 0; and
- at range three on tick 53, healing keys `53:52`–`53:53` select and attempt
  `rangedHeal` on the injured creep, return code 0.

The target's health continues to fall across these snapshots while combat is
underway. API acceptance and later positions or health values do not prove that
movement or healing resolved, prevented damage, or caused an outcome.

No remote injury beyond five occurs while this escort is active, so the new
retention exemption remains unknown. The assigned melee becomes injured only
after the escort has already released; assigned-partner injury release is also
unexercised. Timeout, fatigue, reset, and other safety releases remain unknown.

Across the complete response there is no duplicate actor/tick movement attempt
and no correlation issue. Of 909 attempts, 908 return 0. One unrelated
tick-56 flag-fallback movement attempt has `returnCode: null`; it proves an
attempt whose numeric result was unavailable, not rejection or success.

### CPU and diagnostic volume

All 72 captured ticks contain one CPU sample. Tick 1 records 13,876,332 ns
against the 1,000,000,000 ns limit, leaving 986,123,668 ns of sampling-point
headroom. The 71 ordinary samples use the 100,000,000 ns limit: minimum
334,427 ns at tick 72, median 2,381,875 ns, arithmetic mean 2,939,175.887 ns,
nearest-rank p95 5,889,805 ns, and maximum 7,485,353 ns at tick 49. Minimum
ordinary sampling-point headroom is 92,514,647 ns at tick 49.

The response contains 3,779 retained diagnostic records and 1,391,759 UTF-8
bytes including one LF per record. Representative sizes are tick 1 at 59
records/24,928 bytes, assignment tick 50 at 60/21,745, release tick 51 at
60/21,784, and tick 72 at 7/2,774. There is no overlap, so captured and
deduplicated totals are equal. No untyped or runtime-error entry was observed in
the captured response.

## Three-attempt synthesis

The first and second attempts never acquire an escort. The third attempt
validates assignment, one accepted escort movement attempt, the inclusive
range-five release for an unrelated injury, release-before-movement ordering,
ordinary injured-ally approach, and later ordinary ranged-heal scheduling.
There are no analyzer failures or evidence-integrity contradictions in any
attempt.

The changed behavior that retains an escort for an unrelated injury beyond five
has still not been exercised live. Assigned-partner injury release under this
build is likewise unexercised. Synthetic tests remain the evidence for those
branches. Nothing here establishes exact engine effects, prevented damage,
healing effectiveness, strategic benefit, or win-rate improvement. No further
match is requested by this checkpoint.
