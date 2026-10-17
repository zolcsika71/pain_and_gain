# Joint healing-allocation oracle — test-only (2026-10-17)

Disposition: **meaningful generated planning headroom exists; further test-only
allocation work is justified, not runtime integration or a trial**. The rejected
[greedy ledger](healing-intent-ledger-test-only-2026-10-17.md) remains rejected.
Neither the oracle nor a new controller is integrated into Arena source.

Later work executes these generated plans through a separate
[test-only executor adapter](healing-joint-executable-test-only-2026-10-17.md),
sharing this oracle's preparation/residual solver. This document's original
planned-only results and receipt remain historical; they are not accepted or
resolved healing observations.

Baseline `f604f41`, unchanged inactive build:
`2db3ffea0c369f5003d16f96e3714ca536aa150dc3ed9a8932490c68fef04cbd`.
Secondary objectives, healer useful closing and support-locked engagement stay
disabled; the existing healer escort retains its previous enabled value.

## Reuse and bounded inputs

- `tests/fixtures/healing-generated-world.js` extracts the existing immutable
  generated-world builder verbatim. The prior ledger test assertions and all
  case trajectories remain unchanged; the original external receipt is preserved.
- `tests/fixtures/healing-intent-ledger-candidate.js` exposes its existing pure
  capacity model and observation/pure-healer guards for reuse. Its power constants
  now come directly from a query-tagged production healing module: a Node test
  load hook appends private constant exports **in memory only**. The ordinary
  module and every runtime file remain unchanged. This avoids another power model
  or a production export added solely for tests. All prior ledger results persist.
- `tests/fixtures/healing-joint-oracle.js` delegates eligibility and action-method
  choice to `src/tactics/healing.js:selectHealingDecision`, reuses the shared
  capacity model and production `closingHealModifier`, and uses production
  `hasFunctioningPart` to identify current enemy weapons.

Require consistent complete supplied roster arrays, known identities, ownership,
positions, HP, body parts, fatigue, methods and seven scoring flags. There are at
most14 friends/14 enemies, at most50 parts per actor and at most3 living pure
healers. The full owned roster is the target inventory; supported living injuries
are eligible choices. Missing, malformed, inconsistent or oversized inputs return
an unsupported result with **zero assignments enumerated**; do not truncate,
invent a neutral modifier or choose a healthier preferred healer subset. Unknown
nonempty raw effects remain outside the existing model. An original hybrid stays
excluded even when its extra weapon parts are destroyed. Fatigue does not erase
current healing eligibility. These guards check supplied observations; they do
not prove completeness of an unseen Arena battlefield.

Each healer has one option per eligible target, plus no-action. For a specific
target probe, the unchanged production selector is called with that target alone.
For non-self probes only, a separate ranking view hides the implicit self-heal
candidate so it cannot erase another legal option. Original health/parts are never
mutated, and all action/capacity references use original observed actors/targets.
Self probes use the original healer. An unsupported selector/range observation
rejects the oracle rather than manufacturing an option.

At most `(14+1)^3 = 3375` complete assignments are evaluated **once**, updating
both unconstrained and constrained maxima in that pass. There are at most42
eligibility probes, plus at most14 independent baseline selections. No path
search, command, movement arbitration, damage resolution or persistent state is
added. The oracle is an offline upper bound, not a claim that3375 evaluations fit
Arena's CPU allowance. Node suite timings are not Arena CPU measurements.

## Objective, baseline and exposure floors

For each plan, sum capacities **by target**, then calculate:

`sum_target min(observedDeficit, sum_plannedModifiedCapacity)`.

Capacity uses functioning HEAL, current observed range and the validated owned
healing modifier. Nominal pre-modifier power is12 per HEAL at range0–1 and4 at
range2–3. The existing independent production selector supplies the baseline;
its original nominal ranking is not replaced with another heuristic. Non-pure
healer decisions, including hybrids, remain fixed in every joint assignment and
contribute their unchanged known planned capacities.

An ally is potentially exposed when a living enemy has functioning ATTACK within
Chebyshev1 or RANGED_ATTACK within3. Inclusive current reach counts even when the
enemy is fatigued or immobile. Dead enemies and destroyed weapons do not count;
range2 melee or range4 ranged foes are not projected into future attack reach.
This is **potential exposure, not predicted damage or an enemy attack intent**.

For **each exposed ally separately**, the constrained plan must retain at least
its full baseline **nominal planned schedule before return codes and modifiers**.
Do not cap that floor by its current wound or pool floors across allies. Example:
an exposed4-HP wound receiving24 nominal baseline allocation still requires24,
not4. Known modifiers are uniform for owned healing in this model; preserving
nominal capacity also preserves the corresponding modified planned amount.
Healthy exposed allies have floor0; this does not anticipate new wounds.

The unchanged baseline is always a feasible enumerated witness. A missing witness
or constrained optimum below baseline is an oracle error, never grounds to relax
the floor. Equal-value witnesses prefer fewer changes from baseline, then canonical
actor/target IDs. Canonical enumeration/tie keys do **not** reorder execution:
returned actions remain in the supplied actual actor order. Irrelevant target,
roster and enemy ordering is checked with execution order supplied independently.

## Planned, accepted and resolved quantities

The oracle never calls `heal`, `rangedHeal`, attacks or movement. Its `accepted`
and `resolved` fields remain `null`. A witness is not an issued command or a
guaranteed successful schedule.

The comparison runs the unchanged baseline and rejected greedy adapter through
the real production executor on generated stubs. In the main table those stubs
return numeric0, so their planned and accepted-stub capacities coincide. These
are not Arena observations. Separate failed/unknown-return tests show accepted
baseline/greedy totals0 while baseline planned total4 and oracle planned total8
remain. No oracle call is executed to produce an accepted total. Nothing resolves
HP, repaired parts, incoming damage or next-observation positions.

## Retained generated results

All table totals are target-capped **planned modified capacity**, in HP units for
this one observation. They are not healing effects or live improvements.

| Case | Baseline | Rejected greedy | Unconstrained maximum | Exposure-constrained maximum |
| --- | ---: | ---: | ---: | ---: |
| Duplicate small wounds |4 |8 |8 |8 |
| Necessary multi-healer focus |24 |24 |24 |24 |
| Direct/ranged access |12 |16 |16 |16 |
| Asymmetric reach, original actor order |10 |10 |14 |14 |
| Retained greedy counterexample |30 |26 |30 |30 |
| Exposed small wound, baseline nominal24 |4 |8 |8 |4 |
| Exposed asymmetric target |10 |10 |14 |10 |
|14-unit, six-HEAL roster; A exposed |132 |192 |192 |192 |
| Same roster; A and B exposed |132 |192 |192 |132 |
| A exposed, one owned heal flag |114 |162 |162 |162 |
| A exposed, two owned heal flags |96 |108 |108 |108 |
| Damaged HEAL and actual generated self-injury |24 |24 |24 |24 |
| Earlier modifier case, zero heal flags owned |12 |14 |14 |14 |
| Earlier modifier case, one/two owned |12 |12 |12 |12 |

The30→26 greedy loss is reproduced without changing actor order. Joint planning
retains the existing30 solution; there is no headroom above baseline in that case.
Repeating it with A exposed preserves its full24 nominal allocation as well.

### Headroom surviving an exposed-allocation floor

The14-unit generated roster has3 pure healers with6 functioning HEAL each,
4 melee,5 ranged and2 scouts, with preset body counts. H1(10,10) can directly
heal A(10,11), deficit144; H2(15,10) and H3(16,10) can directly heal B(15,11)
and C(16,11), each deficit60. Remaining healthy actors are explicitly placed away
from these healing opportunities. Enemy functioning melee at(9,11) exposes A
and healthy H1; no enemy action or damage is resolved.

Baseline: H1→A72, H2→B72, H3→B72 gives72+60=132 capped capacity.
Joint: H1→A72, H2/H3 cover B and C, giving72+60+60=192. A retains its full72
nominal floor. The+60 headroom is real **within this static generated model**,
not a measured frequency or gameplay benefit. The rejected greedy adapter also
finds192 here, but lacks the oracle's general optimality/floor checks.

Adding another current melee threat at(14,11) exposes B too. Its baseline floor
is144 nominal, even though its wound is60. Both H2/H3 must retain B's allocation;
the constrained maximum falls to baseline132, while the unconstrained maximum
stays192. This verifies per-ally floors, not merely a pooled exposure budget.

Neither floor proves sufficient healing against attacks. Moving enemies, future
wounds, healer support/movement, action failures and simultaneous resolution remain
outside this objective. Preserving baseline allocation does not prove baseline
allocation itself safe or strategically good.

## Verification and recommendation

Focused command, Node24.19.0:

```sh
node --test tests/unit/healing-joint-oracle.test.js \
  tests/unit/healing-intent-ledger.test.js tests/unit/tactics.test.js
```

**71 pass,0 fail,0 skip**:30 new oracle checks,33 unchanged ledger assertions and8
existing generated tactical checks. Coverage includes asymmetric reach, necessary
focus, damaged HEAL/self-injury, modifiers, fixed hybrids and destroyed extra
weapons, healer fatigue, method/attack compatibility, malformed/unknown inputs,
ties, input-order invariance, actual-order preservation and exact3375 enumeration.
The whole original ledger assertion tail is retained byte-for-byte after its
builder extraction. No historical-fixture reader or full suite is invoked.

Recommend **further test-only development**, specifically evaluating a bounded
non-greedy allocator against this oracle on independent generated layouts while
preserving each exposed baseline allocation and all movement/hybrid boundaries.
The retained+60 constrained headroom and asymmetric10→14 example justify studying
allocation; baseline-equal cases and incoming-pressure limitations rule out an
automatic integration recommendation. The greedy candidate stays rejected.
Do not integrate this exhaustive oracle, enable a switch or prepare a trial here.
No accepted/resolved healing, prevented damage, survival or victory gain is claimed.

Runtime, package, build, config, index and unrelated work are preserved. Existing
index drift/PNG metadata exceptions are not investigated or repaired; no PNG,
managed manifest, replay or parked payload is opened. Earlier receipts remain
unchanged. New focused output, comparison rows, source hashes and preservation
records are retained outside Git:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/healing-joint-oracle-test-only-20261017-siiA71/report.json`.
