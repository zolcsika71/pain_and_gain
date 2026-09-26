import { getObjectsByPrototype, getTicks } from 'game/utils';
import { Creep } from 'game/prototypes';
import { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';

export function observeArena() {
    const flags = getObjectsByPrototype(ScoreFlag);
    const creeps = getObjectsByPrototype(Creep);
    const myCreeps = creeps.filter(creep => creep.my);
    const enemies = creeps.filter(creep => !creep.my && creep.hits > 0);
    const damagedFriends = myCreeps.filter(creep => creep.hits > 0 && creep.hits < creep.hitsMax);
    return { tick: getTicks(), flags, creeps, myCreeps, enemies, damagedFriends };
}
