# Storage v3 M2a: one-response diagnostic reader integration

Status: implementation plan only. No integration or new qualification is performed
by this document. Inspected main: `c3ac85eb7b3c5463aa7c67a88bed6bd62ab3734f`.
M1 fixes, F5 and C1 are now committed as `2a2a40ac`, `406b42c8` and `0a80e545`.
“Pending/unstaged” statements in earlier records describe their historical
checkpoints. Their test results and qualification boundaries remain unchanged.

Authority: [ADR 0006](../decisions/0006-replay-storage-v3.md),
[M1 qualification](replay-storage-v3-m1-2026-10-03.md),
[C1 qualification](replay-catalog-c1-2026-10-04.md),
[audit](project-audit-2026-10-04.md), and
[independent candidate validation](audit-candidates-2026-10-04.md).

## Decision and priority

Implement **M2a: feed the existing `other` diagnostic-output consumer from one
pinned v3 log response in an explicitly named synthetic fixture**. Extract its
output routine so the existing v2 command and the fixture reader share the same
wrapper serialization. This is the first consumer seam; it is not a v3 CLI
activation, bounded v2 reader, analyzer integration or completion of M2.

Why first: `other <replay-id> <fingerprint>` has an exact, small observable
contract—one original wrapper per JSON line in occurrence order. It directly
exercises the diagnostics that dominate the recorded manifest size, selected
payload access, overflow dependencies and snapshot lifetime. It has no report
aggregation or cache to port. `list` additionally invokes completed-log
reconciliation; imports add publication/deferral/retry policy; full analysis
couples score validation, global ownership checks and asynchronous callers.
Those are larger dependency sets and follow this read-only seam.

Prerequisites are satisfied in committed code: F1/F2 publication lifetime and
readiness, F3 explicit recovery, M1 pinned payloads, and C1's schema-2 evidence
handle. C2 catalog body publication and general catalog evidence snapshots are
not prerequisites: this slice reads an operational log record through M1.
No unresolved design choice blocks M2a; implementation must report any newly
demonstrated core defect rather than silently widening this milestone.

## Current callers and expected changes

| Path / current behavior | M2a responsibility |
| --- | --- |
| [replay-logs.js](../../tools/replay-logs.js), `main()` / `other` branch | Retain argument checks, `readManifest()` selection and missing-record message; delegate wrapper output to the shared async routine. Other branches stay unchanged. |
| New `tools/replay-other.js` | Shared bounded-chunk serializer plus explicit fixture reader described below; no default root, CLI, format autodetection or writes. |
| [replay-store.js](../../tools/replay-store.js), `openStore`, `withReadSnapshot` | Reuse existing read-only open and snapshot as-is; no schema/root/lock/lifecycle changes planned. |
| [replay-catalog.js](../../tools/replay-catalog.js), `openCatalog().evidence` | Use its operational evidence handle for schema 2; no catalog table queries, findings or reviews. |
| [replay-store-payloads.js](../../tools/replay-store-payloads.js), `iterateDiagnostics` | Add only an optional explicit root-pointer selection, retaining the existing default and validation; avoid selecting an arbitrary first diagnostics field. Reuse `jsonChunks` for bounded v3 preflight validation. |
| New `tests/unit/replay-other.test.js`; existing payload/importer tests | Synthetic output parity, error/lifetime/concurrency and resource gates; regression coverage for the optional pointer and unchanged v2 CLI. |
| `package.json` and affected command/architecture documentation | Register syntax check and record measured qualification. No dependency, runtime or build-ID change. |

Current `other` calls the private v2 `readManifest()` and loops over
`record.otherEntries` with `console.log(JSON.stringify(entry))`. It does **not**
call `reconcileCleanup`. Do not use `list` as its adapter or introduce cleanup
on open. Existing pretty/compact v2 handling, empty-v1 compatibility and
nonempty-v1 rejection remain in that legacy path.

## Concrete interface and output contract

Proposed tooling interfaces (not implemented APIs):

```text
writeOtherEntries(entries, sink) -> Promise<void>
writeFixtureOther({root, schemaVersion, replayId, fingerprint}, sink) -> Promise<void>
iterateDiagnostics(view, recordKey, {pointer}?) -> async iterator
sink(chunk: Buffer) -> Promise<void> | void
```

- `writeOtherEntries` accepts an iterable/async iterable of original wrappers.
  Serialize exactly one entry with native `JSON.stringify`, emit its UTF-8 bytes
  in chunks of at most 64 KiB, then one LF. Do not split a surrogate pair while
  encoding string slices. Await every sink call before obtaining the next chunk
  or entry. No collected response array/string, unbounded output queue, headers,
  counters or success banner. Output matches the existing
  `JSON.stringify(entry) + '\n'` bytes, including key order and escaping.
  V3 preflight bounds this per-entry string to 1 MiB; legacy per-entry memory
  remains as before. The stricter `jsonChunks` encoder must not replace native
  legacy serialization: `JSON.parse('{"n":1e400}')` currently serializes as
  `{"n":null}`, whereas that encoder rejects its nonfinite number.
- The v2 CLI supplies its already selected `record.otherEntries` array and a
  stdout sink that waits for write completion and propagates stream errors.
  Its syntax, stdout, missing-record message and nonzero-error behavior remain.
  No v3 option, environment override or automatic descriptor dispatch is added.
  Preserve the legacy input domain; do not impose v3 materialization limits on
  the already hydrated v2 array. This extraction does not bound v2 loading.
- `writeFixtureOther` requires `schemaVersion` exactly 1 or 2 and a log identity
  with existing replay/fingerprint validation. Dynamically load the v3 modules
  only for this entrypoint; ordinary v2 command import must not start requiring
  `node:sqlite` or invoke storage capability probes. Schema 1 uses
  `openStore({root, mode: 'read'})`; schema 2 uses `openCatalog` and `.evidence`.
  Close the owning handle in `finally`, preserving any primary thrown value.
  Keep the shared serializer and payload module's transitive imports free of
  store/catalog imports; the optional pointer implementation must not eagerly
  import `recordOwner` from the SQLite-backed store just to construct its tuple.
- The fixture root must pass the unmodified canonical temporary-root, marker,
  store-ID, runtime/filesystem and schema gates. There is no creation, schema
  fallback, upgrade, default `replay_logs/` root or `recover: true` option here.
- Acquire one `withReadSnapshot({recordKeys: [key], payloadRoles:
  ['diagnostics']}, callback)`. Inside it, resolve the original `/otherEntries`
  property as a payload binding to that exact pointer and its ready diagnostic
  root. M2a fixtures publish this field explicitly, even for an empty array
  (zero-item, empty diagnostic stream). Missing/null/inline/wrong-role bindings
  are unsupported or invalid, never silently interpreted as zero entries.
  This is the fixture mapping for this slice, not a legacy migration rule.
- The optional iterator pointer resolves through `view.payload(recordOwner(key),
  pointer)` and verifies owner, root parent and diagnostics role. Without the
  option, retain existing `view.diagnostics(key)` behavior. The iterator still
  validates ordinal sequence, registered overflow references and exact bytes.
  Extra fields cannot replace the selected `/otherEntries` root.
- Preflight the complete selected iterator inside that same snapshot, discarding
  values as they are checked; require its occurrence count to equal the root's
  nonnegative integer `items` count (null is not zero; compare without unsafe
  integer coercion). For M2a each materialized wrapper must fit 1 MiB
  encoded UTF-8 (check with bounded encoding). A `kind: 'stream'` result is an
  explicit `RESOURCE_LIMIT` before any sink output. Retention of larger values
  remains supported by M1; streaming their legacy JSON-line representation is
  a later consumer increment, permitted to remain unsupported by ADR 0006.
  Complete bounded JSON validation in this pass as well, so an unsupported v3
  value cannot first fail after earlier entries have been written. Preserve the
  existing M1 JSON-value rules; legacy serialization compatibility is not license
  to normalize invalid v3 evidence. Restrict wrappers to original JSON objects.
- After successful preflight, iterate again over the **same pinned handles** and
  emit wrappers through the shared serializer. Preserve raw strings, unknown
  fields, absent/null/false/zero distinctions, duplicates and occurrence order;
  omit storage envelopes, ordinals and `wrapperRef` from output. No diagnostic
  reclassification, score/build association inference or gameplay verdict.

Two passes intentionally trade selected I/O for bounded memory and no output
from a known-invalid selection. Do not implement a spool or whole-response
buffer. Sink/I/O failure during emission can leave a prefix at the caller's
destination: reject the operation, stop writes and emit no success receipt.
Arbitrary external in-place mutation of immutable files remains unqualified;
the snapshot guarantee covers supported writers and POSIX unlink semantics.

## Coherence, lifecycle and failures

Snapshot setup takes the existing owner lock and read transaction, revalidates
the descriptor, rejects selected active intents (including claim/done records),
and pins diagnostics plus every overflow dependency before releasing the lock.
The current core also pins a selected log's owned output and linked map; accept
those opens and count them against 256 handles. Do not read their bodies or
claim map/output integrity merely from opening them. Metadata/properties and
replay association are captured by that same view. No preliminary lookup may
authorize readiness in place of the snapshot's checks.

The original 64-source, 8 MiB metadata, 64 KiB row/chunk, 1 MiB materialization
and 256-handle limits remain; this entrypoint selects exactly one source. No
new database query, corpus scan, payload registration or file owner is needed.
Unselected record bodies, summaries, reviews and catalog bodies are not read.
The existing role selector can pin other diagnostic roots on the selected owner;
the fixture gate records those opens, while only the explicitly bound root and
its referenced descendants are consumed. Oversized closures fail explicitly.

Keep errors distinguishable: malformed identities/versions/paths reject; missing
or retired records, missing selected files and pending/intended cleanup report
`UNAVAILABLE`; bad bindings/envelopes/hash/length report invalid evidence;
oversized selections/wrappers report `RESOURCE_LIMIT`; busy/live locks remain
bounded errors. A hot journal reports `RECOVERY_REQUIRED`. Recovery is a separate
explicit writer operation, never a read fallback. Do not search a backup/cache.

The reader never claims, examines, completes, reconciles or retires evidence.
Operational `claim` status is not a task claim; this command adds no new implicit
task ownership. Existing managed-review procedures still apply to human/agent
use. Preserve automatic completed-log reconciliation in its existing callers
and explicit score-retiring cleanup; neither is called by this reader. Synthetic
concurrency tests may exercise those existing core journal primitives only.
Catalog citations acquire no file ownership or veto over authorized cleanup.

Await preflight and output within the snapshot callback. Never return an iterator,
view or descriptor that outlives it. Sink throw/rejection, including `null`, stays
primary; all registered descriptors receive close attempts. A successful callback
followed by close failure rejects. Slow sinks may keep handles pinned but must
not retain the writer lock; a blocked sink test must admit a second writer.

No report/cache is created. Source fingerprints and map checksums remain original
identities; sidecar hashes only verify storage. Do not import C1 selection digests
or store generations into output. Future analyzer/cache slices must implement
ADR 0006's versioned cache domains, selected linkage/integrity/claim rechecks and
dependency hashes, retaining F5 behavior and old cache files.

## Implementation order and acceptance gates

1. Extract shared output without changing the v2 loader. On small synthetic
   pretty/compact v2 fixtures, assert byte-for-byte CLI stdout and exit/error
   parity against the current branch for empty/multiple entries, Unicode,
   escapes (including surrogate-pair chunk boundaries), unknown nested values,
   numeric overflow accepted by the legacy loader, and missing response.
   Exercise backpressure and EPIPE; preserve successful-output/argument behavior,
   while sink errors must reject and exit nonzero rather than be suppressed by
   console error handling. Do not require identical incidental EPIPE stack text.
   No lifecycle calls or SQLite import on the legacy path. Run CLI
   checks only from isolated project copies with synthetic evidence roots.
2. Add explicit-pointer payload iteration and the fixture reader. Test both
   fresh schema-1 and schema-2 fixtures, file-backed and evidence-only logs,
   present-empty diagnostics, exact ordering, repeats and legitimate rereads.
   Include bounded overflow wrappers, oversized stream rejection, an unrelated
   diagnostic root, and unavailable/malformed bindings. A bounded wrapper may
   be explicitly stored via a registered overflow reference for the positive
   case; automatic overflow generation is not required to choose a small value.
   Test null/incorrect item counts and invalid scalar/nonfinite v3 wrappers.
   Match the original wrapper JSONL oracle; do not compare physical envelopes
   as evidence.
3. Negative preflight tests place bad UTF-8/JSON, a wrong hash, an ordinal gap,
   item-count mismatch or a bad overflow at the **end** of the selection. Assert
   zero sink writes, unchanged rows/generation/reviews/files and released locks.
   Cover pending output/payload, claim/done with active intents, absent/retired
   identities, unsafe paths, unsupported schema and hot-journal nonmutation.
4. Use deterministic two-process barriers: pin, release lock, authorize synthetic
   log cleanup/unlink in another writer, then read the complete original view.
   Repeat with overflow dependencies; a subsequent read is unavailable. Test
   sink failure/completion, setup failure, close errors and thrown `null` with
   existing cleanup guarantees. Verify no escaped view, double close or lock
   retention. Score-done evidence remains retained; no score cleanup is invoked.
5. Resource gate: on each schema, compare exactly **10 and 1,000** operational
   records with one fixed selected response of **4,096** bounded wrappers and
   identical selected map/output/dependency fixtures. For ordinal `i` from 0 to
   4,095, use `{key: String(i), raw: 'x'.repeat(128), type: 'other'}` in that key
   order; store occurrence 2,048 via a registered extension dependency and all
   others inline. Use a fixed small map, an evidence-only selected log, no other
   selected root, and explicit `items: 4096`. A separate functional fixture
   covers owned game-state output. Stream-generate unrelated
   unique payloads totaling at least **600 MiB**, independently of the selected
   response (for example eight unique 75 MiB extensions across eight of the
   other nine records); never share one file to simulate growth. Grow to 1,000
   records with metadata-only additions, leaving selected bytes identical.
   Count initial rows before operations. A hashing/counting sink retains no
   output. Assert equal selected
   SQL/row/open/read counts at both sizes, zero unrelated body reads and zero
   evidence/database mutations. Count snapshot map/output opens separately.
   For each diagnostic traversal the current helpers can reread roots/children;
   cap total payload bytes at **8 × (root bytes + sum of referenced child bytes
   per occurrence)** for preflight plus output. Instrument both core metrics and
   sink chunks; every chunk is at most 64 KiB and only one sink call is in flight.
6. Run the operation worker with `--max-old-space-size=192`, at most **256 MiB
   RSS**, and **30 seconds** for the paired selected operations; allow **60 seconds**
   for streaming fixture generation. These are proposed gates, not measurements.
   Bound child shutdown and report environmental failures without relaxing limits.
   Report SQL/rows, opens, bytes, time and peak RSS; explain that core metrics
   exclude SQLite internal page I/O and fixed connection/lock housekeeping.
7. Run focused consumer/payload tests, affected M1/C1 snapshot/recovery tests,
   `npm test`, `npm run check`, documentation/examples and whitespace. Because
   payload iteration changes, rerun the existing 600 MiB M1 gate and catalog gate
   as well as the new consumer gate. Capture exact code correspondence and
   preservation checks. Do not rerun historical evidence or infer production speed.

## Remaining gates and completion boundary

M2a is complete when the shared consumer and explicit fixture path meet every
gate above on the supported native runtime. Record actual results in a separate
qualification section/record; planning limits are not prior successful results.
No production-capable root or format dispatcher is unlocked by this completion.

Remaining M2 work must separately cover bounded v2 pretty/compact reading (no
whole-manifest hydration), all importer/map/deferred/local-registration paths,
review/status/list and distinct log/score reconciliation, publication/recovery,
score-source verification, both analyzers and their async callers, historical
index and scout screen with shared pinned views, and versioned logical cache
keys. Preserve original CLI/report shapes, optional collections, missing versus
zero values and exact evidence identities. Qualify large selected values or
explicit resource failures; M2a does not promise analyzer memory bounds.

Production root support, coordinated rejection by older tools/trial worktrees,
combined-schema compatibility and complete consumer coverage remain release
gates. C2 catalog-body/evidence-snapshot work, M3 backup/streaming migration/export/
resume/rollback rehearsal, and separately authorized M4 cutover remain deferred.
The current v2 whole-string capacity limitation persists. This plan does not
qualify production data, migration, power-loss durability, arbitrary OS close
failure semantics, other platforms/filesystems or live gameplay behavior.
