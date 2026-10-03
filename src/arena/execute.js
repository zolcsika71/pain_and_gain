import { selectHealingDecision } from '../tactics/healing.js';
import { selectCombatDecision } from '../tactics/combat.js';
import { selectMovementPlan } from '../tactics/movement.js';

function reportDecision(reporter, decision) {
    return reporter?.decision(decision) ?? null;
}

function actionAtCall(action) {
    return { ...action, target: { id: action.target.id ?? null, x: action.target.x, y: action.target.y } };
}

function issueAction(creep, action, decision, index, reporter) {
    const attempted = actionAtCall(action);
    const returnValue = creep[action.method](action.target);
    if (decision) reporter.attempt(decision, index, attempted, returnValue);
}

export function moveCreeps(myCreeps, enemies, flag, engagements = new Map(), fallbackById = new Map(),
    escort = null, reportEscort = null, reporter = null, scoutHoldEnabled = false, pairPlan = null) {
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
        const plan = selectMovementPlan(creep, enemies, fallback, engagements.get(creep.id), myCreeps,
            scoutHoldEnabled && !fallbackById.has(creep.id));
        if (plan.engagement) engagements.set(creep.id, plan.engagement);
        else engagements.delete(creep.id);
        const action = plan.target
            ? { method: 'moveTo', target: plan.target, targetKind: plan.targetKind } : null;
        const decision = reportDecision(reporter, { phase: 'movement', channel: 'movement',
            actorId: creep.id, outcome: plan.outcome, reason: plan.reason,
            actions: action ? [action] : [], ...pair });
        if (action) issueAction(creep, action, decision, 0, reporter);
    }
}

export function executeTactics(myCreeps, enemies, damagedFriends, reporter = null) {
    for (const creep of myCreeps) {
        const healingPlan = selectHealingDecision(creep, damagedFriends);
        const healing = healingPlan.action;
        const healingAction = healing ? { ...healing, targetKind: 'creep' } : null;
        const healingDecision = reportDecision(reporter, { phase: 'tactics', channel: 'healing',
            actorId: creep.id, outcome: healingPlan.outcome, reason: healingPlan.reason,
            actions: healingAction ? [healingAction] : [] });
        if (healingAction) issueAction(creep, healingAction, healingDecision, 0, reporter);

        const combatPlan = selectCombatDecision(creep, enemies, healing);
        const combatActions = combatPlan.actions.map(action => ({ ...action, targetKind: 'creep' }));
        const combatDecision = reportDecision(reporter, { phase: 'tactics', channel: 'combat',
            actorId: creep.id, outcome: combatPlan.outcome, reason: combatPlan.reason,
            actions: combatActions });
        combatActions.forEach((action, index) => issueAction(creep, action,
            combatDecision, index, reporter));
    }
}
