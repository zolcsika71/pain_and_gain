# Secondary objective readiness audit — 2026-10-16

Decision: **no runtime change**. Three retained acquisition polls from verified
match `6ad252c5abefcb1649c8ed4e` versus Vincent Kocher demonstrate independent
danger, support and capability failures. No otherwise contract-compliant
departure was incorrectly rejected in these observations. The explicit
army-wide full-health requirement remains the
[accepted contract](general-strategy-secondary-objectives-2026-10-16.md#pure-contract-and-eligibility).
No scoring benefit, safe departure, capture or return is established.

## Evidence and bounds

Reuse the already verified enabled build
`440478537d5b49a1b1fc5860d0ebebac5371bb6d5207a4f1242886fd8de87a7b`
and its pinned resident projection. No native discovery, cache reads, hydration,
restoration or new match is needed. The disabled runtime is retained unchanged.

Only ticks **42, 52 and 72** receive per-squad predicate reconstruction. Tick42
is the first centre-owned poll. Tick52 is the last acquisition in the strongest
later retained healing window: the previous complete review shows three
functioning centre healers through52, two through56, one through66, and none
from67. Thus52 tests the favorable later support window before attrition;
it is not a claim of globally optimal departure timing. Tick72 is the first
poll after all functioning healing was lost at67.

Initial squad bindings are emitted, not regenerated: A contains healer1 and
melee2/3/4; B contains healer2, melee1 and ranged1/2; C contains healer3 and
ranged3/4/5. Names abbreviate the `pg_player1_` IDs. Baseline plus emitted
membership transitions reconstruct participation, capability and immediate
mobility at those polls. Snapshot positions, fatigue, HP and functioning-part
counts determine the remaining predicates. Missing actors remain missing;
membership absence is not relabelled as an observed death.

The complete prior diagnostic review has no escort assignment/diagnostics;
scout allocation and pairing were off. No controller exclusions apply at these
polls. The original runtime/API evidence and source provenance remain unchanged.

## Per-squad predicates

M = membership participation, functioning original role and immediate mobility.
H = selected squad full health (the independent army-health gate fails in every
row). S = functioning squad weapon/healer plus range3 access for every weapon.
D = retained supported weapons, excluding the departing squad; two are required,
each within centre range3 and range3 of a retained functioning healer.
Threats count armed enemies within centre range5; every row fails local safety.
These downstream predicates are independently inspected even when short-circuited.

| Poll | Squad | M | H | S | D | Centre threats | Actual first filter/reason | With only army-health check bypassed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 42 | A | pass | fail | fail: ranges3/4/5 | 5 | 9 | army-injured | support-unavailable |
| 42 | B | pass | pass | fail: melee1 range4 | 5 | 9 | army-injured | support-unavailable |
| 42 | C | pass | fail | pass: ranges1/2/3 | 3 | 9 | army-injured | local-combat |
| 52 | A | fail | fail | fail: no weapon | 5 | 6 | membership filter | squad-unavailable |
| 52 | B | pass | fail | fail: melee1 range4 | 2 | 6 | army-injured | support-unavailable |
| 52 | C | pass | fail | fail: ranged5 range4 | 3 | 6 | army-injured | support-unavailable |
| 72 | A | fail | fail | fail: no healer/weapon | 0 | 4 | membership filter | squad-unavailable |
| 72 | B | fail | fail | fail: no healer | 0 | 4 | membership filter | squad-unavailable |
| 72 | C | fail | fail | fail: no healer | 0 | 4 | membership filter | squad-unavailable |

The last column is a labelled diagnostic counterfactual: set only HP scalars to
`hitsMax` on detached copies, keeping recorded positions, functioning counts,
fatigue, membership, enemies and controller exclusions. Invoke the unchanged
pure selector with empty routes. This isolates masking by the health predicate;
it does not simulate healing, reconstruct missing original parts, invent a
route or demonstrate a selection. The actual coordinator first excludes rows
that fail M, so their pure-selector result is informative rather than an emitted
per-squad runtime diagnostic.

## Readiness, defence and unrelated injuries

At42 B is full health, and its injuries are elsewhere. Nevertheless melee1
(51,47) is four tiles from its own healer2 (47,45). That healer cannot heal it
from the observed position; being healthy does not establish support access.
All three B weapons and healer have their original functioning counts and zero
fatigue, so neither body loss nor mobility is the hidden reason there. Nine
armed opponents are also close to centre. A has only1/7/8 functioning ATTACK
parts on its three weapons and its latter two weapons are beyond healer1's
range3. C has functioning healing access, but ranged4 is injured and local
combat still independently blocks it.

At52 A has missing melee2/3 and a weaponless melee4 with5 MOVE, fatigue6: its
original squad cannot participate. B's melee1 has3 functioning ATTACK and8 MOVE,
but remains four tiles from healer2. C's healer3 is only3 HP short of full with
all6 HEAL functioning; even overlooking that small injury would leave ranged5
four tiles away and six armed threats near centre. C's retained defence has
three supported weapons; B's has two. Their support and danger failures are
therefore distinct from their defence counts. A retained healer1 has only1
HEAL part: a functioning healer is not evidence of combat-sufficient capacity.

At72 every original healer is missing. B's melee1/ranged1 retain MOVE but no
functioning weapon; C still has three weapons with6/5/6 functioning ranged
parts, but zero healing. Mobility or residual weapon capacity cannot replace
lost healing. There is no retained healing for centre defence either.

Unrelated-to-squad injuries need not be unrelated to defence. For example,
at42 healer1 and melee2 are outside C but among its retained defence actors.
The full external predicate receipt records selected injuries, all other injured
IDs, defender/healer sets, exact ranges, functioning counts and nominal healing
at each observed range. Nominal healing is not reserved or compared to future
damage, and no path/accessibility or survival prediction is made.

Narrowing army health to selected-squad health would change the explicit
contract. No examined departure becomes safe/ready merely by doing so. This
audit therefore leaves readiness policy, objective ranking, routing caps,
one-attempt lifecycle, tactical behavior and all switches unchanged.

## Verification and retained findings

Two added selector guard checks cover injuries outside both squad and defence,
meaningful selected impairment, lost weapons/HEAL, fatigue, support distance,
retained healing loss and threatened centre, including order and actor-ID
transformations. Existing selector and real tick-flow checks cover ranking,
route/lifecycle bounds and disabled equivalence. All **38 tests** passed on the
resident Node24.19.0 runtime with
`node --test tests/unit/secondary-objective-selection.test.js tests/unit/secondary-objective-flow.test.js`.
Final diff/preservation findings are retained in the external receipt below.
No runtime file changed, so build regeneration and `npm run check` were not run.

[Predicate details and reconstruction](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-readiness-audit-20261016-CnEeZW/per-squad-predicates.json).
[Task receipt](/Users/zoltanka/.local/share/pain-and-gain-evidence/secondary-readiness-audit-20261016-CnEeZW/report.json).
