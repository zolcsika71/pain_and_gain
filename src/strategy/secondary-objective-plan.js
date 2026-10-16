import { selectSecondaryObjective, secondaryObjectiveLimits as limits } from './objectives.js';
import { contestReadiness, contestOccupant, contestRange, checkContestRoutes } from './supported-contest.js';

export const secondaryTrialLimits = Object.freeze({ squads: 3, cadence: 10, cacheTicks: 5,
    queryOps: 1000, acquisitionQueries: 24, activeQueries: 4 });
const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const same = (a, b) => a.x === b.x && a.y === b.y;
const part = (c, type) => c.body.filter(p => p.type === type && p.hits > 0).length;
const armed = c => part(c, 'attack') + part(c, 'ranged_attack') > 0;
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const valueType = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

// Observation-derived path suffix, not a new search or proof of displacement.
function suffix(report, actor, tick) {
    if (!report || !actor) return null;
    const index = same(report.from, actor) ? -1 : report.path.findIndex(p => same(p, actor));
    if (index < 0 && !same(report.from, actor)) return null;
    return { ...report, tick, from: { x: actor.x, y: actor.y }, path: report.path.slice(index + 1) };
}

/** Bounded coordinator for one existing squad/attempt. Only `search` crosses
 * the Arena boundary; this planner issues no actor commands or diagnostics.
 */
export function planSecondaryObjective(observation, membership, centre, previous, { search, unavailableIds = [] } = {}) {
    const { tick, flags, myCreeps, enemies, creeps } = observation;
    const validTick = Number.isInteger(tick) && tick >= 1 && tick <= limits.matchTicks;
    let control = previous && !(validTick && tick < previous.lastTick) ? previous :
        { selection: null, squad: null, cache: [], lastAcquireAt: null, lastTick: null };
    control = { ...control, lastTick: validTick ? tick : control.lastTick };
    let queries = 0, reportedOps = 0, cacheHits = 0;
    let rejectedQuery = null, routeRejectionReason = null;
    let excludedCandidates = null;
    let ownedSteps = null;
    const result = (reason, evaluation = null) => {
        const s = control.selection, active = s?.phase === 'active';
        const target = active ? flags.find(f => f.id === s.targetId) : null;
        return { state: control, fallbackById: new Map(target && !control.contest ? s.memberIds.map(id => [id, target]) : []),
            ...(active ? { movement: { kind: control.contest ? 'contest' : 'capture', memberIds: [...s.memberIds],
                steps: control.contest ? ownedSteps : new Map(control.cache.map(r => [r.actorId, r.path[0] ?? null])) }, cancel: stop } : {}),
            diagnostic: { phase: s?.phase ?? 'idle', reason, squadId: control.squad?.id ?? null,
                targetId: active ? s.targetId : null, memberIds: active ? [...s.memberIds] : [],
                startedAt: s?.startedAt ?? null, unchanged: s?.unchanged ?? 0,
                queries, reportedOps, cacheHits,
                ...(control.contest ? { mode: control.contest.mode,
                    progressAge: validTick ? tick - control.contest.lastProgressAt : null } : {}),
                ...(rejectedQuery ? { rejectedQuery } : {}),
                ...(excludedCandidates ? { excludedCandidates } : {}),
                ...(evaluation ? { utility: evaluation.utility, territorialSwing: evaluation.territorialSwing,
                    ownCapacityLoss: evaluation.ownCapacityLoss, enemyCapacityRelief: evaluation.enemyCapacityRelief } : {}) } };
    };
    const stop = reason => {
        if (control.selection?.phase === 'active') control.selection = { ...control.selection, phase: 'finished', reason,
            lastTick: validTick ? tick : control.selection.lastTick };
        return result(reason);
    };
    if (control.selection?.phase === 'finished') return result(control.selection.reason);
    const complete = Array.isArray(creeps) && creeps.length <= limits.army * 2 &&
        creeps.every(c => c && typeof c.my === 'boolean') &&
        Array.isArray(myCreeps) && Array.isArray(enemies) &&
        creeps.filter(c => c.my === true).length === myCreeps.length &&
        creeps.filter(c => c.my === false && c.hits > 0).length === enemies.length &&
        [...myCreeps, ...enemies].every(c => creeps.includes(c));
    if (!validTick || !complete) return stop('unsupported-observation');
    if (!membership?.initialized || membership.lastTick !== tick || !Array.isArray(membership.squads) ||
        membership.squads.length > secondaryTrialLimits.squads || !Array.isArray(membership.members) ||
        membership.members.length > limits.army) return stop('membership-unavailable');
    const input = (squad, routes) => ({ ...observation, centreId: centre?.id, squad, routes,
        observationComplete: complete, unavailableIds });
    const eligibleMembers = squad => Array.isArray(squad?.memberIds) && squad.memberIds.length >= 2 &&
        squad.memberIds.length <= limits.squad && squad.memberIds.every(id =>
            membership.members.some(m => m?.id === id && m.squadId === squad.id && m.participating && m.capable && m.canMoveNow));
    function rejectRoute(reason, actor, target, r, returned = true) {
        routeRejectionReason = reason;
        // Fixed scalar summary only: never copy a path, raw value or exception.
        const path = r?.path, incomplete = r?.incomplete, ops = r?.ops;
        rejectedQuery ??= { ordinal: queries, origin: { x: actor.x, y: actor.y }, goal: { x: target.x, y: target.y },
            pathType: returned ? valueType(path) : 'unknown', pathIsArray: returned ? Array.isArray(path) : null,
            pathLength: Array.isArray(path) ? path.length : null,
            incompleteType: returned ? valueType(incomplete) : 'unknown',
            incomplete: typeof incomplete === 'boolean' ? incomplete : null,
            ops: Number.isSafeInteger(ops) && ops >= 0 ? ops : null };
        return null;
    }
    const lowerBound = (squad, target) => Math.max(...squad.memberIds.map(id =>
        range(myCreeps.find(c => c.id === id), target)));
    function excludeCandidate(kind, target, minimum, pathLength = null) {
        excludedCandidates ??= { geometry: 0, routeLimit: 0, first: null };
        excludedCandidates[kind]++;
        excludedCandidates.first ??= { flagId: target.id,
            reason: kind === 'geometry' ? 'geometric-route-limit' : 'route-limit-exceeded',
            lowerBound: minimum, queryOrdinal: kind === 'geometry' ? null : queries, pathLength };
    }
    function collect(squad, targets, goalRange = () => 0) {
        const reports = [];
        const acquiring = control.selection?.phase !== 'active';
        targetsLoop: for (const target of targets) {
            const targetReports = [];
            for (const id of [...squad.memberIds].sort()) {
                const actor = myCreeps.find(c => c.id === id);
                const cap = control.selection?.phase === 'active' ? secondaryTrialLimits.activeQueries : secondaryTrialLimits.acquisitionQueries;
                if (queries >= cap) { routeRejectionReason = 'route-budget-exhausted'; return null; }
                queries++;
                let r;
                try { r = search(actor, { pos: target, range: goalRange(actor) }, { maxOps: secondaryTrialLimits.queryOps }); }
                catch { reportedOps = null; return rejectRoute('route-result-unsupported', actor, target, undefined, false); }
                if (!r || !Number.isInteger(r.ops) || r.ops < 0 || r.ops > secondaryTrialLimits.queryOps) {
                    reportedOps = null; return rejectRoute('route-result-unsupported', actor, target, r);
                }
                reportedOps += r.ops;
                if (!Array.isArray(r.path)) return rejectRoute('route-path-unsupported', actor, target, r);
                if (r.path.length > limits.route) {
                    if (!acquiring) return rejectRoute('route-limit-exceeded', actor, target, r);
                    // Unknown required data is still a poll failure, not permission
                    // to skip it under a candidate-limit classification.
                    if (typeof r.incomplete !== 'boolean') return rejectRoute('route-incomplete-unsupported', actor, target, r);
                    excludeCandidate('routeLimit', target, lowerBound(squad, target), r.path.length);
                    continue targetsLoop;
                }
                if (typeof r.incomplete !== 'boolean') return rejectRoute('route-incomplete-unsupported', actor, target, r);
                targetReports.push({ actorId: id, flagId: target.id, tick, searchedAt: tick,
                    from: { x: actor.x, y: actor.y }, path: r.path.map(p => ({ x: p?.x, y: p?.y })),
                    incomplete: r.incomplete, ops: r.ops });
            }
            reports.push(...targetReports);
        }
        return reports;
    }
    const bind = flag => ({ id: flag.id, x: flag.x, y: flag.y, effectType: flag.effectType,
        scorePerTick: flag.scorePerTick, my: flag.my });
    const matches = (flag, binding) => flag && Object.keys(binding).every(k => flag[k] === binding[k]);
    function runContest() {
        const s = control.selection, c = control.contest;
        const squad = membership.squads.find(squad => squad.id === control.squad.id);
        if (!squad || !eligibleMembers(squad) || [...squad.memberIds].sort().join('\0') !== s.memberIds.join('\0'))
            return stop('squad-unavailable');
        const readiness = contestReadiness(input(squad, []));
        if (readiness) return stop(readiness);
        const target = flags.find(f => f.id === s.targetId);
        if (target?.my === true) return stop('captured');
        if (!matches(target, c.flag) || !matches(centre, c.centre)) return stop('binding-changed');
        if (tick - s.startedAt >= limits.lifetime) return stop('timeout');
        const group = s.memberIds.map(id => myCreeps.find(actor => actor.id === id));
        const distance = Math.max(...group.filter(armed).map(actor => range(actor, target)));
        if (tick > c.lastTick) {
            control.contest = { ...c, lastTick: tick,
                bestDistance: Math.min(c.bestDistance, distance),
                lastProgressAt: distance < c.bestDistance ? tick : c.lastProgressAt };
        }
        if (tick - control.contest.lastProgressAt >= limits.unchanged) return stop('no-displacement');
        // No contest-to-capture-to-contest switch: mode becomes capture once.
        const occupant = enemies.find(e => e.id === c.occupantId && e.hits > 0 && same(e, target));
        const mode = c.mode === 'capture' || !occupant ? 'capture' : 'contest';
        let routes = c.mode === mode ? control.cache.map(r => suffix(r, myCreeps.find(a => a.id === r.actorId), tick)).filter(Boolean) : [];
        const reusable = routes.length === group.length;
        if (mode === 'contest' && !contestOccupant(input(squad, []), target)) return stop('contest-defence-changed');
        if (!reusable || routes.some(r => tick - r.searchedAt >= secondaryTrialLimits.cacheTicks)) {
            routes = collect(squad, [target], mode === 'contest' ? contestRange : () => 0);
            if (!routes) return stop(routeRejectionReason);
        } else cacheHits = routes.length;
        let reason;
        if (mode === 'contest') {
            const checked = checkContestRoutes(input(squad, routes), target, routes, c.occupantId);
            if (checked.reason) return stop(checked.reason);
            ownedSteps = checked.steps;
            reason = 'contest-retained';
            control.selection = { ...s, lastTick: tick, positions: group.map(a => ({ x: a.x, y: a.y })) };
        } else {
            // Unchanged capture admission on the pinned flag with the original
            // active state: deadline, binding and attempt never restart.
            const checked = selectSecondaryObjective(input(squad, routes), s);
            if (checked.state.phase !== 'active') return stop(checked.reason);
            control.selection = checked.state;
            ownedSteps = new Map(routes.map(r => [r.actorId, r.path[0] ?? null]));
            reason = c.mode === mode ? checked.reason : 'contest-capture-handoff';
        }
        control = { ...control, contest: { ...control.contest, mode }, cache: routes };
        return result(reason);
    }
    if (control.selection?.phase === 'active' && control.contest) return runContest();
    if (control.selection?.phase === 'active') {
        const squad = membership.squads.find(s => s.id === control.squad.id);
        if (!squad || !eligibleMembers(squad)) return stop('squad-unavailable');
        const routes = control.cache.map(r => suffix(r, myCreeps.find(c => c.id === r.actorId), tick)).filter(Boolean);
        const cached = selectSecondaryObjective(input(squad, routes), control.selection);
        const reusable = routes.length === squad.memberIds.length;
        // Safety/ownership/timeout/stall always revalidate; no search for an
        // already-terminal result, except a missing off-path route report.
        if (cached.state.phase !== 'active' && (cached.reason !== 'objective-unavailable' || reusable)) {
            control = { ...control, selection: cached.state, cache: [] }; return result(cached.reason);
        }
        const fresh = reusable && routes.every(r => tick - r.searchedAt < secondaryTrialLimits.cacheTicks);
        if (fresh) {
            cacheHits = routes.length;
            control = { ...control, selection: cached.state, cache: routes };
            return result(cached.reason, cached.evaluation);
        }
        const target = flags.find(f => f.id === control.selection.targetId);
        const refreshed = collect(squad, [target]);
        if (!refreshed) return stop(routeRejectionReason);
        const checked = selectSecondaryObjective(input(squad, refreshed), control.selection);
        control = { ...control, selection: checked.state, cache: checked.state.phase === 'active' ? refreshed : [] };
        return result(checked.reason, checked.evaluation);
    }
    if (control.lastAcquireAt !== null && tick - control.lastAcquireAt < secondaryTrialLimits.cadence) return result('acquisition-cadence');
    if (!centre || centre.my !== true) return result('centre-not-owned');
    control = { ...control, lastAcquireAt: tick };
    // Filter using the unchanged selector's role/support/defence/observation
    // gates before paying for routes. Empty routes cannot acquire an objective.
    const eligible = membership.squads.filter(eligibleMembers).filter(s =>
        selectSecondaryObjective(input(s, [])).reason === 'no-useful-objective');
    const score = squad => {
        const members = squad.memberIds.map(id => myCreeps.find(c => c.id === id));
        const healers = members.filter(c => part(c, 'heal'));
        return { squad, gap: Math.max(...members.filter(armed).map(c => Math.min(...healers.map(h => range(c, h))))),
            weapons: members.filter(armed).length };
    };
    const chosen = eligible.map(score).sort((a, b) => a.gap - b.gap || b.weapons - a.weapons || byId(a.squad, b.squad))[0]?.squad;
    if (!chosen) return result('no-eligible-squad');
    const targets = flags.filter(f => f.id !== centre.id && f.my !== true &&
        tick + Math.max(...chosen.memberIds.map(id => range(myCreeps.find(c => c.id === id), f))) + 1 < limits.matchTicks &&
        !creeps.some(c => c.hits > 0 && c.exists !== false && same(c, f)) &&
        !enemies.some(e => armed(e) && range(e, f) <= limits.threatRange)).sort(byId).filter(target => {
        // Range0 needs the exact cell. Even diagonal steps cannot beat this
        // lower bound; obstacles may only make the real route longer.
        const minimum = lowerBound(chosen, target);
        if (minimum <= limits.route) return true;
        excludeCandidate('geometry', target, minimum);
        return false;
    });
    const reports = collect(chosen, targets);
    if (!reports) return result(routeRejectionReason);
    const selected = selectSecondaryObjective(input(chosen, reports));
    control = { ...control, selection: selected.state, squad: selected.state.phase === 'active'
        ? { id: chosen.id, memberIds: [...chosen.memberIds] } : null,
        cache: selected.state.phase === 'active' ? reports.filter(r => r.flagId === selected.objectiveId) : [] };
    if (selected.state.phase !== 'active') {
        // Safe capture keeps first refusal. Contest uses only unspent work in
        // this invocation; no additional squad/route budget is created.
        const contestSquad = eligible.filter(s => !contestReadiness(input(s, []))).map(score)
            .sort((a, b) => a.gap - b.gap || b.weapons - a.weapons || byId(a.squad, b.squad))[0]?.squad;
        if (!contestSquad) return result(selected.reason);
        const offers = [];
        for (const target of [...flags].sort(byId)) {
            if (target.id === centre.id || target.my === true || queries + contestSquad.memberIds.length > secondaryTrialLimits.acquisitionQueries) continue;
            const occupant = contestOccupant(input(contestSquad, []), target);
            if (!occupant) continue;
            const routes = collect(contestSquad, [target], contestRange);
            if (!routes) return result(routeRejectionReason);
            const checked = checkContestRoutes(input(contestSquad, routes), target, routes, occupant.id);
            if (!checked.reason) offers.push({ target, routes, occupant, checked,
                swing: target.scorePerTick * (target.my === false ? 2 : 1) });
        }
        offers.sort((a, b) => b.swing * (a.checked.maxSteps + 1) - a.swing * (b.checked.maxSteps + 1) || a.checked.maxSteps - b.checked.maxSteps);
        const best = offers[0];
        if (!best || offers.length > 1 && best.swing === offers[1].swing && best.checked.maxSteps === offers[1].checked.maxSteps)
            return result(selected.reason);
        const group = contestSquad.memberIds.map(id => myCreeps.find(a => a.id === id));
        control = { ...control, squad: { id: contestSquad.id, memberIds: [...contestSquad.memberIds] }, cache: best.routes,
            selection: { phase: 'active', lastTick: tick, startedAt: tick, centreId: centre.id, centre: { x: centre.x, y: centre.y },
                squadId: contestSquad.id, memberIds: [...contestSquad.memberIds].sort(), targetId: best.target.id,
                target: { x: best.target.x, y: best.target.y }, effectType: best.target.effectType, scorePerTick: best.target.scorePerTick,
                owner: best.target.my, positions: [...group].sort(byId).map(a => ({ x: a.x, y: a.y })), unchanged: 0 },
            contest: { mode: 'contest', occupantId: best.occupant.id, flag: bind(best.target), centre: bind(centre),
                bestDistance: Math.max(...group.filter(armed).map(a => range(a, best.target))), lastProgressAt: tick, lastTick: tick } };
        ownedSteps = best.checked.steps;
        return result('contest-selected');
    }
    return result(selected.reason, selected.evaluation);
}
