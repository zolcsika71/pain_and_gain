import { hasFunctioningPart } from './body.js';
import { nearestTarget } from './targets.js';

export function selectHealingDecision(creep, damagedFriends) {
    if (!hasFunctioningPart(creep, 'heal')) {
        return { action: null, outcome: 'no-action', reason: 'no-functioning-heal' };
    }
    if (creep.hits > 0 && creep.hits < creep.hitsMax) {
        return { action: { method: 'heal', target: creep }, outcome: 'selected',
            reason: 'self-heal' };
    }

    const target = nearestTarget(
        creep,
        damagedFriends.filter(ally => ally.my && ally.hits > 0 && ally.hits < ally.hitsMax),
        3,
    );
    if (!target) return { action: null, outcome: 'no-action', reason: 'no-injured-target-in-range' };
    return { action: { method: creep.getRangeTo(target) <= 1 ? 'heal' : 'rangedHeal', target },
        outcome: 'selected', reason: 'injured-ally-in-range' };
}

export function selectHealingAction(creep, damagedFriends) {
    return selectHealingDecision(creep, damagedFriends).action;
}
