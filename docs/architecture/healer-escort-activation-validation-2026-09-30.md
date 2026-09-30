# Healer-escort activation validation — 2026-09-30

## Scope and status

Arena's cached five-row games response identifies five displayed replays. This
checkpoint reviews all five. Each selected response carries runtime build ID
`d225796d627b52c037262fb1d91f7e4963f996e17b8227abb0f8d3cefbbb5a3e`, which
matches the runtime source at activation commit
`0945cfd77bb9126bd15de301c1af19c5e7290892`. The responses do not embed the Git
commit SHA.
That build enables `oneHealerEscortExperiment` and keeps
`oneScoutFlagExperiment` disabled.

Every replay now covers every expected pre-terminal tick. The two initially
missing series appeared after the existing replays were played through with the
console visible: System replay `6abd4b08f59cc85495103cbb` now has exact request
keys `/log/100` through `/log/1600` at 100-tick intervals plus `/log/1674`, and
replay `6abd4b55f59cc836df103cc1` against `宰` v16 has `/log/100` through
`/log/1600` plus `/log/1675`. Their response bodies cover ticks 1–1,673 and
1–1,674 respectively. This is complete pre-terminal capture, not proof that the
runtime logged on the displayed terminal tick.

The expanded evidence supports keeping the experiment enabled for further
observation. Three replays exercise deterministic single-pair assignment and
holds; two also exercise accepted escort movement with following displacement
and persistence. Friendly-injury and timeout releases occur without an analyzer
failure. It does not establish healing causality, prevented damage, strategic
benefit, or improved win rate.

## Discovery and match metadata

Recent regular Arena cache files were inspected read-only for supported
`/api/game/<replay-id>/log/<tick>` keys. Cache timestamps were used only as
discovery clues. Exact cached `/api/game/<replay-id>` metadata identified four
matches. The fifth identity was resolved from the cached five-item
`/api/fame/6a86d8c454a3948a1e35f90c/games` response, which supplies the replay ID,
players, versions, result, creation time, and displayed tick count. A later
exact-key pass found all 17 expected response requests for each long replay;
identity is supported by replay-specific metadata and emitted build evidence,
not timestamps or list position alone.

| Replay | Created (UTC) | Match | Result | UI/API ticks | Captured snapshots and complete closures |
| --- | --- | --- | --- | ---: | --- |
| `6abd4b08f59cc85495103cbb` | 2026-09-30 17:46:48.139 | bushdoctor2008 v16 vs System | Victory | 1,674 | 1–1,673 |
| `6abd4b55f59cc836df103cc1` | 2026-09-30 17:48:05.163 | bushdoctor2008 v16 vs 宰 v16 | Victory | 1,675 | 1–1,674 |
| `6abd4b71b72ca0479ca0b9a5` | 2026-09-30 17:48:33.783 | bushdoctor2008 v16 vs charcock v37 | Victory | 160 | 1–159 |
| `6abd4bc9f59cc86e8f103cc8` | 2026-09-30 17:50:01.256 | bushdoctor2008 v16 vs raznikk v7 | Victory | 1,674 | 1–1,673 |
| `6abd4cecf59cc8172b103ce2` | 2026-09-30 17:54:52.595 | bushdoctor2008 v16 vs charcock v99 | Defeat | 81 | 1–80 |

Older cache candidates, including disabled-build replay
`6abd2590212b1d5ce6ae89a0`, were excluded from activation conclusions and were
not imported or re-reviewed by this task.

## Evidence identity and integrity

All selected responses carry the expected activation build. Each replay has one
active map association. Embedded, registered, and recalculated canonical map
checksums agree; the separate saved-file hashes below cover the complete saved
map bytes.

| Replay | Response fingerprints | Map checksum | Saved map and byte SHA-256 |
| --- | --- | --- | --- |
| `6abd4b08f59cc85495103cbb` | `990f764b6528a0f35bb7e10b4dee3680c54d9584ae6d47d25f726a1c0e31a08d`<br>`8bf971ba2533586b4741ae93e67201af1900930653808756d02cdafd85589186`<br>`135be98edb86934bcc5e1709a448f6e4c69802df7c6fb9903125ad34481412a8`<br>`3633f1408663a7ca282c994e05afeda9a50e7cd90c347d9fe25edf48bc031a57`<br>`f509028fd3e05a6c3157c3e5b0af03424f094d6505ea0469b6115c6c1f767654`<br>`5b2d6e84279ac52e32005769233c1a4a18c0fae6c3c20c2282906380c15ed461`<br>`107479c828122d527f1cc3cdd98d636ed63b494ff524cfcbe897de602c97912d`<br>`ab9e3daa6a09e29184a7a25052d72fcdb5db7f8c7940b4614dfaa8397b53d721`<br>`16cce6a3cfe409bcda30c377989176fc5dfa305016584b0c60a29dc6b69bd1e5`<br>`a21259834492c9d5bffd17ac8ee25f3afecd5c67eb4fbd32c8fe5177e262b56c`<br>`ea2215d78d75757de2b039215495c64bea81824e14daac41377c012a1aa692d3`<br>`8ebbba94df6c9418e387d410007c083ffce95fd0d24c6cfaff1a2b603c9a0096`<br>`b30e102d9a900fd11247210b7dc745b133885539e636a179c8632defe6120387`<br>`e30429a0fa92df3d7fec481c2bde3d78b14ff1915d7901b2afa64dab51b486d1`<br>`a13ba664d8c3059023b91cc39d5da0f50157d59dd17dc7b366f558c5955ef0ea`<br>`617c5208f1a698798620325bdfeef78330aa1ae8514a04205bff578117da6144`<br>`695bb8535f7745eb3a1cd64f5e0ea3dc8dce07fd2396bba735d1e1ab3260970e` | `91c4e334df35c77aefd9f159eeaa5a06fc2f38e31fdbfcf4931579eff919c813` | `pain_and_gain_map_2026-09-30T18-00-47-123Z.json`<br>`808fbe38815722a8a3c1d760df7d985a6efb0926c1628eeec9dd0cfc8840946e` |
| `6abd4b55f59cc836df103cc1` | `abf462bd630f0a80efbff8c0b3583a7989c19b656d2f10c0df845ed2ab5f78ea`<br>`684e7e8cb433ef11404fcafbd89e376d43b1be06d82a87231850ac51ea7ad224`<br>`0df3669b78b49fe1b6b5e79744d6c9ba47ab158852a28e8089ae9d070bcf11ca`<br>`1f0676b0a859109e84e59a686aab35d0e34e58fc72b9ecee99223d3f8a2a821b`<br>`dd5c00b162c1b1eed570b4cf8ec0e33f6c017998f629319b38d274a736a61a51`<br>`e0599683c8c2ae0695014515140291d02d37cafb967961fb9af1935e6662e941`<br>`f0eb73df90915352e0a150b8126e8ead62202063bff14d535159079eb7f13a50`<br>`7639b2e87eebfee7d249ce7e0eb92fdc1ffdc6d51fe8b036446d4f104bf9cd4f`<br>`905d0240bbac7e0a5a280d32a5535598c5fad4b2808977de91498ddb11335496`<br>`79964a665bb05e20d117ef59f8088b7c3a83485d79aceb244803c48a03802074`<br>`0b56f368a3bbe7c25d3d3a22ae223b224af5c81998dd9ed0f377d959ddd9cbe2`<br>`890e7f8ff2b69cccf7dd778ad7fb2c8239fcfc27154e9dd570bdd28e4979def6`<br>`6cb01e3ae9667809c43ca91c3fc276f5b6278b31e912c84e58cde8cd8e1b7ed7`<br>`3e686a48864be619fd8042b0801d49fafe64e94c7d5c7bcf4ac285bd1c2020f8`<br>`900efc77bff9a1b50ae8c6dd76435e39790a77795a86e36f22012bf103fd6ef9`<br>`9f75aa0cf494dc0c573337f59460358da5257fd2a56f268a151f27390b9ba8e1`<br>`84f6ad027b09aa488d42bdf4f8b54649126c1c8d0cacbb7ef8ec61821a750c35` | `7ad705e4086207af07b4b2e159b119549ef144db6d5dd90b62e56368d2dcb27e` | `pain_and_gain_map_2026-09-30T18-29-01-942Z.json`<br>`687dbc205b7eea2bae76cf23433fbac8beeb3ad29f2bf7400d29a07453d9ece7` |
| `6abd4b71b72ca0479ca0b9a5` | `f3370aa4d701ae17000925a84a0ff029c942a3202e5bddd1e5ef8f718132b564`<br>`b62df125ec1eafea3ee51bc9b67e76a33588a9fe1fca970c44625ccee7aa599b` | `ad1b0e95fb5ec5d38789a8b873f27f345c496972a87d80ecf517db9fdddd518a` | `pain_and_gain_map_2026-09-30T18-00-48-436Z.json`<br>`947ba2521c43ec16797ac9d99460a03ad323de8c8dd3abb222c3ffee8ab1424d` |
| `6abd4bc9f59cc86e8f103cc8` | `01f0e3f62bbbd4c6889c255b29c8704a36b1545e08476d8156672a860d5900e4`<br>`b753064ed43c596a3a2cc857cf4e52622a1a90778165b16741d6a96162f0808d`<br>`ffbae357e532f7ed34e9a8d887fc37492745733622e1bb1e5d448fcf7367c824`<br>`819550b4c84bde9716b1bb10ab96e8789f4d74297390cf65c1cb92794c540ef1`<br>`6a8bd550bc450c053e7ddb7cee65e5563dc16fcfec84bb4112d67e7981c02869`<br>`83604b13582f3548e390f0e8f1b277c18409136d76d0f750c622189ff7c337b1`<br>`0cf7a44dcf15f2622c56bceae8b371adfe8e57548baf4e7714fbc9216f362064`<br>`d84261ed0d727871a2838a8fc704bd15f5c96b37d65eae4ebd6011c73ac81d85`<br>`a99018807166a0c3dd7a7198a8a34385948bcff78c0dae84bc0a9c0562c5dfc3`<br>`9f210d0a22c7f1e711ef742f23a9a60298bd58a6c1f6d1df20f35929a406a72a`<br>`b8db28c3a0468e6af36bdf3eadfa6b9e19adfdc6f2dfbb768b498f93d32481d5`<br>`93aec7d272819ed556263ed366e84ee841030a000025105ebb9a9e672fb32d3b`<br>`7bf7804647affa03a72f444a5760cada13cbf0009b479060bc6b42b964771803`<br>`9543c4cb29b8bf63670b77a21b723017649e2a86d9e85c680fbca969ca65d374`<br>`fe36be4aa6202b8c0fb0032a643aceade8381f9f9111b38227399de7f9528fba`<br>`206ac81f3952c052f85cb75c20d80c8d0c22563762f5dd4c3422e334ad6ed20c`<br>`d4f0af170e22839c3913e67f82b4bf47a68a047042a590b2365f80d797f4847e` | `212251b990a723428c371e440c0cd13f32d011d5c6bcf0f39b5e111cfae9d148` | `pain_and_gain_map_2026-09-30T18-00-49-102Z.json`<br>`a67540776dd553c48daec910db3328c7d782d628ecf81ea2eedc7cd3e2b90f6b` |
| `6abd4cecf59cc8172b103ce2` | `37efd19257fd2b172cbb983bcfd21b059453bf6496aec8f884f30a2b9ff12dbd` | `202f5744ea4344ca90ea46128f62399cfa9accc9c6984cce5ee1ff427217b669` | `pain_and_gain_map_2026-09-30T18-00-58-042Z.json`<br>`20cb6e027b289298825f5f1e2d8594e557da1038904f50bbc9c9aa1af2f46c37` |

Within every captured range, snapshots and version-2 closures are contiguous;
coverage declares diagnostic versions 1 and 2 and covers membership, action,
and CPU records. There are no response overlaps, snapshot gaps, missing
closures, duplicate record IDs, diagnostic conflicts, or correlation issues.
The analyzer reports zero failures. Its unknowns are unavailable next-snapshot
movement or health comparisons: terminal captured ticks, plus health comparisons
when an individual creep is absent from the next snapshot. They do not imply
death, a failed command, or missing whole-tick coverage.

## Escort observations

### Replay `6abd4b71b72ca0479ca0b9a5`

At tick 139 the first flag was ours, no owned creep was injured, and the only
eligible pair was `pg_player1_healer_2` with `pg_player1_melee_2`. The recorded
assignment at response reference
`b62df125ec1eafea3ee51bc9b67e76a33588a9fe1fca970c44625ccee7aa599b/139:2`
matches that deterministic ranking: the healer/ally range was one, the ally's
nearest-enemy range was five, and the healer's was six.

The pair persisted for the permitted twelve ticks, 139–150. It held at ranges
one or two on ticks 139, 140, 142, and 143. It recorded one correlated
`moveTo(melee_2)` attempt with return code 0 on each of ticks 141 and 144–150.
Every one of those eight attempts was followed by healer displacement in the
next consecutive snapshot. API acceptance and following displacement are
separate observations; neither proves the command caused the engine outcome.
At tick 151, reference
`b62df125ec1eafea3ee51bc9b67e76a33588a9fe1fca970c44625ccee7aa599b/151:2`
records `release/timeout` before movement selection. The healer then selected
the ordinary first-flag fallback and had no injured healing target in range.

### Replay `6abd4bc9f59cc86e8f103cc8`

At tick 39 the first flag was ours and no owned creep was injured. Two eligible
pairs shared `pg_player1_melee_3`; `pg_player1_healer_3` was ranked first at
range two ahead of healer_1 at range four. The ally's nearest-enemy range was
five and healer_3's was seven. The assignment is recorded at
`01f0e3f62bbbd4c6889c255b29c8704a36b1545e08476d8156672a860d5900e4/39:2`.

The assigned healer held at range two on tick 39, then made one correlated
`moveTo(melee_3)` attempt with return code 0 on each of ticks 40–42. Consecutive
snapshots show healer displacement after all three attempts. At tick 43,
`melee_3` was injured at 1,468/1,600 hits. Reference
`01f0e3f62bbbd4c6889c255b29c8704a36b1545e08476d8156672a860d5900e4/43:3`
records `release/friendly-injured` before movement selection. The healer's
ordinary movement decision then held for `injured-ally-in-range`, followed by
a correlated `rangedHeal(melee_3)` attempt with return code 0. This validates
release precedence and restoration of ordinary support scheduling, not the
engine's healing effect or causality for a later health change.

### Replay `6abd4b55f59cc836df103cc1`

At tick 125 the first flag was ours, no owned creep was injured, and the
deterministic selector assigned `pg_player2_healer_3` to
`pg_player2_melee_2`. The pair was adjacent at (49,49)/(49,48); the melee
creep's nearest enemy was at range five and the healer's at range six.
Under response fingerprint
`684e7e8cb433ef11404fcafbd89e376d43b1be06d82a87231850ac51ea7ad224`,
key `125:2` records the assignment and key `125:29` records its in-range hold.
The corresponding movement decision at key `125:28` is an explicit
`escort-in-range` hold, so no movement attempt was expected or made.

At tick 126, `pg_player2_ranged_5` was observed injured at 1,134/1,200 hits.
Key `126:2` records `release/friendly-injured` before movement
selection. The former escort healer then used ordinary movement selection:
key `126:28` selected first-flag fallback and key `126:29` records its single
`moveTo` attempt with return code 0. The injured creep was outside that healer's
healing range, so key `126:57` records `no-injured-target-in-range`; this
validates release precedence without claiming that this healer scheduled a heal.
API acceptance remains scheduling evidence only.

### Unexercised paths

Replays `6abd4cecf59cc8172b103ce2` (complete pre-terminal capture) and
`6abd4b08f59cc85495103cbb` (complete pre-terminal capture) contain no escort
assignment record. No selected replay exercises
`fatigue-pause`, partner/role/flag loss, engagement-ended, separation,
healer-exposed, or tick-counter reset. These remain unknown, not failures.
Across complete diagnostic ticks there is no actor/tick with duplicate movement
attempts, and every selected escort action has exactly one matching attempt.

## CPU and diagnostic volume

Diagnostic volume counts each retained raw diagnostic JSON string encoded as
UTF-8 plus one LF. Because the selected chunks do not overlap, captured and
canonical-deduplicated totals are equal.

| Replay | Diagnostic records / LF-framed bytes | Tick 1 elapsed / headroom (ns) | Ordinary samples | Median / nearest-rank p95 (ns) | Maximum elapsed (tick) / minimum headroom (ns) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `6abd4b08f59cc85495103cbb` | 97,035 / 35,931,090 | 13,465,524 / 986,534,476 | 1,672 | 8,839,024 / 9,416,979 | 45,998,787 (216) / 54,001,213 |
| `6abd4b55f59cc836df103cc1` | 97,227 / 35,992,777 | 13,310,228 / 986,689,772 | 1,673 | 7,816,714 / 8,738,899 | 23,908,365 (524) / 76,091,635 |
| `6abd4b71b72ca0479ca0b9a5` | 5,341 / 1,957,013 | 13,683,249 / 986,316,751 | 158 | 736,691.5 / 5,104,157 | 9,551,990 (112) / 90,448,010 |
| `6abd4bc9f59cc86e8f103cc8` | 90,804 / 33,646,585 | 13,626,696 / 986,373,304 | 1,672 | 6,462,944 / 6,766,477 | 22,976,785 (1,654) / 77,023,215 |
| `6abd4cecf59cc8172b103ce2` | 3,728 / 1,372,904 | 14,587,272 / 985,412,728 | 79 | 2,202,797 / 6,364,193 | 6,694,674 (5) / 93,305,326 |

All ordinary samples use the 100,000,000 ns limit; tick one uses the
1,000,000,000 ns first-tick limit. Headroom is the unclamped difference at the
sampling point. The sample excludes construction/emission of its own CPU
record, closure emission, and later work, and is neither exact final-tick CPU
nor differential diagnostic overhead. Every captured tick has one sample; an
uncaptured tick is not zero and does not prove a timeout. No runtime-error entry
was observed in the captured output, but the displayed terminal ticks and output
outside the cached responses are not established.

Representative serialization sizes are:

- replay `6abd4b08f59cc85495103cbb`: tick 1, 59 records/24,928 bytes; tick 1,673,
  58/21,607;
- replay `6abd4b55f59cc836df103cc1`: tick 1, 59 records/24,928 bytes; assignment
  tick 125, 59/21,406; injury release tick 126, 59/21,624; tick 1,674,
  58/21,607;
- replay `6abd4b71b72ca0479ca0b9a5`: assignment tick 139, 23/8,184; timeout tick
  151, 23/8,387; tick 159, 22/8,093;
- replay `6abd4bc9f59cc86e8f103cc8`: assignment tick 39, 59/21,250; injury-release
  tick 43, 60/21,777; tick 1,673, 54/20,125;
- replay `6abd4cecf59cc8172b103ce2`: tick 80, 7/2,585.

These are serialization measurements, not CPU-overhead measurements.

## Deterministic local reports

Each analyzer command was run twice with the same explicit fingerprints. Both
outputs for every replay were byte-identical. The retained reports are ignored,
local-only artifacts; a repository clone alone cannot reproduce them without
the retained manifest, maps, JSONL, and diagnostic entries.

| Replay | Analyzer pass/fail/unknown | Local report | Bytes | SHA-256 |
| --- | ---: | --- | ---: | --- |
| `6abd4b08f59cc85495103cbb` (preserved partial) | 94,800 / 0 / 42 | `replay_logs/replay-analysis-6abd4b08f59cc85495103cbb.json` | 112,002,530 | `8fa16405ae5a656da8d9c6df5ede0c108fc4bfcbae4debe49e98a7c6d47b8b35` |
| `6abd4b08f59cc85495103cbb` (expanded) | 264,400 / 0 / 42 | `replay_logs/replay-analysis-6abd4b08f59cc85495103cbb-expanded-20260930.json` | 313,450,307 | `641c4c5ca764d1d6524aad4c1a789e3df953ed484f57b1ab9d1bd631034ce909` |
| `6abd4b55f59cc836df103cc1` | 246,669 / 0 / 42 | `replay_logs/replay-analysis-6abd4b55f59cc836df103cc1-expanded-20260930.json` | 294,801,689 | `a61cd29473c31734e9a2d82bf4068431bcf550f68488b86a4aea71c07902e0eb` |
| `6abd4b71b72ca0479ca0b9a5` | 15,218 / 0 / 40 | `replay_logs/replay-analysis-6abd4b71b72ca0479ca0b9a5.json` | 17,672,721 | `42e2232a1ca5e9395622c68330aaa4efe6b2cda66db52ee7eb4e085ef02e5497` |
| `6abd4bc9f59cc86e8f103cc8` | 232,017 / 0 / 42 | `replay_logs/replay-analysis-6abd4bc9f59cc86e8f103cc8.json` | 277,000,139 | `77cd39daeeb9e12d0a0c098bc2c058e6c7832d69226652a43782167e7ed541e3` |
| `6abd4cecf59cc8172b103ce2` | 10,603 / 0 / 42 | `replay_logs/replay-analysis-6abd4cecf59cc8172b103ce2.json` | 12,297,731 | `e2f329a7f4ba4f6dd3c520f5511e7082080f36adb74fd417ea9f6cc4922958af` |

Reproduction commands (redirect to new temporary paths; do not overwrite the
retained reports):

```sh
node tools/replay-analysis.js 6abd4b08f59cc85495103cbb \
  990f764b6528a0f35bb7e10b4dee3680c54d9584ae6d47d25f726a1c0e31a08d \
  8bf971ba2533586b4741ae93e67201af1900930653808756d02cdafd85589186 \
  135be98edb86934bcc5e1709a448f6e4c69802df7c6fb9903125ad34481412a8 \
  3633f1408663a7ca282c994e05afeda9a50e7cd90c347d9fe25edf48bc031a57 \
  f509028fd3e05a6c3157c3e5b0af03424f094d6505ea0469b6115c6c1f767654 \
  5b2d6e84279ac52e32005769233c1a4a18c0fae6c3c20c2282906380c15ed461 \
  107479c828122d527f1cc3cdd98d636ed63b494ff524cfcbe897de602c97912d \
  ab9e3daa6a09e29184a7a25052d72fcdb5db7f8c7940b4614dfaa8397b53d721 \
  16cce6a3cfe409bcda30c377989176fc5dfa305016584b0c60a29dc6b69bd1e5 \
  a21259834492c9d5bffd17ac8ee25f3afecd5c67eb4fbd32c8fe5177e262b56c \
  ea2215d78d75757de2b039215495c64bea81824e14daac41377c012a1aa692d3 \
  8ebbba94df6c9418e387d410007c083ffce95fd0d24c6cfaff1a2b603c9a0096 \
  b30e102d9a900fd11247210b7dc745b133885539e636a179c8632defe6120387 \
  e30429a0fa92df3d7fec481c2bde3d78b14ff1915d7901b2afa64dab51b486d1 \
  a13ba664d8c3059023b91cc39d5da0f50157d59dd17dc7b366f558c5955ef0ea \
  617c5208f1a698798620325bdfeef78330aa1ae8514a04205bff578117da6144 \
  695bb8535f7745eb3a1cd64f5e0ea3dc8dce07fd2396bba735d1e1ab3260970e \
  > /tmp/replay-analysis-6abd4b08f59cc85495103cbb-expanded.json

node tools/replay-analysis.js 6abd4b55f59cc836df103cc1 \
  abf462bd630f0a80efbff8c0b3583a7989c19b656d2f10c0df845ed2ab5f78ea \
  684e7e8cb433ef11404fcafbd89e376d43b1be06d82a87231850ac51ea7ad224 \
  0df3669b78b49fe1b6b5e79744d6c9ba47ab158852a28e8089ae9d070bcf11ca \
  1f0676b0a859109e84e59a686aab35d0e34e58fc72b9ecee99223d3f8a2a821b \
  dd5c00b162c1b1eed570b4cf8ec0e33f6c017998f629319b38d274a736a61a51 \
  e0599683c8c2ae0695014515140291d02d37cafb967961fb9af1935e6662e941 \
  f0eb73df90915352e0a150b8126e8ead62202063bff14d535159079eb7f13a50 \
  7639b2e87eebfee7d249ce7e0eb92fdc1ffdc6d51fe8b036446d4f104bf9cd4f \
  905d0240bbac7e0a5a280d32a5535598c5fad4b2808977de91498ddb11335496 \
  79964a665bb05e20d117ef59f8088b7c3a83485d79aceb244803c48a03802074 \
  0b56f368a3bbe7c25d3d3a22ae223b224af5c81998dd9ed0f377d959ddd9cbe2 \
  890e7f8ff2b69cccf7dd778ad7fb2c8239fcfc27154e9dd570bdd28e4979def6 \
  6cb01e3ae9667809c43ca91c3fc276f5b6278b31e912c84e58cde8cd8e1b7ed7 \
  3e686a48864be619fd8042b0801d49fafe64e94c7d5c7bcf4ac285bd1c2020f8 \
  900efc77bff9a1b50ae8c6dd76435e39790a77795a86e36f22012bf103fd6ef9 \
  9f75aa0cf494dc0c573337f59460358da5257fd2a56f268a151f27390b9ba8e1 \
  84f6ad027b09aa488d42bdf4f8b54649126c1c8d0cacbb7ef8ec61821a750c35 \
  > /tmp/replay-analysis-6abd4b55f59cc836df103cc1-expanded.json

node tools/replay-analysis.js 6abd4b71b72ca0479ca0b9a5 \
  f3370aa4d701ae17000925a84a0ff029c942a3202e5bddd1e5ef8f718132b564 \
  b62df125ec1eafea3ee51bc9b67e76a33588a9fe1fca970c44625ccee7aa599b \
  > /tmp/replay-analysis-6abd4b71b72ca0479ca0b9a5.json

node tools/replay-analysis.js 6abd4bc9f59cc86e8f103cc8 \
  01f0e3f62bbbd4c6889c255b29c8704a36b1545e08476d8156672a860d5900e4 \
  b753064ed43c596a3a2cc857cf4e52622a1a90778165b16741d6a96162f0808d \
  ffbae357e532f7ed34e9a8d887fc37492745733622e1bb1e5d448fcf7367c824 \
  819550b4c84bde9716b1bb10ab96e8789f4d74297390cf65c1cb92794c540ef1 \
  6a8bd550bc450c053e7ddb7cee65e5563dc16fcfec84bb4112d67e7981c02869 \
  83604b13582f3548e390f0e8f1b277c18409136d76d0f750c622189ff7c337b1 \
  0cf7a44dcf15f2622c56bceae8b371adfe8e57548baf4e7714fbc9216f362064 \
  d84261ed0d727871a2838a8fc704bd15f5c96b37d65eae4ebd6011c73ac81d85 \
  a99018807166a0c3dd7a7198a8a34385948bcff78c0dae84bc0a9c0562c5dfc3 \
  9f210d0a22c7f1e711ef742f23a9a60298bd58a6c1f6d1df20f35929a406a72a \
  b8db28c3a0468e6af36bdf3eadfa6b9e19adfdc6f2dfbb768b498f93d32481d5 \
  93aec7d272819ed556263ed366e84ee841030a000025105ebb9a9e672fb32d3b \
  7bf7804647affa03a72f444a5760cada13cbf0009b479060bc6b42b964771803 \
  9543c4cb29b8bf63670b77a21b723017649e2a86d9e85c680fbca969ca65d374 \
  fe36be4aa6202b8c0fb0032a643aceade8381f9f9111b38227399de7f9528fba \
  206ac81f3952c052f85cb75c20d80c8d0c22563762f5dd4c3422e334ad6ed20c \
  d4f0af170e22839c3913e67f82b4bf47a68a047042a590b2365f80d797f4847e \
  > /tmp/replay-analysis-6abd4bc9f59cc86e8f103cc8.json

node tools/replay-analysis.js 6abd4cecf59cc8172b103ce2 \
  37efd19257fd2b172cbb983bcfd21b059453bf6496aec8f884f30a2b9ff12dbd \
  > /tmp/replay-analysis-6abd4cecf59cc8172b103ce2.json
```

## Lifecycle and remaining work

The original 26 exact response records and the 28 newly available responses
were imported individually, without `scan`, `watch`, `list`, reconciliation,
`done`, or cleanup. They were claimed under
`codex/healer-escort-live-0945cfd-20260930` before managed evidence was read.
The original records retain their prior examination checkpoints; the 28 new
records were marked `examined` only after this expanded checkpoint was saved.
All claims remain active with `completedAt: null`; all captures, maps,
associations, prior reports, and expanded reports remain retained. Existing
review owners were not changed.

The two cache gaps are resolved, so repeated playback is not requested. Across
the five replays, assignment, in-range hold, accepted escort movement,
persistence, friendly-injury release, timeout release, and restoration of
ordinary movement/support selection are exercised. `fatigue-pause`, the other
safety-release reasons, and tick-counter reset remain live-unexercised. Terminal
tick logging, command causality, healing effectiveness, and strategic benefit
also remain unknown. A future match is warranted only for a separately defined
gap or defect investigation, not to repeat this completed capture pass.
