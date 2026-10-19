# Opening convergence: objective-progress tie refinement

Status: **test-only; not recommended for runtime integration**. Production
intersection ties remain authoritative. Inactive build is unchanged:
`3aa8a15f0e2923f8df93cbb56ba0f1f23350eb1f8cba25874b17139bd9d67782`.
Opening deployment and every other experiment retain their existing values.

## Retained stall, not an engine collision

Replay `6ad4cea2abefcba2cbc91e68`, Golden Eagle. Only retained extracted
observations and derived review artifacts were read; no original response,
metadata body, cache, terrain payload or new replay was accessed.

At each of ticks20–23, the same-tick member slots resolve these proposals:

| Actor suffix (`pg_player2_`) | Observed position | Proposed cell | Recorded hold |
| --- | --- | --- | --- |
| healer_3 | 89,76 | 90,75 | converging |
| ranged_3 | 88,74 | 88,73 | converging |
| ranged_4 | 91,76 | 90,75 | converging |
| ranged_5 | 89,74 | 88,73 | converging |

Both destination cells are currently empty, and neither overlaps a recorded
centre direct-step destination. Current and full-proposal *support* pass;
the full proposal fails distinct destinations. Priority cancellation did not
occur: the four actors retained capture-owned holds and issued no movement
calls. This is not rejected movement or accepted-without-displacement.

Using production `secondaryStepSupport`, exactly nine of16 subsets are safe:
empty, four singletons, and four pairs. The maximum pairs are
`{healer3,ranged3}`, `{healer3,ranged5}`, `{ranged4,ranged3}` and
`{ranged4,ranged5}`. Every independent success/failure outcome of each pair
retains support. Their intersection is empty. Production
`selectSecondaryTravelSteps` reproduces `examined16/bestSize2/tied4`, all holds.
Holding both contenders simultaneously is necessary; withholding *every*
safe move is a conservative selection limit, not a support necessity.

Observation20 is unchanged through24. The observed counter is0,1,2,3 at20–23;
the fourth unchanged observation finishes at24 before more objective commands.
The finished snapshot retains the previous counter3, not a new grace tick.
The original start1/deadline61 never changes. Centre progress cannot reset it.

## Narrow test-only comparison

[Candidate](../../tests/fixtures/objective-progress-tie-candidate.js) enumerates
at most16 supplied-step subsets. It reuses production support validation and
current occupied/distinct-cell fencing. Among maximum-cardinality safe subsets,
prefer the smallest prospective **maximum armed-member Chebyshev distance**
to the already-pinned objective, then intersect remaining equal maxima.
No actor ID, persistent state, path search, threshold or timer is added.

This ranking uses requested endpoints only; partial execution does not imply
progress. Every move/stay outcome must still be safe. It is not a preflight or
executor replacement: complete-input, route/terrain, membership, priorities and
reservations must already be established by existing callers. The prototype
does not claim runtime reservation/ownership integration qualification.

In each retained observation it refines four maxima to two containing ranged4,
so their intersection admits only its already-recorded `(90,75)` step. This
would reduce the prospective farthest weapon distance from27 to26 if it moved.
The adjacent proposal was logged by the validated production route pipeline;
its terrain legality is **not independently reconstructed** here.

No different first-step cell is established. Full paths, subsequent nodes after
a counterfactual move, independent terrain, rejected centre proposals and engine
arbitration are missing. The candidate is evaluated against each original
snapshot separately, not stitched into a fictitious historical continuation.

## Generated results and adverse outcomes

[Generated-only checks](../../tests/unit/objective-progress-tie.test.js) contain
no payload reader or historical import. The initial forwarding implementation
fails `[] !== ['rear']`; the candidate passes. Three independently supplied
observations/proposals admit rear, rear, then healer+rear with support in every
partial-success outcome. Baseline intersection holds on the same initial
generated convergence. These are distinct-cell supplied observations, not an
Arena simulator or evidence of alternative historical routing.

The two front contenders remain held in this positive example. A second exact
geometric tie still produces all holds indefinitely. There is no fairness or
whole-squad progress guarantee. Unknown/rejected/accepted calls without a new
observation cannot update positions. Existing production checks independently
retain priority cancellation, four-observation termination, original deadline,
one attempt, action compatibility and work caps; they are not new candidate
integration evidence.

```sh
node --test --test-reporter=spec tests/unit/objective-progress-tie.test.js tests/unit/secondary-partial-travel.test.js
node --check tests/fixtures/objective-progress-tie-candidate.js
node --check tests/unit/objective-progress-tie.test.js
```

36 generated checks pass (10 new,26 existing). No historical entry point or name
filter. Runtime/build/package/switches/index are preserved; no build generation
is needed. The unchanged [shared support contract](objective-travel-support-scope-integration-2026-10-18.md#one-implementation-and-validation-order)
and [centre integration](opening-centre-support-test-only-2026-10-17.md#current-inactive-runtime-integration)
continue to govern production.

Recommendation: retain only the test-only comparison; **do not integrate** it.
It establishes avoidable one-step suppression and limited generated progress,
not a complete convergence solution. Remaining equal ties/starvation and missing
counterfactual route inputs prevent stronger qualification. No historical
capture, Arena arbitration, arrival or strategic benefit is established. No
additional variant, evidence recovery or match is requested.

## Frozen-policy successive-outcome comparison

Decision: **reject production integration as a standalone convergence remedy**.
The existing candidate is unchanged, SHA-256
`e1ae60c0ed69c33253a12fa468334ad0b746bd75685cfacf6db0d4610dde8eb1`.
No new score, fairness state, ID arbitration, route correction or waiting rule
is introduced. Earlier findings above remain historical qualification of their
original checks, not superseded successes.

The [sequence harness](../../tests/fixtures/objective-progress-tie-sequences.js)
reuses the original [four-actor generated fixture](../../tests/fixtures/objective-progress-tie-world.js)
and the existing full-roster generated world. It invokes production
`selectOpeningObjective` for admission and lifecycle, `prepareSecondaryMovement`
for unchanged priority/current-support preflight, the frozen candidate versus
production subset intersection, and the real movement/tactical executors.
Six healthy weapons and two supported healers remain assigned to centre;
they are stationary supplied observations, **not** a centre-coordination trial.

Each row evaluates both selectors against the same positions, supplied proposal
table, occupancy and objective (paired shadow decisions). Separate rollouts then
receive the **same actor/tick outcome law**. Their observations can diverge only
through admitted steps whose displacement is explicitly supplied. The proposal
table is selected by observed positions, not command returns or chosen winners.
Baseline and candidate do not receive forcibly identical later positions after
different commands. Rejected/unknown/return0-without-displacement observations
remain exactly unchanged. Return0 alone never advances a position.

Supplied complete route reports validate the production lifecycle input; they
are generated first nodes plus declared diagonal suffixes, not a pathfinder or
actual Arena route/terrain evidence. No search is called (zero actual query
work); four supplied reports/tick, length<=40, reported10 ops each remain within
existing bounds. Both arms use these same report/proposal construction rules.
Cache age/refresh and occupied-route request quality are not requalified here.
All terrain is supplied plain for this comparison. Existing priority contexts
are empty; active priority-handoff adverse coverage is reused unchanged, not
claimed as new candidate integration evidence.

| Supplied outcome/scenario | Baseline | Frozen refinement |
| --- | --- | --- |
| Successful, four bounded decision ticks | 0 commands; holding | 6 commands/6 supplied steps, rear4+healer2; active at4, no arrival claim |
| Rear calls rejected (`-11`) | Stall stop5, 0 commands | Stall stop5, 4 rejected calls; safe healer alternative withheld all4 ticks |
| Rear calls unknown (`undefined`) | Stall stop5, 0 commands | Stall stop5, 4 unknown calls; same healer withholding |
| Rear return0, no supplied displacement | Stall stop5, 0 commands | Stall stop5, 4 calls; same healer withholding |
| Two rejections, one rear step, then blocked continuation | Stall stop5, 0 commands | 3 calls/1 supplied step; stall stop8, only postponing termination |
| Rear moves but healer return0 never displaces | Stall stop5, 0 commands | Rear reaches range3 support boundary; healer-only calls cannot progress; stall stop8 |
| Supplied forward/backward proposals, successful rear movement | Stall stop5, 0 commands | 60 calls/60 supplied steps, returns to its starting position; timeout61 |
| Exact geometric tie | Stall stop5, 0 commands | Stall stop5, 0 commands |

In the cycle, maximum-cardinality remains primary, so the refinement can admit
a backward rear step even though objective distance worsens. Changed *observed*
positions reset the original stall counter; no progress semantics were changed.
The original start1/deadline61 ends this behavior. This is an adverse supplied
input sequence, **not** evidence that Arena produces those routes or a new
rerouting mechanism in either rule. The positive four-tick case also continues
to withhold both front contenders; sustained whole-squad deployment is unproven.

Every admitted move/stay combination is checked with production support helpers,
including distinct cells/current occupancy; both selectors examine at most16
subsets each. Paired shadow checks and all-outcome assertions add **test-side**
work, not a second runtime movement/search pass. Real direct calls, return codes,
same-tick tactical decisions, supplied next positions and lifecycle states are
retained separately. All healthy/remote-enemy tactical decisions are no-action;
combat effectiveness is not exercised. The test harness is not the full runtime
loop and does not qualify capture release, route caches or priority integration.

```sh
node --test --test-reporter=spec tests/unit/objective-progress-tie-sequences.test.js tests/unit/objective-progress-tie.test.js
node --check tests/fixtures/objective-progress-tie-sequences.js
node --check tests/fixtures/objective-progress-tie-world.js
node --check tests/unit/objective-progress-tie-sequences.test.js
```

20 generated checks pass (10 new sequence checks plus10 original candidate
checks). The earlier26 production travel checks are reused: their source and
runtime dependencies did not change. There are no historical readers/imports;
an optional explicit `PAIN_GAIN_SEQUENCE_OUTPUT` directory retains the generated
traces via the existing durable publisher, not cache/provider access.

Conclusion: limited supported progress exists with favorable supplied movement,
but repeated safe-healer denial, exact ties and wasted cyclic movement prevent
a sustained-progress recommendation. Retain the frozen implementation and
negative results as test-only findings. No integration, further variant, trial,
historical alternative trajectory, Arena displacement or strategic benefit is
authorized or established by this comparison.
