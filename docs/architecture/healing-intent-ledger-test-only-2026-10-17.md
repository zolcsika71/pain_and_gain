# Tick-local healing-intent ledger — generated evaluation

Disposition: **reject this exact greedy candidate for runtime integration**.
It improves some scheduled allocations but has a retained counterexample with
lower target-capped accepted capacity than the independent production baseline.
No replacement algorithm, tuning, deployment or match is authorized here.

Baseline: published `f604f41`, inactive build
`2db3ffea0c369f5003d16f96e3714ca536aa150dc3ed9a8932490c68fef04cbd`.
Runtime, package/build/config and Git index are outside this experiment's scope.
The existing escort remains enabled; secondary objectives, healer closing and
support-locked engagement remain disabled. No new switch is introduced.

## Scope and implementation

`tests/fixtures/healing-intent-ledger-candidate.js` is an original test adapter.
The idea was identified in [cktang88's Arena Pain and Gain gist](https://gist.github.com/cktang88/e09c886ed3965c5e4fdf635781702eb2/709c61e26eeefc48bada5dce41166fcea4295d56),
revision `709c61e26eeefc48bada5dce41166fcea4295d56`, `Battle.actions`.
No gist code is copied; its ISC notice requirements still apply to any future
copy. No external reference code is executed by this experiment.

Reuse the unchanged [production healing selector](../../src/tactics/healing.js)
and [executor](../../src/arena/execute.js). A Node test-only module resolve hook
substitutes only the healing import of one query-tagged executor instance.
All other imports, including movement, retain their original implementation.
The adapter loads that instance lazily after its own module has initialized;
an active context exists only around its synchronous tactical invocation and
is cleared in `finally`. Nested candidate invocations are rejected.

The actual actor order is supplied unchanged to the real executor: each actor's
healing decision/call precedes its compatible attacks, then the next actor.
No sorting, pre-issuance of all healing, combat duplication or command wrapper
reordering is introduced. The production attempt reporter supplies the actual
call result before the next actor is selected. This test context is not logging
driving production policy and adds no runtime diagnostic stream.

Only living pure healers with functioning HEAL participate. An original armed
body remains a hybrid even if every extra weapon part is destroyed. Hybrids
retain original decisions/attacks and cannot fund the pure-healer ledger.
Their known accepted healing is nevertheless included in team accounting.

Complete supported owned rosters contain at most14 distinct actors. Use the
existing `closingHealModifier` seven-flag validator to obtain1/0.75/0.5. Partial
inventories, malformed ownership, unsupported bodies/positions, duplicate actor
inputs or nonempty raw effects outside this narrow model fence the ledger.
They do not invent a neutral modifier. Unknown accepted capacities make the
complete team total `null`, with a separately labelled known subtotal. This is
not a general effect parser or a rewrite of production malformed-input behavior.

Before each pure-healer decision, create separate **ranking-only** target views:
keep observed `hits`, replace ranking `hitsMax` with
`hits + max(0, observedDeficit - earlierAcceptedCapacity)`, and delegate to the
original selector. These views are not observations, body repair or healing
effects; no observed value is mutated. Map the returned action back to the
original observed target before execution. Self is included once. The original
nominal12/4 per-part ranking, range/ID ties and action-method choice remain;
this is not a new flag-adjusted scoring heuristic. Modifiers adjust accounting,
not those nominal ranking capacities.

Credit only an earlier healing call with return value **numeric0**, supported
actor/target/method/range, functioning HEAL and validated modifier. Credit is
`HEALparts * (12 at observed range0–1; 4 at2–3) * modifier`.
Failed, string/object/unknown returns and unsupported calls receive no credit.
The supported method pairing is what the production selector issues; an adjacent
`rangedHeal` callback is unsupported here, not asserted illegal in Arena.
Repeated callbacks for one actor cannot double-count. Duplicate actors in an
execution input fence accounting rather than pretending multiple engine intents
are independent; original executor calls are not rewritten to repair that input.

Each invocation creates fresh maps. There is no tick-to-tick memory, target
reservation, path search, movement simulation, enemy forecast or coordination
framework. Each pure healer builds at most14 unique ranking views; at most14
actors/196 views, with the existing <=50-part observations, bound the new work.
These are operation-shape bounds, not an Arena CPU measurement.

## Baseline reproduction and generated comparisons

All tests in `tests/unit/healing-intent-ledger.test.js` construct distinct-cell,
immutable generated observations, with total HP equal to generated body-part HP.
Destroyed HEAL/extra weapon cases retain the resulting injury and genuine self-
healing decisions rather than pretending the damaged actor is full-health.
No historical fixture, replay response,
managed manifest or PNG is read. Calls append traces only and never resolve
damage, healing, restored parts or displacement. Existing pure generated
`tactics.test.js` is the only additional selected suite.

The baseline-only check was run first: two adjacent one-HEAL actors independently
choose A (deficit4), matching both the production selector and full executor
trace. Numeric0 calls schedule24 in total to A, whose target-capped total is4.
The candidate chooses A then B (each deficit4); each receives12 scheduled and
the capped total becomes8. Summing independent scores would incorrectly give8
for the baseline as well; the team metric below never does that.

For every known comparison, report
`sum_targets(min(observedDeficit, sum_acceptedScheduledCapacityForTarget))`.
Unaccepted calls contribute nothing. This estimates covered **observed** deficits,
not realized healing or net healing under simultaneous damage.

| Generated case | Baseline / candidate target-capped totals | Finding |
| --- | --- | --- |
| Two small wounds, equal direct access |4 /8 | Avoids duplicate allocation |
| A deficit40, B deficit3, two direct healers |24 /24 | Both still focus A; remaining need is not erased |
| Direct A deficit12, ranged B deficit20 |12 /16 | Second actor redirects to reachable B at ranged capacity4 |
| Asymmetric reach, flexible healer first |10 /10 | Next healer has no useful alternative; improvement is not guaranteed |
| Same asymmetric observation, constrained actor first | baseline remains10; candidate14 | Explicit execution-order comparison, never an implementation reorder |
| Three-healer greedy counterexample |30 /26 | Strict loss retained; integration rejected |
| Potential melee reach near A, two small wounds |4 /8 | A's scheduled capacity falls24 to12 despite improved capped metric; pressure risk remains |

### Strict greedy counterexample

H1(10,10), H2(11,10), H3(13,10) each have one functioning HEAL.
A(10,11) has deficit20; B(12,11) has deficit10. Every actor occupies a distinct
cell; the owned-army healing modifier is1.

Baseline issues H1→A `heal`12, H2→A `heal`12, H3→B `heal`12:
A capped20 + B capped10 =30. Candidate issues H1→A12, H2→B12, H3→A
`rangedHeal`4: A capped16 + B capped10 =26. Greedily spending H2 on B costs
the stronger available direct allocation to A. An explicit H1,H3,H2 execution
comparison yields30, demonstrating dependence on **actual scheduling**, not
permission to reorder production. Injured-target order/duplicate references
with fixed actor order do not change decisions.

No incoming-damage prediction is needed for that loss. Separately, diverting
healing away from a currently small wound in weapon reach can lower focused
scheduled capacity even when the capped metric improves. Observed reach does
not establish issued enemy attacks or resolved damage. The metric alone is
insufficient to justify combat promotion.

## Verification, preservation and decision

Generated checks cover numeric0 versus failed/unknown returns, functioning and
destroyed HEAL, neutral/one/two healing modifiers, unsupported observations/calls,
self/target deduplication, per-actor accounting, tick reset, full-roster bounds,
asymmetric reach, actual execution-order variation and irrelevant target-order
variation. The real movement pass is compared unchanged, including escort and
adjacent retreat. Hybrid direct-heal/ranged-attack compatibility, ranged-heal
attack suppression and original interleaved tactical order are checked.

The first complete run had32 pass/2 fail: one modifier expectation forgot that
9 accepted capacity leaves only1 of an original10 deficit (so B's deficit2 wins),
and a hybrid fixture expected ranged healing despite an equally scored adjacent
target. The final modifier fixture uses A deficit12 to exercise continued focus;
the hybrid fixture uses adjacent deficits3 so the remote deficit legitimately
wins. No selector/executor expectation or policy was relaxed to erase an adverse
allocation. The baseline-only passing output and initial failures are retained
with the focused results.

Final focused result: **41 pass,0 fail,0 skip** (33 new generated ledger checks
plus8 existing generated tactical checks), Node24.19.0. The baseline-only run
passed before the first candidate comparison. Runtime checks and unrelated
accepted suites are reused, not rerun.

Run only:

```sh
node --test tests/unit/healing-intent-ledger.test.js tests/unit/tactics.test.js
```

No full suite, package/build regeneration or runtime edit is needed. Keep the
test-only implementation/counterexamples as evidence; **do not integrate this
exact greedy policy**. A future alternative needs separate authorization and
must address the demonstrated allocation loss without silently reordering actors
or claiming a damage/survival model. No activation or further trial is implied.

Preservation verification: all22 runtime source hashes, exact inactive build,
config, package hash, HEAD, staged paths and index bytes match this task's
before-snapshot. Only this adapter, generated test file and document are added.
Unrelated tracked/untracked work is preserved by inventory; its payloads are not
independently all hashed. Existing index drift/PNG metadata exceptions are not
investigated or repaired, and no PNG/managed manifest is opened.

Baseline-only output, first comparison failures, final focused output, file
hashes and before/after preservation evidence:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/healing-intent-ledger-test-only-20261017-Z97FWt/report.json`.
