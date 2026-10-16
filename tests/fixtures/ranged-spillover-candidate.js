// Test-only experiment. Reuse deployed selectors; never imported by runtime.
import { selectCombatDecision } from '../../src/tactics/combat.js';
import { selectHealingDecision } from '../../src/tactics/healing.js';
import { nearestTarget } from '../../src/tactics/targets.js';

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
    const { tick, sequence, earlierIntents, friends, enemyRosterComplete, damageModifiers } = context;
    // Explicit finite experiment domain. Unsupported/missing modifiers, rosters
    // or body/health data disable the experiment, never imply neutral damage.
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(sequence) || sequence < 0 ||
        enemyRosterComplete !== true || !Array.isArray(friends) || friends.length > 14 || enemies.length > 14 ||
        !Array.isArray(earlierIntents) || earlierIntents.length > 64 ||
        !['friendlyAttack', 'friendlyRanged', 'enemyDamageTaken', 'enemyHeal'].every(k => damageModifiers?.[k] === 1) ||
        ![...friends, ...enemies].every(knownUnit) || !friends.includes(creep) || !creep.my || creep.hits <= 0) return baseline;
    const byId = new Map([...friends, ...enemies].map(c => [c.id, c]));
    if (byId.size !== friends.length + enemies.length) return baseline;
    const injured = friends.filter(c => c.my && c.hits > 0 && c.hits < c.hitsMax);
    const coverage = new Map(), seen = new Map(), usedMeleeActors = new Set();
    let lastSequence = -1;
    for (const event of earlierIntents) {
        if (!Number.isSafeInteger(event.tick)) return baseline;
        if (event.tick > tick) return baseline;
        if (event.tick < tick) continue; // Fresh tick-local accounting, no retained budget.
        if (typeof event.actionId !== 'string' || !event.actionId ||
            !Number.isSafeInteger(event.sequence) || event.sequence >= sequence) return baseline;
        const signature = JSON.stringify([event.sequence, event.actorId, event.method, event.targetId, event.returnCode]);
        if (seen.has(event.actionId)) {
            if (seen.get(event.actionId) !== signature) return baseline;
            continue; // Exact repeated observation, count once.
        }
        seen.set(event.actionId, signature);
        if (event.sequence <= lastSequence) return baseline;
        lastSequence = event.sequence;
        if (event.method !== 'attack' || event.returnCode !== 0) continue;
        const actor = byId.get(event.actorId), target = byId.get(event.targetId);
        if (!actor || !target) return baseline;
        // Even an incompatible replacement cannot leave the first accepted call
        // in our budget. Multiple distinct accepted attacks make it ambiguous.
        if (usedMeleeActors.has(actor.id)) return baseline;
        usedMeleeActors.add(actor.id);
        if (!actor.my || actor.hits <= 0 || target.my || target.hits <= 0 || !count(actor, 'attack') ||
            range(actor, target) > 1 || selectHealingDecision(actor, injured).action) continue;
        // A current actor's melee is scheduled AFTER its ranged decision in the
        // real executor. Never invent an earlier same-actor melee-first pass.
        if (actor === creep) return baseline;
        const selected = selectCombatDecision(actor, enemies, null).actions.find(a => a.method === 'attack');
        if (selected?.target !== target) continue;
        coverage.set(target.id, (coverage.get(target.id) ?? 0) + count(actor, 'attack') * 30);
    }
    const noReachableHeal = target => !enemies.some(e => !e.my && e.hits > 0 &&
        count(e, 'heal') > 0 && range(e, target) <= 3);
    const covered = target => (coverage.get(target.id) ?? 0) >= target.hits;
    if (!covered(ranged.target) || !noReachableHeal(ranged.target)) return baseline;
    const distance = range(creep, ranged.target);
    const alternative = nearestTarget(creep, enemies.filter(e => !e.my && e.hits > 0 && e !== ranged.target &&
        range(creep, e) === distance && !covered(e) && noReachableHeal(e)), 3);
    if (!alternative) return baseline;
    return { ...baseline, actions: baseline.actions.map(a => a === ranged ? { ...a, target: alternative } : a) };
}
