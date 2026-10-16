import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectCombatDecision } from '../../src/tactics/combat.js';
import { selectHealingDecision } from '../../src/tactics/healing.js';
import { selectSpilloverDecision } from '../fixtures/ranged-spillover-candidate.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ranged-spillover-tick43.json', import.meta.url)));
function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
freeze(fixture);
function unit(id, x, y, parts = {}, extra = {}) {
    return freeze({ id, my: true, x, y, hits: 100, hitsMax: 100, ...extra,
        body: Object.entries(parts).flatMap(([type, n]) => Array.from({ length: n }, () => ({ type, hits: 1 }))),
        getRangeTo(t) { return Math.max(Math.abs(this.x - t.x), Math.abs(this.y - t.y)); } });
}
const neutral = freeze({ friendlyAttack: 1, friendlyRanged: 1, enemyDamageTaken: 1, enemyHeal: 1 });
const event = (actorId = 'm', extra = {}) => freeze({ tick: 7, sequence: 1, actionId: '7:1#0',
    actorId, method: 'attack', targetId: 'a', returnCode: 0, ...extra });
function setup(parts = 2, targetHits = 60) {
    const m = unit('m', 2, 0, { attack: parts });
    const r = unit('r', 0, 0, { ranged_attack: 6 });
    const a = unit('a', 3, 0, {}, { my: false, hits: targetHits });
    const b = unit('b', 3, 3, { attack: 1 }, { my: false });
    const enemies = freeze([a, b]);
    const context = freeze({ tick: 7, sequence: 3, earlierIntents: [event()], friends: [m, r],
        enemyRosterComplete: true, damageModifiers: neutral });
    return { m, r, a, b, enemies, context };
}
const key = d => d.actions.map(a => [a.method, a.target.id]);
const choose = (s, context = s.context, enemies = s.enemies, healing = null) =>
    selectSpilloverDecision(s.r, enemies, healing, context);
const baseline = (s, enemies = s.enemies, healing = null) => selectCombatDecision(s.r, enemies, healing);

test('recorded tick43: reproduce every baseline decision/call, then compare all attackers in actual event order', () => {
    const s = fixture.snapshot;
    assert.equal(s.flags.filter(f => f.owner === 'me' &&
        ['eff_attack_modifier', 'eff_ranged_attack_modifier'].includes(f.effectType) ||
        f.owner === 'enemy' && ['eff_damage_taken_modifier', 'eff_heal_modifier'].includes(f.effectType)).length, 0,
    'Relevant outgoing damage/healing modifiers are neutral; own vulnerability affects incoming damage only');
    const units = s.creeps.map(c => {
        for (const field of ['x', 'y', 'hits', 'hitsMax']) assert.ok(Number.isSafeInteger(c[field]), `Missing recorded ${field}`);
        assert.ok(c.activeBodyParts && Object.values(c.activeBodyParts).every(n => Number.isSafeInteger(n) && n > 0));
        return unit(c.id, c.x, c.y, c.activeBodyParts, c);
    });
    const friends = freeze(units.filter(c => c.my));
    const enemies = freeze(units.filter(c => !c.my));
    const injured = friends.filter(c => c.hits > 0 && c.hits < c.hitsMax);
    const history = [], rows = [];
    const before = JSON.stringify(fixture);
    const short = id => id.replace('pg_player1_', '').replace('pg_player2_', '');
    // Explicit audited expectations, not generated from the candidate.
    const expected = [
        ['melee_1', 'attack', 'melee_2', 'melee_2', 240],
        ['melee_2', 'attack', 'melee_1', 'melee_1', 90],
        ['melee_3', 'attack', 'melee_2', 'melee_2', 90],
        ['melee_4', 'attack', 'melee_2', 'melee_2', 240],
        ['ranged_1', 'rangedAttack', 'melee_2', 'melee_3', 60],
        ['ranged_3', 'rangedAttack', 'melee_2', 'melee_3', 60],
        ['ranged_4', 'rangedAttack', 'melee_2', 'melee_3', 60],
        ['ranged_5', 'rangedAttack', 'melee_2', 'melee_3', 30],
    ];
    let decisions = 0, calls = 0;
    for (const e of fixture.events) {
        const actor = units.find(c => c.id === e.actorId);
        if (e.type === 'action-decision' && e.channel === 'combat') {
            const healing = selectHealingDecision(actor, injured).action;
            const base = selectCombatDecision(actor, enemies, healing);
            assert.deepEqual(key(base), e.actions.map(a => [a.method, a.target.id]));
            assert.equal(base.reason, e.reason);
            assert.equal(base.outcome, e.outcome);
            const candidate = selectSpilloverDecision(actor, enemies, healing, {
                tick: s.tick, sequence: e.sequence, friends, earlierIntents: history,
                enemyRosterComplete: true, damageModifiers: neutral,
            });
            for (const [i, a] of base.actions.entries()) {
                const changed = candidate.actions[i];
                const count = actor.body.filter(p => p.type === (a.method === 'attack' ? 'attack' : 'ranged_attack')).length;
                rows.push([short(actor.id), a.method, short(a.target.id), short(changed.target.id), count * (a.method === 'attack' ? 30 : 10)]);
                assert.equal(actor.getRangeTo(a.target), actor.getRangeTo(changed.target));
            }
            decisions++;
        }
        if (e.type === 'action-attempt') {
            if (['attack', 'rangedAttack'].includes(e.method)) {
                const match = expected.find(r => r[0] === short(actor.id) && r[1] === e.method);
                assert.ok(match);
                assert.equal(short(e.target.id), match[2]);
                assert.equal(e.returnCode, 0); // Original scheduling, not a candidate return.
                calls++;
            }
            history.push({ tick: e.tick, sequence: e.sequence, actionId: e.actionId,
                actorId: e.actorId, method: e.method, targetId: e.target.id, returnCode: e.returnCode });
        }
    }
    assert.equal(decisions, 14);
    assert.equal(calls, 8);
    assert.deepEqual(rows, expected);
    assert.equal(rows.filter(r => r[2] !== r[3]).length, 4);
    for (const [column, totals] of [[2, { melee_1: 90, melee_2: 780 }], [3, { melee_1: 90, melee_2: 570, melee_3: 210 }]]) {
        const actual = {};
        for (const r of rows) actual[r[column]] = (actual[r[column]] ?? 0) + r[4];
        assert.deepEqual(actual, totals);
    }
    assert.equal(JSON.stringify(fixture), before);
});

for (const [parts, target] of [[1, 'a'], [2, 'b'], [3, 'b']]) {
    test(`generated: ${parts * 30} accepted melee capacity vs60 HP (insufficient/exact/excess)`, () => {
        const s = setup(parts);
        assert.deepEqual(key(choose(s)), [['rangedAttack', target]]);
    });
}

test('generated: each accepted melee observation counts once; conflicting/replacement records disable', () => {
    const s = setup(2, 90);
    assert.deepEqual(choose(s, { ...s.context, earlierIntents: [event(), event()] }), baseline(s));
    for (const second of [event('m', { returnCode: -9 }),
        event('m', { sequence: 2, actionId: '7:2#0' })]) {
        assert.deepEqual(choose(s, { ...s.context, earlierIntents: [event(), second] }), baseline(s));
    }
    const covered = setup();
    assert.deepEqual(choose(covered, { ...covered.context, earlierIntents: [event(),
        event('m', { sequence: 2, actionId: '7:2#0', targetId: 'b' })] }), baseline(covered));
});

test('generated: rejected, unknown-return and non-melee intents never supply coverage', () => {
    const s = setup();
    for (const e of [event('m', { returnCode: -9 }), event('m', { returnCode: undefined }),
        event('m', { returnCode: '0' }), event('m', { method: 'rangedAttack' }), event('m', { method: 'rangedMassAttack' })]) {
        assert.deepEqual(choose(s, { ...s.context, earlierIntents: [e] }), baseline(s));
    }
});

test('generated: incompatible, out-of-range, unowned, dead and nonfunctioning melee does not count', () => {
    const s = setup();
    for (const m of [unit('m', 2, 0, { attack: 2 }, { my: false }), unit('m', 2, 0, { attack: 2 }, { hits: 0 }),
        unit('m', 1, 0, { attack: 2 }), unit('m', 2, 0, {}),
        unit('m', 2, 0, { attack: 2, heal: 1 }, { hits: 90 }),
        freeze({ ...s.m, body: [{ type: 'attack', hits: 0 }, { type: 'attack', hits: 0 }] })]) {
        assert.deepEqual(choose(s, { ...s.context, friends: [m, s.r] }), baseline(s));
    }
    const m = unit('m', 2, 0, { attack: 2, heal: 1 });
    const ally = unit('injured', 2, 2, {}, { hits: 50 });
    assert.equal(selectHealingDecision(m, [ally]).action.method, 'rangedHeal');
    assert.deepEqual(choose(s, { ...s.context, friends: [m, ally, s.r] }), baseline(s));
});

test('generated: tick reset, future/out-of-order records and mixed-actor order do not invent melee-first coverage', () => {
    const s = setup();
    for (const change of [{ tick: 8 }, { sequence: 1 }, { earlierIntents: [] },
        { earlierIntents: [event(), event('m', { tick: 8, sequence: 2, actionId: '8:2#0' })] },
        { earlierIntents: [event('m', { sequence: 2 }), event('m', { sequence: 1, actionId: '7:2#0' })] }]) {
        assert.deepEqual(choose(s, { ...s.context, ...change }), baseline(s));
    }
    const m1 = unit('m1', 2, 0, { attack: 1 }), m2 = unit('m2', 2, 1, { attack: 1 });
    const rLate = unit('r-late', 0, 1, { ranged_attack: 6 });
    const friends = [m1, s.r, m2, rLate];
    const early = { ...s.context, sequence: 2, friends, earlierIntents: [event('m1')] };
    assert.deepEqual(key(choose(s, early)), [['rangedAttack', 'a']]);
    const late = { ...early, sequence: 4, earlierIntents: [event('m1'), event('m2', { sequence: 3, actionId: '7:3#0' })] };
    assert.deepEqual(key(selectSpilloverDecision(rLate, s.enemies, null, late)), [['rangedAttack', 'b']]);
    const mixed = unit('mixed', 2, 1, { attack: 2, ranged_attack: 1 });
    assert.deepEqual(selectSpilloverDecision(mixed, s.enemies, null, { ...s.context,
        friends: [mixed], earlierIntents: [event('mixed')] }), selectCombatDecision(mixed, s.enemies, null));
});

test('generated: reachable enemy healing blocks either target; complete/known observations required', () => {
    const s = setup();
    for (const h of [unit('h', 5, 0, { heal: 1 }, { my: false }), unit('h', 3, 6, { heal: 1 }, { my: false })]) {
        assert.deepEqual(choose(s, s.context, [...s.enemies, h]), baseline(s));
    }
    const outside = unit('h', 7, 7, { heal: 1 }, { my: false });
    assert.deepEqual(key(choose(s, s.context, [...s.enemies, outside])), [['rangedAttack', 'b']]);
    for (const context of [{ ...s.context, enemyRosterComplete: false }, { ...s.context, enemyRosterComplete: undefined },
        { ...s.context, friends: [freeze({ ...s.m, body: undefined }), s.r] },
        { ...s.context, friends: [freeze({ ...s.m, getRangeTo: undefined }), s.r] }]) {
        assert.deepEqual(choose(s, context), baseline(s));
    }
    assert.deepEqual(choose(s, s.context, [s.a, freeze({ ...s.b, hitsMax: undefined })]), baseline(s));
});

test('generated: unsupported or missing damage/healing modifiers disable rather than assume neutral', () => {
    const s = setup();
    for (const key of Object.keys(neutral)) for (const value of [undefined, 0.8, 1.1, NaN]) {
        assert.deepEqual(choose(s, { ...s.context, damageModifiers: { ...neutral, [key]: value } }), baseline(s));
    }
    assert.deepEqual(choose(s, { ...s.context, damageModifiers: undefined }), baseline(s));
});

test('generated: require equal nearest range, uncovered alternative and stable ID fallback', () => {
    const s = setup();
    const far = unit('b', 4, 0, {}, { my: false });
    const nearer = unit('b', 2, 2, {}, { my: false });
    for (const enemies of [[s.a], [s.a, far], [s.a, nearer]]) assert.deepEqual(choose(s, s.context, enemies), baseline(s, enemies));
    const c = unit('c', 0, 3, {}, { my: false });
    for (const enemies of [[c, s.b, s.a], [s.a, s.b, c]]) assert.deepEqual(key(choose(s, s.context, enemies)), [['rangedAttack', 'b']]);
    const m2 = unit('m2', 2, 3, { attack: 4 });
    assert.deepEqual(choose(s, { ...s.context, friends: [s.m, m2, s.r],
        earlierIntents: [event(), event('m2', { sequence: 2, actionId: '7:2#0', targetId: 'b' })] }), baseline(s));
    assert.deepEqual(key(choose(s, s.context, [s.a, unit('dead', 0, 3, {}, { my: false, hits: 0 }),
        unit('friend', 0, 3, {}, { my: true })])), [['rangedAttack', 'a']]);
});

test('generated: eligibility and healing exclusions stay with deployed selector; melee action stays unchanged', () => {
    const s = setup();
    for (const healing of [{ method: 'rangedHeal', target: s.m }, { method: 'heal', target: s.m }]) {
        const result = choose(s, s.context, s.enemies, healing);
        if (healing.method === 'rangedHeal') assert.deepEqual(result, baseline(s, s.enemies, healing));
        else assert.deepEqual(key(result), [['rangedAttack', 'b']]);
    }
    const noWeapon = unit('no-weapon', 0, 0, {});
    assert.deepEqual(selectSpilloverDecision(noWeapon, s.enemies, null, s.context), selectCombatDecision(noWeapon, s.enemies, null));
    const mixed = unit('mixed', 2, 1, { attack: 1, ranged_attack: 1 });
    const b = unit('b', 3, 2, {}, { my: false });
    const result = selectSpilloverDecision(mixed, [s.a, b], null, { ...s.context, friends: [s.m, mixed] });
    assert.deepEqual(key(result), [['rangedAttack', 'b'], ['attack', 'a']]);
});

test('generated: bounded inputs reject overflow without truncating into spillover; no input mutation', () => {
    const s = setup();
    const before = JSON.stringify(s);
    for (const context of [{ ...s.context, earlierIntents: Array(65).fill(event()) },
        { ...s.context, friends: Array.from({ length: 15 }, (_, i) => unit('f' + i, 0, 0)) },
        { ...s.context, friends: [unit('m', 2, 0, { attack: 51 }), s.r] }]) {
        assert.deepEqual(choose(s, context), baseline(s));
    }
    const oversized = Array.from({ length: 15 }, (_, i) => unit('e' + i, 3, 0, {}, { my: false }));
    assert.deepEqual(choose(s, s.context, oversized), baseline(s, oversized));
    choose(s);
    assert.equal(JSON.stringify(s), before);
});
