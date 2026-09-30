import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';

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
