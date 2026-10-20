# Architecture and evidence

This folder holds descriptions of the bot and its integrations, plus validation and replay-review records. Design descriptions explain how the project works; evidence records describe what particular tests and replays did or did not establish.

## Task router

Small mandatory core: the task's constraints, [AGENTS.md](../../AGENTS.md), this
entry and the matching table row(s), not this entire index. Then read the row's
required **sections**, followed only by dependencies whose conditions apply.
Combine overlapping rows without duplicate reads. Use the status, validation
and reuse sections below when making those decisions; examples are optional.
The [document directory](#document-directory) below is lookup material, not a
reading checklist. No routine full-directory scan or exhaustive history read is
required. Consult [decisions](../decisions/README.md#when-to-read-an-adr) and
[diagrams](../diagrams/README.md#when-to-read-a-diagram) when their triggers apply.

| Task | Required reading beyond the core | Conditional dependencies |
| --- | --- | --- |
| Documentation-only cleanup, links or index policy | Affected documents/sections and their existing index entries | ADR conventions for decision/status changes; diagram index for changed workflows. Rules/API/gameplay histories are unnecessary for prose-only changes that do not alter their contracts. |
| Runtime layout, loop wiring, configuration or build tooling | [Runtime overview](project-layout.md#project-layout), [development commands](../../README.md#development), affected feature's current contract | [ADR 0001](../decisions/0001-modular-arena-source.md) for module/import/loading boundaries; tick-flow diagram for orchestration/ownership. Also follow the gameplay row when behavior is in scope. |
| Combat, healing, retreat, escort or movement | [Game rules](../pain_and_gain_rules.md), runtime tick/priority overview in [project layout](project-layout.md#project-layout), affected policy's contract | Healing: [capacity contract](healing-capacity-selection-2026-10-10.md#contract); pressure movement: [retreat rule](pure-healer-pressure-retreat-2026-10-16.md#narrow-general-rule); melee support/rejoin: relevant follow-up in [frontline support](opening-frontline-support-2026-10-15.md). Read API action/range/timing sections and relevant Arena examples when using/changing those calls; squad and objective rows when crossing their ownership boundaries. |
| Opening deployment or shared objective travel | [Game rules](../pain_and_gain_rules.md), [opening integration](opening-deployment-integration-2026-10-17.md#input-mapping-and-ownership) ownership/admission/limits, [current shared support order](objective-travel-support-scope-integration-2026-10-18.md#one-implementation-and-validation-order); for opening routes/cache, [occupancy contract](opening-occupancy-routes-integration-2026-10-18.md#one-implementation-opening-only-boundary) and bounds | Opening centre ownership: [inactive centre integration](opening-centre-support-test-only-2026-10-17.md#current-inactive-runtime-integration). Route API use: [CostMatrix](screeps-arena-api.md#costmatrix), [searchPath](screeps-arena-api.md#searchpathorigin-goal-opts), relevant Arena examples. Membership changes: squad row. Shared capture/contest impact: post-centre row. Movement-pass/priority changes: tick-flow diagram and gameplay row. Rejected tie experiments are not runtime dependencies. |
| Post-centre objective admission, capture or contest | [Game rules](../pain_and_gain_rules.md), relevant admission/ranking/lifecycle sections of [secondary contract](general-strategy-secondary-objectives-2026-10-16.md), [scoped readiness integration](secondary-scoped-readiness-integration-2026-10-17.md), and shared support order above for travel | [Safe subsets](secondary-partial-travel-integration-2026-10-17.md) for movement; [contest contract](supported-contest-objective-2026-10-16.md) for contest/handoff; opening row only if that shared seam is affected. API/ownership prerequisites still apply. Opening admission must not substitute for post-centre checks. |
| Squad membership, pairing or engagement ownership | [Game rules](../pain_and_gain_rules.md), [squad reference](screeps-squads-and-pairing.md), [production membership](project-layout.md#isolated-squad-membership-bookkeeping) | [Pair contract](squad-pair-experiment-2026-10-02.md) or [engagement integration](support-locked-engagement-integration-2026-10-17.md) for that controller; affected movement policy/API sections and tick-flow diagram for handoffs. Consult relevant examples when developing game code, not to redefine production membership. |
| Tests, fixtures or validation-command organization | [Development commands](../../README.md#development), [validation/evidence gates below](#validation-and-evidence-gates), affected feature's validation section and selected test/import source | Follow gameplay/API/squad rows when designing changed behavioral scenarios, not merely relocating unchanged tests. Historical payload execution requires separate authority and applicable evidence lifecycle; generated-only selection must not import its readers. |
| Diagnostics, replay review or analysis | [Evidence boundaries](replay-evidence-contract.md#evidence-boundaries), relevant record/coverage sections; for analyzer work, [analysis interface](replay-analysis.md#interface-and-input-selection) | Before managed capture access, [importer/claim workflow](../../README.md#local-replay-log-importer) and AGENTS replay-review rules. Score sources add [retention contract](replay-evidence-contract.md#replay-score-source-retention). Read matched ADR/diagram routes. Task-specific resident/cache/identity limits remain binding; do not open evidence to prepare an unrelated task. |
| Retrieval, storage or local tooling | The affected command's README section and named implementation/authority contract, starting from [project layout's tooling boundary](project-layout.md#explicit-transport-and-local-replay-imports) | Use the ADR index for evidence/storage architecture; [production authority](replay-production-authority.md) and the specific synthetic authority/fixture contract only when changing that dispatch. Dated plans/qualification reports are not production activation. No discovery, hydration, migration or cleanup is implied. |
| Publication or manual trial preparation | Affected feature's current integration, validation and rollback sections; relevant README build/development instructions | Explicit task authority is required for Git writes, activation, matches or evidence reads. A trial adds its pinned checkpoint/restoration and emitted-build rules; publication adds selected-diff/exclusion review. Reading these instructions does not authorize the operation. |

### Authority and status

Original contracts remain authoritative for requirements; original reports and
receipts remain authoritative only for their recorded build, inputs and coverage.
Indexes, diagrams and task summaries route to them, not replace them. Check the
applicable status/integration section and actual source/config when those are in
scope; do not infer activation or current behavior from a filename, date, index
sentence, successful generated test or accepted ADR alone.

- **Current contract:** use its applicable amendments/integration sections. If
  descriptions disagree with source or task pins, report the conflict rather
  than silently choosing a newer-looking document or changing policy.
- **Integrated but disabled:** for example opening deployment, secondary
  objectives, engagement control and healer closing. A current integration is
  not an enabled feature or demonstrated strategic benefit. Closing's current
  contract is inside [a test-only-named document](healer-useful-closing-test-only-2026-10-17.md#current-inactive-runtime-integration).
  Opening's [current centre movement contract](opening-centre-support-test-only-2026-10-17.md#current-inactive-runtime-integration)
  likewise supersedes that document's original test-only status, not its evidence limits.
- **Test-only/rejected:** [ID arbitration](opening-travel-id-tie-test-only-2026-10-18.md),
  [pre-contact kiting](precontact-ranged-kiting-test-only-2026-10-17.md) and
  [healing allocation benchmarks](healing-joint-executable-test-only-2026-10-17.md)
  are not deployed requirements. Consult them for an explicitly scoped experiment,
  adverse precedent or rationale, not to revive them automatically.
- **Historical/superseded:** retain old observations and proposals with their
  limits. Follow promotion links to current contracts, e.g. the original
  [occupancy experiment](opening-occupancy-routes-test-only-2026-10-18.md) versus
  its [inactive integration](opening-occupancy-routes-integration-2026-10-18.md).
  An original rejected finding does not become active because it is indexed.

### Validation and evidence gates

For explicitly selected retained-response preparation/resume, use the
[replay-review entry point](replay-review-entry-point.md), not automatic cache
discovery. Its qualification is generated-only and grants no evidence access.

Read [development commands](../../README.md#development) and the affected
contract's validation section before choosing checks. Reuse accepted results
for unchanged coverage; select only checks justified by affected behavior and
task authority. Documentation-only work normally needs links/anchors, whitespace
and preservation checks, not gameplay suites or build regeneration.

For generated secondary coverage use the explicit
`npm run test:secondary:generated`, or affected generated-only files named by the
feature contract. The [generated/historical boundary](general-strategy-secondary-objectives-2026-10-16.md#generated-versus-historical-validation-entry-points)
is mandatory: verify selected entry points do not eagerly import historical
payload readers; do not rely on negative test-name filters. `npm test` includes
historical cases and is **not** generated-only. Other gameplay suites may also
read historical payloads: inspect their source/imports before selecting them.
`npm run test:secondary:historical` requires explicit historical-read authority,
and managed captures additionally require claim/examined/done lifecycle handling.
An import, test, link or index entry never bypasses evidence/residency/no-hydration
constraints. Do not open payloads just to validate these boundaries.

For authorized runtime changes, follow build generation/check and `npm run check`
requirements in the affected contract. No regeneration of unchanged runtime is
implied. Generated decisions, accepted calls, observed displacement and resolved
effects are different evidence levels; local timings are not Arena CPU.

#### Generated-only gameplay selections

Concrete gap filled by static source/import inspection (2026-10-18), **not a
new test run**. The entries below are existing scripts or explicit file lists;
no new npm commands are introduced. Use `node --test` with the named files
(paths are relative to the repository root), never a glob or name filter.
Flow files require a Node runtime supporting `node:module.registerHooks`.

| Component | Focused existing selection | Broader affected coverage, only when that seam changes |
| --- | --- | --- |
| Opening routes/cache | [opening-occupancy-routes.test.js](../../tests/unit/opening-occupancy-routes.test.js); add [opening-deployment-flow.test.js](../../tests/unit/opening-deployment-flow.test.js) for loop wiring and [opening-secondary-route-provider.test.js](../../tests/unit/opening-secondary-route-provider.test.js) for provider/validation | The existing explicit list in [occupancy integration verification](opening-occupancy-routes-integration-2026-10-18.md#generated-verification-and-limits) also covers admission, support and unchanged post-centre/scout boundaries. No command needs copying from historical seed work. |
| Opening diagnostic route probe | [opening-route-probe.test.js](../../tests/unit/opening-route-probe.test.js), [slot sampling](../../tests/unit/opening-route-slot-sampler.test.js) and opening flow above; [probe contract](opening-route-probe-2026-10-18.md) | Add game-state and generated replay-review checks for map provenance, nested evidence retention and no-source-read resume; its contract gives the explicit affected file list. This default-off diagnostic never supplies gameplay routes. |
| Opening alternative-route adoption | [adoption contract](opening-route-adoption-2026-10-19.md), [real-tick adoption](../../tests/unit/opening-route-adoption-flow.test.js) and [boundary/emission checks](../../tests/unit/opening-route-adoption.test.js), plus opening/probe rows above | Add route/cache, centre, shared travel and generated replay-review checks as listed in the contract. This separate default-off authority may commit only a strictly improving single route from the same live pair; probe-only remains observational. |
| Opening joint proposals | [Inactive contract](opening-joint-proposals-test-only-2026-10-19.md#current-inactive-runtime-integration), [frozen-policy qualification](../../tests/unit/opening-joint-proposals.test.js) and [real-tick wiring/bounds](../../tests/unit/opening-joint-integration.test.js) | Add opening route/cache, centre, shared travel and ordinary tick-flow checks when wiring changes; the integration receipt retains the explicit affected list. Probe/adoption combinations are rejected, not composed. No historical entry point is needed. |
| Opening centre movement | [opening-deployment-flow.test.js](../../tests/unit/opening-deployment-flow.test.js), [opening-centre-support.test.js](../../tests/unit/opening-centre-support.test.js), [opening-centre-occupancy.test.js](../../tests/unit/opening-centre-occupancy.test.js) | Add opening route/cache and affected priority/executor selections when those seams change. The separately named retained-centre entry point is historical and is not part of this generated selection. See [current integration](opening-centre-support-test-only-2026-10-17.md#current-inactive-runtime-integration). |
| Shared capture/contest travel | `npm run test:secondary:generated` selects the four existing selector/flow/subset/readiness files, including production capture/contest flow | Add [opening-support-scope.test.js](../../tests/unit/opening-support-scope.test.js) and opening flow for the opening caller. The existing [shared-support integration list](objective-travel-support-scope-integration-2026-10-18.md#generated-evidence-and-limitations) also covers contest and engagement consumers. The npm script alone is not all-consumer coverage. |
| Support-locked engagement | [support-locked-adapter.test.js](../../tests/unit/support-locked-adapter.test.js), [support-locked-engagement.test.js](../../tests/unit/support-locked-engagement.test.js), [support-locked-flow.test.js](../../tests/unit/support-locked-flow.test.js) | Add shared-travel coverage if support/subset helpers or executor ownership change; movement/healing selections below for affected tactical boundaries. The fixture's candidate adapter re-exports the production controller; this is not a second policy. |
| Ordinary movement/healing selection | [movement.test.js](../../tests/unit/movement.test.js), [tactics.test.js](../../tests/unit/tactics.test.js) | Add [tick-flow.test.js](../../tests/unit/tick-flow.test.js) for orchestration/action evidence; select the applicable movement-policy rows below, not every experiment by default. |
| Adjacent ranged retreat | [adjacent-retreat-support.test.js](../../tests/unit/adjacent-retreat-support.test.js), [ranged-spacing-flow.test.js](../../tests/unit/ranged-spacing-flow.test.js) | Common movement/tactics and affected objective/engagement ownership selections above. This does not execute the mixed historical ranged-spacing module. |
| Melee support pause/contact | [frontline-support-multitick.test.js](../../tests/unit/frontline-support-multitick.test.js), [melee-contact-support.test.js](../../tests/unit/melee-contact-support.test.js) | Common movement/tactics, escort or objective/engagement files when their priority interface changes. The historical frontline fixture module is separate from this selection. |
| Healer escort | [healer-escort.test.js](../../tests/unit/healer-escort.test.js), [healer-escort-flow.test.js](../../tests/unit/healer-escort-flow.test.js), [healer-escort-disabled-flow.test.js](../../tests/unit/healer-escort-disabled-flow.test.js) | Common movement/tactics and whichever objective/engagement owner can yield to escort. |
| Healer closing / pressure-priority interaction | [healer-closing.test.js](../../tests/unit/healer-closing.test.js), [healer-closing-flow.test.js](../../tests/unit/healer-closing-flow.test.js), [healer-closing-disabled-flow.test.js](../../tests/unit/healer-closing-disabled-flow.test.js) | Common movement/tactics, escort and affected objective ownership files. Flow checks include pressure-retreat precedence; they do **not** replace all pressure-retreat guard tests in the mixed module below. |

The source check follows relative imports/re-exports and source-reading adapters,
including the flow tests' computed loop URLs and inline Arena/config hook modules.
Their file reads load runtime JavaScript, not replay payloads. Generated fixture
builders/static observations stay in JavaScript; for example
`opening-support-scope-retained-input.js` contains retained **generated** inputs
and a provenance string, not a read of that external receipt. Imports of
`tools/replay-logs.js` use pure diagnostic validators: its CLI is main-module
guarded, and eager helper imports do not read evidence at initialization. Do not
equate the presence of tooling imports with a scan, or a generated-looking name
with safety. Recheck changed imports, computed targets and read sites before reuse.

**Outside these generated-only selections:** `secondary-objective-historical.test.js`
is the separately scripted historical entry point. `healing-capacity.test.js`,
`healer-pressure.test.js`, `ranged-spacing.test.js`,
`frontline-support.test.js` and `healer-useful-closing.test.js` eagerly load
historical JSON, even where later cases are generated. Read their source, not
their payloads, to check this boundary; they require separate historical-read
authority. Neither name filtering nor the full `npm test` command isolates those
generated cases. No splitting/reorganization is implied here. These lists are
focused/affected selections, not complete historical or whole-policy coverage:
in particular some pressure-retreat generated guard cases remain inseparable
from historical input in their existing entry point. Test-only centre-support
or contest-proposal cases in a broader integration list remain test-only; running
them would not activate or qualify a strategy.

### Reuse within a session

Already-read relevant sections may be reused when their content is verified
unchanged using retained text/content hashes or equivalent byte checks. A VCS
revision alone does not cover dirty/untracked files; mtime alone is insufficient.
Reassess the route and dependent assumptions when task scope or source/docs
content changes, reading changed sections and newly applicable dependencies.
Do not assume cross-session knowledge or substitute a cached summary for the
source. Full-directory rescans and rereading unchanged histories are not needed.

### Routing examples — selections only

These are preparation examples, not executed gameplay tasks or permission to
run tests/read payloads. Each starts with the small mandatory core above.

| Task description | Selected reading | Conditional additions / excluded preparation |
| --- | --- | --- |
| Change opening route/cache handling while preserving post-centre behavior | Opening ownership/admission/limits; current occupancy request/cache/bounds contract; shared support order; rules; CostMatrix/searchPath sections; relevant Arena pathfinder example | Post-centre route/lifecycle sections and runtime tick seam to preserve shared behavior; squad reference if membership/pairing is touched; diagram if orchestration changes. Use the integration's generated-only validation selection. No replay, retained seed, old ID-tie or storage history is needed. |
| Change healer target selection, without changing movement | Rules; capacity-selection Contract; API heal/rangedHeal, functioning parts, action compatibility/timing; relevant Arena example; project layout's tactical order | Pressure-retreat/support/escort and closing's current inactive sections only when movement/ownership or their shared interface is affected. Rejected joint allocation is rationale if allocation is proposed, not a production rule. Select generated files after checking imports; no historical payload is needed for preparation. |
| Clean documentation indexes and links without changing gameplay contracts | AGENTS, this router, the affected indexes/doc sections and their link targets/headings | ADR naming/status guidance or diagram companion links only if affected. No rules/API/squad reading, gameplay histories, fixtures or tests merely because the repository is a game bot. Link checking does not open evidence payloads. |

The former policy required inspecting all three documentation directories for
every task, then judging relevance; it did **not** require reading every file.
This policy replaces that open-ended discovery with AGENTS plus the router entry
and matching rows, followed by bounded-by-task sections and explicit
dependency triggers. It reduces repeated discovery and irrelevant history, not
the depth of applicable safety/API/validation reading. No timing/token saving is
measured. Missing routes and conflicting/aged descriptions still need judgment
and targeted investigation, not another automatic catalogue or retrieval service.

## Document directory

- [opening-route-probe-2026-10-18.md](opening-route-probe-2026-10-18.md) — default-off one-shot actor-level paired request diagnostic; generated-only qualification, no live route policy change.
- [opening-route-slot-sampler-test-only-2026-10-18.md](opening-route-slot-sampler-test-only-2026-10-18.md) — original role-independent sampling comparison, now promoted to the inactive probe; retained historical full eligibility remains unknown.
- [opening-route-substitution-test-only-2026-10-18.md](opening-route-substitution-test-only-2026-10-18.md) — retained one-step 1→3 comparison and test-only generated continuations; conditional supported progress, failed-execution/refresh/convergence limits, no runtime promotion.
- [opening-route-adoption-2026-10-19.md](opening-route-adoption-2026-10-19.md) — separate default-off gameplay authority over the existing one-shot pair; generated qualification and one closed strict-adoption/displacement observation, renewed convergence/no capture, bounded diagnostics and exact rollback.
- [opening-joint-proposals-test-only-2026-10-19.md](opening-joint-proposals-test-only-2026-10-19.md) — default-off runtime promotion of bounded route-backed joint proposals before unchanged subset selection; generated capture/release and partial-refresh costs retained; later bounded owned movement/support observed, convergence termination without capture, no comparative benefit established.

- [project-layout.md](project-layout.md) — source layout, tick flow, local tooling, and replay workflow.
- [replay-evidence-contract.md](replay-evidence-contract.md) — versioned membership/action diagnostic contract, coverage rules, examples, and importer requirements for ADR 0004.
- [replay-analysis.md](replay-analysis.md) — deterministic read-only analyzer interface, report semantics, merging rules, and evidence limits for ADR 0004 M4.
- [replay-import-performance-2026-10-02.md](replay-import-performance-2026-10-02.md) — measured watcher startup, compact-manifest recovery, and the link to ADR 0006's durable-storage design.
- [replay-storage-v3-m1-2026-10-03.md](replay-storage-v3-m1-2026-10-03.md) — isolated synthetic storage core, bounded interfaces, crash/concurrency checks and streaming scale gate; no production integration or migration.
- [replay-storage-v3-m2a-plan-2026-10-04.md](replay-storage-v3-m2a-plan-2026-10-04.md) — proposed first M2 slice: one-response diagnostic output through a pinned synthetic v3 fixture; interfaces, compatibility boundaries and acceptance gates, not implementation or production qualification.
- [replay-storage-v3-m2a-2026-10-04.md](replay-storage-v3-m2a-2026-10-04.md) — implementation and synthetic qualification of the shared diagnostic consumer and explicit fixture reader; measured resource gates and remaining M2 limits.
- [replay-storage-v3-m2b-plan-2026-10-04.md](replay-storage-v3-m2b-plan-2026-10-04.md) — next bounded M2 slice: fixture-only streaming v2 selection for the shared diagnostic consumer; compatibility, file lifetime and proposed resource gates, with CLI activation deferred.
- [replay-storage-v3-m2b-2026-10-04.md](replay-storage-v3-m2b-2026-10-04.md) — bounded legacy diagnostic reader implementation and synthetic qualification; native selection/serialization, pinned-file lifetime and measured full-file scanning, without CLI activation.
- [replay-storage-v3-m2c-plan-2026-10-05.md](replay-storage-v3-m2c-plan-2026-10-05.md) — reviewed fixture-only asynchronous analyzer adapter contract and fixed-selection resource recipe.
- [replay-storage-v3-m2c-2026-10-05.md](replay-storage-v3-m2c-2026-10-05.md) — M2c implementation and qualification outcomes; independent v2 oracle, pinned analysis input, preserved CLI and remaining limitations.
- [replay-storage-v3-m2d-plan-2026-10-05.md](replay-storage-v3-m2d-plan-2026-10-05.md) — reviewed fixture-only score analyzer contract, coherent presence/selection snapshot and fixed resource recipe.
- [replay-storage-v3-m2d-2026-10-05.md](replay-storage-v3-m2d-2026-10-05.md) — local M2d implementation and measured qualification status; no production dispatch or broader M2 completion.
- [replay-storage-v3-m2e-plan-2026-10-06.md](replay-storage-v3-m2e-plan-2026-10-06.md) — reviewed combined log-and-score fixture adapter contract and deterministic resource recipe.
- [replay-storage-v3-m2e-2026-10-06.md](replay-storage-v3-m2e-2026-10-06.md) — M2e implementation, oracle provenance, measured qualification and retained development failures; no production activation.
- [replay-storage-v3-m2f-plan-2026-10-06.md](replay-storage-v3-m2f-plan-2026-10-06.md) — corrected fixture-only claim/examined contract; unchanged publication dependency.
- [replay-storage-v3-m2f-2026-10-06.md](replay-storage-v3-m2f-2026-10-06.md) — checkpoint implementation, independent v2 oracle, measurements and retained qualification history.
- [replay-catalog-c1-2026-10-04.md](replay-catalog-c1-2026-10-04.md) — isolated synthetic metadata catalog qualification: evidence provenance, analysis runs, immutable conclusion revisions, reviews and bounded resource gates; not production-integrated or migration-qualified. Contract: [ADR 0006 catalog C1](../decisions/0006-replay-storage-v3.md#separate-synthetic-milestone-c1-catalog-metadata-foundation).
- [replay-validation-2026-09-30.md](replay-validation-2026-09-30.md) — retained current-build replay, deterministic report, CPU/size measurements, and remaining limits that close ADR 0004 M5.
- [replay-score-production-validation-2026-10-02.md](replay-score-production-validation-2026-10-02.md) — exact retained-source selection, production scoring compatibility results, bounded output verification, and standalone reproduction procedure for ADR 0005.
- [screeps-arena-api.md](screeps-arena-api.md) — game API reference for objects, actions, and pathfinding.
- [screeps-squads-and-pairing.md](screeps-squads-and-pairing.md) — reference material for squad and pairing behavior.
- [supported-contest-objective-2026-10-16.md](supported-contest-objective-2026-10-16.md) — isolated-occupant stand-off design, subsequent inactive integration, shared validated travel and limited live observations.
- [squad-pair-experiment-2026-10-02.md](squad-pair-experiment-2026-10-02.md) — disabled one-pair movement policy, precedence, bounded recovery, local validation, and limited live opening screen.
- [combat-positioning-validation.md](combat-positioning-validation.md) — build-specific movement, healer, and flag-allocation validation, including unresolved live-evidence limits.
- [pure-healer-pressure-retreat-2026-10-16.md](pure-healer-pressure-retreat-2026-10-16.md) — bounded healer escape preserving useful healing bands; recorded exposure, generated checks and no survival claim.
- [healer-useful-closing-test-only-2026-10-17.md](healer-useful-closing-test-only-2026-10-17.md) — default-off runtime integration of the tested range-two close; prospective healing, convergence limits, movement priority and exact rollback contract.
- [adjacent-ranged-retreat-support-audit-2026-10-17.md](adjacent-ranged-retreat-support-audit-2026-10-17.md) — support-preserving adjacent escape preference with the original emergency fallback; frozen build awaiting manual observation.
- [precontact-ranged-kiting-test-only-2026-10-17.md](precontact-ranged-kiting-test-only-2026-10-17.md) — rejected test-only range-two proposal and retained support-loss/cycling counterexamples.
- [secondary-scoped-readiness-test-only-2026-10-17.md](secondary-scoped-readiness-test-only-2026-10-17.md) — retained original generated health-scope comparison and limitations.
- [secondary-scoped-readiness-integration-2026-10-17.md](secondary-scoped-readiness-integration-2026-10-17.md) — inactive promotion of the scoped health veto, with real-flow support cancellation and unchanged defence membership.
- [secondary-partial-travel-test-only-2026-10-17.md](secondary-partial-travel-test-only-2026-10-17.md) — retained original bounded16-subset generated comparison and adverse outcomes.
- [secondary-partial-travel-integration-2026-10-17.md](secondary-partial-travel-integration-2026-10-17.md) — inactive shared capture/contest subset selector, bounded step diagnostics, real-flow regressions and rollback.
- [opening-centre-support-test-only-2026-10-17.md](opening-centre-support-test-only-2026-10-17.md) — bounded test-only ordinary centre steps during an opening split; all-outcome support, priority handoffs and retained congestion limitations.
- [opening-secondary-deployment-test-only-2026-10-17.md](opening-secondary-deployment-test-only-2026-10-17.md) — original generated opening allocation/provider comparison and retained local-only seeded findings.
- [opening-deployment-integration-2026-10-17.md](opening-deployment-integration-2026-10-17.md) — inactive integration and bounded earlier live partial departure, with centre-support cancellation and no capture claim.
- [opening-travel-id-tie-test-only-2026-10-18.md](opening-travel-id-tie-test-only-2026-10-18.md) — rejected ID-only maximum-subset comparison; exact generated tie/occupancy cause, temporary progress and retained healer-denial cancellation.
- [opening-progress-tie-test-only-2026-10-18.md](opening-progress-tie-test-only-2026-10-18.md) — retained convergence reconstruction and test-only objective-distance refinement; limited generated progress, remaining ties/starvation, no runtime integration recommendation.
- [opening-shared-cell-requests-test-only-2026-10-18.md](opening-shared-cell-requests-test-only-2026-10-18.md) — test-only symmetric matrix exclusions at one naturally due refresh; supplied supported detours and retained incomplete/convergence/stall failures, not actual Arena route availability.
- [opening-travel-support-scope-test-only-2026-10-18.md](opening-travel-support-scope-test-only-2026-10-18.md) — test-only admitted-subset support validation; current-support fencing, preserved intersection ties and retained seeded stall.
- [objective-travel-support-scope-integration-2026-10-18.md](objective-travel-support-scope-integration-2026-10-18.md) — inactive shared opening/capture/contest promotion, supported-subset fast path, unchanged ties/bounds and rollback.
- [opening-support-publication-2026-10-18.md](opening-support-publication-2026-10-18.md) — publication scope, generated/live evidence boundary and preserved local exclusions.
- [development-publication-2026-10-17.md](development-publication-2026-10-17.md) — publication scope, reused validation, excluded local work and unchanged frozen gameplay identity.
- [scout-hold-experiment-2026-10-02.md](scout-hold-experiment-2026-10-02.md) — disabled-default scout fallback holding policy, local checks, live charcock screening, and remaining release gap.
- [historical-evidence-cycle-2026-10-02.md](historical-evidence-cycle-2026-10-02.md) — bounded cached cross-match index and no-change escort decision.
- [replay-review-2026-09-27.md](replay-review-2026-09-27.md) — dated analysis of map-linked replay snapshots and strategy proposals, with coverage caveats.

Update the relevant design document when implementation changes. Keep validation records tied to their builds, replays, and observed coverage; distinguish observations from inferred behavior and retain unresolved limitations. Record decisions in [decisions](../decisions/README.md) and update related [diagrams](../diagrams/README.md) when their workflows change.
