import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { planHealerEscort } from '../../src/tactics/healer-escort.js';

function creep(id, x, y, parts, options = {}) {
    const calls = [];
    return {
        id, x, y, my: options.my ?? true, hits: options.hits ?? 100,
        hitsMax: 100, fatigue: options.fatigue ?? 0,
        body: parts.map(type => ({ type, hits: 100 })), calls,
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
        moveTo(target) { calls.push(['moveTo', target.id]); return options.returnCode ?? 0; },
        heal(target) { calls.push(['heal', target.id]); return 0; },
        rangedHeal(target) { calls.push(['rangedHeal', target.id]); return 0; },
    };
}

const healer = (id, x, y, options) => creep(id, x, y, ['heal', 'move'], options);
const melee = (id, x, y, options) => creep(id, x, y, ['attack', 'move'], options);
const enemy = (id, x, y) => creep(id, x, y, ['attack', 'move'], { my: false });
const flag = { id: 'flag', my: true, x: 0, y: 0 };
const state = (tick, friends, enemies) => ({ tick, myCreeps: friends, enemies });

test('without an escort, every creep retains its baseline movement decision', () => {
    const h = healer('healer', 4, 0);
    const m = melee('melee', 0, 0);
    const e = enemy('enemy', -4, 0);
    moveCreeps([h, m], [e], flag);
    assert.deepEqual(h.calls, [['moveTo', 'flag']]);
    assert.deepEqual(m.calls, [['moveTo', 'enemy']]);
});

test('one deterministic pair persists; only its healer escorts and reports the actual return code', () => {
    const front = melee('front', 0, 0);
    const other = melee('other', 2, 2);
    const far = healer('a-far', 0, 5);
    const near = healer('z-near', 3, 0, { returnCode: -11 });
    const spare = healer('spare', 4, 2);
    const foe = enemy('foe', -4, 0);
    const friends = [front, other, far, near, spare];
    const first = planHealerEscort(state(10, friends, [foe]), flag);
    assert.deepEqual(first.state.pair, { healerId: 'z-near', allyId: 'front' });
    assert.deepEqual(first.transition, { event: 'assign', reason: 'local-engagement',
        healerId: 'z-near', allyId: 'front' });
    assert.equal(first.escort.mode, 'move-attempt');
    const diagnostics = [];
    moveCreeps(friends, [foe], flag, new Map(), new Map(), first.escort,
        diagnostic => diagnostics.push(diagnostic));
    assert.deepEqual(near.calls, [['moveTo', 'front']]);
    assert.deepEqual(diagnostics, [{ event: 'move-attempt', healerId: 'z-near', allyId: 'front',
        range: 3, targetId: 'front', returnCode: -11 }]);
    assert.deepEqual(far.calls, [['moveTo', 'flag']]);
    assert.deepEqual(spare.calls, [['moveTo', 'flag']]);
    assert.ok(friends.every(unit => unit.calls.filter(([method]) => method === 'moveTo').length <= 1));

    other.x = -3; // A newly more threatened melee does not steal the retained pair.
    const second = planHealerEscort(state(11, friends, [foe]), flag, first.state);
    assert.deepEqual(second.state.pair, first.state.pair);
    assert.equal(second.transition, null);
});

test('pair ranking uses threat, ally ID, distance, then healer ID', () => {
    const foe = enemy('foe', 0, 0);
    const a = melee('a', 4, 0);
    const b = melee('b', 0, 4);
    const hB = healer('b-healer', 4, 4);
    const hA = healer('a-healer', 4, 4);
    const chosen = planHealerEscort(state(1, [b, a, hB, hA], [foe]), flag);
    assert.deepEqual(chosen.state.pair, { healerId: 'a-healer', allyId: 'a' });
    b.y = 2; // Threat range two beats ally ID and healer proximity.
    const newMatch = planHealerEscort(state(1, [a, b, hA, hB], [foe]), flag);
    assert.equal(newMatch.state.pair.allyId, 'b');
});

test('acquisition rejects fatigue, mixed roles, injury, absent flag, danger, and excessive range', () => {
    const m = melee('m', 0, 0);
    const h = healer('h', 4, 0);
    const e = enemy('e', -4, 0);
    const check = (friends = [m, h], first = flag) => planHealerEscort(state(1, friends, [e]), first).escort;
    assert.ok(check());
    m.fatigue = 1; assert.equal(check(), null); m.fatigue = 0;
    h.fatigue = 1; assert.equal(check(), null); h.fatigue = 0;
    h.body.push({ type: 'attack', hits: 100 }); assert.equal(check(), null); h.body.pop();
    m.body.push({ type: 'ranged_attack', hits: 100 }); assert.equal(check(), null); m.body.pop();
    m.body[1].hits = 0; assert.equal(check(), null); m.body[1].hits = 100;
    h.x = 6; assert.equal(check(), null); h.x = 4;
    h.hits = 90; assert.equal(check(), null); h.hits = 100;
    assert.equal(check([m, h], { ...flag, my: false }), null);
    h.x = -1; assert.equal(check(), null);
    h.x = 4;
    assert.equal(planHealerEscort(state(1, [m, h], []), flag).escort, null);
});

test('injury immediately releases escort; baseline injured movement and healing remain in force', () => {
    const m = melee('m', 0, 0);
    const h = healer('h', 4, 0);
    const e = enemy('e', -4, 0);
    const first = planHealerEscort(state(1, [m, h], [e]), flag);
    m.hits = 80;
    const released = planHealerEscort(state(2, [m, h], [e]), flag, first.state);
    assert.equal(released.transition.reason, 'friendly-injured');
    assert.equal(released.escort, null);
    moveCreeps([h, m], [e], flag, new Map(), new Map(), released.escort);
    assert.deepEqual(h.calls, [['moveTo', 'm']]);
    h.x = 2;
    executeTactics([h], [e], [m]);
    assert.deepEqual(h.calls.at(-1), ['rangedHeal', 'm']);
    m.hits = 100;
    assert.equal(planHealerEscort(state(3, [m, h], [e]), flag, released.state).escort, null);
    assert.ok(planHealerEscort(state(1, [m, h], [e]), flag).escort); // New-match reset.
});

test('fatigue pauses movement without releasing and the twelfth tick is the last escort tick', () => {
    const m = melee('m', 0, 0);
    const h = healer('h', 4, 0);
    const e = enemy('e', -4, 0);
    let plan = planHealerEscort(state(10, [m, h], [e]), flag);
    h.fatigue = 2;
    plan = planHealerEscort(state(11, [m, h], [e]), flag, plan.state);
    assert.equal(plan.escort.mode, 'fatigue-pause');
    const diagnostics = [];
    moveCreeps([h, m], [e], flag, new Map(), new Map(), plan.escort,
        diagnostic => diagnostics.push(diagnostic));
    assert.deepEqual(h.calls, []);
    assert.deepEqual(diagnostics, [{ event: 'fatigue-pause', healerId: 'h', allyId: 'm',
        range: 4, targetId: null, returnCode: null }]);
    h.fatigue = 0;
    m.fatigue = 1;
    assert.equal(planHealerEscort(state(12, [m, h], [e]), flag, plan.state).escort.mode, 'fatigue-pause');
    m.fatigue = 0;
    for (let tick = 12; tick <= 21; tick++) plan = planHealerEscort(state(tick, [m, h], [e]), flag, plan.state);
    assert.ok(plan.escort);
    assert.equal(planHealerEscort(state(22, [m, h], [e]), flag, plan.state).transition.reason, 'timeout');
});

test('assigned healer holds within range two without issuing movement', () => {
    const m = melee('m', 0, 0);
    const h = healer('h', 2, 0);
    const e = enemy('e', -4, 0);
    const plan = planHealerEscort(state(1, [m, h], [e]), flag);
    assert.equal(plan.escort.mode, 'hold');
    const diagnostics = [];
    moveCreeps([h, m], [e], flag, new Map(), new Map(), plan.escort,
        diagnostic => diagnostics.push(diagnostic));
    assert.deepEqual(h.calls, []);
    assert.deepEqual(diagnostics, [{ event: 'hold', healerId: 'h', allyId: 'm',
        range: 2, targetId: null, returnCode: null }]);
});

test('each partner or safety loss releases once without reassignment', () => {
    const cases = [
        ['missing healer', 'partner-lost', ({ friends }) => friends.pop()],
        ['missing melee', 'partner-lost', ({ friends }) => friends.shift()],
        ['dead healer', 'partner-lost', ({ h }) => { h.hits = 0; }],
        ['dead melee', 'partner-lost', ({ m }) => { m.hits = 0; }],
        ['healer lost HEAL', 'role-lost', ({ h }) => { h.body[0].hits = 0; }],
        ['healer lost MOVE', 'role-lost', ({ h }) => { h.body[1].hits = 0; }],
        ['melee lost ATTACK', 'role-lost', ({ m }) => { m.body[0].hits = 0; }],
        ['melee lost MOVE', 'role-lost', ({ m }) => { m.body[1].hits = 0; }],
        ['healer became armed', 'role-lost', ({ h }) => { h.body.push({ type: 'attack', hits: 100 }); }],
        ['melee became mixed', 'role-lost', ({ m }) => { m.body.push({ type: 'heal', hits: 100 }); }],
        ['first flag lost', 'first-flag-lost', ({ first }) => { first.my = false; }],
        ['engagement ended', 'engagement-ended', ({ e }) => { e.x = -6; }],
        ['enemy died', 'engagement-ended', ({ e }) => { e.hits = 0; }],
        ['separated', 'separated', ({ h }) => { h.x = 6; }],
        ['healer exposed', 'healer-exposed', ({ h }) => { h.x = -1; }],
    ];
    for (const [label, expectedReason, mutate] of cases) {
        const m = melee('m', 0, 0);
        const h = healer('h', 4, 0);
        const e = enemy('e', -4, 0);
        const friends = [m, h];
        const first = { ...flag };
        const acquired = planHealerEscort(state(1, friends, [e]), first);
        mutate({ m, h, e, friends, first });
        const released = planHealerEscort(state(2, friends, [e]), first, acquired.state);
        assert.equal(released.transition.reason, expectedReason, label);
        assert.equal(released.escort, null, label);
        assert.equal(planHealerEscort(state(3, [m, h], [enemy('new', -3, 0)]), flag, released.state).escort,
            null, label);
    }
});
