# Explicit finished-match evidence retrieval

## Scope and prerequisites

The optional [single-intent handoff](explicit-intent-handoff.md) delegates here
with stable account-ID and arena-ID pins and a bounded session adapter. Standalone
CLI behavior is unchanged. Authentication and lifecycle handling remain in the
same reviewed helper; no alternative transport is introduced.

This worker processes one supplied match ID. It does not discover matches,
start them, operate playback, upload code, schedule itself, or admit evidence
to managed v2. Manual match selection remains the caller's responsibility.
The approximately 531 MB v2 manifest remains a separate admission risk.

Qualified environment: macOS arm64, Node 24.19.0, Python 3 with `fcntl.flock`,
installed Screeps Arena Steamworks native library for app 1137320, Steam signed
in and Arena running. No debugging, client patch or persistent configuration
change is required. Other platforms/ABIs, operation with Arena closed, Steam
restart recovery, session expiry and renewal remain unqualified. Every run
performs a fresh login; there is no automatic in-run reauthentication.

The default library is under
`~/Library/Application Support/Steam/steamapps/common/ScreepsArena/screeps_arena.app/Contents/Resources/app/dist/native_modules/dist/osx/steamworksjs.darwin-<arch>.node`.
`--steam-library <absolute-path>` is an explicit installation override, not a
new qualification. Required native libraries and payload paths must be resident.
macOS dataless inputs fail closed; the worker never requests hydration.

```sh
node tools/retrieve-match.js <match-id> <absolute-job-directory> \
  --account <username> --code-id <own-code-id> --code-version <version>
```

The output parent must already exist and be resident. Use a new/empty directory
outside Chromium cache, project sources and `replay_logs/`. Account is required;
code ID/version are optional identity pins but recommended. The worker always
requires exact match identity, authenticated account membership and finished
metadata before retrieving any chunks. `firstPlayerIndex` 0/1 selects the
metadata player ordering; this does not establish runtime/frame alignment.
No existing metadata adapter is modified.

## Transport and credential boundary

The short-lived child loads the installed binding, initializes app 1137320,
runs Steam callbacks, acquires `getSessionTicketWithSteamId(1137320n)`, waits
1.5 seconds as in the verified probe, then posts the ticket to `/api/auth/login`
with `X-ArenaProtocolVersion: 1`. It checks the public authenticated identity,
keeps the session cookie in memory and returns only public identity and match
responses over IPC. Native stdout/stderr are discarded. Auth response bodies,
tickets, cookies and headers are never persisted or printed. Errors are fixed
reason codes, not native/network exception messages. A response reflecting a
known credential is rejected before crossing the retention boundary.

Only GET `/api/game/<exact-id>`, `/log/<positive-end>` and `/replay/<end>` are
available after login in explicit-match mode. A separate discovery mode accepts
only account/arena history descriptors and exact match metadata, not log/frame
suffixes or arbitrary URLs; see [one-shot discovery](one-shot-discovery.md).
The explicit worker still uses its original match-bound mode. Redirects are
rejected. No match-start interface exists.
Requests use no-cache headers and Node's network transport, not Chromium cache.
Retained bodies are exact decoded HTTP bytes, not compressed wire bytes or
JSON reserialization. Authentication POST bodies are deliberately not retained.

Normal shutdown requests ticket cancellation, waits for its acknowledgment and
confirms child exit. A ticket acquisition still in progress must settle and be
cancelled before acknowledgment. Repeated close calls share the same shutdown
promise/result, including any failure. Ticket-cancellation exceptions remain
visible on repeated close; they are not converted into successful cleanup.

Shutdown allows one second for graceful close/exit, then sends SIGTERM and waits
one second, then sends SIGKILL and waits one second. A signal return value is
never exit confirmation: only an observed exit event/status is confirmation.
An operation timeout retains its original `session-timeout` reason while
shutdown proceeds. Forced authentication-child stops are reported explicitly;
without a cancellation acknowledgment, `ticket-cancellation-unconfirmed` is
reported even if the process exited. If exit remains unconfirmed after SIGKILL,
`child-exit-unconfirmed` is reported and local child handles are detached so they
cannot keep the parent alive indefinitely. The worker does not claim that child
or its external resources were released in that case.

SIGINT/SIGTERM, parent disconnect and handled failures attempt ticket cleanup.
Uncatchable termination, native crashes and power loss cannot guarantee it.
These bounds depend on the parent event loop/OS making progress; they are not a
hard real-time guarantee. They do not qualify renewal or Steam restart recovery.

## Plan, validation and coverage

For metadata duration N, request `/replay/0`, then both log and replay endpoints
at 100, 200, ... capped at N, with the terminal end requested only once. There
is no `/log/0`. Supported duration is an integer 0–100,000. For N=1279 the plan
contains metadata + initial frame + 13 log + 13 replay requests (28 total).

Metadata must identify this finished match and account/code mapping. Frame
responses must contain exactly the requested contiguous gameTimes. Log JSON
envelopes, request-key/runtime-label bounds, observed build IDs, map checksums
and diagnostic closure summaries are checked using existing pure validators.
Original bytes, including unrecognized console text, are retained independently
of parsed coverage. This is not the managed importer's complete admission
validation, a gameplay review or an authenticity guarantee against local edits.

The ledger separates:

- **Retrieval:** every planned request returned a retained, valid response;
  this yields `retrieved-all-planned-responses`, not “complete match evidence.”
- **Runtime emissions:** observed snapshot labels, closure labels, gaps and
  build/map summaries. Overall emission completeness remains `unknown` because
  expected emission boundaries are not inferred from metadata duration.
- **Frames:** exact observed local gameTime segments, independent of runtime
  labels. Invalid/missing scoring items are separately reported and do not
  discard a structurally valid frame response.
- **Admission/alignment:** always `not-attempted` / `unassessed` here. A retained
  map checksum is not managed map association or runtime/frame correspondence.

N game ticks run 0 through N−1. The qualified match reports N=1279, runtime labels
1–1278 and frames 0–1279. `/replay/0` succeeds and the prior probe found `/log/0`
404. These are distinct index domains: runtime label 1279 is not required merely
because N=1279. Initial/terminal execution semantics and action-marker timing
need separate evidence; this worker neither invents that mapping nor declares
missing runtime emissions from duration alone.

## Durable job, conflicts and retry

`ledger.json` pins version, match/account/code expectations, request plan,
attempt budget, per-request attempts, validation/coverage, outcomes and runs.
Each receipt records exact URL/method, UTC start/end, HTTP status, decoded byte
count, SHA-256, body path and validation result. Its fingerprint is SHA-256 of
`explicit-match-http-v1-url-and-body-sha256`, NUL, URL, NUL, body SHA-256; it is
not a managed-v2 fingerprint. Bodies are content-addressed under `bodies/`,
receipts under `receipts/`. No auth/cookie material is part of these formats.

Publication order: persist attempt intent; receive/validate; checkpoint receipt
intent; publish and fsync body; publish and fsync immutable receipt; checkpoint
request success. New files use exclusive creation/no-clobber linking; ledger
replacement uses same-directory atomic rename, with file and directory fsync.
All outputs are private files (0600) under private directories (0700).

For the handoff adapter, `session.get(suffix, attemptId)` carries the durable
worker attempt ID; the ordinary transport ignores this optional second argument.
An optional `session.retained(attemptId, receipt)` notification runs only after
body/receipt publication, and on verified recovery/reuse. It is outside the GET
retry catch. Adapter checkpoint errors are non-retryable operation failures with
their original system code and separate cleanup failures; they cannot discard a
successful response and convert it to a network retry. Before-GET adapter failures
are likewise explicitly classified. Genuine transport/timeouts retain their
existing bounded retry behavior. See the handoff document for durable reservations
and conservative accounting of attempts lacking retained receipts.

A persistent `.writer.lock` inode is held by a short-lived Python `flock`
helper whose stdin follows the worker lifetime. Concurrent writers fail; kernel
ownership is released when the helper exits, including parent death. The lock
inode is never deleted or “stolen” based on a stale PID. The worker checks helper
liveness before publication; do not externally kill the lock helper while its
parent is running. Filesystem/kernel advisory-lock guarantees apply, not a
distributed-storage lease.

Every post-spawn acquisition failure (including malformed/missing handshake,
spawn error or post-acquisition directory-fsync failure) enters bounded helper
shutdown before returning the original error. Release closes stdin, confirms
exit and escalates through the same one-second SIGTERM/SIGKILL stages if needed.
Repeated release calls share their result; an already-exited helper needs no
new signal. Unconfirmed exit is a cleanup failure, not permission to reuse or
delete the lock inode. This closes the previously reviewed fsync-error leak.

Public failures preserve the operation `reason` and append separate structured
`cleanupFailures`; filesystem errors can additionally expose a non-secret
`systemCode` such as EIO. Raw native/network messages and causes are not printed.
The worker's session-close, lock-release and failure-checkpoint errors cannot
replace the operation error. CLI cleanup failures exit unsuccessfully even when
the ledger already records all response bytes as retrieved: retrieval status is
not a claim of successful process/resource cleanup. No collection-status or raw
publication semantics were changed by this lifecycle correction.

Resume authenticates again and verifies retained body hashes, receipt identity
and validation before reusing any success. A body/receipt published before a
crash is recovered using checkpointed intent. Unfinished temporary publications
remain retained; they are not deleted or treated as successful evidence.
An interrupted request without a durable body consumes an attempt and can be
retried. Missing/corrupt committed bytes block rather than get overwritten.

Default budget is three attempts per request **across all invocations** of the
job. Retriable network failures and HTTP 408/429/5xx use bounded 1s/2s backoff;
HTTP 401/403 stop explicitly without renewal. HTTP 404/invalid responses remain
recorded as unavailable/invalid, leaving `partial` and exact unresolved keys.
No infinite polling occurs. Each HTTP request is bounded to 30 seconds and
100 MB decoded bytes; ordinary IPC calls to 45 seconds; CLI operation deadline
to ten minutes, followed by the bounded shutdown stages above.

Identical successful responses reuse a body. Ordinary resume makes no GET for
an already verified request. Explicit `--refresh` re-requests within the same
remaining attempt budget; two different HTTP-200 bodies for one request are
both preserved and cause `response-conflict`, even if each parses successfully.
Conflicts are not silently resolved. An exhausted/blocked job requires human
review, not a reset, deletion or automatic replacement. CLI exits 0 only for
all planned responses retrieved, otherwise 2 with a non-secret reason/summary.
The exported worker accepts a cancellation signal; programmatic callers must
provide an outer deadline if they do not use the CLI.

## Verification and current limits

Focused offline suites:
`node --test tests/unit/retrieve-match.test.js tests/unit/retrieval-lifecycle.test.js`.
It covers boundaries including duplicate terminal requests, interruption at
body/receipt/ledger publication, pending downloads, duplicate runs, changed and
corrupt bodies, identity/unfinished metadata rejection, bounded transport and
HTTP failures, concurrent writer exclusion, secret redaction/reflection, and
ticket cleanup. Tests use isolated synthetic directories and mocked transport;
they do not start matches, load Steam, import fixtures or qualify storage.
Before the lifecycle correction, all 29 focused tests passed, as did the resident-input `npm run check` and
explicit syntax checks of the new tooling. No runtime build was regenerated.

The lifecycle regression suite first reproduced both review blockers against
that unchanged candidate, then checks graceful/forced/failed exit confirmation,
idempotent shutdown, post-acquisition fsync and handshake failures, and combined
operation/cleanup errors. Its real subprocess is an offline Node mock, not the
Steam authentication child; the remaining fault injections are in-memory mocks.
No Steam loading, login or network retrieval is performed by these regressions.
After correction, all 41 focused tests (29 existing + 12 lifecycle regressions)
passed, along with resident-input `npm run check`, new-tool/test syntax checks
and scoped whitespace/conflict-marker checks. Both original reproductions were
observed failing before the fixes. No live verification was repeated.
Scoped correction receipts are retained separately at
`/Users/zoltanka/.local/share/pain-and-gain-evidence/retrieval-lifecycle-20261010-JJgSk4/`.

The 2026-10-10 live verification retrieved all 28 planned responses for
`6aca5a1a81bdde3573685fae`. Authenticated metadata identifies bushdoctor2008,
code `6aca5a1881bdde5eaa685fad` v24, player2, versus Dr. John H. Watson v9.
Raw bodies and resumable ledger are retained at:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/retrieval-worker-6aca5a1a-20261010-dupwsU/job/`.
The first run was 17:17:13.478Z–17:17:25.946Z. A second fresh-login resume verified
the retained job without additional evidence requests. These historical receipts
were not rewritten or rerun for the offline lifecycle correction. They are evidence for
explicit retrieval/resume, not automatic post-match collection or live benefit.

Historical disclosures remain: implementation-time Git diff hydrated
`.git/objects/82/33017b99ca850635f943d51cb8deec362431aa`; a later task observed
`pack-cf828b5a16e0174af147af2403981bc63a8bfd13.pack` becoming resident with cause
unestablished. Neither event is reversed or characterized as fully
no-hydration-compliant. Tactical/two-scout work, M2h and storage qualification
remain paused; arrival hold remains parked. Full `npm test` is not part of this
worker verification because it includes paused qualification suites.
