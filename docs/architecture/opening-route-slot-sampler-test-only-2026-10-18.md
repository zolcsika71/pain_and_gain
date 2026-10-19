# Role-independent opening probe sampling — test-only

Status amendment: the accepted sampling rule is now promoted into the
[default-off production probe](opening-route-probe-2026-10-18.md#role-independent-sampling-integration-and-exact-rollback).
Its source-rewriting adapter is removed; generated tests invoke production
directly. All switches remain unchanged/off for opening and probe. The original
test-only findings below remain evidence of their recorded inputs, not actual
alternative routes, historical full eligibility or a new trial.

## One sampling change, unchanged qualification gates

The former `tests/fixtures/opening-route-slot-sampler.js` test adapter loaded the
exact SHA-256-pinned production [probe](../../src/debug/opening-route-probe.js)
and substitutes **only** its actor-sampling block in memory. The two relative
imports are converted to absolute URLs for test module transport; no source file
is rewritten, no actor role or observation is disguised, and no second copy of
the support, cache, request, accounting or result-validation policy is maintained.
Changed source/hash or unmatched substitution fails qualification immediately.
This narrow source-coupled loader is test scaffolding, not a runtime integration
seam or a framework. The subsequent separately scoped inactive integration
removed this scaffolding rather than deploying source rewriting. Its exact old
bytes remain in rollback copies; the audit and original51-check results below
are historical.

Consider all four unchanged bound members whose proposed next cell is free and
shared. Sample the first by **original production membership slot**, namely its
index in the birth-bound `membership.squads[].memberIds`. The membership logger
projects this index as `members[].slotIndex`; it is not a field on runtime member
objects. Require the original four distinct slots; unknown binding means skip.
This is not diagnostic-array iteration order, lexicographic actor-ID ranking,
movement arbitration or a healthier/new squad. The emitted `actorSlot` still
indexes the existing diagnostic `memberSlots`, so it need not equal the original
birth slot. Resolve both against their own same-tick evidence/binding.

**Bias is intentional and retained:** changing the original slot allocation can
change the sampled actor, and an earlier-slot conflict can consume the only shot
before a later-slot actor is ever sampled. Fixed-slot renaming and irrelevant
array ordering do not change the sample. This is not uniform or fair sampling.
There is no invariance claim for renaming followed by fresh production membership
initialization: that can change the original slot allocation itself.
Do not reorder actors, tactical execution, proposed/admitted moves or commands.

All other [production probe gates/bounds](opening-route-probe-2026-10-18.md) remain:
active prepared compatible opening, complete inputs and map provenance, both
groups' ownership/priority checks, support, valid route/cache bindings, four fresh
cache hits, live0 queries/known0 operations and reserved900-character headroom.
One allowance is consumed before the first charged request; complete supported
baseline permits one alternative. At most two maxOps1000 searches within the
combined four-query active cap, frozen shared-cell exclusions, no retries. No
returned route enters gameplay. Missing input is not permission to assume a pass.
Production one-shot reset behavior was not changed by the test adapter or promotion.

## Retained eligibility audit — not a reconstructed execution

Replay `6ad51b8eabefcb4fa2c92131`, zGeneral v37. Only the existing extracted
`observations.json` ticks1–27 and its extraction/report provenance were read.
Its SHA-256 is
`f7fc3fa44233bd6044e42fc91cbbbda61962c3f91e4ae50edb3c56ca8f42ff37`.
No original response, cache, map payload, additional replay or historical suite
was read. Complete closed ticks, one original membership baseline and zero
membership-change records support the unchanged birth-slot binding; mappings
are not borrowed across a gap.

| Observation | Visible sampling/work facts | Full eligibility |
| --- | --- | --- |
| 1 | Live4 queries; no free shared proposal | Blocked |
| 2 | Ranged conflict, but live4 queries | Blocked |
| 3 | Live0/reported0, cacheHits4; original slot2 `pg_player1_ranged_4` proposes shared free `(16,14)`;12 owned actors; existing admitted support passes; base diagnostic660 characters | **Unknown**, not a pass |

Tick3 is the earliest **visible candidate**, not an established eligible probe.
No fully eligible retained observation can be proved. Missing inputs include:

- Four original cache reports: complete paths/lengths, `from`, `searchedAt`,
  `incomplete` and flag binding. Aggregate `cacheHits:4` corroborates reuse but
  cannot supply those serialized inputs for exact reevaluation.
- Successful same-match map-capture tick/provenance. Map data is not projected
  into this extraction; do not invent `mapTick:1` or reopen the original response.
- Complete preflight/priority context and raw reservation state. Existing owned
  commands corroborate successful preparation, not every unlogged preflight input.

Original admitted support can be checked using observed coordinates/functioning
part indicators; this does not reconstruct exact per-part health or missing
route/preflight objects. The sampler is **not invoked** on synthetic historical
cache reports. No API request, alternate path, movement or capture is inferred.

## Generated qualification

Use these explicit generated-only entry points, without name filtering:

```sh
node --test tests/unit/opening-route-slot-sampler.test.js tests/unit/opening-route-probe.test.js
node --check src/debug/opening-route-probe.js
node --check tests/unit/opening-route-slot-sampler.test.js
```

The explicit selection passed51 generated checks,0 failures/skips. Syntax,
affected links and task-specific whitespace checks pass; unaffected validation
is reused. No runtime build generation or gameplay trial is part of this task.

The new suite supplies complete generated production membership, live planning,
preflight/execution and route reports. The searches are injected response tables,
not a substitute pathfinder. Existing generated production-probe checks cover
unchanged validation; unrelated accepted validation is reused. The unit entry
points never import a retained-payload reader or open the audit's external file.

Checks cover role-independent first-slot selection, unchanged roles/live state,
fixed-slot renaming, deliberate birth-slot order dependence, frozen matrices,
origin/blockers/options, combined accounting, one-shot success/failure/late-tick
suppression, unknown/incomplete results and no retries. Keep no-conflict,
occupied, insufficient-budget/cache, missing map/binding, support loss, real
escort/injury priority cancellation and headroom skips. Production movement and
current-tick healing traces remain identical, including available healing after
injury cancellation; at most one movement command per actor is retained.

Two40-cell supplied results with maximum-width fields/statuses fit713 JSON
characters within the unchanged900 reservation. The tested complete diagnostic
is1371 characters, below2700. Headroom is still checked before searches; no log
limit or required evidence is truncated. These numbers do not bound the full
pre-existing roster/map payload or measure Arena CPU.

Original recommendation: **retain test-only**. The rule removes the demonstrated role-only
sampling exclusion in generated complete inputs, with explicit deterministic
slot bias and no gameplay effect. Historical full eligibility remains unknown;
runtime promotion, instrumentation, actual route availability and another match
are not authorized or established. Do not broaden the experiment to conceal
missing evidence or add another sampling variant.

External receipt: `opening-route-slot-sampler-test-only-20261018-s3xTbl/report.json`
under the existing evidence root. It retains the per-tick audit, generated results,
development fixture corrections and protected-file/index preservation.
