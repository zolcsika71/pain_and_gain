import { selectHealingAction } from '../tactics/healing.js';
import { selectCombatActions } from '../tactics/combat.js';
import { selectMovementTarget } from '../tactics/movement.js';

export function moveCreeps(myCreeps, enemies, flag) {
    for (const creep of myCreeps) {
        const target = selectMovementTarget(creep, enemies, flag);
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
