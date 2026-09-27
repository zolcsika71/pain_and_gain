import { observeArena, observeMap } from './arena/observe.js';
import { moveCreeps, executeTactics } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';
import { logGameState, logMapOnce } from './debug/game-state.js';

const engagements = new Map();
let lastTick = 0;

export function runTick() {
    const state = observeArena();
    if (state.tick <= lastTick) engagements.clear();
    lastTick = state.tick;
    const { flags, myCreeps, enemies, damagedFriends } = state;
    const flag = selectFlag(flags);
    logMapOnce(state.tick, observeMap);
    logGameState(state, flag);
    moveCreeps(myCreeps, enemies, flag, engagements);
    executeTactics(myCreeps, enemies, damagedFriends);
}
