import { observeArena, observeMap } from './arena/observe.js';
import { moveCreeps, executeTactics } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';
import { logFlagAllocationDiagnostic, logGameState, logMapOnce } from './debug/game-state.js';
import { searchPath } from 'game/path-finder';
import { EFF_ATTACK_MODIFIER } from 'game/constants';
import { oneScoutFlagExperiment } from './config.js';
import { planScoutFlagAllocation } from './strategy/flag-allocation.js';

const engagements = new Map();
let flagAllocation = null;
let lastTick = 0;
let lastIdleDiagnostic = null;

function reportFlagAllocation(diagnostic) {
    // Repeated route-free rejections add no new decision evidence. Game-state
    // snapshots still cover every tick, and any changed reason is emitted.
    const idleKey = diagnostic.event === 'reject' && !diagnostic.evaluations?.length
        ? JSON.stringify({ ...diagnostic, tick: null }) : null;
    if (idleKey && idleKey === lastIdleDiagnostic) return;
    lastIdleDiagnostic = idleKey;
    logFlagAllocationDiagnostic(diagnostic);
}

function routeSteps(from, to, report) {
    const result = searchPath(from, { pos: to, range: 0 }, { maxOps: 5000 });
    report?.({ incomplete: result.incomplete, length: result.path?.length ?? null,
        cost: result.cost ?? null, ops: result.ops ?? null });
    return result.incomplete ? null : result.path.length;
}

export function runTick() {
    const state = observeArena();
    if (state.tick <= lastTick) {
        engagements.clear();
        flagAllocation = null;
        lastIdleDiagnostic = null;
    }
    lastTick = state.tick;
    const { flags, myCreeps, enemies, damagedFriends } = state;
    const flag = selectFlag(flags);
    const fallbackById = oneScoutFlagExperiment
        ? planScoutFlagAllocation(state, flagAllocation, routeSteps, EFF_ATTACK_MODIFIER,
            reportFlagAllocation) : null;
    if (fallbackById) flagAllocation = fallbackById.state;
    logMapOnce(state.tick, observeMap);
    logGameState(state, flag);
    moveCreeps(myCreeps, enemies, flag, engagements, fallbackById?.fallbackById);
    executeTactics(myCreeps, enemies, damagedFriends);
}
