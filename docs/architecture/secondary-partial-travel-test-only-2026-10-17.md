# Partial secondary travel — test-only comparison (2026-10-17)

Status: original comparison retained; its selector is now
[integrated but disabled](secondary-partial-travel-integration-2026-10-17.md).
The source variant below was removed; production owns the sole selector and the
generated suite now calls that implementation. No activation or new live result.
The original test-only comparison left runtime/config/build exactly
`0bec72b13084579ea07b3e2d3d15b260f8c141a3d5e06317db4253528cbb391f`.
Secondary objectives and healer useful closing remain disabled. This proposal
changes neither objective admission nor ranking. Existing accepted gameplay
validation is reused; only the new generated comparison is run.

## Historical evidence boundary

The retained trial report for Odiodin v12, replay
`6ad2c058abefcbf16cc8f635`, establishes capture selection at49, four-member
`capture-route-hold` on49–52, unchanged observed group positions and
`no-displacement` termination at53. No objective movement command occurred.
The emitted build and unchanged preflight narrow the hold to occupancy and/or
converging first cells. **Validated first cells and the specific blocking cell
were not retained.** There is no exact historical subset reconstruction, claim
that a useful legal subset existed, or prediction that this attempt could have
departed/captured. No replay/log/frame is reread in this task.

Recorded group cells were healer3(50,48), ranged3(48,48), ranged4(49,49),
ranged5(49,48); this alone does not determine their route steps. The generated
cases below use different cells and supplied route reports, not invented missing
historical paths or terrain.

## Small test-only policy

The original `tests/fixtures/secondary-partial-travel-candidate.js` wrapped the
**real** `prepareSecondaryMovement` and reused `secondaryStepSupport`. No runtime
imported it. Integration removed that fixture rather than retaining two policies;
the original source and 25-check receipt remain preserved externally.

1. Run original whole-group preflight once. Preserve route/priority/support/
   occupancy-unknown cancellation and all existing non-hold behavior. Full
   original support must pass even if a smaller subset might have been safe;
   this deliberately does not salvage a safety-cancelled group.
2. Only for an original whole-group hold with exactly four distinct members,
   four validated first-step entries and at least one non-null step, consider
   partial travel. The full movement subset was already examined by production.
   Examine its other15 subsets (including empty) once: **16 total maximum**.
3. An admitted step must remain exactly the original validated adjacent cell.
   It must be currently unoccupied by any living observed actor; admitted
   destinations must be distinct. No swap, vacating-cell, reservation or engine
   arbitration assumption. Non-admitted actors retain owned hold, not ordinary
   fallback/approach commands.
4. For each admissible subset reuse the production support check. For every
   weapon, one functioning selected healer must cover all four current/next
   weapon/healer combinations within range3. Thus every success/failure subset
   of the admitted commands retains that support. This is access, not reserved
   healing, maintained direct-heal bands, adequate damage coverage or victory.
5. Prefer maximum admitted cardinality. If maxima tie, admit only their
   **intersection**, already evaluated as a subset. No ID, input order, absolute
   coordinate or left/right choice breaks the tie. A subset of a support-safe
   set only removes possible next positions, so this intersection remains safe.

The intersection can be smaller than every maximum. With two actors competing
for the same cell, both may hold while independent common moves proceed. If
only those competitors could move, the result is a hold even though safe
singletons exist. This deliberate progress limitation preserves renaming and
reflection symmetry without adding arbitration or persistent fairness state.

Production's current four-member full support check already covers all
moving/stationary outcomes. Restricting permitted moves cannot enlarge that
outcome space; repeated use of the same check is a bounded defensive condition,
not a relaxed healing threshold or new combat model.

## Generated comparisons and adverse cases

All cells within an observation are distinct. The tests use the existing full
preset-roster builder, real planner, preflight, direct-step executor and tactical
selectors. They supply explicit next observations; returns never update cells.

| Generated case | Original whole-group behavior | Test-only result |
| --- | --- | --- |
| One of four first cells occupied | All four hold | Three direct steps admitted; all8 possible success/failure outcomes retain support |
| Two first cells converge, other two independent | All four hold | Two common moves; both tied contenders hold; all4 outcomes safe |
| Every destination occupied | All four hold | No nonempty admissible subset; all hold |
| Only symmetric competing singletons are possible | All four hold | Tie intersection empty; no invented ID winner |
| Two actors would swap current cells | All four hold | Both swapping actors hold; only independent free-cell steps admitted |
| Full proposed movement can lose healer range | Safety cancellation | Same cancellation; no subset enumeration |
| Escort, pairing, ordinary capture combat or healing ownership | Priority cancellation | Same cancellation before any objective command |

In one generated planner/executor trajectory, a blocker remains stationary
while three admitted actors take supplied next observations for five ticks.
Healer x41→46 and two weapons x43→48 consume validated route prefixes; the
blocked weapon stays x43. On tick6, further healer travel would leave that weapon
at range4. Original support preflight cancels rather than adding a wait or
loosening range. Initial acquisition uses24 calls; the existing tick6 refresh
uses4, total28. No candidate query, reroute or extra path search occurs.

If only one weapon moves on the first observation and the healer stays, current
range3 is still supported; the next proposed farther step cancels conservatively.
Accepted/rejected/unknown command returns without observed displacement all
terminate at the original fourth unchanged observation. An earlier supplied
partial departure cannot reset the absolute60-tick deadline or spent state.
Ownership change terminates rather than claiming capture or chaining objectives.
These adverse outcomes are retained, not tuned away.

The executor seam preserves compatible contest ranged attacks. Ordinary capture
still cancels for the same combat intent. An injured selected healing target
still triggers original movement-priority cancellation; current range2 selects
`rangedHeal`, not prospective adjacent `heal`. These seam cases do not establish
contest admission, resolved healing or simulated combat effects.

## Verification, cost and recommendation

25 focused generated checks pass, including all admitted execution outcomes,
malformed/missing steps, unknown occupancy, lost HEAL, blocked execution,
observed-progress lifecycle, unchanged24/4 work caps and original deadlines.
Renaming, actor/member/step ordering and horizontal/vertical/both reflections
preserve physical decisions, including symmetric convergence ties. The initial
run had three test-harness exceptions when it tried to read movement kind after
production had correctly terminated ownership; using the ordinary terminal
fallback kind fixed that helper. No policy was tuned to pass these cases.

Cost is one original preflight plus at most15 extra fixed four-member occupancy/
support checks per eligible hold. There are no searches, counters or reservations.
Actual Arena CPU, displacement/arbitration, exposure after enemies move,
coordination, capture and strategic benefit remain unproven. Other moving actors
can still contend for a currently free cell; the all-outcome support check does
not guarantee any movement. Some progress can postpone the unchanged counter,
but the unchanged absolute deadline still bounds the attempt.

The comparison supported **separate minimal integration at the existing shared
preflight seam**, preserving every original gate and ownership of held actors.
It does not justify activation, an extended attempt, a second trial or a new
coordination framework. Keep the current runtime inactive. Historical useful
partial travel remains unknown. The now-authorized inactive integration is
documented separately; the original comparison/results above remain historical.

Receipt, focused results and preservation:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-partial-travel-test-only-20261017-L3iTfh/report.json`.
Existing trial index-byte drift remains disclosed; no repair/reset or Git
mutation is performed. PNGs, replay payloads and managed manifest are untouched.
