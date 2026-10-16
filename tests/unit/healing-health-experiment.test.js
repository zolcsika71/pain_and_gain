import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectHealingDecision } from '../../src/tactics/healing.js';
import { selectCombatDecision } from '../../src/tactics/combat.js';
import { selectHealthTieBreakDecision } from '../fixtures/healing-health-candidate.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/healing-health-window44-45.json', import.meta.url)));
function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
freeze(fixture);
function unit(id, x = 0, y = 0, extra = {}) {
    const { activeBodyParts = { heal: 1 }, ...fields } = extra;
    return freeze({ id, my: true, x, y, hits: 100, hitsMax: 100, ...fields,
        // Presence-only adapter, NOT reconstructed body-part HP or heal effects.
        body: Object.entries(activeBodyParts).flatMap(([type, n]) =>
            Array.from({ length: n }, () => ({ type, hits: 1 }))),
        getRangeTo(target) { return Math.max(Math.abs(this.x - target.x), Math.abs(this.y - target.y)); },
    });
}
const key = decision => decision.action ? {
    targetId: decision.action.target.id, method: decision.action.method,
} : null;
const ownId = name => `pg_player2_${name}`;
// Explicit expectations from recorded health/range values, not candidate output.
const expectedCandidate = {
    44: ['melee_2', 'ranged_5', 'melee_2'],
    45: [null, 'melee_3', 'melee_3'],
};

for (const snapshot of fixture.snapshots) {
    for (const [i, observed] of snapshot.decisions.entries()) {
        test(`recorded ${snapshot.tick} healer ${i + 1}: baseline/actual and health-tie candidate`, () => {
            assert.equal(snapshot.healModifier, 1, 'Nominal equals flag-adjusted capacity in these snapshots only');
            const units = snapshot.creeps.map(c => {
                for (const field of ['hits', 'hitsMax', 'x', 'y']) {
                    assert.ok(Number.isFinite(c[field]), `Missing recorded ${field}: comparison unavailable`);
                }
                return unit(c.id, c.x, c.y, c);
            });
            const h = units.find(c => c.id === observed.healerId);
            const injured = freeze(units.filter(c => c.hits > 0 && c.hits < c.hitsMax));
            const baseline = selectHealingDecision(h, injured);
            assert.deepEqual(key(baseline), observed.expectedBaseline);
            assert.equal(baseline.reason, observed.reason);
            assert.equal(observed.actual.length, baseline.action ? 1 : 0);
            if (baseline.action) {
                assert.deepEqual({ targetId: observed.actual[0].targetId, method: observed.actual[0].method }, key(baseline));
                assert.equal(observed.actual[0].returnCode, 0); // Scheduling, not healing amount.
            } else assert.equal(baseline.outcome, 'no-action');
            const before = JSON.stringify(units);
            const candidate = selectHealthTieBreakDecision(h, injured);
            const expected = expectedCandidate[snapshot.tick][i];
            assert.deepEqual(key(candidate), expected ? { targetId: ownId(expected), method: 'rangedHeal' } : null);
            assert.deepEqual(key(selectHealthTieBreakDecision(h, [...injured].reverse())), key(candidate));
            assert.deepEqual(key(selectHealthTieBreakDecision(h, injured)), key(candidate));
            assert.deepEqual(selectCombatDecision(h, [], candidate.action).actions, [], 'Pure healers have no weapon');
            assert.equal(JSON.stringify(units), before, 'No mutation or simulated effects');
        });
    }
}

test('generated: primary capped healing outranks critical health; adjacent/ranged methods remain', () => {
    const h = unit('h');
    const useful = unit('useful', 1, 0, { hits: 90 }); // 10, 90%, adjacent
    const critical = unit('critical', 3, 0, { hits: 1 }); // 4, 1%, ranged
    assert.deepEqual(key(selectHealthTieBreakDecision(h, [critical, useful])), { targetId: 'useful', method: 'heal' });
    const small = unit('small-deficit', 1, 0, { hits: 99 }); // 1, despite adjacent capacity 12
    assert.deepEqual(key(selectHealthTieBreakDecision(h, [small, critical])), { targetId: 'critical', method: 'rangedHeal' });
});

test('generated: equal score ranks health percentage, not absolute hits or deficit; before range and ID', () => {
    const h = unit('h');
    const lowerHits = unit('a', 2, 0, { hits: 60, hitsMax: 100 }); // 60%
    const lowerPercent = unit('z', 3, 0, { hits: 80, hitsMax: 200 }); // 40%
    assert.equal(selectHealingDecision(h, [lowerPercent, lowerHits]).action.target, lowerHits);
    assert.equal(selectHealthTieBreakDecision(h, [lowerHits, lowerPercent]).action.target, lowerPercent);
    const largerDeficit = unit('b', 2, 0, { hits: 900, hitsMax: 1000 }); // 90%, larger deficit than 'a'
    assert.equal(selectHealthTieBreakDecision(h, [largerDeficit, lowerHits]).action.target, lowerHits);
});

test('generated: equal health fractions retain range then raw lexicographic ID, independent of input order', () => {
    const h = unit('h');
    const far = unit('a', 3, 0, { hits: 50 });
    const near = unit('z', 2, 0, { hits: 100, hitsMax: 200 });
    const nearA = unit('b', 2, 0, { hits: 75, hitsMax: 150 });
    for (const targets of [[far, near], [near, far]]) {
        assert.equal(selectHealthTieBreakDecision(h, targets).action.target, near);
    }
    for (const targets of [[near, nearA], [nearA, near]]) {
        assert.equal(selectHealthTieBreakDecision(h, targets).action.target, nearA);
    }
});

test('generated: ownership/life/functioning HEAL/target injury/range and no-action reasons unchanged', () => {
    const h = unit('h');
    const target = unit('target', 2, 0, { hits: 50 });
    for (const healer of [unit('foreign', 0, 0, { my: false }), unit('dead', 0, 0, { hits: 0 }),
        unit('no-heal', 0, 0, { activeBodyParts: { move: 1 } }),
        freeze({ ...h, body: [{ type: 'heal', hits: 0 }] })]) {
        assert.deepEqual(selectHealthTieBreakDecision(healer, [target]), selectHealingDecision(healer, [target]));
    }
    const ineligible = [unit('healthy'), unit('enemy', 1, 0, { my: false, hits: 1 }),
        unit('dead', 1, 0, { hits: 0 }), unit('far', 4, 0, { hits: 1 })];
    assert.deepEqual(selectHealthTieBreakDecision(h, ineligible), selectHealingDecision(h, ineligible));
    assert.equal(selectHealthTieBreakDecision(h, ineligible).action, null);
    assert.equal(selectHealthTieBreakDecision(h, [...ineligible, target]).action.target, target);
    const self = unit('self', 0, 0, { hits: 50 });
    assert.deepEqual(selectHealthTieBreakDecision(self, [self, self]), selectHealingDecision(self, [self, self]));
    assert.equal(selectHealthTieBreakDecision(self, [self, self]).reason, 'self-heal');
});

test('generated: selected methods preserve existing mixed-body action exclusions', () => {
    const h = unit('mixed', 0, 0, { activeBodyParts: { heal: 1, attack: 1, ranged_attack: 1 } });
    const enemy = unit('enemy', 1, 0, { my: false });
    for (const distance of [1, 3]) {
        const t = unit('injured', distance, 0, { hits: 50 });
        const candidate = selectHealthTieBreakDecision(h, [t]);
        assert.deepEqual(selectCombatDecision(h, [enemy], candidate.action),
            selectCombatDecision(h, [enemy], selectHealingDecision(h, [t]).action));
        const methods = selectCombatDecision(h, [enemy], candidate.action).actions.map(a => a.method);
        assert.ok(!methods.includes('attack'));
        if (distance === 3) assert.deepEqual(methods, []);
        else assert.ok(methods.includes('rangedAttack'));
    }
});

test('generated: an equal-score method change still applies ranged-heal attack exclusions', () => {
    const h = unit('mixed', 0, 0, { activeBodyParts: { heal: 1, ranged_attack: 1 } });
    const adjacent = unit('adjacent', 1, 0, { hits: 96 }); // Score 4, 96% health.
    const distant = unit('distant', 3, 0, { hits: 1 }); // Score 4, 1% health.
    const enemy = unit('enemy', 1, 0, { my: false });
    const baseline = selectHealingDecision(h, [distant, adjacent]);
    const candidate = selectHealthTieBreakDecision(h, [distant, adjacent]);
    assert.deepEqual(key(baseline), { targetId: 'adjacent', method: 'heal' });
    assert.deepEqual(key(candidate), { targetId: 'distant', method: 'rangedHeal' });
    assert.equal(selectCombatDecision(h, [enemy], baseline.action).actions[0].method, 'rangedAttack');
    assert.deepEqual(selectCombatDecision(h, [enemy], candidate.action).actions, []);
});

test('recorded: team allocations shift, without increasing capped healing or proving effects', () => {
    function totals(snapshot, selector) {
        const units = snapshot.creeps.map(c => unit(c.id, c.x, c.y, c));
        const counts = {};
        for (const d of snapshot.decisions) {
            const h = units.find(c => c.id === d.healerId);
            const action = selector(h, units).action;
            if (action) {
                const capacity = h.body.filter(p => p.type === 'heal' && p.hits > 0).length *
                    (action.method === 'heal' ? 12 : 4);
                counts[action.target.id] = (counts[action.target.id] ?? 0) + capacity;
            }
        }
        for (const [id, capacity] of Object.entries(counts)) {
            const t = units.find(c => c.id === id);
            assert.ok(capacity <= t.hitsMax - t.hits, 'No pre-action excess in either policy here');
        }
        return Object.fromEntries(Object.entries(counts).map(([id, n]) => [id.replace('pg_player2_', ''), n]));
    }
    assert.deepEqual(totals(fixture.snapshots[0], selectHealingDecision), { melee_4: 24, melee_1: 48 });
    assert.deepEqual(totals(fixture.snapshots[0], selectHealthTieBreakDecision), { melee_2: 48, ranged_5: 24 });
    assert.deepEqual(totals(fixture.snapshots[1], selectHealingDecision), { melee_1: 48 });
    assert.deepEqual(totals(fixture.snapshots[1], selectHealthTieBreakDecision), { melee_3: 48 });
});
