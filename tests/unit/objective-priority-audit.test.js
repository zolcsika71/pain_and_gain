// Priority-contract checks, not a proposed runtime policy or alternate replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFlag } from '../../src/strategy/objectives.js';
import { selectMovementPlan } from '../../src/tactics/movement.js';
import { moveCreeps } from '../../src/arena/execute.js';
import { planHealerEscort } from '../../src/tactics/healer-escort.js';

const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function actor(id, x, y, types, extra = {}) {
    return { id, x, y, my: true, hits: 100, hitsMax: 100, fatigue: 0,
        body: types.map(type => ({ type, hits: 100 })), calls: [], ...extra,
        getRangeTo(t) { return range(this, t); }, moveTo(t) { this.calls.push(t.id); return 0; } };
}
const flag = { id: 'first', x: 1, y: 0 };
const foe = (x, y = 0) => actor('enemy', x, y, ['attack', 'move'], { my: false });

test('first-flag selection is unconditional, but a closer flag cannot override local combat', () => {
    const m = actor('m', 0, 0, ['attack', 'move']);
    assert.equal(selectFlag([flag, { id: 'second' }]), flag);
    assert.equal(selectFlag([]), undefined);
    for (const first of [flag, { ...flag, my: true }, { ...flag, my: false }, null]) {
        assert.equal(selectMovementPlan(m, [foe(-4)], first).reason, 'combat-approach');
        assert.equal(selectMovementPlan(m, [foe(-1)], first).reason, 'combat-in-range');
    }
});

test('healthy healer fallback changes to injury support at the existing finite boundary', () => {
    const h = actor('h', 0, 0, ['heal', 'move']);
    const m = actor('m', -6, 0, ['attack', 'move'], { hits: 80 });
    assert.equal(selectMovementPlan(h, [], flag, null, [h, m]).reason, 'flag-fallback');
    m.x = -5;
    assert.equal(selectMovementPlan(h, [], flag, null, [h, m]).target, m);
    m.x = -3;
    assert.equal(selectMovementPlan(h, [], flag, null, [h, m]).reason, 'injured-ally-in-range');
    m.hits = 100;
    assert.equal(selectMovementPlan(h, [], flag, null, [h, m]).reason, 'flag-fallback');
});

test('shared bounded support pauses override the flag; exhaustion returns to combat, not capture', () => {
    const m = actor('m', 0, 0, ['attack', 'move']), h = actor('h', 4, 0, ['heal', 'move']);
    let engagement;
    for (const expected of ['await-local-healer', 'await-local-healer', 'combat-approach']) {
        const p = selectMovementPlan(m, [foe(-4)], flag, engagement, [m, h]);
        assert.equal(p.reason, expected); engagement = p.engagement;
        if (p.target) assert.equal(p.target.id, 'enemy');
    }
});

test('generated blocked approach keeps combat priority; withdrawal permits flag progress', () => {
    const m = actor('m', 0, 0, ['attack', 'move']);
    const blocker = actor('blocker', -1, 0, ['move']);
    const e = foe(-4), engagements = new Map(), trace = [];
    for (let tick = 1; tick <= 4; tick++) {
        if (tick === 3) blocker.y = 2;
        if (tick === 4) e.x = -20;
        m.calls.length = 0;
        moveCreeps([m], [e], flag, engagements);
        assert.equal(m.calls.length, 1);
        const destination = m.calls[0] === e.id ? e : flag;
        const next = { x: m.x + Math.sign(destination.x - m.x), y: m.y + Math.sign(destination.y - m.y) };
        if (![blocker, e].some(c => range(c, next) === 0)) Object.assign(m, next);
        assert.equal(new Set([m, blocker, e].map(c => `${c.x},${c.y}`)).size, 3);
        trace.push({ target: m.calls[0], x: m.x });
    }
    assert.deepEqual(trace, [{ target: 'enemy', x: 0 }, { target: 'enemy', x: 0 },
        { target: 'enemy', x: -1 }, { target: 'first', x: 0 }]);
});

test('lost weapons explain flag fallback even beside enemies; they do not suppress an available attack', () => {
    const m = actor('m', 0, 0, ['attack', 'move']);
    assert.equal(selectMovementPlan(m, [foe(-1)], flag).reason, 'combat-in-range');
    m.body[0].hits = 0;
    assert.equal(selectMovementPlan(m, [foe(-1)], flag).reason, 'flag-fallback');
});

test('escort wins executor routing, but neutral ownership then injuries prevent opening acquisition', () => {
    const m = actor('m', 0, 0, ['attack', 'move']), h = actor('h', 4, 0, ['heal', 'move']);
    const state = { tick: 37, myCreeps: [m, h], enemies: [foe(-4)] };
    assert.equal(planHealerEscort(state, flag).escort, null);
    m.hits = 80;
    assert.equal(planHealerEscort(state, { ...flag, my: true }).escort, null);
    m.hits = 100;
    const p = planHealerEscort(state, { ...flag, my: true });
    assert(p.escort);
    moveCreeps([m, h], state.enemies, flag, new Map(), new Map(), p.escort);
    assert.deepEqual(h.calls, ['m']);
});
