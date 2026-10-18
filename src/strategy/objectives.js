export function selectFlag(flags) {
    return flags[0];
}

// Pure component; optional orchestration is guarded by a default-off switch.
export const secondaryObjectiveLimits = Object.freeze({ flags: 7, army: 14, squad: 4,
    body: 50, route: 40, routeOps: 5000, routes: 28, threatRange: 5,
    defenderRange: 3, defenders: 2, supportRange: 3, arrivalMargin: 5,
    lifetime: 60, unchanged: 4, matchTicks: 2000 });
const limits = secondaryObjectiveLimits;
const effects = Object.freeze({
    eff_damage_taken_modifier: { score: 5, count: 1, part: null },
    eff_attack_modifier: { score: 3, count: 2, part: 'attack', power: 30, debit: 20 },
    eff_ranged_attack_modifier: { score: 3, count: 2, part: 'ranged_attack', power: 10, debit: 20 },
    eff_heal_modifier: { score: 4, count: 2, part: 'heal', power: 12, debit: 25 },
});
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const position = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) &&
    p.x >= 0 && p.y >= 0 && p.x < 100 && p.y < 100;
const id = s => typeof s === 'string' && s.length > 0 && s.length <= 128 && !s.includes('\0');
const samePosition = (a, b) => a.x === b.x && a.y === b.y;
const partCount = (c, type) => c.body.filter(p => p.type === type && p.hits > 0).length;
const armed = c => partCount(c, 'attack') + partCount(c, 'ranged_attack') > 0;
const living = c => c.hits > 0 && c.exists !== false;
const routeKey = (actor, flag) => `${actor}\0${flag}`;

function supportedObservation(input) {
    const { tick, flags, myCreeps, enemies, squad, routes, unavailableIds = [] } = input;
    if (input.observationComplete !== true || !Number.isInteger(tick) || tick < 1 || tick > limits.matchTicks ||
        !Array.isArray(flags) || flags.length !== limits.flags || !Array.isArray(myCreeps) || myCreeps.length > limits.army ||
        !Array.isArray(enemies) || enemies.length > limits.army || !Array.isArray(routes) || routes.length > limits.routes ||
        !id(squad?.id) || !Array.isArray(squad.memberIds) || squad.memberIds.length < 2 || squad.memberIds.length > limits.squad ||
        !squad.memberIds.every(id) || new Set(squad.memberIds).size !== squad.memberIds.length ||
        !Array.isArray(unavailableIds) || unavailableIds.length > limits.army || !unavailableIds.every(id)) return false;
    if (flags.some(f => !f || !id(f.id) || !position(f) || f.exists === false ||
        ![true, false, undefined].includes(f.my) || !Object.prototype.hasOwnProperty.call(effects, f.effectType) ||
        f.scorePerTick !== effects[f.effectType].score) || new Set(flags.map(f => f.id)).size !== limits.flags) return false;
    for (const [effect, rule] of Object.entries(effects)) if (flags.filter(f => f.effectType === effect).length !== rule.count) return false;
    const all = [...myCreeps, ...enemies];
    if (new Set(all.map(c => c?.id)).size !== all.length) return false;
    for (const [roster, owner] of [[myCreeps, true], [enemies, false]]) {
        if (roster.some(c => !c || !id(c.id) || !position(c) || c.my !== owner ||
            !Number.isFinite(c.hits) || !Number.isFinite(c.hitsMax) || c.hits < 0 || c.hitsMax <= 0 || c.hits > c.hitsMax ||
            !Number.isFinite(c.fatigue) || c.fatigue < 0 || !Array.isArray(c.body) || c.body.length > limits.body ||
            c.body.some(p => !p || !['move', 'tough', 'attack', 'ranged_attack', 'heal'].includes(p.type) ||
                !Number.isFinite(p.hits) || p.hits < 0 || p.hits > 100))) return false;
    }
    const keys = new Set();
    for (const r of routes) {
        if (!r || !squad.memberIds.includes(r.actorId) || !flags.some(f => f.id === r.flagId) ||
            !Array.isArray(r.path) || r.path.length > limits.route || !Number.isInteger(r.ops) || r.ops < 0 || r.ops > limits.routeOps) return false;
        const key = routeKey(r.actorId, r.flagId);
        if (keys.has(key)) return false;
        keys.add(key);
    }
    return true;
}

// Compare nominal HP/tick capacities, not expected combat outcomes or score.
function capacities(creeps, flags, owner) {
    const base = {}, current = {};
    for (const [effect, rule] of Object.entries(effects)) if (rule.part) {
        base[effect] = creeps.filter(living).reduce((n, c) => n + partCount(c, rule.part) * rule.power, 0);
        current[effect] = 100 - rule.debit * flags.filter(f => f.my === owner && f.effectType === effect).length;
    }
    const total = Object.keys(base).reduce((n, effect) => n + base[effect] * current[effect], 0);
    return { base, current, total };
}

/** Pure, one-attempt selector for one caller-supplied existing squad.
 * Routes are fresh bounded searchPath reports, not movement/capture evidence.
 * IDs in results keep centre, travel objective and squad ownership separate.
 */
export function selectSecondaryObjective(input, previous = null) {
    return selectCaptureObjective(input, previous, false);
}

// Opening mission admission is deliberately distinct from post-centre defence.
// The opening controller additionally requires the full six-weapon/two-healer
// centre commitment; route validation, utility and lifecycle remain shared.
export function selectOpeningObjective(input, previous = null) {
    return selectCaptureObjective(input, previous, true);
}

function selectCaptureObjective(input, previous, opening) {
    const { tick, flags, myCreeps, enemies, squad, routes, centreId, unavailableIds = [] } = input;
    const work = { candidates: 0, routes: 0, pathCells: 0, routeThreatChecks: 0 };
    const validTick = Number.isInteger(tick) && tick >= 1 && tick <= limits.matchTicks;
    let state = previous && !(validTick && tick < previous.lastTick) ? previous : null;
    const reply = (reason, objectiveId = centreId ?? null, evaluation = null) => ({
        centreId: centreId ?? null, objectiveId, reason, evaluation, work, state,
    });
    const stop = reason => {
        state = { ...state, phase: state?.phase === 'active' || state?.phase === 'finished' ? 'finished' : 'idle',
            reason, lastTick: validTick ? tick : state?.lastTick ?? null };
        return reply(reason);
    };
    if (!supportedObservation(input)) return stop('unsupported-observation');
    const centre = flags.find(f => f.id === centreId);
    if (!centre || centre.effectType !== 'eff_damage_taken_modifier') return stop('invalid-centre');
    if (state?.phase === 'finished') { state = { ...state, lastTick: tick }; return reply(state.reason); }
    if (opening ? centre.my === false : centre.my !== true)
        return stop(opening ? 'centre-enemy-owned' : 'centre-not-owned');
    const ids = [...squad.memberIds].sort();
    if (state?.phase === 'active' && (state.centreId !== centreId || !samePosition(state.centre, centre) ||
        state.squadId !== squad.id || ids.join('\0') !== state.memberIds.join('\0'))) return stop('binding-changed');
    const friends = myCreeps.filter(living), foes = enemies.filter(living);
    const group = ids.map(memberId => friends.find(c => c.id === memberId));
    if (group.some(c => !c || c.fatigue !== 0 || !partCount(c, 'move') ||
        !armed(c) && !partCount(c, 'heal') || unavailableIds.includes(c.id))) return stop('squad-unavailable');
    if (friends.some(c => (ids.includes(c.id) ||
        !unavailableIds.includes(c.id) && (opening || distance(c, centre) <= limits.defenderRange)) &&
        c.hits !== c.hitsMax)) return stop('army-injured');
    const healers = group.filter(c => partCount(c, 'heal'));
    const weapons = group.filter(armed);
    if (!healers.length || !weapons.length || weapons.some(c => !healers.some(h => distance(c, h) <= limits.supportRange))) return stop('support-unavailable');
    const defenders = friends.filter(c => !ids.includes(c.id) && !unavailableIds.includes(c.id) && (opening || distance(c, centre) <= limits.defenderRange));
    const defenceHealers = defenders.filter(c => partCount(c, 'heal'));
    if (defenders.filter(c => armed(c) && defenceHealers.some(h => distance(c, h) <= limits.supportRange)).length < limits.defenders) return stop('defence-unavailable');
    const armedFoes = foes.filter(armed);
    if (armedFoes.some(e => distance(e, centre) <= limits.threatRange || group.some(c => distance(e, c) <= limits.threatRange))) return stop('local-combat');
    const active = state?.phase === 'active', target = active ? flags.find(f => f.id === state.targetId) : null;
    if (active) {
        if (!target || !samePosition(target, state.target) || target.effectType !== state.effectType ||
            target.scorePerTick !== state.scorePerTick) return stop('target-binding-changed');
        if (target.my === true) return stop('captured');
        if (target.my !== state.owner) return stop('ownership-changed');
        if (tick - state.startedAt >= limits.lifetime) return stop('timeout');
    }
    const own = capacities(friends, flags, true), enemy = capacities(foes, flags, false);
    const indexed = new Map(routes.map(r => [routeKey(r.actorId, r.flagId), r]));
    const candidates = active ? [target] : flags.filter(f => f.id !== centreId && (opening ? f.my === undefined : f.my !== true)).sort((a, b) => a.id < b.id ? -1 : 1);
    const evaluations = [];
    for (const flag of candidates) {
        work.candidates++;
        if (friends.concat(foes).some(c => samePosition(c, flag)) || armedFoes.some(e => distance(e, flag) <= limits.threatRange)) continue;
        let maxSteps = 0, valid = true;
        for (const c of group) {
            work.routes++;
            const r = indexed.get(routeKey(c.id, flag.id));
            if (!r || r.tick !== tick || r.incomplete !== false || !position(r.from) || !samePosition(r.from, c)) { valid = false; break; }
            let last = c;
            for (const p of r.path) {
                work.pathCells++;
                if (!position(p) || distance(last, p) !== 1) { valid = false; break; }
                for (const e of armedFoes) { work.routeThreatChecks++; if (distance(p, e) <= limits.threatRange) valid = false; }
                last = p;
            }
            if (!valid || !samePosition(last, flag)) { valid = false; break; }
            maxSteps = Math.max(maxSteps, r.path.length);
        }
        // Geometry is a lower bound, not an enemy route or recapture prediction.
        if (!valid || tick + maxSteps + 1 >= limits.matchTicks ||
            foes.some(e => distance(e, flag) <= maxSteps + limits.arrivalMargin)) continue;
        const rule = effects[flag.effectType];
        const ownLoss = own.base[flag.effectType] * rule.debit;
        const enemyGain = flag.my === false ? enemy.base[flag.effectType] * rule.debit : 0;
        const captureIncome = flag.scorePerTick, deniedIncome = flag.my === false ? flag.scorePerTick : 0;
        evaluations.push({ flagId: flag.id, captureIncome, deniedIncome, territorialSwing: captureIncome + deniedIncome,
            maxSteps, ownCapacityLoss: ownLoss / 100, enemyCapacityRelief: enemyGain / 100,
            ownMultiplierBefore: own.current[flag.effectType] / 100,
            ownMultiplierAfter: (own.current[flag.effectType] - rule.debit) / 100,
            enemyMultiplierBefore: enemy.current[flag.effectType] / 100,
            enemyMultiplierAfter: (enemy.current[flag.effectType] + (flag.my === false ? rule.debit : 0)) / 100,
            utility: (captureIncome + deniedIncome) / (maxSteps + 1) * (1 - ownLoss / own.total) / (1 + (enemy.total ? enemyGain / enemy.total : 0)) });
    }
    evaluations.sort((a, b) => b.utility - a.utility || a.maxSteps - b.maxSteps || (a.flagId < b.flagId ? -1 : a.flagId > b.flagId ? 1 : 0));
    const best = evaluations[0];
    if (!best) return stop(active ? 'objective-unavailable' : 'no-useful-objective');
    const flag = flags.find(f => f.id === best.flagId), positions = group.map(c => ({ x: c.x, y: c.y }));
    const unchanged = active && tick > state.lastTick && positions.every((p, i) => samePosition(p, state.positions[i]))
        ? state.unchanged + 1 : active && tick === state.lastTick ? state.unchanged : 0;
    if (unchanged >= limits.unchanged) return stop('no-displacement');
    state = { phase: 'active', lastTick: tick, startedAt: active ? state.startedAt : tick,
        centreId, centre: { x: centre.x, y: centre.y }, squadId: squad.id, memberIds: ids,
        targetId: flag.id, target: { x: flag.x, y: flag.y }, effectType: flag.effectType,
        scorePerTick: flag.scorePerTick, owner: flag.my, positions, unchanged };
    return reply(active ? 'retained' : 'selected', flag.id, best);
}
