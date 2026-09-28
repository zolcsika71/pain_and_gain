import { selectHealingAction } from '../tactics/healing.js';
import { selectCombatActions } from '../tactics/combat.js';
import { selectMovementDecision } from '../tactics/movement.js';

export function moveCreeps(myCreeps, enemies, flag, engagements = new Map(), fallbackById = new Map(),
    escort = null, reportEscort = null) {
    const ownedIds = new Set(myCreeps.map(creep => creep.id));
    for (const id of engagements.keys()) if (!ownedIds.has(id)) engagements.delete(id);
    for (const creep of myCreeps) {
        if (escort && escort.healerId === creep.id) {
            let returnCode = null;
            if (escort.mode === 'move-attempt') returnCode = creep.moveTo(escort.ally) ?? null;
            reportEscort?.({ event: escort.mode, healerId: creep.id, allyId: escort.allyId,
                range: escort.distance, targetId: escort.mode === 'move-attempt' ? escort.allyId : null,
                returnCode });
            continue;
        }
        const fallback = fallbackById.has(creep.id) ? fallbackById.get(creep.id) : flag;
        const decision = selectMovementDecision(creep, enemies, fallback, engagements.get(creep.id), myCreeps);
        if (decision.engagement) engagements.set(creep.id, decision.engagement);
        else engagements.delete(creep.id);
        const target = decision.target;
        if (target) creep.moveTo(target);
    }
}

export function executeTactics(myCreeps, enemies, damagedFriends) {
    for (const creep of myCreeps) {
        const healing = selectHealingAction(creep, damagedFriends);
        if (healing) {
            creep[healing.method](healing.target);
        }
        for (const attack of selectCombatActions(creep, enemies, healing)) {
            creep[attack.method](attack.target);
        }
    }
}
