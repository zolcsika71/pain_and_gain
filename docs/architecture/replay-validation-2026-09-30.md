# ADR 0004 M5 live validation — 2026-09-30

This checkpoint closes the bounded live-validation milestone in
[ADR 0004](../decisions/0004-replay-evidence-and-analysis-roadmap.md). It records
one user-launched match using the CPU-instrumented implementation committed as
`dee83ef74587d9e4d058f5d3f9574a7650fb9216`. It does not establish diagnostic
differential CPU cost, command causality, strategic benefit, or complete
terminal-tick evidence.

## Match and capture identity

- Replay: `6abd2590212b1d5ce6ae89a0`.
- User-reported UI: bushdoctor2008 v15 against temik911 v208, Defeat, final tick
  139, launched shortly before 17:12 on 2026-09-30 Europe/Budapest.
- The selected source-directory path was not independently recorded. The user
  observed the expected console build ID, and both imported responses, their
  replay association, and every tagged record identify build
  `09eba928208ff65843cb8e15bd68f0e8167ae84e1e1a303dfbc6addc5c6bca23`.
- Read-only cache-key discovery found exactly one recent candidate in the stated
  time window: request ticks 100 and 139 for this replay. Cache mtimes were
  approximately 17:14 Europe/Budapest; those times helped discovery but are not
  proof of match identity. The replay ID and requested final tick provide the
  stronger association.

The two exact responses were imported without `scan`, `watch`, or `list`:

| Requested tick | Cache entry | Response fingerprint | Managed JSONL | Observed snapshots |
| --- | --- | --- | --- | --- |
| 100 | `39e8e9266c562c68_0` | `6575a4c89d0f474f2e7d53af921998eddbeaf589600c082124cfd2d926a16f77` | `replay_logs/6abd2590212b1d5ce6ae89a0.jsonl` | 1–100 |
| 139 | `bc266630dc74526e_0` | `b4ff460d5277d9acd2de2047ffaf36880685d10ec3eeb0409421d3fce769ca7a` | `replay_logs/6abd2590212b1d5ce6ae89a0-b4ff460d5277.jsonl` | 101–138 |

The JSONL byte hashes are respectively
`1a12305f1787f76a7549129a524d0ce4a7fa5f2df61d1c51506f22c79e217483`
and `4ebd057597841bd059f5ff61459ae0908633f97d0d4bec22a982bdd84da05120`.
Both records link to `pain_and_gain_map_2026-09-30T15-20-12-030Z.json`, map ID
and canonical checksum
`6f0f00e8aa10ea337c867b5a707133d1f928d62b77a1f5a347ad867d162e411c`.
The analyzer recalculated that checksum and reported saved-map byte hash
`727d99a2cb47faac299c1bf841ac6b3bc0d4c7519f0a7d54a82bd5f2d2453ac7`.

## Reproducible analysis

Before reading the evidence, both responses were claimed by
`codex/m5-live-dee83ef-6abd2590-20260930`. The analyzer was then run twice with
the replay ID and the two full fingerprints above. Both invocations exited 0
and emitted byte-identical output: 24,341,471 bytes with SHA-256
`759ecda27bbcb1dff6b3450f10eb0aaab0f4b59a7ae60cda43bf77dc8c54cb54`.
The report is retained locally at
`replay_logs/replay-analysis-6abd2590212b1d5ce6ae89a0.json`; it is ignored and
is not published with the repository documentation. Its exact size is
24,341,471 bytes and its SHA-256 is
`759ecda27bbcb1dff6b3450f10eb0aaab0f4b59a7ae60cda43bf77dc8c54cb54`.
A repository clone alone cannot reproduce it because the selected manifest,
JSONL, and map evidence are also retained locally and ignored. With that local
evidence present, reproduce the report from the repository root without
overwriting the retained artifact:

```sh
m5_report_tmp="$(mktemp -t pain-and-gain-m5-analysis)"
node tools/replay-analysis.js 6abd2590212b1d5ce6ae89a0 \
  6575a4c89d0f474f2e7d53af921998eddbeaf589600c082124cfd2d926a16f77 \
  b4ff460d5277d9acd2de2047ffaf36880685d10ec3eeb0409421d3fce769ca7a \
  > "$m5_report_tmp"
wc -c "$m5_report_tmp"
shasum -a 256 "$m5_report_tmp"
```

The report contains 20,817 pass findings, no failures, and 42 unknowns. It
validates the manifest records, source/replay/build provenance, JSONL hashes and
schemas, map linkage and checksum, stored coverage summaries, and all 138
version-2 diagnostic closures. Snapshots and diagnostic coverage are contiguous
for ticks 1–138 with no overlaps, gaps, conflicts, duplicate record IDs, or
decision/attempt correlation issues. The 42 unknowns are 14 movement and 28
health comparisons whose actor is unavailable in the next consecutive snapshot;
the analyzer correctly does not infer displacement or a health delta after that
loss of evidence.

The UI reports final tick 139, while the `/log/139` response ends at pre-action
snapshot and complete diagnostic tick 138. Tick 139 execution, CPU, closure,
and terminal state are therefore unknown. This is not evidence of a timeout or
logging defect.

## Diagnostic volume

Volume counts the retained raw diagnostic JSON strings encoded as UTF-8 plus one
LF per record. It excludes the cache response object and escaping, cache framing,
game-state and map records, and manifest wrappers.

| Scope | Records | JSON bytes | JSON plus LF bytes |
| --- | ---: | ---: | ---: |
| Ticks 1–100 | 5,801 | 2,117,163 | 2,122,964 |
| Ticks 101–138 | 1,724 | 645,280 | 647,004 |
| Captured total | 7,525 | 2,762,443 | 2,769,968 |

The chunks do not overlap, so canonical deduplication leaves the same 7,525
records and 2,769,968 LF-framed bytes. Representative live ticks are tick 1 at
59 records/24,928 bytes, tick 10 at 58 records/21,207 bytes, tick 120 at 57
records/21,627 bytes, and tick 138 at 7 records/2,604 bytes. These are live
serialization measurements, not CPU-overhead measurements.

## CPU and timeout observations

Every captured tick 1–138 has one valid, build-matching `runtime-cpu` sample
immediately before its version-2 closure. Tick 1 records 13,744,281 ns elapsed
against the 1,000,000,000 ns first-tick limit, giving 986,255,719 ns of
sampling-point headroom.

For the 137 ordinary ticks, the 100,000,000 ns limit applies. Elapsed CPU has a
minimum of 313,630 ns, median 4,298,733 ns, arithmetic mean 5,717,600.993 ns,
nearest-rank p95 12,427,936 ns, and maximum 25,310,060 ns at tick 72. The
corresponding minimum observed sampling-point headroom is 74,689,940 ns at tick
72. No arbitrary pass threshold is applied.

These values measure elapsed execution only through the late sampler. They
exclude CPU-record construction/emission, the following coverage closure, and
later work. Headroom is unclamped `limitNs - elapsedNs`, not guaranteed final
headroom. A sample proves neither later completion nor an engine effect, and it
does not measure differential diagnostic overhead. There is no missing CPU
sample or timeout indication within captured ticks 1–138. The absent tick 139
evidence leaves terminal timeout status unknown.

## Exercised behavior and limitations

All three action channels were exercised. The evidence contains 5,391 decisions:
1,678 selected movement actions, 119 movement holds, 65 selected heals, 1,732
healing no-actions, 78 selected attacks, and 1,719 combat no-actions. It records
1,821 actual attempts: 1,678 `moveTo`, 19 `attack`, 59 `rangedAttack`, 54 `heal`,
and 11 `rangedHeal`. Every recorded return code is numeric zero; this establishes
API scheduling only, not the resulting engine action.

Across consecutive compatible snapshots, 786 movement attempts are followed by
observed displacement and 878 by no displacement; 14 are unknown because the
next actor snapshot is unavailable. Health observations contain 85 positive,
217 negative, and 3,399 zero deltas, plus 28 unknowns. These observations are
not assigned to any movement, attack, or heal attempt.

Membership emitted one epoch-1 baseline and 36 change records containing 116
capability, 12 participation, and 13 presence changes. No epoch reset or late
member addition was exercised. No failed or null-return command was observed.
No errors were observed in the captured output. No importer warning was
observed during the original scoped import run, but that stdout was not retained
and this historical observation cannot be independently reproduced from
analyzer success or the retained evidence alone. These statements are limited
to the available responses and do not claim terminal-console completeness. The
disabled scout allocation and healer-escort experiments remained off. The
single defeat does not establish strategic benefit or harm.

## Checks and lifecycle

Immediately before launch, the focused runtime/evidence/importer/analyzer suite
passed 70/70, the full suite passed 132/132, and `npm run check`,
`npm run build-id:check`, and `git diff --check` passed. The build check returned
the build ID recorded above. No runtime source changed during validation.

The exact lifecycle operations were two scoped imports, two explicit `claim`
commands, read-only analyzer/measurement reads, and—after this checkpoint was
saved—two explicit `examined` commands. No `scan`, `watch`, `list`, `done`, or
cleanup operation was used. The claims remain active and the JSONL, map,
manifest diagnostics, and report are intentionally retained.

One read-only source-inspection command inadvertently printed the beginning of
the manifest while locating field names; that output contained unrelated map
registration metadata. It did not read unrelated map files, capture contents,
or review records, and it made no change. All mutating evidence operations were
restricted to the replay and fingerprints above.

M5 is complete for ADR 0004's bounded acceptance criteria. Residual unknowns are
the absent terminal tick, exact final-tick CPU, timeout status after tick 138,
live reset behavior, unexercised failure/null-return paths, differential
diagnostic overhead, action causality, and strategic benefit.
