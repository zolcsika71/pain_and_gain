import { observeArena, observeMap } from './arena/observe.js';
import { moveCreeps, executeTactics } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';
import { logFlagAllocationDiagnostic, logGameState, logHealerEscortDiagnostic, logMapOnce } from './debug/game-state.js';
import { searchPath } from 'game/path-finder';
import { EFF_ATTACK_MODIFIER } from 'game/constants';
import { oneHealerEscortExperiment, oneScoutFlagExperiment } from './config.js';
import { planScoutFlagAllocation } from './strategy/flag-allocation.js';
import { planHealerEscort } from './tactics/healer-escort.js';
import { resetMembership, updateMembership } from './squads/membership.js';
import { beginEvidenceTick, closeEvidenceTick, logActionAttempt,
    logActionDecision, logMembershipEvidence } from './debug/replay-evidence.js';

const engagements = new Map();
let flagAllocation = null;
let healerEscort = null;
let lastTick = 0;
let lastIdleDiagnostic = null;
let membership = resetMembership();
const actionReporter = { decision: logActionDecision, attempt: logActionAttempt };

export function getMembershipState() {
    return membership;
}

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
    const previousTick = lastTick;
    const matchReset = state.tick <= lastTick;
    if (matchReset) {
        engagements.clear();
        flagAllocation = null;
        healerEscort = null;
        lastIdleDiagnostic = null;
        membership = resetMembership();
    }
    lastTick = state.tick;
    beginEvidenceTick(state.tick, matchReset
        ? { previousTick, reason: 'tick-not-increasing' } : null);
    const { flags, myCreeps, enemies, damagedFriends } = state;
    membership = updateMembership(membership, { tick: state.tick, myCreeps });
    logMembershipEvidence(membership);
    const flag = selectFlag(flags);
    const fallbackById = oneScoutFlagExperiment
        ? planScoutFlagAllocation(state, flagAllocation, routeSteps, EFF_ATTACK_MODIFIER,
            reportFlagAllocation) : null;
    if (fallbackById) flagAllocation = fallbackById.state;
    const escortPlan = oneHealerEscortExperiment
        ? planHealerEscort(state, flag, healerEscort) : null;
    if (escortPlan) healerEscort = escortPlan.state;
    logMapOnce(state.tick, observeMap);
    logGameState(state, flag);
    if (escortPlan?.transition) logHealerEscortDiagnostic({ tick: state.tick,
        phase: 'before-actions', ...escortPlan.transition, range: escortPlan.escort?.distance ?? null,
        targetId: null, returnCode: null });
    moveCreeps(myCreeps, enemies, flag, engagements, fallbackById?.fallbackById,
        escortPlan?.escort, escortPlan?.escort ? diagnostic => logHealerEscortDiagnostic({ tick: state.tick,
            phase: 'movement', reason: null, ...diagnostic }) : null, actionReporter);
    executeTactics(myCreeps, enemies, damagedFriends, actionReporter);
    closeEvidenceTick();
}
