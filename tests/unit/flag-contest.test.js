import test from 'node:test';
import assert from 'node:assert/strict';
import { planScoutFlagAllocation } from '../../src/strategy/flag-allocation.js';
import { moveCreeps, executeTactics } from '../../src/arena/execute.js';

const effect = 'eff_attack_modifier';
function unit(id, x, y, types = ['move'], my = true) {
    return { id, x, y, my, hits: 100, hitsMax: 100, fatigue: 0,
        body: types.map(type => ({ type, hits: 10 })) };
}

function fixture() {
    // Tick-520-shaped generated fixture: positions/ownership and surviving roles
    // follow the retained observation; health/body magnitudes are simplified.
    const first = { id: 'first', x: 49, y: 49, my: true };
    const a = { id: 'a', x: 67, y: 31, my: false, effectType: effect };
    const b = { id: 'b', x: 31, y: 67, my: false, effectType: effect };
    const scout1 = unit('scout-1', 49, 49), scout2 = unit('scout-2', 50, 49);
    const defender = unit('defender', 49, 48, ['ranged_attack', 'move']);
    const enemy = unit('enemy-scout', 67, 31, ['move'], false);
    const state = { tick: 520, flags: [first, a, b], myCreeps: [scout1, scout2, defender], enemies: [enemy] };
    // Complete 20/21-step routes are synthetic assumptions, NOT observed tick-520
    // Arena paths. Enemy-to-B lower bound 36 already exceeds either route +5.
    const route = from => from === scout1 ? 20 : from === scout2 ? 21 : 36;
    return { state, first, a, b, scout1, scout2, defender, enemy, route };
}

function plan(f, previous = null, route = f.route, report) {
    return planScoutFlagAllocation(f.state, previous, route, effect, report);
}

test('post-opening empty enemy flag is eligible while occupied A remains excluded', () => {
    const f = fixture(), diagnostics = [];
    const result = plan(f, null, f.route, d => diagnostics.push(d));
    assert.deepEqual(result.state, { scoutId: 'scout-1', targetId: 'b', startedAt: 520, mode: 'contest' });
    assert.deepEqual([...result.fallbackById], [['scout-1', f.b]]);
    assert.ok(diagnostics[0].evaluations.filter(e => e.flagId === 'a').every(e => e.reason === 'target-occupied'));
    assert.equal(diagnostics[0].event, 'assign');
});

test('opening stays neutral-only; a retained opening attempt never changes mode', () => {
    const f = fixture();
    f.state.tick = 80;
    assert.equal(plan(f).state, null);
    f.b.my = undefined;
    const start = plan(f).state;
    assert.equal(start.targetId, 'b');
    assert.equal(Object.hasOwn(start, 'mode'), false);
    f.state.tick = 81;
    const assigned = f.state.myCreeps.find(c => c.id === start.scoutId);
    assigned.fatigue = 1; // preserves the opening's existing fatigue continuation
    assert.deepEqual(plan(f, start).state, start);
    f.b.my = false;
    assert.deepEqual(plan(f, start).state, { finished: true });
    f.state.tick = 520;
    assert.deepEqual(plan(f, { finished: true }).state, { finished: true });
});

test('late acquisition is enemy-only and limited to 91 twenty-tick slots', () => {
    const f = fixture(); let polls = 0, calls = 0;
    for (let tick = 81; tick <= 2000; tick++) {
        f.state.tick = tick;
        const result = plan(f, null, from => { calls++; return f.route(from); });
        if (result.state) { polls++; assert.equal(tick % 20, 0); assert.ok(tick <= 1900); }
    }
    assert.equal(polls, 91); assert.equal(calls, 182); // two scout routes/poll; A is occupied
    for (const tick of [81,99,101,1901,2000]) {
        f.state.tick = tick;
        assert.equal(plan(f, null, () => { throw Error('No search outside poll slots'); }).state, null);
    }
    for (const tick of [100,1900]) {
        f.state.tick = tick;
        assert.equal(plan(f).state.mode, 'contest');
    }
    f.state.tick = 520; f.b.my = undefined;
    assert.equal(plan(f).state, null); // late mode does not widen neutral collection
});

test('any living functioning armed enemy blocks late acquisition without a search', () => {
    for (const type of ['attack', 'ranged_attack']) {
        const f = fixture(), armed = unit('armed', 90, 90, [type,'move'], false);
        f.state.enemies.push(armed);
        const diagnostics = [];
        assert.equal(plan(f, null, () => { throw Error('Armed gate before search'); }, d => diagnostics.push(d)).state, null);
        assert.equal(diagnostics[0].reason, 'armed-enemy-remains');
        armed.body[0].hits = 0;
        assert.equal(plan(f).state.targetId, 'b');
        armed.body[0].hits = 10; armed.hits = 0;
        assert.equal(plan(f).state.targetId, 'b');
    }
});

test('unarmed competitors may be nearby but still need a strict, known arrival margin', () => {
    const f = fixture(); f.state.flags = [f.first, f.b];
    f.scout1.x = 40; f.scout1.y = 55; f.scout2.hits = 99;
    f.enemy.x = 41; f.enemy.y = 56; // adjacent to scout, outside the centre threat radius
    for (const enemySteps of [null, 20, 25]) {
        assert.equal(plan(f, null, from => from === f.enemy ? enemySteps : 20).state, null);
    }
    const diagnostics = [];
    assert.equal(plan(f, null, from => from === f.enemy ? 26 : 20, d => diagnostics.push(d)).state.targetId, 'b');
    assert.equal(diagnostics[0].evaluations[0].enemyRoutes[0].steps, 26);
    f.enemy.x = f.b.x; f.enemy.y = f.b.y;
    assert.equal(plan(f, null, () => { throw Error('Occupancy before routing'); }).state, null);
    f.enemy.x++; // adjacent to target, still a capture competitor
    assert.equal(plan(f, null, from => from === f.enemy ? 1 : 20).state, null);
});

test('incomplete/overlong routes reject; complete 40-step routes still require a safe race', () => {
    const f = fixture();
    for (const steps of [null, 41, 17]) assert.equal(plan(f, null, () => steps).state, null);
    f.enemy.x = 99; f.enemy.y = 99;
    assert.equal(plan(f, null, () => 40).state.mode, 'contest');
});

test('health, MOVE-only bodies, zero fatigue and first-flag defence remain mandatory', () => {
    for (const change of [
        f => { f.scout1.hits = 99; f.scout2.hits = 99; },
        f => { f.scout1.fatigue = 1; f.scout2.fatigue = 1; },
        f => { f.scout1.body[0].hits = 0; f.scout2.body[0].hits = 0; },
        f => { for (const s of [f.scout1,f.scout2]) s.body.push({type:'heal',hits:0}); },
        f => { f.first.my = false; },
        f => { f.defender.x = 90; },
        f => { f.defender.body[0].hits = 0; },
        f => { f.enemy.x = 54; f.enemy.y = 49; }, // unarmed recapture danger at centre
    ]) {
        const f = fixture(); change(f);
        assert.equal(plan(f, null, () => { throw Error('Eligibility before search'); }).state, null);
    }
});

test('late retention rechecks every tick; safety loss finishes permanently without retargeting', () => {
    for (const change of [
        f => { f.state.enemies.push(unit('armed',90,90,['ranged_attack'],false)); },
        f => { f.scout1.fatigue = 1; },
        f => { f.scout1.hits = 99; },
        f => { f.scout1.body[0].hits = 0; },
        f => { f.first.my = false; },
        f => { f.defender.x = 90; },
        f => { f.enemy.x = 54; f.enemy.y = 49; },
        f => { f.enemy.x = f.b.x; f.enemy.y = f.b.y; },
        f => { f.b.my = undefined; },
        f => { f.b.my = null; },
        f => { f.b.effectType = 'eff_heal_modifier'; },
        f => { f.state.flags = [f.first,f.a]; },
    ]) {
        const f = fixture(), start = plan(f).state;
        f.state.tick = 521;
        assert.deepEqual(plan(f,start).state, start); // not a poll tick; still revalidated
        change(f);
        const stopped = plan(f,start);
        assert.deepEqual(stopped.state, {finished:true}); assert.equal(stopped.fallbackById.size,0);
        f.state.tick = 540;
        assert.deepEqual(plan(f,stopped.state,()=>{throw Error('No retry');}).state,{finished:true});
    }
});

test('retention cancels on route/race loss, rather than selecting the other scout', () => {
    const f = fixture(), start = plan(f).state;
    f.state.tick = 521;
    assert.deepEqual(plan(f,start,()=>null).state,{finished:true});
    f.enemy.x = 40; f.enemy.y = 60; // away from first flag, approaching target
    assert.deepEqual(plan(f,start,from=>from===f.enemy?25:20).state,{finished:true});
});

test('at target, hold until ownership; completion and timeout never chain or patrol', () => {
    const f = fixture(), start = plan(f).state;
    f.state.tick = 521; f.scout1.x = f.b.x; f.scout1.y = f.b.y;
    const held = plan(f,start,()=>0);
    assert.equal(held.fallbackById.get('scout-1'),null);
    f.b.my = true;
    assert.deepEqual(plan(f,start).state,{finished:true});
    assert.deepEqual(plan(f,{finished:true}).state,{finished:true});
    const g = fixture(), gStart = plan(g).state;
    g.state.tick = 580; assert.deepEqual(plan(g,gStart).state,gStart);
    g.state.tick = 581; assert.deepEqual(plan(g,gStart).state,{finished:true});
});

test('late ties retain deterministic scout/target order without mutating observations', () => {
    const f = fixture(); f.enemy.x = 99; f.enemy.y = 99;
    const before = JSON.stringify(f.state);
    assert.equal(plan(f,null,()=>20).state.scoutId,'scout-2');
    assert.equal(JSON.stringify(f.state),before);
    f.scout1.x = 50;
    for (let i=0;i<2;i++) {
        f.state.myCreeps.reverse(); f.state.flags=[f.first,...(i?[f.a,f.b]:[f.b,f.a])];
        assert.deepEqual(plan(f,null,()=>20).state,{scoutId:'scout-1',targetId:'a',startedAt:520,mode:'contest'});
    }
});

test('a late poll uses at most 60 searches with the bounded standard-size roster', () => {
    const f = fixture();
    f.state.enemies = Array.from({length:14},(_,i)=>unit(`competitor-${i}`,56,56,['move'],false));
    let calls=0;
    const result=plan(f,null,from=>{calls++;return from.my?20:30;});
    assert.equal(calls,60); assert.equal(result.fallbackById.size,1);
    f.state.tick=521;calls=0;
    assert.equal(plan(f,result.state,from=>{calls++;return from.my?20:30;}).state,result.state);
    assert.equal(calls,15);
});

test('late override preserves combat/healing and every other actor movement', () => {
    function trace(enabled) {
        const f=fixture(), actions=[];
        const attacker=unit('attacker',67,32,['attack','move']); attacker.hits=80;
        const healer=unit('healer',67,34,['heal','move']);
        f.state.myCreeps.push(attacker,healer);
        for(const c of f.state.myCreeps) {
            c.moves=[];
            c.getRangeTo=function(t){return Math.max(Math.abs(this.x-t.x),Math.abs(this.y-t.y));};
            c.moveTo=t=>c.moves.push(t.id);
        }
        attacker.attack=t=>actions.push(['attack',t.id]);
        healer.rangedHeal=t=>actions.push(['rangedHeal',t.id]);
        const allocation=enabled?plan(f):null;
        moveCreeps(f.state.myCreeps,f.state.enemies,f.first,new Map(),allocation?.fallbackById);
        executeTactics(f.state.myCreeps,f.state.enemies,[attacker]);
        assert.ok(f.state.myCreeps.every(c=>c.moves.length<=1));
        if(enabled)assert.deepEqual(f.scout1.moves,['b']);
        return {others:f.state.myCreeps.filter(c=>c!==f.scout1).map(c=>[c.id,c.moves]),actions};
    }
    assert.deepEqual(trace(true),trace(false));
    assert.deepEqual(trace(true).actions,[['attack','enemy-scout'],['rangedHeal','attacker']]);
});
