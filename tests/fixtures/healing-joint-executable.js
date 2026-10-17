// Test-only executor adapter. No runtime importer, persistent tick state or retry.
import { selectHealingDecision } from '../../src/tactics/healing.js';
import { prepareJointHealingOracle } from './healing-joint-oracle.js';
import { runHealingTick } from './healing-intent-ledger-candidate.js';

const none = actorId => ({ actorId, targetId: null, method: null, nominal: 0, planned: 0 });

export async function runJointHealingTick(world, { order = world?.friends, movement = false } = {}) {
    const problem = prepareJointHealingOracle(world, { executionOrder: order });
    // Invalid/duplicate observations are not executable fixtures. Never silently
    // deduplicate actors or issue a second healing action to repair bad input.
    if (!problem.supported) return { executed: false, reason: problem.reason, calls: [], solves: [] };
    const byId = new Map(world.friends.map(c => [c.id, c]));
    const baseline = new Map(problem.baseline.actions.map(a => [a.actorId, a]));
    const healers = new Set(problem.healerIds), completed = new Map(), selected = new Map();
    const solves = [], limitations = [], solvedCounts = new Set();
    let plan = null, dirty = true, fallback = false;
    const adapter = {
        select(actor, injured) {
            if (completed.has(actor.id)) throw Error('Actor cannot act twice');
            const ordinary = selectHealingDecision(actor, injured);
            if (healers.has(actor.id) && dirty) {
                const count = problem.healerIds.filter(id => !completed.has(id)).length;
                if (solvedCounts.has(count)) throw Error('Repeated solve count');
                solvedCounts.add(count);
                const start = performance.now(), result = problem.solve(completed);
                solves.push({ remainingHealers: count, elapsedMs: performance.now() - start, ...result });
                plan = result.constrained; fallback = !plan; dirty = false;
                if (fallback) limitations.push({ reason: result.reason, beforeActor: actor.id,
                    exposureFloor: { ...problem.exposureFloor } });
            }
            const chosen = healers.has(actor.id) && !fallback ? plan.actions.find(a => a.actorId === actor.id)
                : baseline.get(actor.id);
            selected.set(actor.id, chosen);
            completed.set(actor.id, none(actor.id)); // Includes a planned no-action.
            if (!healers.has(actor.id) || fallback) return ordinary;
            return { outcome: chosen.method ? 'selected' : 'no-action', reason: 'test-joint-healing',
                action: chosen.method ? { method: chosen.method, target: byId.get(chosen.targetId) } : null };
        },
        record(actorId, method, targetId, rc) {
            if (!['heal', 'rangedHeal'].includes(method)) return;
            const action = selected.get(actorId);
            if (!action || action.method !== method || action.targetId !== targetId) throw Error('Unexpected healing callback');
            if (typeof rc === 'number' && rc === 0) completed.set(actorId, action);
            else dirty = true; // Only still-unacted healers can participate next.
        },
    };
    const result = await runHealingTick(world, { order, movement, adapter });
    const accepted = problem.evaluate(order.map(c => completed.get(c.id)));
    const shortfalls = accepted.targets.filter(t => t.nominal < (problem.exposureFloor[t.targetId] ?? 0))
        .map(t => ({ targetId: t.targetId, floor: problem.exposureFloor[t.targetId], acceptedNominal: t.nominal }));
    return { ...result, executed: true, baseline: problem.baseline, solves, limitations,
        accepted, exposureFloor: problem.exposureFloor, shortfalls,
        work: { solves: solves.length, assignments: solves.reduce((n, s) => n + s.work.assignments, 0),
            searches: 0 }, resolved: null };
}
