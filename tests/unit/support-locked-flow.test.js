import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { engagementWorld, range } from '../fixtures/support-locked-generated-world.js';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';
import { validActionDecision, validActionAttempt, summarizeDiagnosticCoverage } from '../../tools/replay-logs.js';

const configuration = fs.readFileSync(new URL('../../src/config.js', import.meta.url), 'utf8');
const controller = new URL('../../src/strategy/support-locked-engagement.js', import.meta.url).href;
const modules = new Map([
    ['game/utils', 'export const getObjectsByPrototype=p=>globalThis.__locked.objects.get(p); export const getObjects=()=>[...globalThis.__locked.objects.values()].flat(); export const getTerrainAt=p=>{globalThis.__locked.terrainReads++;return globalThis.__locked.spacing.terrainAt(p);}; export const getTicks=()=>globalThis.__locked.tick; export const getCpuTime=()=>1234;'],
    ['game', 'export const arenaInfo={cpuTimeLimit:20000000,cpuTimeLimitFirstTick:100000000};'],
    ['game/path-finder', 'export const searchPath=()=>{throw Error("Unexpected route query");};'],
    ['game/constants', 'export const EFF_ATTACK_MODIFIER="eff_attack_modifier";'],
    ['game/prototypes', 'export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic', 'export class ScoreFlag {}'],
]);
registerHooks({ resolve(s, c, next) {
    let code = modules.get(s);
    if (s === './config.js' && c.parentURL?.includes('/src/loop.js')) code = c.parentURL.includes('locked-on')
        ? configuration.replace('supportLockedEngagementExperiment = false', 'supportLockedEngagementExperiment = true') : configuration;
    if (s === './strategy/support-locked-engagement.js' && c.parentURL?.includes('/src/loop.js')) code =
        `export {engagementDiagnostic} from ${JSON.stringify(controller)}; import {planSupportLockedTick as plan} from ${JSON.stringify(controller)}; export function planSupportLockedTick(...a){ globalThis.__locked.evaluations++; return plan(...a); }`;
    return code ? { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true } : next(s, c);
} });
const { Creep } = await import('game/prototypes'), { ScoreFlag } = await import('arena/season_4/pain_and_gain/basic');
let instance = 0;
async function fixture(t, enabled = true) {
    const w = engagementWorld();
    for (const c of w.spacing.creeps) Object.setPrototypeOf(c, Creep.prototype);
    for (const f of w.flags) Object.setPrototypeOf(f, ScoreFlag.prototype);
    w.objects = new Map([[Creep, w.spacing.creeps], [ScoreFlag, w.flags]]);
    w.evaluations = 0; w.logs = []; w.terrainReads = 0;
    w.loop = await import(`../../src/loop.js?locked-${enabled ? 'on' : 'off'}-${instance++}`);
    globalThis.__locked = w;
    t.mock.method(console, 'log', s => w.logs.push(JSON.parse(s)));
    w.step = tick => {
        w.tick = tick; w.calls = []; w.logs = []; w.terrainReads = 0; w.loop.runTick();
        for (const c of w.myCreeps) assert(w.calls.filter(a => a.id === c.id && ['move', 'moveTo'].includes(a.method)).length <= 1);
        return w.logs.find(r => r.type === 'game-state').supportLockedEngagement;
    };
    w.direct = () => w.calls.filter(c => w.core.includes(c.id) && c.method === 'move');
    w.observe = (calls = w.direct()) => { for (const c of calls) Object.assign(w.actor(c.id), { x: c.x, y: c.y }); w.distinct(); };
    w.tactics = () => w.calls.filter(c => !['move', 'moveTo'].includes(c.method));
    return w;
}

test('real tick flow binds production squad, advances through direct steps, then holds a supported firing line', async t => {
    const w = await fixture(t);
    const a = w.step(1); assert.equal(a.phase, 'Assess'); assert.equal(w.direct().length, 0);
    assert.deepEqual(new Set(w.loop.getMembershipState().squads.find(s => s.id === a.squadId).memberIds), new Set(w.core));
    const b = w.step(2); assert.equal(b.phase, 'Engage'); assert.equal(w.direct().length, 4);
    assert(w.direct().every(c => range(w.actor(c.id), c) === 1));
    const tactical = w.tactics(); w.calls = [];
    executeTactics(w.myCreeps, w.enemies, [], null, w); assert.deepEqual(w.calls, tactical);
    // Explicit generated next positions, not command acceptance or arbitration.
    for (const id of w.core) w.actor(id).x++;
    const line = w.step(3); assert.equal(line.reason, 'supported-firing-line');
    assert.equal(w.direct().length, 0);
    assert.equal(w.calls.filter(c => c.method === 'rangedAttack' && w.core.includes(c.id)).length, 3);
    w.calls = []; w.step(3); assert.equal(w.direct().length, 0, 'duplicate must not reissue travel');
});

test('default-off real flow bypasses controller and reproduces legacy command traces', async t => {
    const w = await fixture(t, false);
    assert.equal(w.step(1), undefined); assert.equal(w.evaluations, 0);
    const actual = w.calls; w.calls = [];
    moveCreeps(w.myCreeps, w.enemies, w.centre, new Map(), new Map(), null, null, null, false, null, w.spacing);
    executeTactics(w.myCreeps, w.enemies, [], null, w);
    assert.deepEqual(w.calls, actual);
});

test('real coordinated movement leaves current-position healing and tactical traces unchanged', async t => {
    const w = await fixture(t); w.actor('medic').hits -= 12;
    w.step(1); w.step(2); assert.equal(w.direct().length, 4);
    assert(w.calls.some(c => c.id === 'medic' && c.method === 'heal' && c.target === 'medic'));
    const actual = w.tactics(); w.calls = [];
    executeTactics(w.myCreeps, w.enemies, w.myCreeps.filter(c => c.hits < c.hitsMax), null,
        { tick: w.tick, flags: w.flags, creeps: w.spacing.creeps, myCreeps: w.myCreeps, enemies: w.enemies });
    assert.deepEqual(w.calls, actual);
    assert.equal(range(w.actor('medic'), w.actor('bow2')), 2, 'accepted step is not observed adjacency');
    w.step(3); assert(w.calls.some(c => c.id === 'medic' && c.method === 'heal'));
});

for (const rc of [0, -11, undefined]) test(`real flow return ${rc} is not progress; blocked contact spends without pursuit`, async t => {
    const w = await fixture(t); for (const id of w.core) w.returns.set(id, rc);
    w.step(1); assert.equal(w.step(2).phase, 'Engage'); assert.equal(w.direct().length, 4);
    const attempts = w.logs.filter(r => r.type === 'action-attempt' && r.method === 'move');
    assert(attempts.every(r => r.returnCode === (rc ?? null)));
    for (let tick = 3; tick <= 5; tick++) {
        const d = w.step(tick); assert.equal(d.startedAt, 1);
        assert.equal(d.phase, tick === 5 ? 'Spent' : 'Engage');
    }
    const spent = w.step(6); assert.equal(spent.phase, 'Spent'); assert.equal(w.direct().length, 0);
    assert(!w.calls.some(c => w.core.includes(c.id) && c.method === 'moveTo'));
});

test('real partial displacement retains support and original deadline, then firing holds', async t => {
    const w = await fixture(t); w.step(1); const d = w.step(2);
    w.observe(w.direct().filter(c => c.id === 'bow1'));
    const p = w.step(3); assert.equal(p.stalled, 0); assert.equal(p.deadline, d.deadline);
    const h = w.actor('medic'); assert(w.core.every(id => range(w.actor(id), h) <= 3));
    for (let tick = 4; tick <= 25; tick++) {
        w.observe(); const r = w.step(tick); assert.equal(r.deadline, 25);
        if (tick < 25) assert.equal(r.phase, 'Engage');
        else { assert.equal(r.phase, 'Spent'); assert.equal(r.reason, 'deadline'); }
    }
});

test('real flow emergency yields before commands; unowned members cannot independently pursue', async t => {
    const w = await fixture(t); w.step(1); w.step(2);
    Object.assign(w.target, { x: 53, y: 49 });
    const r = w.step(3); assert.equal(r.phase, 'Recover');
    const slots = w.loop.getMembershipState().squads.find(s => s.id === r.squadId).memberIds;
    assert(r.actors.some(a => a.owner === 'priority'));
    assert(w.logs.some(r => r.type === 'action-decision' && r.reason === 'ranged-melee-retreat'));
    for (const a of r.actors.filter(a => a.owner === 'engagement'))
        assert(!w.calls.some(c => c.id === slots[a.slot] && ['move', 'moveTo'].includes(c.method)));
});

test('real priority healer travel remains unguaranteed, but recovery and spent never resume pursuit', async t => {
    const w = await fixture(t); w.step(1); w.step(2); w.observe();
    Object.assign(w.actor('scout1'), { x: 47, y: 50, hits: 1 });
    const d = w.step(3); assert.equal(d.phase, 'Recover');
    assert(w.calls.some(c => c.id === 'medic' && c.method === 'moveTo' && c.target === 'scout1'));
    assert.equal(w.direct().length, 0);
    // Generated priority healer displacement may break support; it is not
    // represented as a checked coordinated step or a stronger guarantee.
    Object.assign(w.actor('medic'), { x: 48, y: 50 });
    assert(range(w.actor('medic'), w.actor('bow1')) > 3);
    for (let tick = 4; tick <= 9; tick++) {
        const r = w.step(tick); assert.equal(r.startedAt, 1);
        assert(!w.calls.some(c => c.id !== 'medic' && w.core.includes(c.id) && ['move', 'moveTo'].includes(c.method)));
    }
    assert.equal(w.step(10).phase, 'Spent');
});

test('real observed pressure can issue bounded support-preserving recovery steps', async t => {
    const w = await fixture(t); w.step(1); w.step(2); w.observe();
    Object.assign(w.enemies[1], { x: 56, y: 49 });
    Object.assign(w.enemies[2], { x: 56, y: 51 });
    // Losing functioning weapon capacity under reach is an observed signal,
    // not simulated damage. Keep a functioning ranged part after the loss.
    w.actor('bow1').hits -= 10;
    const r = w.step(3); assert.equal(r.phase, 'Recover'); assert.equal(r.recoveryAt, 3);
    assert.equal(r.startedAt, 1); assert(r.work.neighbours <= 32); assert(r.work.subsets <= 16);
    // A supplied healthy observation is not attributed to a heal command.
    w.actor('bow1').hits = w.actor('bow1').hitsMax;
    const recovery = w.step(4); assert.equal(recovery.phase, 'Recover'); assert.equal(recovery.recoveryAt, 3);
    assert.equal(w.direct().length, 3); assert(w.direct().every(c => c.x === 52));
    assert(!w.direct().some(c => range(c, w.enemies[1]) <= range(w.actor(c.id), w.enemies[1])));
});

test('real escort acquisition owns the bound healer before the batch; remaining members hold', async t => {
    const w = await fixture(t); w.step(1);
    Object.assign(w.actor('blade'), { x: 51, y: 47 });
    const r = w.step(2); assert.equal(r.phase, 'Recover');
    assert(w.logs.some(r => r.type === 'healer-escort' && r.event === 'assign' && r.healerId === 'medic'));
    assert(w.calls.some(c => c.id === 'medic' && c.method === 'moveTo' && c.target === 'blade'));
    assert(!w.calls.some(c => c.id !== 'medic' && w.core.includes(c.id) && ['move', 'moveTo'].includes(c.method)));
});

test('real occupied/unknown exits hold, consume only original stall allowance and cannot fall through', async t => {
    const w = await fixture(t); w.step(1); w.spacing.terrainAt = () => undefined;
    for (let tick = 2; tick <= 5; tick++) {
        const r = w.step(tick); assert.equal(w.direct().length, 0);
        assert(!w.calls.some(c => w.core.includes(c.id) && c.method === 'moveTo'));
        assert.equal(r.phase, tick === 5 ? 'Spent' : 'Engage');
    }
});

test('real spent clearance covers anchor AND survivors, then permits a fresh episode and match reset', async t => {
    const w = await fixture(t); w.step(1); w.step(2); w.observe();
    assert.equal(w.step(25).phase, 'Spent');
    Object.assign(w.target, { x: 58, y: 50 });
    assert.equal(w.step(26).clearCount, 0); assert.equal(w.step(27).phase, 'Spent');
    Object.assign(w.target, { x: 70, y: 70 });
    assert.equal(w.step(28).clearCount, 1); assert.equal(w.step(29).reason, 'rearmed');
    assert.equal(w.direct().length, 0);
    Object.assign(w.target, { x: 57, y: 50 });
    assert.equal(w.step(30).phase, 'Assess'); assert.equal(w.step(31).startedAt, 30);
    const reset = w.step(1); assert.equal(reset.phase, 'Assess'); assert.equal(reset.startedAt, 1);
});

for (const confirmed of [false, true]) test(`real missing member is ${confirmed ? 'confirmed dead' : 'unknown'} for rearm`, async t => {
    const w = await fixture(t); w.step(1); w.step(25);
    const dead = w.actor('bow1');
    if (confirmed) { dead.hits = 0; w.step(26); }
    w.objects.set(Creep, w.spacing.creeps.filter(c => c !== dead));
    Object.assign(w.target, { x: 70, y: 70 });
    assert.equal(w.step(27).clearCount, confirmed ? 1 : 0);
    const r = w.step(28); assert.equal(r.phase, confirmed ? 'Ordinary' : 'Spent');
    assert.equal(w.direct().length, 0);
});

test('real malformed complete-flag observation fences travel without masking a known emergency', async t => {
    const w = await fixture(t); w.step(1); w.step(2);
    w.flags.length = 0; Object.assign(w.target, { x: 53, y: 49 });
    const r = w.step(3); assert.equal(r.phase, 'Spent'); assert.equal(r.clearCount, 0);
    assert(w.logs.some(r => r.type === 'action-decision' && r.reason === 'ranged-melee-retreat'));
    assert.equal(r.work.neighbours, 0); assert.equal(r.work.subsets, 0);
});

test('real diagnostics are bounded scalar summaries, not extra records or duplicate calls', async t => {
    const w = await fixture(t); w.step(1); const d = w.step(2);
    assert.equal(d.actors.length, 4); assert(d.actors.every(a => ['engagement', 'priority', 'ordinary'].includes(a.owner)));
    assert(JSON.stringify(d).length < 1200); assert.equal(d.work.searches, 0);
    assert.equal(w.logs.filter(r => r.type === 'game-state').length, 1);
    assert.equal(w.evaluations, 2);
    const before = w.logs.filter(r => r.type === 'action-decision' && r.channel === 'movement');
    assert.equal(before.length, 14);
    assert.equal(w.logs.filter(r => r.type === 'action-attempt' && r.method === 'move').length, w.direct().length);
    assert(w.terrainReads <= 32, 'at most eight neighbour terrain observations per bound actor');
    assert(w.logs.filter(r => r.type === 'action-decision').every(validActionDecision));
    assert(w.logs.filter(r => r.type === 'action-attempt').every(validActionAttempt));
    const coverage = summarizeDiagnosticCoverage(w.logs.filter(r => r.type === 'game-state').map(JSON.stringify),
        w.logs.filter(r => r.recordId).map(entry => ({ entry, key: entry.recordId })));
    assert.deepEqual(coverage.completeTicks, [2]); assert.deepEqual(coverage.correlationIssues, []);
});
