# Shared objective travel — subset-scoped support (2026-10-18)

Status: integrated, **inactive**. Starting build:
`55bf14a37328b727ede0f65d51c75f558f79b51251217bb68627364895958553`.
New inactive build:
`cdf6e4eb2289e0b24f2a16df6b21b3c9029666826dfbbde1a3dc647a90d67afd`.
Every config value is unchanged: opening deployment, secondary objectives,
engagement control and healer closing are off; existing healer escort remains on.
No activation or trial is prepared.

Later amendment: the [centre policy](opening-centre-support-test-only-2026-10-17.md#current-inactive-runtime-integration)
is now promoted under the existing disabled opening switch. Statements below
about it being test-only describe this correction's original scope; the stronger
centre quorum and shared subset rules remain unchanged by that promotion.

## One implementation and validation order

Promote the [accepted comparison](opening-travel-support-scope-test-only-2026-10-18.md)
into `selectSecondaryTravelSteps` in
[`supported-contest.js`](../../src/strategy/supported-contest.js) and the single
[`prepareSecondaryMovement`](../../src/arena/execute.js) seam. Opening, ordinary
capture, contest and contest-origin capture handoff all use this seam.
No controller, ranker, route provider, membership rule or tactical selector changes.

1. Existing planner validates complete observations, original membership,
   health/capability, current support, centre commitment/defence/threat, pinned
   bindings, lifecycle, route/cache structure and known legal first-step terrain.
2. Executor requires every bound actor/step entry, movable actors, adjacent
   proposals and the unchanged ordinary movement/escort/pair priority checks.
   Invalid routes/priority still cancel before any group command.
3. Prove support for current/all-stay positions. A lost current-support outcome
   is possible for any admitted batch, so it still cancels immediately with the
   existing `<kind>-step-support-unavailable` reason.
4. Require bounded known occupancy, as before.
5. Accept a full proposal only when both occupancy/distinct-destination and
   all-outcome support pass. Conflict-free proposals cannot bypass support.
6. For the original four-member shape, otherwise examine14 proper nonempty
   subsets. Current empty and full were already checked: at most16 unique subset
   proofs in total. Each subset uses only original adjacent validated steps,
   currently empty distinct cells and canonical `secondaryStepSupport`.
   Each weapon needs a functioning healer covering every weapon/healer move/stay
   combination within range3. No success, vacating cell or swap is assumed.
7. Keep maximum move count and **intersection of equal maxima**, not actor-ID
   arbitration. Non-admitted actors keep objective-owned holds. Smaller blocked
   groups still whole-hold; no new membership/formation policy is introduced.

No-safe-moving-subset with current support means owned holds, not cancellation
or extra grace. Subsequent positions alone establish progress. Original four
unchanged observations,60-tick deadline, spent attempt,24 acquisition/4 refresh
queries,1000 requested ops/query,40-cell routes and five-tick cache age remain.
Accepted, rejected and unknown command returns do not move observations or
reset any bound. Reservations and at-most-one movement command remain unchanged.
Current-position attacks/healing and original execution order are preserved.

The selector's empty-subset proof is a caller precondition, not a standalone
validator for arbitrary raw steps. Existing support-locked engagement and the
then-test-only centre candidate still prove their stronger full-proposal support
before calling it; those policies are not relaxed. The centre candidate and its
transport remain byte-identical and are **not** integrated. ID arbitration stays
rejected. The support-scope comparison selector/resolver is deleted; the small
generated world transport retains no policy or import substitution.

## Bounded diagnostics

No new fields or log records. Existing `travel.examined` is16 when the bounded
four-member selection runs,0 for the full-safe fast path/no enumeration.
`bestSize/tied` describe alternatives, not the eventual intersection size.
At most four scalar actor records keep proposed/admitted points and `holdReason`:

- `null`: admitted; `no-step`: no proposed cell.
- `occupied`, then `converging`: existing precedence/meaning.
- `subset-hold`: otherwise withheld by subset support/intersection. It does not
  claim this actor alone is unsafe or that a tied winner was selected.
- `group-hold`: unchanged smaller-group fallback.

Lost-current-support cancellation retains its original reason and omits travel.
The existing limits remain: travel below1200 characters at bounded IDs,
non-travel below1500 and combined below2700. Opening slot references resolve
against their own tick's snapshot; maximum escaped IDs with healer-only travel
are tested without truncation or additional records.

## Generated evidence and limitations

Before runtime edits, three real `runTick` checks fail with the old full-proposal
gate: opening returns finished, capture issues no healer command, contest
cancels instead of admitting three supported steps. All pass after promotion.
Healer-first generated opening counts are1,4,4,4,4,4 with16 initial plus4 age5
refresh queries. All admitted move/stay outcomes retain functioning support.

351 explicitly selected generated checks pass. They cover opening, capture,
contest/handoff and shared engagement consumers, current-support/HEAL loss,
incomplete inputs/routes, unknown occupancy, no-safe-moving subsets, escort/
injury/emergency priority, partial/rejected/unknown/non-displacing commands,
stall/deadline/spent state, unchanged tactical traces, disabled bypass and
deterministic ties. Former whole-proposal cancellation assertions are replaced
only where this deliberate scope change now holds unsafe movers and admits safe
ones; original stall assertions remain. Intermediate failures are retained.

```sh
node --test tests/unit/opening-support-scope.test.js tests/unit/opening-deployment-flow.test.js tests/unit/secondary-objective-flow.test.js tests/unit/secondary-partial-travel.test.js tests/unit/opening-secondary-deployment.test.js tests/unit/opening-secondary-route-provider.test.js tests/unit/secondary-objective-selection.test.js tests/unit/secondary-scoped-readiness.test.js tests/unit/supported-contest-candidate.test.js tests/unit/support-locked-flow.test.js tests/unit/support-locked-engagement.test.js
```

No name filtering, historical entry point or fixture payload reader is used.
Build generation/check, `npm run check`, affected whitespace and local links are
checked separately. Unaffected validation is reused.

The original generated congestion remains3,1,0,0,0,0,0 and terminates at7; centre
ordinary separation still cancels diversion. The centre-support test fixture is
used only as an unchanged comparison dependency, not deployed coordination.
Generated subsequent positions are explicit inputs from previously admitted,
vacant adjacent steps, not Arena arbitration. No historical alternative,
actual movement, capture, damage prevention, survival, strategic benefit or
Arena CPU claim follows. Traffic and intersection ties can still consume an
attempt. No remaining blocker is demonstrated within this generated scope;
live usefulness remains unverified.

## Exact rollback — separately authorized only

Evidence root:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/objective-support-scope-integration-20261018-S17JFH/`.

1. Compare current files with final hashes in `report.json`; stop on unexpected
   overlap rather than overwrite later work. Do not reset/refresh Git or touch
   unrelated source, config, PNG metadata exceptions or managed evidence.
2. Restore exactly `before/src/arena/execute.js`,
   `before/src/strategy/supported-contest.js` and
   `before/src/debug/build-id.js` to the corresponding repo paths. No other
   runtime/config change is needed. Verify the starting build with
   `npm run build-id:check`; do not regenerate a substitute baseline.
3. A complete development rollback restores only this task's tests/docs from
   `before/` (including the deleted support-scope adapter). Remove only the new
   integration document and its index link, preserving all earlier dirty hunks.
   The recorded before-hashes distinguish pre-existing work from this task.
4. Verify config/package/index and all non-target runtime hashes unchanged.
   All experiments remain off. Rollback is not activation or trial preparation.

Before-copies, before/after hashes, failing-before and final checks are retained
in the external `report.json`; prior experiment receipts remain unchanged.
