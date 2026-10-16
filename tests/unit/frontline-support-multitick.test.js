import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { planHealerEscort } from '../../src/tactics/healer-escort.js';

// Generated plain-grid fixture, not a replay trajectory or Arena pathfinder.
// Resolve all queued moves simultaneously after production decisions/tactics.
function scenario(flagX, flagY, ticks = 8) {
    const queued = new Map(), calls = [], engagements = new Map();
    function unit(id, x, types, my = true) {
        return { id, x, y: 0, my, hits: 100, hitsMax: 100, fatigue: 0,
            body: types.map(type => ({ type, hits: 100 })),
            getRangeTo(t) { return Math.max(Math.abs(this.x - t.x), Math.abs(this.y - t.y)); },
            moveTo(t) { calls.push([id, 'moveTo', t.id]); queued.set(id, { x: t.x, y: t.y }); return 0; },
            attack(t) { calls.push([id, 'attack', t.id]); return 0; },
            heal(t) { calls.push([id, 'heal', t.id]); return 0; },
            rangedHeal(t) { calls.push([id, 'rangedHeal', t.id]); return 0; } };
    }
    const front = unit('front', 0, ['attack', 'move']);
    const healer = unit('healer', 4, ['heal', 'move']);
    const enemy = unit('enemy', -4, ['attack', 'move'], false);
    const flag = { id: 'first', x: flagX, y: flagY, my: true };
    const friends = [front, healer], trace = [];
    // Escort is enabled in production, but already consumed in this fixture.
    let escort = { used: true, pair: null, startedTick: 0 };
    for (let tick = 1; tick <= ticks; tick++) {
        calls.length = 0; queued.clear();
        // Controlled opponent keeps contact; it enters melee range on the last observation.
        enemy.x = front.x - (tick === 8 ? 1 : 4);
        const before = { front: [front.x, front.y], healer: [healer.x, healer.y] };
        const plan = planHealerEscort({ tick, myCreeps: friends, enemies: [enemy] }, flag, escort);
        escort = plan.state;
        assert.equal(plan.escort, null);
        const decisions = [];
        moveCreeps(friends, [enemy], flag, engagements, new Map(), plan.escort, null,
            { decision: d => { decisions.push(d); return null; } });
        executeTactics(friends, [enemy], []);
        assert.ok(friends.every(c => calls.filter(([id, m]) => id === c.id && m === 'moveTo').length <= 1));
        for (const c of friends) {
            const target = queued.get(c.id);
            if (target) { c.x += Math.sign(target.x - c.x); c.y += Math.sign(target.y - c.y); }
        }
        trace.push({ tick, before, reason: decisions.find(d => d.actorId === front.id).reason,
            after: { front: [front.x, front.y], healer: [healer.x, healer.y] }, calls: [...calls] });
    }
    return trace;
}

test('multi-tick healthy melee cannot wait forever for a flag-bound or differently moving healer', t => {
    const traces = { atFlag: scenario(4, 0), movingElsewhere: scenario(5, 2) };
    t.diagnostic(JSON.stringify(traces));
    for (const trace of Object.values(traces)) {
        assert.deepEqual(trace.slice(0, 3).map(t => t.reason),
            ['await-local-healer', 'await-local-healer', 'combat-approach']);
        assert.deepEqual(trace.slice(2, 7).map(t => t.reason), Array(5).fill('combat-approach'));
        assert.deepEqual(trace[6].after.front, [-5, 0]);
        assert.equal(trace[7].reason, 'combat-in-range');
        assert.ok(trace[7].calls.some(([id, method]) => id === 'front' && method === 'attack'));
    }
    assert.deepEqual(traces.atFlag[0].before.healer, traces.atFlag[6].after.healer);
    assert.notDeepEqual(traces.movingElsewhere[0].before.healer, traces.movingElsewhere[1].after.healer);
});

test('actual healer arrival into range three releases on the next observation, before the bound', () => {
    const trace = scenario(2, 0, 2);
    assert.equal(trace[0].reason, 'await-local-healer');
    assert.deepEqual(trace[0].after.healer, [3, 0]);
    assert.equal(trace[1].reason, 'combat-approach');
    assert.deepEqual(trace[1].after.front, [-1, 0]);
});
