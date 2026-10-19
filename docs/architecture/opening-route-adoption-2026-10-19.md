# One-shot alternative opening route adoption — inactive

Starting inactive build:
`2ed9e822f3c5b9e5fcd7fb7e0b6778347b2291130c49cd6b204d9fc01c433aa8`.
New inactive build:
`d00712d461341148589047dc25de277284cb03dda23ed22b590a2d32669ae3ae`.

`openingRouteAdoptionExperiment = false` is separate gameplay authority.
Opening deployment and the probe remain false; every existing switch retains
its value, including escort true. No trial or activation is prepared.
Generated qualification establishes decisions and lifecycle behavior, not actual
Arena routing, coordination, sustained progress, capture, CPU or strategic benefit.

The [retained substitution comparison](opening-route-substitution-test-only-2026-10-18.md)
remains test-only evidence, not this implementation or a live route supplier.
Its observed 1→3 local admission and conditional generated progress motivated
the separately agreed contract. Its tick-13 missing compliant supplied response
does not establish that Arena lacked a route. No replay/retained payload was
read for this integration. All new search responses and trajectories are generated.

## Closed functional observation (2026-10-19)

Replay `6ad5ed39abefcb5cfcc92bb6`, opponent 宰 v24, independently emitted trial
build `fc183fe1d0ad04040e822c38da78268894995b6cf65fdbbefa201460e3ba7633`.
One retained `/log/67` response covers ticks 1–66; the mission review stops at
23: termination at 18 plus five observations. The exact inactive build above
was restored before review; all three trial switches remain off.

At tick 2, eligibility passed with live queries0/cacheHits4. The single pair
returned two complete 37-cell routes with known79/91 operations. The emitted
adoption tuple `[1,1,1,2]` satisfies `2 > max(1,1)`. The sampled healer's
alternative first step was commanded, returned0, and displaced next observation.
All13 departing and62 centre direct-step calls in the episode reached their
requested cells. Observed functioning support and admitted move/stay checks held
while owned; no occupied or cross-group duplicate destination was admitted.

This is local functional evidence, not sustained progress: renewed convergence
led to `no-displacement` at18. Both groups released that tick, stayed finished
through23, and no flag capture occurred. Ordinary fallback does not promise
continued group support or physical return. Priority cancellation and combat/
healing under pressure were unexercised. Full cache timestamps and the original
pre-adoption centre map were not serialized, so exact cache-age and bytewise
before/after centre equality remain independently unauditable from this log.
Late ordinary CPU samples ranged3.94–22.27ms (recorded100ms limit); tick2 was
22.27ms. They do not isolate probe/adoption overhead or establish a full-tick
cost guarantee. No comparative gameplay benefit or automatic promotion follows.

Durable receipt (external, not a Git payload):
`opening-route-adoption-functional-trial-20261019-dcBaIi/completion-review.json`
under `/Users/zoltanka/.local/share/pain-and-gain-evidence/`.

## Authority, eligibility and one shared pair

[`runTick`](../../src/loop.js) evaluates adoption only inside the existing
opening-plus-probe path and only when the new authority switch is true. Missing
dependencies perform no adoption evaluation. The opening controller's supported
configuration and escort precedence are unchanged. No post-centre behavior changes.
Probe-only mode remains observational and command/state-equivalent to probe-off.
Disabled adoption creates no comparison snapshot, validates no alternative and
adds no adoption field. Module imports do not run the policy.

Reuse every [probe eligibility and sampling gate](opening-route-probe-2026-10-18.md#eligibility-and-ownership):
active fully prepared mission, complete bounded observation/map/bindings, four
fresh cache hits, live queries/operations zero, valid support/priorities and
headroom. Select the first otherwise-eligible conflicting bound member by original
production birth slot. Fixed-slot renaming is invariant; birth-slot changes can
change the sample. This bias is not actor arbitration or fairness. No second
member is tried if the first pair or comparison fails.

The probe's optional callback captures private comparison inputs after ordinary
eligibility, before the one-shot allowance is spent and before matrix construction.
It cannot search or commit. Before searching, reserve the worst final travel
projection plus the existing 900-character envelope; insufficient headroom skips
without spending. The same allowance is spent before construction; each call is
charged before execution. Failures/unknown results cannot retry. Strict match
rewind to tick 1 alone resets it; duplicate/late ticks cannot replenish it.

Reuse exactly the existing two requests: occupancy-only, then occupancy plus all
frozen shared next cells; same copied origin/goal, range zero, maxOps 1,000 and
defaults. Preserve origin 0, other living occupied cells 255, exclusions and
existing route validation. No future teammate vacating or reservation is encoded
in these requests. Future reservations are checked at admission, not invented
as API matrix provenance. A failed/unsupported first result prevents the second.
At most two diagnostic searches/2,000 requested operations fit the combined four
active queries; ordinary refreshes with four queries cannot probe. No new pair,
cache eviction trigger, convergence budget, framework, ranking or retry is added.

## Isolated comparison and atomic commit

[`captureOpeningRouteAdoption`](../../src/strategy/opening-route-adoption.js)
freezes the complete roster/order/observations, membership, pinned mission state,
prepared proposals/moves, priority context and reservations before either call.
It retains the already-prepared eight-actor centre map, including null owned holds.
The comparison consumes only that synchronous live pair's bounded results; there
is no replay/file/console input into runtime adoption.

| Branch | Sampled actor report | Other reports | Centre batch |
| --- | --- | --- | --- |
| L | Existing validated live cache | Existing reports | Already prepared |
| B | Fresh occupancy-only result | Unchanged | Identical frozen batch |
| A | Fresh exclusion result | Unchanged | Identical frozen batch |

Both results must be complete, bounded and have known integer operations 0..1,000.
Check pair actor/flag/map/origin/goal/exclusions/options/ordinals and accounting.
Use production `selectOpeningObjective` for B/A full schema, route, threat,
support, arrival, utility and pinned-target validation. It receives the already
observation-updated current-tick selection; its state must remain identical.
Do not rerun `planOpeningDeployment`/the route coordinator, trigger searches,
restart ranking or increment observed progress a second time.

Each branch then uses production `prepareSecondaryMovement` and the unchanged
subset/intersection helper. Validate the sampled first step as known plain
terrain (at most one lookup per branch). Current support, occupancy, all move/stay
outcomes, priorities, exclusive destinations and owned holds remain mandatory.
Use the same frozen external reservations and prepared centre destinations to
fence L, B and A. A conflicting admitted batch is rejected, not reranked. Never
regenerate centre neighbours to rescue an alternative. Consequently a detour
requiring different centre decisions can be rejected by this minimal policy.

Count actual non-null departing moves, **not** maximum-subset `bestSize`:

```text
adopt iff B and A are valid, both pass the reservation fence,
         and nA > max(nL, nB)
```

Only two additional four-member validations/selections are permitted, each
checking at most 16 subsets. No extra centre-neighbour search or path query is
performed. Snapshot/fence/comparison work is bounded extra CPU, not free work
or an Arena CPU measurement. Existing per-invocation proof bounds are retained.

Final joint validation reuses both completed ownership/support proofs only if
their frozen inputs, roster references/order, terrain function, proposals and
priority context are unchanged. B/A themselves passed real departing preflight.
Centre commands remain exactly the original prepared batch. The final combined
destination fence protects cross-group conflicts and reservations under partial
execution, without swaps or assumed successes.

Any changed binding/support/priority input invalidates the proof: cancel through
the existing mission cancellation and discard **both groups'** entire prepared
map/ownership before ordinary priority execution. The controlled reason
`route-adoption-input-changed` does not claim which independent predicate failed.
There is no diagnostic rerun of emergency/centre neighbours merely to classify it.
Normal candidate rejection leaves L's cache, state, moves and diagnostics intact.

Commit A's sampled report, departing map/diagnostics and unchanged centre batch
as one result before state persistence, snapshot logging and the single movement
pass. No comparison issues commands. The committed cancellation closure is
rebased onto A's cache, not L's stale pre-adoption state. Capture/termination
release both groups normally on the terminal tick. Attack/healing decisions use
observed positions and the original action order; at most one movement command
per actor remains. No stronger support guarantee applies after priority release.

## Cache and lifecycle

Only the sampled report changes: bound actor/flag, copied current search origin,
validated A path, incomplete false, its actual known ops and
`tick = searchedAt = actual alternative-search tick`. No ingestion/review time
is used. Other reports and ages remain unchanged. B is never persisted.
Selection, start, positions, unchanged count, target and deadline are not reset.

Keep normal observed-node suffix validation, age-five expiry, off-path handling,
occupied-step refresh, 24/4 query caps, maxOps 1,000, 40-cell routes, 60-tick
lifetime and four unchanged observations. A peer's expiry can cause the existing
whole-group refresh next tick and replace the adopted route. Do not pin it,
re-adopt it, rejuvenate peers or grant extra waiting. Cached reuse is not a new
search or a promise that later route cells remain free.

Rejected/unknown movement returns and accepted calls without displacement do
not establish progress. Only subsequent supplied/observed positions do. Partial
movement can still stall, need normal refresh, lose support or terminate. The
one-shot pair remains spent after all comparison outcomes.

## Bounded diagnostics and review

Only the existing opening snapshot gains `routeAdoption: [status,nL,nB,nA]`.
Counts are 0..4 or null when unchecked; there is no separate log stream.

| Status | Meaning |
| --- | --- |
| 0 | Unchecked: ordinary probe eligibility/headroom/spent gate stopped before a comparison result |
| 1 | A committed; not a command acceptance, displacement or capture |
| 2 | Pair/result/binding/required-operation evidence invalid or incomplete |
| 3 | B route/terrain validation rejected; later A count remains null |
| 4 | A route/terrain validation rejected |
| 5 | A comparator's admitted destinations conflict with frozen reservations/centre batch |
| 6 | No strict improvement over both L and B |
| 7 | Frozen input/priority/support proof invalidated; both groups released |
| 8 | The private comparison closure was already consumed; no new validation/search |
| 9 | Final diagnostic projection cannot fit its pre-reserved bound; no adoption |

The existing `probeEligibility` remains pre-search qualification only. Its
`later:'unknown'` still means unchecked. `routeProbe` records returned paths;
only status 1 authorizes their one selected cache insertion. Existing `queries`,
`reportedOps`, `cacheHits` describe ordinary L coordinator work before the probe;
add nested paired work for the combined search total. A's utility fields and
departing travel projection describe the committed branch. Other counters and
observed progress retain their original meanings.

Measured generated maxima: adoption field 35 characters (limit 48), conservative
pair/eligibility/adoption envelope 830 (reservation 900), full projected diagnostic
2,062 (limit strictly below 2,700), conservative base projection 1,233. Tests
include mutually exclusive optional fields, maximum scalar widths and two 40-cell
encoded paths; no truncation or raised limits. Pre-search headroom covers a future
full adopted travel projection, not merely current short null holds. This is not
a new bound on the pre-existing full roster/map console payload.

Resolve `creeps[memberSlots[routeProbe.actorSlot]]` and target/squad slots against
the same tick; birth-slot sampling order is separate from diagnostic member order.
Centre action reasons remain `opening-centre-step/hold`; departing reasons remain
`capture-route-step/hold`. Return codes and next positions remain separate evidence.

Future authorized review must independently verify replay/emitted build, retain
exact response bytes/representation/provenance/hashes immediately, and use
[`--review`](replay-review-entry-point.md) on retained copies. Frame, decoded-input
and artifact hashes stay distinct; unknown historical integrity is not upgraded.
Generated extraction/resume retains accepted and null-count tuples, nested probe
evidence, mappings and intermediate observations without source rereads. No live
cache, replay discovery or trial is qualified or authorized by this integration.

## Generated verification and remaining limits

The before-edit real `runTick` regression records two departing moves rather than
the requested four. After integration it records L/B/A counts 2/2/4 and four
support-safe admitted steps. No historical geometry is used in these new fixtures.
425 explicit affected generated checks pass, zero fail/skip, including unchanged
opening/centre, route/cache, post-centre travel and extraction boundaries.

Focused selections (no name filters or historical entry points):

```sh
node --test tests/unit/opening-route-adoption-flow.test.js tests/unit/opening-route-adoption.test.js
node --test tests/unit/opening-deployment-flow.test.js tests/unit/opening-route-probe.test.js tests/unit/opening-route-slot-sampler.test.js tests/unit/opening-centre-support.test.js tests/unit/opening-centre-occupancy.test.js tests/unit/opening-occupancy-routes.test.js tests/unit/opening-secondary-route-provider.test.js tests/unit/secondary-objective-selection.test.js tests/unit/secondary-objective-flow.test.js tests/unit/secondary-partial-travel.test.js tests/unit/secondary-scoped-readiness.test.js tests/unit/game-state.test.js tests/unit/replay-review.test.js
```

The combined command and full output are retained externally with source pins,
before-copies and generated continuations under
`opening-route-adoption-integration-20261019-hR1hrK`.
Build generation/check, `npm run check`, separate new-module/probe/test syntax,
links and whitespace checks are required; package configuration is unchanged.

The generated non-displacing case terminates at 5; sampled-only partial progress
terminates at 9. Favorable supplied departing movement reaches a generated flag
cell, but no ownership effect is supplied in that continuation: the unchanged
selector ends objective-unavailable at 21. This is a missing generated effect
input, not evidence that Arena cannot capture or find a route. A separate supplied
ownership observation verifies terminal release, not historical arrival/capture.
Five post-termination observations retain spent state and ordinary fallback;
fallback commands do not establish physical return. Centre displacement in these
three sequences is supplied as stationary; no sustained whole-army advance is claimed.

Checks retain no-improvement, baseline-superiority, malformed/unknown/incomplete/
throwing results, charged matrix failures, frozen centre conflicts, unavailable
terrain, suffix/peer expiry/off-path refresh, priority/support cancellation,
duplicate ticks and genuine reset. Current tactics and one-command bounds remain.
Congestion, stationary-healer, priority-handoff and later route uncertainty remain.
All runtime-cpu values in these injected real-tick tests are synthetic, not Arena
CPU or isolated overhead. Generated checks alone do not verify actual useful
execution; the separate closed observation above establishes only its recorded
local execution. Sustained progress/capture remain unverified. Stop inactive.

## Exact rollback — separately authorized only

Evidence/backup root:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-route-adoption-integration-20261019-hR1hrK`.

Before a later rollback, compare the current candidate's files with the receipt's
after hashes. Stop and preserve unexpected drift; do not overwrite unrelated work.
For an exact runtime rollback, restore **only** these saved files from `before/`:
`src/config.js`, `src/loop.js`, `src/debug/opening-route-probe.js`, and
`src/debug/build-id.js`. Move the newly introduced
`src/strategy/opening-route-adoption.js` outside `src/` to a new no-clobber receipt
path, retaining it rather than deleting it. Do not restore `.git/index`, package,
PNG metadata, any unrelated file, or a whole source directory. Verify with
`node tools/build-id.js check`: exact baseline
`2ed9e822f3c5b9e5fcd7fb7e0b6778347b2291130c49cd6b204d9fc01c433aa8`.
No regeneration, Git reset, activation or match is part of that rollback.
Retain candidate tests/docs as findings; new candidate-specific tests require the
candidate module and are not a claim that they run after its runtime removal.
