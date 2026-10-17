# Scoped secondary readiness — test-only policy comparison (2026-10-17)

## Status and scope

The accepted comparison below is retained as historical design evidence.
Its predicate is now [integrated, inactive](secondary-scoped-readiness-integration-2026-10-17.md)
in the production [secondary-objective contract](general-strategy-secondary-objectives-2026-10-16.md).
The source-rewriting fixture has been removed; the 27 cases now exercise the
single production implementation. Earlier audits remain no-defect findings;
neither comparison nor integration reinterprets historical departures.

Original test-only comparison's pinned unchanged runtime/build:
`79790451f2c07eebd62902ffb77d5b7618fdd97ef5a9d9d93a2314a70e74e094`.
Secondary objectives and healer closing remain off; every other switch persists.

## Exact alternative

Use the existing validated observation and existing caller-supplied squad.
Define participating health scope as the union of:

1. All living departing squad members.
2. **Every** actor in production's existing retained-defence set: living
   non-members, not unavailable to this controller, within Chebyshev distance
   three of the centre.

Do not choose only two healthy defenders or redefine this set by injury, weapons
or preferred IDs. Even an unarmed or surplus actor inside that set must remain
healthy. The existing quorum still independently requires two functioning armed
defenders with functioning-healer access within three. Existing unavailable
actors are excluded by production itself, not by a new candidate rule.

Replace only the army-wide health predicate with full health of that union,
at the same location in the selector. Keep `army-injured` for relevant injuries.
Do not remove roster entries, normalize hits, restore body parts, alter utility
capacity arithmetic, change caller binding or reorder any other gates.

The original test fixture loaded a one-predicate variant of the production ES module in
memory, asserting a unique source match and exact reversibility. The shared
contest-readiness caller imported that same variant in memory. No alternate
runtime implementation, configuration switch or generated build was installed
by that comparison. Integration removes this variant rather than maintaining
two policies.

## Existing coverage reused

The existing selector suite already covers deliberate global-health rejection,
actual heal access, functioning MOVE/HEAL/weapons, controller ownership, local
threats, route admission, arrival margins, utility, ownership, timeouts, spent
state and invariance. Generated builders were extracted unchanged into
`tests/fixtures/secondary-generated-world.js`; original assertions remain.
Unchanged coordinator, combat, travel, query-budget and disabled-flow validation
is reused, not rerun as an integration or gameplay claim.

## Generated comparison

All new observations retain fourteen actors per side with the preset body
composition, seven flags, distinct occupied cells and the supplied original
squad. Generated route reports are inputs, not terrain/pathfinder execution.
No positions are advanced or combat/capture effects simulated.

| Observation | Baseline | Scoped health |
| --- | --- | --- |
| Healthy full roster | selected | identical selected result |
| One/two remote injured non-members | army-injured | selected, identical to healthy counterpart |
| Injured remote melee/ranged/healer/scout | army-injured | selected if remaining original defence qualifies |
| Any injured departing actor | army-injured | army-injured |
| Injured retained weapon/healer/unarmed actor | army-injured | army-injured |
| Remote injury plus centre/group danger | army-injured | local-combat, no assignment |
| Remote injury plus lost selected HEAL/MOVE/weapon | squad-unavailable | squad-unavailable |
| Remote injury plus inaccessible squad healing | army-injured | support-unavailable |
| Remote injury plus inadequate retained support | army-injured | defence-unavailable |
| Remote injury plus missing/unsafe/incomplete/stale route or lost arrival margin | army-injured | no-useful-objective |
| Malformed unrelated actor observation | unsupported-observation | unsupported-observation |

In the remote-injury example, the four east routes have maximum length 15.
Income gained is 3 score/tick, denied income 0, nominal own capacity loss
192 HP/tick, enemy relief 0, and unchanged utility is
`3/16 * (1 - 192/1476) = 0.16310975609756095`.
The selector's work is six candidate visits, nine route-report lookups,
58 path cells and 522 path/enemy threat checks. These are **not search-query
counts**; no path search runs in this experiment.

Neutral/enemy-owned target utility remains exactly the healthy counterpart;
already-owned flags are excluded. Active ownership change/capture, centre loss,
new relevant injury and danger finish the attempt. A previously remote injured
actor entering the unchanged defence radius becomes health-relevant next
observation. Remote injury appearing during an otherwise healthy active attempt
changes baseline cancellation to retention with the original binding/deadline.

## Support is more than positional membership

An out-of-scope injury is not automatically behaviorally uninvolved.
Two generated boundary cases put the injured non-member outside centre defence
but within range three or five of the departing healer. The real healing and
movement selectors respectively retain ranged healing/hold or injured-ally
approach. Existing whole-group capture preflight cancels
`capture-movement-priority`, before any movement command. The alternative
does not override that ownership or claim a physical departure.

The genuinely remote examples have no selected or retained healer action or
approach request to the injured actor at this observation. Future enemy movement,
healing demand, separation, displacement and terrain remain unknown.

## Verification and limitations

- 27 focused test-only checks pass, including multiple injuries, health-scope
  boundaries, meaningful capability/support failures, malformed observations,
  ownership changes, shared contest readiness, deadlines and spent state.
- Renaming, input rotation/reversal and x/y/both-axis reflections preserve
  admission/rejection, work and non-tied utility; existing deterministic
  ranking/tie rules are unchanged.
- No extra waiting, attempt, route limit, search allowance or lifecycle reset.
  Existing 24 acquisition / 4 refresh query caps remain unchanged source and
  accepted coverage; this pure comparison does not remeasure engine work.
- Existing generated selector checks passed after fixture extraction.
- Validation exception: the intended generated-only baseline-suite filter
  `^(?!reviewed )` also executed two historical-fixture callbacks and read their
  local JSON snapshots, contrary to this task's no-replay-read constraint.
  Those results are excluded from the analysis. No replay discovery or further
  replay investigation occurred. The retained receipt preserves the command
  and full result; do not claim zero replay-related file access.
- The first focused run had three wrong expectations because the generated
  moved enemy was a healer, not an armed actor. Correcting that test input to
  the existing melee actor made the intended danger cases pass. No policy
  change was made to obtain the result.

## Recommendation

The original comparison recommended retaining the alternative for a separately authorized integration
proposal. It isolates a deliberate conservative policy veto without weakening
the demonstrated gates, and independently exposes otherwise decisive failures.
It is not a production bug fix or proof of safe departure in Arena. Any future
integration must preserve the shared capture/contest readiness seam, actual
movement/healing ownership and revalidation rather than converting this pure
admission result into a travel guarantee. Do not activate or request another
match from this finding.

That authorized integration is now complete and disabled; see the linked
integration contract for current build, failing-before evidence, real-flow
support cancellation, validation and preservation. The historical results and
validation exceptions below/above are not relabelled as new integration results.

Receipt:
`/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-scoped-readiness-20261017-qERWhN/report.json`.
