# Capacity-aware healing selection — 2026-10-10

Status: local implementation and offline regression; not uploaded or live-validated.

## Contract

Only living owned actors with functioning HEAL parts select healing. Eligible
targets are living, injured owned creeps within Chebyshev range 3, with self
included exactly once. Count only HEAL parts whose `hits > 0`.

For each candidate:

- Nominal capacity = functioning HEAL count × 12 at range 0–1, × 4 at range 2–3.
- Score = `min(target.hitsMax - target.hits, nominal capacity)`.
- Rank by descending score, ascending range, then lexicographically smallest ID.
- Use `heal` at range 0–1 and `rangedHeal` at range 2–3; otherwise no action.

The power constants are documented in `screeps-arena-api.md`. They are local
nominal ranking constants in the pure selector, not predicted engine healing;
flag modifiers are not incorporated in this nominal policy. Self has no special
priority except winning a same-score range tie. There is no secondary deficit
ranking, role preference, reservation, threat prediction or cross-tick state.
The selector does not mutate inputs. Existing selected/no-action diagnostics
remain, with `ineligible-healer` for a non-owned or non-living actor.

Only `src/tactics/healing.js` changes gameplay selection. Movement, combat
selectors and `src/arena/execute.js` are unchanged. The executor issues healing
before selecting compatible combat actions: `heal` permits ranged attack but
excludes melee; `rangedHeal` excludes both. Mixed-body attack neutrality is not
claimed outside the recorded fixture.

## Historical input and regression

Match `6abfdb69d1c856c9d27fd538`, own player1 (bushdoctor2008), opponent MBFishhh v14.
Verified historical source revision:
`52dba8bb8216afad12615f1a2098a0dfba7733b3`.
Historical build:
`fced5aed1e43b9c264cf3fbb7f437dfd4cf28d9175d4a6cd69b468ce57187933`.
Managed response fingerprint:
`af3e095e7962cf29fd5810fd1ae0b96a999a64965b5eff9297c13dcb9fe85f7d`.
Original JSONL output fingerprint:
`1445f2969c0ffda35cf5e872d37de6aa3444ef05c981f6068c86c6853c08b3f2`.

`tests/fixtures/healing-window36-45.json` retains the ten complete recorded
pre-action rosters and provenance. `healing-window36-45-baseline.json` separately
retains original action diagnostic wrappers, including raw strings and source
keys. Do not regenerate historical expectations from candidate behavior.
Baseline identity is not the new candidate's build ID.

`tests/unit/healing-capacity.test.js` specifies all 30 healer decisions explicitly,
including nine no-actions. Fixtures retain functioning-part counts; the mock
body's positive values are eligibility sentinels, not reconstructed per-part HP.
No mock action advances HP, body parts or positions. Snapshots are independent
for healing; snapshot 46 is not used as a counterfactual oracle.

The unchanged movement path reproduces 128 recorded decisions and 83 movement
calls; combat reproduces 38 attack calls. The fixture has no escort movement;
allocation, holding and pairing were disabled. Movement engagement bookkeeping
starts at the first engagement (36) and is retained within this bounded trace.
Healing does not depend on that bookkeeping. Historical healing decisions were
verified against the baseline before implementation, including attempts 43:44,
43:47 and 43:50. Their successful returns establish scheduling, not healing amounts.

At tick 43 the candidate selects healer_1 → melee_3 (`rangedHeal`), healer_2 →
melee_1 (`rangedHeal`), healer_3 → ranged_4 (`heal`). This replaces the baseline's
two selections of healer_3, missing 2 HP, plus healer_2's 2-HP self-heal.

For team estimates, sum all nominal capacities selected for each target, then
cap once by that target's pre-action deficit. Never sum individual scores as
team benefit. Baseline nominal/useful/excess totals are 1176/548/628; candidate
totals are 936/792/144 across these independent snapshots. Candidate useful
estimates by tick 36–45 are 0, 0, 24, 84, 102, 102, 120, 120, 120, 120.
All three healers have six functioning HEAL parts and healing-reduction flags
are neutral here. Duplicate selections still produce excess at ticks 39 and 41;
this is not a general anti-overheal or team-optimization policy. No observed
healing, restored body parts, prevented damage, survival or outcome is inferred.

## Validation scope

The new regression was first run against the unchanged baseline and failed at
ticks 39–43 and the new actor/self-selection assertions. Existing ordinary
tactics test assertions remain unchanged; two titles now describe capped-score
semantics rather than unconditional self priority. Frozen storage expectations,
historical evidence and baseline tags are not edited.

Run the focused healing/execution tests, relevant runtime tests and
`npm run check`. Regenerate the candidate build ID with
`npm run build-id:generate` after runtime edits, then verify it with
`npm run build-id:check`. These commands do not attest to Arena deployment.
The full `npm test` includes paused storage/qualification work and is excluded
from this task. Arrival hold remains parked; M2h remains unstaged/unqualified;
storage diagnostics remain paused.

### Local completion receipt

Candidate source build (not deployed):
`2482a48b279c6b43b7dab748a3ea6d2599fbfc54a6b91f46cdc481fa7e09f903`.
`npm run build-id:generate`, `npm run build-id:check` and `npm run check` passed.
The following explicit suite passed 77 tests, with no failures or skips:

```sh
node --max-old-space-size=4096 --test \
  tests/unit/healing-capacity.test.js tests/unit/tactics.test.js \
  tests/unit/tick-flow.test.js tests/unit/current-behavior.test.js \
  tests/unit/build-id.test.js tests/unit/game-state.test.js \
  tests/unit/replay-evidence.test.js tests/unit/movement.test.js \
  tests/unit/healer-escort.test.js tests/unit/healer-escort-flow.test.js \
  tests/unit/healer-escort-disabled-flow.test.js
```

Before the selector edit, the initial new suite had 9 passing and 8 failing
tests (including recorded ticks 39–43), demonstrating the intended regression.
One additional deduplication/immutability boundary test was then added and passed
with the implementation. Historical fixtures and existing ordinary assertions
were not changed to make the candidate pass. These are offline checks only.

### Preservation exception

The implementation task was **not fully no-hydration compliant**: its final Git
diff review inadvertently hydrated
`.git/objects/82/33017b99ca850635f943d51cb8deec362431aa`, the historical
project-layout blob. Before/after metadata showed allocated blocks changing from
0 to 24 and the dataless flag clearing. No reversal or cleanup was attempted.
`.idea/workspace.xml` also changed during that task; Codex reported not editing
it. This IDE change is excluded from the healing candidate. The exception does
not establish deployment or live benefit; the testing limits above still apply.
