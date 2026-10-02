import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';

const engagementRange = 5;
const healerSupportRange = 5;
const rangedHealRange = 3;
const scoutHoldRange = 2;

function canHoldScout(creep, firstFlag, enemies) {
    return firstFlag?.my === true && creep.my === true && creep.hits > 0 &&
        creep.hits === creep.hitsMax && creep.fatigue === 0 &&
        creep.body.length > 0 && creep.body.every(part => part.type === 'move') &&
        hasFunctioningPart(creep, 'move') && creep.getRangeTo(firstFlag) <= scoutHoldRange &&
        !enemies.some(enemy => !enemy.my && enemy.hits > 0 &&
            (creep.getRangeTo(enemy) <= engagementRange ||
                Math.max(Math.abs(firstFlag.x - enemy.x), Math.abs(firstFlag.y - enemy.y)) <= engagementRange));
}

function fallbackPlan(flag) {
    return flag ? { target: flag, engagement: null, outcome: 'selected',
        reason: 'flag-fallback', targetKind: 'score-flag' }
        : { target: null, engagement: null, outcome: 'no-action',
            reason: 'no-movement-objective', targetKind: null };
}

// The caller enables holding only for the unassigned first-flag fallback.
export function selectMovementPlan(creep, enemies, flag, previous = null, friends = [],
    holdUnassignedScout = false) {
    if (holdUnassignedScout && canHoldScout(creep, flag, enemies)) {
        return { target: null, engagement: null, outcome: 'hold',
            reason: 'scout-owned-flag-hold', targetKind: null };
    }
    const attackRange = hasFunctioningPart(creep, 'attack') ? 1
        : hasFunctioningPart(creep, 'ranged_attack') ? 3 : null;
    if (attackRange === null) {
        if (hasFunctioningPart(creep, 'heal')) {
            const injured = friends.filter(friend => friend.my && friend.id !== creep.id &&
                friend.hits > 0 && friend.hits < friend.hitsMax);
            const distant = nearestTarget(creep, injured.filter(ally => creep.getRangeTo(ally) > rangedHealRange),
                healerSupportRange);
            if (distant) return { target: distant, engagement: null, outcome: 'selected',
                reason: 'injured-ally-approach', targetKind: 'creep' };
            if (nearestTarget(creep, injured, rangedHealRange)) {
                return { target: null, engagement: null, outcome: 'hold',
                    reason: 'injured-ally-in-range', targetKind: null };
            }
        }
        return fallbackPlan(flag);
    }

    const livingEnemies = enemies.filter(enemy => !enemy.my && enemy.hits > 0);
    let target = nearestTarget(creep, livingEnemies, engagementRange);
    let outsideTicks = 0;
    if (!target && previous?.id && previous.outsideTicks !== 1) {
        const retained = livingEnemies.find(enemy => enemy.id === previous.id);
        if (retained && creep.getRangeTo(retained) === engagementRange + 1) {
            target = retained;
            outsideTicks = 1;
        }
    }
    if (!target) return fallbackPlan(flag);
    const approach = creep.getRangeTo(target) > attackRange;
    return {
        target: approach ? target : null,
        engagement: { id: target.id, outsideTicks },
        outcome: approach ? 'selected' : 'hold',
        reason: approach ? 'combat-approach' : 'combat-in-range',
        targetKind: approach ? 'creep' : null,
    };
}

export function selectMovementDecision(creep, enemies, flag, previous = null, friends = []) {
    const { target, engagement } = selectMovementPlan(creep, enemies, flag, previous, friends);
    return { target, engagement };
}

export function selectMovementTarget(creep, enemies, flag) {
    return selectMovementDecision(creep, enemies, flag).target;
}
