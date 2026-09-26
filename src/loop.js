import { observeArena } from './arena/observe.js';
import { moveCreepsToFlag } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';

export function runTick() {
    const { flags, myCreeps } = observeArena();
    const flag = selectFlag(flags);
    moveCreepsToFlag(myCreeps, flag);
}
