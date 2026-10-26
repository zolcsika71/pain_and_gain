import { selectHealingDecision } from '../tactics/healing.js';
import { createSpilloverContext, selectSpilloverDecision } from '../tactics/combat.js';
import { selectMovementPlan, localRetreatStep } from '../tactics/movement.js';
import { improveHealerHold } from '../tactics/healer-closing.js';
import { secondaryStepSupport, selectSecondaryTravelSteps } from '../strategy/supported-contest.js';
import { proposeOpeningJoint, proposeHoldAwareJoint, jointProposalStatus } from '../strategy/opening-joint-proposals.js';

function reportDecision(reporter, decision) {
    return reporter?.decision(decision) ?? null;
}

function actionAtCall(action) {
    return { ...action, target: { id: action.target.id ?? null, x: action.target.x, y: action.target.y } };
}

function issueAction(creep, action, decision, index, reporter) {
    const attempted = actionAtCall(action);
    // Direct adjacent steps cannot invoke a second pathfinder or detour off
    // the planner's validated route. Direction constants are the API's1–8.
    const direction = action.method === 'move' ? [[8, 1, 2], [7, 0, 3], [6, 5, 4]]
        [action.target.y - creep.y + 1][action.target.x - creep.x + 1] : null;
    const returnValue = creep[action.method](action.method === 'move' ? direction : action.target);
    if (decision) reporter.attempt(decision, index, attempted, returnValue);
    return returnValue;
}

// Preflight the entire ownership group BEFORE logging/executing any movement.
// Capture keeps every higher-priority plan; contest may replace ordinary
// attack approach. A conflict releases the entire group before execution.
export function prepareSecondaryMovement(secondary, friends, enemies, flag, engagements,
    escort = null, pairPlan = null, spacing = null, openingJoint = null) {
    if (!secondary?.movement) return { secondary, moves: null };
    const { memberIds, kind = 'contest' } = secondary.movement;
    let { steps } = secondary.movement;
    const cancel = reason => ({ secondary: secondary.cancel(`${kind}-${reason}`), moves: null });
    if (!(steps instanceof Map) || memberIds.some(id => !steps.has(id))) return cancel('route-unavailable');
    for (const id of memberIds) {
        const actor = friends.find(c => c.id === id);
        if (!actor || typeof actor.move !== 'function' || escort && [escort.healerId, escort.allyId].includes(id) || pairPlan?.moves.has(id))
            return cancel('movement-priority');
        const plan = selectMovementPlan(actor, enemies, flag, engagements.get(id), friends, false,
            spacing ? { ...spacing, reserved: new Set() } : null);
        if (!(kind === 'capture' ? ['flag-fallback'] : ['flag-fallback', 'combat-approach', 'combat-in-range']).includes(plan.reason))
            return cancel('movement-priority');
        const next = steps.get(id);
        if (next && Math.max(Math.abs(next.x - actor.x), Math.abs(next.y - actor.y)) !== 1)
            return cancel('route-unavailable');
    }
    // All-stationary is a possible outcome of every admitted batch. Reject
    // lost CURRENT support first; proposed moves need not all be admissible.
    if (!secondaryStepSupport(friends, memberIds, new Map(memberIds.map(id => [id, null]))))
        return cancel('step-support-unavailable');
    const all = spacing?.creeps;
    if (!Array.isArray(all) || all.length > 28) return cancel('occupancy-unknown');
    let jointProposal;
    if (openingJoint && secondary.state.phase === 'active' && kind === 'capture') {
        const proposed = [...steps.values()].filter(Boolean);
        const converging = proposed.some((p,i) => proposed.some((q,j) => j<i && p.x===q.x && p.y===q.y));
        let status = jointProposalStatus['no-convergence'];
        if (converging) {
            const propose = openingJoint.holdAware === true ? proposeHoldAwareJoint : proposeOpeningJoint;
            const result = propose({ observation: openingJoint.observation,
                mission: secondary, steps, spacing, probe: openingJoint.probe, adoption: openingJoint.adoption });
            status = jointProposalStatus[result.reason];
            steps = result.steps;
        }
        // Original diagnostic member slots, not enumeration or actor-ID weights.
        const slots = secondary.state.selection.memberIds;
        const mask = slots.reduce((bits,id,i) => {
            const a=steps.get(id),b=secondary.movement.steps.get(id);
            return bits | (a?.x!==b?.x || a?.y!==b?.y ? 1<<i : 0);
        },0);
        jointProposal = [status,mask];
    }
    const destinations = [...steps.values()].filter(Boolean);
    const selected = selectSecondaryTravelSteps(friends, memberIds, steps, all);
    const point = p => p ? { x: p.x, y: p.y } : null;
    // Existing pre-action snapshot only. Fixed fields, <=4 actors, no paths or
    // persistent diagnostic state. An admitted step is not observed movement.
    const actors = memberIds.slice(0, 4).map(actorId => {
        const proposed = steps.get(actorId), admitted = selected.moves.get(actorId);
        const occupied = proposed && all.some(c => c.exists !== false && c.hits > 0 && c.x === proposed.x && c.y === proposed.y);
        const converging = proposed && destinations.filter(p => p.x === proposed.x && p.y === proposed.y).length > 1;
        return { actorId, proposed: point(proposed), admitted: point(admitted),
            holdReason: admitted ? null : !proposed ? 'no-step' : occupied ? 'occupied' : converging ? 'converging'
                : selected.examined ? 'subset-hold' : 'group-hold' };
    });
    const travel = { examined: selected.examined, bestSize: selected.bestSize, tied: selected.tied, actors };
    return { secondary: { ...secondary, diagnostic: { ...secondary.diagnostic, travel,
        ...(jointProposal ? {jointProposal} : {}) } }, moves: selected.moves };
}

export function moveCreeps(myCreeps, enemies, flag, engagements = new Map(), fallbackById = new Map(),
    escort = null, reportEscort = null, reporter = null, scoutHoldEnabled = false, pairPlan = null, spacingContext = null,
    ordinaryFallbackById = null, objectiveMoves = null, objectiveKind = 'contest', healerClosing = null,
    engagementMoves = null, openingCentreIds = null) {
    const spacing = spacingContext ? { ...spacingContext, reserved: new Set() } : null;
    const ownedIds = new Set(myCreeps.map(creep => creep.id));
    for (const id of engagements.keys()) if (!ownedIds.has(id)) engagements.delete(id);
    // Vacating leader is executed before its follower regardless of observation order.
    const leader = pairPlan?.moves.size ? myCreeps.find(creep => creep.id === pairPlan.context.leaderId) : null;
    const ordered = leader ? [leader, ...myCreeps.filter(creep => creep !== leader)] : myCreeps;
    let leaderAccepted = false;
    for (const creep of ordered) {
        const pair = pairPlan?.context && ([pairPlan.context.leaderId, pairPlan.context.followerId].includes(creep.id) ||
            !pairPlan.context.leaderId && creep === myCreeps[0]) ? { pair: pairPlan.context } : {};
        if (escort && escort.healerId === creep.id) {
            const action = escort.mode === 'move-attempt'
                ? { method: 'moveTo', target: escort.ally, targetKind: 'creep' } : null;
            const outcome = escort.mode === 'move-attempt' ? 'selected'
                : escort.mode === 'hold' ? 'hold' : 'no-action';
            const decision = reportDecision(reporter, { phase: 'movement', channel: 'movement',
                actorId: creep.id, outcome,
                reason: escort.mode === 'move-attempt' ? 'escort-approach'
                    : escort.mode === 'hold' ? 'escort-in-range' : 'escort-fatigue-pause',
                actions: action ? [action] : [], ...pair });
            let returnCode = null;
            if (action) {
                const attempted = actionAtCall(action);
                returnCode = creep[action.method](action.target) ?? null;
                if (decision) reporter.attempt(decision, 0, attempted, returnCode);
            }
            reportEscort?.({ event: escort.mode, healerId: creep.id, allyId: escort.allyId,
                range: escort.distance, targetId: escort.mode === 'move-attempt' ? escort.allyId : null,
                returnCode });
            continue;
        }
        const paired = pairPlan?.moves.get(creep.id);
        if (paired) {
            engagements.delete(creep.id);
            const rejected = paired.followsLeader && !leaderAccepted;
            const action = paired.target && !rejected
                ? { method: 'moveTo', target: paired.target, targetKind: 'position' } : null;
            const decision = reportDecision(reporter, { phase: 'movement', channel: 'movement',
                actorId: creep.id, outcome: action ? 'selected' : 'hold',
                reason: rejected ? 'pair-leader-command-rejected' : paired.reason,
                actions: action ? [action] : [], ...pair });
            if (action) {
                const attempted = actionAtCall(action);
                const returnCode = paired.followsLeader
                    ? creep.moveTo(action.target, { ignore: [leader] }) : creep.moveTo(action.target);
                if (creep === leader) leaderAccepted = returnCode === 0;
                if (decision) reporter.attempt(decision, 0, attempted, returnCode);
            }
            continue;
        }
        const fallback = fallbackById.has(creep.id) ? fallbackById.get(creep.id) : flag;
        let plan = selectMovementPlan(creep, enemies, fallback, engagements.get(creep.id), myCreeps,
            scoutHoldEnabled && !fallbackById.has(creep.id), spacing);
        // Do not pass the travel objective as the centre/rejoin safety anchor.
        // Only ordinary fallback is substitutable; recovery/escort/combat wins.
        if (plan.reason === 'flag-fallback' && ordinaryFallbackById?.has(creep.id)) {
            plan = { ...plan, target: ordinaryFallbackById.get(creep.id) };
        }
        const objectiveOwned = objectiveMoves?.has(creep.id);
        const engagementOwned = !objectiveOwned && engagementMoves?.has(creep.id);
        if (objectiveOwned) {
            const target = objectiveMoves.get(creep.id);
            plan = { ...plan, target, outcome: target ? 'selected' : 'hold', targetKind: 'position',
                reason: openingCentreIds?.has(creep.id)
                    ? `opening-centre-${target ? 'step' : 'hold'}`
                    : `${objectiveKind}-route-${target ? 'step' : 'hold'}` };
        }
        if (engagementOwned) {
            const target = engagementMoves.get(creep.id);
            plan = { ...plan, target, outcome: target ? 'selected' : 'hold', targetKind: 'position',
                reason: `support-locked-${target ? 'step' : 'hold'}` };
        }
        // Closing owns only an ordinary hold. Existing owners and pressure
        // retreat keep priority; disabled calls never evaluate this policy.
        if (healerClosing && !objectiveOwned && !engagementOwned && typeof creep.move === 'function') {
            plan = improveHealerHold({ creep, friends: myCreeps, enemies, spacing,
                baseline: plan, owner: 'ordinary', healModifier: healerClosing.healModifier }, localRetreatStep);
        }
        if (plan.engagement) engagements.set(creep.id, plan.engagement);
        else engagements.delete(creep.id);
        const action = plan.target
            ? { method: objectiveOwned || engagementOwned || plan.reason === 'healer-useful-close' ? 'move' : 'moveTo',
                target: plan.target, targetKind: plan.targetKind } : null;
        const decision = reportDecision(reporter, { phase: 'movement', channel: 'movement',
            actorId: creep.id, outcome: plan.outcome, reason: plan.reason,
            actions: action ? [action] : [], ...pair });
        if (action) {
            // A failed/unknown call does not free the tile for another retreat
            // this tick; the next observation rebuilds these local reservations.
            if (['ranged-melee-retreat', 'healer-pressure-retreat'].includes(plan.reason))
                spacing.reserved.add(`${plan.target.x},${plan.target.y}`);
            issueAction(creep, action, decision, 0, reporter);
        }
    }
}

export function executeTactics(myCreeps, enemies, damagedFriends, reporter = null, observation = null) {
    // Scoped to this invocation/tick. Logging never supplies policy accounting.
    const context = observation ? createSpilloverContext(observation, myCreeps, enemies) : null;
    const earlierIntents = [];
    let sequence = 0;
    for (const creep of myCreeps) {
        const healingPlan = selectHealingDecision(creep, damagedFriends);
        const healing = healingPlan.action;
        const healingAction = healing ? { ...healing, targetKind: 'creep' } : null;
        const healingDecision = reportDecision(reporter, { phase: 'tactics', channel: 'healing',
            actorId: creep.id, outcome: healingPlan.outcome, reason: healingPlan.reason,
            actions: healingAction ? [healingAction] : [] });
        if (healingAction) issueAction(creep, healingAction, healingDecision, 0, reporter);

        const combatPlan = selectSpilloverDecision(creep, enemies, healing, context
            ? { ...context, sequence, earlierIntents } : null);
        const combatActions = combatPlan.actions.map(action => ({ ...action, targetKind: 'creep' }));
        const combatDecision = reportDecision(reporter, { phase: 'tactics', channel: 'combat',
            actorId: creep.id, outcome: combatPlan.outcome, reason: combatPlan.reason,
            actions: combatActions });
        combatActions.forEach((action, index) => {
            const returnCode = issueAction(creep, action, combatDecision, index, reporter);
            if (context) {
                // Keep one overflow sentinel (65); never truncate to a valid64
                // budget. Normal14-actor execution has at most28 combat calls.
                if (earlierIntents.length <= 64) earlierIntents.push({
                    tick: context.tick, sequence, actionId: `${context.tick}:${sequence}`,
                    actorId: creep.id, method: action.method, targetId: action.target.id, returnCode,
                });
                sequence++;
            }
        });
    }
}
