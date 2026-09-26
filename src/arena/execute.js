import { selectHealingAction } from '../tactics/healing.js';
import { selectCombatActions } from '../tactics/combat.js';

export function moveCreepsToFlag(myCreeps, flag) {
    for (const creep of myCreeps) {
        creep.moveTo(flag);
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
