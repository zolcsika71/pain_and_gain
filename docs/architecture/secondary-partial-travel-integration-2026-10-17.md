# Shared safe-subset travel — inactive integration (2026-10-17)

Historical integration record below. Its full-proposal prerequisite is superseded
by the [2026-10-18 support-scope promotion](objective-travel-support-scope-integration-2026-10-18.md):
current support still cancels when lost; prospective support is validated on
admitted subsets, with intersection ties unchanged. Earlier receipts and live
limitations are not relabelled as results of that later change.

Build: `275a7eaafd5de6fa2acfd8f7734aa9d6d1946863164cf6c058153d388e21ff77`.
Starting build: `0bec72b13084579ea07b3e2d3d15b260f8c141a3d5e06317db4253528cbb391f`.
Both experiments remain disabled; all other switches and policies are unchanged.

## One shared selector and unchanged gates

Promote the [accepted test-only rule](secondary-partial-travel-test-only-2026-10-17.md)
to `selectSecondaryTravelSteps` in `src/strategy/supported-contest.js`. The single
call in `prepareSecondaryMovement` serves capture and contest, after their
unchanged priority, adjacent-step, full original support and occupancy-known
gates. Remove the test-only wrapper and run its cases against production.
No caller in the tick loop, assignment state or tactical selector changes.

With four distinct members/four original step entries, an occupied/converging
full move triggers at most15 additional subsets, including all-stationary:
**16 examined total**, including the already checked full set. Each admitted
cell is its original validated adjacent cell, currently empty and distinct
from other admitted cells. Reuse `secondaryStepSupport`: each weapon has one
functioning healer covering all four current/next position combinations within3.
Every admitted success/failure combination is thus included. Never salvage a
full-support cancellation, assume a vacating cell/swap, search another route,
reserve a tile or add arbitration state.

Prefer maximum admitted count; equal maxima admit only their common moves.
This intersection is an already examined safe subset. It is invariant to ID,
input order and reflection, but may hold competing actors despite safe singleton
choices. Non-admitted members remain in the executor's objective map with null
steps: they cannot fall through to ordinary approach/fallback movement and
invalidate checked stationary positions. Whole-group priority cancellation
still happens before any objective command. Smaller blocked groups retain the
old whole-group hold; unblocked movement is unchanged.

Shared24 acquisition/4 refresh queries,1000 maxOps/query,40-cell routes,
five-tick freshness, original60-tick deadline, four stalled observations and
spent attempt are untouched. Only supplied subsequent observed positions can
rebase route suffixes/reset existing progress. Capture uses unchanged-position
progress; contest uses its existing best maximum weapon-distance progress.
Command returns never count as displacement. Existing reservations and at-most
one movement command per actor are unchanged. Attacks/healing keep their
selectors/order and current-position semantics.

## Existing snapshot extension

After successful active preflight, `game-state.secondaryObjective.travel` has
only `{examined,bestSize,tied,actors}`. `examined` is16 on a four-member blocked
subset evaluation, otherwise0 (no additional subset evaluation). `bestSize` and
`tied` describe the evaluated maximum alternatives, **not** the eventual common
move count; they are0 when no subset search occurs.

At most four actor entries contain fixed fields:

`{actorId, proposed:{x,y}|null, admitted:{x,y}|null, holdReason}`.

- Admitted step: `holdReason:null`.
- No original next step: `no-step`.
- Original cell currently occupied: `occupied` (takes precedence over collision).
- Original cell shared by proposed steps: `converging`.
- Otherwise held under the unchanged smaller-group policy: `group-hold`.

Coordinates are copied scalars, not path arrays/raw route objects. A proposed
cell is not a command; an admitted cell is not a return or displacement.
Cancellation/terminal/disabled ticks omit this extension. The existing action
decision/attempt records still report actual commands and returns. No new log
record, logging stream, query or persistent diagnostic cache is added.

Generated maximum-ID checks bound this extension below1200 JSON characters,
the original diagnostic excluding it below1500, and combined below2700. The
prior1500 bound is not relaxed for route failures or non-travel content.

## Evidence and remaining limits

Three real `runTick` regressions fail before promotion: occupied capture and
contest issue0 instead of3 direct commands; capture convergence issues0 instead
of the two independent common moves. All three pass after promotion.
Final117 generated checks pass:64 real flow,26 promoted subset checks and27
scoped-readiness checks. They include all-success/partial/non-displacement,
owned holds, symmetric contention, no-safe-subset holds, support/priority loss,
refresh caps, timeout/spent state, handoff, deterministic invariance, unchanged
attacks/healing and disabled commands with no added searches/fields.

Existing whole-hold expectations were updated only where this deliberate policy
changes the result. True fully occupied/wholly converging cases retain explicit
holds and original stall assertions. One initially relocated contest fixture
formed different birth membership; placing blockers after original membership
bound corrected the scenario, not runtime. Diagnostic tests explicitly include
the existing `membership-change` record as well as baseline records. Intermediate
failures are retained. No historical-fixture reader or replay read runs.

Generated trajectories are observations supplied by tests, not Arena arbitration,
damage, coordination or capture evidence. Partial progress can later cancel when
further healer travel would lose a blocked weapon's support. Tied contenders may
never move; other actors/enemies can still contend or change exposure. Actual
Arena CPU/logging cost is unmeasured. The historical missing route steps remain
missing; no useful departure/capture in that match is inferred.

No implementation blocker remains in this generated scope. This is an inactive
candidate, not an activation/trial authorization or strategic promotion.

## Completed functional observation (2026-10-17)

One separately authorized manual trial verified emitted enabled build
`db3db4eaa8393338883ccce189fd4f7a2ae302c5ef24911cc5f93c189e4fecd6`
in replay `6ad2c653abefcbf4f4c8f69f`, against stachu3478 v8. The exact inactive
config/build before-copies were restored and verified before review; both
experiments remain disabled at the build recorded above.

The bounded opening review covers ticks1–100, not the full157-tick match.
Centre ownership first appears at40. Seven subsequent acquisition polls return
`no-eligible-squad`, with zero route queries and no assignments. Relevant
departing/retained-defence injuries or capability failures prevent admission;
tick40 also has armed enemies near centre. This does not demonstrate an
unrelated-injury-only admission, safe-subset execution, displacement, handoff,
termination of an assigned attempt or capture. Ordinary centre capture/movement
is not secondary-objective travel. The native terminal result is defeat, not
causal evidence against an unexercised travel branch.

The99 ordinary-tick CPU samples average3.107ms and peak7.062ms. These are elapsed
wall time through the late sampler, excluding its emission/closure and later
work; they are neither full-match CPU nor incremental policy-cost measurements.
No demonstrated defect warrants correction or promotion. Keep disabled; no
additional match or tuning follows automatically. Generated validation above
remains distinct from this insufficient live coverage.

Retained observations, identity/source provenance, exact restoration and the
unresolved index-byte preservation exception are in the external trial receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-safe-subset-functional-trial-20261017-KbT2IE/report.json`.
Raw logs, images, local evidence and databases are not publication payloads.

## Exact rollback (only if separately requested)

Evidence root:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-partial-travel-integration-20261017-Aw6WKI/`.

1. Check current runtime/config/index for unexpected drift against the receipt;
   stop rather than overwrite overlapping work. Do not reset/refresh Git.
2. Restore only these original runtime before-copies byte-for-byte with focused
   file edits: `src_arena_execute.js.before` → `src/arena/execute.js`,
   `src_strategy_supported-contest.js.before` → `src/strategy/supported-contest.js`,
   `src_debug_build-id.js.before` → `src/debug/build-id.js`.
3. Verify all source hashes against `before.json`, config unchanged and both
   experiments false; `build-id:check` must return the starting inactive build.
   Do not regenerate a different baseline or undo scoped readiness/retreat.
4. A complete development rollback also restores this task's affected tests/docs
   from its before-copies, including the removed test-only fixture; preserve all
   pre-existing unrelated edits. Remove only this task's new integration document
   if that complete rollback is requested. Do not perform a broad checkout/reset.

Before-copies, initial failures, passing checks, source/hash preservation,
build generation/check, `npm run check`, whitespace and reviewed diff are retained
in `report.json` in that evidence root. Existing index/PNG exceptions are not
repaired. No matches, activation, hydration or Git mutations occur here.
