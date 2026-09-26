import { getObjectsByPrototype } from 'game/utils';
import { Creep } from 'game/prototypes';
import { ScoreFlag } from 'arena/season_4/pain_and_gain/basic';

export function observeArena() {
    const flags = getObjectsByPrototype(ScoreFlag);
    const myCreeps = getObjectsByPrototype(Creep).filter(object => object.my);
    return { flags, myCreeps };
}
