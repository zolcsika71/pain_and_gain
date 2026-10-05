# M2b bounded legacy diagnostic reader qualification

Date: 2026-10-04. Local implementation candidate, unstaged. A fresh complete
normal-concurrency repository suite now passes, so the current candidate is
qualified for M2b's bounded synthetic scope. Earlier incomplete runs and the
unresolved intermittent SQLite timing issue remain in the history below.
Base: `c8fe029b8c3bd3a6a8197cd9ad4ae8441c4fff16`.
Authority: [committed M2b plan](replay-storage-v3-m2b-plan-2026-10-04.md)
and [ADR 0006](../decisions/0006-replay-storage-v3.md).
This is synthetic-only tooling, not production activation or completion of M2.

## Implemented boundary

- [replay-legacy-reader.js](../../tools/replay-legacy-reader.js) exposes only
  `writeFixtureV2Other({root, replayId, fingerprint}, sink)`. Canonical direct
  temporary children, the exact bounded marker, native Node 24.19+/24.x and
  macOS are required. The marker declares local APFS; it is not a durability
  probe. No default root, CLI switch, repair, cache or lifecycle action exists.
- [replay-legacy-json.js](../../tools/replay-legacy-json.js) is a private
  positional scanner. It validates all JSON through EOF, selects the final
  effective records collection, walks the native visited prefix, preflights
  selected values, then streams a second selected traversal. It never parses
  the manifest or a whole record into an object and creates no index or spool.
- [M2a's consumer](../../tools/replay-other.js) remains unchanged. Native
  per-value parsing/serialization preserves duplicates, property order,
  surrogates, malformed UTF-8 replacement, signed zero and overflow-to-`null`.
  Non-null primitive/array records are skipped; a visited null fails, but null
  after the first match does not. Overwritten JSON must still be syntactically
  valid. Non-array diagnostic fields remain explicitly outside this adapter's
  compatibility domain, without narrowing the deployed CLI.
- One manifest descriptor is held through awaited output. No SQLite, writer
  lock, external artifact, map or payload is accessed. Atomic replacement/unlink
  preserves the pinned generation; size/mtime changes detected before output
  or on completion reject. This is not protection against arbitrary in-place
  modification that evades those checks, nor a multi-file snapshot.
- Limits remain 64 KiB read/output chunks, 1,024 open containers, 1 MiB raw,
  decoded and native-encoded selected values/control tokens, and 64 KiB fixed
  selection metadata. Skipped values are scanned without hydration. Unknown
  ancestor keys are discarded before descending; only constant-size kinds,
  offsets, counts and identity match flags survive selection. Native encoding
  is counted with bounded string slices before constructing output strings.
- Every sink call is awaited. Inspection/read/sink errors (including `null`)
  remain primary; descriptors receive cleanup attempts. A close failure without
  a primary error rejects. This does not qualify arbitrary OS close-failure
  semantics. Preflight failures emit no bytes; late I/O/sink failures may emit
  a prefix without successful completion.

No existing replay command, storage/catalog/payload implementation, dependency,
runtime source or build ID changed. Automatic completed-log reconciliation and
explicit score retirement remain in their existing callers. Selection does not
infer provenance, coverage or a gameplay verdict and does not alter reviews.

## Compatibility and failure evidence

[Synthetic tests](../../tests/unit/replay-legacy-reader.test.js) compare output
against both independent expected bytes and actual isolated `other` CLI copies
from commit `839de85a4afe2c8ea489164b9e90ac37ac2296ea`. Import hooks forbid SQLite
on both paths. Tests include compact/pretty input, duplicate/escaped keys,
first-match identities, nested decoys, optional collections and empty-v1
handling; malformed ignored/trailing/overwritten data; skipped tokens over
1 MiB; independent raw/decoded/encoded size errors and depth boundaries.

Child-process barriers replace/unlink at pin and sink boundaries. Fault tests
cover open-followed-by-inspection failure, early and late reads, sink failures
including `ENOENT`/`null`, cleanup errors, detected in-place writes, subsequent
successful reads and unchanged fixture metadata/bytes. M2a's existing actual
CLI broken-pipe checks remain part of focused verification.

## Measurements and validation

Native local environment: Node v24.19.0, macOS arm64, APFS. No platform shim.
The plan's resource limits are unchanged: 192 MiB heap, 256 MiB peak RSS,
60 seconds per format's generation and 120 seconds for paired operations.
All operations used newly generated temporary synthetic fixtures only.

Final-source sequential focused and repository runs measured:

| Format | Generation seconds / peak MiB RSS | Paired worker seconds / peak MiB RSS | Reader-only seconds, 10 / 1,000 records |
| --- | --- | --- | --- |
| Focused: compact | 0.466 / 70.06 | 5.586 / 189.97 | 1.767 / 1.876 |
| Focused: two-space pretty | 0.338 / 73.86 | 21.387 / 225.03 | 7.303 / 9.706 |
| Repository: compact | 0.686 / 69.91 | 5.726 / 160.00 | 2.058 / 2.054 |
| Repository: two-space pretty | 0.350 / 73.48 | 5.319 / 157.88 | 2.004 / 1.913 |

Worker time/RSS includes setup and preservation hashing; reader-only time and
access counters exclude that hashing. These are local observations, not timing
or memory guarantees on production data or other platforms.

Each of the four manifests physically contains 629,145,600 unrelated string
bytes in eight distinct 75 MiB values; exact 10/1,000 record counts are asserted
independently by generation and scanner instrumentation. Selection is last.

| Format / records | Manifest bytes | Manifest bytes read | Read calls including marker | Selected raw array bytes |
| --- | ---: | ---: | ---: | ---: |
| Compact / 10 | 629,830,083 | 1,261,025,921 | 19,245 | 682,923 |
| Compact / 1,000 | 629,967,693 | 1,261,301,141 | 19,249 | 682,923 |
| Pretty / 10 | 630,051,938 | 1,261,911,988 | 19,257 | 904,114 |
| Pretty / 1,000 | 630,223,208 | 1,262,254,528 | 19,263 | 904,114 |

Every invocation opens/closes exactly one marker and one manifest (peak one
owned descriptor), reads 68 marker bytes, and stays within
`2*M + 2*S + 4*65536` manifest bytes. No other bodies, SQLite or writes are used.
Peak captured raw selected elements are 166 bytes compact / 211 bytes pretty;
each invocation emits the same oracle hash and 682,922 output bytes in 8,192
awaited calls (maximum chunk 166 bytes). Tests separately cover 1 MiB elements.
Manifest hashes/size/mtime and marker bytes remain unchanged. Reads grow with
manifest size; unrelated manifest bytes are syntax-scanned, not indexed away.

Candidate validation:

- `node --test --test-concurrency=1 tests/unit/replay-legacy-reader.test.js tests/unit/replay-other.test.js tests/unit/replay-logs.test.js`:
  89/89 passed, including 13 new reader tests and fresh both-schema M2a gates.
- `npm run check`: passed; runtime build remains
  `fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.
- Six affected Markdown files: 80 local links, nine anchors and four JSON
  examples checked, with no broken targets or production-evidence reads.
- Normal `npm test`: 395/396 passed. Sequential complete repository command
  `node --test --test-concurrency=1 tests/unit/*.test.js`: 395/396 passed, with
  a different unchanged timing test failing (details below). No tests were
  excluded, deadlines changed or assertions weakened. Fresh M1/C1/M2a/M2b
  resource gates passed in these runs; none were merely inferred from old logs.
- Tracked and all four new files passed whitespace checks. HEAD/index remain
  unchanged. Non-candidate main bytes and both trial worktree inventories match
  the starting baseline; the unrelated prompt deletion remains unstaged.
  Production evidence was neither read nor changed. Final file/log hashes are
  retained in the local validation receipt for subsequent review.

### Earlier runs and unresolved qualification boundaries

The first standalone run passed both scale gates but exposed two test-fixture
errors: an escaped quote was mistaken for a closing quote, and `1e-7` was used
as a serialization-expansion example despite retaining that native format.
The fixtures were corrected (the expansion case uses `1e-6`), and their targeted
checks passed. Implementation error handling was also narrowed so a sink's
`ENOENT` is preserved rather than converted into unavailable fixture input.

A subsequent concurrently scheduled focused run passed 88/89 tests but exceeded
the compact gate's worker deadline. It was terminated by the unchanged test
watchdog. That failure is retained, not represented as a
pass. The sequential rerun's two M2b gates above passed without changing limits;
timing varied substantially. Concurrent load is a possible contributor, not an
established root cause or a guarantee of stable qualification under contention.

The normal-concurrency `npm test` run passed 395/396 tests, including both M2b
gates. The unchanged F3 schema-2 live-lock child returned a null exit code
(its helper has a 15-second kill watchdog). The exact F3 targeted rerun passed
in 6.037 seconds. Neither that test nor storage code was altered. The complete
suite was then rerun sequentially, preserving all deadlines and assertions.
That run also passed 395/396, including both F3 restart cases, but the unchanged
`SQLite busy exhaustion is bounded and cannot publish ready evidence` test in
[replay-store.test.js](../../tests/unit/replay-store.test.js) failed its
`elapsed >= 4500 && elapsed < 10000` assertion (total test time 10.971 seconds).
The new adapter is not imported by this storage test. A clean repository gate
under unchanged requirements remains necessary before declaring full candidate
qualification; passing subsets are not being combined into a fictitious
396/396 run. The observations do not establish the source of timing variation.
An isolated rerun of that exact busy-exhaustion test also failed the same upper
bound (total test time 11.048 seconds). Its storage implementation and test bytes
match HEAD. This remaining issue is reported separately rather than changing
storage behavior or its deadline within M2b.

### Controlled clean-HEAD comparison of the busy-time failure

The follow-up diagnosis used two fresh disposable directories on the same APFS
volume. The baseline was a `git archive` of
`c8fe029b8c3bd3a6a8197cd9ad4ae8441c4fff16`; the candidate began with that
archive and overlaid all ten M2b files from the main working tree. The source and
test involved in this failure were byte-identical in baseline, candidate and
main:

- `tools/replay-store.js` SHA-256
  `84a435a0563e974321ac16bf06a1aae8cbe9e876592d026fb51c1b8e16e65039`;
- `tests/unit/replay-store.test.js` SHA-256
  `947deb5a5e40749245d9fd4565145f98d6c04c82a8bae524099dcef1fdb32b89`.

Both directories used `/Users/zoltanka/Library/Caches/JetBrains/WebStorm2026.2/acp-agents/.runtimes/node/24.19.0/bin/node`, inherited the same environment,
had no `NODE_OPTIONS` or `UV_THREADPOOL_SIZE`, and needed no installed package
dependencies. Each pair ran sequentially; pair order alternated to expose order
effects. The reproducible command in each directory was:

```sh
node --test --test-name-pattern='SQLite busy exhaustion' tests/unit/replay-store.test.js
```

Every runner process exited normally with status 1, no signal, and the same
`elapsed >= 4500 && elapsed < 10000` assertion failure:

| Pair / order | Tree | Reported test ms | Process wall ms | 1-minute load before |
| --- | --- | ---: | ---: | ---: |
| 1 / 1 | HEAD | 11,117.933 | 11,665.673 | 11.450 |
| 1 / 2 | M2b | 10,918.617 | 11,509.485 | 9.134 |
| 2 / 1 | M2b | 10,925.769 | 11,651.826 | 8.424 |
| 2 / 2 | HEAD | 11,276.232 | 12,199.179 | 7.202 |
| 3 / 1 | HEAD | 11,105.862 | 12,456.028 | 7.783 |
| 3 / 2 | M2b | 10,929.655 | 11,736.388 | 9.055 |
| 4 / 1 | M2b | 11,115.739 | 13,065.716 | 8.499 |
| 4 / 2 | HEAD | 10,992.949 | 12,002.081 | 7.385 |
| 5 / 1 | HEAD | 10,956.240 | 11,928.670 | 6.556 |
| 5 / 2 | M2b | 11,985.596 | 13,433.657 | 8.500 |

HEAD failed 5/5: 10,956.240–11,276.232 ms, median 11,105.862 ms,
mean 11,089.843 ms. M2b failed 5/5: 10,918.617–11,985.596 ms, median
10,929.655 ms, mean 11,175.075 ms. The overlapping ranges and alternating
results establish that the failure reproduces on clean HEAD; they do not
support a candidate-specific timing regression. System load was nontrivial on
the 10-logical-CPU host, but the test failed across the recorded 1-minute load
range. This comparison does not isolate load as a cause.

The test holds `BEGIN IMMEDIATE` on one `DatabaseSync` connection and asks the
store to write through another. Each store connection sets and reads back
`PRAGMA busy_timeout=5000`. The separate filesystem owner lock allows 50 attempts
at 100 ms and only considers an owner stale after 30 seconds; in this probe it
was not the long wait. The test timeout is 15 seconds, while its inner accepted
wall-clock interval is 4.5–10 seconds.

A scratch probe recreated the same public fixture/insert/write sequence and
timed native `DatabaseSync` boundaries without changing either tree. Three more
alternating pairs all completed normally and caught
`ERR_SQLITE_ERROR: database is locked`:

| Pair / order | Tree | Probe ms | `BEGIN IMMEDIATE` ms | 1-minute load before |
| --- | --- | ---: | ---: | ---: |
| 1 / 1 | HEAD | 11,973.811 | 11,811.236 | 12.108 |
| 1 / 2 | M2b | 11,433.466 | 11,336.285 | 13.787 |
| 2 / 1 | M2b | 11,540.623 | 11,450.535 | 17.751 |
| 2 / 2 | HEAD | 10,873.516 | 10,802.371 | 17.080 |
| 3 / 1 | HEAD | 10,767.380 | 10,750.041 | 14.515 |
| 3 / 2 | M2b | 10,749.556 | 10,730.315 | 15.108 |

Connection PRAGMA setup/readback, store identity queries and close were each
below one millisecond in the first instrumented pair. The only long measured
operation was native `db.exec('BEGIN IMMEDIATE')`. The supported immediate cause
is therefore the native busy wait exceeding the test's 10-second wall-clock
upper bound even though the connection reports a 5,000 ms busy timeout. SQLite's
[busy-timeout contract](https://sqlite.org/c3ref/busy_timeout.html) describes
repeated sleeps until **at least** the configured milliseconds have accumulated;
it does not promise that the call returns within that wall-clock interval. The
test's 10-second ceiling is therefore not guaranteed by the underlying API, but
that minimum-sleep contract does not itself explain why these calls took roughly
twice the configured timeout. The comparison does **not** establish which
Node/SQLite/VFS or scheduler behaviour accounts for the additional time on this
host; load interaction remains a hypothesis. Assigning a lower-level root cause
requires native telemetry captured while the delay is occurring.

The compact machine-readable [comparison evidence](replay-storage-v3-m2b-busy-comparison-2026-10-04.json)
retains every paired outcome, command, relevant settings and classification.
Earlier M2b and F3 failures above remain part of the history. At this comparison
stage, M2b-specific gates passed but M2b was **not fully qualified** because no
complete prescribed repository suite had passed. Any change to storage retry
behaviour or the test's timing contract requires a separately authorized task.

### Standalone `node:sqlite` follow-up

The follow-up used the repository's reproducible
[standalone probe](diagnostics/replay-storage-v3-sqlite-busy-probe.mjs), which
imports only Node built-ins and creates/removes only databases beneath the real
temporary directory. It used the same Node executable and SQLite library as the
failing test (Node v24.19.0, SQLite 3.53.3), local APFS, `DELETE` journal mode,
`synchronous=FULL`, `foreign_keys=ON`, `mmap_size=0`, `cache_size=-8192` and an
explicit `BEGIN IMMEDIATE` holder. Both same-process and child-process holders
sent a locked/in-transaction handshake before contender timing began. Each
contender's timeout was read back, CPU time and monotonic elapsed time were
recorded, and a successful write after holder release checked cleanup. The
bounded repeated matrix was:

```sh
PROBE_DIR=$(mktemp -d /tmp/pain-gain-sqlite-probe.XXXXXX)
node docs/architecture/diagnostics/replay-storage-v3-sqlite-busy-probe.mjs \
  --output "$PROBE_DIR/results.json" \
  --repeats 3 \
  --timeouts 0,100,1000,5000
```

All 24 runner processes and all cross-process holders exited normally. Every
contender returned `ERR_SQLITE_ERROR: database is locked`, every timeout read
back exactly, and all post-release writes succeeded:

| Timeout ms | Holder | Elapsed ms min / median / max |
| ---: | --- | ---: |
| 0 | same process | 0.047 / 0.047 / 0.055 |
| 0 | child process | 0.051 / 0.053 / 0.168 |
| 100 | same process | 112.387 / 116.624 / 118.124 |
| 100 | child process | 119.483 / 123.541 / 123.570 |
| 1,000 | same process | 1,061.556 / 1,067.672 / 1,067.927 |
| 1,000 | child process | 1,058.222 / 1,066.995 / 1,071.963 |
| 5,000 | same process | 5,203.513 / 5,213.925 / 5,215.701 |
| 5,000 | child process | 5,201.998 / 5,204.822 / 5,216.331 |

Three no-project-import controls under `node --test` measured 5,201.582–
5,216.305 ms. A control with ten CPU-busy Node workers raised the recorded
one-minute load from 10.274 to 20.902 but measured 5,486.027 ms. This single
load control does not exclude every scheduler/load interaction; it demonstrates
only that this controlled CPU saturation did not reproduce the doubling. An
unchanged invocation of the project test in the same follow-up window passed at
5,349.744 ms (5,413.415 ms runner duration). No second Node executable or
distinct supported writable local filesystem was already available, so neither
was installed or configured for this investigation.

The standalone result therefore does **not** reproduce the 10.73–11.81 second
delay. Together with the current passing project control, it establishes that
the earlier delay is intermittent rather than an invariant of the minimal
Node/node:sqlite/APFS locking pattern. It remains non-M2b-specific because the
clean-HEAD comparison above failed 5/5 alongside M2b. It does not establish a
lower-level cause: no native trace exists for a doubled wait, and transient
scheduler, QoS, power/thermal, VFS and busy-handler interactions remain
unseparated hypotheses.

The machine-readable [standalone evidence](replay-storage-v3-sqlite-busy-standalone-2026-10-04.json)
contains every run's executable, versions, filesystem location, timeout
read-back, monotonic elapsed and CPU time, error and process outcomes, plus
artifact hashes. The raw 24-run output remains in its recorded scratch path.
Earlier M2b, F3 and busy-time failures remain in this qualification history.

The next discriminating experiment, if the doubled delay recurs, is an
interleaved standalone/project run in the same time window with native
syscall/VFS sleep tracing and process QoS, power, thermal, App Nap, timer and
load state. That requires a separate diagnostic task and may require tracing
privileges. A separately authorized test-robustness correction could instead
move the blocking contender into a child process and enforce a project-owned
hard upper bound with a parent watchdog, while retaining the timeout read-back,
holder handshake, lower bound, expected lock error, no-publication assertion
and child cleanup. Its bound must not be described as an SQLite guarantee and
would require repeated idle/load runs plus a clean full suite.

Follow-up validation parsed all 24 standalone rows, eight summaries and three
`node --test` controls from the retained evidence. The probe passed
`node --check`; `npm run check` passed with the unchanged runtime build ID
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.
The six affected M2b Markdown documents passed 84 local-link checks, nine anchor
checks and their JSON example; both diagnostic JSON records parsed, and tracked
plus diagnostic-file whitespace checks passed. These checks validate the
diagnostic record, not the previously incomplete full repository suite.

The successful controls do not retroactively convert the retained 395/396
repository suites into passes. M2b-specific gates remain passing, but M2b is
not promoted by those controls alone.

### Fresh complete normal-concurrency qualification

After the standalone investigation, the candidate and protected-state hashes
were rechecked against the retained validation receipt. One and only one fresh
complete suite was then started at `2026-10-04T18:49:37.642Z`:

```sh
npm test
```

This invoked the unchanged `node --test tests/unit/*.test.js` package script
with normal concurrency, assertions, deadlines, resource limits and test
selection. It ended at `2026-10-04T18:50:49.535Z` with status 0. TAP reported
396/396 passing, zero failures/skips/cancellations/todos and 62,983.144 ms test
duration. The unchanged SQLite busy-exhaustion test passed in 5,323.266 ms.
No retry followed this result.

The complete run also executed every prescribed resource gate:

| Gate | Generation seconds / peak MiB RSS | Operations seconds / peak MiB RSS |
| --- | ---: | ---: |
| M2b compact 600 MiB, exact 10/1,000 records | 5.224 / 70.33 | 4.755 / 182.84 |
| M2b pretty 600 MiB, exact 10/1,000 records | 5.993 / 72.97 | 4.690 / 169.25 |
| M2a schema 1 600 MiB | 7.763 / 70.33 | 0.310 / 78.72 |
| M2a schema 2 600 MiB | 3.989 / 71.14 | 0.300 / 79.83 |
| M1 600 MiB | 1.702 / 63.56 | 0.228 / 72.02 |
| C1 10/1,000 anchors | not separate | 1.694 / 68.17 |

The [machine-readable run evidence](replay-storage-v3-m2b-qualification-run-2026-10-04.json)
records the command, executable and Node/SQLite versions, start/end times, exit
status, gate measurements and complete TAP output. This successful complete run
satisfies the previously missing repository gate, so the current candidate is
**qualified for the bounded synthetic M2b scope**. The earlier 395/396 runs are
retained above, and the intermittent doubled busy wait remains unexplained. A
future recurrence still warrants the discriminating native-trace experiment;
this pass is not evidence that the timing issue cannot recur.

Broader bounded v2 access, CLI activation, other reader/writer integration,
larger selected-value support, C2 and M3/M4 remain deferred. Whole-manifest
production reads/writes are unchanged. No production processing, durability,
power-loss, arbitrary external-write/close-failure, other-platform or gameplay
qualification is implied. Review and separate authorization remain necessary.
