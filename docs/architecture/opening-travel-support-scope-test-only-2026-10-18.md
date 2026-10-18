# Opening travel support scope — test-only (2026-10-18)

Historical comparison retained below. A separately requested
[inactive shared integration](objective-travel-support-scope-integration-2026-10-18.md)
subsequently promoted the rule. The test-only selector/resolver was removed;
the generated transport now calls production directly. The original20-check
receipt remains unchanged; its redundant baseline-only case is preserved in
failing-before evidence rather than by maintaining a second policy.

Decision: **retain test-only**. The proposed/admitted distinction is demonstrated
without ID arbitration or a ranking change. This is not a runtime correction or
trial authorization. Runtime remains inactive build
`55bf14a37328b727ede0f65d51c75f558f79b51251217bb68627364895958553`;
package, switches, generated build, Git index and the centre-support candidate/
transport remain byte-identical. The rejected
[ID-only experiment](opening-travel-id-tie-test-only-2026-10-18.md) stays rejected.

## Exact order and before-change gate

Production opening planning first validates full observations, original birth
membership, actual health/capability/current support, centre commitment/threat,
identity/lifecycle and route reports/cache/first-step terrain. No such gate is
changed by this experiment.

`prepareSecondaryMovement` in `src/arena/execute.js` then checks:

1. Required step-map/member entries.
2. Present/movable actors, escort/pair ownership, each production movement plan's
   priority and each proposed step's adjacency.
3. **Full proposed map** through `secondaryStepSupport`.
4. Known bounded occupancy.
5. `selectSecondaryTravelSteps`, followed by diagnostics and the single executor
   pass. Held members keep objective ownership.

The shared subset selector's unblocked fast path assumes step3 already proved
support; it does not check support itself. Its blocked path checks support on
each admitted subset and intersects equal maximum-size safe alternatives.
Removing only step3 would therefore be unsafe for conflict-free proposals.

Before changing the adapter, retained **generated** tick4 from the closed ID
comparison was read as a common static input, not regenerated using ID choices.
Original preflight rejects `capture-step-support-unavailable`; current support
is true, full-proposal support is false. `{bow1}` and `{guardR2}` are separately
vacant/support-safe. The occupied medic destination (13,13) is held by bow1.
The feasible healer alternative described in the prior report belonged to an
earlier tick, **not this tick4**. Equal singleton maxima still intersect to empty.
This proves prevented examination of admissible subsets, not that this scope
change fixes the original convergence stall.

The bounded [retained generated input](../../tests/fixtures/opening-support-scope-retained-input.js)
records its source path/SHA, positions and proposed cells. No replay/cache read,
historical payload reader or new evidence discovery is used. A second generated
conflict-free case reproduces cancellation solely from the gate scope; its
healer-only regression fails before and passes after the test adapter change.

## Isolated alternative

- Single promoted [production implementation](../../src/strategy/supported-contest.js)
  (the former adapter is archived in the integration's exact before-copies).
- [Test-local routing/transport](../../tests/fixtures/opening-support-scope-world.js).
- [Generated checks](../../tests/unit/opening-support-scope.test.js).

The scoped resolver substitutes only the two support/selection imports used by
real executor preflight. Runtime source is not rewritten or edited. All other
preflight code and production selector/coordinator/executor/tactics run unchanged.
The centre candidate imports the canonical helpers and is not redirected.
Test-mode selection is configuration for the comparison, not arbitration history.

For the existing four-member opening shape:

1. Require support in **current all-stay positions** before selection. Lost
   current support cancels immediately: every possible admitted success/failure
   combination includes all-stay, so no subset can safely repair that input.
2. Accept the complete proposed map only if occupancy/conflict **and support**
   pass. An unsafe conflict-free full map must not use the old fast path.
3. Otherwise examine the14 nonempty proper subsets, with current empty and full
   already checked: at most16 unique subsets/support checks in total, not16 plus
   an extra search. Every candidate subset uses production `secondaryStepSupport`
   for all independent mover/healer success/failure combinations.
4. Keep **maximum move count and intersection of equal maxima**, exactly as
   before. No actor IDs, new weights or priority ranking choose a winner.
5. Non-admitted actors retain owned holds. Reservations/current occupancy,
   distinct cells, no swaps/vacating assumptions and one command/actor remain.

The selector still requires the unchanged complete-input/priority/adjacent-route
gates and the new explicit current-support preflight. It is not a standalone
public validator for arbitrary raw steps. An empty supported subset means no
safe progress: hold and spend the original stall allowance, not an immediate
new retry or extra waiting period. If current support is absent, cancellation
precedes subset examination instead.

Query24/4 caps,1000 ops/query,40-cell routes,five-tick cache age, original start,
deadline and four unchanged observations are untouched. Only supplied next
observations establish progress; accepted/rejected/unknown calls do not move
units or extend time. No path search, neighbour scan or persistent pacing/
arbitration state is added. Current-position attack/healing selection and actor
execution order remain production behavior.

## Generated comparisons

All generated successes use prior admitted adjacent steps into currently empty,
distinct cells. They are input observations, not simulated Arena arbitration.

| Case | Full-proposal baseline | Admitted-subset experiment |
| --- | --- | --- |
| Three weapons at range3 of their healer, all propose advancing | Cancels at1 although healer alone is safe | Healer-only step at1; then four supported steps per observation |
| Conflict-free proposals with opposing healer detour | Cancels whole group | Three weapon steps; healer holds. Full detour remains production-route-validated |
| Healer call rejected/unknown/accepted but not displaced | Already cancelled in baseline | Repeats only supported healer command; original no-displacement termination at5 |
| Weapons displace but healer fails on later four-step batch | No alternate trajectory inferred | Next observation admits healer-only correction; no time reset |
| Retained generated tick4 | Cancels before subset evaluation | Examines two safe singletons, intersection still holds everyone |
| Original seeded congestion | 3,1,0,0,0,0,0 direct secondary commands | Identical counts; no-displacement at7 |
| No safe moving subset / occupied healer detour | No guaranteed progress | Owned holds, stall termination at5; no vacating assumption |
| Already lost current support/HEAL, missing observations, invalid/incomplete route, priority conflict | Cancels | Still cancels before commands |

The positive range3 case preserves the unchanged production birth squad and
full-roster admission, rather than selecting a healthier subset or changing HP.
Its first six command counts are1,4,4,4,4,4; six ticks use the original16 initial
queries and four age5 refresh queries. A separately retained nine-observation
trace remains active without observed capture. The partial-healer trace is
1,4,1,4,4,4,4,4,4. These are not claims of historical departure, resolved healing,
Arena movement, centre acquisition or useful gameplay benefit.

Actual injury-healing and emergency ranged-retreat/attack calls match between
scopes on identical inputs. Escort cancels before objective movement. The prior
generated adjacent crossing case keeps secondary reservation (12,12) out of
centre travel; subsequent centre-healer non-displacement remains support-safe.
Fallback commands after release do not establish physical return or coordination.

## Validation and recommendation

```sh
node --test tests/unit/opening-support-scope.test.js
```

20 focused generated checks pass,0 fail/skip. The first two-check run retained
the expected failing-before regression. An intermediate harness failure loaded
the real executor statically before installing test routing; a dynamic import
after the resolver fixed the harness, not production or assertions. Failed
outputs are retained. Unaffected production/centre/closed-ID validation is reused;
no broad suite, historical reader, build regeneration or activation runs.

Retain the isolated **test-only support-scope alternative**: it enables useful
support-safe generated progress in the unique healer-only case while retaining
the original intersection tie behavior and adverse seeded stall. It is not
evidence that the deployed conservative contract is an implementation defect,
nor a recommendation to integrate automatically. Live displacement/traffic,
Arena CPU, capture, survival and strategic effects remain unverified. No further
ranking/arbitration machinery or trial is introduced.

Cause audit saved before implementation, failing/passing outputs, generated
frames, preservation hashes and limitations:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-support-scope-test-only-20261018-RUxjaj/report.json`.
