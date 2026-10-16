import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';
import { selectHealingDecision } from './healing.js';

export function selectCombatDecision(creep, enemies, healing) {
    const canRangedAttack = hasFunctioningPart(creep, 'ranged_attack');
    const canAttack = hasFunctioningPart(creep, 'attack');
    if (healing?.method === 'rangedHeal') return { actions: [], outcome: 'no-action',
        reason: canRangedAttack || canAttack ? 'healing-compatibility' : 'no-functioning-weapon' };

    const livingEnemies = enemies.filter(enemy => !enemy.my && enemy.hits > 0);
    const actions = [];

    if (canRangedAttack) {
        const target = nearestTarget(creep, livingEnemies, 3);
        if (target) actions.push({ method: 'rangedAttack', target });
    }
    if (!healing && canAttack) {
        const target = nearestTarget(creep, livingEnemies, 1);
        if (target) actions.push({ method: 'attack', target });
    }

    if (actions.length) return { actions, outcome: 'selected', reason: 'target-in-range' };
    if (!canAttack && !canRangedAttack) {
        return { actions, outcome: 'no-action', reason: 'no-functioning-weapon' };
    }
    if (healing && canAttack && !canRangedAttack) {
        return { actions, outcome: 'no-action', reason: 'healing-compatibility' };
    }
    return { actions, outcome: 'no-action', reason: 'no-target-in-range' };
}

export function selectCombatActions(creep, enemies, healing) {
    return selectCombatDecision(creep, enemies, healing).actions;
}

// Guarded trial candidate: accepted intents are nominal scheduling capacity,
// never guaranteed damage. Baseline selection above remains available unchanged.
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const count = (c, type) => c.body.filter(p => p.type === type && p.hits > 0).length;
const partTypes = new Set(['move', 'attack', 'ranged_attack', 'heal', 'tough', 'work', 'carry']);
const knownUnit = c => typeof c?.id === 'string' && c.id.length > 0 && typeof c.my === 'boolean' &&
    typeof c.getRangeTo === 'function' &&
    ['x', 'y', 'hits', 'hitsMax'].every(k => Number.isSafeInteger(c[k])) &&
    c.hits >= 0 && c.hitsMax > 0 && c.hits <= c.hitsMax && Array.isArray(c.body) && c.body.length <= 50 &&
    c.body.every(p => partTypes.has(p.type) && Number.isFinite(p.hits) && p.hits >= 0 && p.hits <= 100);

export function selectSpilloverDecision(creep, enemies, healing, context) {
    const baseline = selectCombatDecision(creep, enemies, healing);
    const ranged = baseline.actions.find(a => a.method === 'rangedAttack');
    if (!ranged || !context) return baseline;
    const fallback = { ...baseline, reason: 'ranged-spillover-fallback' };
    const { tick, sequence, earlierIntents, friends, enemyRosterComplete, damageModifiers } = context;
    // Explicit finite experiment domain. Unsupported/missing modifiers, rosters
    // or body/health data disable the experiment, never imply neutral damage.
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(sequence) || sequence < 0 ||
        enemyRosterComplete !== true || !Array.isArray(friends) || friends.length > 14 || enemies.length > 14 ||
        !Array.isArray(earlierIntents) || earlierIntents.length > 64 ||
        !['friendlyAttack', 'friendlyRanged', 'enemyDamageTaken', 'enemyHeal'].every(k => damageModifiers?.[k] === 1) ||
        ![...friends, ...enemies].every(knownUnit) || !friends.includes(creep) || !creep.my || creep.hits <= 0) return fallback;
    const byId = new Map([...friends, ...enemies].map(c => [c.id, c]));
    if (byId.size !== friends.length + enemies.length) return fallback;
    const injured = friends.filter(c => c.my && c.hits > 0 && c.hits < c.hitsMax);
    const coverage = new Map(), seen = new Map(), usedMeleeActors = new Set();
    let lastSequence = -1;
    for (const event of earlierIntents) {
        if (!Number.isSafeInteger(event.tick)) return fallback;
        if (event.tick > tick) return fallback;
        if (event.tick < tick) continue; // Fresh tick-local accounting, no retained budget.
        if (typeof event.actionId !== 'string' || !event.actionId ||
            !Number.isSafeInteger(event.sequence) || event.sequence >= sequence) return fallback;
        const signature = JSON.stringify([event.sequence, event.actorId, event.method, event.targetId, event.returnCode]);
        if (seen.has(event.actionId)) {
            if (seen.get(event.actionId) !== signature) return fallback;
            continue; // Exact repeated observation, count once.
        }
        seen.set(event.actionId, signature);
        if (event.sequence <= lastSequence) return fallback;
        lastSequence = event.sequence;
        if (event.method !== 'attack' || event.returnCode !== 0) continue;
        const actor = byId.get(event.actorId), target = byId.get(event.targetId);
        if (!actor || !target) return fallback;
        // Even an incompatible replacement cannot leave the first accepted call
        // in our budget. Multiple distinct accepted attacks make it ambiguous.
        if (usedMeleeActors.has(actor.id)) return fallback;
        usedMeleeActors.add(actor.id);
        if (!actor.my || actor.hits <= 0 || target.my || target.hits <= 0 || !count(actor, 'attack') ||
            range(actor, target) > 1 || selectHealingDecision(actor, injured).action) continue;
        // A current actor's melee is scheduled AFTER its ranged decision in the
        // real executor. Never invent an earlier same-actor melee-first pass.
        if (actor === creep) return fallback;
        const selected = selectCombatDecision(actor, enemies, null).actions.find(a => a.method === 'attack');
        if (selected?.target !== target) continue;
        coverage.set(target.id, (coverage.get(target.id) ?? 0) + count(actor, 'attack') * 30);
    }
    const noReachableHeal = target => !enemies.some(e => !e.my && e.hits > 0 &&
        count(e, 'heal') > 0 && range(e, target) <= 3);
    const covered = target => (coverage.get(target.id) ?? 0) >= target.hits;
    if (!covered(ranged.target) || !noReachableHeal(ranged.target)) return fallback;
    const distance = range(creep, ranged.target);
    const alternative = nearestTarget(creep, enemies.filter(e => !e.my && e.hits > 0 && e !== ranged.target &&
        range(creep, e) === distance && !covered(e) && noReachableHeal(e)), 3);
    if (!alternative) return fallback;
    return { ...baseline, reason: 'ranged-spillover', actions: baseline.actions.map(a => a === ranged ? { ...a, target: alternative } : a) };
}

const flagContract = {
    eff_damage_taken_modifier: { count: 1, score: 5 },
    eff_heal_modifier: { count: 2, score: 4 },
    eff_attack_modifier: { count: 2, score: 3 },
    eff_ranged_attack_modifier: { count: 2, score: 3 },
};

// The loop supplies the getObjectsByPrototype observation, not a selected slice.
// Flag.my === undefined is documented neutral ownership, not assumed enemy data.
export function createSpilloverContext(observation, friends, enemies) {
    const unavailable = { tick: observation?.tick, friends, enemyRosterComplete: false };
    const creeps = observation?.creeps, flags = observation?.flags;
    if (!Array.isArray(creeps) || creeps.length > 28 || !Array.isArray(flags) || flags.length !== 7 ||
        !creeps.every(c => c?.exists === true && Array.isArray(c.body) && c.body.length <= 50 &&
            c.body.filter(p => p && typeof p === 'object').length === c.body.length &&
            knownUnit(c))) return unavailable;
    const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((c, i) => c === b[i]);
    if (!same(friends, creeps.filter(c => c.my)) ||
        !same(enemies, creeps.filter(c => !c.my && c.hits > 0))) return unavailable;
    const seen = new Set(), counts = {};
    for (const flag of flags) {
        if (flag?.exists !== true || typeof flag.id !== 'string' || !flag.id || seen.has(flag.id) ||
            !Number.isInteger(flag.x) || !Number.isInteger(flag.y) ||
            flag.x < 0 || flag.x > 99 || flag.y < 0 || flag.y > 99 ||
            ![true, false, undefined].includes(flag.my) ||
            !Object.prototype.hasOwnProperty.call(flagContract, flag.effectType) ||
            flag.scorePerTick !== flagContract[flag.effectType].score) return unavailable;
        seen.add(flag.id);
        counts[flag.effectType] = (counts[flag.effectType] ?? 0) + 1;
    }
    if (Object.entries(flagContract).some(([type, contract]) => counts[type] !== contract.count)) return unavailable;
    const ownedCount = (my, type) => flags.filter(f => f.my === my && f.effectType === type).length;
    return { tick: observation.tick, friends, enemyRosterComplete: true, damageModifiers: {
        friendlyAttack: 1 - 0.2 * ownedCount(true, 'eff_attack_modifier'),
        friendlyRanged: 1 - 0.2 * ownedCount(true, 'eff_ranged_attack_modifier'),
        enemyDamageTaken: 1 + 0.1 * ownedCount(false, 'eff_damage_taken_modifier'),
        enemyHeal: 1 - 0.25 * ownedCount(false, 'eff_heal_modifier'),
    } };
}
