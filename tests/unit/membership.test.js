import test from 'node:test';
import assert from 'node:assert/strict';
import { resetMembership, updateMembership } from '../../src/squads/membership.js';

function creep(id, x, y, parts, options = {}) {
    return {
        id, x, y, my: options.my ?? true, hits: options.hits ?? parts.length * 100,
        fatigue: options.fatigue ?? 0, exists: options.exists ?? true,
        body: parts.map(type => ({ type, hits: 100 })),
    };
}

function fixture(prefix = 'pg_player1_') {
    const unit = (name, x, y, action, count) => creep(prefix + name, x, y,
        [...Array(count).fill(action), ...Array(count).fill('move')]);
    return [
        creep(prefix + 'scout_1', 12, 9, ['move']),
        creep(prefix + 'scout_2', 9, 6, ['move']),
        unit('melee_1', 15, 7, 'attack', 8),
        unit('melee_2', 10, 11, 'attack', 8),
        unit('melee_3', 10, 12, 'attack', 8),
        unit('melee_4', 9, 12, 'attack', 8),
        unit('ranged_1', 15, 6, 'ranged_attack', 6),
        unit('ranged_2', 14, 7, 'ranged_attack', 6),
        unit('ranged_3', 15, 11, 'ranged_attack', 6),
        unit('ranged_4', 14, 12, 'ranged_attack', 6),
        unit('ranged_5', 15, 12, 'ranged_attack', 6),
        unit('healer_1', 9, 11, 'heal', 6),
        unit('healer_2', 14, 6, 'heal', 6),
        unit('healer_3', 14, 11, 'heal', 6),
    ];
}

const tick = (number, myCreeps) => ({ tick: number, myCreeps });
const member = (state, id) => state.members.find(item => item.id === id);

test('the reviewed tick-1 fixture yields three nearby groups and two unassigned scouts', () => {
    const state = updateMembership(null, tick(1, fixture()));
    assert.equal(state.initialized, true);
    assert.deepEqual(state.squads, [
        { id: 'A', memberIds: ['pg_player1_healer_1', 'pg_player1_melee_2',
            'pg_player1_melee_3', 'pg_player1_melee_4'] },
        { id: 'B', memberIds: ['pg_player1_healer_2', 'pg_player1_melee_1',
            'pg_player1_ranged_1', 'pg_player1_ranged_2'] },
        { id: 'C', memberIds: ['pg_player1_healer_3', 'pg_player1_ranged_3',
            'pg_player1_ranged_4', 'pg_player1_ranged_5'] },
    ]);
    assert.deepEqual(state.members.filter(item => item.squadId === null).map(item => item.id),
        ['pg_player1_scout_1', 'pg_player1_scout_2']);
    assert.deepEqual(member(state, 'pg_player1_melee_1').originalParts, { attack: 8, move: 8 });
    assert.equal(state.members.length, 14);
    assert.equal(new Set(state.squads.flatMap(group => group.memberIds)).size, 12);
    assert.ok(state.members.every(item => item.presence === 'present' && item.capable && item.canMoveNow));
    assert.equal(state.members.filter(item => item.participating).length, 12);
    assert.ok(state.members.filter(item => item.squadId === null).every(item => !item.participating));
});

test('input permutations do not change IDs, membership, or explicit unassigned accounting', () => {
    const units = fixture();
    const expected = updateMembership(null, tick(1, units));
    for (const reordered of [[...units].reverse(), [...units].sort((a, b) => b.id.localeCompare(a.id))]) {
        assert.deepEqual(updateMembership(null, tick(1, reordered)), expected);
    }
    assert.deepEqual(updateMembership(null, tick(1, units.map(unit =>
        ({ ...unit, body: [...unit.body].reverse() })))), expected);
    assert.deepEqual(expected.members.map(item => item.id).sort(), units.map(unit => unit.id).sort());
});

test('greedy distance and then ID ties determine slots, without duplicate membership', () => {
    const healer = creep('h', 0, 0, ['heal', 'move']);
    const combat = ['d', 'c', 'b', 'a'].map(id => creep(id, 1, 1, ['attack', 'move']));
    const scouts = Array.from({ length: 9 }, (_, i) => creep(`s${i}`, 10 + i, 10, ['move']));
    const units = [healer, ...combat, ...scouts];
    let state = updateMembership(null, tick(1, units));
    assert.deepEqual(state.squads[0].memberIds, ['h', 'a', 'b', 'c']);
    assert.equal(member(state, 'd').squadId, null);
    combat[0].x = 0;
    combat[0].y = 0;
    state = updateMembership(null, tick(1, units.reverse()));
    assert.deepEqual(state.squads[0].memberIds, ['h', 'd', 'a', 'b']);
    assert.equal(new Set(state.squads.flatMap(group => group.memberIds)).size, 4);
});

test('invalid and late initial observations remain uninitialized with an explicit reason', () => {
    const units = fixture();
    assert.equal(updateMembership(null, tick(2, units)).reason, 'initial-tick-missed');
    assert.equal(updateMembership(updateMembership(null, tick(2, units)), tick(3, units)).initialized, false);
    assert.equal(updateMembership(null, tick(1, units.slice(1))).reason, 'expected-14-owned-living');
    assert.equal(updateMembership(updateMembership(null, tick(1, units.slice(1))),
        tick(2, units)).reason, 'expected-14-owned-living');
    assert.equal(updateMembership(null, tick(1, [...units.slice(0, 13), units[0]])).reason, 'duplicate-member-id');
    assert.equal(updateMembership(null, tick(1, units.map((unit, i) =>
        i ? unit : { ...unit, my: false }))).reason, 'expected-14-owned-living');
    assert.equal(updateMembership(null, tick(1, units.map((unit, i) =>
        i ? unit : { ...unit, hits: 0 }))).reason, 'expected-14-owned-living');
    assert.equal(updateMembership(null, tick(1, units.map((unit, i) =>
        i ? unit : { ...unit, x: undefined }))).reason, 'invalid-initial-member');
    assert.equal(updateMembership(resetMembership(), tick(0, units)).reason, 'invalid-tick');
});

test('mixed and unclassifiable initial bodies remain assigned to no group', () => {
    const units = fixture();
    const mixed = units.find(unit => unit.id.endsWith('melee_4'));
    mixed.body.push({ type: 'heal', hits: 100 });
    const unknown = units.find(unit => unit.id.endsWith('ranged_5'));
    unknown.body.push({ type: 'work', hits: 100 });
    const state = updateMembership(null, tick(1, units));
    assert.equal(member(state, mixed.id).role, 'mixed');
    assert.equal(member(state, unknown.id).role, 'unclassifiable');
    assert.equal(member(state, mixed.id).squadId, null);
    assert.equal(member(state, unknown.id).squadId, null);
    assert.equal(state.members.length, 14);
});

test('a missing body is unclassifiable rather than inferred from an ID', () => {
    const units = fixture();
    const unknown = units.find(unit => unit.id.endsWith('melee_4'));
    unknown.body = undefined;
    const first = updateMembership(null, tick(1, units));
    assert.equal(member(first, unknown.id).role, 'unclassifiable');
    assert.equal(member(first, unknown.id).squadId, null);
    unknown.body = [{ type: 'attack', hits: 100 }, { type: 'move', hits: 100 }];
    const second = updateMembership(first, tick(2, units));
    assert.equal(member(second, unknown.id).role, 'unclassifiable');
    assert.equal(member(second, unknown.id).squadId, null);
});

test('fatigue pauses mobility without changing role, capability, or membership', () => {
    const units = fixture();
    const first = updateMembership(null, tick(1, units));
    const healer = units.find(unit => unit.id.endsWith('healer_1'));
    healer.fatigue = 2;
    const second = updateMembership(first, tick(2, units));
    assert.equal(member(second, healer.id).squadId, 'A');
    assert.equal(member(second, healer.id).capable, true);
    assert.equal(member(second, healer.id).participating, true);
    assert.equal(member(second, healer.id).canMoveNow, false);
    assert.deepEqual(second.squads, first.squads);
});

test('missing members reserve slots; capability loss and healing do not reshuffle them', () => {
    const units = fixture();
    const id = 'pg_player1_melee_2';
    const first = updateMembership(null, tick(1, units));
    const second = updateMembership(first, tick(2, units.filter(unit => unit.id !== id)));
    assert.equal(member(second, id).presence, 'missing');
    assert.equal(member(second, id).squadId, 'A');
    assert.equal(member(second, id).capable, false);
    assert.equal(member(second, id).participating, false);
    const returned = units.find(unit => unit.id === id);
    for (const part of returned.body) if (part.type === 'attack') part.hits = 0;
    returned.hits = 800;
    const third = updateMembership(second, tick(3, units));
    assert.equal(member(third, id).presence, 'present');
    assert.equal(member(third, id).role, 'melee');
    assert.equal(member(third, id).capable, false);
    assert.equal(member(third, id).participating, false);
    assert.equal(member(third, id).squadId, 'A');
    for (const part of returned.body) if (part.type === 'attack') part.hits = 100;
    returned.hits = 1600;
    const fourth = updateMembership(third, tick(4, units));
    assert.equal(member(fourth, id).capable, true);
    assert.equal(member(fourth, id).participating, true);
    assert.equal(member(fourth, id).squadId, 'A');
    assert.deepEqual(fourth.squads, first.squads);
});

test('loss and restoration of functioning MOVE changes capability, not the reserved slot', () => {
    const units = fixture();
    const id = 'pg_player1_ranged_1';
    const first = updateMembership(null, tick(1, units));
    const ranged = units.find(unit => unit.id === id);
    for (const part of ranged.body) if (part.type === 'move') part.hits = 0;
    ranged.hits = 600;
    const second = updateMembership(first, tick(2, units));
    assert.equal(member(second, id).capable, false);
    assert.equal(member(second, id).participating, false);
    assert.equal(member(second, id).canMoveNow, false);
    assert.equal(member(second, id).squadId, 'B');
    for (const part of ranged.body) if (part.type === 'move') part.hits = 100;
    ranged.hits = 1200;
    const third = updateMembership(second, tick(3, units));
    assert.equal(member(third, id).capable, true);
    assert.equal(member(third, id).participating, true);
    assert.equal(member(third, id).squadId, 'B');
});

test('only observed death evidence tombstones a member; no surviving member is reassigned', () => {
    const units = fixture();
    const id = 'pg_player1_healer_2';
    const first = updateMembership(null, tick(1, units));
    const dead = units.map(unit => unit.id === id ? { ...unit, exists: false } : unit);
    const second = updateMembership(first, tick(2, dead));
    assert.equal(member(second, id).presence, 'dead');
    assert.equal(member(second, id).squadId, 'B');
    const third = updateMembership(second, tick(3, units));
    assert.equal(member(third, id).presence, 'dead');
    assert.deepEqual(third.squads, first.squads);
    const melee = units.find(unit => unit.id.endsWith('melee_1'));
    const fourth = updateMembership(third, tick(4, units.map(unit => unit === melee ? { ...unit, hits: 0 } : unit)));
    assert.equal(member(fourth, melee.id).presence, 'dead');
    assert.equal(member(fourth, melee.id).squadId, 'B');
});

test('late unexpected IDs are accounted for but never given a vacated slot', () => {
    const units = fixture();
    const first = updateMembership(null, tick(1, units));
    const newcomer = creep('unexpected', 0, 0, ['heal', 'move']);
    const second = updateMembership(first, tick(2, [...units.slice(1), newcomer]));
    assert.equal(member(second, units[0].id).presence, 'missing');
    assert.equal(member(second, newcomer.id).squadId, null);
    assert.equal(member(second, newcomer.id).late, true);
    assert.deepEqual(second.squads, first.squads);
});

test('explicit reset or a restarted tick clears the old match; late reload cannot initialize', () => {
    const first = updateMembership(null, tick(1, fixture()));
    const nextUnits = fixture('pg_player2_');
    const reset = updateMembership(first, tick(1, nextUnits));
    assert.equal(reset.initialized, true);
    assert.ok(reset.members.every(item => item.id.startsWith('pg_player2_')));
    assert.deepEqual(reset.squads.map(group => group.memberIds.length), [4, 4, 4]);
    assert.equal(updateMembership(resetMembership(), tick(9, nextUnits)).reason, 'initial-tick-missed');
    const zero = updateMembership(reset, tick(0, nextUnits));
    assert.equal(zero.initialized, false);
    assert.equal(zero.reason, 'invalid-tick');
    assert.equal(updateMembership(zero, tick(1, nextUnits)).initialized, true);
});
