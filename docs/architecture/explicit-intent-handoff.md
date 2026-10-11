# Explicit single-intent retrieval handoff

## Scope and invocation

This command selects exactly one immutable discovery intent. It is not a queue
consumer, scheduler, discovery loop, watcher or automatic post-match collector.
It never starts matches, operates playback, imports managed evidence, completes
reviews or deletes evidence. Live use requires separate authorization.

    node tools/retrieve-intent.js /absolute/resident/discovery-spool <account-id> <game-id>

All three positional arguments are required; additional arguments are rejected.
The account/game key uses the actual game ID, not a history-wrapper ID. The spool
must already exist outside the repository and Cache_Data. Symlinked payload
directories/files and dataless inputs fail closed. No filesystem hydration is
requested. There is no backlog selection, refresh flag or arbitrary output URL.

## Identity and eligibility

Under the discovery spool's existing writer lock, the handoff verifies bounded
ledger, receipt, body and intent bytes. It reuses discovery's pure validation
and attributable-identity-failure logic. Receipt bytes must equal their ledger
representation; body length/hash and validation must reproduce. Repeated receipt
IDs, unsafe references and conflicting identities fail closed.

The selected intent must reproduce its original finished metadata and exact
account, arena, match, code/version and stable job path. Its immutable bytes and
index hash must match. Current eligibility must be exactly true, with no sticky
identity failure, blocked intent or observed conflict. The latest selected
metadata must validate as finished and replay-available and match the ledger's
current metadata reference. Later unavailable/non-finished metadata cannot be
hidden by an older successful receipt. List projections cannot replace metadata.

Pending discovery publication or an unfinished/in-flight discovery run requires
discovery recovery first; this command does not repair discovery state. Verification
currently checks all referenced discovery receipts (within limits), so unrelated
corrupt retained evidence also fails closed. It does not establish server freshness,
retention, all-mode coverage or lossless catch-up. Historical positions 40–46 stay
missing in the original fixture; fresh coverage is separate evidence.

## Locking and durable association

The discovery writer lock is held through retrieval and its authentication/job
cleanup. This intentionally serializes even different selected matches in one
spool and prevents contract-compliant discovery from revoking eligibility during
dispatch. The retrieval worker acquires its own job lock. Lock order is discovery
then job; no reverse acquisition is introduced. A lock-loss monitor aborts the
worker, and guards check the discovery/intent byte identities before dispatch,
login, each GET and return. These checks detect out-of-contract edits but cannot
make arbitrary external writers obey locks.

For a selected key, files under retrieval/<account-id>/ are:

- <game-id>.association.json: immutable intent hash, identity, stable job path
  and fixed attempt policy.
- <game-id>.handoff.json: separate bounded invocation history, dispatch/error/
  partial/completion state and request/byte counters.
- <game-id>/: the existing retrieval worker's own locked, resumable raw-response
  job. The handoff does not implement a second transport, ledger or resume engine.

Publication is fsynced association, then dispatch checkpoint, then worker call.
An existing association must match byte-for-byte; unassociated pre-existing jobs
are rejected. Interrupted association publication is retried at the same path
without deleting pending artifacts. Interrupted dispatch is marked interrupted
on retry, and the same worker job is resumed. Even a prior successful handoff
revalidates eligibility/evidence and delegates byte-verified resume to the worker;
it does not treat a handoff status as proof that retained worker bytes are intact.
Independent spools cannot enforce global account/game uniqueness.

Intent bytes, discovery ledger and eligibility are never rewritten by handoff.
The worker receives additional optional stable account-ID and arena-ID pins.
Its ordinary unpinned interface/ledger shape remains compatible; newly pinned jobs
cannot silently adopt an older unpinned ledger. Fresh login must match the stable
account; worker metadata must also match the arena before chunk retrieval.

## Fixed budgets and outcomes

One invocation: ten minutes after discovery-lock acquisition, one selected job,
one worker call, one login with no renewal, at most 100 evidence GETs, 15 seconds
and 16,000,000 decoded bytes per HTTP response, and 512,000,000 decoded GET bytes.
A full response allowance is reserved before every GET; remaining space below
16 MB stops the run. Each reservation is checkpointed against the worker's unique
attempt ID before dispatch. After the worker durably publishes the exact body
and immutable receipt, its optional `session.retained(attemptId, receipt)` callback
replaces that reservation with the actual decoded byte count. This callback is
outside the transport-retry boundary. Checkpoint failures stop with their original
system code (for example EIO); separate cleanup failures cannot replace it.
The successful response is already retained even if its accounting checkpoint fails.

On resume the worker verifies retained bytes and validation before repeating this
idempotent notification, including receipt recovery from a published body. Accounting
updates the original invocation's reservation, not the new run's GET count. Duplicate
notifications cannot charge twice or change a receipt fingerprint. An attempt with
no verified retained receipt keeps its full reservation, including a failed transport
attempt; this conservative charge may exhaust the byte budget before the GET limit.
Old jobs without per-attempt reservations remain byte-verified reusable evidence,
not newly issued GETs. The login body is not persisted or counted in GET bytes;
its separate 16 MB limit bounds accepted aggregate HTTP bodies to 528 MB.
These limits do not describe compressed wire bytes or network framing.

The existing worker retains at most three attempts per request across retries
and invocations, with its existing backoff/conflict behavior and no forced
refresh. A new handoff run has fresh per-invocation request/byte budgets, but never
resets prior counters/reservations or worker attempt history. The request count
includes durable pre-dispatch reservations even if a later failure prevents GET.
Resume still logs in but reused bodies do not imply fresh GETs.
Verification allows 1,000 receipts, 128 MB cumulative reads, 32 MB discovery
ledger, 8 MB per discovery body/receipt, and 1 MB intent. Handoff state allows
1 MB and 100 invocations; exhaustion fails explicitly, without compaction.

SIGINT/SIGTERM and the deadline abort the worker through its existing signal
contract. Lock acquisition and final graceful/TERM/KILL cleanup retain their
separate bounded stages. OS/event-loop progress is required; synchronous disk
operations are not hard-real-time bounded. Forced stops without acknowledgment
cannot confirm Steam ticket cancellation; errors remain explicit.

Worker failures and unavailable coverage produce partial state, not successful
retrieval. Original operation errors retain separate cleanupFailures in thrown/
CLI results. Failure checkpoints preserve these where storage/lock access permits.
An outer lock-release failure after the final checkpoint makes the invocation
fail; the saved worker outcome alone does not attest successful outer cleanup.
Keep the command's exit/result receipt when qualifying live use.

retrieved-all-planned-responses describes only the worker's planned requests.
Runtime-emission completeness remains unknown, managed admission not-attempted
and analysis alignment unassessed. No general collection-completeness claim follows.

## Offline verification and limits

    node --test tests/unit/retrieve-intent.test.js
    node --test tests/unit/discover-matches.test.js tests/unit/retrieve-match.test.js tests/unit/retrieval-lifecycle.test.js

The handoff suite uses isolated, retained synthetic spools and mocked workers or
the existing worker with mocked transport. It covers evidence/identity/eligibility
rejection, immutable association, interrupted publication, concurrent exclusion,
sticky conflicts, request/byte budgets, error composition and byte-verified resume.
No live spool is dispatched, no Steam library loaded and no network request made.
Full npm test is excluded because it includes paused qualification suites.

Implementation verification on 2026-10-10 passed 35 handoff tests plus 48 discovery
and 41 retrieval/lifecycle tests (124 total), npm run check, explicit syntax and
scoped whitespace checks. Runtime build ID remained unchanged. Receipts:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/intent-handoff-20261010-BSGuZZ/`.

The later checkpoint-boundary correction first reproduced two offline failures:
post-GET EIO was retried as transport failure, and simultaneous cleanup failure
hid EIO. Its regressions additionally cover interrupted body/receipt publication,
persistent bookkeeping failure, verified recovery, pre-request checkpoint failure,
genuine transport retries and unsettled-budget enforcement. Separate before/after
receipts (not new live qualification):
`/Users/zoltanka/.local/share/pain-and-gain-evidence/handoff-checkpoint-fix-20261010-nJbm3K/`.
All 44 handoff and 41 retrieval/lifecycle tests passed (85 executed), along with
`npm run check`, syntax and scoped whitespace checks. Discovery's unchanged
48-test receipt was reused, not rerun. The runtime build ID was not regenerated.

The initial 57 discovery intents were created inactive. Subsequent separately
authorized live handoff processed one selected match and verified resume with
zero additional evidence GETs; it did not dispatch the backlog. See the
[consolidation checkpoint](replay-progress-2026-10-11.md) for the exact receipt.
Authentication renewal, Steam restart recovery and Arena-closed operation remain
unqualified. Managed-v2's measured 533,731,722-byte manifest is a separate admission risk.
Historical Git-blob hydration, the pack residency change with unresolved cause,
and the earlier setup-error artifact remain disclosed in the linked discovery/
retrieval documents. Tactical/two-scout work, arrival hold, M2h and unrelated
storage work remain paused/parked.
