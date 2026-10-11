# Bounded one-shot match discovery and handoff intents

## Scope

This is a manually invoked discovery command, not automatic post-match collection.
The user starts matches in Arena. This tool never starts a match, plays a replay,
downloads logs/frames, invokes the retrieval worker, subscribes to sockets, imports
managed evidence, marks reviews done, releases claims, or deletes evidence.

It uses the corrected authentication child and durable publication/lock helpers
from [explicit retrieval](explicit-match-retrieval.md). Authentication expiry
renewal, Steam restart recovery and Arena-closed operation remain unqualified.
The approximately 531 MB managed-v2 manifest is a separate admission risk.

## Invocation

The output parent must already exist and be resident. Select one dedicated spool
outside the repository and Chromium Cache_Data. Reuse that same spool for this
account/arena; independent spools cannot enforce global deduplication.

    node tools/discover-matches.js /absolute/resident/discovery-spool \
      --account bushdoctor2008 \
      --account-id 60ce13d2df54262f119a12d8 \
      --arena-id 6a86d8c454a3948a1e35f90c

Optional: --max-requests (1–1000, default 100) and --steam-library (explicit native
installation override, not a qualification). The command is not invoked live as
part of implementation verification. No scheduler or watcher is installed.

Limits: one authentication login; 100 GETs by default; three reconciliation
sweeps; 15 seconds and 8,000,000 decoded bytes per HTTP request; ten minutes for
the invocation after lock acquisition. Every request consumes budget, including
errors. There is no in-run login renewal or per-request retry loop. A later sweep
may revisit a failed history page, within the same request/sweep/time budgets.
401/403 stop explicitly. SIGINT/SIGTERM request interruption.

Lock acquisition and final cleanup use their separately bounded existing stages.
The deadline includes retained-evidence verification and applies to login and
pending GETs. Timers require event-loop/OS progress; synchronous filesystem calls
are not hard-real-time operations. Authentication close still requires confirmed
exit and reports unconfirmed ticket cancellation after forced termination.
Operation errors retain separate cleanupFailures; cleanup failure produces an
unsuccessful CLI exit even if evidence/intents were already saved.

## Narrow transport and identity

Discovery mode accepts only structured request descriptors:

- history with integer offset 0–100000: GET
  /api/arena/<arena-id>/rating-history?search=&offset=<offset>&limit=10;
- last-games: GET /api/arena/<arena-id>/last-games;
- fame: GET /api/fame/<arena-id>/games;
- metadata with a 24-hex match ID: GET /api/game/<match-id>.

There is no arbitrary URL, POST, start, save, cancel, log or frame operation in
discovery mode. Explicit retrieval mode retains its original match-bound
allowlist. The session verifies both authenticated username and stable account ID.
Tickets/cookies remain in isolated child memory; native output is suppressed,
credential-reflecting responses are rejected, and only safe reason codes are
reported. Raw authentication responses/headers are never retained.

The spool pins account name, stable account ID and arena ID. A different identity
cannot reuse it. History wrapper _id is NOT the match ID: use game._id. Rows must
link the account and arena, two distinct referenced codes and owners, and exactly
one owned code with a valid version. Exact metadata must additionally identify
the requested match in both envelope and nested game, and validate player-index
shape when finished. Only status "finished" creates an intent. Finished matches
with game errors are not silently excluded. Cancelled, pending, unknown statuses,
missing replay, malformed rows and unavailable metadata remain explicit.

Each new match needs exact metadata, not just a list projection. Code identity
must agree with its discovery row. Conflicting observations are retained and
block the match; an already published intent is preserved but its ledger entry
is marked blocked. Share/rank projection flags are not identity/completion gates.

Rejected identity evidence also blocks its attributable match, not just otherwise
valid rows with changed code IDs/versions. Separate `identityFailures` state links
each failure to its retained receipt and reason; immutable intent and receipt
bytes are not rewritten. For metadata, the exact request identifies the affected
match, not an unexpected returned ID. For lists, only a valid nested `game._id`
can identify a subject; wrapper IDs, absent/invalid game IDs and general malformed
or unavailable responses cannot be attributed to another intent. Blocks survive
restart and are never cleared by later replay availability. Replaying verified
old rejection receipts derives the same blocks without changing their validation
format. Rejected pages still do not become successfully enumerated pages.

## Durable evidence and handoff

An explicit, separately invoked [single-intent consumer](explicit-intent-handoff.md)
now implements the locked handoff below. Discovery itself still executes no jobs.

The spool contains:

- collection/: optional reserved coordinator control directory. Discovery permits
  its presence but never reads or mutates its scope, queue or locks. The local
  coordinator candidate is deferred from this publication and inactive; see the
  [consolidation checkpoint](replay-progress-2026-10-11.md).
- discovery.json: versioned account/arena state, response receipts, observed IDs,
  identity failures, pending publications, intent index and append-only run history;
- bodies/<sha256>.response: exact decoded response bytes, including HTTP errors;
- receipts/<uuid>.json: descriptor, exact URL/method, UTC times, status, byte
  count, SHA-256 and validation;
- intents/<account-id>-<game-id>.json: one immutable retrieval intent;
- .writer.lock: persistent inode used by the existing flock helper.

Bodies deduplicate by exact hash/bytes. Changed responses receive distinct bodies
and receipts, never overwrite prior responses, and are reconciled by IDs rather
than presumed immutable history. Resume verifies hashes, bytes, receipt identities
and rederived validations. Missing/corrupt committed evidence blocks reuse.

Publication order is: request intent checkpoint; response publication intent;
fsynced body; immutable fsynced receipt; response checkpoint; observations;
pending handoff checkpoint; immutable handoff; handoff-index checkpoint; then
page checkpoint. The directory is fsynced through the existing helpers. Partial
publications are reconciled before a fresh sweep. An absent unpublished body
records an interrupted-publication gap; partial temporary files remain retained.
A verified receipt is replayed into discoveries after interruption, so a crash
before page bookkeeping cannot silently discard its IDs. All referenced evidence
is verified before recovering pending handoffs. A 32 MB ledger limit fails
explicitly instead of silently dropping history; no compaction/cleanup is provided.

Example handoff shape (placeholder IDs are illustrative, not real evidence):

    {
      "version": 1,
      "key": "<stable-account-id>/<actual-game-id>",
      "state": "pending-retrieval",
      "identity": {
        "account": "<username>", "accountId": "<stable-account-id>",
        "arenaId": "<arena-id>", "matchId": "<actual-game-id>",
        "codeId": "<own-code-id>", "codeVersion": 24
      },
      "metadataReceipt": "<receipt-uuid>",
      "metadataBodySha256": "<sha256>",
      "createdAt": "<metadata-receipt-UTC>",
      "retrieval": {
        "matchId": "<actual-game-id>", "account": "<username>",
        "codeId": "<own-code-id>", "codeVersion": 24,
        "output": "<spool>/retrieval/<stable-account-id>/<actual-game-id>"
      },
      "execution": "not-started",
      "managedAdmission": "not-attempted"
    }

The fixed account/match filename and single writer reconcile duplicate sources
and crash retries to the same intent. No worker directory is created or worker
called. A future authorized consumer must verify the intent/evidence, require
the ledger intent's `eligible === true` with no identity block, create resident
output parents, and resume the same explicit-match job directory. It must not
infer execution from intent existence or overwrite an existing partial job.
Retrieval descendants, if later
created by an authorized consumer, are left untouched by discovery.

Existing intents reuse verified historical metadata; a repeat discovery run does
not imply fresh server validation of that metadata. Discovery observations and
metadata can differ in recency. List projections do not replace the last exact
metadata status. Unfinished/unavailable IDs remain in the spool and are rechecked
by ID even after disappearing from current lists, within request budgets.

Readiness requires identity-validated exact metadata with both
`status === "finished"` and `hasReplay === true`. A non-finished refresh remains
unresolved even when it reports a replay. An existing intent is not a reason to skip an
unresolved recheck. At most one metadata request per match per invocation
is allowed, sharing the ordinary request/time budget across sweeps and feeds.
Fresh bytes and validation receipts precede updating availability; successful
refresh preserves the original intent, key and historical metadata reference.
Unavailable responses leave availability unresolved for a later invocation;
identity conflicts block further rechecks and cannot be repaired automatically.
Interrupted refresh publications use the same verified body/receipt recovery as
other responses. Finished, replay-available intents still reuse historical
metadata; a repeat run does not imply fresh validation for those matches.

Eligibility is mutable ledger state, separate from immutable intent bytes.
Non-finished/unavailable metadata sets it false; a later matching finished,
replay-available response can set it true only without an identity conflict.
On restart all intents are durably ineligible until retained evidence is verified
and receipt recovery/replay completes. Intermediate older receipts cannot publish
transient eligibility. Missing eligibility on an older ledger is not readiness.
Non-finished state remains an explicit unresolved gap after recovery or an
unavailable recheck. This state neither clears sticky identity blocks nor executes
retrieval; a future consumer must coordinate with the spool's writer lock and
verify current evidence rather than use an old copy of eligibility.

## Catch-up and outcomes

Every invocation starts history at offset zero. A saved offset is audit progress,
not a stable cursor to resume blindly. Pages have ten rows with two-row overlap
(stride eight); the terminal offset is requested explicitly. All distinct IDs,
including equal timestamps, are retained. No timestamp cutoff/current-match-only
shortcut is used. Metadata and handoff/unavailable records are persisted before
advancing the page checkpoint.

Count changes, short pages, broken overlaps, repeated/reordered IDs, differing
complete sweeps and missing historical anchors record gaps. Up to three sweeps
seek two consecutive identical complete ID sequences. No concurrent-insertion
guarantee follows from this observational agreement. Supplementary last-games and
Fame snapshots are requested once per invocation; their all-mode/retention scope
is not inferred. Failure/truncation of either feed remains explicit.

Outcomes are deliberately not "fully caught up":

- available-history-enumerated describes two agreeing full history sweeps only.
- enumerated-with-coverage-gaps (CLI 0) additionally has no operational unresolved
  cases in this run. It still reports retention-unqualified,
  mode-coverage-unqualified and pagination-snapshot-unqualified.
- partial-with-gaps (CLI 2) records unavailable pages/metadata, unfinished IDs,
  conflicts, missing anchors, budget exhaustion or failed reconciliation.
  Thrown failures also retain a partial run/checkpoint where storage permits.

No outcome proves every manually launched match was discoverable after downtime.
Unknown expected boundaries prohibit that claim. Earlier run gap records remain
retained even when a later run enumerates successfully. A future lossless claim
requires authoritative retention/mode/pagination guarantees or an explicitly
accepted limited coverage boundary. Disappearance can identify missing known
anchors, not the count or IDs of matches never exposed by the server.

Discovery, response retrieval, runtime-emission completeness, managed admission,
state alignment and review completion are separate. None is inferred from another.

## Offline verification and provenance

    node --test tests/unit/discover-matches.test.js
    node --test tests/unit/retrieve-match.test.js tests/unit/retrieval-lifecycle.test.js

The discovery fixture copies exact decoded bodies from the bounded qualification
directory discovery-qualification-20261010-6jjvYv with URL/status/hash provenance.
All 11 original body fingerprints are checked. History reports 57 entries but
only positions 0–39 and 47–56 were retained. Positions 40–46 are a real evidence
gap: tests never invent those records. Repacked offset pages in the offline
integration mock are explicitly derived, not original server responses. Only
the known match has retained exact metadata; other metadata requests are mocked
unavailable. This partial sample must yield a partial result and one known intent.

Additional cases are labelled synthetic. They cover duplicate sources and
wrapper IDs, equal timestamps/multi-page downtime, metadata mismatch, pending
completion after disappearance, cancellation/unavailable replay, crash points
through receipt and intent publication, repeated runs, changing counts/overlaps,
missing anchors, limits, authentication failure, corrupted evidence, concurrent
writers, blocked intents and narrow GET destinations. Handoffs are inspected as
data only; no retrieval worker, real Steam library or network is invoked.

Implementation verification on 2026-10-10 passed the final 34 discovery tests and
the 41 affected explicit-retrieval/lifecycle tests (75 covered tests). The latter
ran with the preceding 33-test discovery suite; discovery was rerun after adding
the output-alias boundary guard and regression. The existing retrieval
tests exercise only mocked/offline jobs, not live retrieval. Resident-input
`npm run check`, explicit new-tool/test syntax and scoped whitespace checks
passed. No runtime build was regenerated; its ID remains
`2482a48b279c6b43b7dab748a3ea6d2599fbfc54a6b91f46cdc481fa7e09f903`.
Receipts: `/Users/zoltanka/.local/share/pain-and-gain-evidence/discovery-implementation-20261010-lENUBt/`.

The subsequent discovery correction reproduced both review defects before the
fix (two failing mocked regressions), then passed all 46 discovery tests, including
12 focused regressions. Coverage includes durable rejected-identity blocks,
ambiguous/list-wrapper IDs, wrong-match metadata isolation, replay-availability
refresh without duplicate intents, unavailable/conflicting refreshes, request
budgets, interrupted body/receipt publication, and separate operation/cleanup
errors. Syntax, scoped whitespace and resident-input `npm run check` also passed.
Authentication, retrieval and lifecycle sources were unchanged; their prior
41-test validation was reused, not rerun. No live qualification occurred.
Separate before/after correction receipts:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/discovery-fixes-20261010-OX7lbU/`.

The finished-status follow-up reproduced the normal-restart and interrupted-
receipt defects before correction (two failing mocked tests). Both then passed,
and all 48 discovery tests passed, including the prior 46. The new sequences
check explicit unresolved status, ineligibility, bounded rechecks, budget failure,
later finished/replay-available recovery, immutable intents, retained receipts,
and sticky identity blocks. Syntax, scoped whitespace and resident-input
`npm run check` passed. The runtime build and authentication/retrieval code remain
unchanged; the prior 41-test validation was reused. No live qualification occurred.
Separate before/after receipts:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/discovery-finished-status-20261010-yYJ11G/`.

## Historical disclosures and paused work

Preserve the prior Git-blob hydration at
.git/objects/82/33017b99ca850635f943d51cb8deec362431aa, and the observed residency
change of pack-cf828b5a16e0174af147af2403981bc63a8bfd13.pack whose cause remains
unestablished. The discovery qualification's 15-byte setup-error pending artifact
is retained, not cleaned up. These historical tasks are not relabelled as fully
no-hydration compliant.

Arrival hold remains parked; tactical/two-scout implementation, M2h and unrelated
storage diagnostics remain paused. Full npm test includes paused qualification
and is excluded. The subsequent bounded live discovery retained 57 inactive
intents with two agreeing available-history sweeps; see the
[consolidation checkpoint](replay-progress-2026-10-11.md) and its exact receipt.
That separate demonstration does not qualify lossless catch-up, authentication
renewal, automatic collection or managed-v2 admission.
