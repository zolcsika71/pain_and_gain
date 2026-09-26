import { observeArena } from './arena/observe.js';
import { moveCreepsToFlag, executeTactics } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';
import { logGameState } from './debug/game-state.js';

export function runTick() {
    const state = observeArena();
    const { flags, myCreeps, enemies, damagedFriends } = state;
    const flag = selectFlag(flags);
    logGameState(state, flag);
    moveCreepsToFlag(myCreeps, flag);
    executeTactics(myCreeps, enemies, damagedFriends);
}
