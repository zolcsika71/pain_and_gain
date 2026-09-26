import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';

export function selectCombatActions(creep, enemies, healing) {
    if (healing?.method === 'rangedHeal') return [];

    const livingEnemies = enemies.filter(enemy => !enemy.my && enemy.hits > 0);
    const actions = [];

    if (hasFunctioningPart(creep, 'ranged_attack')) {
        const target = nearestTarget(creep, livingEnemies, 3);
        if (target) actions.push({ method: 'rangedAttack', target });
    }
    if (!healing && hasFunctioningPart(creep, 'attack')) {
        const target = nearestTarget(creep, livingEnemies, 1);
        if (target) actions.push({ method: 'attack', target });
    }

    return actions;
}
