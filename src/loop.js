import { observeArena, observeMap } from './arena/observe.js';
import { moveCreeps, executeTactics } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';
import { logGameState, logMapOnce } from './debug/game-state.js';

export function runTick() {
    const state = observeArena();
    const { flags, myCreeps, enemies, damagedFriends } = state;
    const flag = selectFlag(flags);
    logMapOnce(state.tick, observeMap);
    logGameState(state, flag);
    moveCreeps(myCreeps, enemies, flag);
    executeTactics(myCreeps, enemies, damagedFriends);
}
