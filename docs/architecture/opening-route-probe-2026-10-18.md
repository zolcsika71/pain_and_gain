# One-shot opening route probe — inactive diagnostic

Status: implemented behind `openingRouteProbeExperiment = false`. Opening also
remains off. This is request evidence collection, not an alternative route policy.
No live-cache qualification, Arena route availability or trial is established.
Original inactive build (healer-only sampling; superseded below):
`757b6875c8023e8f989e5998e471c72434b06b5be4a609390eb0e7f920cda0c6`.
Current inactive sampling/telemetry integration build:
`2ed9e822f3c5b9e5fcd7fb7e0b6778347b2291130c49cd6b204d9fc01c433aa8`.

Subsequent [inactive adoption integration](opening-route-adoption-2026-10-19.md)
adds a separate default-off gameplay authority. Probe-only behavior below remains
observational. The probe can capture private comparison inputs after eligibility
and before its same pair, but never executes the comparison or mutates gameplay.
Only the separately guarded loop commit can adopt. No replay-derived paths enter
that runtime path. There is no additional allowance or search.

## Eligibility and ownership

[`runTick`](../../src/loop.js) invokes
[`probeOpeningRoute`](../../src/debug/opening-route-probe.js) only when both its
separate diagnostic switch and opening deployment are enabled. Escort keeps its
existing value/priority. Either switch off bypasses evaluation and added work.
Incompatible configuration and inactive/terminated missions now emit a controlled
first stop, without requests or spending. This is diagnostic evaluation, not
permission to search or change mission decisions.

The seam follows departing and centre preparation/termination checks and the
existing map capture, before game-state logging and the single movement pass.
Require complete bounded observations, the production four-member binding,
eight prepared retained-centre actors, current support, matching prepared steps,
four valid fresh cache hits, zero live queries and zero live reported operations.
Missing map capture, slots, cache bindings or preparation means no probe.

Sampling is role-independent across the unchanged four bound members. An eligible
actor has a free proposed next cell shared by another bound actor. Sample the
first otherwise eligible member by its **original production birth slot** in
`membership.squads[].memberIds`, never by actor ID or diagnostic array order.
The [accepted sampler](opening-route-slot-sampler-test-only-2026-10-18.md) is now
promoted to this single production implementation; its source-rewriting adapter
is removed. There is no movement winner selection, reordering or role change.
Fixed-slot renaming preserves the sample. Changing the birth-slot allocation can
change it; earlier-slot conflicts can spend the only shot before later members.
This biased deterministic diagnostic sample is not fair/uniform arbitration.
Freeze all shared proposed cells (at most two distinct cells), current occupancy,
origin and target before requests. Reject an exclusion conflicting with origin.
No enemy identities, replay coordinates or target ranking are policy inputs.

One separately owned diagnostic allowance is spent before matrix construction or
the first call. Partial, unknown and thrown results cannot replenish it. Only a
strict observed rewind to tick1 resets it; duplicate/late/backward non1 ticks do
not. A module reload cannot reconstruct a late opening mission. Skips before
spending may qualify later, but cannot extend the existing mission bounds.

## Requests, results and accounting

Use the [Arena matrix/search contract](screeps-arena-api.md#costmatrix):

1. Fresh zero matrix; every currently living observed creep cell255; origin0.
2. Identical fresh matrix plus the frozen shared cells255; origin remains0.

Same position-only origin/goal copies, range0, `{maxOps:1000,costMatrix}`; all
other options use the same documented Arena defaults. No swaps, vacating cells,
sequential winner reservations, new pathfinder or additional terrain scan.
The `occupancy-v1` label plus emitted build pins construction semantics; the
same-tick roster and encoded exclusions reconstruct writes, not an invented
matrix hash. Matrix construction does not include future movement reservations.

Charge each request before construction/execution. A complete supported baseline
permits exactly one alternative call; an incomplete/unsupported/thrown baseline
stops after one. An alternative failure stops after two. No retry or fallback.
Live `queries`/`reportedOps` retain their original meanings; add the nested probe
counts for combined work. Eligibility requires live0, so the pair requests at
most2000 operations and two queries within the existing four-query active cap.
Ordinary four-query refreshes leave no probe budget. Matrix failures are charged
conservatively although no API call may have occurred. Known ops must be integer
0..1000; missing/unsupported values and aggregate uncertainty are `null`, not0.

The probe never supplies routes or modifies gameplay observations, route caches,
prepared moves/holds, reservations, ownership, support policy, progress, stall
counter or deadline. Only its separate spent bit changes. Counterfactual support
comparison is offline on copied steps using unchanged production support/subset
helpers, intersection ties, occupancy and recorded reservations. It cannot issue
commands. Current-tick movement, attacks and healing retain their original order.
Diagnostic CPU cost is real but is not isolated by existing late CPU samples.

## Bounded evidence

Add only `game-state.secondaryObjective.routeProbe` and its sibling
`probeEligibility`; no new record/stream.

`probeEligibility` has exactly `{status,first,later}`. `status` is `missing`
(required evidence unavailable/explicitly incomplete), `failed` (known condition
does not pass), `spent`, or `eligible`. On a stop, `first` is a controlled gate
label and `later:'unknown'`: subsequent gates were not established. It is the
first stop **this tick**, not persistent skip history. `eligible` has both other
fields null and means pre-search qualification only, even if the call then throws.

Gate order: `spent`, `configuration`, `mission`, `tick`, `map`, `work`, `cache`,
`api`, `inputs`, `membership` availability, bounded input/membership validation,
`preparation`, `binding` availability, `support`, per-member `binding`,
`no-conflict`, `origin-conflict`, `headroom`. `inputs` covers malformed or
inconsistent complete roster/membership observations. `preparation` covers missing
or inconsistent combined12-actor ownership; `binding` covers actor/slot/cache
association and fresh origin/path/proposed/admitted consistency. Gates are broad
controlled categories, not raw values, dumps or a claim about every independent
blocker. A priority cancellation already made by preparation reports `mission`
(or `spent` first), not an invented reconstruction of its cause. Existing mission
reason/action evidence supplies that separate detail. Missing operation totals
are `missing/work`, never fabricated zero. No reason is inferred from old absence.

- `version:1`, `matrix:'occupancy-v1'`, `mapTick`: the existing successfully
  emitted same-match map tick (not a map hash or replay identity).
- `actorSlot` resolves as `creeps[memberSlots[actorSlot]]`; `targetSlot` indexes
  the same tick's flags. The surrounding diagnostic retains squad/member slots,
  original start/progress, proposed/admitted steps and holds. Centre action
  records retain their existing separate movement provenance/returns.
- `origin`, `goal`, `excluded` and result `path` encode each coordinate as exactly
  four ASCII digits `xxyy` (00..99). Split concatenations every four characters.
  At most two exclusions/eight digits and40 path cells/160 digits per result.
- `range`, `maxOps`, `queries`, `reportedOps`, ordered `results`: each result has
  charged ordinal, controlled status, encoded path or null, array length or null,
  boolean `incomplete` or null, and known ops or null.

Result statuses: `complete`, `incomplete`, `ops-unknown`, `shape`, `overlong`,
`incomplete-type`, `coordinates`, `blocked`, `endpoint`, `thrown`. Validate integer
in-bounds adjacent cells, matrix blockers and exact endpoint for complete paths.
Overlong/malformed coordinates are not encoded; no raw object, exception text or
truncated path is logged. `thrown` includes matrix/accessor failures and does not
pretend the API returned a path. Cost telemetry is not collected or invented.

Reserve900 JSON characters **before any search**, including both optional-property
punctuation and eligibility telemetry. Require existing diagnostic length+900
<2700. Valid paths contribute at most320 digits. The original pair-only
`ops-unknown` envelope was713; with eligible status it is780, and with the
longest first-stop telemetry conservatively alongside a pair it is795, below900.
Overlong array lengths
have at most10 decimal digits and lose the160-character path; other invalid
statuses likewise cannot exceed this envelope. The full diagnostic remains below
the original2700 limit, including escaped128-character IDs in the snapshot.
A conservative projection test includes all optional fields (even mutually
exclusive ones),64-character controlled reason, maximum scalar widths, four
actors and both40-cell results: base1233, combined envelope795, total2027.
First-stop-only telemetry is under100 characters
and also fits when pair headroom is unavailable. Headroom failure skips without
work/spending; no limit increase, evidence truncation or extra terrain scan.
This is not a new bound on the pre-existing full roster/map/tick console payload.

When the separate adoption authority is enabled, its finite-status tuple uses
at most35 of48 reserved characters. Paired evidence plus eligibility and adoption
has conservative width830 within the unchanged900 envelope; a worst complete
projection is2062 below2700. Headroom also covers the possible adopted travel
projection before either call. The [adoption contract](opening-route-adoption-2026-10-19.md#bounded-diagnostics-and-review)
defines statuses, unchecked null counts and the distinction between returned,
committed, commanded and observed routes. Probe-only emits no adoption field.

## Future retention and review — separate operational authority required

1. Obtain exact replay identity independently and verify its **emitted** build;
   neither this diagnostic nor the expected checkpoint authenticates a replay.
2. Use only an authorized established exact resident reader/key and its existing
   residency, stable-read, lease and byte/decode limits. No enumeration, hydration,
   network retrieval or replacement-key search follows from this implementation.
3. Immediately retain exact response bytes, representation, source key/provenance
   and hashes before compact output/analysis. Preserve partial/error receipts.
4. Feed retained copies to the documented
   [`--review` entry point](replay-review-entry-point.md#one-entry-point). Declare
   `cache-v5` or `decoded-console-json` explicitly under its schema. Frame,
   decoded-input and extraction-artifact digests remain distinct; a present-byte
   pin cannot upgrade unknown historical integrity. Resume validated copies,
   never reread mutable originals to infer integrity.
5. Keep complete selected ticks/mappings and the original map response. Existing
   extraction retains nested probe/eligibility fields in raw snapshots and exact map bytes;
   map content is not projected into `observations.json`. Existing parsing can
   access the hash-validated retained map without another source read.

Resolve every slot against its own snapshot. Preserve priority/command/return and
next-position evidence separately. A complete alternative avoiding excluded cells
establishes one actor's returned route under that request, not a simultaneous
four-actor route set. Distinct support-safe first steps require unchanged offline
all-outcome support, occupancy, reservation and intersection checks. Neither
available routes nor numeric0 move returns prove displacement, capture or benefit.

Stop on missing terrain/map or intermediate mappings, ambiguous replay/build or
provenance, unavailable/unstable/oversized resident evidence, incomplete/invalid
results or exhausted bounds. Absence of a probe does not establish no alternative:
it may mean ineligibility, missing map/headroom or spent allowance. New first-stop
telemetry only explains the first observed gate, not all independent blockers.
Do not infer a skip reason from absence, add retries, extend a mission or request
another match. Historical tick3 full eligibility remains unknown: new telemetry
does not retroactively supply absent cache/map/preflight inputs.

## Generated qualification and rollback

Use explicit generated-only files, never mixed-suite name filtering:

```sh
env TMPDIR=/private/tmp node --test tests/unit/opening-route-slot-sampler.test.js tests/unit/opening-route-probe.test.js tests/unit/opening-deployment-flow.test.js tests/unit/opening-occupancy-routes.test.js tests/unit/opening-secondary-route-provider.test.js tests/unit/opening-centre-support.test.js tests/unit/opening-centre-occupancy.test.js tests/unit/secondary-objective-flow.test.js tests/unit/tick-flow.test.js tests/unit/game-state.test.js tests/unit/replay-review.test.js
node --check src/debug/opening-route-probe.js
npm run build-id:generate
npm run build-id:check
npm run check
```

These use supplied API responses/generated observations and injected retained
readers, not actual replay/cache access. They qualify paired requests, failure
accounting, one-shot/reset, disabled bypass, command equivalence, payload bounds,
exact-copy extraction/resume and historical-integrity distinctions. They do not
qualify live routes, resident access, Arena CPU or gameplay benefit.

The original explicit affected selection passed272 generated checks with0 failures/skips.
Build generation/verification, `npm run check`, new-module syntax, affected links
and task-diff whitespace also passed. Unaffected validation is reused.

Exact task before-copies and hashes are retained outside the repository under
`opening-route-probe-integration-20261018-GGdJ8w` in the evidence root. Follow its
`RESTORE.md`: stop on unexpected final-hash drift, restore only this task's
modified files, remove only its new module/test/contract, then verify the original
inactive build `3aa8a15f0e2923f8df93cbb56ba0f1f23350eb1f8cba25874b17139bd9d67782`
without regenerating a substitute. Never reset Git or overwrite unrelated work.
All existing switch values remain unchanged; the new diagnostic switch is false.

### Role-independent sampling integration and exact rollback

The ranged-only real-tick case failed before promotion (no probe); afterward the
same generated sequence samples its original earliest conflicting slot, while
live routes/cache/work/timers and movement/tactical traces are identical. The
production sampler is used directly in unit tests, not rewritten in memory.
Controlled first-stop/unknown statuses and maximum paired evidence survive
generated extraction/resume with zero resumed source reads. This is not live
cache qualification, historical eligibility or actual Arena route evidence.

The current explicit selection above passed305 generated checks,0 failures/skips.
Build generation/verification, `npm run check`, syntax, affected links/anchors
and task-diff whitespace passed. Package/config/index bytes are unchanged; the
earlier disclosed preservation exceptions were left uninvestigated/unrepaired.

Exact current-task before-copies, initial/final hashes, results and `RESTORE.md`
are in external evidence directory
`opening-route-slot-integration-20261018-Yr5k8O`. Rollback only its named changed
files after verifying final hashes; restore the deleted adapter from its saved
copy. Restore exact original build bytes and verify baseline
`757b6875c8023e8f989e5998e471c72434b06b5be4a609390eb0e7f920cda0c6`.
Stop on unexpected drift; never reset Git, alter switches or overwrite unrelated
work. No route-selection policy is promoted, and no trial is prepared.
