import { hasFunctioningPart } from '../tactics/body.js';

const threatRange = 5;
const defenderRange = 3;
const arrivalMargin = 5;
const maxRouteSteps = 40;
const maxAssignmentTicks = 60;
const lastStartTick = 80;

function range(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function isScout(creep) {
    return creep.my && creep.hits > 0 && creep.hits === creep.hitsMax &&
        creep.body.length > 0 && creep.body.every(part => part.type === 'move') &&
        hasFunctioningPart(creep, 'move');
}

function isSafeTarget(scout, flag, enemies, routeSteps) {
    if (enemies.some(enemy => range(enemy, scout) <= threatRange ||
        range(enemy, flag) <= threatRange)) return null;
    const steps = routeSteps(scout, flag);
    if (!Number.isInteger(steps) || steps < range(scout, flag) || steps > maxRouteSteps) return null;
    for (const enemy of enemies) {
        // Linear range is only a lower bound on arrival time. Ask the pathfinder
        // whenever that bound does not already establish the margin.
        if (range(enemy, flag) > steps + arrivalMargin) continue;
        const enemySteps = routeSteps(enemy, flag);
        if (!Number.isInteger(enemySteps) || enemySteps <= steps + arrivalMargin) return null;
    }
    return steps;
}

// A finished attempt stays finished for this match: no chaining or reassignment.
export function planScoutFlagAllocation({ tick, flags, myCreeps, enemies }, previous,
    routeSteps, attackEffectType) {
    const first = flags[0];
    const fallbackById = new Map();
    if (previous?.finished) return { state: previous, fallbackById };
    const livingEnemies = enemies.filter(enemy => !enemy.my && enemy.hits > 0);
    const threatened = !first || first.my !== true ||
        livingEnemies.some(enemy => range(enemy, first) <= threatRange);
    if (threatened) {
        return { state: previous?.scoutId ? { finished: true } : null, fallbackById };
    }

    const scout = previous?.scoutId
        ? myCreeps.find(creep => creep.id === previous.scoutId)
        : myCreeps.filter(creep => isScout(creep) && creep.fatigue === 0)
            .sort((a, b) => range(b, first) - range(a, first) || a.id.localeCompare(b.id))[0];
    if (!scout || !isScout(scout) || (previous && tick - previous.startedAt > maxAssignmentTicks)) {
        return { state: previous?.scoutId ? { finished: true } : null, fallbackById };
    }
    const defender = myCreeps.some(creep => creep.id !== scout.id && creep.my && creep.hits > 0 &&
        (hasFunctioningPart(creep, 'attack') || hasFunctioningPart(creep, 'ranged_attack')) &&
        range(creep, first) <= defenderRange);
    if (!defender) {
        return { state: previous?.scoutId ? { finished: true } : null, fallbackById };
    }

    if (previous?.scoutId) {
        const flag = flags.find(candidate => candidate.id === previous.targetId);
        if (flag?.my === true) return { state: { finished: true }, fallbackById };
        if (!flag || flag.my !== undefined || flag.effectType !== attackEffectType ||
            isSafeTarget(scout, flag, livingEnemies, routeSteps) === null) {
            return { state: { finished: true }, fallbackById };
        }
        fallbackById.set(scout.id, range(scout, flag) === 0 ? null : flag);
        return { state: previous, fallbackById };
    }

    if (tick > lastStartTick) return { state: null, fallbackById };
    const choices = flags.filter(flag => flag.my === undefined &&
        flag.effectType === attackEffectType).map(flag => ({
        flag, steps: isSafeTarget(scout, flag, livingEnemies, routeSteps),
    })).filter(choice => choice.steps !== null)
        .sort((a, b) => a.steps - b.steps || a.flag.id.localeCompare(b.flag.id));
    if (choices.length === 0) return { state: null, fallbackById };
    const flag = choices[0].flag;
    fallbackById.set(scout.id, flag);
    return { state: { scoutId: scout.id, targetId: flag.id, startedAt: tick }, fallbackById };
}
