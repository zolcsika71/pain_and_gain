import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';

const engagementRange = 5;

export function selectMovementDecision(creep, enemies, flag, previous = null) {
    const attackRange = hasFunctioningPart(creep, 'attack') ? 1
        : hasFunctioningPart(creep, 'ranged_attack') ? 3 : null;
    if (attackRange === null) return { target: flag ?? null, engagement: null };

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
    if (!target) return { target: flag ?? null, engagement: null };
    return {
        target: creep.getRangeTo(target) > attackRange ? target : null,
        engagement: { id: target.id, outsideTicks },
    };
}

export function selectMovementTarget(creep, enemies, flag) {
    return selectMovementDecision(creep, enemies, flag).target;
}
