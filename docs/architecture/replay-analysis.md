# Deterministic replay analysis

`tools/replay-analysis.js` implements milestone M4 of
[ADR 0004](../decisions/0004-replay-evidence-and-analysis-roadmap.md). It is an
importable Node.js analyzer with a guarded CLI. It reads existing manifest
version 2 evidence and writes one deterministic JSON report to stdout. It does
not import captures, acquire review ownership, migrate statuses, reconcile
cleanup, or write report files.

## Interface and input selection

The library interface is:

```js
analyzeReplay({ root, replayId, fingerprints? })
```

The CLI uses the repository root and accepts a replay plus optional full
response fingerprints:

```sh
npm run replay:analyze -- <replay-id> [fingerprint...]
```

Without fingerprints, every current manifest record for that replay is selected.
With fingerprints, only matching records are selected and each absent requested
fingerprint is reported as unknown. File-backed and evidence-only records are
both supported. Review claiming, examination, saving a report, and completion
remain separate operations documented in the README.

The analyzer reads `manifest.json` directly. It deliberately does not call the
importer's `list` command or `reconcileCleanup()`, because those lifecycle paths
may migrate or remove records. It requires `replay_logs/`, the manifest, saved
map, and any selected JSONL to be real non-symlink files within the supplied
root. Source cache entries are provenance metadata and are not reopened.

## Report contract

Reports have `reportVersion`, `replayId`, sorted selected fingerprints, sorted
findings, and pass/fail/unknown totals. Volatile timestamps and absolute paths
are excluded. Repeated analysis of unchanged bytes produces identical data.

Every finding contains:

- the replay ID;
- a stable rule name and `pass`, `fail`, or `unknown` verdict;
- project-relative file, fingerprint, line, diagnostic key/record, tick, or
  actor evidence as applicable;
- build provenance status and the relevant build ID;
- a short evidence-limited message and optional observed values.

Provenance is `local-source-match` when all supporting tagged evidence matches
the checked-in generated build ID, `tagged-unmatched` for one valid other build,
`legacy-unknown` when supporting evidence is untagged, and `conflicting` for
multiple tagged builds. A nonlocal valid build is not a failure by itself, and
an untagged or missing requested record is never assigned another response's
build. A replay-level build conflict remains visible, but does not erase a
finding whose own dependencies all have one compatible build. Conclusions that
would cross incompatible builds are unknown.

## Validation and merging

The analyzer revalidates manifest record fields and source identity, replay/map
association, map registration, JSONL byte hashes and schemas, raw typed
diagnostics, record build IDs, and stored coverage summaries. The registered,
embedded, and recalculated canonical map payload checksums must agree. The
saved-file byte hash is reported separately and is never substituted for the
payload checksum.

Stored per-response diagnostic summaries are recomputed with their original
`otherEntries` keys. Replay-wide merging uses fingerprint-qualified keys so
that identical local key names from different responses remain distinct.

Snapshots with the same tick and diagnostics with the same `recordId` are
compared canonically by recursively sorting object keys while preserving array
order and all values. Exact overlaps retain all source references and are
deduplicated for analysis. Conflicting variants are reported and withheld from
dependent conclusions. Replay-wide coverage is recomputed from raw evidence;
stored per-response summaries are only consistency checks.

Complete M2 closures support membership evidence only. Complete M3 closures
support membership and action evidence. A complete closure with zero records is
an explicit covered zero; a recorded hold or no-action is an explicit decision.
Missing records, unsupported versions, missing closures, gaps, conflicts, and
correlation failures remain distinct unknowns.

Current version-2 closures additionally cover exactly one `runtime-cpu` sample.
For a valid complete sample, rule `cpu.measurement` reports raw `elapsedNs`, the
applicable `limitNs`/`limitKind`, and derived `headroomNs`. This is elapsed CPU
through the sampling call, not exact final-tick CPU or differential diagnostic
overhead. Negative headroom is retained as an observation without imposing a
threshold. M2/M3 closures remain valid but yield unknown CPU availability;
missing, malformed, unsupported, conflicting, incomplete, or build-incompatible
CPU dependencies cannot produce a measurement pass.

For supported M3 producer evidence, action completeness also requires exactly
one movement, healing, and combat decision for each owned creep in a compatible
same-tick snapshot. Holds and no-actions satisfy that requirement. Covered zero
action events are established only when the compatible snapshot has no owned
actors; without the snapshot, the expected actor/channel set is unknown.

## Derived checks and limits

Membership reconstruction starts only from a valid baseline and stops at any
coverage gap or contradictory transition. A valid reset must be followed by a
same-build full baseline at the declared next epoch. An unexplained rebaseline
or epoch jump is rejected; an epoch-one rebaseline or incompatible-build
baseline starts an independent boundary whose continuity is unknown. The
analyzer checks late additions, presence transitions, stable assignments,
dead-member nonreactivation, and agreement with compatible owned pre-action
snapshots.

Action checks use recorded attempts and same-tick pre-action state; they never
rerun selectors. Before tactical range checks, the actor must be owned and the
recorded target identity and coordinates must agree with a compatible snapshot.
Contradictions are reported while dependent range remains unknown. The analyzer
also checks required functioning parts, Chebyshev range for attack/heal methods,
and same-actor command compatibility. `heal` with
`rangedAttack`, and `attack` with `rangedAttack`, are allowed. `rangedHeal` with
either attack and `heal` with `attack` are conflicts.

A null return code still proves the call occurred without a numeric result and
reports `schedulingAccepted: null`; zero reports `true`, and a nonzero integer
reports `false`. Even zero proves scheduling only. Movement findings report the
attempt separately from displacement observed in tick `n + 1`; remaining
stationary is not labeled an engine failure. Health findings report positive,
negative, or zero deltas only for consecutive compatible-build snapshots.
Neither kind of state change is assigned to a command, and missing ticks are
never bridged.

Synthetic fixtures verify these rules and byte-for-byte read-only behavior. The
[M5 live-validation checkpoint](replay-validation-2026-09-30.md) records one
current-build replay, deterministic report, captured coverage, CPU/headroom,
diagnostic size, timeout observations, and exercised state changes. The absent
terminal tick, live reset behavior, exact final CPU, differential diagnostic CPU
overhead, engine causality, and strategic benefit remain unknown.
