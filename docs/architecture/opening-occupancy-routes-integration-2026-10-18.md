# Opening occupancy-aware routing — inactive integration (2026-10-18)

Starting build: `cdf6e4eb2289e0b24f2a16df6b21b3c9029666826dfbbde1a3dc647a90d67afd`.
New inactive build: `af6918502ec81ae1f4f9ebc6f65bf0e2cbfe800ba8a925c03ce4ff7c144fb0ae`.
All config bytes are unchanged. Opening deployment, secondary objectives,
engagement control and healer closing remain off; existing escort remains on.
No activation or trial is prepared.

Subsequent [centre-support integration](opening-centre-support-test-only-2026-10-17.md#current-inactive-runtime-integration)
uses the same disabled opening switch. This document's original ordinary-centre
and test-only-centre comparisons remain historical evidence, not the current
centre movement implementation. Route requests/cache semantics are unchanged.

## One implementation, opening-only boundary

Promote the [accepted experiment](opening-occupancy-routes-test-only-2026-10-18.md)
into [opening-deployment.js](../../src/strategy/opening-deployment.js).
[runTick](../../src/loop.js) injects Arena's `CostMatrix` and `searchPath` only
into the opening controller. The former request/cache policy adapter is deleted,
not retained as an occupancy-unaware alternative. Generated transports use the
same production implementation; the storage double implements no pathfinding.

Use the documented [CostMatrix](screeps-arena-api.md#costmatrix) and
[searchPath](screeps-arena-api.md#searchpathorigin-goal-opts) contract, also
confirmed by the Arena tutorial's `tutorial-terrain/typings/game/path-finder.d.ts`.
Each paid opening query receives a new zero matrix. Mark every currently living
observed creep's cell255 (including teammates); permit only the searching
actor's origin with0. Zero retains terrain defaults;255 blocks. No vacating,
swapping, pathfinding substitute, or future reservation is inferred.
Goals remain range0, options retain maxOps1000. Observations, previous state,
route reports and matrices belonging to other requests are not mutated.

Existing complete-roster/schema, membership, current support, centre commitment,
health, threat and binding checks run before requests. Missing `CostMatrix`
rejects with `opening-matrix-unavailable`, including an otherwise reusable cache;
incomplete/malformed occupancy rejects through the existing observation/occupancy
gates. Construction/set failure uses the shared caught-search failure:
`route-result-unsupported`, one charged query, unknown reported ops, no fallback
search or retry. There is no occupancy-unaware opening search path.

For an active production cache (at most4 reports of at most40 cells), inspect
the next node only when the actor is observed at its report origin/path node.
If occupied, remove that report from a copied cache. Preserve selection,
searchedAt, membership, progress and original deadline. The shared planner then
performs its original one group refresh within4 queries. Off-path, age5 and
suffix handling remain shared; a later occupied node is considered when next.
Cached suffix reuse does not promise the rest of a route remains unoccupied.

Post-centre capture/contest receive their original `{maxOps:1000}` requests,
without matrices or blocked-step invalidation. Shared route validation, support
preflight, intersection ties, occupancy/reservations, movement priority, tactical
selection and the single movement pass are unchanged. Default-off bypasses
opening evaluation and constructs no matrix. The scout API boundary also retains
its existing maxOps5000 requests.

## Bounds and retained adverse behavior

Keep24 acquisition/4 active queries,1000 requested ops/query,40-cell paths,
cache age5, original60 elapsed ticks, four unchanged observations and spent
attempt semantics. Each paid matrix fills at most28 occupied cells plus origin;
storage allocation is the Arena matrix's own bounded implementation. No searches
beyond the existing caps, counters, arbitration, waiting allowance or centre
coordination are added. Unknown reported operations remain unknown.

Blocked caches can spend4 queries **on the terminal stall tick**: missing reports
are refreshed before the route-dependent no-displacement predicate. A generated
stationary attempt spends16,4,4,4,4 then stops at5, total32, never over a per-tick
cap. Absolute timeout61 still stops with0 new queries. This cost is preserved,
not hidden as zero or used to extend the mission.

The real-loop generated congestion keeps commands3,1,0,0,0,0,0 and termination
at7. Refresh totals now28 rather than8. Its stationary retained-healer variant
still cancels at4, with12 rather than4 queries over the window. Per-tick costs
are asserted. Supplied mock responses may remain blocked: preflight still holds
them. Matrices do not arbitrate two actors' future convergence on a free cell.
Intersection ties, incomplete searches, no displacement and centre/support loss
can still consume the attempt. Priority cancellation may follow paid route work.

No diagnostic fields or records are added. Existing queries/reportedOps/cacheHits,
rejected-query scalars, snapshot indices and travel holds retain their meanings.
Complete opening diagnostics remain below2700 JSON characters, including escaped
maximum-length IDs. No full paths/matrices are logged.

## Generated verification and limits

Before runtime edits, the new real `runTick` regression fails: fresh occupied
cache reports0 queries instead of4. After promotion it passes and verifies
blocked cell255, searching origin0, immutable observations, original start,
four-query refresh and continued owned hold for an unchanged blocked response.

328 generated checks pass,0 fail/skip. The final explicit selection includes
the two existing scout API-boundary cases affected by the import seam:

```sh
node --test --test-reporter=dot tests/unit/opening-deployment-flow.test.js tests/unit/opening-occupancy-routes.test.js tests/unit/opening-secondary-route-provider.test.js tests/unit/opening-secondary-deployment.test.js tests/unit/opening-centre-support.test.js tests/unit/opening-support-scope.test.js tests/unit/secondary-objective-selection.test.js tests/unit/secondary-objective-flow.test.js tests/unit/secondary-partial-travel.test.js tests/unit/secondary-scoped-readiness.test.js tests/unit/flag-allocation-flow.test.js
```

Tests cover all matrix cells, origin, missing constructor/incomplete occupancy,
moving blockers, suffix/off-path/expiry/partial displacement, caps, unsupported,
incomplete/overlong results, support/priority cancellation, no-displacement,
deadline/reset, unchanged current-position tactical traces and disabled bypass.
Post-centre tests reject any extra option and any matrix construction. Full-roster
and maximum-ID diagnostic checks remain. Unaffected accepted validation is reused.
Historical readers, retained payloads, replay/cache sources and PNGs are untouched.

The original conditional five-observation comparison remains supported by its
historical receipt; the promoted policy reproduces4,4,4,2,4 admitted commands and
three supplied detour steps for bow1. The other three departing positions match
the earlier baseline. Those sequences use the unchanged **test-only centre
support** candidate, not runtime centre coordination. Supplied responses and
positions are not proof of Arena route quality, displacement, capture, survival,
strategic benefit or Arena CPU. Real routing cost and useful arrival remain
unverified. No remaining integration blocker is demonstrated in generated scope.

## Exact rollback — only if separately requested

Evidence root:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-occupancy-integration-20261018-2Ub6Lt/`.

1. Compare current runtime hashes to final `report.json`; stop on unexpected
   drift. Never overwrite later work, reset Git, or repair index/PNG exceptions.
2. Restore only the exact saved `before/src/loop.js`,
   `before/src/strategy/opening-deployment.js` and
   `before/src/debug/build-id.js` to their matching repository paths.
3. Run `node tools/build-id.js check` and require the starting build above.
   Do not regenerate a substitute. Config/package and all other runtime bytes
   must remain unchanged. No switch change is necessary: this candidate is off.
4. A development rollback reverses only this task's test/docs changes and removes
   its new test-only matrix storage helper. Restore superseded test adapters only
   from their retained task-specific source/diff; do not reset unrelated work.

The receipt retains before-copies/hashes, failing-before output, intermediate
query-assertion failures, final checks and preservation findings. Existing
metadata/index exceptions are disclosed, not investigated or repaired. No Git
mutation, activation, test trial or automatic follow-up is authorized.
