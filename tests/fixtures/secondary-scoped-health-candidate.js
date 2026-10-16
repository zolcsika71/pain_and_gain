import assert from 'node:assert/strict';
import fs from 'node:fs';

// Test-only production-source variant: change exactly one predicate, without
// normalizing HP, removing actors, changing membership or duplicating ranking.
export const baselineHealthGate = "    if (friends.some(c => c.hits !== c.hitsMax)) return stop('army-injured');";
export const scopedHealthGate = "    if (friends.some(c => (ids.includes(c.id) || !unavailableIds.includes(c.id) && distance(c, centre) <= limits.defenderRange) && c.hits !== c.hitsMax)) return stop('army-injured');";
export const productionSource = fs.readFileSync(new URL('../../src/strategy/objectives.js', import.meta.url), 'utf8');
assert.equal(productionSource.split(baselineHealthGate).length, 2, 'production health gate must match exactly once');
export const candidateSource = productionSource.replace(baselineHealthGate, scopedHealthGate);
const candidateURL = `data:text/javascript;base64,${Buffer.from(candidateSource).toString('base64')}`;
export const { selectSecondaryObjective: scopedSelect, secondaryObjectiveLimits: scopedLimits } = await import(candidateURL);

// Exercise the existing shared readiness caller with that same variant only.
const contestSource = fs.readFileSync(new URL('../../src/strategy/supported-contest.js', import.meta.url), 'utf8');
assert.equal(contestSource.split("'./objectives.js'").length, 2);
export const { contestReadiness: scopedContestReadiness } = await import(`data:text/javascript;base64,${Buffer.from(
    contestSource.replace("'./objectives.js'", JSON.stringify(candidateURL))).toString('base64')}`);
