import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { createSpilloverContext, selectSpilloverDecision, selectCombatDecision } from '../../src/tactics/combat.js';
import { executeTactics } from '../../src/arena/execute.js';

// Same Arena-boundary substitution as tick-flow.test.js; project code stays real.
const modules = new Map([
    ['game/utils', 'export const getObjectsByPrototype = p => globalThis.__spillObjects.get(p); export const getObjects = () => [...globalThis.__spillObjects.values()].flat(); export const getTerrainAt = () => 0; export const getTicks = () => globalThis.__spillTick; export const getCpuTime = () => 1234;'],
    ['game', 'export const arenaInfo = { name: "Pain and Gain", season: "4", level: 1, ticksLimit: 2000, cpuTimeLimit: 20000000, cpuTimeLimitFirstTick: 100000000 };'],
    ['game/path-finder', 'export const searchPath = () => ({ path: [], incomplete: false });'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER = "eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({ resolve(specifier, context, next) {
    const source = modules.get(specifier);
    return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { runTick } = await import('../../src/loop.js');
const { Creep } = await import('game/prototypes');
const { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');

function flags() {
    return [['eff_damage_taken_modifier', 5], ['eff_heal_modifier', 4], ['eff_heal_modifier', 4],
        ['eff_attack_modifier', 3], ['eff_attack_modifier', 3],
        ['eff_ranged_attack_modifier', 3], ['eff_ranged_attack_modifier', 3]].map(([effectType, scorePerTick], i) =>
        Object.assign(new ScoreFlag(), { id: 'flag-' + i, x: i, y: 20, exists: true, my: undefined, effectType, scorePerTick }));
}
function unit(id, x, y, parts, calls, extra = {}) {
    const c = Object.assign(new Creep(), { id, x, y, my: true, exists: true, hits: 100, hitsMax: 100, fatigue: 0,
        ...extra, body: Object.entries(parts).flatMap(([type, n]) => Array(n).fill(null).map(() => ({ type, hits: 1 }))),
        getRangeTo(t) { return Math.max(Math.abs(this.x - t.x), Math.abs(this.y - t.y)); }, returnCode: 0 });
    for (const method of ['moveTo', 'heal', 'rangedHeal', 'attack', 'rangedAttack']) c[method] = target => {
        calls.push([c.id, method, target.id]);
        return c.returnCode;
    };
    return c;
}
function setup(parts = 2, hp = 60) {
    const calls = [];
    const m = unit('m', 2, 0, { attack: parts }, calls), r = unit('r', 0, 0, { ranged_attack: 6 }, calls);
    const a = unit('a', 3, 0, {}, calls, { my: false, hits: hp });
    const b = unit('b', 3, 3, { attack: 1 }, calls, { my: false });
    return { calls, m, r, a, b, flags: flags(), creeps: [m, r, a, b] };
}
function observe(s, tick = 43) {
    return { tick, creeps: s.creeps, flags: s.flags,
        myCreeps: s.creeps.filter(c => c.my), enemies: s.creeps.filter(c => !c.my && c.hits > 0),
        damagedFriends: s.creeps.filter(c => c.my && c.hits > 0 && c.hits < c.hitsMax) };
}
function tick(t, s, at = 43) {
    const records = [];
    const logger = t.mock.method(console, 'log', text => records.push(JSON.parse(text)));
    globalThis.__spillObjects = new Map([[Creep, s.creeps], [ScoreFlag, s.flags]]);
    globalThis.__spillTick = at;
    try { runTick(); } finally {
        logger.mock.restore();
        delete globalThis.__spillObjects;
        delete globalThis.__spillTick;
    }
    return records;
}
const attacks = calls => calls.filter(c => ['attack', 'rangedAttack'].includes(c[1]));
const lastRanged = calls => calls.filter(c => c[1] === 'rangedAttack').at(-1)?.[2];
const actionKey = d => d.actions.map(a => [a.method, a.target.id]);

test('real runTick: pinned43 baseline, live assumptions, accepted call order and four equal-range redirects', t => {
    const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ranged-spillover-tick43.json', import.meta.url)));
    const calls = [];
    const creeps = fixture.snapshot.creeps.map(c => unit(c.id, c.x, c.y, c.activeBodyParts, calls, c));
    const selectedFlags = fixture.snapshot.flags.map(f => Object.assign(new ScoreFlag(), { ...f, exists: true,
        my: f.owner === 'me' ? true : f.owner === 'enemy' ? false : undefined }));
    const s = { creeps, flags: selectedFlags };
    // Same observations/movement objectives; only a non-first flag's unsupported
    // ownership disables trial proof for the baseline command comparison.
    selectedFlags.at(-1).my = null;
    tick(t, s);
    const baselineCalls = calls.splice(0);
    const recorded = fixture.events.filter(e => e.type === 'action-attempt').map(e => [e.actorId, e.method, e.target.id]);
    assert.deepEqual(baselineCalls.filter(c => c[1] !== 'moveTo'), recorded);
    selectedFlags.at(-1).my = undefined;
    const state = observe(s);
    assert.equal(createSpilloverContext(state, state.myCreeps, state.enemies).enemyRosterComplete, true);
    const records = tick(t, s);
    assert.deepEqual(calls.filter(c => !['attack', 'rangedAttack'].includes(c[1])),
        baselineCalls.filter(c => !['attack', 'rangedAttack'].includes(c[1])), 'Movement/healing unchanged');
    const expected = attacks(baselineCalls).map(c => c[0].match(/ranged_[1345]$/)
        ? [c[0], c[1], 'pg_player1_melee_3'] : c);
    assert.deepEqual(attacks(calls), expected);
    const redirected = records.filter(e => e.type === 'action-decision' && e.reason === 'ranged-spillover');
    assert.equal(redirected.length, 4);
    assert.deepEqual(redirected.map(e => e.actorId), [1, 3, 4, 5].map(n => 'pg_player2_ranged_' + n));
    const attempts = records.filter(e => e.type === 'action-attempt' && e.channel === 'combat');
    assert.equal(attempts.length, 8);
    assert.ok(attempts.every(e => e.returnCode === 0));
    assert.ok(Math.max(...attempts.filter(e => e.method === 'attack').map(e => e.sequence)) <
        Math.min(...attempts.filter(e => e.method === 'rangedAttack').map(e => e.sequence)));
    assert.equal(records.filter(e => e.type === 'action-decision' && e.channel === 'combat').length, 14);
    assert.equal(records.at(-1).type, 'evidence-coverage');
    // No extra records/framework: ordinary decision reasons and attempts only.
    assert.ok(records.every(e => !e.type.includes('spillover')));
});

for (const code of [0, -9, undefined, '0']) test(`real runTick: only numeric accepted0 supplies capacity (${String(code)})`, t => {
    const s = setup(); s.m.returnCode = code;
    const records = tick(t, s);
    assert.equal(lastRanged(s.calls), code === 0 ? 'b' : 'a');
    const decision = records.find(e => e.type === 'action-decision' && e.actorId === 'r' && e.channel === 'combat');
    assert.equal(decision.reason, code === 0 ? 'ranged-spillover' : 'ranged-spillover-fallback');
});

test('real runTick: interleaved order is preserved, current/future melee never moved earlier', t => {
    const s = setup(1);
    const m2 = unit('m2', 2, 1, { attack: 1 }, s.calls), r2 = unit('r2', 0, 1, { ranged_attack: 6 }, s.calls);
    s.creeps = [s.m, s.r, m2, r2, s.a, s.b];
    tick(t, s);
    assert.deepEqual(attacks(s.calls), [['m', 'attack', 'a'], ['r', 'rangedAttack', 'a'],
        ['m2', 'attack', 'a'], ['r2', 'rangedAttack', 'b']]);
    const mixed = setup(2);
    mixed.creeps = [mixed.r, mixed.m, mixed.a, mixed.b];
    tick(t, mixed);
    assert.deepEqual(attacks(mixed.calls), [['r', 'rangedAttack', 'a'], ['m', 'attack', 'a']]);
});

test('real runTick: each new tick and match reset start with an empty budget', t => {
    const s = setup();
    tick(t, s, 50); assert.equal(lastRanged(s.calls), 'b');
    s.calls.length = 0; s.m.returnCode = -9;
    tick(t, s, 51); assert.equal(lastRanged(s.calls), 'a');
    s.calls.length = 0;
    tick(t, s, 1); assert.equal(lastRanged(s.calls), 'a');
    s.calls.length = 0; s.m.returnCode = 0;
    tick(t, s, 2); assert.equal(lastRanged(s.calls), 'b');
});

test('real executor without reporter still accounts actual returns and resets per invocation', () => {
    const s = setup(), state = observe(s);
    executeTactics(state.myCreeps, state.enemies, [], null, state);
    assert.equal(lastRanged(s.calls), 'b');
    s.calls.length = 0; s.m.returnCode = -9;
    executeTactics(state.myCreeps, state.enemies, [], null, state);
    assert.equal(lastRanged(s.calls), 'a');
});

test('real runTick: insufficient/exact/excess budgets and absent equal-range alternative', t => {
    for (const [parts, target] of [[1, 'a'], [2, 'b'], [3, 'b']]) {
        const s = setup(parts); tick(t, s); assert.equal(lastRanged(s.calls), target);
    }
    const s = setup(); s.b.x = 4;
    tick(t, s); assert.equal(lastRanged(s.calls), 'a');
});

test('real runTick: modifiers and incomplete/unknown flags retain baseline; own incoming vulnerability does not', t => {
    for (const [index, owner] of [[0, false], [1, false], [3, true], [5, true], [6, null]]) {
        const s = setup(); s.flags[index].my = owner;
        tick(t, s); assert.equal(lastRanged(s.calls), 'a');
    }
    const missing = setup(); missing.flags.pop();
    tick(t, missing); assert.equal(lastRanged(missing.calls), 'a');
    const unknown = setup(); unknown.flags[6].effectType = 'unknown';
    tick(t, unknown); assert.equal(lastRanged(unknown.calls), 'a');
    const ownVulnerability = setup(); ownVulnerability.flags[0].my = true;
    tick(t, ownVulnerability); assert.equal(lastRanged(ownVulnerability.calls), 'b');
});

test('real runTick: healing access to either target disables; unavailable friendly healing stays excluded', t => {
    for (const [x, y, expected] of [[5, 0, 'a'], [3, 6, 'a'], [7, 7, 'b']]) {
        const s = setup(); s.creeps.push(unit('enemy-healer', x, y, { heal: 1 }, s.calls, { my: false }));
        tick(t, s); assert.equal(lastRanged(s.calls), expected);
    }
    const s = setup();
    s.m.body.push({ type: 'heal', hits: 1 }); s.m.hits = 90;
    tick(t, s);
    assert.equal(lastRanged(s.calls), 'a');
    assert.ok(s.calls.some(c => c[0] === 'm' && c[1] === 'heal'));
    assert.ok(!s.calls.some(c => c[0] === 'm' && c[1] === 'attack'));
});

test('real executor: incomplete roster, stale instances and duplicate actors cannot authorize spillover', () => {
    for (const change of ['incomplete', 'stale', 'duplicate', 'body', 'size']) {
        const s = setup();
        if (change === 'duplicate') s.creeps = [s.m, ...s.creeps];
        if (change === 'stale') s.a.exists = false;
        if (change === 'body') s.m.body = Array(51).fill({ type: 'attack', hits: 1 });
        if (change === 'size') for (let i = 0; i < 13; i++) s.creeps.push(unit('extra' + i, 20 + i, 20, {}, s.calls));
        const state = observe(s);
        if (change === 'incomplete') state.creeps = state.creeps.filter(c => c !== s.m);
        executeTactics(state.myCreeps, state.enemies, state.damagedFriends, null, state);
        assert.equal(lastRanged(s.calls), 'a', change);
    }
});

test('promoted runtime policy: duplicate observations count once, ambiguous accepted replacements and overflow fall back', () => {
    const s = setup(2, 90), state = observe(s);
    const context = { ...createSpilloverContext(state, state.myCreeps, state.enemies), sequence: 3 };
    const e = { tick: 43, sequence: 1, actionId: '43:1', actorId: 'm', method: 'attack', targetId: 'a', returnCode: 0 };
    for (const prefix of [[e, e], [e, { ...e, sequence: 2, actionId: '43:2' }],
        [e, { ...e, returnCode: -9 }], [e, { ...e, sequence: 2, actionId: '43:2', targetId: 'b' }], Array(65).fill(e)]) {
        const candidate = selectSpilloverDecision(s.r, state.enemies, null, { ...context, earlierIntents: prefix });
        assert.deepEqual(actionKey(candidate), actionKey(selectCombatDecision(s.r, state.enemies, null)));
    }
});

for (const kind of ['null-part', 'sparse-body']) test(`live context rejects unknown enemy body shape (${kind})`, () => {
    const s = setup();
    s.a.body = kind === 'null-part' ? [null] : Array(1);
    const state = observe(s);
    executeTactics(state.myCreeps, state.enemies, [], null, state);
    assert.equal(lastRanged(s.calls), 'a', 'Unknown parts cannot establish absence of enemy HEAL');
});
