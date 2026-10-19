import {completeObjectiveObservation, secondaryTrialLimits} from '../strategy/secondary-objective-plan.js';
import {secondaryStepSupport} from '../strategy/supported-contest.js';

// Includes paired/eligibility properties and optional adoption tuple punctuation.
// No IDs, raw results or errors.
export const routeProbeEnvelope = 900;
export const openingDiagnosticLimit = 2700;
const point = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) &&
    p.x >= 0 && p.y >= 0 && p.x < 100 && p.y < 100;
const cell = p => `${p.x},${p.y}`;
const distance = (a,b) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const coordinate = p => String(p.x).padStart(2,'0') + String(p.y).padStart(2,'0');
const living = c => c.exists !== false && c.hits > 0;
const knownOps = n => Number.isInteger(n) && n >= 0 && n <= secondaryTrialLimits.queryOps;

// Separately owned diagnostic state. Duplicate ticks never replenish the shot.
export function resetOpeningRouteProbe() { return {spent:false}; }

function summarize(result, origin, goal, blockers, ordinal) {
    const path = result?.path, incomplete = result?.incomplete;
    const summary = {ordinal,status:'shape',path:null,length:Array.isArray(path)?path.length:null,
        incomplete:typeof incomplete === 'boolean'?incomplete:null,
        ops:knownOps(result?.ops)?result.ops:null};
    if (!Array.isArray(path)) return summary;
    if (path.length > 40) return {...summary,status:'overlong'};
    if (typeof incomplete !== 'boolean') return {...summary,status:'incomplete-type'};
    let previous = origin;
    for (const p of path) {
        if (!point(p) || distance(previous,p) !== 1) return {...summary,status:'coordinates'};
        if (blockers.has(cell(p))) return {...summary,status:'blocked'};
        previous = p;
    }
    if (!incomplete && distance(previous,goal) !== 0) return {...summary,status:'endpoint'};
    // Preserve bounded paths even when operation telemetry is unsupported.
    return {...summary,status:summary.ops === null?'ops-unknown':incomplete?'incomplete':'complete',
        path:path.map(coordinate).join('')};
}

/** Diagnostic-only. Called after BOTH ownership/preparation passes, including
 * their terminal results; only a fully prepared active mission can search.
 * Never writes observation, mission, cache, diagnostic or prepared move maps.
 * Arena receives new position/goal/matrix objects, not gameplay references.
 */
export function probeOpeningRoute({state,observation,membership,mission,moves,centreIds,
    diagnostic,mapTick,compatible,search,CostMatrix,prepareComparison=null}) {
    // First stop only: no implication that later gates ran or passed. No skip history.
    const skip = (first,status='failed') => ({state,diagnostic:null,reason:first,
        eligibility:{status,first,later:'unknown'}});
    if (state.spent) return skip('spent','spent');
    const tick = observation?.tick;
    if (compatible == null) return skip('configuration','missing');
    if (compatible !== true) return skip('configuration');
    if (mission?.state?.phase == null || diagnostic?.phase == null) return skip('mission','missing');
    if (mission.state.phase !== 'active' || diagnostic.phase !== 'active') return skip('mission');
    if (tick == null) return skip('tick','missing');
    if (!Number.isInteger(tick) || tick < 1 || tick > 2000) return skip('tick');
    if (mapTick == null) return skip('map','missing');
    if (!Number.isInteger(mapTick) || mapTick < 1 || mapTick > tick) return skip('map');
    if (diagnostic.queries == null || diagnostic.reportedOps == null) return skip('work','missing');
    if (diagnostic.queries !== 0 || diagnostic.reportedOps !== 0) return skip('work');
    if (diagnostic.cacheHits == null) return skip('cache','missing');
    if (diagnostic.cacheHits !== 4) return skip('cache');
    if (typeof search !== 'function' || typeof CostMatrix !== 'function') return skip('api','missing');
    if (!Array.isArray(observation?.creeps) || !Array.isArray(observation.myCreeps) ||
        !Array.isArray(observation.flags) || observation.observationComplete === false ||
        observation.creeps.some(c=>!c || c.id == null || c.x == null || c.y == null ||
            !Array.isArray(c.body) || c.hits == null || c.hitsMax == null || c.fatigue == null))
        return skip('inputs','missing');
    if (!membership || !Array.isArray(membership.squads) || !Array.isArray(membership.members))
        return skip('membership','missing');
    if (!completeObjectiveObservation(observation) || observation.observationComplete === false ||
        observation.myCreeps.length !== 14 || !Array.isArray(observation.flags) || observation.flags.length > 7 ||
        !membership?.initialized || membership.lastTick !== tick ||
        !Array.isArray(membership.squads) || membership.squads.length !== 3 ||
        !Array.isArray(membership.members) || membership.members.length !== 14 ||
        observation.creeps.some(c => !point(c) || typeof c.id !== 'string' || !c.id.length || c.id.length > 128 ||
            !Array.isArray(c.body) || c.body.length > 50 ||
            c.body.some(p => !p || typeof p.type !== 'string' || !Number.isFinite(p.hits)) ||
            !Number.isFinite(c.hits) || !Number.isFinite(c.hitsMax) || !Number.isFinite(c.fatigue)) ||
        new Set(observation.creeps.map(c=>c.id)).size !== observation.creeps.length ||
        new Set(observation.creeps.filter(living).map(cell)).size !== observation.creeps.filter(living).length)
        return skip('inputs');
    const ids = mission.movement?.memberIds;
    const cache = mission.state.routeControl?.cache;
    if (!Array.isArray(ids) || !(moves instanceof Map) || !(centreIds instanceof Set) ||
        !Array.isArray(cache) || !Array.isArray(diagnostic.memberSlots) || !Array.isArray(diagnostic.travel?.actors))
        return skip('preparation','missing');
    if (!Array.isArray(ids) || ids.length !== 4 || new Set(ids).size !== 4 ||
        !(moves instanceof Map) || !(centreIds instanceof Set) || centreIds.size !== 8 ||
        centreIds.has(undefined) || ids.some(id => centreIds.has(id) || !moves.has(id)) ||
        [...centreIds].some(id => !moves.has(id) || !observation.myCreeps.some(c=>c.id===id)) ||
        moves.size !== 12 || !Array.isArray(cache) || cache.length !== 4 ||
        !Array.isArray(diagnostic.memberSlots) || diagnostic.memberSlots.length !== 4 ||
        !Array.isArray(diagnostic.travel?.actors) || diagnostic.travel.actors.length !== 4)
        return skip('preparation');
    const target = observation.flags[diagnostic.targetSlot];
    const squad = membership.squads.find(s=>s.id===mission.state.squad?.id);
    if (!squad || !Array.isArray(squad.memberIds)) return skip('binding','missing');
    if (squad.memberIds.length !== 4 || new Set(squad.memberIds).size !== 4 || ids.some(id=>!squad.memberIds.includes(id)) ||
        !point(target) || target.id !== mission.objectiveId ||
        !secondaryStepSupport(observation.myCreeps,ids,moves)) return skip('support');
    const proposals = [];
    for (let slot=0;slot<4;slot++) {
        const actor = observation.creeps[diagnostic.memberSlots[slot]];
        const travel = diagnostic.travel.actors.find(a=>a.slot===slot);
        const report = cache.find(r=>r.actorId===actor?.id);
        const member = membership.members.find(m=>m.id===actor?.id);
        if (!actor || !member || !report || !travel || report.flagId == null || report.incomplete == null ||
            report.searchedAt == null || !report.from || !Array.isArray(report.path) || !travel.proposed ||
            !moves.has(actor.id)) return skip('binding','missing');
        if (!actor || !ids.includes(actor.id) || !actor.my || !living(actor) ||
            !member?.participating || !member.capable || !member.canMoveNow ||
            !report || report.flagId !== target.id || report.incomplete !== false ||
            !Number.isInteger(report.searchedAt) || tick-report.searchedAt < 0 ||
            tick-report.searchedAt >= secondaryTrialLimits.cacheTicks ||
            !point(report.from) || distance(report.from,actor) !== 0 ||
            !Array.isArray(report.path) || report.path.length > 40 || !travel ||
            !point(travel.proposed) || distance(actor,travel.proposed) !== 1 ||
            !point(report.path[0]) || distance(report.path[0],travel.proposed) !== 0 ||
            (moves.get(actor.id) === null ? travel.admitted !== null :
                !point(moves.get(actor.id)) || !point(travel.admitted) || distance(moves.get(actor.id),travel.admitted)!==0))
            return skip('binding');
        proposals.push({actor,step:travel.proposed,slot});
    }
    if (new Set(proposals.map(p=>p.actor.id)).size !== 4) return skip('binding');
    const occupants = observation.creeps.filter(living).map(c=>({x:c.x,y:c.y}));
    const occupied = new Set(occupants.map(cell));
    const shared = proposals.filter(p=>proposals.some(q=>q!==p && cell(q.step)===cell(p.step)));
    // Diagnostic sampling only. Birth slots are pinned by production membership,
    // not diagnostic array order or an actor-ID movement winner/tie-break.
    const slots = new Map(squad.memberIds.map((id,slot)=>[id,slot]));
    const eligible = shared.filter(p=>!occupied.has(cell(p.step)))
        .sort((a,b)=>slots.get(a.actor.id)-slots.get(b.actor.id));
    if (!eligible.length) return skip('no-conflict');
    const chosen = eligible[0];
    // Frozen before any request; at most two distinct shared cells among four proposals.
    const exclusions = [...new Map(shared.map(p=>[cell(p.step),{x:p.step.x,y:p.step.y}])).values()]
        .sort((a,b)=>a.x-b.x||a.y-b.y);
    if (exclusions.some(p=>cell(p)===cell(chosen.actor))) return skip('origin-conflict');
    // Optional authority-side capture only AFTER normal eligibility. The probe
    // neither runs this comparison nor commits anything. Probe-only is unchanged.
    const comparison=prepareComparison?.({actorId:chosen.actor.id,actorSlot:chosen.slot,mapTick,
        exclusions:exclusions.map(p=>({...p}))});
    if (Math.max(JSON.stringify(diagnostic).length,comparison?.maxDiagnosticLength??0) + routeProbeEnvelope >= openingDiagnosticLimit)
        return skip('headroom');
    state.spent = true; // Diagnostic state only; consumed BEFORE the first call.
    const probe = {version:1,actorSlot:chosen.slot,targetSlot:diagnostic.targetSlot,mapTick,
        matrix:'occupancy-v1',origin:coordinate(chosen.actor),goal:coordinate(target),range:0,
        maxOps:1000,excluded:exclusions.map(coordinate).join(''),queries:0,reportedOps:0,results:[]};
    const origin = {x:chosen.actor.x,y:chosen.actor.y}, goal = {x:target.x,y:target.y};
    for (const extra of [[],exclusions]) {
        // Include matrix failures in conservative requested-work accounting.
        if (diagnostic.queries + probe.queries >= secondaryTrialLimits.activeQueries) break;
        probe.queries++;
        let summary;
        try {
            const matrix = new CostMatrix();
            const blockers = new Set(occupied); blockers.delete(cell(origin));
            for (const p of occupants) matrix.set(p.x,p.y,255);
            for (const p of extra) { matrix.set(p.x,p.y,255); blockers.add(cell(p)); }
            matrix.set(origin.x,origin.y,0);
            const result = search({...origin},{pos:{...goal},range:0},{maxOps:1000,costMatrix:matrix});
            summary = summarize(result,origin,goal,blockers,probe.queries);
        } catch {
            summary = {ordinal:probe.queries,status:'thrown',path:null,length:null,incomplete:null,ops:null};
        }
        probe.results.push(summary);
        probe.reportedOps = probe.reportedOps === null || summary.ops === null ? null : probe.reportedOps + summary.ops;
        if (summary.status !== 'complete') break; // No second call after a partial/unsupported baseline.
    }
    return {state,diagnostic:probe,reason:'observed',eligibility:{status:'eligible',first:null,later:null},
        ...(comparison?{comparison}:{})};
}
