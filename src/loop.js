import { observeArena, observeMap } from './arena/observe.js';
import { moveCreeps, executeTactics, prepareSecondaryMovement } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';
import { logFlagAllocationDiagnostic, logGameState, logHealerEscortDiagnostic, logMapOnce } from './debug/game-state.js';
import { searchPath } from 'game/path-finder';
import { getCpuTime, getTerrainAt } from 'game/utils';
import { arenaInfo } from 'game';
import { EFF_ATTACK_MODIFIER } from 'game/constants';
import * as configuration from './config.js';
import { planSecondaryObjective } from './strategy/secondary-objective-plan.js';
import { planSupportLockedTick, engagementDiagnostic } from './strategy/support-locked-engagement.js';
import { planScoutFlagAllocation } from './strategy/flag-allocation.js';
import { planHealerEscort } from './tactics/healer-escort.js';
import { closingHealModifier } from './tactics/healer-closing.js';
import { resetMembership, updateMembership } from './squads/membership.js';
import { planSquadPair, resetPair } from './squads/pair.js';
import { beginEvidenceTick, closeEvidenceTick, logActionAttempt,
    logActionDecision, logCpuEvidence, logMembershipEvidence } from './debug/replay-evidence.js';

const engagements = new Map();
const { oneHealerEscortExperiment, oneScoutFlagExperiment, scoutHoldExperiment, squadPairExperiment } = configuration;
let secondaryObjective = null;
let supportLockedEngagement = null;
let flagAllocation = null;
let healerEscort = null;
let lastTick = 0;
let lastIdleDiagnostic = null;
let membership = resetMembership();
let squadPair = resetPair();
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
        squadPair = resetPair();
    }
    lastTick = state.tick;
    // The selector's one-attempt state cannot be replenished by duplicate ticks.
    if (Number.isInteger(state.tick) && state.tick < previousTick) {
        secondaryObjective = null;
        supportLockedEngagement = null;
    }
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
    const pairPlan = squadPairExperiment ? planSquadPair(state, membership, flag, squadPair, {
        engagements, fallbackById: fallbackById?.fallbackById, escort: escortPlan?.escort,
        nextStep: (creep, target, ignore) => creep.findPathTo(target, { maxOps: 1000, ignore })[0],
    }) : null;
    if (pairPlan) squadPair = pairPlan.state;
    const unavailableIds = configuration.secondaryObjectiveExperiment === true ? [...new Set([
        ...(fallbackById?.fallbackById.keys() ?? []), ...(pairPlan?.moves.keys() ?? []),
        ...[escortPlan?.escort?.healerId, escortPlan?.escort?.allyId].filter(Boolean),
    ])] : null;
    let secondary = configuration.secondaryObjectiveExperiment === true
        ? planSecondaryObjective(state, membership, flag, secondaryObjective, { search: searchPath, unavailableIds }) : null;
    const prepared = secondary?.movement ? prepareSecondaryMovement(secondary, myCreeps, enemies, flag,
        engagements, escortPlan?.escort, pairPlan, { creeps: state.creeps, terrainAt: getTerrainAt }) : null;
    if (prepared) secondary = prepared.secondary;
    if (secondary) secondaryObjective = secondary.state;
    const locked = configuration.supportLockedEngagementExperiment === true
        ? planSupportLockedTick(state, membership, flag, supportLockedEngagement, {
            terrainAt: getTerrainAt, engagements, escort: escortPlan?.escort, pair: pairPlan,
            externalMoves: new Map([...(fallbackById?.fallbackById ?? []), ...(prepared?.moves ?? [])]),
        }) : null;
    if (locked) supportLockedEngagement = locked.state;
    logMapOnce(state.tick, observeMap);
    logGameState(state, flag, secondary?.diagnostic, locked ? engagementDiagnostic(locked) : null);
    if (escortPlan?.transition) logHealerEscortDiagnostic({ tick: state.tick,
        phase: 'before-actions', ...escortPlan.transition, range: escortPlan.escort?.distance ?? null,
        targetId: null, returnCode: null });
    moveCreeps(myCreeps, enemies, flag, engagements, fallbackById?.fallbackById,
        escortPlan?.escort, escortPlan?.escort ? diagnostic => logHealerEscortDiagnostic({ tick: state.tick,
            phase: 'movement', reason: null, ...diagnostic }) : null, actionReporter, scoutHoldExperiment,
        pairPlan, { creeps: state.creeps, terrainAt: getTerrainAt }, secondary?.fallbackById, prepared?.moves,
        secondary?.movement?.kind, configuration.healerUsefulClosingExperiment === true
            ? { healModifier: closingHealModifier(flags) } : null, locked?.moves);
    executeTactics(myCreeps, enemies, damagedFriends, actionReporter, state);
    const limitKind = state.tick === 1 ? 'first-tick' : 'ordinary-tick';
    const limitNs = state.tick === 1 ? arenaInfo.cpuTimeLimitFirstTick : arenaInfo.cpuTimeLimit;
    const elapsedNs = getCpuTime();
    logCpuEvidence({ elapsedNs, limitNs, limitKind });
    closeEvidenceTick();
}
