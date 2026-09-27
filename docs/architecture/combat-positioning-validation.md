# Combat-positioning validation — 2026-09-27

Status: Local review and replay comparison complete; live verification of the exact candidate is outstanding. No improved match outcome is established.

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

A new live match must confirm the selected project `src/` directory, changed approach/hold behavior, and no runtime errors with the current-tick-only console filter off. Record its replay ID and code provenance. Arena automation initially exposed the Fame page, then failed before a fresh match could be confirmed. A later check confirmed the selected `src/` directory but could not activate Rating; no new match evidence was obtained. No code correctness blocker was found in the reviewed movement selector; runtime validation remains a required commit gate. The four examined captures were subsequently completed and cleaned up after their findings were preserved in the [map-linked replay review](replay-review-2026-09-27.md) and [ADR 0003](../decisions/0003-replay-informed-strategy-proposals.md). Both saved maps and the replay associations' retired fingerprints remain; log-review completion does not waive the live gate.

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

The native Arena interface exposed Test Mode with only an `Idle opponent` test game, which cannot exercise the combat branch. During further navigation, its accessibility state changed while its screenshot remained on an older Fame screen, and one action returned `noWindowsAvailable`. No new replay was confirmed during that attempt. At that point the live validation verdict remained **inconclusive**. The two previously imported combat replays assessed below add behavior evidence, but still do not establish match-specific code provenance. Do not commit or push the movement candidate on this evidence.

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

**Gate verdict: inconclusive.** Both replays exercise the candidate's combat branch on recorded states, and the second provides strong movement evidence distinguishable from the flag-only baseline. They do not establish that this exact staged revision and selected code directory were loaded for either match. The zero `otherEntries` cover only imported responses. A contemporaneous record of code-directory selection and runtime revision for either match, or another match with those recorded plus combat-range snapshots and console-error inspection, is needed before the movement-only commit and push gate can pass. A win or improved result is not required.

After these findings were saved, both the prior import-verification claim and this analysis claim were explicitly marked `done` for each of the three records. The utility removed their managed JSONL files and records after hash-checked cleanup. The two validated map files and active replay associations remain, with one and two retired fingerprints respectively. No other review owner was present or completed on their behalf; review cleanup does not change the inconclusive movement gate.
