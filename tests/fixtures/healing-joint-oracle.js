// Test-only exhaustive upper bound for the current observation, NOT an executor.
import { selectHealingDecision } from '../../src/tactics/healing.js';
import { hasFunctioningPart } from '../../src/tactics/body.js';
import { createHealingLedger, knownHealingActor, pureHealer } from './healing-intent-ledger-candidate.js';

export const healingOracleLimits = Object.freeze({ healers: 3, targets: 14, assignments: 3375 });
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const noAction = actorId => ({ actorId, targetId: null, method: null, nominal: 0, planned: 0 });
const sameAction = (a, b) => a.targetId === b.targetId && a.method === b.method;

export function prepareJointHealingOracle(w, { executionOrder = w?.friends, targets = w?.friends } = {}) {
    const work = { eligibilityProbes: 0, assignments: 0, exposureFeasible: 0, searches: 0 };
    const reject = reason => ({ supported: false, reason, work, baseline: null,
        unconstrained: null, constrained: null, accepted: null, resolved: null });
    if (!w || !Number.isInteger(w.tick) || w.tick < 1 || w.tick > 2000 ||
        !Array.isArray(w.friends) || w.friends.length > 14 || !Array.isArray(w.enemies) || w.enemies.length > 14 ||
        !Array.isArray(w.creeps) || w.creeps.length !== w.friends.length + w.enemies.length ||
        !w.friends.every(c => knownHealingActor(c)) || !w.enemies.every(c => knownHealingActor(c, false)) ||
        w.friends.some(c => hasFunctioningPart(c, 'heal') &&
            (typeof c.heal !== 'function' || typeof c.rangedHeal !== 'function')) ||
        ![...w.friends, ...w.enemies].every(c => w.creeps.includes(c) && Number.isFinite(c.fatigue) && c.fatigue >= 0) ||
        new Set(w.creeps.map(c => c?.id)).size !== w.creeps.length ||
        new Set(w.creeps.filter(c => c.hits > 0).map(c => `${c.x},${c.y}`)).size !== w.creeps.filter(c => c.hits > 0).length ||
        !Array.isArray(executionOrder) || executionOrder.length !== w.friends.length ||
        new Set(executionOrder).size !== executionOrder.length || executionOrder.some(c => !w.friends.includes(c)) ||
        !Array.isArray(targets) || targets.length !== w.friends.length || new Set(targets).size !== targets.length ||
        targets.some(c => !w.friends.includes(c))) return reject('unsupported-observation');
    const model = createHealingLedger(w.friends, executionOrder, w.flags);
    if (!model.supported) return reject('unsupported-capacity-model');
    const healers = w.friends.filter(pureHealer).sort(byId);
    if (healers.length > 3) return reject('healer-limit'); // Never silently select a preferred subset.
    const orderedTargets = [...targets].sort(byId), injured = orderedTargets.filter(c => c.hits > 0 && c.hits < c.hitsMax);
    const describe = (actor, action) => {
        if (!action) return noAction(actor.id);
        if (!w.friends.includes(action.target)) throw Error('Unobserved healing target');
        const planned = model.capacity(actor, action.target, action.method);
        if (planned === null) throw Error('Unsupported capacity');
        return { actorId: actor.id, targetId: action.target.id, method: action.method,
            nominal: planned / model.modifier, planned };
    };
    let baselineActions, options;
    try {
        // Independent production baseline: no altered actor order or observations.
        baselineActions = executionOrder.map(c => describe(c, selectHealingDecision(c, injured).action));
        options = healers.map(h => [noAction(h.id), ...injured.flatMap(t => {
            work.eligibilityProbes++;
            // Probe ONE candidate with the production selector. Hide only the
            // implicit self candidate for a non-self probe, so self preference
            // cannot erase another legal option. No observed health is mutated.
            const actor = t === h ? h : { ...h, hitsMax: h.hits };
            const d = selectHealingDecision(actor, t === h ? [] : [t]);
            if (!d.action) return [];
            if (d.action.target !== t) throw Error('Probe did not select its observed target');
            return [describe(h, d.action)];
        })]);
    } catch { return reject('unsupported-selector-observation'); }
    const combinations = options.reduce((n, list) => n * list.length, 1);
    if (combinations > healingOracleLimits.assignments) return reject('assignment-limit');
    const exposed = new Set(orderedTargets.filter(c => c.hits > 0 && w.enemies.some(e => e.hits > 0 &&
        (hasFunctioningPart(e, 'attack') && range(c, e) <= 1 ||
        hasFunctioningPart(e, 'ranged_attack') && range(c, e) <= 3))).map(c => c.id));
    const evaluate = actions => {
        const totals = new Map(orderedTargets.map(c => [c.id, { nominal: 0, planned: 0 }]));
        for (const a of actions) if (a.targetId !== null) {
            const total = totals.get(a.targetId); total.nominal += a.nominal; total.planned += a.planned;
        }
        const records = orderedTargets.map(c => ({ targetId: c.id, deficit: c.hitsMax - c.hits,
            ...totals.get(c.id), capped: Math.min(c.hitsMax - c.hits, totals.get(c.id).planned), exposed: exposed.has(c.id) }));
        return { total: records.reduce((n, r) => n + r.capped, 0), targets: records, actions };
    };
    const baseline = evaluate(baselineActions), baselineByActor = new Map(baselineActions.map(a => [a.actorId, a]));
    const floor = new Map(baseline.targets.filter(t => t.exposed).map(t => [t.targetId, t.nominal]));
    // Residual solves reuse exactly these options, capacities and ORIGINAL floors.
    // Completed actions contain only known accepted capacity (or no-action).
    function solve(completed = new Map()) {
        const solveWork = { ...work, assignments: 0, exposureFeasible: 0 };
        const remaining = healers.filter(h => !completed.has(h.id));
        const remainingOptions = remaining.map(h => options[healers.indexOf(h)]);
        const fixed = baselineActions.filter(a => !healers.some(h => h.id === a.actorId) || completed.has(a.actorId))
            .map(a => completed.get(a.actorId) ?? a);
        let unconstrained = null, constrained = null;
        const tie = (plan, best) => {
            if (!best || plan.total > best.total) return true;
            if (plan.total < best.total) return false;
            // Deterministic witnesses, not another strategic objective: retain more
            // baseline actions, then canonical actor/target IDs. Never reorder calls.
            if (plan.changed !== best.changed) return plan.changed < best.changed;
            return plan.key < best.key;
        };
        function visit(index, chosen) {
            if (index < remainingOptions.length) {
                for (const option of remainingOptions[index]) visit(index + 1, [...chosen, option]);
                return;
            }
            solveWork.assignments++;
            const choices = new Map([...fixed, ...chosen].map(a => [a.actorId, a]));
            const plan = evaluate(executionOrder.map(c => choices.get(c.id)));
            plan.changed = plan.actions.filter(a => !sameAction(a, baselineByActor.get(a.actorId))).length;
            plan.key = JSON.stringify([...plan.actions].sort((a, b) => a.actorId < b.actorId ? -1 : 1)
                .map(a => [a.actorId, a.targetId, a.method]));
            if (tie(plan, unconstrained)) unconstrained = plan;
            if (plan.targets.some(t => t.nominal < (floor.get(t.targetId) ?? 0))) return;
            solveWork.exposureFeasible++;
            if (tie(plan, constrained)) constrained = plan;
        }
        visit(0, []);
        // Before execution the baseline is always feasible. Failed completed
        // calls can make residual floors infeasible, never permission to relax them.
        if (!completed.size && (!constrained || constrained.total < baseline.total)) throw Error('Baseline feasibility was lost');
        const clean = p => { if (!p) return null; const { key, ...rest } = p; return rest; };
        return { supported: true, reason: constrained ? 'planned-only' : 'remaining-floors-infeasible', modifier: model.modifier, work: solveWork,
            combinations: remainingOptions.reduce((n, list) => n * list.length, 1), healerIds: remaining.map(h => h.id), exposedIds: [...exposed].sort(),
            exposureFloor: Object.fromEntries(floor), baseline, unconstrained: clean(unconstrained),
            constrained: clean(constrained), accepted: null, resolved: null };
    }
    return { supported: true, solve, evaluate, baseline, healerIds: healers.map(h => h.id),
        exposureFloor: Object.fromEntries(floor) };
}

export function jointHealingOracle(w, options) {
    const problem = prepareJointHealingOracle(w, options);
    return problem.supported ? problem.solve() : problem;
}
