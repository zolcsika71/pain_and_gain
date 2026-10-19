import { observeArena, observeMap } from './arena/observe.js';
import { moveCreeps, executeTactics, prepareSecondaryMovement } from './arena/execute.js';
import { selectFlag } from './strategy/objectives.js';
import { logFlagAllocationDiagnostic, logGameState, logHealerEscortDiagnostic, logMapOnce } from './debug/game-state.js';
import * as pathFinder from 'game/path-finder';
import { getCpuTime, getTerrainAt } from 'game/utils';
import { arenaInfo } from 'game';
import { EFF_ATTACK_MODIFIER } from 'game/constants';
import * as configuration from './config.js';
import { planSecondaryObjective } from './strategy/secondary-objective-plan.js';
import { planOpeningDeployment, openingDeploymentDiagnostic } from './strategy/opening-deployment.js';
import { planCentreSupport } from './strategy/opening-centre-support.js';
import { planSupportLockedTick, engagementDiagnostic } from './strategy/support-locked-engagement.js';
import { planScoutFlagAllocation } from './strategy/flag-allocation.js';
import { planHealerEscort } from './tactics/healer-escort.js';
import { closingHealModifier } from './tactics/healer-closing.js';
import { probeOpeningRoute, resetOpeningRouteProbe } from './debug/opening-route-probe.js';
import { captureOpeningRouteAdoption } from './strategy/opening-route-adoption.js';
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
let openingRouteProbe = resetOpeningRouteProbe();
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
    const result = pathFinder.searchPath(from, { pos: to, range: 0 }, { maxOps: 5000 });
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
        if (state.tick === 1) openingRouteProbe = resetOpeningRouteProbe();
    }
    beginEvidenceTick(state.tick, matchReset
        ? { previousTick, reason: 'tick-not-increasing' } : null);
    const { flags, myCreeps, enemies, damagedFriends } = state;
    const openingRequested = configuration.openingDeploymentExperiment === true;
    const openingCompatible = !openingRequested || [oneScoutFlagExperiment, scoutHoldExperiment,
        squadPairExperiment, configuration.secondaryObjectiveExperiment,
        configuration.healerUsefulClosingExperiment, configuration.supportLockedEngagementExperiment]
        .every(value => value === false);
    membership = updateMembership(membership, { tick: state.tick, myCreeps });
    logMembershipEvidence(membership);
    const flag = selectFlag(flags);
    const fallbackById = oneScoutFlagExperiment && !openingRequested
        ? planScoutFlagAllocation(state, flagAllocation, routeSteps, EFF_ATTACK_MODIFIER,
            reportFlagAllocation) : null;
    if (fallbackById) flagAllocation = fallbackById.state;
    const escortPlan = oneHealerEscortExperiment
        ? planHealerEscort(state, flag, healerEscort) : null;
    if (escortPlan) healerEscort = escortPlan.state;
    const pairPlan = squadPairExperiment && !openingRequested ? planSquadPair(state, membership, flag, squadPair, {
        engagements, fallbackById: fallbackById?.fallbackById, escort: escortPlan?.escort,
        nextStep: (creep, target, ignore) => creep.findPathTo(target, { maxOps: 1000, ignore })[0],
    }) : null;
    if (pairPlan) squadPair = pairPlan.state;
    const unavailableIds = openingRequested || configuration.secondaryObjectiveExperiment === true ? [...new Set([
        ...(fallbackById?.fallbackById.keys() ?? []), ...(pairPlan?.moves.keys() ?? []),
        ...[escortPlan?.escort?.healerId, escortPlan?.escort?.allyId].filter(Boolean),
    ])] : null;
    // Exactly one objective slot and one search budget. Unsupported opening
    // combinations spend the opening without invoking competing experiments.
    let secondary = openingRequested
        ? planOpeningDeployment(state, membership, flag, secondaryObjective, {
            search: pathFinder.searchPath, CostMatrix: pathFinder.CostMatrix,
            unavailableIds, terrainAt: getTerrainAt, compatible: openingCompatible })
        : configuration.secondaryObjectiveExperiment === true
        ? planSecondaryObjective(state, membership, flag, secondaryObjective, { search: pathFinder.searchPath, unavailableIds }) : null;
    let prepared = secondary?.movement ? prepareSecondaryMovement(secondary, myCreeps, enemies, flag,
        engagements, escortPlan?.escort, pairPlan, { creeps: state.creeps, terrainAt: getTerrainAt }) : null;
    if (prepared) secondary = prepared.secondary;
    let openingCentreIds = null;
    if (openingRequested && secondary?.state?.phase === 'active' && prepared?.moves) {
        const centre = planCentreSupport({ observation: state, membership,
            mission: { ...secondary, moves: prepared.moves },
            spacing: { creeps: state.creeps, terrainAt: getTerrainAt },
            engagements, escort: escortPlan?.escort, pair: pairPlan });
        if (centre.moves) {
            openingCentreIds = new Set(centre.moves.keys());
            prepared = { ...prepared, moves: new Map([...prepared.moves, ...centre.moves]) };
        } else {
            // Release both groups before logging or executing ordinary priorities.
            secondary = secondary.cancel(`centre-${centre.reason}`);
            prepared = { secondary, moves: null };
        }
    }
    const locked = !openingRequested && configuration.supportLockedEngagementExperiment === true
        ? planSupportLockedTick(state, membership, flag, supportLockedEngagement, {
            terrainAt: getTerrainAt, engagements, escort: escortPlan?.escort, pair: pairPlan,
            externalMoves: new Map([...(fallbackById?.fallbackById ?? []), ...(prepared?.moves ?? [])]),
        }) : null;
    if (locked) supportLockedEngagement = locked.state;
    const mapTick = logMapOnce(state.tick, observeMap);
    let objectiveDiagnostic = openingRequested ? openingDeploymentDiagnostic(secondary, state, membership) : secondary?.diagnostic;
    if (configuration.openingRouteProbeExperiment === true && openingRequested) {
        const probe = probeOpeningRoute({state:openingRouteProbe,observation:state,membership,
            mission:secondary,moves:prepared?.moves,centreIds:openingCentreIds,
            diagnostic:objectiveDiagnostic,mapTick,compatible:openingCompatible,
            search:pathFinder.searchPath,CostMatrix:pathFinder.CostMatrix,
            prepareComparison:configuration.openingRouteAdoptionExperiment === true
                ? sample=>captureOpeningRouteAdoption({observation:state,membership,mission:secondary,
                    moves:prepared.moves,centreIds:openingCentreIds,diagnostic:objectiveDiagnostic,...sample,
                    spacing:{creeps:state.creeps,terrainAt:getTerrainAt},engagements,
                    escort:escortPlan?.escort,pair:pairPlan,unavailableIds}) : null});
        openingRouteProbe = probe.state;
        let adoptionTelemetry;
        if (configuration.openingRouteAdoptionExperiment === true) {
            const adopted=probe.comparison?.finish(probe.diagnostic);
            adoptionTelemetry=adopted?.telemetry??[0,null,null,null];
            if(adopted){
                secondary=adopted.mission;prepared={secondary,moves:adopted.moves};openingCentreIds=adopted.centreIds;
                objectiveDiagnostic=openingDeploymentDiagnostic(secondary,state,membership);
            }
        }
        objectiveDiagnostic = {...objectiveDiagnostic,probeEligibility:probe.eligibility};
        if (probe.diagnostic) objectiveDiagnostic = {...objectiveDiagnostic,routeProbe:probe.diagnostic};
        if (adoptionTelemetry) objectiveDiagnostic = {...objectiveDiagnostic,routeAdoption:adoptionTelemetry};
    }
    if (secondary) secondaryObjective = secondary.state;
    logGameState(state, flag, objectiveDiagnostic, locked ? engagementDiagnostic(locked) : null);
    if (escortPlan?.transition) logHealerEscortDiagnostic({ tick: state.tick,
        phase: 'before-actions', ...escortPlan.transition, range: escortPlan.escort?.distance ?? null,
        targetId: null, returnCode: null });
    moveCreeps(myCreeps, enemies, flag, engagements, fallbackById?.fallbackById,
        escortPlan?.escort, escortPlan?.escort ? diagnostic => logHealerEscortDiagnostic({ tick: state.tick,
            phase: 'movement', reason: null, ...diagnostic }) : null, actionReporter, !openingRequested && scoutHoldExperiment,
        pairPlan, { creeps: state.creeps, terrainAt: getTerrainAt }, secondary?.fallbackById, prepared?.moves,
        secondary?.movement?.kind, !openingRequested && configuration.healerUsefulClosingExperiment === true
            ? { healModifier: closingHealModifier(flags) } : null, locked?.moves, openingCentreIds);
    executeTactics(myCreeps, enemies, damagedFriends, actionReporter, state);
    const limitKind = state.tick === 1 ? 'first-tick' : 'ordinary-tick';
    const limitNs = state.tick === 1 ? arenaInfo.cpuTimeLimitFirstTick : arenaInfo.cpuTimeLimit;
    const elapsedNs = getCpuTime();
    logCpuEvidence({ elapsedNs, limitNs, limitKind });
    closeEvidenceTick();
}
