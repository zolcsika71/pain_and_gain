# Opening travel ID tie resolution — rejected test-only (2026-10-18)

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
