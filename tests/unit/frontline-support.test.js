import test from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/frontline-support-6ad13f88.json' with { type: 'json' };
import { selectMovementPlan } from '../../src/tactics/movement.js';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';

function unit(id, x, y, types, options = {}) {
    const actor = { id, x, y, my: true, hits: 100, hitsMax: 100, fatigue: 0,
        body: types.map(type => ({ type, hits: 100 })), ...options, calls: [],
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); } };
    for (const method of ['moveTo', 'attack', 'rangedAttack', 'heal', 'rangedHeal']) {
        actor[method] = target => { actor.calls.push([method, target.id]); return 0; };
    }
    return actor;
}

function setup() {
    return { actor: unit('front', 0, 0, ['attack', 'move']),
        enemy: unit('enemy', -2, 0, ['attack', 'move'], { my: false }),
        healer: unit('healer', 4, 0, ['heal', 'move']), flag: { id: 'first', x: 8, y: 8 } };
}

test('recorded tick 45 exposes an unsupported advance; candidate pauses without rewriting history', () => {
    const units = recorded.creeps.map(c => unit(c.id, c.x, c.y, [], { ...c,
        body: Object.entries(c.activeBodyParts).flatMap(([type, count]) =>
            Array.from({ length: count }, () => ({ type, hits: 1 }))) }));
    const actor = units.find(c => c.id === recorded.actorId);
    const enemy = units.find(c => c.id === recorded.targetId);
    const friends = units.filter(c => c.my);
    const before = JSON.stringify(recorded);
    assert.equal(recorded.provenance.sourceBuildId, '195ad242a0db34be6b279b82d9f65e17acffc3eea6172aa10b986be94aba9697');
    assert.equal(recorded.provenance.recordedMovement.method, 'moveTo');
    assert.equal(recorded.provenance.recordedMovement.target.id, enemy.id);
    assert.equal(recorded.provenance.recordedMovement.returnCode, 0);
    assert.equal(Math.min(...friends.filter(c => c.body.some(p => p.type === 'heal'))
        .map(c => actor.getRangeTo(c))), 4);
    const plan = selectMovementPlan(actor, [enemy], recorded.flag, null, friends);
    assert.equal(plan.target, null);
    assert.equal(plan.outcome, 'hold');
    assert.equal(plan.reason, 'await-local-healer');
    assert.deepEqual(plan.engagement, { id: enemy.id, outsideTicks: 0, supportWaitTicks: 1 });
    assert.equal(JSON.stringify(recorded), before);
});

test('local support boundary is inclusive at five, available healing at three releases immediately', () => {
    const { actor, enemy, healer, flag } = setup();
    for (const x of [4, 5]) {
        healer.x = x;
        assert.equal(selectMovementPlan(actor, [enemy], flag, null, [actor, healer]).reason, 'await-local-healer');
    }
    for (const x of [0, 1, 3, 6]) {
        healer.x = x;
        assert.equal(selectMovementPlan(actor, [enemy], flag, null, [actor, healer]).reason, 'combat-approach');
    }
    healer.x = 4; healer.y = 5;
    assert.equal(selectMovementPlan(actor, [enemy], flag, null, [actor, healer]).reason, 'await-local-healer');
    healer.y = 6;
    assert.equal(selectMovementPlan(actor, [enemy], flag, null, [actor, healer]).reason, 'combat-approach');
});

test('no support, enemy/dead/injured/immobile/fatigued or armed healers do not impose a wait', () => {
    const { actor, enemy, flag } = setup();
    assert.equal(selectMovementPlan(actor, [enemy], flag, null, [actor]).target, enemy);
    for (const options of [{ my: false }, { hits: 0 }, { hits: 99 }, { fatigue: 1 },
        { body: [{ type: 'heal', hits: 100 }, { type: 'move', hits: 0 }] },
        { body: [{ type: 'heal', hits: 0 }, { type: 'move', hits: 100 }] },
        { body: [{ type: 'heal', hits: 100 }, { type: 'move', hits: 100 }, { type: 'attack', hits: 100 }] },
        { body: [{ type: 'heal', hits: 100 }, { type: 'move', hits: 100 }, { type: 'ranged_attack', hits: 100 }] }]) {
        const healer = unit('support', 4, 0, ['heal', 'move'], options);
        assert.equal(selectMovementPlan(actor, [enemy], flag, null, [actor, healer]).target, enemy);
    }
});

test('any functioning in-range healer can heal even if injured, fatigued or mixed-role', () => {
    const { actor, enemy, healer, flag } = setup();
    const near = unit('near', 3, 0, ['heal', 'attack'], { hits: 1, fatigue: 10 });
    assert.equal(selectMovementPlan(actor, [enemy], flag, null, [healer, near, actor]).target, enemy);
});

test('mixed roles (including disabled mixed parts), ranged, unarmed and ineligible actors stay unchanged', () => {
    const { enemy, healer, flag } = setup();
    for (const types of [['attack', 'ranged_attack', 'move'], ['attack', 'heal', 'move'],
        ['ranged_attack', 'move'], ['move']]) {
        const actor = unit('mixed', 0, 0, types);
        const before = selectMovementPlan(actor, [enemy], flag);
        assert.deepEqual(selectMovementPlan(actor, [enemy], flag, null, [actor, healer]), before);
        if (types.includes('attack') && types.length > 2) {
            actor.body.find(p => p.type !== 'attack' && p.type !== 'move').hits = 0;
            assert.deepEqual(selectMovementPlan(actor, [enemy], flag, null, [actor, healer]),
                selectMovementPlan(actor, [enemy], flag));
        }
    }
    for (const options of [{ my: false }, { hits: 0 }, { fatigue: 1 },
        { body: [{ type: 'attack', hits: 100 }, { type: 'move', hits: 0 }] }]) {
        const actor = unit('ineligible', 0, 0, ['attack', 'move'], options);
        assert.deepEqual(selectMovementPlan(actor, [enemy], flag, null, [actor, healer]),
            selectMovementPlan(actor, [enemy], flag));
    }
});

test('adjacent attacks continue; wait never suppresses tactics or adds movement commands', () => {
    const { actor, enemy, healer, flag } = setup();
    enemy.x = -1;
    moveCreeps([actor, healer], [enemy], flag);
    executeTactics([actor, healer], [enemy], []);
    assert.deepEqual(actor.calls, [['attack', enemy.id]]);
    actor.calls.length = 0; healer.calls.length = 0; enemy.x = -2;
    const records = [];
    moveCreeps([actor, healer], [enemy], flag, new Map(), new Map(), null, null,
        { decision: d => { records.push(d); return null; } });
    executeTactics([actor, healer], [enemy], []);
    assert.equal(records.find(d => d.actorId === actor.id).reason, 'await-local-healer');
    assert.deepEqual(actor.calls, []);
    assert.equal(healer.calls.filter(c => c[0] === 'moveTo').length, 1);
});

test('waiting is deterministic and preserves engagement expiry and fallback', () => {
    const { actor, enemy, healer, flag } = setup();
    const a = selectMovementPlan(actor, [enemy], flag, null, [actor, healer]);
    assert.deepEqual(selectMovementPlan(actor, [enemy], flag, null, [healer, actor]), a);
    const engagements = new Map();
    moveCreeps([actor, healer], [enemy], flag, engagements);
    assert.deepEqual(engagements.get(actor.id), { id: enemy.id, outsideTicks: 0, supportWaitTicks: 1 });
    healer.x = 3;
    moveCreeps([actor, healer], [enemy], flag, engagements);
    assert.deepEqual(actor.calls, [['moveTo', enemy.id]]);
    healer.x = 4; enemy.x = -6;
    const retained = selectMovementPlan(actor, [enemy], flag, { id: enemy.id, outsideTicks: 0 }, [healer]);
    assert.equal(retained.reason, 'await-local-healer');
    assert.deepEqual(retained.engagement, { id: enemy.id, outsideTicks: 1, supportWaitTicks: 1 });
    assert.equal(selectMovementPlan(actor, [enemy], flag, retained.engagement, [healer]).target, flag);
    assert.equal(selectMovementPlan(actor, [enemy], flag, null, [healer]).target, flag);
    assert.equal(selectMovementPlan(actor, [], null, null, [healer]).reason, 'no-movement-objective');
});

test('spent wait budget survives retargeting, support arrival and adjacent combat until disengagement', () => {
    const { actor, enemy, healer, flag } = setup();
    let plan = selectMovementPlan(actor, [enemy], flag, null, [healer]);
    assert.equal(plan.engagement.supportWaitTicks, 1);
    const nextEnemy = unit('next', -3, 0, ['attack', 'move'], { my: false });
    plan = selectMovementPlan(actor, [nextEnemy], flag, plan.engagement, [healer]);
    assert.equal(plan.engagement.supportWaitTicks, 2);
    healer.x = 3;
    plan = selectMovementPlan(actor, [enemy], flag, plan.engagement, [healer]);
    assert.equal(plan.reason, 'combat-approach');
    assert.equal(plan.engagement.supportWaitTicks, 2);
    enemy.x = -1; healer.x = 4;
    plan = selectMovementPlan(actor, [enemy], flag, plan.engagement, [healer]);
    assert.equal(plan.reason, 'combat-in-range');
    assert.equal(plan.engagement.supportWaitTicks, 2);
    enemy.x = -2;
    plan = selectMovementPlan(actor, [enemy], flag, plan.engagement, [healer]);
    assert.equal(plan.reason, 'combat-approach');
    assert.equal(plan.engagement.supportWaitTicks, 2);
    plan = selectMovementPlan(actor, [], flag, plan.engagement, [healer]);
    assert.equal(plan.engagement, null);
    plan = selectMovementPlan(actor, [enemy], flag, plan.engagement, [healer]);
    assert.equal(plan.reason, 'await-local-healer');
    assert.equal(plan.engagement.supportWaitTicks, 1);
});
