import { hasFunctioningPart } from '../tactics/body.js';

const threatRange = 5;
const defenderRange = 3;
const arrivalMargin = 5;
const maxRouteSteps = 40;
const maxAssignmentTicks = 60;
const lastStartTick = 80;
const contestInterval = 20;
// Rules-based match end, reserving the existing assignment and nominal return
// route budgets. This is not a guarantee of arrival or scoring uptime.
const lastContestStartTick = 2000 - maxAssignmentTicks - maxRouteSteps;

function range(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function isScout(creep) {
    return creep.my && creep.hits > 0 && creep.hits === creep.hitsMax &&
        creep.body.length > 0 && creep.body.every(part => part.type === 'move') &&
        hasFunctioningPart(creep, 'move');
}

function isArmed(creep) {
    return hasFunctioningPart(creep, 'attack') || hasFunctioningPart(creep, 'ranged_attack');
}

function isSafeTarget(scout, flag, enemies, routeSteps, evaluations, contest = false) {
    const evaluation = { scoutId: scout.id, flagId: flag.id, scoutRange: range(scout, flag),
        maxScoutSteps: maxRouteSteps, enemyRoutes: [] };
    evaluations?.push(evaluation);
    const occupant = contest && enemies.find(enemy => range(enemy, flag) === 0);
    if (occupant) {
        evaluation.reason = 'target-occupied';
        evaluation.enemyId = occupant.id;
        return null;
    }
    const nearby = enemies.find(enemy => (!contest || isArmed(enemy)) &&
        (range(enemy, scout) <= threatRange || range(enemy, flag) <= threatRange));
    if (nearby) {
        evaluation.reason = 'enemy-near-scout-or-target';
        evaluation.enemyId = nearby.id;
        evaluation.enemyRangeToScout = range(nearby, scout);
        evaluation.enemyRangeToFlag = range(nearby, flag);
        evaluation.threatRange = threatRange;
        return null;
    }
    const steps = routeSteps(scout, flag, result => { evaluation.scoutRoute = result; });
    evaluation.scoutSteps = steps;
    if (!Number.isInteger(steps) || steps < evaluation.scoutRange || steps > maxRouteSteps) {
        evaluation.reason = 'scout-route-ineligible';
        return null;
    }
    evaluation.requiredEnemySteps = steps + arrivalMargin;
    for (const enemy of enemies) {
        // Linear range is only a lower bound on arrival time. Ask the pathfinder
        // whenever that bound does not already establish the margin.
        const enemyRoute = { enemyId: enemy.id, range: range(enemy, flag) };
        evaluation.enemyRoutes.push(enemyRoute);
        if (enemyRoute.range > steps + arrivalMargin) {
            enemyRoute.result = 'lower-bound-safe';
            continue;
        }
        const enemySteps = routeSteps(enemy, flag, result => { enemyRoute.route = result; });
        enemyRoute.steps = enemySteps;
        enemyRoute.result = !Number.isInteger(enemySteps) ? 'unknown' :
            enemySteps <= steps + arrivalMargin ? 'too-close' : 'safe';
        if (enemyRoute.result !== 'safe') {
            evaluation.reason = 'enemy-arrival-margin';
            return null;
        }
    }
    evaluation.reason = 'eligible';
    return steps;
}

// A finished attempt stays finished for this match: no chaining or reassignment.
export function planScoutFlagAllocation({ tick, flags, myCreeps, enemies }, previous,
    routeSteps, attackEffectType, report) {
    const first = flags[0];
    const fallbackById = new Map();
    const finish = (state, event, reason, details = {}) => {
        report?.({ tick, event, reason, firstFlagId: first?.id ?? null,
            state, objectiveId: details.scoutId && fallbackById.has(details.scoutId)
                ? fallbackById.get(details.scoutId)?.id ?? null : first?.id ?? null,
            ...details });
        return { state, fallbackById };
    };
    if (previous?.finished) return finish(previous, 'reject', 'attempt-finished');
    // An opening assignment keeps its original rules across tick 80. A finished
    // attempt of either kind prevents every later assignment in this match.
    const contest = previous?.scoutId ? previous.mode === 'contest' : tick > lastStartTick;
    const livingEnemies = enemies.filter(enemy => !enemy.my && enemy.hits > 0);
    const firstThreat = first?.my === true
        ? livingEnemies.find(enemy => range(enemy, first) <= threatRange) : null;
    const threatened = !first || first.my !== true || Boolean(firstThreat);
    if (threatened) {
        return finish(previous?.scoutId ? { finished: true } : null,
            previous?.scoutId ? 'cancel' : 'reject', !first || first.my !== true
                ? 'first-flag-not-owned' : 'first-flag-threatened',
            { scoutId: previous?.scoutId ?? null, targetId: previous?.targetId ?? null,
                ...(firstThreat ? { threatEnemyId: firstThreat.id,
                    threatRange: range(firstThreat, first) } : {}) });
    }

    if (contest && !previous?.scoutId) {
        if (tick > lastContestStartTick) return finish(null, 'reject', 'contest-window-closed');
        if (tick % contestInterval !== 0) return finish(null, 'reject', 'contest-poll-wait');
    }

    const scouts = previous?.scoutId
        ? [myCreeps.find(creep => creep.id === previous.scoutId)]
        : myCreeps.filter(creep => isScout(creep) && creep.fatigue === 0)
            .sort((a, b) => range(b, first) - range(a, first) || a.id.localeCompare(b.id));
    const scout = scouts[0];
    const fatigued = contest && scout && scout.fatigue !== 0;
    if (!scout || !isScout(scout) || fatigued || (previous && tick - previous.startedAt > maxAssignmentTicks)) {
        return finish(previous?.scoutId ? { finished: true } : null,
            previous?.scoutId ? 'cancel' : 'reject', !scout ? 'no-scout' :
                !isScout(scout) ? 'scout-ineligible' : fatigued ? 'scout-fatigued' : 'assignment-timeout',
            { scoutId: previous?.scoutId ?? null, targetId: previous?.targetId ?? null });
    }
    const defender = myCreeps.some(creep => creep.id !== scout.id && creep.my && creep.hits > 0 &&
        (hasFunctioningPart(creep, 'attack') || hasFunctioningPart(creep, 'ranged_attack')) &&
        range(creep, first) <= defenderRange);
    if (!defender) {
        return finish(previous?.scoutId ? { finished: true } : null,
            previous?.scoutId ? 'cancel' : 'reject', 'no-first-flag-defender',
            { scoutId: scout.id, targetId: previous?.targetId ?? null });
    }

    // The late opportunity is specifically an unarmed-opponent endgame, not
    // permission to raid around surviving combatants. Unarmed creeps still
    // threaten the first flag, occupy targets and compete in every arrival test.
    const armedEnemy = contest && livingEnemies.find(isArmed);
    if (armedEnemy) return finish(previous?.scoutId ? { finished: true } : null,
        previous?.scoutId ? 'cancel' : 'reject', 'armed-enemy-remains',
        { scoutId: scout.id, targetId: previous?.targetId ?? null, threatEnemyId: armedEnemy.id });

    if (previous?.scoutId) {
        const flag = flags.find(candidate => candidate.id === previous.targetId);
        if (flag?.my === true) return finish({ finished: true }, 'complete', 'target-owned',
            { scoutId: scout.id, targetId: previous.targetId });
        const evaluations = [];
        const expectedOwner = contest ? false : undefined;
        if (!flag || flag.my !== expectedOwner || flag.effectType !== attackEffectType ||
            isSafeTarget(scout, flag, livingEnemies, routeSteps, evaluations, contest) === null) {
            return finish({ finished: true }, 'cancel', !flag ? 'target-missing' :
                flag.my !== expectedOwner ? 'target-contested' :
                    flag.effectType !== attackEffectType ? 'target-effect-changed' : 'target-unsafe',
            { scoutId: scout.id, targetId: previous.targetId, evaluations });
        }
        fallbackById.set(scout.id, range(scout, flag) === 0 ? null : flag);
        return finish(previous, 'retain', 'target-eligible',
            { scoutId: scout.id, targetId: flag.id, evaluations });
    }

    const evaluations = [];
    // Compare arrival opportunities before committing to one scout. Distance
    // from the defended first flag is only a tie-break, not a route estimate.
    const targets = flags.filter(flag => flag.my === (contest ? false : undefined) && flag.effectType === attackEffectType)
        .sort((a, b) => a.id.localeCompare(b.id));
    const choices = scouts.flatMap((candidate, scoutRank) => targets.map(flag => ({
        flag, scout: candidate, scoutRank,
        steps: isSafeTarget(candidate, flag, livingEnemies, routeSteps, evaluations, contest),
    }))).filter(choice => choice.steps !== null)
        .sort((a, b) => a.steps - b.steps || a.scoutRank - b.scoutRank ||
            a.flag.id.localeCompare(b.flag.id));
    if (choices.length === 0) return finish(null, 'reject', 'no-eligible-target',
        { scoutId: scout.id, evaluations });
    const { flag, scout: assignedScout } = choices[0];
    fallbackById.set(assignedScout.id, flag);
    return finish({ scoutId: assignedScout.id, targetId: flag.id, startedAt: tick,
        ...(contest ? { mode: 'contest' } : {}) }, 'assign',
        'shortest-eligible-route', { scoutId: assignedScout.id, targetId: flag.id, evaluations });
}
