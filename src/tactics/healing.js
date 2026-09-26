import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';

export function selectHealingAction(creep, damagedFriends) {
    if (!hasFunctioningPart(creep, 'heal')) return null;
    if (creep.hits > 0 && creep.hits < creep.hitsMax) {
        return { method: 'heal', target: creep };
    }

    const target = nearestTarget(
        creep,
        damagedFriends.filter(ally => ally.my && ally.hits > 0 && ally.hits < ally.hitsMax),
        3,
    );
    if (!target) return null;
    return { method: creep.getRangeTo(target) <= 1 ? 'heal' : 'rangedHeal', target };
}
