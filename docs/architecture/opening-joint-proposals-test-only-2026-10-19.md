# Route-backed joint opening proposals — inactive integration

## Current inactive runtime integration

The qualified [hold-aware extension](#hold-aware-extension-test-only-2026-10-20)
is now **integrated, inactive**, behind the separate default-off
`openingHoldJointProposalsExperiment`. Its original generated evidence remains
bounded by the limitations below; no activation or trial is authorized.

### Hold-aware inactive integration (2026-10-26)

Both `proposeOpeningJoint` and `proposeHoldAwareJoint` in
[the runtime module](../../src/strategy/opening-joint-proposals.js) call one
private shared core. The move-only entry preserves its original decisions,
choice/report shapes and smaller ceilings. The
[hold fixture](../../tests/fixtures/opening-hold-joint-proposals.js) now only
re-exports runtime policy. The duplicate-source comparison is replaced by fixed
candidate/certificate expectations and shared invalid-proof regressions.

`openingHoldJointProposalsExperiment = false` requires explicit opening
deployment and joint-proposal authority for operation. With opening requested,
unknown joint/hold values, hold without joint, or joint with any probe/adoption
value other than explicit `false` finish with `incompatible-configuration`
before route queries/matrix construction. With opening off, the added value is
ignored and existing behavior is unchanged. Every experimental switch remains
off; the existing healer escort remains on.

The existing loop/preflight context selects the fixed entry point. Observation
hooks call that runtime entry directly; no test proposal-policy substitution
remains. The real-loop hold regression failed before integration (move-only entry
selected), then passed with two distinct rear moves and two owned current-cell
holds. One private admission uses the holders' original cache report objects;
no zero-length hold route, cache write or extra search is introduced. Existing
eligibility/certificates, distinct original contenders, armed movement, all-outcome
support, unique optimum and original-map fallback remain unchanged. Final maps
still feed one bounded subset selection, centre reservation/preparation and one
movement pass. Centre cancellation clears both groups; terminal/capture release,
query/cache bounds, progress timers, tactical priority and diagnostics remain.

Authorized hold-aware ceilings are 32 neighbour evaluations, 4 choices/member,
256 complete assignments, 48 pair proofs, 341 enumeration nodes and 1 private
admission validation. Move-only keeps 32/3/81/27/121/1. Both add zero searches
and retain the 16-subset ceiling. The generated maximum reaches 32/4/256/48/341,
returns equal optima and falls back with no admission; accepted cases exercise
exactly one private admission. All 4096 support outcomes and adverse fixtures
are preserved. Changed-proposal diagnostic masks include holds (the generated
original slots produce `[2,14]`); cancellation emits `[14,null]`, release
`[0,null]`. Masks remain proposals, not displacement claims.

### Publication candidate qualification (2026-10-26)

This inactive candidate is assembled from parent
`83f8287076152001504f9683b46f884e81ea03b5` plus only the reviewed 15-file
integration delta and candidate-specific build/document bindings. Parent runtime
build: `138bda3534e1494e132e0c5987b47d40986ed841dcace1634347de282c86a76d`.
Candidate build:
`2897411faede1db7f18be6e2a7966ce8c01ab7b88fec840228256d7228dbe749`.
No publication, activation, trial, staging, commit, push or worker is performed.
All experimental switches remain off; the existing escort remains on.

The candidate uses the parent's `movement.js` and adjacent-retreat tests.
Unpublished retreat changes, coordinator additions, storage work, unrelated
historical-review removals, untracked work and the prompt deletion are excluded.
Parent historical review text below is preserved. This is a sparse materialization
of runtime, selected generated-test dependencies, required syntax tooling and
these documents; omitted assets are not proposed deletions.

Actual candidate validation: 115 focused hold/joint/integration checks, 509 checks
across the remaining 21 caller suites and 85 checks across adoption-flow,
slot-sampler and three escort suites; **709 pass across 29 files**, with zero
failures/skips. Each selected test file ran once against this candidate. The 12-check
difference from the earlier composite run is the excluded unpublished retreat
coverage. The commands below are unchanged file selections. Import/read-site
inspection preceded execution: computed loop/config hooks resolve within the
candidate; proposal hooks call runtime entries directly; selected inputs are
runtime source or generated JavaScript, with no historical reader entry point.
All 4096 support outcomes, maximum work and adverse fixtures remain covered.

Candidate build generation/check, `npm run check`, explicit changed-source/test
syntax, patch whitespace and affected link/anchor checks pass. Contemporaneous
parent, assembly, pre-test and final source bindings, exact commands/results,
reproducible patch and original-state preservation checks are retained together at:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-hold-publication-candidate-20261026-6mw7vrjs/`.
The original working tree, HEAD, index, worktrees and local changes are preserved.
No `npm test`, historical payload read or repository-wide content hash is performed
in candidate preparation. Generated success establishes no Arena CPU, actual route
availability, capture causation or gameplay benefit; the original partial/
non-displacement/refresh and release limitations below still apply.

Earlier composite-local integration checkpoint (retained, not this candidate):
starting build `2b62deda2635bc3fc58d7b3498ce5319d8a89df078f1c522bd7bdca2c9e9c6d6`,
integrated build `dc0eead71deb40cf2456a15eed3e0f06df39d6a4c53cb9417632569a019eccee`;
636+85=721 generated checks across 29 files and a 115-check focused rerun passed.
That runtime included unpublished retreat work, so its build/validation could not
identify this task-only candidate. Its preservation audit mistakenly hashed
repository-wide bytes, including historical fixture JSON; those payloads were
not parsed or used as evidence. No managed `replay_logs/` files were in that hash
scope. This disclosed exception belongs to that earlier task and is not erased
by the candidate's narrower preparation.

Exact generated-only affected selection (no glob/name filters):

```sh
node --test tests/unit/opening-hold-joint.test.js tests/unit/opening-joint-proposals.test.js tests/unit/opening-joint-integration.test.js tests/unit/opening-deployment-flow.test.js tests/unit/opening-secondary-deployment.test.js tests/unit/opening-secondary-route-provider.test.js tests/unit/opening-occupancy-routes.test.js tests/unit/opening-centre-support.test.js tests/unit/opening-centre-occupancy.test.js tests/unit/opening-support-scope.test.js tests/unit/opening-route-probe.test.js tests/unit/opening-route-adoption.test.js tests/unit/secondary-objective-selection.test.js tests/unit/secondary-objective-flow.test.js tests/unit/secondary-partial-travel.test.js tests/unit/secondary-scoped-readiness.test.js tests/unit/supported-contest-candidate.test.js tests/unit/support-locked-flow.test.js tests/unit/support-locked-engagement.test.js tests/unit/movement.test.js tests/unit/tactics.test.js tests/unit/tick-flow.test.js tests/unit/flag-allocation-flow.test.js tests/unit/adjacent-retreat-support.test.js
node --test tests/unit/opening-route-adoption-flow.test.js tests/unit/opening-route-slot-sampler.test.js tests/unit/healer-escort.test.js tests/unit/healer-escort-flow.test.js tests/unit/healer-escort-disabled-flow.test.js
```

The candidate leaves the original local work and index untouched. Its patch
contains only the 15 listed task files; unchanged dependencies and omitted assets
are not patch deletions. Older rollback copies below belong to their own
integrations and must not overwrite later work. No rollback is performed here.

The original move-only test-only evidence was promoted without a policy change to
[opening-joint-proposals.js](../../src/strategy/opening-joint-proposals.js).
The [fixture](../../tests/fixtures/opening-joint-proposals.js) is only a re-export;
the former executor/subset injection transport and its extra baseline-selection
measurement are removed. Generated hooks observe actual production calls only.

`openingJointProposalsExperiment = false` is a separate default-off authority.
It requires opening deployment. Simultaneous probe or adoption (including unknown
values instead of explicit `false`) rejects the opening configuration **before
route work**. Existing escort remains on and supported; every previous switch
value is unchanged. No diagnostic pair, replay-derived path or subset winner
is repurposed. Post-centre capture/contest remains unchanged.

Inactive starting build:
`d00712d461341148589047dc25de277284cb03dda23ed22b590a2d32669ae3ae`.
Original move-only integration build:
`138bda3534e1494e132e0c5987b47d40986ed841dcace1634347de282c86a76d`.

### Production ownership and bounds

`runTick` passes the complete current observation and **explicit** probe/adoption
values into `prepareSecondaryMovement` only for enabled, compatible opening
work. After ordinary priority, adjacency, current-support and bounded occupancy
gates, actual converging proposals invoke the helper once. Non-convergence,
disabled, non-opening and terminal paths bypass it and its terrain evaluation.
The one already-updated mission/selection, route-cache reports, original centre
identity and ordinary steps are unchanged inputs. Certificate views remain local:
no cache insertion, `searchedAt` change, coordinator rerun or second progress update.

At the original move-only promotion, the helper body, candidate/certificate
validation, unique-optimum objective, pair proofs and tie/no-solution fallback
were byte-equivalent to the frozen policy. The later shared-core refactor above
preserves those move-only decisions and bounds.
The existing subset/intersection selector runs once on the final local proposal
map. Final admitted departing destinations are reserved before **one** centre
preparation; movement executes once. Centre cancellation discards both maps
before ordinary priorities, state/logging and commands. Capture/termination
releases both groups immediately, with no post-release ownership extension.
The original move-only32/3/81/27/1 local ceilings and16-subset limit remain;
the hold-aware entry has only the separately authorized larger local ceilings
above. There are zero added searches. Normal off-cache refresh, 24/4 queries,
maxOps1000, route40, cache5, stall4 and lifetime60 are unchanged.

### Bounded diagnostic and interpretation

Only when opening and joint proposals are enabled, `secondaryObjective` contains
`jointProposal: [status, changedOriginalSlotMask]`. Resolve each set bit `i` as
`creeps[memberSlots[i]]` in the **same tick** snapshot. These are the existing
sorted diagnostic member slots, not a reordered role/ID ranking or new squad.
The mask describes changed **proposals**, not executed or displaced actors;
inspect final `travel.actors[].proposed/admitted` and action attempts separately.
Travel destinations/hold reasons are recomputed from the final local map.

| Status | Meaning |
| --- | --- |
| 0 | Not evaluated (inactive/terminal/configuration); mask null |
| 1 | No convergence; evaluation bypassed, mask 0 |
| 2 | Unique joint proposal prepared; mask 0–15 |
| 3–8 | Inputs, shape, missing proposals, missing proof, invalid proof, work bound |
| 9–11 | No full assignment, equal optima, private admission rejected |
| 12–13 | Incompatible authority, inactive helper input (defensive guards) |
| 14 | Movement preflight/centre cancellation discarded ownership; mask null |

Fallback statuses 3–13 retain original proposals and mask 0; they do not certify
new steps. Status14 does not imply the helper ran or that commands were issued.
No status persists across ticks/reset. This field costs at most26 JSON characters
including its preceding property comma. A maximal bounded final-travel projection
is1257 characters; even adding the incompatible/unused900 probe reservation
gives2157, below2700. No IDs, certificates, paths, work tables or new records are
logged. Existing snapshot/action provenance distinguishes departing and centre
movement. Long/escaped IDs cannot enlarge the slot-only field/projection.

### Production qualification and remaining limitations

The generated qualification below records the original 2026-10-19 integration
checkpoint, before the manual trial summarized in the later-review subsection.
Its statements of unknown live behavior describe that earlier checkpoint.

The new real-tick wiring regression failed before integration (two departing
commands instead of four), then passed. All48 original focused checks are
retargeted to production, preserving their assertions; non-convergence now
additionally proves no helper call, while retaining its direct zero-work check.
Thirteen wiring/boundary checks cover default-off/terrain bypass, explicit
configuration conflicts, final changed-cell centre reservations, late centre
priority cancellation after joint success, duplicate/terminal suppression,
genuine match reset, immutable state and diagnostic limits.

420 explicitly selected generated checks pass across opening/cache/centre,
shared capture/contest, probe/adoption boundaries and ordinary tick tactics.
All15 retained generated trajectories match the accepted partial-refresh artifact
after excluding only helper instrumentation, new telemetry and build identity.
The generated capture remains a supplied ownership confirmation at19, released
through24; it is not Arena capture evidence. Original congestion, no-response,
stationary-healer and partial-execution adverse stops remain. The compliant
partial case still uses eight extra refresh queries/800 fixed reported operations
versus baseline and stops at8, not5. Neither local work nor fixed generated ops
is Arena CPU. At that integration checkpoint, sustained Arena progress and
benefit remained unverified; no trial or activation had been prepared. Later
observations below do not establish alternative routes, arrival or benefit.

Focused generated-only entry points (no name filters/historical readers):

```sh
node --test tests/unit/opening-joint-proposals.test.js tests/unit/opening-joint-integration.test.js
```

The exact15-file affected command/import closure and all validation output are
retained in the integration receipt directory named below. Build generation/check,
`npm run check`, separate new-module/changed-test syntax, relative links/anchors
and whitespace checks are required. Package configuration is unchanged, so the
new module's syntax check is explicit: `node --check src/strategy/opening-joint-proposals.js`.

### Later retained trial review (2026-10-19)

The retained review of replay `6ad62e0289c156ca6ad6b987`, Odiodin v12, verifies
trial build `a1c7f13d9adafb1b4a7a25a05a5b3e10d2166702081bd542f0c4503054174ab7`.
Human coverage is ticks1–27, not the full859-tick match. Joint proposals ran at
3,9,10,11. All37 departing and119 centre requested steps reached their requested
cells in subsequent observations; functioning mission-owned support held.
Convergence holds at18–21 exhausted the original stall bound, terminating the
mission at22 without observed arrival/capture. No counterfactual baseline was
evaluated and no comparative benefit was demonstrated. Route-cache contents and
local certificates were unlogged; no alternative route availability is inferred.
Owned support checks do not promise support after release. Keep the experiment
disabled; this records existing evidence, not authorization for another trial.

Source receipt (no replay reread):
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-joint-functional-trial-20261019-RoI6tY/gameplay-review-jxFIHm/report.json`.

### Exact rollback

Before-copies, source/package/index hashes, failures and validation are under
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-joint-integration-20261019-4TDwvA/`.
Follow its `RESTORE.md`: first verify no later drift against recorded after
hashes; restore exactly config, loop, executor, opening diagnostic projection and
build from `before/`, then remove only the newly added runtime helper. That
restores the exact starting runtime/build, without regenerating or touching the
index/unrelated work. Restore test/doc copies only for a separately scoped full
task rollback. Do not apply old copies over later work. Turning the switch off
alone is a policy disable, not a byte-exact rollback; it is already off here.

## Hold-aware extension test-only (2026-10-20)

Original status: **retain test-only**, superseded by the
[hold-aware inactive integration](#hold-aware-inactive-integration-2026-10-26)
above. At this original qualification, runtime/config/build/package were unchanged at
`138bda3534e1494e132e0c5987b47d40986ed841dcace1634347de282c86a76d`.
No activation, runtime promotion or manual trial is prepared. The historical
stall motivated this slice but supplies no missing terrain, cache reports or
certified alternative. This task reads no historical evidence or replay payloads.

The original test helper (now a
[runtime re-export](../../tests/fixtures/opening-hold-joint-proposals.js)) retained
the production gates and moving-candidate predicates, adds `{kind:'hold',step:null}`
for every member, and evaluates all choices without order pruning. A source-text
guard and direct candidate comparisons detect drift of the frozen predicates.
It reuses production `localRetreatStep`, `pairSupportTable`, admission validation
and the canonical support/subset helpers. The optional proposal-policy hook in
the [existing flow transport](../../tests/fixtures/opening-joint-proposal-flow-world.js)
replaces only the existing proposal call. The planner, route/cache provider,
membership, priorities, centre preparation and single executor pass are production
code; their default path remains unchanged. No parallel planner is introduced.

Holds own the current cell and use the **unchanged actual cache report** in the
single private admission validation. They are not searched routes or fabricated
zero-length certificates. Movers retain every original known-plain, empty,
unreserved, threat-safe, strictly Chebyshev-forward same-length splice candidate.
All effective destinations (including held positions) must differ. Existing
occupancy prohibits swaps and entry into any currently occupied cell, regardless
of an intended departure. Every move/stay outcome retains functioning support.

Acceptance requires two actors sharing an original proposal to move to distinct
cells, at least one changed certified first step, and at least one armed mover.
This excludes simply choosing an old singleton winner or healer-only progress.
Minimize the original summed Manhattan goal distance, counting holds at their
current positions. Accept only a unique optimum; ties/no solution retain original
proposals and unchanged subset/intersection selection. No ID/role weights or
fairness state are added. Certificates remain local, cache timestamps and already
updated selection/progress remain unchanged. Departing destinations fence one
centre preparation; cancellation discards both maps, and termination releases
both before ordinary priority actions. Post-release movement has no added support
guarantee. No searches, retries, wait allowance or timer changes are introduced.

| Extra local work | Authorized test-only ceiling | Exercised maximum |
| --- | ---: | ---: |
| Neighbour evaluations | 32 | 32 |
| Choices/member, including hold | 4 | 4 |
| Complete assignments | 256 | 256 |
| Healer/weapon pair entries | 48 | 48 |
| Enumeration nodes, including root | 341 | 341 |
| Private admission validations | 1 | 1 |
| Following subset selector | Existing at most16 | Unchanged |
| Extra searches | 0 | 0 |

The maximum enumeration returns equal optima and correctly falls back. Separate
exhaustive checks compare all256 assignments ×16 outcomes (4096 outcomes) with
production support, including unsafe cases. No Arena CPU measurement is implied.

The [new generated-only entry point](../../tests/unit/opening-hold-joint.test.js)
contains40 checks. With the existing48 policy and13 integration checks,101 pass:

```sh
node --test tests/unit/opening-hold-joint.test.js tests/unit/opening-joint-proposals.test.js tests/unit/opening-joint-integration.test.js
```

All [response tables](../../tests/fixtures/opening-hold-joint-world.js), terrain
and subsequent observations are explicitly generated. The initial extension sends
the rear weapons to(23,18)/(23,20), while healer(25,20) and front weapon(28,20)
retain owned holds. Baseline admits no departing moves and stalls at5. With all
requested steps supplied as observed displacement, the extension has18 successive
supported weapon-progress observations,69 departing and143 centre step calls,
then stops at19 with `objective-unavailable`. It uses32 queries/3200 fixed supplied
reported ops versus baseline16/1600. The first off-cache refresh is at2; suffix
reuse preserves searchedAt2 until normal age-five refresh at7. These are route
refresh costs, not local enumeration costs or Arena CPU. The unavailable response
at the final stop remains incomplete; tables were not extended to force arrival.

Adverse results remain: bow1-only displacement stops at2 on the occupied-step
refresh's missing compliant bow2 response (20 queries/2000 supplied ops).
Bow2-only and stationary-healer continuations stop on the original stall rule
at11 (24/2400); rejected, unknown and accepted-without-displacement stop at5
(16/1600). Exact ties, unresolved singleton conflicts, one-cell final approaches,
unknown terrain, reservations, missing/invalid cache proofs and priority handoffs
retain conservative fallback/cancellation. No accepted command is counted as
observed progress. Tests also cover changed-destination centre fencing, late
centre cancellation, non-empty unchanged combat/healing traces, duplicate ticks,
deadline, reset and release through five later observations. A separately supplied
owner transition tests release only, not generated arrival or capture causation.

Receipt and bounded generated trajectories are outside the repository at
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-hold-joint-test-only-20261020-Y8xivJ/`.
The baseline-seam control run fails the new feature assertions; production never
acquires hold-aware authority. Retain this slice only as generated feasibility:
partial execution can still exhaust supplied routes or stall, and no historical
fix, Arena route availability, acceptable live CPU, capture or strategic benefit
has been established. The subsequent inactive integration above was separately authorized and removes
the frozen test-side predicate duplication; it does not establish live usefulness.

## Original test-only qualification (historical)

## Status and recommendation

Originally implemented only in [the test helper](../../tests/fixtures/opening-joint-proposals.js).
There is no runtime switch, probe/adoption composition, new runtime diagnostic,
pathfinder or cache write. The inactive runtime remains build
`d00712d461341148589047dc25de277284cb03dda23ed22b590a2d32669ae3ae`.

Original recommendation: **retain as a limited test-only slice; do not promote**
(superseded only by the inactive integration above). A continuous generated
chain demonstrates useful supported progress, not just selection. However, a
partial-execution comparison terminates earlier than baseline when occupancy
makes supplied refresh responses unavailable. Support remains safe, but the
certificate's local feasibility does not establish continued route availability.
No policy extension, alternative search, extra waiting or trial is included.

Follow-up qualification below adds one opt-in, generated tick-2 bow2 response.
It removes that particular fixture gap: the partial sequence then reaches the
original support-bounded stall at tick 8. The original incomplete case remains
unchanged. This does not establish actual Arena refresh availability or qualify
runtime promotion.

These are generated worlds, terrain, API-shaped response tables, command returns
and subsequent observations—not a reconstruction of a historical alternative,
Arena movement arbitration, actual capture, CPU cost or strategic benefit.
Earlier [ID arbitration](opening-travel-id-tie-test-only-2026-10-18.md) and
[objective-distance subset refinement](opening-progress-tie-test-only-2026-10-18.md)
remain rejected. This helper changes proposals **before** unchanged intersection
selection; it does not select one of those old subset winners.

## Seam and preconditions

The original generated transport (now removed; see the
[observation-only harness](../../tests/fixtures/opening-joint-proposal-flow-world.js))
intercepted only the executor's existing `selectSecondaryTravelSteps` dependency,
inside `prepareSecondaryMovement`. Production has already checked movement
priority, adjacent ordinary proposals, current support and complete occupancy.
The original coordinator has already updated progress/selection exactly once.
The transport copies the ephemeral proposal map; it never rewrites source,
reruns the coordinator or mutates its state/cache. It then calls the actual
production subset selector and executor. A separate baseline selection in the
harness is measurement only, not part of the proposed algorithm/work ceiling.

Scope: one unchanged three-pure-ranged/one-pure-healer departing birth squad,
active opening capture, with probe/adoption authority absent. Non-converging
travel returns the original proposals without neighbour/proof/admission work.
Missing or stale proof returns the original map, **not** authority to bypass
the parent's route, terrain, occupancy, priority or support gates.

The centre remains a separate identity and commitment. Departing destinations
are admitted/reserved first; production centre preparation then runs once.
Cancellation/release and the one movement pass remain production-owned. No
certificate or helper state persists into the next tick.

## Candidate certificate and bounded selection

For each current bounded cache report `current → p0 → p1 → … → goal`, offer p0
or a neighbour q which reconnects directly to p1. Each offered cell must be
known plain, empty now, unreserved, strictly Chebyshev-closer to the objective
and pass the existing local melee/ranged-threat guards plus capture's armed
enemy exclusion. q cannot be a suffix node. With fewer than two route cells,
only p0 is offered. Coordinates, adjacency, endpoint, age, operation count and
absence of repeated nodes (including the origin) are checked. Unknowns are not
terrain or route proofs.

Each certificate changes only the first node in a private validation view.
Length, endpoint and suffix remain identical. Its original operations field
references the original paid search; it is **not** a measured search for q.
No certificate is inserted into a cache or used as a new API result.

Enumerate complete four-member assignments, reject shared destinations, require
support for every independent move/stay outcome, and minimize summed Manhattan
distance to the goal. All actors have equal weight. Only a unique optimum is
accepted; equal optima or no complete assignment retain original proposals.
One private production admission validation checks the candidate certificate
view against the already-updated selection; any different lifecycle result
rejects it. The unchanged production subset/intersection selection follows.

For this exact single-healer shape, production `secondaryStepSupport` factors
into three healer/weapon pairs. Precompute each candidate pair with that
production predicate (it checks all four current/next corners). ANDing the
three pairs is equivalent to the full group predicate for all 16 outcomes.
This equivalence must not be generalized to multiple healers or hybrids.

| Extra local work per converging evaluation | Ceiling |
| --- | ---: |
| Neighbour terrain evaluations | 32 |
| Candidates per actor | 3 |
| Complete assignments | 81 |
| Pair support proofs | 27 |
| Private production admission validation | 1 |
| Following production subset selection | Existing maximum 16 |
| Extra searches / pathfinder operations | 0 / 0 |

The helper additionally checks at most four 40-cell reports and the existing
bounded roster. Enumeration has at most 121 partial/full recursion nodes; it
does not recursively search terrain. The first positive evaluation used 32
terrain evaluations, candidate counts `[1,2,2,2]`, eight full assignments, six
pair proofs and one private validation. Tests also exhaust all 81 assignments
and 16 outcomes using a 27-proof table containing both safe and unsafe cases.

## Cache and lifecycle consequences

Reports keep their real `searchedAt`, suffix and expiry semantics. Observing q
may be off the original searched path; the **normal** coordinator may then use
its four-query refresh. No off-cache certificate is reused as a searched route.
Other reports are not rejuvenated. Queries remain 24 acquisition / four active,
maxOps 1,000 each, routes 40, cache age five, lifetime 60, stall four.

Failed/unknown calls, return zero without displacement and partial movement are
not progress. Only supplied next observations can advance the generated world,
and only through previously admitted adjacent, empty, distinct cells. Centre
progress cannot reset the departing stall. Priorities cancel before commands;
capture, timeout and other termination release both groups without chaining.

## Generated qualification and retained adverse results

[Explicit generated entry point](../../tests/unit/opening-joint-proposals.test.js)
uses [fixed route tables](../../tests/fixtures/opening-joint-proposal-flow-world.js)
and the original production loop, membership, opening admission, cache provider,
preflight, centre support and executor. Table entries crossing a current matrix
blocker return incomplete; no detour is manufactured. Each variant follows its
own previously admitted steps under the same supplied execution rule.

The favorable full-roster chain:

- Baseline initially admits two moves; the helper admits four distinct moves.
  No weapon is farther from the goal and at least one is closer. The continuous
  chain has non-increasing weapon goal distance with useful progress every tick.
- Generated direct steps by both groups preserve support under all move/stay
  combinations. The centre gets 143 requested/supplied steps before release;
  each retained weapon makes centre progress. Scouts remain ordinary/opaque.
- Off-cache observation causes four queries at tick 2. Normal expiry costs four
  at ticks 7, 12 and 17. Acquisition costs 16 queries. Supplied reports each
  report 100 operations: 3,200 reported operations total, **not** Arena CPU or
  the helper's local work. Request matrices preserve occupancy and actor origin.
- Arrival at tick 18 is followed by a **separately supplied** flag ownership
  confirmation at tick 19. Production terminates `captured`; ticks 20–24 show
  released objective ownership, no reassignment, queries or centre evaluation.
- Baseline with the helper disabled fails that same generated capture-chain
  expectation at tick 6 (`no-displacement`). Failing-before output is retained.

Adverse comparisons are not tuned away:

| Supplied execution / ownership | Baseline | Joint helper |
| --- | --- | --- |
| All requested steps, no ownership confirmation | Stall at 6 | Arrival followed by `objective-unavailable` at 19; no inferred capture |
| Only bow1 steps supplied | Stall at 5 | `objective-unavailable` at 2: occupied peers' route responses incomplete |
| Rejected / unknown / accepted-but-stationary | Stall at 5 | Same stall at 5; recomputed proposals never reset progress |
| Departing healer never displaces | Unavailable route at 6 | Support-bounded progress, then stall at 8 |

Equal optima, no full support-safe assignment, blocked/reserved cells, unknown
terrain, repeated prefixes, stale/off-origin reports, invalid operations,
one-cell final approaches and private admission rejection retain baseline
proposals. Existing priority/support cancellation remains authoritative. Real
release traces retain non-empty ranged attacks and healing unchanged, with at
most one movement command per actor. Renaming, roster/report/proposal ordering
and mirrored non-tied routes preserve decisions. The real loop still requires
its existing first-flag centre convention; helper-level flag ordering is tested
independently with the explicit centre identity unchanged.

The old generated congestion still terminates at tick 7 in the unchanged
centre/occupancy regression. This is a separate retained adverse fixture, not a
claim that the new helper reconstructs or solves that historical geometry.

## Commands and evidence

Node with `node:module.registerHooks` support is required. Explicit generated-only
commands (no name filters, historical imports or payload reads):

```sh
node --test tests/unit/opening-joint-proposals.test.js tests/unit/opening-centre-occupancy.test.js
node --check tests/fixtures/opening-joint-proposals.js
node --check src/strategy/opening-joint-proposals.js
node --check tests/fixtures/opening-joint-proposal-flow-world.js
node --check tests/unit/opening-joint-proposals.test.js
```

Original qualification: 56 checks (47 new, nine unchanged generated centre/occupancy
checks). `PAIN_GAIN_JOINT_FORCE_BASELINE=1` originally disabled the helper
transport; it now supplies `false` for the generated fixture's joint switch.
This preserves the retained failing-before comparison. Optional
`PAIN_GAIN_JOINT_OUTPUT=<existing external directory>` retains generated complete
observations, mappings, state, commands and action-return records; no source
responses or historical evidence are read by this output option.

Receipt and intermediate/final outputs:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-joint-proposals-test-only-20261019-E0PgHI/`.
Runtime/build, package and index hashes are verified unchanged. No runtime
validation is rerun or build regenerated. Existing preservation exceptions and
unrelated coordinator/storage work are left untouched. No Arena capture,
survival, alternative historical trajectory or gameplay benefit is established.

## One compliant partial-execution refresh qualification

The follow-up changes only the generated flow fixture, one regression and this
document. The joint helper and transport, runtime, configuration, package and
Git index remain unchanged. No further response family, retry or policy change
is added. `compliantPartialRefresh` defaults false: the original incomplete case
and its retained artifacts are preserved.

With that test option true, **both** variants receive the same declared rule.
It matches only tick 2, bow2 at `(25,21)`, goal east `(44,20)`/range zero,
maxOps 1,000, and the complete declared roster/flag observation: the original
generated observation with only bow1 displaced to `(26,20)`. The declaration
includes positions, identities, existence, ownership, HP, fatigue, body parts
and flag bindings. It never tests whether the joint helper is enabled.
Baseline does not reach those inputs: its intersection holds bow1, so it makes
no tick-2 request and never uses the new response.

The single explicitly **generated API-shaped response** is:

```text
origin (25,21)
path (26,21), (27,21), (28,22) ... (43,22), (44,21), (44,20)
incomplete false; ops 100 (supplied, not measured); 20 cells
```

Every node is adjacent to its predecessor, plain in the supplied terrain,
within the 40-cell limit and outside current functioning weapon exclusion
ranges. It ends at the exact goal and avoids `(26,20)` and every matrix blocker.
The production query matrix still blocks all other living observed creeps and
permits the searching origin. The ordinary four-query refresh passes production
admission, caches bow2's complete report with `searchedAt:2`, and continues into
the original preflight, joint helper, subset selection, centre preparation and
single executor pass. No movement or ownership is inferred from this response.

The execution rule is unchanged: only previously commanded bow1 direct steps
are supplied as subsequent positions. All other actors stay despite recorded
return zero. All admitted move/stay outcomes preserve functioning support;
centre preparation runs once per active tick. Current-tick tactical execution
and at-most-one movement command remain the original production behavior.

| Observation | Conditional joint sequence |
| --- | --- |
| Tick 1 | Four admitted departing steps; only bow1 subsequently reaches `(26,20)` |
| Tick 2 | Mandatory blocked-next refresh: four queries; new complete bow2 response used once; only bow1 subsequently reaches `(27,20)` |
| Tick 3 | Four cache hits; only bow1 subsequently reaches `(28,20)` |
| Ticks 4–6 | Four cache hits each. Further bow1 step `(29,20)` cannot preserve range-three access to stationary medic `(25,20)`, so it is held. Intersection also holds the converging bow2/guardR2 contenders; medic commands do not displace |
| Tick 7 | Ordinary age-five four-query refresh, using only original response tables. `(26,20)` is now free, so original bow2 response is complete. Bow1 remains support-held; admitted peers still do not displace |
| Tick 8 | Fourth unchanged observation after the last supplied bow1 step; `no-displacement` termination and ordinary fallback commands, not physical return |

Baseline remains unchanged: no bow1 commands or supplied displacement, four
cache hits on ticks 2–4, and stall termination at tick 5. In both variants the
original start is tick 1 and the absolute deadline is tick 61; neither is
extended. No ownership confirmation or capture is supplied.

Baseline uses 16 acquisition queries / 1,600 generated reported operations.
The conditional joint sequence uses 16 + 4 + 4 queries / 2,400 generated
reported operations. Every request retains maxOps 1,000; no per-tick cap is
exceeded, no local helper work is counted as search operations, and no timing
is presented as Arena CPU. Cache suffix updates do not change search age:
reports searched at 2 stay aged from 2 through tick 6, then expire normally at 7.

Follow-up command: `node --test tests/unit/opening-joint-proposals.test.js`:
48 generated checks pass (47 existing plus one new). The nine unaffected
centre/occupancy results from the original qualification are reused, not rerun.
Syntax, affected links/whitespace and protected hashes are checked separately.
The new trajectory artifact additionally retains each selected query's origin,
goal/options, actual supplied result, origin/path matrix costs and blocker cells.
All original trajectory cases are compared with the earlier retained generated
artifact; no original response/cache or historical fixture is accessed.

Receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/opening-joint-partial-refresh-20261019-VvRNwC/report.json`.

Recommendation: **retain this conditional generated qualification, test-only**.
It distinguishes missing fixture coverage at tick 2 from the later necessary
support holds/stall under the declared stationary-healer outcomes. It proves
neither actual Arena route availability, coordinated squad arrival, capture nor
benefit; runtime promotion and trial preparation remain outside this work.
