# Opening travel ID tie resolution — rejected test-only (2026-10-18)

Current re-evaluation: **reject runtime integration of the ID-only rule**.
The [subset-scoped re-evaluation below](#re-evaluation-with-current-subset-scoped-support)
uses inactive build
`cdf6e4eb2289e0b24f2a16df6b21b3c9029666826dfbbde1a3dc647a90d67afd`
and15 generated checks. It removes the obsolete support-cancellation premise,
but retains conditional transient progress, eventual blocking and demonstrated
starvation. The original allocator and test transport remain byte-identical;
only test expectations/coverage and this document change. No integration or
trial follows. The original result and publication boundary below are historical
and remain intact; the earlier external receipt is not overwritten.

Decision: **reject as a standalone improvement**. Stable actor IDs recover safe
moves withheld by intersection, but do not establish sustained supported travel
in the retained generated sequence. Keep the negative candidate/tests; no
runtime integration, activation, renamed-ID tuning or further arbitration.

Publication retains these negative findings, not the obsolete executable harness.
Its assertions require the former full-proposal preflight. The later
[subset-scoped correction](objective-travel-support-scope-integration-2026-10-18.md)
changed that seam; this document's original33-check result is not a current-build
test result. The old allocator/routing/tests remain local and unchanged, are not
published or rerun, and are not a new ID-arbitration-plus-support experiment.

Runtime remains inactive build
`55bf14a37328b727ede0f65d51c75f558f79b51251217bb68627364895958553`.
Package, source/build, switches and Git index are unchanged. The
[centre-support candidate](opening-centre-support-test-only-2026-10-17.md) and
its transport remain byte-identical; both comparisons use that same algorithm.
Centre decisions may differ later because observations/secondary reservations
differ, not because centre policy changes.

## Gate: exact cause before implementing the comparison

Reuse the existing generated `congestedWorld()` factory, moved unchanged from
`opening-deployment-flow.test.js` to
[one shared fixture](../../tests/fixtures/opening-secondary-congested-world.js).
It is a generated analogue, not a new replay read or the actual historical
trajectory. Existing diagonal reports, plain terrain, full roster/membership,
observed-progress rules and declared execution outcomes are unchanged.

An exhaustive16-mask audit was saved before implementation. Current occupancy,
distinct destinations and production `secondaryStepSupport` determine feasibility.

| Generated tick | Maximum safe subsets | Intersection / other constraint |
| --- | --- | --- |
| 1 | medic + bow2 + guardR2 (unique) | bow1's destination is currently occupied by bow2 |
| 2 | bow1 + bow2; bow1 + guardR2 | Both alternatives are safe; bow2/guardR2 propose (13,14). Intersection admits bow1 only. medic's cell is occupied |
| 3–4 | bow2; guardR2 | Both singleton moves into (13,14) are safe; intersection admits neither. bow1/medic propose currently occupied (13,13) |
| 5–6 | Empty set only | Centre guardM0 now occupies (13,14); tie resolution cannot permit entry |
| 7 | Terminal | Original `no-displacement` termination |

Thus intersection **contributes** to the generated stall; it is not the only
blocker. Multiple equally good safe subsets with withheld useful moves establish
the requested comparison gate. Occupied cells remain inadmissible throughout.

## Candidate and isolation

Local test-only allocator `tests/fixtures/opening-travel-tie-candidate.js`: retain
the production fast/unsupported paths. On the existing four-member blocked path,
enumerate at most16 masks, require current vacancy/distinct destinations and
the unchanged production all-move/stay support predicate. Select maximum move
count, then the lexicographically smallest sorted list of moving actor IDs.
No priority, route, support or shape requirement is weakened.

Local test-only module routing `tests/fixtures/opening-travel-tie-world.js`
replaces only `prepareSecondaryMovement`'s subset selector import. Production
priority, adjacent-route/full-support preflight and executor remain unchanged;
runtime source is not rewritten. The centre candidate's direct import continues
to use the original intersection rule. There is one selection per prepared
secondary batch, not an intersection pass followed by a second movement pass.
The independent test audit enumerates16 masks again for evidence; that extra
audit is not part of the proposed allocator or an Arena CPU measurement.

Reserve secondary destinations before the unchanged centre candidate runs.
Its existing tick-local reservation handling and all current occupancy checks
remain. No assumed vacating, swap, path search, fairness counter, remembered
winner, retry, extra waiting or target/mission chaining is introduced.
The test-mode setting selects a comparison policy, not per-actor arbitration
history. Attacks/healing still use observed positions/original execution order.

Actor-ID ties are intentionally **not renaming invariant**: renaming an actor
can select a different equally good physical subset. Tests show this explicitly.
Non-tied physical decisions remain unchanged. Input-order independence and
mirrored geometry **with unchanged IDs** preserve the generated command sequence.
No opponent identity/version is a policy input.

## Successive observations and adverse outcomes

All next positions are explicit generated inputs into previously admitted,
adjacent, originally empty, distinct cells. Calls/return0 never move actors.

| Comparison | Secondary command counts | Termination |
| --- | --- | --- |
| Intersection, all admitted steps supplied successful | 3,1,0,0,0,0,0 | `no-displacement` at7 |
| Stable IDs, same success convention | 3,2,2,0 | `capture-step-support-unavailable` at4 |
| bow2 rejected/unknown/accepted without displacement | 3,2,2,0 | Same support-preflight cancellation at4 |
| All secondary commands non-displacing after first observation | 3,2,2,2,2,0 | Original stall termination at6 |

At candidate tick3 the safe maxima are `{bow2,medic}` and `{bow1,bow2}`.
Stable IDs choose the latter: the healer is not generally prioritised by this
rule. At tick4 medic remains (13,12), bow2 is (13,15), and bow2's next validated
route cell is (13,16), range4 from the stationary healer. The original **full-step
support preflight cancels before commands**, rather than salvaging a different
subset. This conservative gate remains unchanged. No unsupported step is issued.

When bow2's calls fail or are unknown/non-displacing, safe medic alternatives
are declined at two successive observations while guardR2 advances; the same
gate subsequently cancels. When every secondary actor stays, the lower-ID winner
can be selected repeatedly while another feasible contender is withheld, until
traffic/stall ends the attempt. There is no fairness/progress guarantee. Do not
add history or tune names to erase these outcomes.

Both rules retain the prior generated adjacent-crossing case: secondary
reserves (12,12), adjacent to a centre actor; centre cannot issue that step.
Supplying a centre-healer failure at the next observation remains support-safe.
Escort ownership still cancels before subset selection, with identical tactical
commands. Existing24/4 query caps,1000 ops/query,40-cell routes/cache age,
start1/deadline61 and four unchanged observations remain. Reported operations
come from generated API response inputs, not actual Arena work.

## Validation, recommendation and limits

Historical command, for the local frozen comparison only; not a published
generated-validation command for the current shared-support implementation:

```sh
node --test tests/unit/opening-travel-tie.test.js tests/unit/opening-deployment-flow.test.js
```

33 generated checks pass:14 comparison checks and19 existing real-loop checks
affected by the factory move. No skips, original/historical fixture readers,
replay/cache responses, gameplay trials or build regeneration. Centre-support
validation not affected by a source change is reused. Initial failed assertions
expected a different starvation victim/termination; the actual repeated denial
of the healer and support cancellation are retained, with no policy tuning.

Tests verify admitted move/stay support outcomes, current occupancy, no shared
destinations, original work/lifecycle caps, one movement command/actor, priority
handoff, partial/non-displacement, input order, fixed-ID mirrors and explicit
renaming dependence. Safety rejection is not interpreted as unsafe execution.

Reject this ID-only tie policy for further development as a standalone change:
it offers transient safe progress but does not provide useful sustained supported
departure in this comparison and can repeatedly deny an available healer move.
This does not establish that all possible generated worlds fail, or that the
existing intersection rule is an implementation defect. No historical fix,
Arena displacement/arbitration, capture, damage prevention or survival benefit
is established. Do not start another arbitration variant or trial here.

Cause audit, complete generated frames/returns, outputs, preservation hashes and
read-scope limitations are retained in:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-travel-tie-test-only-20261018-cAwbjh/report.json`.

## Re-evaluation with current subset-scoped support

The unchanged local `tests/fixtures/opening-travel-tie-candidate.js` and
`tests/fixtures/opening-travel-tie-world.js` run against the published371894a
runtime. Existing `congestedWorld`, supplied diagonal response table, plain
terrain, actor IDs, membership, priorities, centre helper and observation-success
conventions are unchanged. No historical reader, raw extract, fixture search or
original response is used. Tests import the named generated harness only and
necessary production/generated dependencies.

Canonical current `secondaryStepSupport` proves every admitted weapon/healer
move/stay combination. Original production preflight checks **current support**,
not full-proposal support. Intersection uses the actual production selector.
The original generic ID branch still chooses the lexicographically smallest
sorted actor list among maximum safe subsets when occupancy/convergence blocks
the full proposal. Its existing conflict-free/unsupported-shape delegation goes
directly to the current production selector; no new arbitration domain, ranker,
fairness state or support rule is added. Exhaustive diagnostic enumeration is
test work, not extra runtime route work or an Arena CPU measurement.

### Precisely obsolete expectations

The unchanged old14-case entry point on the current build gives10 passes and4
failures. The all-success expectation `[3,2,2,0]` with support cancellation at4,
and the three `bow2` return cases (`-11`,unknown,numeric0 without displacement)
expecting that same reason/tick, are obsolete. Their actual continuation now
retains safe subsets and eventually stalls. These failures are retained before
test edits; they are not production failures or overwritten old-build evidence.

Extend the primary observation loop from its former10-test-observation cutoff
to termination within the **existing**61 absolute boundary. No mission timer,
deadline, stall counter or policy is extended. The first updated run also
mistakenly asserted that nested route selection must become finished: opening
cancellation deliberately spends the outer mission while retaining its nested
selection. The corrected assertion checks outer finished state, no owned moves
and no later search/reacquisition. That failed assertion is retained too.

The previous isolated renaming probe remains in the exact old test before-copy.
The current run uses original IDs in every comparison and instead asserts the
fixed lexical winner; no identity is renamed to improve progress. Input-order
reversal and mirrored geometry preserve original identities and the complete
generated sequence. Exact-tie outcomes are **not renaming invariant**, by the
unchanged ID comparator; this is separate from input-order determinism.

### Successive-observation results

All counts below are admitted commands. Supplied displacement is a separate
generated input, never inferred from returns or claimed as Arena movement.
Every active frame checks all16 move/stay combinations per four-member squad,
distinct currently empty destinations, one movement command/actor and24/4
query caps. Original start1, deadline61, unchanged support/priority cancellation,
four stalled observations and spent state remain. Centre helper work stays
bounded at64 neighbours and16 subsets per retained squad.

| Supplied execution convention | Intersection | Original stable-ID rule |
| --- | --- | --- |
| All admitted direct moves succeed | 4 supplied secondary steps; counts3,1,0,0,0,0,0; stall7 | 12 supplied steps; counts3,2,2,1,1,1,1,1,0,0,0,0,0; stall13 |
| `bow2` never displaces; return-11,unknown or0 | 5 commands,4 supplied steps; stall8 | 11 commands,4 supplied steps; stall8 |
| After first observation no secondary actor displaces | 7 commands,3 supplied steps; stall6 | 11 commands,3 supplied steps; stall6 |
| Departing healer never displaces | 9 commands,3 supplied steps; stall7 | 12 commands,5 supplied steps; stall8 |

All end `no-displacement`; no flag ownership/capture is supplied or observed.
All-success routing totals8 queries for intersection and12 for IDs (four each
at1/6 and, for the longer ID attempt,11), not an enlarged per-tick budget.
Reported ops100 per injected response are generated inputs, not measured work.
Remaining flag ranges in bound order medic/bow1/bow2/guardR2 are37/37/36/36
versus36/34/33/35. Thus IDs yield real **decision-level local progress** in the
declared generated-success case, not sustained mission departure/arrival.

At4 the full proposal is unsupported but current support remains valid. IDs
admit bow1, withholding bow2's unsafe step. At5 medic can move safely, then
bow2 at6 and bow1 at7. At8 equal safe singleton contenders are medic and
guardR2; IDs choose guardR2. At9 medic's proposed cell is occupied, two other
cells are occupied and bow2 cannot advance without leaving stationary healer
access. Only empty/current support is safe through12; the original stall
terminates at13. The former cancellation disappears, not the traffic/support
dead end.

When bow2 never displaces, the safe medic alternative is repeatedly declined
while the original lower-ID contender is selected. At4–7 IDs keep selecting
bow2; at5–7 `{medic}` and `{bow2}` remain equal safe maxima. The accepted0 case
has the same observations as rejected/unknown returns. Both rules end with the
same secondary positions; the additional commands confer no generated progress.
When all secondary commands fail to displace, the same contender is likewise
repeatedly favoured until stall. Bounded termination prevents indefinite waiting,
but does not establish fairness or useful retry behavior.

The original adjacent crossing case still fences secondary destination(12,12)
from centre travel under both rules, including a non-displacing retained healer.
Shared reservations, occupancy and no-vacating assumptions remain. Escort wins
before any alternate selection, with identical ordinary/tactical traces. A new
current-observation tactical comparison also matches production selectors/order
through both continuations; these no-contact healthy inputs emit no attack/heal
calls, so nonempty combat/healing effectiveness is unexercised, not inferred.
Existing unaffected tactical validation is reused.

### Recommendation and retained evidence

**Reject the ID-only rule for runtime integration.** The old support-cancellation
reason is no longer a valid objection. There is conditional safe local progress,
but the unchanged ID ordering still demonstrably denies available healer moves
under a non-displacing winner, provides no added observed progress in that case,
and eventually blocks even with all supplied moves succeeding. No remedy or
new arbitration variant is introduced to force success.

Both comparisons depend on the same **test-only centre-support controller**.
The gain is conditional on that helper, not qualification of standalone deployed
opening movement; ordinary centre support and priority handoff limitations remain.
Support-safe decisions do not prove Arena arbitration, capture, damage prevention,
survival, competitive benefit or engine CPU cost. No future trial is authorized.

```sh
node --test tests/unit/opening-travel-tie.test.js
```

15 generated checks pass,0 fail/skip. Runtime/config/package/build/index,
allocator, routing transport, centre candidate and source fixtures stay unchanged.
No historical test, gameplay suite or build regeneration runs. Test-local Node
timing is not Arena CPU. Original receipt/hash and all new before/failing/passing
outputs,12 complete generated comparisons, support/command observations and
preservation evidence are retained at:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-id-tie-reevaluation-20261018-LUA9v6/report.json`.
