# Explicit resumable replay extraction

Status: generated-qualified, with separately scoped retained-copy extraction and
resume observations. This is a small orchestration mode
of the existing analyzer CLI, not a storage system, live-cache discovery tool,
strategy analyzer or completed human review. It does not resolve a trial's
missing identity without separately authorized evidence. The original tooling
qualification left its pending trials blocked; later operational authority is
not granted by this contract.

## Retained-copy operational coverage

Subsequent explicit reviews exercised decoded-console-json and cache-v5 retained
inputs, including the closed route-adoption trial's single `/log/67` frame.
That review retained all selected intermediate observations and same-tick mappings;
one resume reported logs0/reused1 using hash-validated artifacts, not a repeated
original-cache read. Its external receipt is
`opening-route-adoption-functional-trial-20261019-dcBaIi/completion-review.json`
under `/Users/zoltanka/.local/share/pain-and-gain-evidence/`.
Source identity, emitted build and human gameplay conclusions were separately
verified; successful extraction itself still reports human review not-performed.
Present-byte pins did not upgrade unknown historical integrity. These observations
qualify the selected retained-copy flow, not automatic discovery, live-cache
dispatch, arbitrary future sources or permission to reopen another trial.

## One entry point

```sh
node tools/replay-analysis.js --review /canonical/request.json /canonical/existing-output-directory
```

The output directory must already exist, be canonical/resident, outside the
repository, and separate from the declared retained-source directory. Use the
same request/output to resume. Paths below are schema examples, not runnable
trial selections or authority to access evidence. No package script changes.

An unreadable/invalid request or checkpoint file, unsafe output directory, or
unavailable writer lock fails before a job can be created. These admission errors
produce a short CLI error, not a fabricated extraction report. Once admitted,
partial results and integrity failures are retained as described below.

```json
{
  "checkpoint": "/canonical/already-authorized-checkpoint.json",
  "completionRecordedAt": "2026-10-18T12:05:00Z",
  "replayId": "bbbbbbbbbbbbbbbbbbbbbbbb",
  "source": {
    "scope": "retained-cache-v5",
    "root": "/canonical/retained-response-copies",
    "provenance": "caller-supplied previously verified source provenance"
  },
  "metadataKeys": [],
  "logs": [{
    "key": "1/0/https://arena.screeps.com/api/game/bbbbbbbbbbbbbbbbbbbbbbbb/log/100",
    "representation": "cache-v5",
    "file": "explicit-opening-response.cache",
    "sha256": "REPLACE_WITH_EXACT_RESPONSE_SHA256"
  }],
  "limits": {"chunks": 1, "firstTick": 1, "lastTick": 100}
}
```

`checkpoint` can instead be an embedded object. It must provide the actual
preparation's `enabledBuild`; this is an **expectation**, never emitted evidence.
A checkpoint filename is read with residency/size/canonical guards and bound by
its exact byte hash. Do not place credentials in checkpoint/request/provenance:
the complete request is deliberately retained for audit/resume.

### Declared decoded console JSON

Two log representations are supported: `cache-v5` and `decoded-console-json`.
Use `source.scope: "retained-responses"` and declare `representation` on **every**
descriptor. For compatibility, the original `source.scope: "retained-cache-v5"`
is itself an explicit cache-only declaration; an omitted descriptor representation
there still means cache-v5, and a decoded declaration under that scope rejects.
There is no sniffing, parser fallback, re-encoding or fabricated cache framing.
Metadata descriptors remain cache-v5 only.

A decoded descriptor uses the same `key`, safe `file` basename and required
`sha256` (the pin for the actual decoded file bytes), plus these optional fields:

```json
{
  "key": "1/0/https://arena.screeps.com/api/game/bbbbbbbbbbbbbbbbbbbbbbbb/log/100",
  "representation": "decoded-console-json",
  "file": "retained-console.json",
  "sha256": "REPLACE_WITH_DECODED_INPUT_BYTE_SHA256",
  "originalFrameSha256": "OPTIONAL_ORIGINAL_FRAME_DIGEST_OR_NULL",
  "historicalDecodedSha256": null
}
```

The decoded file is a UTF-8 JSON object whose values are original console strings
(possibly newline-joined), not JSONL or an array of parsed snapshots. It uses the
same bounded console validator, build checks, extraction and coverage routines
as cache input. Invalid UTF-8/JSON/schema, conflicting declared record identity,
representation mismatch, build mismatch and byte/tick-span limits reject without
fallback. Declared keys do **not** become embedded request evidence: decoded logs
report `identification.status: "declared-replay-key"`; cache-only logs retain
`verified-request-key`. A decoded file without a recorded ID cannot independently
prove the replay association merely by emitting the expected build.

`sha256`/`inputSha256` pins present input bytes, even when computed at ingestion.
It does not establish their historical integrity. `originalFrameSha256` is a
separate caller-supplied original-frame reference; it is never compared to decoded
bytes or described as verified by this ingestion. A frame digest put in `sha256`
rejects decoded bytes. `historicalDecodedSha256`, if supplied, must match the
decoded bytes; its status is only `caller-declared-decoded-pin-matched`, not an
independently authenticated receipt. A wrong frame digest in this field rejects.
Absent that prior decoded pin, `historicalIntegrity` is explicitly `unknown`.
That uncertainty is retained in receipts, extraction `sources` and every resume.
Changing a request to add a historical pin blocks the old resume; it cannot
silently upgrade the earlier result. Human review remains separate.

Tool-artifact digests (partial/final extraction JSON) remain distinct from input
and frame digests. The exact retained input copy naturally has the same digest as
its input bytes, but no conversion or cross-representation verification is implied.
At the decoded-input tooling correction, both real-data reviews remained blocked
pending suitable input/provenance and separate operational authority; that change
retried neither one. Later retained-copy coverage above is separate evidence.

For identification, omit `replayId` and supply `metadataKeys` descriptors with
the same `key/file/sha256` fields, using exact `/api/game/<id>` keys without a
log suffix. No keys are discovered. Filter recorded nested `game.createdAt`
between checkpoint `activationTimeBoundsUTC.earliest` (or `activatedAt`, then
`createdAt`) and explicit `completionRecordedAt`, inclusive. Validate the latest
activation bound too; inconsistent windows block rather than expand. UTC offsets
are compared as numeric instants. File mtime/ctime are only stable-read checks.

Missing identity blocks without source reads. Parsed/rejected metadata, errors,
candidate count and bounded player labels are saved before selection validation.
Zero candidates means none in this **selected evidence**, not that no match was
played. Several candidates block before log reads; the operator must supply a
separately selected request/output, not guess. Conflicting metadata blocks.
Names alone never establish identity. Player/System mode and opponent designation
are unknown unless independently supplied; both kinds may occur in metadata.

## Existing reader and authority boundaries

[replay-review.js](../../tools/replay-review.js) reuses the original
`parseScoreCacheEntry`, `parseCacheEntry`, `parseDecodedConsoleJson`, diagnostic validators and
`summarizeDiagnosticCoverage` from [replay-logs.js](../../tools/replay-logs.js).
The corrected identification principle is recorded timestamps, not cache-file
time or list order. Existing discovery/retrieval validators were inspected;
their account-authenticated/provider workflows are not imported or revived.
The narrow retained-metadata projection binds nested game ID to the request key
and records player names only as labels, without pretending to authenticate an
account/code mapping or opponent slot.

The filesystem mode opens **only explicitly named, hash-pinned retained copies**,
not a live profile, managed `replay_logs`, manifest, database or cache inventory.
`Cache_Data` roots and project sources reject. Each response filename is a safe
basename. Source provenance is a retained caller declaration, not fresh process
verification. No profile defaults, enumeration, provider/native calls, network,
fallback source or lease bypass are introduced. Only the declared console JSON
shape above is admitted as decoded content; other HTTP bodies remain unsupported.

The library `runReplayReview(request, {output, withSource, signal, fault})` accepts
an injected exact-descriptor reader. It returns `{bytes, provenance}`; the pinned
SHA/key and provenance must match. A future managed/live reader must acquire and
revalidate its **existing authority/lease inside that callback**. This task does
not implement or qualify such an adapter. Existing [production authority](replay-production-authority.md)
and [managed claim/examined/done](../../AGENTS.md#replay-log-reviews) obligations
remain in force; successful extraction neither creates a claim nor marks it done.

Reuse the existing canonical-directory and residency guards, no-follow opens,
bounded before/open/after stable reads, durable no-clobber publisher and kernel
writer lock. Lock release uses existing owner/child-exit handling; no lock stealing
or PID/mtime-based repair. The existing lock helper requires local `python3` with
`fcntl`; there is no installation or tooling repair. Canonical `/private/tmp`
fixtures are used on macOS, not the `/tmp` alias.

## Durability, resume and limits

- `request.json`: checkpoint/selection/limits/source plus orchestration/parser/CLI/guard
  code binding. Changed requests, source hashes or code stop; no silent restart.
- `<sha256(key)>.cache` or `<sha256(key)>.console.json`: exact selected input bytes,
  published before parsing, with a format-specific suffix (not a manufactured frame).
  `<sha256(key)>.json`: original key, copy hash/size and supplied provenance.
  Its `inputProvenance` separates representation, input/decoded/original-frame
  hashes and historical-integrity status.
- `partial-1.json` through `partial-3.json`: complete selected tick sequences
  available after each verified chunk, including intermediate observations.
- `observations.json`: final sequence with complete original snapshot/typed
  diagnostic strings, same-tick mappings, explicit gaps and conflicting snapshots.
- `report.json`: durable bounded stages, candidates/exclusions/errors, reads/reuse,
  observed build IDs, partial/final artifact hashes and coverage. It is saved
  before compact stdout; extraction never marks human review complete.
- Integrity/binding mismatches preserve prior results and add a no-clobber
  `blocked-<reason-hash>.json` note. Inspect that note when the previous report
  remains the last valid result. No automatic repair or retry occurs.

Resume validates matching request/code, report integrity, exact receipt encoding,
response hashes and selected extraction hashes before replacing reports or
reading a source. A response published just before interruption can be reused
without its receipt; a receipt whose response is missing blocks. Validated copies
are reused even if their original source is now unavailable; mutable originals
are intentionally not reread. Retained copies are reparsed within the same bounds.
Errors after publication preserve raw/partial work. Abrupt process death relies
on the existing atomic publisher/fsync/lock behavior; fault-injection tests cover
interruptions at publication boundaries, not every OS/storage failure.

Hard ceilings, always reducible by the caller's chunk/tick selection:

| Item | Ceiling |
| --- | --- |
| Metadata descriptors / selected log chunks | 128 / 3 |
| Declared log descriptors across candidate IDs | 9; only one selected ID is read |
| Extracted tick window | 300 inclusive ticks; caller must declare start/end |
| One raw response / total retained raw bytes per selection | 8 MiB / 24 MiB |
| Metadata decoded per response / aggregate | 1 MiB / 16 MiB |
| Log decoded per response / snapshot span | 8 MiB / at most 299 between endpoints |
| Request / report / individual extraction artifact | 1 MiB / 2 MiB / 32 MiB |
| Partial artifacts | At most 3 plus final; no unbounded archive or retries |

These are stricter orchestration bounds, not permission to increase an existing
reader's limits. Exact complete responses remain available even if only a smaller
tick interval is extracted. A bound/error stops without fetching replacements.
Counts are per invocation; selected response/hash/chunk limits remain pinned
across resume. No runtime-duration guarantee or general streaming-memory claim.

## Evidence semantics and validation

Identification, emitted-build verification, extraction and human gameplay review
are separate report stages. An embedded exact request key binds a cache log to
the selected replay; decoded association remains caller-declared as above.
Its parsed emitted build must match the checkpoint. Missing/mismatching
builds block and retain what was observed, never substitute the expected build.
The reused analysis here is **diagnostic coverage**, not the full map-linked
managed analyzer. No fake map registration or managed source record is created.
Original analysis commands, authority dispatch and lifecycle remain unchanged.

Every requested tick appears, including missing snapshots. Actors resolve using
that snapshot's `creeps[memberSlots[actor.slot]]`; target/flag slots refer to that
snapshot's `flags`. Membership squads are recorded only from a same-tick baseline;
otherwise the mapping is explicitly unknown, not borrowed across a gap. Full raw
snapshots retain all indices and objective fields. Fixed per-actor provenance and
command return records remain original evidence. Return0 is scheduling, not
displacement; potential support is not survival or capture. CPU interpretation
still follows the [evidence boundaries](replay-evidence-contract.md#evidence-boundaries).

Generated-only qualification (no name filters, actual trial/checkpoint payloads,
historical fixtures, replay/cache reads or provider access):

```sh
node --test --test-reporter=spec tests/unit/replay-review.test.js
node --check tools/replay-review.js
node --check tools/replay-analysis.js
node --check tests/unit/replay-review.test.js
# Existing generated cache parser/importer coverage needs canonical macOS tmp:
env TMPDIR=/private/tmp node --test --test-reporter=spec tests/unit/replay-logs.test.js
node --check tools/replay-logs.js
```

Tests use the existing independently generated cache-frame builder, injected
readers and the production parsers. They cover output-sink failure, interruption
at raw/receipt/extraction boundaries, no-repeat source reads, partial artifacts,
timestamp offsets/file-time independence, missing/ambiguous identity, build/hash
mismatch, gaps/conflicts, limits, immutable observations and canonical guards.
This establishes extraction decisions/durability on generated inputs only. It
does not authorize investigating the blocked centre-support trial or preparing
another match. Runtime, package, switches and Git publication remain out of scope.
