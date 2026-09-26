import { observeArena } from './arena/observe.js';
import { moveCreepsToFlag, executeTactics } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';

export function runTick() {
    const { flags, myCreeps, enemies, damagedFriends } = observeArena();
    const flag = selectFlag(flags);
    moveCreepsToFlag(myCreeps, flag);
    executeTactics(myCreeps, enemies, damagedFriends);
}
