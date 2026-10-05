# Storage v3 M2b: bounded legacy diagnostic selection

Date: 2026-10-04. Status: planning only; implementation requires a separate task.
Inspected HEAD: `839de85a4afe2c8ea489164b9e90ac37ac2296ea`.

Implementation checkpoint: the separately authorized local candidate and its
synthetic measurements are recorded in the
[M2b qualification](replay-storage-v3-m2b-2026-10-04.md). The planning status and
proposed-budget wording below describe the original approval; the requirements
remain unchanged. This does not activate the CLI or complete M2.

Authority: [ADR 0006](../decisions/0006-replay-storage-v3.md), the
[completion plan](project-audit-2026-10-04.md#dependency-ordered-completion-plan),
[M2a plan](replay-storage-v3-m2a-plan-2026-10-04.md) and
[M2a qualification](replay-storage-v3-m2a-2026-10-04.md).
M2a is committed and published at the inspected HEAD. Earlier records' pending,
unstaged and awaiting-review wording describes their original checkpoints.
Their measurements and qualification limits are unchanged.

## Choice and prerequisites

Choose **M2b: a fixture-only, bounded-memory v2 manifest reader that feeds one
response's `otherEntries` to M2a's shared output consumer**. Keep the deployed
CLI and its private `readManifest()` unchanged during this qualification.

| Candidate | Benefit and dependencies | Decision |
| --- | --- | --- |
| Bounded v2 selection for `other` | Exercises the remaining monolithic-input risk with an existing output oracle, one identity and no lifecycle or report policy. Requires a streaming JSON selector and a pinned manifest handle. | First: qualify this small compatibility seam before generalizing legacy access. |
| Next v3 analyzer reader | Advances analysis integration, but [replay-analysis.js](../../tools/replay-analysis.js) combines manifest selection, maps, JSONLs, diagnostic summaries and score analysis; async callers and caches also need coordinated changes. | Defer to a separate slice with an explicit selection/report contract. |
| List/review/import integration | Adds pagination plus completed-log reconciliation, ownership, retries and publication policy. `list` is not a read-only substitute for `other`. | Defer; preserve the existing log/score lifecycle distinction. |

The [recorded manifest profile](../decisions/0006-replay-storage-v3.md#context)
attributes 98.89% of bytes to diagnostics. This is historical evidence, not a new
production measurement. M2b bounds memory while still scanning a monolithic
file; it does not make legacy selection indexed or repair whole-manifest writes.
The existing deployed capacity risk remains until separately qualified activation.

Prerequisites are satisfied: shared native serialization/backpressure in
[replay-other.js](../../tools/replay-other.js), M2a parity tests, and the reviewed
M1/C1 contracts. No catalog body publication, new SQLite schema or migration is
needed. No unresolved design choice is intentionally left to block this slice.

## Interfaces and implementation paths

Proposed public tooling interface, not an existing API:

```text
writeFixtureV2Other({root, replayId, fingerprint}, sink) -> Promise<void>
sink(chunk: Buffer) -> Promise<void> | void
```

| Expected path | Responsibility |
| --- | --- |
| New `tools/replay-legacy-reader.js` | Explicit fixture gate, read-only manifest handle, bounded structural selection, preflight and shared consumer invocation. No CLI, default root or format dispatcher. |
| New `tools/replay-legacy-json.js` if needed | Private chunk scanner/range walker used only by this adapter; bounded structural state and native parsing of selected values. Do not expose a general manifest object API. |
| New `tests/unit/replay-legacy-reader.test.js` | Known-answer parity, selection/errors, file lifetime, SQLite-isolation and scale tests. |
| [replay-other.js](../../tools/replay-other.js) | Reuse `writeOtherEntries`; no semantic changes planned. |
| [replay-logs.js](../../tools/replay-logs.js) | Unchanged production CLI and small-fixture compatibility oracle. Do not export/call its loader from the new adapter. |
| `package.json`, architecture index and new qualification record | Syntax registration and measured results, with no dependency/build changes. |

Do not transplant the v3 `iterateJson()` by manufacturing a store/view or an
unbounded reference. Its pre-hash/token rules and physical payload contract are
different. A narrow private scanner can follow its bounded chunk/range pattern,
but must preserve the legacy rules below. M1/C1/payload modules and their tests
are not planned implementation targets. Report a newly demonstrated core defect
separately rather than expanding M2b.

## Fixture boundary and file lifetime

Require an explicit absolute canonical root directly under
`fs.realpathSync(os.tmpdir())`, with a basename beginning
`pain-gain-v2-reader-fixture-`. Reject aliases, symlinks, traversal, non-direct
children, production/project roots and unsupported platform/runtime before
opening a manifest. Initial qualification uses native macOS/APFS and Node 24.x
at least 24.19.0, without a platform shim. There is no SQLite capability probe.

Tests create a regular non-symlink `.replay-v2-reader-fixture.json`, at most
16 KiB, containing exactly this marker (property order immaterial):

```json
{"fixture":"replay-v2-reader","version":1,"filesystem":"local-apfs"}
```

The reader validates this declaration but does not create/probe/repair a fixture
or claim that a declaration proves filesystem durability. It reads only this
marker and `root/replay_logs/manifest.json`; require a real contained directory
and regular non-symlink manifest, checking opened descriptor identity against
path inspection. Missing directories/files are unavailable, not created as by
the legacy `outputDirectory()` helper. No arbitrary manifest path parameter.

Open the manifest once, read positionally from that descriptor, and keep it
until awaited output ends. All offsets use raw byte positions on this handle;
validate safe integer sizes/offsets. Pinning one v2 file provides one generation
of its embedded diagnostics even if a supported writer atomically replaces or
unlinks its name. No map/output files are opened and no multi-file analysis
snapshot is claimed. Do not re-open by pathname between passes.

This adapter needs no writer lock: it neither mutates nor resolves separately
published artifacts. The existing v2 writer's atomic manifest replacement is
the supported concurrency boundary. No store lock/transaction/recovery API is
called; the ADR's locked multi-file v3 snapshots remain unchanged. Compare the
opened file's size/mtime before output and on completion; observed in-place
changes reject, with a possible emitted prefix if detected late. Atomic rename
or unlink of the pinned inode must remain readable; pathname identity and
unlink-related ctime changes alone must not invalidate it. Arbitrary external
in-place writes, including changes evading metadata checks, remain unqualified.

## Selection and bounded parsing contract

Use a bounded structural scan followed by selected range traversal, not a
manifest/record array or persistent temporary index. The implementation may
combine passes only if all preflight and measured byte bounds remain satisfied.

1. Validate the complete JSON grammar through EOF, including ignored fields and
   trailing bytes, in chunks at most 64 KiB. Retain only nesting state and the
   last effective top-level `version`, collection kinds and `records` byte range.
   Unknown values are syntax-checked and skipped without hydration. Objects may
   put fields in any order. Decode escaped property names for comparison.
2. Apply `readManifest()` container semantics: version 2 requires array `maps`,
   `replays` and `records`; present `scoreRecords` and `retiredScoreSources` must
   be arrays, while absent collections remain absent. Empty version 1 records
   resolve as empty legacy input (before optional-score checks); nonempty v1,
   v3 descriptors and unknown versions reject. A valid empty input or missing
   selected identity is `NOT_FOUND`, never a fabricated empty response.
   Defer container/type decisions until the enclosing object's final effective
   properties are known: an earlier duplicate of the wrong type may be replaced
   by a valid later value. Syntax errors in overwritten values still reject.
3. Walk the final `records` array in occurrence order and select the first
   record whose full replay ID and fingerprint equal the requested strings,
   matching the existing `.find`. Keep only one current record's identity
   fields and its final `otherEntries` range; do not hydrate that record.
   Fields may follow diagnostics. Duplicate JSON properties use native last-key
   semantics, including repeated top-level collections, identity properties
   and `otherEntries`; duplicate response identities retain first-match semantics.
   Validate full input syntax even when a match appears near the beginning.
   Match the predicate's visited-prefix behavior: skip non-null primitive and
   array elements (they cannot have the requested JSON identity properties),
   but a `null` encountered before a match is `INVALID_RECORD`, corresponding
   to the current property-access failure. After the first match, later records
   receive syntax validation only; a later `null` cannot undo that selection.
4. Preflight the entire selected `otherEntries` array one value at a time,
   discarding each parsed value. Its absent/null/non-array forms are explicit
   `INVALID_RECORD`, not zero entries. This slice qualifies array diagnostics;
   the current JavaScript consumer can also iterate a string-valued field, but
   that malformed managed-record shape remains outside the fixture adapter's
   compatibility domain. Test the explicit rejection; keep the deployed CLI
   unchanged and retain this boundary for later activation review.
   An explicit empty array emits zero bytes. No status/review/build/map gate is
   added to `other`: the current command does not perform those checks.
5. Traverse that same selected array again from the pinned handle and pass each
   native parsed value to `writeOtherEntries`. Never retain the entire selected
   response or a corpus-sized list of offsets. Duplicate occurrences and order
   are preserved. Selected values can be any JSON value accepted in a legacy
   array; M2a's stricter v3 object-wrapper rule must not leak into this adapter.

Use native `JSON.parse` only on bounded selected elements/control values, then
native per-element `JSON.stringify` through the shared consumer. Preserve key
ordering, `__proto__` as a data property, escape/surrogate handling, signed zero,
numeric precision and overflow (`1e400` serializes to `null`). Do not use strict
v3 `jsonChunks` to reject nonfinite parsed legacy numbers. Match Node's UTF-8
replacement decoding for malformed byte sequences inside JSON strings, including
chunk boundaries; do not silently switch to fatal UTF-8 decoding. Invalid grammar
still rejects. BOM, trailing commas and multiple documents remain invalid.

Skipped strings/numbers are grammar-scanned incrementally even when larger than
1 MiB. They are never collected to validate them or determine that they are
unselected. Limit nesting to 1,024 and materialized keys/control tokens to 1 MiB;
oversized required keys/control values return `RESOURCE_LIMIT`. Required field
values of a wrong JSON type can be recognized structurally without hydration.
Selected raw elements, their decoded UTF-8 text and their native reserialized
JSON must each fit 1 MiB, including internal whitespace for the raw bound.
Count decoded bytes incrementally before collecting text; replacement characters
can expand malformed UTF-8. Before building a full output string, measure native
JSON encoding with bounded string slices and native primitive serialization
(nonfinite numbers become `null`). Do not use the strict v3 encoder or allocate
an oversized full string merely to check its length. This counting helper need
only handle values produced by native JSON parsing, not arbitrary JavaScript
objects. Verify its counts against native serialization on bounded fixtures.
Keep surrogate pairs together when counting string slices, and include quote,
escape, key, colon, comma and container bytes. Test encoded-size thresholds
independently of raw/decoded-size thresholds, including numeric normalization.
The parsed object and bounded encoding temporaries must also fit the RSS gate.
Output chunks remain at most 64 KiB. Larger selected values fail before output;
supporting them is a later increment. These explicit resource errors apply only
to the new fixture adapter; they do not narrow the deployed legacy CLI.

Keep fixed selection metadata at most 64 KiB (excluding the bounded parser
stack/current element); at most one selected element is hydrated at a time.
Define depth as open JSON containers: accept 1,024 and reject a 1,025th before
pushing it. Stack frames retain grammar state and only the fixed path context
needed for selection, not ancestor keys or copied path arrays. A key/control
token is transient: compare and discard it before descending. Retain identity
match flags and byte ranges, not potentially 1 MiB identity strings in the
64 KiB metadata budget. Unknown subtree traversal must not accumulate keys.
During selected preflight/emission, collect the current bounded element while
scanning it, rather than rescanning every element's range outside the I/O budget.
Never `readFile` the manifest, concatenate it, `JSON.parse` a whole record, collect
all wrappers, or build a token/offset set proportional to corpus size. No spool,
SQLite import, filesystem writes, cache or implicit migration is permitted.

## Errors, cleanup and provenance

Expose distinguishable codes: `INVALID_IDENTITY`, `UNSUPPORTED_FIXTURE`,
`UNAVAILABLE`, `UNSUPPORTED_MANIFEST`, `INVALID_JSON`, `INVALID_RECORD`,
`RESOURCE_LIMIT`, `NOT_FOUND`, and `CHANGED_INPUT`. Preserve underlying I/O and
sink errors rather than returning empty output or success. Validate identity
syntax as in `other` (24/64 lowercase hexadecimal characters) before reading.
Malformed JSON anywhere, unsupported shape and selected limit errors must occur
before the first sink call. Emission/sink failure may leave a prefix and rejects
without a success receipt. Error wording need not reproduce incidental native
stack traces; parity gates assert output and success/failure classification.

Await each sink call; never buffer ahead or return a borrowed iterator. Close
every owned descriptor on every path, including open-followed-by-inspection
failure. A setup/read/sink error, including thrown `null`, stays primary; without
a primary error, close failure rejects after all close attempts. A slow sink
must permit another process to atomically replace the manifest. No writer lock
may be held while waiting for that sink.

The selected identity remains the original `(replayId, fingerprint)`; byte
offsets are private addresses scoped to the open handle, not durable evidence
identities or a cache key. `other` only emits stored values: no integrity/build
association, map validation, coverage, gameplay verdict or terminal result is
inferred. No evidence claims, reviews, reconciliation or retirement change.
Automatic completed-log reconciliation and explicit score retirement remain in
their existing callers. No new cache is created; F5's selected validation and
future ADR cache/version contracts are untouched.

## Qualification and implementation order

All execution uses newly created temporary synthetic roots. Limits below are
**proposed acceptance requirements, not measured results**.

1. Implement the scanner and selection with adversarial small fixtures. Test
   pretty/compact JSON, chunk-boundary escapes/UTF-8/numbers, deep nesting and
   every selected/control bound. Place malformed ignored data after a valid
   selection; assert zero output. Test huge skipped string/number tokens, wrong
   container kinds, optional collections, v1 empty/nonempty and v3 rejection.
2. Add the fixture adapter and compare bytes to the committed CLI at
   `839de85a4afe2c8ea489164b9e90ac37ac2296ea` on small compatible fixtures in
   isolated project copies. Assert actual expected stdout/status independently
   of parity. Cover all value/serialization cases above, arbitrary field order,
   escaped/duplicate keys, duplicate identities, nested identity/collection
   decoys that must not affect selection, empty/not-found selections,
   visited-prefix primitive/array/null behavior, absent/null/zero distinctions
   and repeated reads. Test the explicitly unsupported non-array diagnostic
   field separately from output-parity cases. Inject an import hook that
   forbids `node:sqlite` for the new adapter and existing v2 CLI. Retain M2a's
   existing broken-pipe/slow-stream CLI checks; no new CLI switch is introduced.
3. Hash small fixture files before/after success and every rejected operation;
   assert no creation, mutation, claim or cleanup. Exercise symlinks, aliases,
   missing marker/file, unsafe roots, read/inspection/close failures and sink
   throws/rejections including `null`; count descriptor lifetime and verify a
   subsequent invocation succeeds. Check late emission errors after a prefix.
4. Use two-process barriers after pinning and at the first sink call. Atomically
   replace/unlink the manifest and verify output is wholly from the old opened
   file; a new invocation sees the replacement or unavailable state. Test an
   observed in-place size/mtime change separately and require rejection. Do not
   label that detection a general concurrent external-write guarantee.
5. Run the fixed scale fixture below, then focused legacy/consumer/importer
   tests, `npm test`, `npm run check`, documentation/examples and whitespace.
   Reuse unchanged M1/C1/M2a gate results only with exact source/test correspondence
   and an impact assessment; rerun any affected shared-code gates. Record final
   patch hashes, actual metrics and all qualification limitations separately.

### Fixed scale fixture and budgets

For each of compact and two-space pretty formats, stream-generate two manifests
with exactly **10 and 1,000 log records**. Keep selection last to exercise the
full record scan. Give it the same 4,096 values as M2a:
`{key: String(i), raw: 'x'.repeat(128), type: 'other'}`, `i = 0..4095`, in that
property/occurrence order, embedded directly as v2 `otherEntries` (no envelopes).
Put `replayId` and `fingerprint` after `otherEntries` in this selected record.

Eight other records each contain an unrelated string of **75 MiB** in a
diagnostic wrapper: distinct leading record markers followed by ASCII `x` to
the exact string length. The **600 MiB** of unrelated string contents must
physically reside in each manifest; sharing one file or counting links is not
growth. Fill remaining records with small unique identities and empty arrays.
Use empty maps/replays and include both optional score collections as empty
arrays. Assert record counts using the generator's independent counters and
the scanner's test instrumentation, and verify physical sizes. Do not construct
a large string, array of records or pretty-printed corpus in the generator.

Run each format's generation worker and paired 10/1,000 operation worker with
`--max-old-space-size=192`, at most **256 MiB peak RSS**. Proposed deadlines:
**60 seconds generation** and **120 seconds paired operations**, with bounded
child shutdown. The new time budget allows full legacy structural scans; it
does not change any M1/C1/M2a gate. If it fails, report the measured blocker;
do not relax limits or optimize unrelated tooling silently.

Use a hashing/counting sink and an independently generated small selected-output
oracle, retaining no output in the measured worker. For each invocation assert:

- One manifest open, one marker open, at most two adapter-owned descriptors,
  no other file bodies read, zero SQLite loads/SQL calls and zero writes.
- Read requests/chunks at most 64 KiB. If `M` is manifest bytes and `S` the final
  selected array's raw bytes, total manifest bytes read are at most
  **2 × M + 2 × S + 4 × 65,536** (structural pass, selection walk, selected
  preflight and emission, with bounded boundary read-ahead).
- Fixed retained metadata and element/chunk limits above; one sink call in
  flight; output hash/count equals the independent oracle at both record counts.
- Hashes and relevant size/mtime identities of fixtures unchanged afterward;
  preservation hashing happens outside the measured operation counters.

Report bytes, read/open counts, element peak, elapsed time and process peak RSS.
Reads grow with manifest size: equal whole-input read counts or zero unrelated
manifest-byte access are **not** M2b requirements. Unrelated bytes must be
syntax-scanned without hydrating their values; external captures/maps/sidecars
must never be opened. No constant-time legacy lookup or production timing is
claimed from this fixture.

## Completion boundary and remaining gates

M2b completes only when the explicit fixture API meets all gates and its exact
candidate has a measured qualification record. No implementation, new
qualification, staging or production activation occurs through this plan.

Remaining M2 gates include general bounded v2 collection/property/review access,
larger selected-value consumers, async caller adaptation, deliberate dispatch
and CLI activation, and v3 importer/map/deferral/local registration and review/
list/lifecycle orchestration. Both analyzers, score-source verification,
historical index and scout screen still require selected coherent views,
provenance validation, indexed ownership, report parity and versioned caches.
M2b does not change their current whole-manifest loaders.

Production-root support, combined-schema compatibility, older-tool rejection and
all consumer coverage remain release gates. C2, M3 backup/conversion/export/
resume/rollback rehearsals and separately authorized M4 cutover remain deferred.
No power-loss, arbitrary OS close-failure, other-platform/filesystem, gameplay,
or general production-readiness qualification is implied.
