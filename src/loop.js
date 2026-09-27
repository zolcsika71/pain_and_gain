import { observeArena, observeMap } from './arena/observe.js';
import { moveCreeps, executeTactics } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';
import { logGameState, logMapOnce } from './debug/game-state.js';
import { searchPath } from 'game/path-finder';
import { EFF_ATTACK_MODIFIER } from 'game/constants';
import { oneScoutFlagExperiment } from './config.js';
import { planScoutFlagAllocation } from './strategy/flag-allocation.js';

const engagements = new Map();
let flagAllocation = null;
let lastTick = 0;

function routeSteps(from, to) {
    const result = searchPath(from, { pos: to, range: 0 }, { maxOps: 5000 });
    return result.incomplete ? null : result.path.length;
}

export function runTick() {
    const state = observeArena();
    if (state.tick <= lastTick) {
        engagements.clear();
        flagAllocation = null;
    }
    lastTick = state.tick;
    const { flags, myCreeps, enemies, damagedFriends } = state;
    const flag = selectFlag(flags);
    const fallbackById = oneScoutFlagExperiment
        ? planScoutFlagAllocation(state, flagAllocation, routeSteps, EFF_ATTACK_MODIFIER) : null;
    if (fallbackById) flagAllocation = fallbackById.state;
    logMapOnce(state.tick, observeMap);
    logGameState(state, flag);
    moveCreeps(myCreeps, enemies, flag, engagements, fallbackById?.fallbackById);
    executeTactics(myCreeps, enemies, damagedFriends);
}
