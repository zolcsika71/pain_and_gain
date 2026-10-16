# Combat-positioning validation — 2026-09-27

Status: A build-identified live replay shows combat approach and weapon-range holding. The available full-match Arena console shows no load or runtime errors; a terminal-tick logger entry is unverified. No improved match outcome is established.

## Candidate and API review

The committed baseline is `92d3cd1fcc5ff08180f947ef8f96e5b7d2b26739`: every owned creep receives `moveTo(flags[0])`. The working candidate chooses the nearest living enemy within linear range 5, breaking ties by ID and then input order. A functioning ATTACK part selects movement range 1; otherwise a functioning RANGED_ATTACK part selects range 3. Mixed weapons therefore seek melee range. An enemy outside weapon range gets one `moveTo(enemy)` command; a creep already within weapon range holds. An unarmed creep or one without a nearby enemy falls back to the first flag. Without a flag or combat objective, no movement is issued.

The repository API documents GameObject targets for `moveTo`, adjacency for `attack`, and range 3 for `rangedAttack`. Movement requires MOVE parts and zero fatigue; a movement call schedules an action, not guaranteed displacement. The candidate delegates navigation to `moveTo` and does not check route feasibility, fatigue, or return codes. Combat and healing still use current observed positions, with the existing healing conflicts and priorities unchanged. Holding does not imply a retreat or minimum-distance policy.

The reviewed runtime content has aggregate SHA-256 `573e4aa3a9ed89a784b64bb3a4db9c75f8962600f59fe95d336c11e111899c0f`. This hashes each sorted runtime path, a NUL, its file bytes, and a NUL, for `src/arena/{execute,observe}.js`, `src/debug/game-state.js`, `src/loop.js`, `src/main.mjs`, `src/strategy/objectives.js`, and `src/tactics/{body,combat,healing,movement,targets}.js`. Cached logs do not contain this hash or issued action results; the hash cannot establish their code provenance retrospectively.

## Sources and coverage

The empty local manifest was populated using the supported importer scan. Each response was claimed by `codex/combat-positioning-validation-20260927` before examination. The `maps` command validated saved schema and canonical checksums. JSONL output hashes and each response's map association were checked independently. Both maps contain 10,000 terrain cells and seven ScoreFlags, with no creep objects.

| Replay | Map file in `replay_logs/` | Map ID / canonical SHA-256 | Available ticks |
| --- | --- | --- | --- |
| `6ab867aee03513115f91edc0` | `pain_and_gain_map_2026-09-27T16-24-57-648Z.json` | `e14c3648b1b305f43fbed18cd1a93bedefdd46498e7c7749519f75abb4647ee2` | 1–100 and 101–105 |
| `6ab9398a22f1123ef118f173` | `pain_and_gain_map_2026-09-27T16-24-57-484Z.json` | `8f5e6311b772824de2859de552107ea786ef3269e8c364a7fd3436a8b0b3a143` | 1–100 and 101–139 |

There are no gaps, duplicate ticks, or conflicting overlaps within those intervals. All four response records have empty `otherEntries`; this confirms no separate console-error entries in the imported responses, not the unobserved terminal tick. The older replay was previously reported in README as a defeat against OoPaul壞神oO v44 at tick 106. The newer replay's opponent, result, exact source revision, and full-match console have not been independently confirmed during this review. Neither recorded interval alone proves full replay coverage. The earlier motivating replay `6ab85550e03513394c91eb0d` still has no verified map-bearing response: the importer defers it, so no map association was invented for its ticks 101–200.

## Same-snapshot decision comparison

The comparison invoked the baseline `moveCreepsToFlag` function from Git HEAD and the working production `moveCreeps`/`selectMovementTarget` functions on identical snapshots. Adapters supplied range calculation, recorded movement calls, and functioning body-part counts from `activeBodyParts`. Positions were never advanced by a simulated engine. The baseline's other imported tactical modules are unchanged between the two versions.

| Replay | Owned creep/tick samples | Baseline flag calls | Candidate flag calls | Candidate enemy-approach calls | Candidate holds |
| --- | ---: | ---: | ---: | ---: | ---: |
| `6ab867aee03513115f91edc0` | 1,204 | 1,204 | 997 | 54 | 153 |
| `6ab9398a22f1123ef118f173` | 1,821 | 1,821 | 1,724 | 27 | 70 |

These are evaluated decisions on recorded states, not measured changes in match results. Every snapshot's `selectedFlagId` equals its first flag, `pg_flag_vulnerability` at (49,49). All evaluated approaches have functioning MOVE parts and zero fatigue. Static map checks found an unoccupied, walkable neighboring tile reducing the current target range for 48/54 approaches in the older replay and 26/27 in the newer one. This local check ignores simultaneous moves, target motion, pathfinding costs, and other future actions; it does not establish that `moveTo` takes that tile.

## Concrete evidence and limits

- **Weapon access, newer replay, ticks 108–114:** owned `pg_player1_melee_1` is at (50,50) with eight ATTACK and eight MOVE parts. Its nearest enemy is at range 6 on tick 108, so the candidate falls back to the flag. On tick 109, `pg_player2_melee_1` is at (54,55), range 5: the candidate selects it while the baseline still selects (49,49). The linked map has plain, unoccupied closer cells at (50,51) and (51,51). Observed owned positions are (51,51) at tick 110, (52,52) at 111, (53,53) at 112, and (53,54) at 113. The nearest enemy is adjacent at tick 113; the candidate holds, and the observed position remains (53,54) at 114. This is behavior consistent with the candidate, without proof of the exact executed revision.
- **Ranged access, newer replay, ticks 112–114:** `pg_player1_ranged_1` goes from (48,51), nearest enemy range 5, to (49,52), nearest enemy range 3 at tick 113, then remains there at tick 114. The candidate changes from approach to hold; it cannot attack from an intended future position on tick 112. The baseline would still issue flag movement on both ticks.
- **Congestion and cutoff, newer replay, ticks 113–115:** `pg_player1_ranged_5` at (49,48) has six RANGED_ATTACK and six MOVE parts, zero fatigue, and an enemy at (54,53), range 5. The only neighboring cell that reduces that range, (50,49), is plain but occupied by `pg_player1_scout_1`. Its observed next position is (50,47); nearest enemy range becomes 6 at tick 114, so the candidate falls back to the flag. At tick 115 it is back at (49,48) with an enemy at range 5. This illustrates a possible approach/fallback oscillation; snapshots do not identify the pathfinder's reason for its step.
- **Ranged access, older replay, ticks 41–47:** `pg_player1_ranged_1` starts at (51,45) with six RANGED_ATTACK and six MOVE parts. The nearest enemy scout is at (56,49), range 5. The candidate approaches; the baseline selects the flag. The observed owned position reaches (55,50) at tick 46, where an enemy ranged creep is at range 3, and stays there at tick 47. That enemy, `pg_player2_ranged_5`, decreases from 1200 to 1140 hits over ticks 46–47. The loss establishes enemy damage, but does not attribute it to a particular attack or prove an improvement over baseline.
- **Survival cost, newer replay:** the owned army has 14 creeps and 16,200 hits at tick 100, then one creep and 101 hits at tick 139. `pg_player1_melee_1` falls from 1442 hits at tick 113 to 386 at 114 and is absent at 115. Enemy `pg_player2_melee_1` falls from 1600 to 1390 over ticks 113–114. These observations show combat exposure, not a winning strategy. Unarmed healers keep following the flag while armed creeps approach; separation and lost flag pressure remain policy tradeoffs.

The older map has 6,275 plain, 3,317 wall, and 408 swamp cells; the newer has 6,448 plain, 3,139 wall, and 413 swamp cells. Their seven flag positions agree, but their terrain differs, so the maps are not interchangeable. The highlighted approach tiles are plain. Target ranking is by linear range and does not compare terrain route length: walls, congestion, and swamp detours can still prevent or delay access elsewhere.

## Verification and completion gate

Focused tests cover weapon boundaries, functioning/destroyed weapons, mixed weapons, nearest-target and ID ties, inclusive diagonal engagement range 5 versus fallback at 6, absent flags, and at most one movement call. The real tick-flow test covers combat movement, first-flag fallback, logging order, and unchanged compatible attacks/healing. Unit tests do not exercise Arena pathfinding.

`npm run check` and all 36 tests passed in both the working tree and an isolated export of the staged candidate. Staged and working-tree whitespace checks passed. No runtime implementation correction was needed; the additional test closes the exact five-tile cutoff coverage gap.

A new live match must confirm the selected project `src/` directory, changed approach/hold behavior, and no runtime errors with the current-tick-only console filter off. Record its replay ID and code provenance. Arena automation initially exposed the Fame page, then failed before a fresh match could be confirmed. A later check confirmed the selected `src/` directory but could not activate Rating; no new match evidence was obtained. No code correctness blocker was found in the reviewed movement selector; runtime validation was required before committing, but the code was later committed without evidence that this gate had passed. The four examined captures were subsequently completed and cleaned up after their findings were preserved in the [map-linked replay review](replay-review-2026-09-27.md) and [ADR 0003](../decisions/0003-replay-informed-strategy-proposals.md). Both saved maps and the replay associations' retired fingerprints remain; log-review completion does not waive the live gate.

Response fingerprints retained for reproducibility:

- Older replay, ticks 1–100: `8d7b83bb1b3a5042dbf308835e23400006b7c366939d7a566a65477224a98217`.
- Older replay, ticks 101–105: `eca5add01cd3e83dcd0d59f3795e4b1a66697791be05078840c3e5ad4001676d`.
- Newer replay, ticks 1–100: `98839b23dfe615acbcd1c731bbd29b6aec2a9275b98ff096beb66e48c37ef97b`.
- Newer replay, ticks 101–139: `f3078331ebfa562f3e9d6bdb3ccfdfaaadda7b31565bfbef8a8fdc03998ef6c6`.

## Additional replay check: `6ab963a6fa7e227bfcc9abf8`

The four manifest-managed responses for this replay were reviewed together, not as a single selected chunk. They contain one pre-action `game-state` snapshot for every observed tick from 1 through 400, with no gaps, duplicate ticks, or `otherEntries` in these responses. This is available response coverage, not evidence that the match ended at tick 400 or that its entire console was captured. All four records explicitly link to `pain_and_gain_map_2026-09-27T19-07-10-572Z.json`. The map's embedded checksum, manifest checksum/map ID, and independently recalculated canonical payload SHA-256 all equal `cacee4417e874317833775f4df15ea990c6657f41dc7f99fb4c44dfa6f8494e3`. The seven static flag fields in every snapshot match that map.

| Observed ticks | Managed JSONL | Response fingerprint |
| --- | --- | --- |
| 1–100 | `6ab963a6fa7e227bfcc9abf8.jsonl` | `75abc47d94d105c5cff9985df626c8c03ffdb2c931c94b1b683999e749b7d142` |
| 101–200 | `6ab963a6fa7e227bfcc9abf8-ad6e4427faaf.jsonl` | `ad6e4427faaff35c53d43d58589a481a8c5b404e4ae74bb0b3a10c8d2fcec68d` |
| 201–300 | `6ab963a6fa7e227bfcc9abf8-5a7a118ad0d9.jsonl` | `5a7a118ad0d972f7aaab200d39c0608734071e6d519e2c3b0a4932eb8df53ed4` |
| 301–400 | `6ab963a6fa7e227bfcc9abf8-2efad62839fd.jsonl` | `2efad62839fd14fc6dab27a2f3b6d131ba2420ac604226639159702a86562160` |

The controlled side is `pg_player2_*` (`my: true` in the snapshots). Replaying the production `selectMovementTarget` on all 5,600 owned creep/tick snapshots (1,400 per chunk) selects the first flag every time: zero enemy-approach decisions and zero in-range holds. The nearest enemy to any armed owned creep is at linear range 35 at its closest, on tick 41; in ticks 101–400 the minimum is 36. These distances never exercise the candidate's five-tile engagement cutoff or its weapon-range hold behavior. The committed first-flag baseline makes the same target choice on every recorded state, so this replay cannot distinguish the candidate from the baseline or close the combat-movement live gate.

The selected flag is `pg_flag_vulnerability` at (49,49) on every observed tick. It is neutral at tick 1, first recorded as ours at tick 39, and remains ours through tick 400. All 14 owned and 14 enemy creeps remain present at full aggregate health (16,200 per side) in every snapshot. These are observations before actions; the JSONL does not record issued `moveTo` targets, return codes, the loaded source revision or code directory, the match result, or later ticks.

After this evidence was saved, both task claims on each of the four records (`codex/replay-import-verification-20260927` and `codex/movement-validation-20260927`) had examination checkpoints and were explicitly completed with the supported `done` command. The utility verified the managed hashes and removed the four JSONL files and records. The validated map, active replay association, and four retired fingerprints remain in the manifest. This review cleanup does not close the live combat-movement gate.

## Current live-validation attempt

The Arena overview showed the selected code directory as `/Users/zoltanka/Documents/Prog/JavaScript/ScreepsArena/pain_and_gain/src`. The working runtime files have the same aggregate SHA-256 recorded above (`573e4aa3a9ed89a784b64bb3a4db9c75f8962600f59fe95d336c11e111899c0f`), and the source files have no unstaged differences from the staged candidate. This establishes the local selection and file correspondence at inspection time, but no new match was launched to prove which code revision Arena loaded.

The native Arena interface exposed Test Mode with only an `Idle opponent` test game, which cannot exercise the combat branch. During further navigation, its accessibility state changed while its screenshot remained on an older Fame screen, and one action returned `noWindowsAvailable`. No new replay was confirmed during that attempt. At that point the live validation verdict remained **inconclusive**. The two previously imported combat replays assessed below add behavior evidence, but still do not establish match-specific code provenance. This evidence did not satisfy the pre-commit validation requirement; the subsequent commit does not change that assessment.

For a manual follow-up, keep Pain and Gain Basic level pointed at this project's `src/` directory and record that directory and the runtime hash above immediately before launching. Use Rating if it is available, or a Test Mode opponent whose prior game visibly approached the center; the currently listed Idle test is unsuitable. Play through an engagement, record the new replay ID, open its replay, turn off **Show current tick only**, and check the console for load and runtime errors. From the project root, run `node tools/replay-logs.js scan`, then `list` and `maps`. Confirm the new chunks have a replay-specific validated map; claim each managed capture before reading it. Inspect consecutive pre-action snapshots for an armed owned creep at enemy range 4–5 moving toward that enemy and later remaining in weapon range (1 for ATTACK, 3 for RANGED_ATTACK), preferably where the first flag lies in another direction. Record the creep and enemy IDs, coordinates, ticks, functioning parts, fatigue, coverage gaps, and other console entries. Positions support an inference about movement; only an explicit action log or equivalent direct evidence would prove the issued command. A win is not required.

## Remaining imported combat replays

Both remaining replay IDs had manifest-managed JSONL files and active replay-specific map associations. Before examination, each record was claimed for `codex/remaining-movement-replays-20260927`. File bytes matched their manifest output SHA-256 values. The `maps` command checked saved schema, and independent canonical payload hashing confirmed that each map's embedded checksum, registered checksum, and map ID agree. Every recorded flag's static ID, position, effect, and score rate matches its associated map. Neither map was inferred from filename proximity.

| Replay | Controlled side | Managed JSONL / observed ticks | Validated map / checksum |
| --- | --- | --- | --- |
| `6ab96679fa7e228fc9c9acd4` | `pg_player2_*` | `6ab96679fa7e228fc9c9acd4.jsonl`, 1–58 | `pain_and_gain_map_2026-09-27T19-07-10-723Z.json` / `fb18556023ee13fa16e0ede86be462fc1fe5f7ac299b69a6d09d9d1255605367` |
| `6ab9624dfa7e224005c9ab9e` | `pg_player1_*` | `6ab9624dfa7e224005c9ab9e.jsonl`, 1–100; `6ab9624dfa7e224005c9ab9e-04f8a8ae90df.jsonl`, 101–137 | `pain_and_gain_map_2026-09-27T19-07-10-852Z.json` / `c0620cc8b4e302ad542f31f788b2c6bc9a2aea4656a5c6f05a02e0124309c8cc` |

Within each available range, ticks are consecutive, without duplicates or overlap. The cache requests for the final chunks were for ticks 59 and 138, but their JSONL ends at 58 and 137. Neither range proves complete-match coverage or a terminal action. All three manifest records have zero `otherEntries`, so no separate console-error entries were captured in these responses; the full replay console, load errors outside these responses, and exact source revision are not established. No snapshot or manifest field contains the running source hash.

The same-snapshot comparison used the production `selectMovementTarget` with logged functioning parts and linear range. The committed baseline always targets the first flag. These counts describe selector outputs on recorded states, not observed commands or simulated future positions:

| Replay / ticks | Owned creep/tick samples | Baseline flag targets | Candidate flag targets | Candidate enemy approaches | Candidate holds |
| --- | ---: | ---: | ---: | ---: | ---: |
| `6ab96679fa7e228fc9c9acd4`, 1–58 | 812 | 812 | 618 | 44 | 150 |
| `6ab9624dfa7e224005c9ab9e`, 1–100 | 1,400 | 1,400 | 1,391 | 5 | 4 |
| `6ab9624dfa7e224005c9ab9e`, 101–137 | 383 | 383 | 255 | 46 | 82 |

Concrete consecutive-snapshot observations:

- In `6ab96679fa7e228fc9c9acd4`, owned `pg_player2_melee_3` is at (53,51) on tick 36, with eight functioning ATTACK and MOVE parts, zero fatigue, and `pg_player1_ranged_5` at (50,47), range 4. Its next observed positions are (52,50) at tick 37 and (51,49) at tick 38, when its nearest enemy `pg_player1_ranged_3` is adjacent at (50,48). It stays at (51,49) on tick 39. At tick 38, (50,49) is a walkable, unoccupied neighbor closer to the first flag (49,49); staying is consistent with the candidate's melee hold and differs from its baseline objective. The target changes between snapshots, and no issued action or pathfinder result was logged.
- In the same replay, owned `pg_player2_ranged_4` is at (50,51) on tick 36, with six functioning RANGED_ATTACK and MOVE parts and zero fatigue. `pg_player1_ranged_4` is at (48,47), range 4. The owned creep appears at (49,50) on tick 37, when the enemy is at (48,48), range 2, and remains at (49,50) on tick 38. On tick 37 the flag cell (49,49) is walkable and unoccupied. The approach and hold are consistent with the candidate, though approach and flag movement have similar directions here.
- In `6ab9624dfa7e224005c9ab9e`, owned `pg_player1_ranged_3` has six functioning RANGED_ATTACK and MOVE parts and zero fatigue at tick 96. It is at (49,51), five tiles from `pg_player2_melee_1` at (53,56), then moves to (50,52) at tick 97 (range 4 to that enemy) and (51,53) at tick 98 (range 3 to the enemy now at (52,56)). Its distance from the first flag (49,49) rises from 2 to 3 to 4. It stays at (51,53) through ticks 99–101 while within ranged-attack distance; at tick 98, multiple walkable, unoccupied neighboring cells lead closer to the flag. The movement away from the baseline's flag target, followed by holding at weapon range, strongly supports candidate-like behavior. It does not prove the exact code or issued commands.
- Across the chunk boundary in that replay, owned `pg_player1_melee_3` is at (48,50) on tick 101, five tiles from `pg_player2_melee_1` at (53,55). It moves to (49,51) at 102, (50,52) at 103, and (50,53) at 104, when the enemy is adjacent at (51,54). It stays at (50,53) on tick 105 despite several walkable, unoccupied cells toward the first flag. Its flag distance rises from 1 to 4. This is another candidate-like approach and melee hold that a flag-only target does not explain well.

Across consecutive snapshots where the creep survives, candidate-evaluated holds remain stationary in 143/143 cases for the first replay and 86/86 for the second. For evaluated enemy approaches, 30/42 and 39/51 next positions respectively reduce range to the target's *previous* position; pathfinding, moving targets, congestion, and simultaneous actions explain why this is not an action-success rate. In the second replay, 36/51 approach transitions increase distance from the first flag. These comparisons are observations plus selector evaluation, not causal attribution to a particular `moveTo` call.

**Gate verdict: inconclusive.** Both replays exercise the candidate's combat branch on recorded states, and the second provides strong movement evidence distinguishable from the flag-only baseline. They do not establish that this exact revision and selected code directory were loaded for either match. The zero `otherEntries` cover only imported responses. A contemporaneous record of code-directory selection and runtime revision for either match, or another match with those recorded plus combat-range snapshots and console-error inspection, is still needed to assess live validation. A win or improved result is not required.

After these findings were saved, both the prior import-verification claim and this analysis claim were explicitly marked `done` for each of the three records. The utility removed their managed JSONL files and records after hash-checked cleanup. The two validated map files and active replay associations remain, with one and two retired fingerprints respectively. No other review owner was present or completed on their behalf; review cleanup does not change the inconclusive movement gate.

## New live-match pre-launch checkpoint — 2026-09-27 20:53 UTC

The current branch is `main` at committed and pushed HEAD `5a5ffe299e803b9e60403ff1c21907c9581337ea`; the working tree was clean before this documentation update. The aggregate SHA-256 of the same sorted runtime-path/NUL/file-bytes/NUL sequence specified above is `573e4aa3a9ed89a784b64bb3a4db9c75f8962600f59fe95d336c11e111899c0f`, matching the earlier reviewed content. `git diff HEAD -- src` was empty. This is a pre-launch file baseline, not proof of which revision a future match loads.

Direct Arena accessibility output on the Pain and Gain Basic level page displayed the selected code-directory button as `/Users/zoltanka/Documents/Prog/JavaScript/ScreepsArena/pain_and_gain/src`. The UI exposed only an `Idle opponent` under Test games. Coordinate clicks returned `noWindowsAvailable`, and screenshots lagged the accessibility navigation, so no combat-capable match was launched or replay ID obtained in this attempt. The directory selection was observed before launch, but it must be reconfirmed by the person launching the match; no post-match fingerprint or console evidence exists yet.

**Current live-validation verdict: inconclusive.** The movement code is already committed; this checkpoint does not retroactively establish its live behavior. To continue manually, first confirm the same selected `src/` path and leave all runtime files unchanged. Start a Rating match if available, or a non-Idle Test opponent known to approach the center; verify actual engagement rather than assuming a mode guarantees it. Record the start time, opponent, and resulting replay ID. After completion, open Replay, turn off **Show current tick only**, and preserve the full available console output (including non-JSON entries, load/runtime errors, and its visible tick limits). Do not infer error-free execution from imported game-state JSONL alone. Send the replay ID and console evidence for import with `scan`, `list`, and `maps`; each managed chunk must be claimed before examination. Recalculate the runtime fingerprint after the match and compare it to this baseline. Inspect consecutive, map-linked snapshots for armed owned creeps approaching an enemy from range 4–5 and then holding at range 1 for ATTACK or 3 for RANGED_ATTACK, preferably where flag-only movement would differ. Record creep/enemy IDs, positions, functioning parts, fatigue, observed tick gaps, and whether movement commands were explicitly logged or merely inferred. Save those findings here before any review cleanup. A win is not required.

## Recovered cache evidence after the 20:53 UTC checkpoint

`node tools/replay-logs.js scan` imported 19 responses for one previously unregistered replay, `6ab984896fdfd1c3327094b8`. The game-metadata cache response at `Cache/Cache_Data/7f3859689f932303_0` names bushdoctor2008 and Dr Neir, records creation at **2026-09-27 21:03:05.109 UTC**, and reports a finished match with 1,852 ticks and winner index 1. It does not explicitly identify Fame or Rating mode, map that winner index to a named player here, or contain the loaded source hash. This server game time, not the later map-import timestamp, makes the replay a plausible match after the 20:53 checkpoint. It was the only newly imported replay; 105 older cache responses were deferred because they lack validated replay-specific maps.

The following paths are relative to project `replay_logs/` for JSONL and to `/Users/zoltanka/Library/Application Support/screeps_arena/Cache/Cache_Data/` for raw cache responses. The manifest records the full source paths and fingerprints. Each managed response was claimed by `codex/recover-live-movement-20260927` before examination.

| Observed ticks | Managed JSONL file | Raw cache response file |
| --- | --- | --- |
| 1–100 | `6ab984896fdfd1c3327094b8.jsonl` | `f7875c135183541a_0` |
| 101–200 | `6ab984896fdfd1c3327094b8-cd7816ef16c9.jsonl` | `b618e5f62b530341_0` |
| 201–300 | `6ab984896fdfd1c3327094b8-2d60ec210e06.jsonl` | `0d1baadb3a29df0d_0` |
| 301–400 | `6ab984896fdfd1c3327094b8-7466345246d9.jsonl` | `0e0803cfdd9d2c8f_0` |
| 401–500 | `6ab984896fdfd1c3327094b8-1de794cb2460.jsonl` | `58b96d11359c789a_0` |
| 501–600 | `6ab984896fdfd1c3327094b8-22caf46e4f68.jsonl` | `29911028e8eec4db_0` |
| 601–700 | `6ab984896fdfd1c3327094b8-07b6347d2897.jsonl` | `aaef012e0f767228_0` |
| 701–800 | `6ab984896fdfd1c3327094b8-764735da219a.jsonl` | `8c69fc72b28c4ffb_0` |
| 801–900 | `6ab984896fdfd1c3327094b8-e0c0fd2442de.jsonl` | `90c7db7005362739_0` |
| 901–1000 | `6ab984896fdfd1c3327094b8-f2401fea8cb2.jsonl` | `7a086b91f20958ed_0` |
| 1001–1100 | `6ab984896fdfd1c3327094b8-6f1ae4ce4f3f.jsonl` | `7f5f5110c9a9772b_0` |
| 1101–1200 | `6ab984896fdfd1c3327094b8-873ac55e07da.jsonl` | `057476b2b1f133e4_0` |
| 1201–1300 | `6ab984896fdfd1c3327094b8-272b04eadc2a.jsonl` | `4e61e9a104f6611c_0` |
| 1301–1400 | `6ab984896fdfd1c3327094b8-2bc52e53bb52.jsonl` | `e0716cdd3289c9a1_0` |
| 1401–1500 | `6ab984896fdfd1c3327094b8-84553a0d1432.jsonl` | `0726f1a2a461823a_0` |
| 1501–1600 | `6ab984896fdfd1c3327094b8-20e1411ac8df.jsonl` | `a06bc54d9618c3d1_0` |
| 1601–1700 | `6ab984896fdfd1c3327094b8-11f6635c00a5.jsonl` | `8963299bdb20ef99_0` |
| 1701–1800 | `6ab984896fdfd1c3327094b8-ad6854588de2.jsonl` | `e2cfcd1908860864_0` |
| 1801–1851 | `6ab984896fdfd1c3327094b8-74b0eccac152.jsonl` | `50e8bc2a07871bd0_0` |

All 19 cache frames identify this replay in their request keys. Re-parsing each preserved raw response matched its manifest fingerprint and exact filtered JSONL bytes. Together they contain 1,851 `game-state` entries, one `map-state`, and zero other console entries, with no duplicate or missing ticks from 1–1851. The last request names tick 1852 but returns through 1851; this does not establish a missing loop call. These cached responses are available raw console evidence, **not a full-match console export**: errors outside them or in an uncached response remain unknown. No runtime-error text was found in these 19 responses.

All records explicitly link to `replay_logs/pain_and_gain_map_2026-09-27T21-08-51-905Z.json`. Its 10,000 terrain cells and seven non-creep ScoreFlags pass the saved-map schema. The embedded checksum, manifest checksum and independently recalculated canonical payload SHA-256 all equal `a91ff4e9cc139da93baa9dcf5f1a56963dd7aedc7c7ff3d6bc48446bc05c1e0b`. The filename timestamp is an import time and was not used to date the match.

On all 25,914 owned creep/tick snapshots, the production `selectMovementTarget` evaluated with logged functioning parts returns 79 enemy approaches, 70 in-range holds and 25,765 first-flag fallbacks. Those counts are decisions on recorded states, not issued-command counts. The selected flag is `pg_flag_vulnerability` at (49,49) throughout. At ticks 1–3, unarmed `pg_player2_scout_1` moves from (86,89) to (85,88) to (84,87), reducing range to the flag from 40 to 38 while enemies are distant; this is consistent with the fallback.

At tick 38, owned `pg_player2_ranged_4` stands on that flag at (49,49), has six functioning RANGED_ATTACK and six MOVE parts, zero fatigue, and sees `pg_player1_melee_1` at (48,44), range 5. At tick 39 it is at (48,48), one tile **away** from the flag and range 3 from that enemy at (49,45). It remains at (48,48) through tick 42 while the enemy stays within range 2–3. This is strong observed approach-and-hold evidence consistent with the movement candidate and unlike an unconditional flag objective, but the snapshots do not log the issued `moveTo` or its return code. Owned `pg_player2_melee_4` is at (52,49) on tick 38, range 5 from the same enemy, reaches (50,47) by tick 40 when the enemy is adjacent, and remains there through tick 42 with functioning ATTACK parts. Its movement and hold also fit the candidate, though enemy motion contributes to the shrinking range.

The current runtime SHA-256 remains `573e4aa3a9ed89a784b64bb3a4db9c75f8962600f59fe95d336c11e111899c0f`, identical to the 20:53 pre-launch checkpoint, and `git diff HEAD -- src` is empty. The earlier UI observation selected this project’s `src/` directory, and the game-metadata creation time follows that observation. Matching local hashes **now** do not independently prove which directory or code revision Arena loaded when the match ran; neither the game metadata nor the console snapshots carries that fingerprint.

**Recovered-evidence verdict: inconclusive for exact-revision live validation.** Observed combat approach, weapon-range holding, and first-flag fallback are consistent with the candidate; no error appears in the 19 cached console responses. The loaded-code provenance and complete replay-console coverage remain unverified. This review task recorded an `examined` checkpoint for each of the 19 captures. All managed JSONL files, raw cache responses, the map, manifest records and active claims remain preserved; no `done` or cleanup command was invoked.

## Build-identified follow-up — implementation, not yet a live result

The runtime logger now emits `buildId` in its pre-action map and game-state console entries. Local `tools/build-id.js` generates `src/debug/build-id.js`; `npm run build-id:check` verifies that artifact without changing it. SHA-256 covers every regular `.js`/`.mjs` file recursively under `src/`, except the generated artifact and `src/typings/`, in sorted project-relative POSIX path order. Each path is followed by NUL, exact file bytes, and NUL. The importer saves the ID on each tagged response record and the replay association, and reports conflicts. Untagged older records—including the 19 chunks above—retain unknown exact code provenance; matching the current local hash to an earlier checkpoint cannot backfill it.

After the final source edit, run `npm run build-id:generate` and `npm run build-id:check`. Immediately before a combat-capable match, confirm Arena's selected code directory is `/Users/zoltanka/Documents/Prog/JavaScript/ScreepsArena/pain_and_gain/src` and keep the runtime files unchanged until the match ends. The generator and check do not control manual Arena launch. Import the new replay, compare its emitted ID and per-response manifest IDs with the verified pre-launch value, and examine approach/hold snapshots and full available console errors separately. An ID match establishes source-byte provenance for logged code; it alone neither proves the movement command executed nor that the full console is error-free.

The locally generated and checked candidate ID is `e4722378055c83bb4aaca4d108245637ff5a7d016a73ffe4c438c3dd0171d2b8`. The Arena Fame page was visible, but its Back control failed with `elementHasNoFrame` and the coordinate retry returned `noWindowsAvailable`. Neither the selected directory nor a new launch was confirmed in this attempt. No new build-identified live replay has been observed; the live combat and console gate remains **inconclusive** pending a manual combat-capable match and its replay evidence.

## Build-identified live replay: `6ab98eb76fdfd14ddb7096b2`

This later replay supplies the build-identified match missing at the checkpoint above. The user reported verifying `e4722378055c83bb4aaca4d108245637ff5a7d016a73ffe4c438c3dd0171d2b8` before launch; `npm run build-id:check` returned that same value again during this review without regenerating the artifact. The sole cached log response, `Cache_Data/337a02d08b42a823_0` (request `/log/97`), contains one `map-state` at tick 1 and 96 `game-state` entries at ticks 1–96. Every state entry has that build ID. The original game-state strings exactly match `replay_logs/6ab98eb76fdfd14ddb7096b2.jsonl`; its output SHA-256 is `7a80e2b3f558333075c6db92aed57db6b2118acb46a4c6d4a8ac8650854e037d`, and the raw-response fingerprint is `1587356bdec74b6577293fe9e3864d7282a1891176db221b5468e4e1c78437ce`, both matching the manifest. The manifest response record and active replay association carry the same build ID. This **passes build-ID propagation** for the available response. The ID plus the reported pre-launch check supports source-byte provenance, but is not an independent observation of the selected code directory or an attestation of every issued action.

The replay association links to `replay_logs/pain_and_gain_map_2026-09-27T21-47-28-327Z.json`, not to a map inferred from filename proximity. Its embedded checksum, manifest registration/map ID, record checksum, and independently recalculated canonical payload SHA-256 all equal `1e32edfc4b6c121bf23c6de47ff97dcdac366c39f41c441f18c58e8b6e097b93`. The map has all 10,000 terrain cells and seven ScoreFlags, whose static fields match tick 1; it has no creep objects. The controlled side is `pg_player1_*` (`my: true` on its creeps). The selected first flag is `pg_flag_vulnerability` at (49,49) on every available tick.

Consecutive pre-action positions support the combat policy:

- **Melee approach and hold, ticks 36–44:** owned `pg_player1_melee_3` has eight functioning ATTACK and MOVE parts and zero fatigue at tick 36. It goes from (45,47), range 4 to `pg_player2_ranged_4` at (49,51), to (46,48) at tick 37 (range 2), then (47,49) at tick 38 (range 1). It remains there at tick 39 while that enemy moves out to range 2. At tick 40 it is (48,50), range 2 from `pg_player2_healer_3` at (50,52); by tick 41 it is (49,51), adjacent to that healer at (50,51). This step increases its distance from the first flag from 1 to 2, unlike simple flag pursuit. It stays at (49,51) through tick 44 with functioning ATTACK parts and nearby enemies at range 1.
- **Ranged approach and hold, ticks 39–42:** owned `pg_player1_ranged_1`, with six functioning RANGED_ATTACK and MOVE parts and zero fatigue, is (47,43) at tick 39, range 5 from `pg_player2_melee_3` at (50,48). It moves to (48,44) at tick 40, range 3 from the enemy now at (49,47), and remains (48,44) through tick 42 while that enemy stays at range 3. The first flag remains five tiles away; the map cell (49,45) toward it is plain and unoccupied in those snapshots.
- **Flag fallback, ticks 1–3:** unarmed owned `pg_player1_scout_1` moves (12,9) → (13,10) → (14,11), reducing range to the first flag from 40 to 38 while enemies are distant.

Applying the production `selectMovementTarget` to logged positions and functioning part counts yields 47 enemy-approach selections, 145 in-range holds, and 723 flag fallbacks across 915 living-owned creep/tick samples. These are **selector evaluations on recorded states**, not logged `moveTo` calls or simulated match outcomes. The observed approach, away-from-flag step, in-range stillness, and fallback **pass the behavioral observation check** as consistent with the candidate; the exact issued commands and pathfinder results remain unobserved.

The cached game-metadata response `Cache_Data/9f18acdbda502a71_0` reports creation at **2026-09-27 21:46:31.344 UTC**, finished status, 97 ticks, and winner index 0; this server match time is distinct from the later map-import timestamp. The single available raw log response has consecutive ticks 1–96 without gaps or duplicates, one map entry, and no other console entries or error text. A log request for tick 97 ending at snapshot 96 does not itself establish a missing terminal loop call.

The existing replay was then inspected in the Arena UI at **tick 97/97** with **Show current tick only** visibly off. The full available Console table lists indexed tick rows **1–96** (the tick-1 row joins the map and game-state calls), with no separate load, runtime-error, or other non-state row. This agrees with the preserved raw `/log/97` response: one `map-state`, 96 `game-state` calls, and zero other entries. The UI console was inspected, not exported; its long JSON descriptions are visually clipped, so the raw cached response supplies their complete text. **Build-ID propagation: passed. Behavioral observation of combat approach, weapon-range holds, and flag fallback: passed. Available full-match console error check: passed—no errors observed in the displayed rows or raw response.** There is no console entry for terminal tick 97 in either source; whether the loop ran or emitted a log then remains unverified, not a demonstrated failure. The emitted matching build ID identifies the logged runtime source; independent directory-selection observation is supplementary, not a reason to invalidate that check. **Overall live runtime-validation gate: passed for the observed candidate behavior and available console.** Issued movement commands, terminal-tick logging, and any strategic improvement remain unproven; no win-rate claim follows from the reported winner index or this one match.

The managed JSONL was claimed and marked `examined` under `codex/validate-build-movement-20260927`. It remains at status `claim`; no `done` or cleanup command was issued, and the capture, map, association, and fingerprint remain available.

## One-tick engagement-boundary candidate — 2026-09-28

The stateless movement selector in the pushed build selects an enemy at range five and the first flag at range six. This decision switch is certain from the code, but the earlier `6ab9398a22f1123ef118f173` capture has been cleaned up after review. Its saved findings record `pg_player1_ranged_5` at (49,48) on tick 113 with a ranged weapon and an enemy at (54,53), range five; the creep is (50,47) at tick 114 with its nearest enemy outside five, then (49,48) at tick 115 with an enemy at five. The only immediately range-reducing neighbor on tick 113 was occupied by an owned scout. The positions do **not** prove that cutoff switching caused its step, identify a continued target across all three ticks, or reveal issued `moveTo` commands. Congestion remains a plausible alternative explanation.

The local candidate preserves nearest-living-enemy and ID tie-breaking inside range five. Only when no living enemy is inside that window does it retain the previously selected enemy for **one** tick at exactly range six. It releases on a second consecutive outside tick, range seven or more, disappearance/death of that enemy, or loss of all functioning weapons; it can then reacquire the nearest enemy inside five or fall back to the first flag. An in-range combatant still holds at melee range one or ranged range three (mixed weapons seek melee range), attacks and healing still use current positions, and each creep receives at most one movement command. Per-creep retention resets when the match tick counter restarts. This is a bounded boundary grace, not general target locking or path-aware navigation.

On a **synthetic** same-enemy range sequence 5 → 6 → 5 with no other local enemy, the production stateless baseline selects enemy → flag → enemy (two objective switches), while the candidate selects enemy on all three ticks (zero switches). Neither sequence contains a target inside ranged-attack distance three, so this scenario establishes no additional time in weapon range. It does not simulate pathfinding or a match result.

For an available recorded comparison, `6ab98eb76fdfd14ddb7096b2.jsonl` was claimed for `codex/stable-combat-targeting-20260928`, read, and marked `examined`, leaving its prior claim, capture and map intact. Running the baseline selector and candidate decision function on the same 915 living-owned creep/tick states over ticks 1–96 found **zero different movement targets**. The recorded positions contain 145 owned armed creep/tick opportunities with an enemy inside the functioning weapon's range; that observed count is necessarily the same for both decision evaluations because positions were not simulated forward. This replay does not exercise the new one-tick grace and was emitted by the **previous** build, so it cannot validate the candidate live.

Local `npm run build-id:check`, `npm run check`, 54 tests, and `git diff --check` pass after generating candidate build ID `6821c92a0a75f80be21e5c66d77242d6b3166e0a7da65b4d6773ef8739eedd52`. Focused tests cover retention and bounded release, nearest-target precedence, target loss, destroyed weapons, weapon-range holding, match reset, and no competing flag/combat movement. The prior live result with ID `e4722378055c83bb4aaca4d108245637ff5a7d016a73ffe4c438c3dd0171d2b8` does not validate these changed bytes. **Candidate live behavior and console verification: pending.** Arena remained on the old replay when its Back link was activated, so no new match or console was observed. The manual handoff is to confirm this project's `src/` directory in Pain and Gain, run `npm run build-id:check` without regenerating, use **Fame → Play** with the runtime files unchanged, and leave the new completed replay open. Import it with the existing replay utility, confirm the emitted build ID and map association, examine any range-5 → range-6 engagement where the same enemy remains visible, and inspect the full available console with **Show current tick only** off. A match without that boundary event may establish runtime compatibility but not the grace's live effect; a win alone establishes neither.

## Candidate-build live replay: `6ab995f16fdfd118847097eb`

The user reported a pre-launch build-ID check, selection of this project's `src/`, a new Fame match, and a replay scan. The manifest identifies one new response for replay `6ab995f16fdfd118847097eb`, not merely the newest file by import time: `replay_logs/6ab995f16fdfd118847097eb.jsonl`, ticks **1–79**, 79 unique consecutive `game-state` records, no gaps or duplicates. Its source is `Cache_Data/5c88de63e2bd294d_0`, request `/log/80`. The separate cached game-metadata response `Cache_Data/ef4a12b9516baf7e_0` reports a finished **80-tick** match created at **2026-09-27 22:17:21.284 UTC**, lists bushdoctor2008 and OoPaul壞神oO, and reports winner index 0. The Arena Fame page displayed an OoPaul壞神oO v28 replay card; the winner index was not independently mapped to a named player. Import time was not used as match time. No other chunk for this replay is registered.

The raw `/log/80` response contains one `map-state` call at tick 1 and 79 `game-state` calls at ticks 1–79, with no other entries. **Every raw state call**, the exact original JSONL lines, the response manifest record, and the replay association carry build ID `6821c92a0a75f80be21e5c66d77242d6b3166e0a7da65b4d6773ef8739eedd52`. `npm run build-id:check` returned the same value without regeneration. The raw-response fingerprint `5bae9aa697d029434983d91aed367f91eb9e26be2eced341a529e9659e6ace5a` and saved JSONL SHA-256 `337b93b897ffedaab8177daf3d7d570be43dd44e45789fd46adf0463424eb205` match the manifest. **Build-identity propagation: passed** for the available response; the user's pre-launch directory confirmation is supplementary launch evidence, not a substitute for the emitted ID.

The manifest explicitly associates this replay and response with `replay_logs/pain_and_gain_map_2026-09-27T22-18-22-644Z.json`. Its embedded, registered, response-linked, and independently recalculated canonical payload checksum all equal `827900f1905582177b3732a094b82ebc9022492aa1da97bb7068210c5922920e`. The saved payload has 10,000 terrain cells, seven ScoreFlags, and no creeps. This map was resolved by replay association, not filename proximity.

The controlled side is `pg_player1_*` (`my: true`). At tick 38, `pg_player1_ranged_5` is at (49,48) with six functioning RANGED_ATTACK and MOVE parts, zero fatigue, and two tied nearest enemies at range five: `pg_player2_ranged_4` at (51,53) and `pg_player2_ranged_5` at (50,53). The production selector chooses the first by ID. At tick 39 the owned creep is observed at (50,49), with `pg_player2_ranged_4` at (50,52), range three; it remains at (50,49) through tick 43 while enemies remain within ranged weapon range. At tick 40, `pg_player2_melee_1` at (49,52) and `pg_player2_ranged_4` at (50,52) are both range three; the selector's ID tie-break chooses the melee target rather than retaining the old one. These are **observed positions plus reconstructed selector decisions**, not logged commands or proof that a particular `moveTo` caused the displacement. Unarmed `pg_player1_scout_1` moves (12,9) → (13,10) → (14,11) over ticks 1–3, consistent with first-flag fallback toward (49,49).

Across all **921** living-owned creep/tick states, invoking the production candidate on the recorded positions yields 21 enemy approaches, 112 in-weapon-range holds, and 788 first-flag fallbacks. No state selects the one-tick range-six grace, and its movement target never differs from the stateless baseline on these same snapshots. The 112 observed weapon-range opportunities cannot be attributed to either counterfactual policy because the positions were not simulated forward. **Range-six retention, second-outside-tick release, and re-entry: unexercised live**, not passed or failed. Local tests establish those decision rules, but this match does not establish their live effect or a strategic improvement.

**Available replay-console verification: passed for the displayed entries.** A follow-up inspection opened the native Arena replay URL ending in `/game/6ab995f16fdfd118847097eb` at **tick 80/80**. The **Show current tick only** switch was visibly off. Its console table contained 79 numbered rows for ticks **1–79**, beginning with a `map-state` entry at tick 1 and ending with a `game-state` entry at tick 79; no separate load/runtime error or other non-state row was visible. This agrees with the preserved `/log/80` response: one console call on tick 1 contains both the map and game-state JSON entries joined by a newline, followed by game-state calls on ticks 2–79. The imported JSONL contains only game-state records and is not itself a full-console export. Neither the displayed console nor the preserved response contains a tick-80 logger entry; whether the logger ran on that terminal tick remains unverified, and its absence alone does not establish an error. No errors were observed in the **full available displayed console and corresponding raw response**, but output outside those available entries cannot be ruled out.

**Overall verdict for the targeting candidate: inconclusive.** The new build is identified; ordinary range-five acquisition, in-range holding, and first-flag fallback are observed; and the available replay console shows no errors. The changed grace branch was not exercised, and terminal-tick logging remains unverified. The managed capture was claimed and marked `examined` under `codex/validate-boundary-grace-20260928`; it and the prior review claims, map, raw cache response, manifest record, and fingerprints remain intact. No `done` or cleanup command was used.

### Bounded acceptance route without a controlled Arena scenario

The user confirms that a controlled boundary scenario is unavailable. Existing `tests/unit/movement.test.js` calls the production `selectMovementDecision()` with its returned engagement carried across consecutive decisions: acquisition at five, one retained tick at six, second outside tick falling back to the flag, and reacquisition at five. It also checks grace reset after re-entry, in-range holding, a nearer enemy taking priority, weapon loss, and disappearance of the prior target. A `moveCreeps()` test carries the production per-creep map across three calls and asserts enemy → enemy → flag with no competing movement commands. `tests/unit/tick-flow.test.js` invokes the real `runTick()` with mocked Arena imports at ticks 1 → 2 and confirms retention, then tick-counter reset. These are deterministic decision and orchestration checks, **not** live execution of the range-six branch; the previously reported 54 passing tests were not rerun for this documentation-only assessment.

The two isolated release gaps are now closed in `tests/unit/movement.test.js`. Both new tests invoke production `moveCreeps()` with the same engagement map across three successive calls and an available first flag. One checks acquisition at range five, retention at six, then **range-seven release**; the other checks acquisition and retention followed by the same target's `hits` becoming zero at range six, with no eligible alternative. Each asserts enemy → enemy → flag movement and removal of the saved engagement. Focused movement tests pass **12/12**; `npm test` passes **56/56**; `npm run check` and `npm run build-id:check` pass without regenerating the unchanged runtime build ID `6821c92a0a75f80be21e5c66d77242d6b3166e0a7da65b4d6773ef8739eedd52`. These results add deterministic coverage only; runtime code and the live evidence are unchanged.

With that deterministic gap closed, the remaining step is an explicit acceptance decision. The existing provenance-matched ordinary match establishes build identity, available-console cleanliness, and ordinary approach/hold/fallback behavior, but **does not satisfy the existing live-behavior gate for one-tick range-six retention**. If a further ordinary active-opponent match is desired, cap the attempt at **one** match with this unchanged build ID; inspect its associated capture for the boundary sequence and console errors, then stop whether or not the rare sequence appears. Do not wait indefinitely or infer the branch ran from a match outcome. If the sequence is observed with matching provenance and no relevant error, reassess the live gate from that evidence. Otherwise the branch remains **live-unexercised**. Proceeding without that observation requires the user to **explicitly accept this residual uncertainty and waive or revise the branch-specific live gate**; record that decision as a risk acceptance, not as a passed live test. If the gate is retained, leave the targeting candidate's live verdict inconclusive and do not describe it as fully validated. Terminal-tick logging remains a separate unverified detail, not evidence of failure.

**Checkpoint decision — 2026-09-28:** The user explicitly accepts the residual uncertainty of unexercised live range-six retention and authorizes review, commit, and push of this candidate. This waives the branch-specific live-observation gate for this checkpoint only; it does **not** turn the live branch verdict into a pass or establish strategic improvement. Build identity, capture/map integrity, available-console inspection, and deterministic tests retain their separate passed findings. Live range-six retention remains **unexercised**, and the overall live behavioral verdict remains **inconclusive**.

## Healer-positioning candidate — 2026-09-28

The committed `68c7516` movement policy sends a pure healer toward the first ScoreFlag because it has no functioning ATTACK or RANGED_ATTACK parts. Healing target selection is separate: on each tick it can still heal an injured ally at current-position range 1, or use `rangedHeal` through range 3. The saved review in [ADR 0003](../decisions/0003-replay-informed-strategy-proposals.md) reports injured melee creeps four or five tiles from healers in older replays; those cleaned captures have unknown running-code provenance, so the original positions cannot be rechecked here. A retained, build-identified capture gives a narrower current-policy example: in replay `6ab995f16fdfd118847097eb`, tick 46, owned `pg_player1_melee_4` is at (49,52), with 781/1600 hits. Owned `pg_player1_healer_1` at (50,48), `_2` at (47,47), and `_3` at (49,48) each has six functioning HEAL and MOVE parts and no weapons. Their ranges to that melee creep are 4, 5, and 4, beyond `rangedHeal` range 3. All three also have other injured allies already within range 3. The melee creep moves to (48,51) on tick 47 and healers 1 and 3 are then at range 3. This is one observed separation tick, not proof that a missed heal or the healers' issued movement commands caused the injury.

The local rule is limited to **pure healers** with a functioning HEAL part and no functioning weapon. It chooses the nearest other, living, damaged owned creep at linear range **4–5**, breaking ties by ID and then input order, and issues its one movement command toward that ally. If no such ally exists but an injured ally is within range 3, it holds; otherwise it retains the first-flag fallback. An ally at range 6 is not pursued. A damaged healer does not select itself as a movement target, but self-healing remains available to the unchanged tactical selector. Creeps with any functioning weapon, including mixed weapon/HEAL creeps, retain existing nearest-enemy targeting and one-tick range-six retention. Healing actions still use observed positions and existing priorities; movement cannot make an out-of-range heal eligible on the same tick. This bounded rule does not coordinate multiple healers, assess path cost or terrain, or guarantee a particular ally receives healing.

A same-snapshot comparison used the retained capture's 79 pre-action ticks and called the production movement selector on **201 living pure-healer creep/tick states**. The committed baseline selects the first flag in all 201. The candidate selects 38 ally approaches, 45 in-range holds, and 118 flag fallbacks. At tick 46, the candidate selects `pg_player1_melee_4` for healer 1 and healer 3 (range 4), and `pg_player1_melee_1` for healer 2 (range 4); the baseline selects the first flag for all three. These are selector decisions on identical recorded positions, not issued commands or a simulated future match. The recorded support-range availability is necessarily unchanged between counterfactual decisions, and this comparison proves neither additional heals nor improved survival. The managed capture was claimed and marked `examined` under `codex/healer-positioning-20260928`; it remains retained with its prior claims, map association, and fingerprint. No review was marked `done`.

The candidate runtime build ID is `bc1c670b6f82cc8155308d1c1c3c726fed0fcfed67f6f27b452e648035a50dfc`. `npm run build-id:check`, `npm run check`, focused movement tests (16/16), the full test suite (60/60), and `git diff --check` passed locally. The tests exercise production movement selection at range 3/4/5/6, nearest eligible ally and deterministic ties, fully healed/dead allies, destroyed HEAL parts, mixed-role combat precedence, flag fallback, and current-position healing compatibility. They do not simulate Arena movement or establish a live outcome.

**Live Fame replay `6ab99d906fdfd159c8709976`:** The Arena showed `/Users/zoltanka/Documents/Prog/JavaScript/ScreepsArena/pain_and_gain/src` as the selected code directory before launch. The completed replay against **temik911 v166** displayed **Defeat** at tick **160/160** (displayed score 610–309; the result label, not score alone, determines the reported outcome). The console's **Show current tick only** switch was off. The importer found two response chunks, `6ab99d906fdfd159c8709976.jsonl` (ticks 1–100) and `6ab99d906fdfd159c8709976-1a5fd2969551.jsonl` (101–159). Across the 159 unique pre-action snapshots there are no gaps or duplicates. Their raw cache responses, imported JSONL, manifest records, and replay association agree on build ID `bc1c670b6f82cc8155308d1c1c3c726fed0fcfed67f6f27b452e648035a50dfc`. The JSONL SHA-256 values `96fa3d96ba788beb5388dda1e2b247aab1396a25cd8ad2234d01a5f1d4a264ac` and `5fc9a1889aa091e872c37bfe95f49c9da34a974018e1bb6bf4272120536844db` match the manifest. Both response records link to the validated map `pain_and_gain_map_2026-09-27T22-50-41-490Z.json` (canonical checksum `9dacf32ce39c3f876407a3eedb21558ace4e5ca8013a64ae2a1409eb9e9b0a36`). The controlled side is `pg_player2_*` (`my: true`).

**Observed approach, ticks 117–120:** `pg_player2_melee_1` is injured at (44,46), 1283/1600 hits, on tick 117. Pure `pg_player2_healer_1` has six functioning HEAL and six MOVE parts, zero fatigue, and is at (48,51), range **5** to that ally and outside ranged-heal range. The production candidate selector chooses the injured melee as its movement objective; the committed baseline would choose the first flag (49,49), only two tiles from the healer. The next observed healer positions are (47,51) at tick 118, (46,50) at 119, and (45,49) at 120. Its distance to the same ally is respectively 5, 4, and 2 (the ally moves to (45,47) on tick 120), while its distance from the flag rises from 2 to 4. This is live positioning consistent with the new approach rule, including a transition into healing range, and differs directionally from simple flag pursuit. It does not identify the issued move command or pathfinder result. The ally's hits fall to 327 at tick 121, then rise to 375, 423, and 495 at ticks 122–124 while healer_1 remains within range 2. That recovery is consistent with healing but does **not** directly identify a healer action or establish that the positioning rule improved survival; simultaneous damage can mask other healing as well.

On these same recorded snapshots, the production selector evaluates **431** living pure-healer creep/tick states: 48 ally approaches at range 4–5, 31 holds with an injured ally within range 3, and 352 first-flag fallbacks. The pre-change pure-healer policy selects the first flag on all 431. These are counterfactual decisions on fixed observed positions, not a baseline match or a forward simulation. Position changes and support-range entry are observed only for the candidate build. The full available Arena console at replay tick 160/160 displayed entries through tick 159 with no visible separate load/runtime error row. The preserved raw `/log/100` and `/log/160` responses contain one map entry, 159 game-state entries, and zero other entries; this reconciles with the displayed console, but neither source has a tick-160 logger entry. Its absence does not prove a failure or that the loop ran on that terminal tick.

**Verdicts:** Local correctness **passed** (focused and full tests, syntax, build-ID, whitespace). Live build identity **passed** (selected directory plus emitted matching ID). Observed healer positioning **passed for the range-5 approach into range 2 in this replay**; issued commands, actual heal attribution, and strategic benefit remain unverified. Available-console verification **passed for displayed ticks 1–159 and matching raw responses**, with no observed errors; terminal-tick logging remains unverified. The two new captures were claimed and marked `examined` under `codex/healer-positioning-20260928`, but not marked `done` or deleted. The older build's replay cannot validate the changed runtime.

## One-scout flag-allocation experiment — 2026-09-28

This is a disabled experimental checkpoint, committed with the user's explicit acceptance that enabled live allocation behavior remains inconclusive. The checkpoint does not establish assignment, cancellation in the match, or strategic benefit.

The temporary enabled configuration described in this section has been restored to the disabled default after the replay review below. Further strategic comparison remains pending.

The committed baseline still selects `flags[0]` every tick. In build-identified replay `6ab99d906fdfd159c8709976`, its vulnerability flag at (49,49) became ours at tick 39 and remained the selected flag through all 159 available pre-action snapshots. Six other flags were never ours; the opponent captured the ranged-reduction flag at (13,49) by tick 58. At tick 39, owned `pg_player2_scout_2` at (51,54) was 23 tiles by linear range from the neutral attack-reduction flag at (67,31), while the nearest enemy was 53 tiles away. The other attack-reduction flag at (31,67) was 20 tiles from both that scout and the nearest enemy. These ranges are lower bounds, not verified route lengths or evidence that a diversion would have won. The match ended in defeat at tick 160, despite first-flag ownership. The managed response chunks were claimed and marked examined under `codex/flag-allocation-20260928`; they and all prior claims remain retained.

`src/config.js` defaults to disabled for ordinary play; it was temporarily enabled for the replay below and is now restored. When enabled, it can start at most once per match, no later than tick 80, only after the first flag is ours. It chooses the full-health, zero-fatigue, MOVE-only scout farthest from the first flag (ID tie-break); it requires a living armed friendly within range three of that flag and no living enemy within range five. An eligible target is a neutral attack-reduction flag with no enemy within range five of it or the scout, a complete terrain path of at most 40 steps, and an estimated enemy arrival more than five steps later than the scout's. Candidate flags sort by route length then ID. A pathfinder failure or unknown competitor route rejects that target. The retained assignment is rechecked each tick and ends permanently for the match if the first flag is lost/threatened, the target becomes owned/contested/invalid, the scout is injured or loses MOVE, a viable route or arrival margin disappears, the defender is lost, or 60 ticks elapse. On successful capture the scout returns to the first-flag fallback; it never immediately chains or reassigns. A temporarily fatigued assigned scout is not treated as permanently immobile. Combat targeting and pure-healer support still override fallback movement, and the action selectors are unchanged.

The five-tile threat radius matches the existing local combat window; five estimated steps of arrival margin, a 40-step route cap, tick-80 start limit, and 60-tick timeout are conservative **experiment thresholds**, not proven safety guarantees. `searchPath` with `maxOps: 5000` supplies complete terrain-route lengths, but those are estimates: creep occupancy, congestion, fatigue, damage, and future movement can change actual arrival. Linear range is used only as a lower bound when it already establishes an enemy is farther than the estimated scout route plus margin. The rules say ownership scores and applies its global effect while controlled. This replay still shows the first flag owned on ticks 143–144 and 156 when no creep occupies its cell, supporting persistence after departure; returning a scout cannot be treated as removing a second flag's penalty. An attack-reduction flag adds three points per tick but cuts the entire army's ATTACK power to 80% while owned. Its exact net effect on survival and outcome is unknown.

**Local verification:** With `oneScoutFlagExperiment = false`, generated and checked runtime build ID `0843ad4a7ada529101cee16c87b8c7e39bfee2f499cf5e6bb3c583839462632b`. Focused allocation/tick-flow tests passed 10/10; `npm run check`, the full suite (68/68), and `git diff --check` passed. Production planner tests cover the enabled assignment, route/arrival rejection, deterministic ordering, one-scout movement, cancellation, capture completion, and default-off fallback. The route callback is mocked at the Arena boundary; these checks do not establish live pathfinder behavior or an enabled-build ID.

**Strategic validation pending:** The single enabled replay below establishes source identity and available-console health, but not a confirmed allocation command, second capture, or benefit. A causal comparison would need disabled and enabled builds with separately verified emitted IDs over comparable active matches/maps, tracking flag uptime, score differential, casualties, and survival. One match outcome alone is insufficient. Replay positions do not log the scout objective or actual route estimate.

### Earliest-safe-pair candidate — 2026-10-15

The current disabled experiment now compares eligible **scout–target pairs**
before committing to a scout. The preceding historical checkpoint and replay
verdicts are unchanged. The score defeat against temik911 (`6ababe3796aad17ed5fae404`,
recorded below) retained the first flag with all 28 creeps alive and no observed
combat/injury; it demonstrates a scoring-opportunity problem, not that a second
capture would win. The diagnostics reviews (`6ab9b0686fdfd1a237709c3d` and
`6abad54f694bbd0e4ecb70df`) show strict arrival gates can
reject targets or cancel immediately. None establishes that the other scout had
a safe route. This change addresses a code-level blind spot: distance from the
first flag does not establish which scout has the earliest safe target route.

On acquisition, evaluate every healthy, zero-fatigue MOVE-only scout against
every neutral attack-reduction target using the **same** complete-route,
40-step, local-threat and strict enemy-arrival `> scout steps + 5` gates.
Choose the smallest eligible route length. Equal lengths prefer the scout
farthest from the first flag, then scout ID, then target ID. Targets are evaluated
in ID order; each diagnostic evaluation now includes `scoutId`. Once assigned,
only that scout/target is rechecked: no switching, second attempt or chaining.
First-flag ownership/defence, tick-80 start window, 60-tick timeout, cancellation,
fatigue continuation and capture completion are unchanged. No deployment switch,
combat, healer, escort or movement executor was changed.

This is an opportunity ranking within the existing debuff policy, **not** a new
combat-value model. A neutral attack-reduction flag adds 3 points/tick but reduces
global ATTACK power to 80% for one such flag (60% for two), persisting after the
scout leaves. An earlier capture also starts that penalty earlier. Healing,
ranged-reduction and vulnerability flags remain excluded; no safety threshold is
relaxed. The expected observable improvement is fewer rejections caused solely
by preselecting the wrong scout, or an earlier estimated capture when both are
safe. Net score, survival, actual travel time and outcome remain unproven.

Generated regressions demonstrate an old rejected pair (scout route 20, enemy
route 24) alongside an eligible other scout (route 18, enemy 24); equality at
`18 + 5` still rejects. Another generated case chooses route 18 instead of 26:
eight earlier estimated scoring ticks would yield 24 points **if** capture and
uptime follow the estimates, with eight earlier debuff ticks as well. These are
synthetic route assumptions, not replay counterfactual trajectories. Tests also
cover per-scout danger/fatigue, incomplete/40/41-step routes, deterministic ties,
first-flag loss/defender loss, ownership changes, retained assignment and one move
per actor. Existing combat/healer/escort and disabled tick traces remain checked.

The standard observed roster has two MOVE-only scouts and at most two neutral
attack-reduction targets: at most `2 × 2 × (1 + 14) = 60` path calls per acquisition
tick, each still capped at 5,000 ops by `src/loop.js` (300,000 requested path ops,
versus 150,000 previously). Active retention needs at most 15 calls. Reporting
does not trigger extra searches. This finite work bound is **not** a wall-time/CPU
guarantee; live CPU headroom and congestion remain trial gates. No persistent
path cache, extra movement controller or example dependency was added.

**Offline validation:** two new regressions failed before correction; the final
focused allocator/movement/tick/healing/escort/hold checks passed **83/83** on
Node **24.19.0**. Build generation, `npm run check` (including build-ID checking)
and whitespace checks passed. The checked **disabled** candidate ID is
`419943d9786e765deb1080f827b83dcdea45abc42821557ec956bbc6fb96a2a8`.
No managed capture/cache was reread and no match was launched. WebStorm found
no allocator/build-ID issues; it reports two existing omitted-optional-report
argument warnings and the existing mocked `ScoreFlag.my` read-only-typing error
in tests, despite passing Node execution. They were not suppressed.

Local TypeScript examples were inspected, not executed or modified:
`skirmish-main/.../intents/creeps/move.ts` (MIT) uses deterministic movement
conflict ordering but is an engine resolver, not an Arena allocation policy;
`screeps-rl-main/samples/bots/apex-v3/src/main.ts` relies on World `Game`/`Memory`
and is unsuitable here; `screeps-arena-tools-main/src/terrain.ts` (GPL-3.0-or-later)
is replay terrain encoding, not a path/arrival oracle. Their manifests/licenses
were consulted. No example code, fixtures, dependencies or TypeScript were copied.

**Proposed operator trial, not launched:** retain this disabled candidate's build
ID and a baseline result first. For one explicitly approved active-opponent
screening match, change only `oneScoutFlagExperiment` to `true`, regenerate and
check the build ID, record that distinct enabled ID, keep every other switch
unchanged, and verify Arena's selected `src/` plus emitted ID. Record acquisition
scout/target/routes/margins, actual capture tick, both flags' ownership uptime,
score and score differential, casualties, terminal outcome and CPU headroom.
Abort further trials on runtime/CPU errors, first-flag loss or unsafe allocation;
retain rejection and cancellation cases as outcomes, not successes. Roll back by
setting only that switch to `false`, regenerating/checking the ID, and confirming
the recorded disabled candidate ID before another launch. This cannot undo a
captured flag's debuff within an already-running match. Compare multiple enabled
and disabled matches, keeping opponent/map/build identities: random opponents
confound one-match comparisons. Neither offline checks nor this proposed single
screening match establish win-rate improvement or authorize promotion.

For the exact current runtime bytes with only that switch changed, the
**in-memory calculated, not deployed** enabled fingerprint is
`ec674f707e9412ce6e3cccda8282016a546696a267fa4b469d1cde59fd7e9ead`.
The operator must actually regenerate/check and match it before the trial;
restoring the switch must reproduce the disabled ID above. A mismatch stops the
trial rather than silently accepting another candidate. The retained offline
commands, hashes and scoped preservation checks are in
`/Users/zoltanka/.local/share/pain-and-gain-evidence/scout-pair-policy-20261015-vQR166/`.

### Earliest-safe-pair one-match review — 2026-10-15

The operator completed **one random Fame match**, replay
`6ad1353874ae43d45c65ae76`: bushdoctor2008 **v25** (`player2`) versus
**magnum338 v6**. Arena's open-replay URL and visible tick-782 console identified
this match and enabled build
`ec674f707e9412ce6e3cccda8282016a546696a267fa4b469d1cde59fd7e9ead`.
Exact local finished-match metadata agrees (created 20:19:04.703 UTC, 1,384 ticks).
Metadata code ownership/slot references and 149/149 early comparisons of every
logged creep independently agree with our runtime ownership: pre-action log tick
`t` matches replay frame `gameTime=t-1`; offsets zero and +1 matched none of the
150 tested rosters. The source directory selected **at launch** was not
independently observed; emitted identity matches the locally checked enabled
runtime, not proof of that UI setting.

**Coverage and preservation:** existing cache parsers validated 14 log responses,
14 frame responses and one metadata response, selected by this match's exact
request keys only. There are 1,383 consecutive pre-action snapshots (1–1383),
1,384 consecutive frames (1–1384), and 1,383 complete action/CPU diagnostic ticks,
with no reported closure/correlation gaps or untyped console entries. No error
entry was found in those captured console responses; the full UI console and
terminal-tick logging remain unverified. All 29 selected cache-file hashes and
metadata were rechecked unchanged. The captured starting map contains 10,000
terrain cells/seven flags; its calculated checksum is
`f35f86a64af8f969887cfb8fa809ad2253feea6ea5805a7ebe35c1ffdd52dfee`.
No registered-map agreement is claimed: the production manifest was found
**dataless**, never opened or hydrated. No managed capture was read or imported;
managed membership and claim/examined recording remain unavailable, not silently
treated as completed. Original cache bytes, managed files and old claims were
left untouched.

**Execution/safety:** all **86** allocation diagnostics are `reject`; there is no
assignment, retention, cancellation or completion. Early first-flag threats
blocked acquisition. On ticks **48–80**, both scouts were evaluated against the
remaining neutral attack targets. At tick 48 both scouts' route to A was 18
steps, versus enemy scout_2's 17; B was 19/18 for our scouts versus enemy
scout_1's 16. All fail the unchanged strict `enemy > scout + 5` gate. Tick 81
closed the start window. Across these evaluations, diagnostics report **176**
path calls, at most eight and 216 pathfinder ops in one tick—not the 60-call
worst case. Scout `moveTo(first flag)` calls returned zero and consecutive
snapshots show fallback movement (for example scout_1 at 51,52 → 50,51 from
log ticks 38→39); zero proves accepted scheduling, not displacement causality.
Selected scout action records through tick 150 contain no alternate-flag command;
no second-flag capture occurred in the full observed coverage. Pair evaluation/rejection is
exercised; pair selection, diversion, successful capture and its debuff trade-off
remain **unexercised**, not successful allocation validation.

**CPU:** all 33 route-evaluation ticks have complete sampled coverage. Peak
elapsed sampling-point CPU was **3,298,929 ns at tick 51**, against the recorded
ordinary-tick **100,000,000 ns** limit (96,701,071 ns sample headroom). The largest
ordinary sample in the match was 9,565,273 ns at tick 376. Tick 1 used the separate
1,000,000,000 ns limit. These samples precede logger/closure completion; they do
not prove final CPU usage, worst-case route cost or incremental allocator
overhead. No CPU/runtime error was found in available captured output.

**Effects/strategy:** the first flag became ours at frame **38** (log **39**) and
remained ours through terminal frame 1384: 1,347 observed owned frames and 1,346
five-point score increments. Neither attack-reduction flag was ever ours;
second-flag uptime and its ATTACK penalty were zero. Scores (ours–opponent) were
315–291 at frame 100, 815–891 at 200, 2,815–6,507 at 600, and **6,730–22,167**
at terminal frame 1384. Arena displayed **Defeat**. We lost five creeps (nine
survived), while the opponent lost thirteen (one scout survived) and held all
other flags at the end. This is a score loss despite combat attrition advantage,
not evidence that relaxing safety gates or accepting a combat penalty would win.
One random opponent does not establish a win-rate change.

**Restoration:** immediately after match completion was reported, only allocation
was restored to `false`; escort remains `true`, holding/pairing `false`.
Regeneration and `npm run check` returned exact disabled build
`419943d9786e765deb1080f827b83dcdea45abc42821557ec956bbc6fb96a2a8`.
The accepted 83 offline checks were reused; no suite or second match was run.
The scoped trial record, exact source hashes, route/CPU evidence, restoration and
preservation checks are retained under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/scout-pair-live-trial-20261015-XzKxun/`.
No promotion or continued activation is authorized.

### Post-opening contest candidate — 2026-10-15

The disabled allocator now has one narrow late-contest mode in addition to the
unchanged neutral opening. It is **not enabled or live-validated**. Historical
builds, the rejection-only trial above, and its restoration receipt remain valid
for their original source bytes; the new disabled candidate ID is recorded below.

**Concrete opportunity:** the retained trial findings showed nine friendly
survivors versus one enemy scout after log tick 503, while the opponent retained
all six non-central flags. One additional bounded read of the already-selected
resident `/log/600` response confirmed tick **520**: full-health, zero-fatigue
scouts at (49,49) and (50,49), owned first flag (49,49), functioning ranged
defenders at (49,48)/(50,48), and the sole MOVE-only enemy at (67,31), occupying
enemy-owned attack flag A. Attack flag B (31,67) was enemy-owned and unoccupied;
that enemy's geometric distance to B was 36. The original policy rejected every
post-80 start and never considered enemy-owned B. The exact 55,365-byte source's
recorded path, identity, timestamps and SHA-256
`73aeead6c052b7d28715556e02eb99d09a1a598ec18e8c78ce17e5ad7e8f48a7`
were verified from the same bytes passed to the existing parser. No other
original response, managed manifest, import or review lifecycle was accessed.

**Acquisition:** ticks 1–80 still consider neutral attack-reduction flags under
the original all-enemy danger/race rules. If no attempt has already started,
late mode considers only **enemy-owned attack-reduction flags** at ticks
100,120,…,1900: at most **91** acquisition polls. The 20-tick cadence is an
explicit search-work/response-latency trade-off, not an empirically optimal
strategy. The 1900 cutoff is `2000 - 60 assignment - 40 nominal return steps`;
it does not guarantee arrival, return, uptime or survival before an early end.
There is still **one assignment total per match**, across both modes.

Every living enemy must have **no functioning ATTACK or RANGED_ATTACK** before
late acquisition/continuation. This conservative global gate avoids introducing
a new combat-risk radius or allowing a raid around surviving armed enemies.
Unarmed does **not** mean irrelevant: any living enemy within five of the first
flag still blocks/cancels; an enemy standing on the target rejects it before any
route search, regardless of weapons or estimated speed. All other enemies,
including unarmed scouts/healers, remain arrival competitors. Incomplete/unknown
routes reject; the existing maximum 40 scout steps and strict
`enemy steps > scout steps + 5` margin remain unchanged. Linear range is only a
lower bound that may establish that margin. Earliest eligible route wins, then
farthest-from-first scout, scout ID and target ID. First-flag ownership, a living
functioning armed defender within three, full health and MOVE-only body remain
mandatory; new scouts must have zero fatigue.

**Continuation/release:** state records `mode: "contest"` so an opening attempt
does not change rules when it crosses tick 80. A late assignment rechecks every
tick, not just poll ticks, and never changes scout/target. New armed danger,
centre threat/loss, lost defender, injury/lost MOVE, **any late-assignment
fatigue**, target occupation, ownership/effect change, or lost route/race ends
the attempt permanently and restores first-flag fallback. The late fatigue
cancellation avoids pretending a paused raider can meet its original race;
opening fatigue continuation remains unchanged. Ours-owned target completes
after safety checks; otherwise it must remain explicitly enemy-owned (missing or
null ownership is not normalized). At zero route steps the scout holds until
ownership is observed. The existing timeout allows elapsed ticks through 60 and
cancels at 61. Capture, cancellation or timeout never causes a retry, second
capture, holding patrol or recapture loop. Returning cannot undo a flag's debuff.

**Trade-off:** taking an enemy 3-point flag adds 3 to us and removes 3 from them:
a **6-point/tick ownership swing while held**. It also reduces our army's ATTACK
power (80% for one attack flag, 60% for two), and removes one of the opponent's
ATTACK penalties. The no-armed-enemy prerequisite limits immediate combat risk,
but does not guarantee no future threat (for example healed body parts), prevent
recapture, or establish that score pursuit beats destroying the remaining scout.
The policy deliberately does not add heal/ranged/vulnerability targets or a
general score/combat-value optimizer.

**Regression and bounds:** a tick-520-shaped generated fixture preserves the
observed positions/ownership/roles with simplified body and health values. Its
complete 20/21-step routes are **synthetic assumptions**, not measured tick-520
Arena routes; the enemy's 36 lower bound clears either route +5. The original
planner rejected; the new planner chooses B and explicitly rejects occupied A.
This is a counterfactual decision on a fixed observation, not a replay trajectory
or a claim capture would succeed. Tests exercise occupancy, unarmed races,
armed danger, ownership changes, health/fatigue, defence, incomplete routes,
timeout, ordering, bounded polls, and actual enabled tick orchestration.
At most 60 searches occur per late poll for the standard two-scout/two-target/
14-enemy bounds, each still at `maxOps: 5000`; idle non-poll ticks do no route
searches. Active continuation needs at most 15 searches/tick for at most 60
following ticks. No extra path searches are made for diagnostics. This is a
finite work bound, not a CPU-time guarantee. The prior live 3.30 ms sample was
for opening rejection, **not** this new branch or its worst case.

**Local validation:** the new opportunity regression failed before correction;
**97/97** focused allocator/movement/tick/healing/escort/hold checks passed on
Node 24.19.0 afterward. Runtime generation/checking, `npm run check` and whitespace
checks passed. Disabled candidate:
`efd19a0e3de6d5cbde301aff2e85fb90ac2b5b595fb5bf90b9cc8f7af9967852`.
WebStorm found no allocator/new-test/build-ID problems; the pre-existing mocked
`ScoreFlag.my` read-only-typing error in the opening flow test remains disclosed,
not suppressed. Allocation stays false; escort stays true, holding/pairing false.
Commands, hashes, the bounded source observation and final review are retained
under `/Users/zoltanka/.local/share/pain-and-gain-evidence/scout-contest-policy-20261015-3tvLry/`.

The local MIT TypeScript `skirmish-main` movement resolver's deterministic-ID
ordering was consulted again. Its engine-wide collision arbitration is not a
compatible Arena controller; none of its code, dependencies or TypeScript was
copied. Existing JavaScript movement, combat, healing, escort and deployment
switches are unchanged.

**Future one-match procedure, separately authorized:** retain this disabled ID;
change only the scout switch, generate/check and record the distinct enabled ID,
confirm Arena's source directory and emitted ID, then have the operator launch
one random Fame match. Record whether any late poll meets the unarmed/defence/
race gates; distinguish planner assignment, accepted movement, displacement and
ownership. Measure capture time, first/second-flag uptime, recaptures, score
progression, casualties/outcome, path calls/ops and sample CPU/headroom against
recorded limits. A rejection-only run leaves capture unexercised. After the match
or abandonment restore only allocation=false and regenerate/check this disabled
candidate ID. Stop on identity/runtime/CPU/safety problems; no automatic second
match, threshold tuning or promotion. Random opponents confound comparisons;
offline checks and a single match cannot establish win-rate benefit.

### Enabled-build handoff — 2026-09-28

For the requested single live experiment, **only** `src/config.js` was switched to `oneScoutFlagExperiment = true` in the runtime source. The generated module and `npm run build-id:check` agree on enabled build ID `26c17cf90a387e6b0450f578cd927cccd61dccd1ada0c7bc1453cccbb2315bf9`. `npm run check`, all 68 unit tests, and whitespace checks pass. One test that had asserted the deployment switch must always be false was made configuration-neutral; it still verifies the production first-flag fallback when no allocation is provided. No strategy logic or threshold was changed in this handoff. The prior disabled ID is `0843ad4a7ada529101cee16c87b8c7e39bfee2f499cf5e6bb3c583839462632b`; it does **not** identify an enabled match.

At the initial handoff, Arena displayed its Fame page and then its arena-card page, but clicking the Pain and Gain card returned `noWindowsAvailable`; no match had yet been launched or inspected. The enabled source was left unchanged for the subsequent manual match documented below.

### Enabled replay review — `6ab9a6bd6fdfd16d98709adc`

The Arena replay was open at tick 75/75 with “Show current tick only” off. It displayed **Defeat** for bushdoctor2008 v8 against temik911 v191, with displayed scores 170–54. The associated `/log/75` cache response has one `map-state` and 74 consecutive pre-action `game-state` entries (ticks 1–74), no duplicate or missing ticks within that range, and no other console entries. The UI showed the same available console range without a visible load/runtime-error row. This supports available-console verification, not a claim that the loop logged on terminal tick 75. The requested `/log/75` endpoint alone does not establish match duration; the replay UI and cached game metadata independently report 75 ticks.

The enabled `npm run build-id:check` still returned `26c17cf90a387e6b0450f578cd927cccd61dccd1ada0c7bc1453cccbb2315bf9` before restoring the switch. The raw map and all raw tick entries, byte-identical imported JSONL, response record, and replay association carry that ID. The raw-response fingerprint `80e85e79902af51282c13cc7da979963539ed2b2b1147dfb4663b94e4153568b` and JSONL SHA-256 `4b37c291b1efd6f22b5a083d1ca17c498ed7d3451dcbc37c04ed567bab477989` match the manifest. Its associated `pain_and_gain_map_2026-09-27T23-29-52-559Z.json` has 10,000 terrain cells, seven ScoreFlags, no creeps, and matching embedded, registered, and recalculated payload checksum `0f6ccf30fdc1eec8476c9c88d851f2faf760d59470a046d53eb91b85a0f2f04b`. The capture was claimed and marked examined under `codex/flag-allocation-enabled-review-20260928`; it was not marked done or deleted.

**Observed state:** The first vulnerability flag at (49,49) became ours in the tick-39 snapshot and stayed ours through tick 72; it was enemy-owned at ticks 73–74. No attack-reduction flag became ours in the available snapshots. All 14 owned creeps were alive at tick 39, but only one remained at tick 74. `pg_player1_scout_2` moved (46,44) at tick 39 → (48,45) at tick 41 → (49,44) at tick 42 → (50,45) at tick 43 → (50,48) at tick 47; it remained at (50,48) through tick 60 and reached the first flag at (49,49) on tick 61. This is consistent with a diversion and return, but positions do not identify the issued movement target or an allocation-state transition. `selectedFlagId` remains the first flag by design even if a scout fallback is overridden.

**Production-selector reconstruction and route limit:** The saved snapshots were converted back to the selector's ownership representation, and the actual `planScoutFlagAllocation()` was run chronologically with state carried between ticks. Initial replay data confirms the scouts' MOVE-only bodies; logged functioning parts, health, and fatigue supply the remaining per-tick eligibility inputs. At tick 39, both scouts were full-health and unfatigued; `scout_2` was farther from the first flag (range 5 versus `scout_1` at 2), a functioning armed defender was within range 3, and the nearest living enemy was at range 8. Both attack-reduction flags were neutral. From `scout_2`, flag A at (67,31) was at geometric range 21 and its nearest enemy at range 20; flag B at (31,67) was at range 23 and its nearest enemy at range 23. The map's wall-aware, shortest-step calculation gave scout/enemy lengths of 21/24 for A and 23/23 for B. Feeding those lengths into the **production selector** yields no assignment on ticks 39–42, followed by first-flag fallback. This is a terrain-based counterfactual, **not Arena's exact `searchPath`**: its terrain-cost optimization, path tie-breaking, `maxOps: 5000`, and dynamic movement were not reproduced. Therefore actual assignment, target choice, and the route/arrival gate that decided them remain unconfirmed. No geometric or wall-aware estimate is presented as the actual Arena route result.

At tick 43 a living enemy reached range 5 of the first flag. This is an exact, route-independent gate: with a hypothetical active `scout_2` assignment to either attack flag, the production selector returns `{ finished: true }` without calling the route callback and supplies first-flag fallback. The first flag remained threatened on ticks 43–72, then was lost at tick 73, so no fresh assignment could begin later. This confirms the policy's deterministic cancellation **for the recorded state**, not that a previously unlogged assignment actually existed or that a return command was issued. The scout's change from (50,45) at tick 43 to (50,46) at tick 44, then (50,48) at tick 47 is consistent with return movement. Neither capture/completion nor strategic benefit was exercised.

**Verdicts:** Enabled build identity and capture/map integrity **passed**. The available full-console view through tick 74 **passed with no observed errors**; terminal-tick logging remains unverified. Scout movement and first-flag ownership transitions were **observed**, but actual allocation/target/cancellation commands are **inconclusive** without logged state or exact Arena pathfinder output. No second flag was captured; the displayed defeat and scores do not establish the experiment's causal value. The enabled configuration was then restored to the disabled default; its separate ID and local check results are recorded below.

### Restored disabled default

After the enabled capture and review, only `oneScoutFlagExperiment` was changed back to `false`. `npm run build-id:generate` and `npm run build-id:check` returned the original disabled ID `0843ad4a7ada529101cee16c87b8c7e39bfee2f499cf5e6bb3c583839462632b`, confirming no other hashed runtime bytes changed from that disabled candidate. `npm run check` passed runtime syntax and build-ID checks; `npm test` passed **68/68**; `git diff --check` passed. This restored ID describes the current disabled source, **not** the enabled replay. No policy threshold or other strategy code was changed during review/restoration, and no replay capture or review was completed or deleted.

### Allocation diagnostics — local candidate

The disabled-by-default experiment now has a structured pre-action `flag-allocation` console record when enabled. Each record carries `buildId`, `tick`, `event`, `reason`, `firstFlagId`, resulting `state`, and `objectiveId` (the scout's selected fallback, or the first flag). Where a scout/target was considered, it also carries their IDs and `evaluations`. Each target evaluation states the scout's linear range, the *actual evaluated* `searchPath` result (`incomplete`, path `length`, `cost`, `ops`), the resulting scout step estimate, the required enemy arrival threshold (scout steps + 5), and each relevant enemy's linear lower bound and either its actual route result/comparison or `lower-bound-safe`. An early gate with no route call has no route result. No path tiles are dumped; no path search is repeated for logging. Only consecutive identical route-free rejections are collapsed; game-state snapshots still cover those ticks. The record describes planner state and a movement **objective**, not an issued command, successful step, capture, or strategic gain.

The replay importer keeps original diagnostic lines in typed manifest `otherEntries`, accessible via its `other` command after claiming the capture; game-state JSONL remains unchanged. Older replay `6ab9a6bd6fdfd16d98709adc` predates these diagnostics, so its assignment and exact Arena routes remain **unknown**. Local tests validate representative assignment, route/arrival rejection, threat cancellation, and capture completion records, unchanged target selection and path-search counts, build-tagged emission, and importer compatibility. At this local-candidate checkpoint, live diagnostic emission was unverified; the subsequent replay review below establishes the exercised rejection path, not assignment or strategic benefit. The switch is again `false` after that review.

The generated disabled-candidate runtime ID is `0f52fec97d0e9d72caf11611a55f87a2f2bd8bb8a15433ad7500b7b9b2437ce8`. `npm run build-id:check`, `npm run check`, all 74 tests (including an enabled `runTick()` boundary test), and `git diff --check` pass locally. This ID does not identify the earlier enabled replay, and local tests are not live diagnostic evidence.

### Diagnostic replay review — `6ab9b0686fdfd1a237709c3d`

The Arena UI was open on this replay with **Show current tick only off**. At tick **1412/1412**, it displayed **Defeat** for bushdoctor2008 v9 against ricardo18informatica2020 v19, scores **6,870–21,598**. The visible terminal console rows were game-state entries for ticks 1400–1411, with no visible error row. Scrolling the app console failed with `noWindowsAvailable`, so its entire list was not independently traversed in the UI. The preserved raw cache responses are the stronger available-console evidence: 15 response chunks contain one map entry, 1,411 consecutive pre-action game-state entries (ticks 1–1411, no gaps or duplicates), and 21 typed `flag-allocation` entries. There are **zero other console entries** in those responses. Each raw response fingerprint and original game-state line matches its managed capture and manifest hash; all raw state/diagnostic entries and all response/replay manifest IDs carry enabled build ID `598a1ae37ca225045b979819a5eda2ab8b02b336bc30017b282676ce16359459`. The associated `pain_and_gain_map_2026-09-28T00-21-17-040Z.json` contains 10,000 terrain cells and seven ScoreFlags, no creeps; its embedded, registered, and recalculated payload checksum agree at `53aab764192f608811be2dc3a0fdd631bf1704a14b1f1e3c7f6c040d299701d6`. All 15 chunks were claimed and marked examined under `codex/allocation-diagnostics-20260928`; none was marked done or deleted.

**Recorded planner decisions:** At tick 1 the first flag was neutral, and the allocator rejected with `first-flag-not-owned`; identical route-free rejections through tick 38 were intentionally suppressed while game-state snapshots continued. At tick 39 the first flag was ours, but scout `pg_player2_scout_2` received `no-eligible-target`. For attack-reduction flag A, the actual `searchPath` result from the scout was complete, length **23**, cost **46**, ops **35**, requiring enemy arrival **>28** steps; enemy `pg_player1_scout_2` had a complete length-**20**, cost-**40** route, so the margin failed. For flag B, the scout route was complete, length **20**, cost **40**, ops **30**, requiring enemy arrival **>25**; `pg_player1_scout_1` had a complete length-**25**, cost-**50** route, and equality also failed the strict margin. Route comparisons continued to reject evaluated targets on ticks 40–50; nearby-enemy gates then rejected targets on ticks 48–56. Tick 57 reported no eligible target with no target evaluations; its identical route-free rejections were suppressed on following ticks. Tick 81 logged `start-window-closed`, with later identical rejections suppressed. All 21 diagnostics are `reject` events with null allocation state and first-flag fallback objective. **No assignment, cancellation, or completion event was recorded**, so those live branches remain unexercised. The diagnostic is a planner decision, not an issued movement command or evidence of capture or strategic benefit.

**Verdicts and provenance limit:** Emitted build identity, capture/map integrity, and rejection/route-diagnostic import **passed** for the preserved responses. Assignment, cancellation, completion, and strategic effect remain **unobserved**. No load/runtime-error entry was found in the available raw output through tick 1411 or the visible terminal rows; the full UI list and terminal-tick logging remain unverified, and a missing tick-1412 logger entry is not treated as an error. Before restoration, `npm run build-id:check` failed because `src/config.js` lacked its trailing newline: the current source computed `bd5eb68fe702312efffd27edb884d511fb4a8d27b4e5fdde65fc97c963774857`, not the emitted ID. Thus the preserved emitted ID identifies the replay records, but the then-current checkout could not independently attest to the exact loaded source bytes. After restoring only the switch to `false` and regenerating the artifact, `npm run build-id:check` returned the expected disabled ID `0f52fec97d0e9d72caf11611a55f87a2f2bd8bb8a15433ad7500b7b9b2437ce8`; that disabled build was **not** the replay build.

The restored checkout passes `npm run check`, all **74/74** tests, and `git diff --check`. No strategy logic, thresholds, captures, map registrations, or prior reviews were changed; this task's 15 reviews remain claimed and examined, not completed.

## One-healer pre-injury escort experiment — 2026-09-28

This was introduced as a separate **disabled-by-default** experiment (`oneHealerEscortExperiment = false` at this checkpoint), not a replacement for reactive injured-ally support. In build-identified MBFishhh replay `6aba85516fdfd126c670b262`, all owned creeps were healthy through ticks 93–95 while `pg_player2_melee_1` advanced and the pure healers fell back to the first flag. After injury, healers pursued, but before actions at ticks 96–97 every functioning healer remained outside ranged-heal distance three; all three recorded `rangedHeal` on melee_1 at tick 98. This establishes a support gap and reactive delay, not its sole cause or the outcome of an earlier escort. On unchanged recorded snapshots, the proposed pair is melee_1 with `pg_player2_healer_3`: tick 93 hold, ticks 94–95 approach, tick 96 release on injury. These are counterfactual objectives, not commands, displacement, or prevented damage.

When enabled, the planner may acquire **one pair per match**, only while `flags[0]` is ours and no living owned creep is injured. A candidate melee must be full-health, unfatigued, have functioning ATTACK and MOVE, no functioning RANGED_ATTACK or HEAL, and a living enemy within linear range five. A candidate pure healer must likewise be full-health and unfatigued, have functioning HEAL and MOVE but no functioning weapons, be within range five of that melee, and farther than range three from every living enemy. Pairs rank by melee's nearest-enemy range, melee ID, healer-to-melee range, then healer ID. The pair does not switch. The assigned healer holds within range two and attempts `moveTo(ally)` at range three to five. Its partner and all other creeps retain their existing movement decisions; healing-action selection is unchanged. Temporary partner fatigue pauses escort movement but consumes elapsed ticks.

Any living friendly injury releases the assignment **before movement selection in the same tick**, restoring existing injured-ally support. Partner loss/death or role loss, first-flag loss, no enemy within five of the melee, separation beyond five, enemy within three of the healer, or timeout also releases it. Acquisition tick T counts as tick one: escort is permitted through T+11 and released before escort movement at T+12. Release is final for the match; a tick-counter restart resets the one-attempt state. The ≤2 hold distance is a conservative coordination threshold, not a guarantee of safety, reachability, or future heal eligibility. At this original policy checkpoint, both this switch and one-scout allocation remained disabled for ordinary play.

When enabled, `healer-escort` console entries carry the running `buildId`, tick, partner IDs, and assignment or release reason. A separate assigned-healer execution entry reports `hold`, `fatigue-pause`, or `move-attempt`, the observed ally range, the target of an actual move attempt, and the **returned code from that same `moveTo` call**. No extra pathfinding or movement call is made for diagnostics. `OK` only means the API accepted that attempt; it does not prove displacement. The replay importer validates and retains these as typed manifest `otherEntries`; game-state JSONL remains unchanged. Older captures have no such decision evidence, and absence of an entry with the switch off is expected.

Local deterministic tests exercise the production planner and movement executor, including default-off equivalence, selection/ties and persistence, fatigue, injury precedence, role/partner/safety releases, timeout boundaries, unchanged healing actions, one movement command per creep, actual return-code reporting, and replay import. The MBFishhh comparison is fixed-snapshot counterfactual evidence only. At this local checkpoint, no enabled escort match had been played; live build identity, escort movement, available-console health, healer exposure, and strategic benefit were **unverified**. A later build-identified enabled match should compare support-range availability near first contact, observed movement progress and return codes, healer damage/loss, melee survival, flag ownership, and score with the disabled baseline, without treating one outcome as causal proof.

**Local validation at that checkpoint:** Both switch settings passed 42 focused tests and all 84 project tests, `npm run check`, `npm run build-id:check`, and `git diff --check`. The enabled source generated build ID `53b1e5396e1fca680f70d9c02a0ba9e64c9a96f2d8831e2f6c3b5fa0fc9b1567`; it had **not yet** been used in a live match. After restoring `oneHealerEscortExperiment = false` and keeping `oneScoutFlagExperiment = false`, the checked source generated ID `899673509bbbde58f794c4f210992fbe43e2f0c67ba478fd05a058d2804747b6`. These local checks establish selector, orchestration, and importer behavior under mocked Arena inputs, not real pathfinding, displacement, or outcome. The later enabled match is reviewed below.

### Synthetic readiness follow-up — 2026-09-30

The existing disabled experiment has an additional test-only readiness checkpoint; no production source or configuration changed. A tick-98-shaped counterfactual fixture uses the assessed positions of `pg_player2_melee_1` at (48,48) and `pg_player2_healer_2` at (49,52), plus the assessed healer_3/melee_1 range of two. Its concrete healer_3 coordinate, enemy placement, flag ownership, health, body, and fatigue values are explicitly synthetic eligibility conditions. Under those conditions the production planner deterministically selects healer_3/melee_1 and holds at range two.

An isolated module-boundary configuration exercises production `runTick()` with healer escort enabled and scout allocation disabled. Its fixed trace shows that only the selected healer's permitted pre-injury movement target differs from the disabled baseline; other movement targets and ordering remain fixed, no actor receives duplicate movement, and the synthetic inputs are not mutated. A following synthetic injury releases the escort before movement selection, restores the normal in-range hold and `rangedHeal`, and leaves combat selection unchanged. Executor tests correlate the decision with the one actual `moveTo` attempt and retain both a numeric failure and an unavailable numeric return (`null`). At this readiness checkpoint, production tests separately asserted that both checked-in switches remained `false`.

This establishes synthetic readiness for a separately authorized activation task only. It does not demonstrate live movement, healing effectiveness, prevented damage, strategic benefit, or win-rate improvement; activation and build-identified live validation remain separate work.

### Prepared activation checkpoint — 2026-09-30

After readiness commit `a94cde9decb0dc06d4e6bd7ef0adb4467c364ca6`, the local production configuration enables only `oneHealerEscortExperiment`; `oneScoutFlagExperiment` remains `false`. No selector, movement, healing, combat, membership, release, evidence, or instrumentation policy changes. The generated runtime build ID is `d225796d627b52c037262fb1d91f7e4963f996e17b8227abb0f8d3cefbbb5a3e`, distinct from the preceding disabled ID `09eba928208ff65843cb8e15bd68f0e8167ae84e1e1a303dfbc6addc5c6bca23`.

The production-config integration trace now exercises the enabled path directly; a separate isolated module-boundary test retains the disabled first-flag baseline. Synthetic readiness is unchanged. This checkpoint prepares code for review only: no match has been launched, live escort behavior and healing effectiveness remain unverified, and no strategic-benefit or win-rate claim is made.

### Distant-injury continuation refinement — 2026-09-30

The later [activation validation](healer-escort-activation-validation-2026-09-30.md) observed two relevant release cases under the original policy. In replay `6abd4b55f59cc836df103cc1`, tick 126 released a healthy assigned pair at range two because an unrelated friendly 44 tiles from the assigned healer was injured; ordinary movement and healing could not reach that injury. In replay `6abd4bc9f59cc86e8f103cc8`, tick 43 released after the assigned melee was injured at range three and ordinary `rangedHeal` was restored. These observations motivate narrowing only the continuation release predicate, not extending the timeout.

The prepared rule still releases when the assigned healer or melee is injured. Another injured friendly releases the pair only when it is within five tiles, inclusive, of the assigned healer—the same outer distance at which ordinary healer movement can approach an injured ally. More distant unrelated injury alone retains the pair. The global acquisition gate remains unchanged: any living friendly injury blocks a new assignment. Pair selection, persistence, safety releases, timeout, fatigue, hold/move distances, healing and combat selection, command order, and diagnostic formats are unchanged.

Synthetic tests cover injury distances one through nine and a tick-126-shaped fixed-snapshot counterfactual in which the healthy pair holds at range two despite the remote injury. Only the range relationship and healthy-pair shape are carried from the assessment; concrete synthetic fixture fields are not historical facts, and the result is not an alternate replay trajectory. The refinement has not been exercised live and does not establish prevented damage, healing effectiveness, strategic benefit, or win-rate improvement.

### Two scanned matches after the local escort implementation

The two distinct, active-opponent replays are **disabled-build baseline evidence, not live validation of escort**. Every raw `game-state` entry, imported JSONL record, response manifest record, and replay association carries `899673509bbbde58f794c4f210992fbe43e2f0c67ba478fd05a058d2804747b6`, the locally checked ID for **both experiments false**. The enabled escort ID above is absent; neither match has a `healer-escort` diagnostic. Matching the emitted ID to the recorded source fingerprint supports configuration provenance more strongly than today's checkout alone. It does not show that an enabled build ran.

| Replay and opponent | Available integrity and result evidence | Observed support and flag state |
| --- | --- | --- |
| `6ababe3096aad136d8fae403` — **OoPaul壞神oO v22**, ours `player2` | Four log chunks cover ticks **1–379** without gaps/duplicates; five retained replay-frame chunks cover gameTime **0–380**. Map `pain_and_gain_map_2026-09-28T19-29-24-989Z.json`, checksum `7da8691448f44f2c3670af4c8a3d21b000dc11f1a0486312991836e009f44440`. Cached game metadata says `finished`, winner index 0 (`player1`); the terminal frame has **0 owned versus 10 enemy survivors**, so this is a **defeat despite 1,690–10 points**. | First flag neutral through tick 40, ours 41–377, enemy-owned 378–379, ours again in the terminal frame. First owned injury appears at tick 38; melee first injured at tick 40. All four owned melee and all three healers disappear or die by the terminal frame. |
| `6ababe3796aad17ed5fae404` — **temik911 v66**, ours `player1` | Nineteen log chunks cover ticks **1–1870** without gaps/duplicates; twenty replay-frame chunks cover gameTime **0–1871**. Map `pain_and_gain_map_2026-09-28T19-29-25-381Z.json`, checksum `72c82e7e542ac35118559d087d94cd7de7851b1c6707b77fd13857a44300eb02`. The cached game-metadata response is stale (`running`, 1,700 ticks). The terminal frame shows **9,165–12,435**, all **14 owned and 14 enemy creeps alive**. Given the user's confirmation the match completed, the 3,270-point deficit with at most 129 ticks remaining and a rules-based maximum 25 points/tick makes **defeat by score** the supported inference; no fresh result label was available. | First flag ours from tick 39 through all available snapshots and the terminal frame. No owned injury or melee/enemy range-five engagement occurs in ticks 1–1870; closest owned melee/enemy range is 20. No healing opportunity or escort eligibility was observed. |

All 23 managed log chunks were claimed and marked `examined` under `codex/healer-escort-two-match-review-20260928`, with `completedAt: null` and earlier claims untouched; none was marked `done` or deleted. Every source cache response matched its manifest fingerprint, build ID, coverage, original JSONL bytes and saved output hash; each response linked to its replay's active map. Both maps contain 10,000 terrain cells and seven non-creep objects, with embedded, registered, recalculated, and map-bearing-response checksums agreeing. The 23 preserved raw `/log` responses have **zero other console entries beyond game-state and one map-state entry per replay**; no error was found there. The replay UI's full console list was not independently traversed (the existing Replay control did not open the replay), so full-console and terminal-tick logging remain unverified; a missing terminal game-state line is not treated as an error.

In the OoPaul replay, at pre-action tick **38** injured `pg_player2_ranged_4` (1,140 hits, position 49,50) had healers at ranges 3 and 1; replay-frame gameTime 38 records `rangedHeal` and `heal` markers aimed at (49,50), and the next snapshot reports 1,186 hits. This is direct evidence of resolved healing markers and recovery, but not an escort action or an API return code. At tick **40** injured `pg_player2_melee_3` (1,540/1,600 hits, 49,47) had `healer_3` at range 3; gameTime 40 records its `rangedHeal` marker toward that position. Healers 1 and 3 first show damage at tick 83 and healer 2 at tick 207; all are absent or dead by terminal time. Across the recorded pre-action states, **90 injured melee creep/tick states** had no living pure healer within range three, versus **269** with one within range three. These ranges describe opportunities, not issued movement commands or causation.

A fixed-snapshot run of the **production escort planner** on this disabled replay would acquire `pg_player2_healer_2` with `pg_player2_melee_3` at tick **195** (healthy, first flag ours, ally range 2: hold), approach at tick **196** (ally range 3), then release at tick **197** because another owned creep is injured. Recorded `healer_2` remains at (47,50) while melee_3 moves (48,48) at tick 195 → (47,47) at 196 → (46,46) at 197; the gameTime-197 frame records `healer_2` using `rangedHeal` toward (47,48). These are **counterfactual selector objectives on unchanged disabled-build snapshots**, observed baseline displacement, and a separate healing marker—not enabled escort commands, `moveTo` returns, or evidence that escort would have prevented the defeat. The same planner finds no acquisition in the temik911 snapshots.

**Verdicts:** Capture/map/build integrity **passed** for both available replays. Live escort assignment, assigned-healer hold/move/fatigue-pause, and escort release are **unobserved** because both emitted the disabled build and no escort diagnostics. Baseline healing markers and positional changes are observed only as stated above; no escort `moveTo` call or return code is available. Available cached-console error check **passed for captured ticks 1–379 and 1–1870** (no error entries); full UI-console and terminal-tick coverage remain **unverified**. Neither match establishes an enabled-build behavior or strategic benefit.

**Post-review source state:** `oneHealerEscortExperiment = false` and `oneScoutFlagExperiment = false` were already set, so no runtime edit was needed. Regenerating and checking the build artifact returned the unchanged disabled ID `899673509bbbde58f794c4f210992fbe43e2f0c67ba478fd05a058d2804747b6`; `npm run check`, all **84/84** tests, and `git diff --check` passed. No new match, policy change, review completion, evidence cleanup, commit, or push occurred.

### Enabled escort replay: `6abac47d96aad168e8fae4ce`

The next user-run active-opponent match was created at **2026-09-28 19:48:13.053 UTC** according to its cached game metadata, not its later import time. The opponent was **dd v5**; our controlled side was `player2` (`my: true` in the snapshots). Metadata reports a finished **108-tick** game with winner index 0 (`player1`, dd). The terminal replay frame shows **defeat**, despite a **330–12** score lead: no owned creeps survived versus ten enemy creeps. This single unmatched game is not a measurement of escort benefit.

Before restoration, both experiment switches were checked: healer escort `true`, scout allocation `false`. `npm run build-id:check` passed with enabled ID `53b1e5396e1fca680f70d9c02a0ba9e64c9a96f2d8831e2f6c3b5fa0fc9b1567`. Both raw `/log` responses, all 107 original game-state lines, their imported JSONL files, both manifest response records, and the active replay association carry that ID. The response fingerprints and saved-file SHA-256 hashes match the manifest; the imported lines exactly match the raw console strings. The two managed chunks cover **ticks 1–100 and 101–107**, without gaps or duplicates. The replay-frame responses cover gameTime 0–108. The manifest links both chunks to `pain_and_gain_map_2026-09-28T19-48-41-083Z.json`; its embedded, registered, response-linked, and recalculated payload checksums agree at `a047c1b43fcbd2fb0ac279afe0314fe4c42bb1a3439b5457d08a66c6d9937b5d`. It contains 10,000 terrain cells, seven non-creep flags, and no creeps. **Build and capture/map integrity: passed.** The emitted ID identifies the logged runtime bytes; the Arena directory selection was not independently observed for this match.

**Escort eligibility and behavior:** The first flag was neutral through pre-action tick 42 and ours from tick 43. At tick 36, healthy `pg_player2_melee_2` at (53,52) was five tiles from the nearest enemy, with `pg_player2_healer_3` at (51,52), two tiles away; ownership already barred acquisition. At tick 37, melee_2 was at (52,51), enemy range three, healer_3 at (51,51), range one, while the flag was still neutral. Friendly injury first appears at tick 38 (`healer_3` fell to 1,080/1,200), before first-flag ownership. From tick 43 onward, a living owned creep was injured except at ticks 95 and 104; neither exception had a functioning owned melee. Replaying the production escort planner chronologically on these recorded pre-action states, with engagement state carried forward, selects **no pair**. This is a selector reconstruction, not a logged decision. The raw responses contain **no `healer-escort` diagnostic**, consistent with no assignment. Assignment, escort `moveTo` return codes, hold, fatigue pause, and release are therefore **unexercised live**, not passed or failed. No actual escort command or successful escort displacement can be attributed.

For support context rather than an escort outcome, all **32** recorded injured owned melee creep/tick states had a living functioning healer within ranged-heal distance three; 13 had one within direct-heal distance one. At tick 38, `healer_3` at (50,50) was itself injured; replay-frame gameTime 37 has an `attacked` marker on it, and gameTime 38 has its `heal` marker aimed at (50,50). Such markers and subsequent health changes indicate resolved combat/healing activity, not bot command traces or API return codes. The first flag stayed ours in the recorded remainder, but all owned creeps were gone by terminal frame 108. This match neither reproduces the MBFishhh pre-injury support gap nor tests the escort branch.

The two preserved raw log responses contain one map entry, 107 game-state entries, and **zero other entries**, including no visible error text. The existing Replay control did not open the UI console during this review, so the complete UI list was not independently inspected. **Available captured-console check: passed for ticks 1–107 with no error entries; full UI-console and terminal-tick logging remain unverified.** The absence of a tick-108 logger entry is not treated as a defect. Both managed chunks were claimed for `codex/healer-escort-enabled-live-review-20260928` and marked `examined`, not `done`; captures, map, associations, and prior review claims remain intact.

**Restored default:** Only `oneHealerEscortExperiment` was changed back to `false`; `oneScoutFlagExperiment` remained `false`. Regeneration and `npm run build-id:check` returned the expected disabled ID `899673509bbbde58f794c4f210992fbe43e2f0c67ba478fd05a058d2804747b6`, distinct from the enabled replay ID. `npm run check`, all **84/84** tests (`npm test`; reported duration 1,563.99 ms), and `git diff --check` passed. No strategy policy, captured evidence, map, prior review, or runtime threshold was changed, and no additional match, review completion, cleanup, commit, or push occurred. **Live escort behavior remains unobserved** because this enabled match did not reach its acquisition conditions; the disabled build's local checks do not validate an enabled live branch.

**Checkpoint acceptance:** The user explicitly accepts this residual live-behavior uncertainty for committing the disabled experiment. That acceptance is not a passed escort-action test, a full-console attestation, or evidence of strategic benefit; any future opt-in evaluation needs its own build-identified match that actually exercises assignment and execution.

## Frontline and healing investigation close-out — 2026-09-28

The five retained, build-identified replays below were aligned by **first contact**: a living enemy within range five of a living owned creep with a functioning weapon. Ten action intervals mean contact through contact+9; the contact+10 pre-action snapshot shows their resulting state. The **first exposed melee** is the earliest owned melee with functioning ATTACK inside a living enemy's functioning weapon range (ATTACK ≤1 or RANGED_ATTACK ≤3); simultaneous qualifiers are all listed. The Dr Neir contact previously reported as tick 45 is **corrected to tick 46**: minimum armed-friendly/enemy range at tick 45 was six. Its action intervals are 46–55, with snapshot 56 as the endpoint. All five began contact with 14 creeps and 32 functioning ATTACK parts per side.

| Replay, opponent, emitted build | First exposed melee and early exchange | Owned ATTACK parts and survivors at contact+10 |
| --- | --- | --- |
| `6aba933f6fdfd1efc170b522`, あぶらむし v3, `0f52fec9…` | Contact 36; `melee_2` and `melee_3` exposed at 38. The former had an adjacent healer; the latter an adjacent melee and scout. No enemy attack marker or owned injury in action intervals 36–45. | 32→32; 14 alive at snapshot 46. |
| `6aba94706fdfd148cc70b56e`, Dr Neir v66, `0f52fec9…` | Contact **46**; `melee_3` and `melee_4` exposed at 47, each beside a healer but neither beside a melee. At most two enemy attack markers shared a target coordinate in any interval 46–55; healing markers targeted injured `melee_3` from 48. | 32→27; 14 alive at snapshot **56**. |
| `6aba85516fdfd126c670b262`, MBFishhh v24, `0f52fec9…` | Contact 93; `melee_1` exposed at 95 with no adjacent owned creep and nearest healer at range four. Three enemy attack markers targeted it at 95, five at 96; no healing marker targeted it through 97. It fell from 1,600 hits/eight ATTACK parts at 95 to 610/zero at 97. | 32→4; 13 alive at snapshot 103. |
| `6ababe3096aad136d8fae403`, OoPaul壞神oO v22, `89967350…` | Contact 36; `melee_2`, `_3`, and `_4` exposed at 39. At 40, `melee_3` had two adjacent owned melee and a healer at range three; four enemy attack markers and that healer's `rangedHeal` marker targeted it. At 41, enemy focus shifted to `melee_2` (five markers), while `healer_3` still targeted `melee_3`. | 32→15; 14 alive at snapshot 46 despite severe part loss. |
| `6abac47d96aad168e8fae4ce`, dd v5, `53b1e539…` | Contact 36; `melee_2` was first exposed at 37 **with an adjacent healer**, but had no adjacent owned creep during the focused assault at 40. Seven then eight enemy attack markers targeted it at 40–41. It fell from 1,600 hits/eight ATTACK parts at 40 to 830/one at 41 and was absent at 42. | 32→16; 12 alive at snapshot 46. |

Isolation at the decisive attack co-occurred with rapid opening losses against MBFishhh and dd, but does not distinguish outcomes alone: dd's first exposure had adjacent healer support, the Dr Neir front had little adjacent melee support without a death, and OoPaul lost many parts despite adjacent melee. High attack-marker concentration better tracks rapid part loss, yet OoPaul's five-marker focus did not cause an opening death. Healing availability and allocation differed: the MBFishhh healers were out of range at the first injuries; OoPaul had a healthy healer in range of an already-injured melee; dd's nearby healer was itself injured. These are associations, not proof that different positioning or healing would prevent a defeat. The opponents and maps differ, as do the builds: MBFishhh and both victories emitted `0f52fec97d0e9d72caf11611a55f87a2f2bd8bb8a15433ad7500b7b9b2437ce8`; OoPaul emitted disabled-escort `899673509bbbde58f794c4f210992fbe43e2f0c67ba478fd05a058d2804747b6`; dd emitted enabled-escort `53b1e5396e1fca680f70d9c02a0ba9e64c9a96f2d8831e2f6c3b5fa0fc9b1567` but never acquired a pair. Local occupancy, terrain, and vulnerability-flag ownership also differed. The earlier accepted **unexercised live escort** verdict is unchanged.

The focused healing audit used the actual [healing selector](../../src/tactics/healing.js), [nearest-target tie-breaker](../../src/tactics/targets.js), and [tactical executor](../../src/arena/execute.js) on pre-action snapshots, with functioning body parts cross-checked against preceding replay frames. The replay build IDs agree with the recorded disabled source and, for dd, its enabled-escort configuration. All **18** healer/tick selections matched the available same-interval replay-frame healing marker or its absence (nine in each replay):

| Pre-action ticks | Eligible focused melee and reconstructed selections | Frame and next-snapshot check |
| --- | --- | --- |
| dd 39–41 | `melee_2` was full-health at 39–40, so damage later in tick 40 could not make it a healing target then. At 41 it had 830/1,600 hits: healer 1 was at range four, healer 2 at six, and injured healer 3 at two. Healer 3 had four functioning HEAL parts and selected **self**, as the [rule](../../src/tactics/healing.js) requires before considering other allies. Healer 1 selected the nearer injured healer 3; healer 2 had no eligible target. | The three healers' markers or absence matched at each tick. `melee_2` was absent at snapshot 42; no marker targeted it before death. |
| OoPaul 40–42 | Injured `melee_3` was in healthy healer 3's range three at 40–41, so it selected `rangedHeal`; healers 1 and 2 had no target within three. At 42, healthy healers 1 and 3 had injured `melee_2` and `_3` equally at range three; deterministic ID order selected `melee_2`. Healer 2 again had no in-range target. | All nine selections matched markers or their absence. `melee_3` changed from 1,164 hits at snapshot 41 to 1,188 at 42; `melee_2` still fell from 1,028 at 42 to 691 at 43 despite two healing markers. |

The existing rule therefore explains the observed allocation: self-healing first, then the nearest injured ally within three, with ID tie-breaking; it does **not** rank targets by injury severity. The executor schedules healing before compatible attacks; `rangedHeal` excludes attacks, and `heal` excludes melee attack. All three healers in these windows were pure HEAL/MOVE creeps, so attack compatibility did not change their selections. Pre-action snapshots show eligibility, the production selector reconstruction shows what it would choose, and replay-frame markers show resolved action types and target coordinates—not bot command traces or API return codes. Net health changes cannot isolate healing from simultaneous damage or establish a counterfactual survival benefit. **Investigation closed with no selector defect and no supported healing or positioning policy change.** This analytical close-out does not mark managed replay reviews `done`: captures, maps, and open review claims remain preserved for their separate lifecycle.

## One-match scout-allocation handoff — 2026-09-28

The disabled-build replay `6ababe3796aad17ed5fae404` against temik911 v66 motivated one bounded trial: after our first flag became owned at tick 39, the army stayed nearby while the opponent's later 7-to-5 points-per-tick advantage produced a confirmed 9,165–12,435 defeat. A terrain-only route estimate suggested a possible scout diversion, but did not establish Arena `searchPath` results, an eligible assignment, or a counterfactual outcome.

At handoff for the then-pending **single user-run active-opponent match**, `oneScoutFlagExperiment = true` and `oneHealerEscortExperiment = false`. No allocation policy or threshold was changed; enemy arrival must remain **strictly greater** than scout route steps plus five, so equality rejects. The generated and checked runtime build ID was `d1022765c3b97d0bb55c311eac9fab932e1970553e4664e83e427ae2185932ba`, distinct from the disabled ID `899673509bbbde58f794c4f210992fbe43e2f0c67ba478fd05a058d2804747b6`. `npm run build-id:check`, `npm run check`, all **84/84** tests, and `git diff --check` passed before launch. Arena directory selection and live behavior were pending at handoff; the enabled runtime was kept unchanged through the captured match and review below.

### One-match review — `6abad54f694bbd0e4ecb70df`

Cached game metadata identifies the single new match as bushdoctor2008 v13 versus active opponent **temik911 v190**, created at 2026-09-28 20:59:59.756 UTC. It reports `finished`, winner index 0 (temik911). Owned creeps are `pg_player1_*` (`my: true` in the snapshots). The terminal gameTime-68 replay frame shows **defeat by army elimination** despite our **150–27** score lead: zero owned creeps versus 14 enemy creeps. Replay frames cover gameTime 0–68 without gaps. The selected Arena directory was not independently observed for this match, but the running code emitted the exact pre-launch enabled build ID.

The single managed JSONL file `6abad54f694bbd0e4ecb70df.jsonl` preserves 67 original pre-action snapshots (ticks 1–67, no gaps or duplicates) byte-for-byte from the cached `/log/68` response. Its SHA-256 matches manifest `outputFingerprint` `df9d98b42dae0acc7855a446b28ec98f43b104b032387dcb62abad6df446c153`; the raw response fingerprint matches `31464bb6b43601284877e3b5d28faf97e49b86ce11dac59b3f3dff8fda1b3902`. The raw map entry, all 67 tick entries, all eight typed allocation diagnostics, the managed record, and replay association carry enabled build ID `d1022765c3b97d0bb55c311eac9fab932e1970553e4664e83e427ae2185932ba`. Associated map `pain_and_gain_map_2026-09-28T21-00-35-257Z.json` contains 10,000 terrain cells, seven non-creep flags, and no creeps; its embedded, registered, response-linked, and recalculated canonical checksum agree at `1a8483a5543cd3cfa62ed1f7224cec537885fc85ee6bd34218f731f89d52241b`. **Build and capture/map integrity: passed.**

**Recorded allocation:** The tick-1 rejection was `first-flag-not-owned`. At ticks 39–42, after first-flag ownership, `pg_player1_scout_2` was selected but both neutral attack-reduction targets failed the strict enemy-arrival gate. At tick 39, actual `searchPath` results for flag A were scout length 21, cost 42, complete, versus enemy `scout_1` length 24; eligibility required enemy steps **>26**. Flag B gave scout length 23, cost 46, complete, versus enemy `melee_1` length 23; required **>28**. At tick 42 flag B again failed on equality: enemy `scout_2` length 28 versus required **>28**. At tick **43**, the planner logged one **assignment** of `scout_2` to flag A at (67,31): its complete route was length **17**, cost **34**, ops **22**; enemy `scout_1` had a complete length-**23**, cost-**46** route, exceeding the strict **>22** threshold by one step. Flag B still failed on equality (enemy 27 versus required **>27**). At tick **44**, enemy `pg_player2_melee_4` reached range five of our first flag, and the diagnostic logged **cancellation** (`first-flag-threatened`, state `finished`, first-flag fallback). Tick 45 logged `attempt-finished`. There is no `retain` or `complete` event. Later identical route-free rejections are intentionally suppressed; game-state ticks are continuous.

**Observed effects and limits:** `scout_2` moved from (50,45) at pre-action tick 43 to (51,44) at tick 44, one tile nearer flag A (range 17→16) and farther from the first flag (4→5), consistent with the assigned objective. This does **not** log a `moveTo` command or API return, and later displacement cannot be attributed to the cancellation alone. It was back within one tile of the first flag by tick 50. The first vulnerability flag was ours in snapshots 39–67 and terminal frame 68; neither attack-reduction flag was captured, so this match had **zero second-flag uptime and no army-wide ATTACK reduction from one**. The opponent captured a ranged-reduction flag in replay frame 59. Owned survivors fell from 14 at frame 51 to 0 at frame 67; enemy survivors remained 14. The first-flag gain was five points/tick and the opponent's later gain three. An assignment and immediate safety cancellation are observed, but capture, completion, the ATTACK-penalty tradeoff, and strategic benefit are **unexercised**.

The preserved `/log/68` console response has one `map-state`, 67 `game-state`, eight typed `flag-allocation` entries, and **no other or error entries**. Thus no errors were found in available captured output through tick 67; the full Arena UI console was not independently inspected, and a missing terminal-tick logger entry at 68 is not treated as a defect. The managed chunk was claimed for `codex/scout-allocation-one-match-review-20260928` and is to remain retained and `examined`, not `done`; prior claims, captures, and map registrations remain unchanged. One unmatched, short match does not establish an improvement over the disabled baseline, and no further match or policy relaxation is requested.

**Restored default:** After review, only `oneScoutFlagExperiment` was returned to `false`; `oneHealerEscortExperiment` remained `false`. Regeneration and `npm run build-id:check` returned the expected disabled build ID `899673509bbbde58f794c4f210992fbe43e2f0c67ba478fd05a058d2804747b6`. `npm run check`, all **84/84** tests, and `git diff --check` passed. This disabled ID does not identify the enabled replay. The review's managed record remains claimed and `examined` without completion or cleanup; no policy threshold, capture, map, or unrelated file was changed.

## Offensive-targeting audit — `6abad54f694bbd0e4ecb70df`

The completed audit of the same scout-enabled replay used **first contact at pre-action tick 43**: a living enemy was within range five of a living owned creep with a functioning weapon. It examined the ten action intervals **43–52** and their resulting pre-action snapshot **53**. Historical combat selection was checked against the replay's emitted build ID above; this is not an audit of today's disabled configuration. The production [combat selector](../../src/tactics/combat.js), [target ordering](../../src/tactics/targets.js), and [action executor](../../src/arena/execute.js) were reconstructed from each pre-action state, then compared with the corresponding replay-frame action markers at the selected targets' pre-action coordinates.

Across **76 armed friendly creep/tick states**, all **38 selected attacks** matched the actor's attack marker and target coordinate; the other **38** had no eligible in-range attack and no attack marker. There was no selector/marker discrepancy. The first two contact ticks (43–44) had no eligible in-range attack. Of the 38 selected attacks, **30** targeted enemy `melee_2` or `melee_4`; both survived this window. Enemy functioning ATTACK parts fell **32→15** by snapshot 53, while ours fell **32→0**. Enemy healing markers, including repeated healing of `melee_4`, and simultaneous combat limit interpretation of net health and part changes.

Reconstructed selections are **not issued-command traces**. Replay markers identify action types and target coordinates, not API return codes or damage amounts; net health and body-part changes cannot isolate individual attacks from simultaneous damage and healing. Agreement in this window establishes consistency with the existing selector, **not** policy optimality, strategic benefit, or the cause of the defeat. The replay's build-provenance, full-UI-console, and terminal-tick logging limitations stated in the one-match review still apply. **Decision: no targeting change or further match is justified by this audit.** The managed capture remains claimed and examined, not `done`; this documentation close-out does not complete its replay review or clean up evidence.

## Offline equal-range ranged spillover — 2026-10-16

Status: test-side comparison completed; recommend a narrowly bounded trial
candidate after separate runtime integration, validation and authorization.
This is not a selector bug fix, deployed policy or launch-ready runtime change.

The [first-contact audit](/Users/zoltanka/.local/share/pain-and-gain-evidence/first-contact-targeting-audit-20261016-izMPzC/report.json)
of replay `6ad152e374ae4378a665afb2` found all 39 attacks at ticks 37–44
consistent with the current nearest-range/raw-ID policy, accepted returns and
resolved markers. At tick 43, enemy melee 2 had 412 HP, five functioning MOVE
parts and no weapon. Three earlier accepted melee intents offered 570 nominal
damage. Four ranged attacks added 210, while armed melee 3 at (48,48) was
equally reachable. Neither target had a functioning enemy healer within three.

### Test-only contract

`tests/fixtures/ranged-spillover-candidate.js` reuses the deployed combat,
healing and nearest-target selectors. It can replace only a single-target
ranged selection with a living enemy at the **same nearest range**, choosing
the existing smallest ID among eligible alternatives. The default must already
be nominally covered by earlier compatible accepted melee intents, and the
alternative must not be covered by those intents. Melee selection, healing,
movement, mass attacks, action order and exclusions remain unchanged.

Accounting consumes the original ordered attempt prefix before the current
decision, not a separate melee-first pass. Only current-tick `attack` returns
equal to numeric `0` qualify; current-actor melee cannot precede its own ranged
decision. Recompute eligibility, functioning ATTACK count, adjacency, healing
compatibility and unchanged melee target. Count an exact repeated action ID
once. Conflicting IDs, multiple distinct accepted attacks by one actor, future
or out-of-order events disable spillover. No ledger survives a tick reset.

The deliberately conservative experiment supports only explicitly neutral
friendly ATTACK/RANGED_ATTACK, enemy damage-taken and enemy HEAL modifiers,
complete known rosters and no functioning enemy HEAL within range three of
either target. Missing data or unsupported modifiers retain baseline selection;
they never imply zero healing or neutral damage. Our vulnerability flag at
tick 43 affects incoming damage only and does not invalidate these outgoing
neutral conditions. Finite bounds are 14 units per roster, 50 body parts per
unit and 64 earlier observations; exceeding them disables spillover without
truncation. Only melee intents fund coverage: redirected ranged intents are
not reservations, so this is not a general anti-overkill or focus-fire planner.

### Recorded tick-43 comparison

The pinned `tests/fixtures/ranged-spillover-tick43.json` retains the complete
pre-action roster and actual tactical event order. Positive mock body HP is a
functioning-count sentinel, not reconstructed per-part HP. All 14 baseline
combat decisions and eight original attack calls reproduce. The table uses
friendly actor names and enemy target names; A/R counts are functioning parts.

| Friendly actor | Weapon / range | Nominal damage | Baseline target | Test candidate target |
| --- | --- | ---: | --- | --- |
| melee 1 | 8 A / 1 | 240 | melee 2 | melee 2 |
| melee 2 | 3 A / 1 | 90 | melee 1 | melee 1 |
| melee 3 | 3 A / 1 | 90 | melee 2 | melee 2 |
| melee 4 | 8 A / 1 | 240 | melee 2 | melee 2 |
| ranged 1 | 6 R / 3 | 60 | melee 2 | melee 3 |
| ranged 3 | 6 R / 3 | 60 | melee 2 | melee 3 |
| ranged 4 | 6 R / 2 | 60 | melee 2 | melee 3 |
| ranged 5 | 3 R / 2 | 30 | melee 2 | melee 3 |

Four ranged choices change without movement or range changes. Baseline nominal
allocation M1=90/M2=780 becomes M1=90/M2=570/M3=210, total 870 in both.
M2's 570 exceeds recorded HP by 158; the baseline excess was 368.
These are arithmetic comparisons, **not proven wasted damage**.
Single-target ranged attacks use 10 per functioning part throughout range 1–3,
not mass-attack falloff. M3 had 1,168 HP and four functioning ATTACK parts.

Only unchanged original melee returns fund this counterfactual comparison.
No redirected ranged command was issued or assumed accepted. Scheduled melee
may not realize the nominal budget: simultaneous resolution, capability changes
and unsupported effects could leave M2 alive after ranged fire moves away.
Exact nominal coverage deliberately qualifies in generated checks and has no
safety margin. Nearby healing/unsupported modifiers disable the experiment,
but do not convert accepted scheduling into guaranteed damage. Multiple ranged
redirects can still over-concentrate elsewhere because they are not reserved.

Recommendation: trial this guarded idea rather than adopt it. The comparison
moves 210 potential damage toward an armed target while retaining 570 potential
on the original 412-HP target, with no movement or range cost in this snapshot.
That is sufficient for a separately authorized experimental runtime candidate,
not evidence of an alternative kill, prevented casualty or gameplay benefit.
No runtime integration, live trial, deployment switch or next task is authorized
by this offline result.

### Focused validation and preservation

On resident Node 24.19.0, the explicit spillover experiment plus existing
tactics checks passed 21 tests. Generated cases cover insufficient/exact/excess
coverage, duplicate and incompatible/rejected intents, interleaved actor order,
tick reset, healing, modifiers, stable equal-range fallback and finite bounds.
The retained initial run had a fixture reference-comparison failure; a separate
replacement-intent regression then exposed and corrected test-side accounting.
Both failures are retained. No deployed code changed to pass these checks.

```sh
node --max-old-space-size=256 --test tests/unit/ranged-spillover-experiment.test.js \
  tests/unit/tactics.test.js
```

Runtime and build remain unchanged:
`4896ef3596bcca45755413fa8d090a7518bb1ece2ed8d416ea17461109e89215`.
No build regeneration, full suite, replay-response reread, managed manifest
access or match occurred. Existing healing experiments and historical
disclosures are preserved.

[Comparison, failures and scoped preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/ranged-spillover-experiment-20261016-Iw0mnX/report.json).

## Runtime equal-range ranged spillover trial candidate — 2026-10-16

Status: integrated and locally checked; ready for one separately operator-run
random Fame trial, not launched or promoted. The preceding test-only experiment
remains an independent archived oracle. Current candidate build:
`c14daba6f8c054218bbe32d3c3f890fdb3fa467b4615a91ec9fdf3af3924b07f`.
Source directory:
`/Users/zoltanka/Documents/Prog/JavaScript/ScreepsArena/pain_and_gain/src`.

### Live assumptions and execution

`src/loop.js` passes its existing full observation to `executeTactics`.
`createSpilloverContext` in `src/tactics/combat.js` validates the live roster
partition and all seven flags: unique IDs, live objects, supported effect counts,
positions, scoring rates and documented ownership values. Arena's
`getObjectsByPrototype(Creep)` returns all creeps; completeness relies on that
existing API query, not an inferred fixed survivor count or an arbitrary
selected snapshot. Known live units require recorded integer health/positions,
body data and range access. Null or sparse body entries disable the live context
before the accepted kernel runs; missing parts never imply absence of HEAL.
The documented neutral `Flag.my` value is
`undefined`; false means enemy-owned. There are no extra Arena queries.

Explicit friendly melee/ranged, enemy damage-taken and enemy healing modifiers
must all equal 1. Own vulnerability affects incoming damage only. Unknown,
incomplete, stale, oversized or inconsistent observations keep baseline attack
targets. A functioning enemy healer within three of either target disables
that spillover. Bounds remain 14 units per side, 50 parts per unit and 64 earlier
observations (plus the full-observation bounds of 28 creeps/seven flags).
The actual loop can issue at most 28 combat calls for 14 mixed-weapon actors.

The executor's local call-order prefix is updated only after each original
combat call returns. Numeric `0` compatible melee counts once per actor. It does
not trust logging callbacks or move anyone into a separate melee-first pass;
mixed actors still select ranged before melee. Exact duplicate observations
count once; ambiguous accepted replacements disable spillover. Each invocation
starts empty, including new ticks and match resets. Overflow retains one invalid
sentinel rather than truncating into a valid budget. Earlier ranged calls never
fund coverage, and no ranged reservations are added.

The promoted kernel matches the accepted test-side candidate except for bounded
diagnostic reasons. Existing `action-decision` records distinguish
`ranged-spillover` from `ranged-spillover-fallback` (including guarded or
insufficient-budget cases). Original baseline/no-action reasons remain when
there is no ranged action, or no observation was supplied. Attempts retain the
actual method, target and return. No new record type, count or logger was added.

### Verification and limits

44 explicit affected checks passed on Node 24.19.0: real `runTick` integration,
the existing tactical/tick-flow paths, replay-evidence logging, game-state logging
and ordinary movement fallback. The real tick fixture reproduces all eight
baseline attack calls, then makes the four expected redirects with unchanged
movement/healing calls and actual scheduling order. Generated cases cover
accepted/rejected/unknown returns, interleaved actors, tick/reset isolation,
exact/insufficient/excess coverage, enemy healing, modifiers, incomplete flags
and roster data, duplicates/replacements and finite limits. Two additional
null/sparse enemy-body regressions failed before the live-boundary correction
and pass afterward; the failed run is retained. The earlier 21
experiment checks are reused, not recounted as new runtime checks.

`npm run build-id:generate`, `npm run build-id:check` and `npm run check`
passed. Runtime imports remain local to `src/` or existing Arena-provided
modules; no Node/test dependency enters runtime. IDE inspections found no errors.
Three weak duplicate-code warnings reflect the preserved experiment oracle;
the pre-existing `arenaInfo` import-resolution warning remains. No blanket
suppression was added. Live CPU/headroom and gameplay effects remain unmeasured.

All four deployment switches are unchanged: allocation off, escort on, holding
and pairing off. Healing and movement source are unchanged. There is no new
deployment switch: this source build is the experimental candidate.
The baseline build before this task was
`4896ef3596bcca45755413fa8d090a7518bb1ece2ed8d416ea17461109e89215`.

### One future trial and exact rollback

Only after separate operator launch approval: confirm Arena's selected source
directory above and the emitted candidate build, then play one random Fame match.
Use existing bounded diagnostics to identify actual redirects/fallbacks,
preceding accepted melee, shared ranges and subsequent target HP/parts. Record
supporting enemy-healer access, casualties, central defence, score/outcome and
sampled CPU/headroom. Separate selected commands, numeric returns, resolved
markers and observed effects; unexercised branches remain unexercised. Accepted
melee and exact nominal coverage do not guarantee elimination. The original
target may survive; ranged fire may over-concentrate elsewhere. No automatic
second match, promotion or threshold change follows this task.

After that trial ends or is abandoned, rollback only with workspace ownership
and unchanged candidate inputs. Check residency first. Require the candidate
build above and all four current runtime hashes in `rollback-c14-pins.json` to
match; also hash the added test against this task receipt. Stop if any source,
test or runtime inventory has changed. Never use a blanket Git restore.

The retained `runtime-c14-change.patch` reverses only this task's changes to
`src/tactics/combat.js`, `src/arena/execute.js`, `src/loop.js` and the generated
build artifact, preserving earlier dirty work. Its reverse check passed without
applying it. From the repository root, after those pin checks and explicit
rollback authority:

```sh
/usr/bin/patch -C -R -p1 -F0 -t -i /Users/zoltanka/.local/share/pain-and-gain-evidence/ranged-spillover-runtime-20261016-PJHfho/runtime-c14-change.patch
# Only if the check succeeds, apply that same scoped reversal:
/usr/bin/patch -R -p1 -F0 -t -i /Users/zoltanka/.local/share/pain-and-gain-evidence/ranged-spillover-runtime-20261016-PJHfho/runtime-c14-change.patch
```

Retain the new candidate-specific test outside the active `tests/unit` suite
before baseline testing: after verifying its receipt hash and that the destination
is absent, move only `tests/unit/ranged-spillover-flow.test.js` to
`/Users/zoltanka/.local/share/pain-and-gain-evidence/ranged-spillover-runtime-20261016-PJHfho/archived-ranged-spillover-flow.test.js`.
Do not move pre-existing tests or experiment fixtures. This preserves the new
test without leaving named imports of removed candidate APIs in the baseline suite.
Keep this policy/history and the trial receipt, recording the actual rollback
separately; they are not runtime inputs.

Then, with the resident Node 24.19.0 bin directory first in PATH, run
`npm run build-id:generate`, `npm run build-id:check` and `npm run check`.
The restored ID must exactly equal the baseline ID above; otherwise stop.
No rollback, match, original-response read, manifest access or Git mutation
was performed during candidate preparation.

[Runtime checks, source pins, rollback artifacts and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/ranged-spillover-runtime-20261016-PJHfho/report.json).

## Pure-ranged melee spacing — 2026-10-16

One movement correction is implemented; no match or gameplay benefit is claimed.
Baseline: `c14daba6f8c054218bbe32d3c3f890fdb3fa467b4615a91ec9fdf3af3924b07f`.
New candidate: `411650f86bacec4876fd32e472c983fbed6b5a8a65e8053c2c22d5ce72871a9c`.
Allocation stays off, escort on, scout holding/pairing off. The rejected rally
and melee shared-target experiments are not extended or promoted.

### Demonstrated holds

Replay `6ad152e374ae4378a665afb2`, Golden Eagle v19, emitted historical build
`4896ef3596bcca45755413fa8d090a7518bb1ece2ed8d416ea17461109e89215`.
Its movement code matches the baseline above; later ranged spillover does not
change these movement holds. Retained states/actions establish:

| Pre-action tick | Pure ranged actor / position | Recorded hold / next snapshot | Free plain escape tiles |
| --- | --- | --- | --- |
| 40 | ranged 5 (48,50), 960 HP | no move; still there at 41, 798 HP | (48,51), (49,51) |
| 41 | ranged 4 (49,50), 1,200 HP | no move; still there at 42, 1,020 HP | (49,51), (50,51) |
| 41 | ranged 5 (48,50), 798 HP | no move; still there at 42, 822 HP | (49,51) |

Each was adjacent to functioning enemy ATTACK and selected `combat-in-range`.
These tiles avoid every current melee envelope, enter no new functioning ranged
envelope and retain ranged reach. HP deltas do not identify individual damage or
establish what a retreat would change. Snapshot tick N aligns with frame N−1.

The retained review lacked terrain rows. Only its pinned resident `/log/86`
Chromium response was additionally read (75,477 bytes, SHA-256
`950bbae376d04b5fa70303c4ee3f66e79a129f2f664defb68e80784e472b4678`).
Original path identity/metadata, length and hash were checked; the existing parser
verified replay/build and map checksum
`4dea7cdacc0594a8e59e97c42f56f9a3c3430bce8bdadea6dff66126c13c42e3`.
Reads were bounded to 1 MiB raw/16 MiB decoded, 64 KiB buffers, 180 seconds,
256 MiB heap/512 MiB RSS. No other original responses or dataless manifest were
read; no hydration or managed claim/examined/done mutation is asserted. Cooperative
metadata/open checks are not atomic OS-level protection. Source bytes are unchanged.

### Narrow local retreat

Only a living owned, zero-fatigue actor with functioning MOVE/RANGED_ATTACK and
no ATTACK or HEAL parts (even destroyed ones) may replace its in-range hold with
`ranged-melee-retreat`, when a living enemy has functioning ATTACK within one.
Inspect at most eight neighbours, stable y then x. Require bounds 0–99, known
plain terrain (Arena value 0), no currently living occupant (even if vacating),
no earlier retreat reservation, no functioning enemy ATTACK within one, and no
functioning enemy RANGED_ATTACK newly within three. Walls, swamps and unknown
terrain reject; avoiding swamps avoids new swamp fatigue. Existing ranged fire
may remain. Keep the selected ordinary target within three: it is already at
most one away, so a legal one-cell retreat preserves ranged reach without changing
attack selection. Single-target ranged attacks have full power through three.

The loop supplies complete observed creep occupancy and `getTerrainAt`; direct
callers lacking that context retain old behavior. Use one adjacent-goal `moveTo`
through the existing executor. No explicit extra path search, threat map, timer,
waiting budget, target latch or new controller is added. The default moveTo
options are unchanged. Bound rosters to 28 occupants/14 enemies and checked
bodies to 50 parts. Added local work is eight bounded neighbour/roster scans,
not a measured live CPU bound or guaranteed pathfinding result.

Escort and paired ownership win before this rule. Hybrids, attack/healing
selection, melee waits/rejoin and deployment switches are unchanged. Reserve a
retreat destination for this executor invocation even on a rejected/unknown
return, preventing two retreats selecting it; rebuild reservations next tick.
This does not reserve ordinary movement or predict enemies. No eligible tile
means retain the old hold, not a knowingly unsafe step. Outside current melee
range the ordinary standoff resumes; there is no new advance back into adjacency.

### Validation and trade-offs

The historical regression fails before correction and chooses from the verified
escape sets afterward. Generated successive observations exercise retreat →
standoff without bouncing, blocked/unsafe destinations, new ranged exposure,
unknown/swamp terrain, hybrids, fatigue/lost MOVE, bounds, deterministic choice,
rejected commands, exclusive destinations and escort/pair ownership. Real tick
flow reports a correlated numeric-zero retreat while still scheduling the ranged
attack. Generated displacement is not an observed Arena effect.

65 focused checks passed on Node 24.19.0, covering new spacing/tick flow and
existing movement, tactics, melee support/rejoin, escort and spillover. Build
generation/check and `npm run check` passed. Failing-before evidence is retained;
an added pair-owner fixture initially omitted required context and was corrected
without weakening production ownership handling.

Local TypeScript `xxscreeps` invader `flee.ts` and `apex-v3` `kiteAway` separate
movement from attacks and consider armed threats, but use World Room/PathFinder
APIs and broad searches. They are not Arena-compatible drop-ins or authoritative
resolution models. No code/dependencies/TypeScript were copied; the small local
spacing idea was adapted in plain JavaScript.

Retreat may lose healing access, pressure or flag progress and remain under ranged
fire. Congestion can leave no exit; earlier actors may reserve another's sole
exit. No formation-wide allocation is introduced. Other movement can conflict
with the chosen cell, and an enemy may close simultaneously. Accepted commands,
projected safety and observed effects are distinct. A separately authorized live
trial must verify emitted build, retreat returns/displacement, following enemy
motion, attacks/healing, flag progress and CPU samples. No prevented casualty or
gameplay benefit follows from these checks; no match is launched here.

[Analysis, regressions, commands and preservation receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/ranged-spacing-20261016-8GbYaj/report.json).

### Adjacent escape support preference — 2026-10-17

The [production support/cycling audit](adjacent-ranged-retreat-support-audit-2026-10-17.md)
demonstrated an avoidable healing-access loss between two otherwise legal
escapes. The current implementation prefers a support-preserving cell within
the same eight-cell scan without regaining ranged exposure avoided by the
original first choice. If none exists, it retains that original emergency
escape. Adjacency, tactics, ownership and all deployment switches are unchanged;
independent healer movement and reactive pursuit cycles remain explicit limits.
