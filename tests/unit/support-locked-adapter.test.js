import test from 'node:test';
import assert from 'node:assert/strict';
import { engagementWorld } from '../fixtures/support-locked-generated-world.js';
import { planSupportLockedTick, engagementDiagnostic } from '../../src/strategy/support-locked-engagement.js';
import * as configuration from '../../src/config.js';

const observation = w => ({ tick: w.tick, creeps: w.spacing.creeps, myCreeps: w.myCreeps,
    enemies: w.enemies.filter(c => c.hits > 0) });
const plan = (w, previous = null, owners = {}) => planSupportLockedTick(observation(w), w.membership, w.centre, previous,
    { terrainAt: w.spacing.terrainAt, engagements: w.engagements, ...owners });

test('inactive adapter config preserves existing switches', () => {
    assert.deepEqual({ ...configuration }, { oneScoutFlagExperiment: false, oneHealerEscortExperiment: true,
        scoutHoldExperiment: false, squadPairExperiment: false, secondaryObjectiveExperiment: false,
        healerUsefulClosingExperiment: false, supportLockedEngagementExperiment: false });
});

test('production adapter nominates the unique existing shape without mutating membership or issuing commands', () => {
    const w = engagementWorld(), before = JSON.stringify(w.membership);
    delete w.squadId;
    const r = plan(w); assert.equal(r.state.phase, 'Assess');
    assert.deepEqual(new Set(r.state.memberIds), new Set(w.core));
    assert.equal(JSON.stringify(w.membership), before); assert.deepEqual(w.calls, []);
    const old = JSON.stringify(r.state); w.tick++; w.refresh(); plan(w, r.state);
    assert.equal(JSON.stringify(r.state), old, 'bounded immutable state needs no structuredClone global');
});

test('ambiguous shape declines acquisition instead of using squad ID/order or building new membership', () => {
    const w = engagementWorld(), group = w.membership.squads.find(s => s.id === w.squadId);
    w.membership.squads[0] = { ...group, id: 'another' };
    for (const squads of [w.membership.squads, [...w.membership.squads].reverse()]) {
        w.membership.squads = squads; assert.equal(plan(w).moves, null);
    }
});

test('observed dead-hostile objects are normalized like observeArena, never mistaken for missing roster data', () => {
    const w = engagementWorld(); w.enemies[0].hits = 0;
    assert.equal(plan(w).state.phase, 'Assess');
});

test('inconsistent rosters and malformed bodies cannot produce travel or clearance', () => {
    for (const mutate of [w => w.spacing.creeps = w.spacing.creeps.slice(1),
        w => w.enemies[0].body = null, w => w.membership.squads = null]) {
        const w = engagementWorld(), bound = plan(w); w.tick++; w.refresh(); mutate(w);
        const r = plan(w, bound.state); assert.equal(r.state.phase, 'Spent');
        assert.equal(r.state.clearCount, 0); assert(![...r.moves.values()].some(Boolean));
    }
});

for (const kind of ['escort', 'pair', 'objective', 'scout']) test(`adapter preserves ${kind} ownership and holds other members before execution`, () => {
    const w = engagementWorld(), r = plan(w); w.tick++; w.refresh();
    const owners = kind === 'escort' ? { escort: { healerId: 'medic', allyId: 'blade' } }
        : kind === 'pair' ? { pair: { moves: new Map([['medic', { target: w.actor('blade') }]]) } }
        : { externalMoves: new Map([['medic', kind === 'objective' ? null : w.centre]]) };
    const next = plan(w, r.state, owners); assert.equal(next.state.phase, 'Recover');
    assert(next.priorityIds.includes('medic')); assert(!next.moves.has('medic'));
    assert([...next.moves.values()].every(p => p === null)); assert.deepEqual(w.calls, []);
});

test('malformed owner metadata fences admission without throwing or inventing an owner', () => {
    const w = engagementWorld(), r = plan(w); w.tick++; w.refresh();
    const next = plan(w, r.state, { externalMoves: {}, pair: { moves: null } });
    assert.equal(next.state.phase, 'Spent'); assert(![...next.moves.values()].some(Boolean));
});

test('one malformed outsider cannot mask an independently observed bound-member emergency', () => {
    const w = engagementWorld(), r = plan(w); w.tick++; w.refresh();
    Object.assign(w.target, { x: 53, y: 49 }); w.enemies[0].body = null;
    const next = plan(w, r.state); assert.equal(next.state.phase, 'Spent');
    assert(next.priorityIds.includes('bow1')); assert(!next.moves.has('bow1'));
    assert(![...next.moves.values()].some(Boolean)); assert.equal(next.state.clearCount, 0);
});

test('diagnostic is bounded for worst escaped target IDs and has no stale proposed steps on holds', () => {
    const w = engagementWorld(); let r = plan(w); w.tick++; w.refresh(); r = plan(w, r.state);
    const active = engagementDiagnostic(r); assert(active.actors.some(a => a.proposed));
    r.state.targetId = '\u0000'.repeat(128);
    const maximum = engagementDiagnostic(r);
    assert(JSON.stringify(maximum).length < 2000); assert.equal(maximum.actors.length, 4);
    w.tick = 25; w.refresh(); r = plan(w, r.state);
    assert(engagementDiagnostic(r).actors.every(a => a.proposed === null && a.admitted === null));
    Object.assign(w.target, { x: 70, y: 70 });
    w.tick = 26; w.refresh(); r = plan(w, r.state);
    w.tick = 27; w.refresh(); r = plan(w, r.state);
    const clear = engagementDiagnostic(r); assert.equal(clear.reason, 'rearmed');
    assert.equal(clear.actors.length, 4); assert(clear.actors.every(a => a.owner === 'engagement' && a.admitted === null));
});
