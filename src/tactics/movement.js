import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';

const engagementRange = 5;

export function selectMovementTarget(creep, enemies, flag) {
    const attackRange = hasFunctioningPart(creep, 'attack') ? 1
        : hasFunctioningPart(creep, 'ranged_attack') ? 3 : null;
    if (attackRange === null) return flag ?? null;

    const target = nearestTarget(
        creep,
        enemies.filter(enemy => !enemy.my && enemy.hits > 0),
        engagementRange,
    );
    if (!target) return flag ?? null;
    return creep.getRangeTo(target) > attackRange ? target : null;
}
