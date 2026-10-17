# Executable joint healing — test-only (2026-10-17)

Disposition: retain as a **test-only execution benchmark; do not integrate**.
The adapter can realize the oracle's schedules with successful generated calls,
but a better initial plan can produce strictly worse accepted capacity after a
target-dependent failure. Exhaustive planning also has a material local cost.
No runtime switch, package command, build, movement policy or Arena trial changes.

Baseline `f604f41`, build
`2db3ffea0c369f5003d16f96e3714ca536aa150dc3ed9a8932490c68fef04cbd`.
All three gameplay experiments remain disabled; existing healer escort remains
enabled. This extends the [planned-only oracle](healing-joint-allocation-oracle-test-only-2026-10-17.md),
not the rejected [greedy ledger](healing-intent-ledger-test-only-2026-10-17.md).
Their historical receipts/results are not rewritten as executed plans.

## Shared model and production execution

`tests/fixtures/healing-joint-oracle.js:prepareJointHealingOracle` now prepares
one set of eligibility options, capacities, independent baseline decisions and
exposure floors. The original `jointHealingOracle` calls its initial solve; its
prior assertions and results remain. Residual solves reuse the SAME implementation
and immutable observations. Existing case builders were extracted unchanged to
`tests/fixtures/healing-joint-cases.js`; prior oracle assertions are unchanged.

`tests/fixtures/healing-joint-executable.js:runJointHealingTick` substitutes only
pure-healer decisions through the existing query-tagged production executor seam
in `healing-intent-ledger-candidate.js`. The original production executor issues
actions and reports their actual generated-stub returns in the supplied actor
order. It is not copied or replaced by a simulated executor. Movement runs first
with the original selector/ownership; hybrids retain their exact independent
healing decisions and compatible attacks. Original actors and targets go to the
actual calls. Tactical compatibility still uses the chosen healing method even
if that call returns failure, matching production. No observation HP, body part,
position or modifier is updated from a planned/accepted action.

The generated-world helper additionally accepts target/method-dependent return
functions. These append calls but do not resolve effects. No reference code was
copied and no additional licensing obligation is introduced.

## Tick-local accounting, floors and work

- Supported complete observations: at most3 pure healers,14 owned targets and
 14 enemies, with the oracle's existing exact roster/identity/capability/modifier
 guards. Invalid or duplicate observations/order reject this executable fixture
 before any commands; they are not silently repaired or truncated.
- Select the initial exposure-constrained plan immediately before the first pure
 healer, allowing earlier hybrid results to be known. Hybrids later in execution
 remain fixed prospective baseline decisions, NOT accepted credit.
- A completed actor is removed from every subsequent solve, including no-action
 actors. Only primitive numeric0 healing returns enter accepted capacity.
 Unknown/non-numeric/failed calls contribute no accepted credit, without retry.
- After a failure/unknown call, replan at the next unacted pure healer, using
 accepted earlier actions, baseline future hybrid decisions and remaining pure
 options. No successful result alone causes a new solve. At most one solve at
 each remaining-healer count; no zero-healer solve. Even a failed final actor
 cannot authorize a retry or another planning pass.
- Exposure floors are the ORIGINAL per-target, uncapped nominal baseline
 schedule; they never decrease. If a residual solve cannot meet them, retain
 remaining independent baseline decisions and record `remaining-floors-infeasible`.
 A later failed call may cause another smaller-count solve, but cannot rewrite
 the floor. Final shortfalls are recorded separately even if there is no actor
 left to replan. Baseline fallback does not claim to meet an infeasible floor.
- Equal-value feasible plans prefer more baseline-equivalent actions, then the
 oracle's canonical identity tie key. Enumeration does not sort execution.
- Prepare at most42 eligibility probes and14 baseline decisions. Bound complete
 assignment enumeration by `15^3 + 15^2 + 15 = 3615`, specifically3375,225,15.
 Each complete assignment aggregates by target before capping by deficit.
 There are no path searches, reservations, movement planning or persistent maps.
 Each invocation is one isolated tick; repeated invocations on the same tick are
 separate comparisons, not a production duplicate-tick suppression facility.

The independent reporter ledger and the executable planner's accepted aggregation
must agree. Planned totals include future calls that might fail. Accepted totals
include only earlier successful generated calls, applying functioning HEAL,
observed direct/ranged distance and the validated modifier. `resolved` stays null.
Exposure means current functioning weapon reach, NOT predicted damage or an
enemy intent. These floors do not guarantee sufficient focus under new damage.

## Generated execution findings

All15 retained oracle cases run with successful, rejected, unknown and
target-dependent returns. The independent production baseline is reproduced
twice before each comparison. The original greedy-loss case stays baseline30,
greedy26, joint30 with numeric0 stubs. Representative successful accepted totals:

| Generated case | Baseline | Joint | Constraint/trade-off |
| --- | ---: | ---: | --- |
| Two small wounds | 4 | 8 | Split allocation, unchanged actor order |
| Asymmetric reach | 10 | 14 | Flexible healer uses ranged4; constrained healer direct12 |
| Exposed small wound | 4 | 4 | Retain24 nominal on that ally, not merely its4-HP deficit |
| Full roster, exposed baseline retained | 132 | 192 | Separate target floors retained |
| Two exposed allies | 132 | 132 | Separate floors prevent the otherwise better capped split |
| One/two healing modifiers | 114/96 | 162/108 | Nominal floors remain72; modified capacity differs |

Retained adverse execution (same asymmetric observation): initial baseline10
versus joint14. Flexible healer's ranged call toB returns0, scheduling4; the later
constrained healer's direct call toA rejects. Joint accepted4, baseline accepted10.
The already-acted flexible healer cannot be retried or redirected. Reversing actual
execution order observes the failure first and permits residual flexible→A,
accepted10. This is genuine scheduling dependence, not irrelevant roster order;
the adapter never reorders actors to obtain the better result.

In the exposed small-wound case, an initial rejected call leaves only12 possible
nominal capacity against the original24 floor. Residual planning reports
infeasibility, the remaining healer keeps baselineA and accepts12. The floor
stays24 and the12 shortfall is retained. Interleaved hybrid failure is also tested:
hybrid attacks and movement remain baseline-identical while its missing healing
can make remaining floors infeasible. Earlier successful partial capacity is
carried into replanning; only an unacted healer changes target.

Focused tests cover malformed/duplicate observations, tick-local reset,
no-action/zero-healer cases, damaged HEAL, modifiers, necessary focus, ties,
mixed scheduling, direct/ranged compatibility and exact3615 bound. Irrelevant
roster/creep ordering with explicit execution order leaves commands unchanged.
Tests assert one healing call per actor; none assume HP or movement resolution.

## Verification and recommendation

Explicit generated command (no historical-fixture readers):

```sh
node --test tests/unit/healing-joint-executable.test.js tests/unit/healing-joint-oracle.test.js tests/unit/healing-intent-ledger.test.js tests/unit/tactics.test.js
```

The receipt retains full focused output, per-case planned/accepted/exposure
metrics, local `performance.now()` timings, exact source copies and preservation
checks:148 tests passed,0 failed/skipped. External receipt:
`healing-joint-executable-test-only-20261017-afE6C8/report.json` under the existing
`pain-and-gain-evidence` directory. The final full-bound solve timings were
15.223208,0.919584,0.125083ms (16.267875ms combined). Timings measure only the local solve call (not preparation, whole tick,
or Arena CPU); Node scheduling/JIT/GC and concurrent tests affect them. Neither
bounded enumeration nor local timings establish a viable Arena CPU budget.

Recommendation: retain this benchmark and reject runtime promotion on current
evidence. Do not revive greedy accounting, relax floors or reorder actors to hide
failures. The successful-stub headroom is real at the decision/accounting level,
but late rejection can reverse it and worst-case enumeration is costly. No
resolved healing, prevented damage, survival gain or competitive benefit is shown.
No trial or further implementation is automatically authorized.

Rollback: remove only the new executable adapter/test/document and undo this
task's test-helper extensions/case extraction from retained before-copies. No
runtime rollback or switch change is necessary. Prior experiments/receipts and
unrelated coordinator/storage work stay intact.
