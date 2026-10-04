# Storage v3 M2a: synthetic diagnostic consumer qualification

Date: 2026-10-04. Base: `84753ca921367cc4252aab9c3c1996171d2ac8c1`.
Status: locally implemented and qualified on synthetic fixtures; unstaged for review.
Authority: [M2a plan](replay-storage-v3-m2a-plan-2026-10-04.md) and
[ADR 0006](../decisions/0006-replay-storage-v3.md). Their limits are unchanged.

## Implemented scope

[replay-other.js](../../tools/replay-other.js) provides:

- `writeOtherEntries(entries, sink)`: native per-entry `JSON.stringify`, ordered
  UTF-8 chunks at most 64 KiB, surrogate pairs kept whole, one LF per wrapper,
  and one awaited sink call at a time. It never collects the response/output.
- `writeOtherToStream(entries, stream)`: the stdout adapter waits for write
  callbacks and propagates stream failures, including EPIPE.
- `writeFixtureOther({root, schemaVersion, replayId, fingerprint}, sink)`:
  explicit schema 1/2, log identity and existing temporary-root gates; dynamic
  read-only `openStore` or `openCatalog().evidence`, with no recovery fallback.

The [v2 `other` branch](../../tools/replay-logs.js) dynamically loads only the
shared consumer after its existing argument/manifest/record checks. The consumer's
static dependency tree contains no SQLite. Existing v2 commands, map/review
policies and whole-manifest loading remain as before. Native legacy behavior is
retained: parsing `1e400` produces `Infinity`, serialized by this command as `null`.
V3 preflight instead rejects nonfinite evidence; it does not normalize it away.

The fixture reader uses one existing callback-scoped snapshot, resolves the exact
`/otherEntries` payload property, and preflights the complete diagnostic stream
before its first sink call. It checks root ownership/role/parent, hashes, UTF-8,
JSON, ordinals, registered overflow, integer item count without unsafe conversion,
object wrappers and the 1 MiB encoded wrapper limit. Missing/null/inline or wrong
bindings are errors, not zero entries. An explicit zero-item stream emits nothing.
Oversized overflow values remain retained but this consumer returns `RESOURCE_LIMIT`.

An optional `{pointer}` on
[iterateDiagnostics](../../tools/replay-store-payloads.js) selects the exact pinned
root; the existing default remains supported. The second pass emits original
wrappers through the same pinned root/overflow handles, with no storage envelopes.
The core can also pin a selected map/output; their bodies are not read or claimed
verified by this consumer. The snapshot callback completes before handles close.
Setup, callback and close failures preserve the existing primary-error rule,
including thrown `null`. A sink or I/O error during emission can leave a prefix
but rejects the operation. Backpressure holds descriptors, not the writer lock.

No new CLI flag, production root, format dispatcher, cache, lifecycle action,
catalog interpretation, dependency or runtime/build change is introduced.

## Functional evidence

[Consumer tests](../../tests/unit/replay-other.test.js) cover:

| Plan gate | Evidence |
| --- | --- |
| Legacy compatibility | Isolated copies compare stdout/status/errors against the committed pre-change CLI on pretty/compact synthetic manifests. Independent native JSONL oracles check empty/multiple/duplicate wrappers, Unicode/escapes, unknown values and overflow-number serialization. A module-resolution hook forbids SQLite. Real closed-pipe CLI execution exits nonzero. |
| Schema 1/2 and payload selection | Both schemas exercise explicit empty diagnostics, ordinary and bounded overflow wrappers, file-backed outputs, earlier unrelated roots, repeat reads and byte equality. Default and explicit iterator selection agree; selecting a child rejects. |
| Full bounded preflight | Late malformed JSON/UTF-8, ordinal gaps, wrong counts including null and beyond-safe-integer counts, invalid scalar/nonfinite wrappers, missing or malformed/hash-invalid overflow, wrong bindings, and oversized envelopes/values emit zero bytes. |
| Availability | Pending payload/output, claim/done with active publication/cleanup intents, absent/retired records, missing/symlink/changed files, invalid identities/root/schema and hot journals reject. Fresh read attempts preserve hot database/journal bytes. |
| Coherence and cleanup | The first sink call is a barrier: a second process acquires the writer lock, journals authorized log cleanup, unlinks roots/overflow and retires the log. The pinned read completes exactly; the next read is unavailable. Sink throw/null, inspection/read failures, close failures and interrupted emission release descriptors and locks; subsequent snapshots succeed. |
| Lifecycle preservation | Read fixture hashes, database, metadata, review checkpoints and files remain unchanged on successful/rejected reads. Done logs and score-done evidence remain retained. M1/C1 suites retain their explicit score-retiring and ownership/recovery gates. |

During development, static importer loading exposed missing helper files in
isolated importer/screen test copies. Loading the consumer only in `other`
resolved that dependency expansion without modifying those existing tests.
The initial new CLI test also used the macOS `/var` alias and missed direct
entrypoint execution; it now uses the resolved root and asserts actual expected
output/status as well as baseline parity. Those preliminary runs do not establish
qualification; the final repository run below includes the corrected checks.

## Resource measurements

Native macOS/APFS declaration; Node **24.19.0**, SQLite **3.53.3**, built-in backup
available. No platform shim. Measurements from the final repository run:

| Gate / phase | Elapsed | Peak RSS |
| --- | ---: | ---: |
| M2a schema 1 generation | 5.758 s | 70.47 MiB |
| M2a schema 1 paired operations | 0.304 s | 78.64 MiB |
| M2a schema 2 generation | 3.488 s | 71.30 MiB |
| M2a schema 2 paired operations | 0.275 s | 79.08 MiB |
| Existing M1 600 MiB generation | 1.540 s | 63.59 MiB |
| Existing M1 paired operations | 0.204 s | 71.45 MiB |
| Existing C1 catalog gate | 1.789 s | 68.53 MiB |

Each M2a fixture has exactly **10**, then **1,000** records; 4,096 fixed wrappers,
occurrence 2,048 in a registered child, a fixed map, and an evidence-only selected
log. Eight distinct, physically verified 75 MiB extension files total
**629,145,600 unrelated bytes**. Generation streams; growth adds metadata only.
Operation workers use a hashing/counting sink, retaining no output.

Every selected operation on either schema at either size used **10 core SQL
calls / 11 returned rows**, two connections and one lock, **3 artifact opens**
(root, overflow, map), **58 reads / 3,170,056 payload bytes**, zero payload writes
and zero unrelated body reads. Root/child sizes are 792,265 / 166 bytes; reads
remain below the unchanged **8 × 792,431 = 6,339,448-byte** allowance. Map bodies
are not read. Output is **682,922 bytes**, 8,192 sequential sink calls; this fixed
fixture's maximum chunk is 166 bytes. Separate Unicode/backpressure tests exercise
large chunks against the 64 KiB maximum. All fixed operation counts agree at
10/1,000 rows; fixture database hashes and artifact identities remain unchanged.

The worker uses a test-only wrapper around the dynamic opener to retain the
actual read handle's counters; it still invokes the unchanged native store.
Independent filesystem/SQLite instrumentation agrees on opens/read bytes and
also counts connection checks: schema 1 uses 25 statements/26 rows; schema 2
27/28, fixed at both sizes. These extra counts are distinct from core metrics,
which exclude connection PRAGMAs and descriptor/lock housekeeping. Neither
counter measures SQLite internal page I/O or device writes.

All workers stayed within **192 MiB V8 heap / 256 MiB RSS**, **60-second generation**
and **30-second paired-operation** deadlines, with bounded child termination.
M1/C1 gates ran fresh because the shared payload iterator changed. M1 metadata
operations read no payloads; imports accessed only new payloads and retained
26 SQL calls at both sizes. C1 retained fixed selected counts and zero payload I/O.
These are observed local results, not runtime or durability guarantees.

## Validation and boundary

The broader focused run passed **202/202** tests (consumer/importer/M1/C1).
The final `npm test` passed **383/383** in **55.350 s**, including **27** new consumer
tests and all fresh gates. `npm run check` passed with unchanged runtime build
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.
The focused run preceded the final lazy-import correction and the added physical
fixture-size assertion; the final repository run covers both. No historical
qualification result is substituted for that final run.
The final standalone consumer run also passed **27/27** in **15.084 s**, including
both 600 MiB fixtures. Documentation checks passed **73 local links, seven anchors
and three JSON examples**; tracked and new-file whitespace checks passed. No SQL
example or ADR requirement changed.

Reproduction: `node --test tests/unit/replay-other.test.js`, then the plan's
focused/full/check gates. The CLI oracle uses Git revision `84753ca921367cc4252aab9c3c1996171d2ac8c1`;
that history must be available. Tests create and remove only their own temporary
synthetic fixtures. Local logs are under `/tmp/pain-gain-m2a.z8ulLn/` and are not
repository artifacts. Preservation comparison found only the eleven intended
code/test/documentation paths changed. HEAD and the empty index remain unchanged;
the unrelated prompt deletion, runtime/build bytes and both trial worktrees match
their initial state. No staging, commit or push is part of this task.

M2a's synthetic consumer scope is complete, awaiting review. The full M2 reader/
writer and bounded-v2 integration gates, C2, migration/rollback and production
cutover remain deferred. The v2 whole-string capacity limitation persists.
No real evidence was accessed; captures, maps, reviews and both trial worktrees
remain outside the task. Power-loss durability, arbitrary OS close-failure
semantics, additional platforms/filesystems and external in-place mutation of
immutable files remain unqualified. No production speed or gameplay benefit is
claimed.
