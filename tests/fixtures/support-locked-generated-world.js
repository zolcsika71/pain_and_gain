import assert from 'node:assert/strict';
import { presetFixture, range } from './secondary-generated-world.js';
import { resetMembership, updateMembership } from '../../src/squads/membership.js';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { planSupportLocked } from './support-locked-engagement-candidate.js';

export { range };
export function engagementWorld() {
    const w = presetFixture(); w.tick = 1; w.calls = []; w.records = []; w.returns = new Map();
    w.engagements = new Map(); w.core = ['medic', 'bow1', 'bow2', 'guardR0'];
    const positions = { medic: [50, 50], bow1: [52, 49], bow2: [52, 50], guardR0: [52, 51],
        blade: [39, 40], guardM0: [40, 39], guardM1: [39, 39], guardM2: [41, 40],
        guardR1: [40, 41], guardR2: [39, 41], guardH1: [39, 42], guardH2: [38, 41],
        scout1: [38, 39], scout2: [38, 38] };
    for (const c of w.myCreeps) [c.x, c.y] = positions[c.id];
    w.centre = w.flags.find(f => f.id === w.centreId);
    Object.assign(w.enemies[3], { x: 56, y: 50 });
    w.target = w.enemies[3]; w.actor = id => w.myCreeps.find(c => c.id === id);
    w.spacing = { creeps: [...w.myCreeps, ...w.enemies], terrainAt: () => 0, reserved: new Set() };
    const delta = [[0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    for (const c of w.spacing.creeps) {
        c.getRangeTo = function(p) { return range(this, p); };
        c.move = function(direction) { const [dx, dy] = delta[direction];
            w.calls.push({ id: this.id, method: 'move', x: this.x + dx, y: this.y + dy });
            return w.returns.has(this.id) ? w.returns.get(this.id) : 0; };
        for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) c[method] = function(p) {
            w.calls.push({ id: this.id, method, target: p.id ?? null, x: p.x, y: p.y }); return 0;
        };
        c.findPathTo = () => { throw Error('Path search forbidden'); };
    }
    w.membership = updateMembership(resetMembership(), w);
    w.squadId = w.membership.squads.find(s => w.core.every(id => s.memberIds.includes(id)))?.id;
    assert(w.squadId, 'production birth membership must bind the three ranged actors with medic');
    w.distinct = () => assert.equal(new Set(w.spacing.creeps.map(c => `${c.x},${c.y}`)).size, w.spacing.creeps.length);
    w.refresh = () => {
        // Fixture setup may request validation repeatedly within one supplied
        // observation. Do not accidentally reset production birth membership.
        if (w.membership.lastTick !== w.tick) w.membership = updateMembership(w.membership, w);
        w.distinct();
    };
    w.step = (previous = null, { execute = true, enabled = true } = {}) => {
        w.refresh(); w.calls = []; w.records = [];
        const result = enabled ? planSupportLocked(w, previous) : { state: previous, moves: null };
        if (execute) {
            // Use the real executor's existing owned-step seam. Explicit owners
            // are supplied as their real escort/pair/objective plans, not masks
            // which silently allow a priority command to fall through.
            const moves = result.moves ? new Map(result.moves) : null;
            if (w.externalMoves) for (const [id, p] of w.externalMoves) moves?.set(id, p);
            const reporter = { decision: d => { w.records.push(d); return d; },
                attempt: (d, i, a, rc) => w.records.push({ type: 'attempt', channel: d.channel,
                    actorId: d.actorId, method: a.method, target: a.target, returnCode: rc ?? null }) };
            moveCreeps(w.myCreeps, w.enemies, w.centre, w.engagements, new Map(), w.escort ?? null,
                null, reporter, false, w.pair ?? null, w.spacing, null, moves, 'engagement-test');
            executeTactics(w.myCreeps, w.enemies, w.myCreeps.filter(c => c.hits < c.hitsMax), reporter, w);
        }
        return result;
    };
    w.distinct(); return w;
}
export function nextObservation(w, result, successfulIds = [...result.moves ?? []].filter(([, p]) => p).map(([id]) => id)) {
    // Caller-supplied generated observations, NOT Arena movement arbitration.
    for (const id of successfulIds) Object.assign(w.actor(id), result.moves.get(id));
    w.tick++; w.distinct();
}
export const moving = result => [...result.moves ?? []].filter(([, p]) => p).map(([id]) => id).sort();
