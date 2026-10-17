import test from 'node:test';
import assert from 'node:assert/strict';
import { engagementWorld, nextObservation, moving, range } from '../fixtures/support-locked-generated-world.js';
import { engagementSupport, engagementLimits, planSupportLocked } from '../fixtures/support-locked-engagement-candidate.js';
import { secondaryStepSupport } from '../../src/strategy/supported-contest.js';
import { executeTactics } from '../../src/arena/execute.js';
import { planHealerEscort } from '../../src/tactics/healer-escort.js';

function engage(w = engagementWorld()) {
    const assess = w.step(); assert.equal(assess.state.phase, 'Assess'); assert.deepEqual(moving(assess), []);
    nextObservation(w, assess); const result = w.step(assess.state);
    assert.equal(result.state.phase, 'Engage'); return { w, result, assess };
}

test('the second clear observation still yields priority injury support while rearming', () => {
    const w = engagementWorld(); let r = w.step();
    w.tick = 25; w.refresh(); r = w.step(r.state); assert.equal(r.state.phase, 'Spent');
    Object.assign(w.target, { x: 70, y: 70 });
    w.tick = 26; w.refresh(); r = w.step(r.state); assert.equal(r.state.clearCount, 1);
    Object.assign(w.actor('scout1'), { x: 46, y: 50, hits: 1 });
    w.tick = 27; w.refresh(); r = w.step(r.state);
    assert.equal(r.state.phase, 'Ordinary'); assert.equal(r.state.reason, 'rearmed');
    assert(r.priorityIds.includes('medic')); assert(!r.moves.has('medic'));
    assert(w.calls.some(c => c.id === 'medic' && c.method === 'moveTo' && c.target === 'scout1'));
    assert(!groupCommands(w).some(c => c.id !== 'medic'));
});
const positions = w => w.spacing.creeps.map(c => [c.id, c.x, c.y]);
const groupCommands = w => w.calls.filter(c => w.core.includes(c.id) && ['move', 'moveTo'].includes(c.method));
const tactics = w => w.calls.filter(c => !['move', 'moveTo'].includes(c.method));
function allOutcomes(w, result) {
    const ids = moving(result);
    for (let mask = 0; mask < 2 ** ids.length; mask++) {
        const friends = w.myCreeps.map(c => ({ ...c, ...(ids.includes(c.id) && mask & (1 << ids.indexOf(c.id))
            ? result.moves.get(c.id) : {}) }));
        const points = [...friends, ...w.enemies].filter(c => c.hits > 0).map(c => `${c.x},${c.y}`);
        assert.equal(new Set(points).size, points.length);
        assert(secondaryStepSupport(friends, result.state.memberIds, new Map(result.state.memberIds.map(id => [id, null]))));
        const healer = friends.find(c => c.id === result.state.healerId), old = w.actor(healer.id);
        for (const id of result.state.memberIds.filter(id => id !== healer.id)) {
            const before = range(w.actor(id), old), b = before <= 1 ? 1 : 3;
            assert(range(friends.find(c => c.id === id), healer) <= b);
        }
    }
}
function unchangedTactics(w) {
    const actual = tactics(w); w.calls = [];
    executeTactics(w.myCreeps, w.enemies, w.myCreeps.filter(c => c.hits < c.hitsMax), null, w);
    assert.deepEqual(w.calls, actual); w.calls = [];
}

test('production membership binds one healer and three ranged actors; supported advance reaches a firing line', () => {
    const { w, result, assess } = engage();
    assert.deepEqual(new Set(result.state.memberIds), new Set(w.core));
    assert.equal(result.state.healerId, 'medic'); assert.equal(result.state.startedAt, 1);
    assert.deepEqual(result.transitions.map(t => [t.from, t.to]), [['Assess', 'Engage']]);
    assert.equal(assess.transitions[0].from, 'Ordinary');
    assert.equal(moving(result).length, 4); assert(groupCommands(w).every(c => c.method === 'move'));
    assert(w.core.filter(id => id !== 'medic').every(id => range(w.actor(id), w.target) === 4));
    const before = positions(w); allOutcomes(w, result); unchangedTactics(w); assert.deepEqual(positions(w), before);
    nextObservation(w, result); const line = w.step(result.state);
    assert.equal(line.state.reason, 'supported-firing-line'); assert.deepEqual(moving(line), []);
    assert(w.core.filter(id => id !== 'medic').every(id => range(w.actor(id), w.target) === 3));
    assert.equal(w.calls.filter(c => c.method === 'rangedAttack' && w.core.includes(c.id)).length, 3);
    assert.equal(groupCommands(w).length, 0); unchangedTactics(w);
});

test('firing holds are not movement progress failures, but still consume the original absolute deadline', () => {
    const { w, result } = engage(); nextObservation(w, result); let s = result.state;
    for (; w.tick <= 25; w.tick++) {
        w.refresh(); const r = w.step(s); s = r.state;
        assert.equal(s.startedAt, 1); assert.equal(s.phase, w.tick === 25 ? 'Spent' : 'Engage');
        assert.equal(groupCommands(w).length, 0);
    }
    assert.equal(s.reason, 'deadline');
});

test('two potential ranged sources freeze advance without inventing damage or forcing an escape', () => {
    const { w, result } = engage(); nextObservation(w, result, []);
    Object.assign(w.enemies[1], { x: 54, y: 49 }); Object.assign(w.enemies[2], { x: 55, y: 51 });
    const r = w.step(result.state); assert.equal(r.state.signals.concentrated, true);
    assert.deepEqual(moving(r), []); assert.equal(groupCommands(w).length, 0);
    unchangedTactics(w);
});

test('observed HP/capability deterioration is recognized independently of higher-priority healing movement', () => {
    const { w, result } = engage(); nextObservation(w, result);
    Object.assign(w.enemies[1], { x: 56, y: 49 }); w.actor('bow1').hits -= 80;
    w.actor('bow1').body.find(p => p.type === 'ranged_attack').hits = 0; w.refresh();
    const r = w.step(result.state); assert.equal(r.state.phase, 'Recover');
    assert.equal(r.state.signals.deteriorated, true); assert.equal(r.state.startedAt, 1);
    assert(!groupCommands(w).some(c => c.method === 'move')); unchangedTactics(w);
});

test('missing functioning HEAL causes recovery then bounded termination without a replacement healer', () => {
    const { w, result } = engage(); nextObservation(w, result);
    w.actor('medic').body.filter(p => p.type === 'heal').forEach(p => p.hits = 0); w.refresh();
    let r = w.step(result.state); assert.equal(r.state.phase, 'Recover'); assert.equal(r.state.reason, 'support-lost');
    assert.equal(groupCommands(w).length, 0);
    for (let n = 0; n < 6 && r.state.phase !== 'Spent'; n++) { nextObservation(w, r, []); r = w.step(r.state); }
    assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.healerId, 'medic'); assert.equal(r.state.startedAt, 1);
});

test('selected outsider demand and a moving healer invalidate the batch before all other commands', () => {
    for (const distant of [false, true]) {
        const { w, result } = engage(); nextObservation(w, result);
        const h = w.actor('medic'); Object.assign(w.actor('scout1'), { x: h.x - (distant ? 4 : 2), y: h.y, hits: 1 });
        w.refresh(); const r = w.step(result.state);
        assert.equal(r.state.phase, 'Recover'); assert(r.priorityIds.includes('medic'));
        assert(!groupCommands(w).some(c => c.id !== 'medic'));
        if (distant) assert(groupCommands(w).some(c => c.id === 'medic' && c.method === 'moveTo' && c.target === 'scout1'));
        else assert(w.calls.some(c => c.id === 'medic' && c.method === 'rangedHeal' && c.target === 'scout1'));
        assert.equal(r.work.neighbours, 0); unchangedTactics(w);
    }
});

for (const rc of [0, -11, undefined]) test(`return ${rc} never establishes displacement; three unchanged observations spend contact`, () => {
    const w = engagementWorld(); for (const id of w.core) w.returns.set(id, rc);
    const { result } = engage(w); const before = positions(w);
    assert(w.records.filter(r => r.type === 'attempt' && r.method === 'move').every(r => r.returnCode === (rc ?? null)));
    assert.deepEqual(positions(w), before); let s = result.state;
    for (let tick = 3; tick <= 5; tick++) { w.tick = tick; w.refresh(); const r = w.step(s); s = r.state;
        assert.equal(s.phase, tick === 5 ? 'Spent' : 'Engage'); assert.equal(s.startedAt, 1); }
    assert.equal(s.reason, 'no-displacement'); assert.equal(groupCommands(w).length, 0);
});

test('partial observations establish progress but cannot replenish the 24-tick deadline or healer binding', () => {
    const { w, result } = engage(); nextObservation(w, result, ['bow1']);
    const r = w.step(result.state); assert.equal(r.state.stalled, 0); assert.equal(r.state.startedAt, 1);
    assert.equal(r.state.healerId, result.state.healerId); assert.deepEqual(r.state.anchor, result.state.anchor);
    allOutcomes(w, r);
    w.tick = 25; w.refresh(); const end = w.step(r.state);
    assert.equal(end.state.phase, 'Spent'); assert.equal(end.state.reason, 'deadline'); assert.equal(end.state.startedAt, 1);
});

test('retargeting a disappeared focus does not reset membership, anchor, healer or clock', () => {
    const { w, result } = engage(); nextObservation(w, result);
    Object.assign(w.target, { x: 87, y: 80 }); Object.assign(w.enemies[0], { x: 56, y: 50 }); w.refresh();
    const r = w.step(result.state); assert.equal(r.state.targetId, w.enemies[0].id);
    for (const key of ['startedAt', 'healerId', 'squadId']) assert.equal(r.state[key], result.state[key]);
    assert.deepEqual(r.state.anchor, result.state.anchor); assert.deepEqual(r.state.memberIds, result.state.memberIds);
});

test('current direct-heal bands cannot be downgraded, including any admitted partial execution', () => {
    const w = engagementWorld(); Object.assign(w.actor('medic'), { x: 51, y: 50 }); w.refresh();
    const assess = w.step(); nextObservation(w, assess); const result = w.step(assess.state);
    assert.equal(result.state.phase, 'Recover');
    assert.equal(result.state.reason, 'proposed-support-loss'); assert.equal(groupCommands(w).length, 0);
    assert(engagementSupport(w.myCreeps, w.core, 'medic', result.moves)); allOutcomes(w, result);
});

test('unknown terrain and blocked exits retain explicit holds and bounded no-progress termination', () => {
    for (const terrain of [1, 2, undefined]) {
        const w = engagementWorld(); w.spacing.terrainAt = () => terrain;
        const { result } = engage(w); assert.deepEqual(moving(result), []); let r = result;
        for (let i = 0; i < 3; i++) { nextObservation(w, r, []); r = w.step(r.state); }
        assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.reason, 'no-displacement');
    }
});

test('currently occupied destinations are never entered, even if the occupant also has movement', () => {
    const w = engagementWorld(); Object.assign(w.actor('scout1'), { x: 53, y: 50 }); w.refresh();
    const { result } = engage(w); assert(![...result.moves.values()].filter(Boolean).some(p => p.x === 53 && p.y === 50));
    assert(!groupCommands(w).some(c => c.x === 53 && c.y === 50)); allOutcomes(w, result);
});

test('converging proposals use production equal-best intersection; no ID winner or vacating assumptions', () => {
    const w = engagementWorld();
    // Only these plain original next cells are offered. Two ranged actors
    // converge at (53,50); the third has an independent cell. No co-location.
    w.spacing.terrainAt = p => ['51,50', '53,50', '53,51'].includes(`${p.x},${p.y}`) ? 0 : 1;
    const { result } = engage(w); assert(result.work.subsets <= 16);
    assert.equal(result.work.subsets, 16);
    assert.deepEqual(moving(result), ['guardR0', 'medic']);
    assert.equal(result.moves.get('bow1'), null); assert.equal(result.moves.get('bow2'), null);
    const destinations = [...result.moves.values()].filter(Boolean);
    assert.equal(new Set(destinations.map(p => `${p.x},${p.y}`)).size, destinations.length);
    allOutcomes(w, result);
});

test('adjacent emergency escape invalidates the group without suppressing the existing escape', () => {
    const { w, result } = engage(); nextObservation(w, result);
    Object.assign(w.target, { x: w.actor('bow1').x + 1, y: w.actor('bow1').y }); w.refresh();
    const r = w.step(result.state); assert.equal(r.state.phase, 'Recover');
    assert(r.priorityIds.includes('bow1')); assert.equal(r.work.neighbours, 0);
    assert(w.records.some(d => d.channel === 'movement' && d.reason === 'ranged-melee-retreat'));
    assert(!groupCommands(w).some(c => c.method === 'move')); unchangedTactics(w);
});

for (const owner of ['escort', 'pair', 'objective']) test(`${owner} ownership wins before batch execution`, () => {
    const { w, result } = engage(); nextObservation(w, result); const id = 'medic';
    if (owner === 'escort') w.escort = { healerId: id, allyId: 'bow1', ally: w.actor('bow1'), mode: 'hold' };
    if (owner === 'pair') w.pair = { context: { leaderId: id, followerId: 'bow1' },
        moves: new Map([[id, { target: null, reason: 'pair-wait' }]]) };
    if (owner === 'objective') w.externalMoves = new Map([[id, null]]);
    const r = w.step(result.state); assert.equal(r.state.phase, 'Recover'); assert.equal(r.work.neighbours, 0);
    assert(r.priorityIds.includes(id)); assert.equal(groupCommands(w).length, 0); unchangedTactics(w);
});

test('real escort planner owns the healer and cancels group travel before its support approach', () => {
    const { w, result } = engage(); nextObservation(w, result);
    Object.assign(w.actor('blade'), { x: 54, y: 50 });
    const escort = planHealerEscort(w, w.centre);
    assert.equal(escort.escort.healerId, 'medic'); assert.equal(escort.escort.allyId, 'blade');
    w.escort = escort.escort; const r = w.step(result.state);
    assert.equal(r.state.phase, 'Recover'); assert(r.priorityIds.includes('medic'));
    const commands = groupCommands(w); assert.equal(commands.length, 1);
    assert.equal(commands[0].id, 'medic'); assert.equal(commands[0].method, 'moveTo');
    assert.equal(commands[0].target, 'blade'); unchangedTactics(w);
});

test('recovery timeout is absolute even with fresh observed positions, then same-contact pursuit stays spent', () => {
    const { w, result } = engage(); nextObservation(w, result);
    // Supply nonlethal observed deterioration in current ranged reach.
    Object.assign(w.enemies[1], { x: 56, y: 49 }); w.actor('bow1').hits--; w.refresh();
    let r = w.step(result.state); assert.equal(r.state.phase, 'Recover'); const recoveryAt = r.state.recoveryAt;
    for (let n = 1; n <= 5; n++) {
        w.actor('scout2').x = 37 + n % 2;
        // This injured actor is observed shifting one cell, not command-moved.
        w.actor('bow1').y = 48 + n % 2; w.tick++; w.refresh(); r = w.step(r.state);
        assert.equal(r.state.recoveryAt, recoveryAt); assert.equal(r.state.startedAt, 1);
    }
    assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.reason, 'recovery-timeout');
    nextObservation(w, r, []); r = w.step(r.state); assert.equal(r.state.phase, 'Spent');
    assert(!groupCommands(w).some(c => c.id !== 'medic'));
});

test('spent contact rearms only after two consecutive valid armed-clear observations', () => {
    const { w, result } = engage(); w.tick = 25; w.refresh(); let r = w.step(result.state);
    assert.equal(r.state.phase, 'Spent'); Object.assign(w.target, { x: 88, y: 80 });
    w.tick = 26; w.refresh(); r = w.step(r.state); assert.equal(r.state.clearCount, 1);
    w.tick = 27; w.refresh(); w.observationComplete = false; r = w.step(r.state);
    assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 0);
    w.observationComplete = true;
    for (const tick of [28, 29]) { w.tick = tick; w.refresh(); r = w.step(r.state); }
    assert.equal(r.state.phase, 'Ordinary'); assert.equal(r.state.startedAt, undefined);
    assert.equal(groupCommands(w).length, 0);
    w.tick = 30; w.refresh(); Object.assign(w.target, { x: 56, y: 50 });
    r = w.step(r.state); assert.equal(r.state.phase, 'Assess'); assert.equal(r.state.startedAt, 30);
});

test('reacting enemies cannot recover then immediately reacquire pursuit while contact persists', () => {
    const { w, result } = engage(); nextObservation(w, result);
    const bow = w.actor('bow1'); Object.assign(w.target, { x: bow.x + 1, y: bow.y }); w.refresh();
    let r = w.step(result.state); assert.equal(r.state.phase, 'Recover');
    for (let n = 0; n < 8; n++) {
        Object.assign(w.target, { x: n % 2 ? 56 : 55, y: 50 });
        w.tick++; w.refresh(); r = w.step(r.state);
        assert(['Recover', 'Spent'].includes(r.state.phase)); assert.equal(r.state.startedAt, 1);
        assert(!groupCommands(w).some(c => c.method === 'moveTo' && c.target === w.target.id));
    }
});

test('duplicate ticks cannot count clears/progress or reissue coordinated movement; match restart resets state', () => {
    const { w, result } = engage(); const r = w.step(result.state);
    assert.equal(r.state.startedAt, 1); assert.equal(r.state.stalled, result.state.stalled);
    assert.equal(groupCommands(w).length, 0);
    w.tick = 1; w.refresh(); const reset = w.step(result.state);
    assert.equal(reset.state.phase, 'Assess'); assert.equal(reset.state.startedAt, 1);
});

test('malformed observations, changed bindings, hybrids and fatigue never create unchecked advance', () => {
    for (const change of [w => w.actor('bow1').x = NaN, w => w.actor('medic').body = null,
        w => w.enemies[0].hits = Infinity, w => w.observationComplete = false,
        w => { w.myCreeps[0] = null; w.spacing.creeps[0] = null; }]) {
        const { w, result } = engage(); change(w);
        const r = planSupportLocked(w, result.state); assert.equal(r.state.phase, 'Spent'); assert.deepEqual(moving(r), []);
    }
    const { w, result } = engage(); nextObservation(w, result);
    w.membership.squads.find(s => s.id === w.squadId).memberIds = ['medic', 'bow1', 'bow2', 'blade'];
    const r = w.step(result.state); assert.equal(r.state.reason, 'binding-changed'); assert.equal(groupCommands(w).length, 0);
    const hybrid = engagementWorld(); hybrid.actor('bow1').body.push({ type: 'heal', hits: 0 });
    assert.equal(hybrid.step().state.phase, 'Ordinary');
    const fatigued = engagementWorld(); fatigued.actor('bow1').fatigue = 1;
    const f = engage(fatigued).result; assert.equal(f.moves.get('bow1'), null); allOutcomes(fatigued, f);
});

test('centre identity/defence and no-target ties cannot be replaced to manufacture admission', () => {
    const { w, result } = engage(); nextObservation(w, result); w.centre.id = 'other-centre';
    assert.equal(w.step(result.state).state.reason, 'binding-changed');
    const deficit = engagementWorld(); deficit.myCreeps.filter(c => !deficit.core.includes(c.id))
        .forEach(c => { if (c.body.some(p => p.type === 'heal')) c.body.filter(p => p.type === 'heal').forEach(p => p.hits = 0); });
    const a = deficit.step(); nextObservation(deficit, a); const d = deficit.step(a.state);
    assert.equal(d.state.phase, 'Recover'); assert.equal(d.state.reason, 'centre-defence-unavailable');
    assert.equal(groupCommands(deficit).length, 0);
});

test('disabled adapter uses untouched real baseline commands without candidate state/evaluation', () => {
    const w = engagementWorld(); const d = w.step(null, { enabled: false }); assert.equal(d.moves, null);
    assert.equal(d.state, null); assert.equal(groupCommands(w).length, 4);
    assert(groupCommands(w).every(c => c.method === 'moveTo')); unchangedTactics(w);
});

test('complete adapter performs at most eight terrain-neighbour evaluations per controlled actor, including emergency', () => {
    for (const emergency of [false, true]) {
        const { w, result } = engage(); nextObservation(w, result, []);
        if (emergency) Object.assign(w.target, { x: 53, y: 49 });
        let reads = 0; w.spacing.terrainAt = () => { reads++; return 0; };
        const r = w.step(result.state);
        assert(reads <= 32); assert(r.work.neighbours <= 32); assert(r.work.subsets <= 16);
        const commands = groupCommands(w); assert(new Set(commands.map(c => c.id)).size === commands.length);
        assert.equal(r.work.searches, 0);
    }
});

test('unsafe support holds and symmetric target ambiguity remain adverse non-progress, not forced admission', () => {
    const { w, result } = engage(); nextObservation(w, result, []);
    w.actor('medic').x = 49; let a = w.step(result.state);
    w.actor('medic').x = 48; w.tick++; a = w.step(a.state);
    assert.equal(a.state.phase, 'Recover'); assert.equal(a.state.reason, 'support-lost');
    assert.equal(groupCommands(w).length, 0);
    const tie = engagementWorld(); Object.assign(tie.target, { x: 56, y: 49 });
    Object.assign(tie.enemies[0], { x: 56, y: 51 });
    const r = tie.step(); assert.equal(r.state.phase, 'Recover');
    assert(r.transitions.some(t => t.to === 'Recover' && t.reason === 'contact-ended'));
    assert.equal(r.state.targetId, null); assert.equal(groupCommands(tie).length, 0);
});

test('priority healer travel may subsequently lose support; no coordinated advance or support guarantee is invented', () => {
    const { w, result } = engage(); nextObservation(w, result);
    Object.assign(w.actor('scout1'), { x: 46, y: 50, hits: 1 });
    let r = w.step(result.state); assert.equal(r.state.phase, 'Recover');
    assert(r.priorityIds.includes('medic')); assert(!groupCommands(w).some(c => c.id !== 'medic'));
    // Explicit legal one-cell observations of the unowned priority healer,
    // not a prediction of moveTo's path or an admitted controller step.
    for (const x of [50, 49]) {
        w.actor('medic').x = x; w.tick++; w.refresh(); r = w.step(r.state);
        assert(['Recover', 'Spent'].includes(r.state.phase));
        assert(!groupCommands(w).some(c => c.id !== 'medic'));
    }
    assert(w.core.filter(id => id !== 'medic').every(id => range(w.actor(id), w.actor('medic')) > 3));
    assert.equal(secondaryStepSupport(w.myCreeps, w.core, new Map(w.core.map(id => [id, null]))), false);
});

test('coordinated recovery can reduce current ranged exposure with all partial outcomes supported', () => {
    const { w, result } = engage(); nextObservation(w, result);
    Object.assign(w.enemies[1], { x: 56, y: 49 }); Object.assign(w.enemies[2], { x: 56, y: 51 });
    w.actor('bow1').hits--; const pressure = w.step(result.state);
    assert.equal(pressure.state.phase, 'Recover');
    // A supplied healthy next observation is not attributed to healing calls.
    w.actor('bow1').hits = w.actor('bow1').hitsMax; w.tick++;
    const r = w.step(pressure.state); assert.equal(r.state.phase, 'Recover');
    assert.deepEqual(moving(r), ['bow1', 'bow2', 'guardR0']);
    assert([...r.moves].filter(([, p]) => p).every(([, p]) => p.x === 52));
    allOutcomes(w, r); unchangedTactics(w);
});

test('anchor clearance alone cannot rearm while the same enemy remains local to the advanced squad', () => {
    const { w, result } = engage(); nextObservation(w, result);
    w.tick = 25; let r = w.step(result.state); assert.equal(r.state.phase, 'Spent');
    Object.assign(w.target, { x: 57, y: 50 }); w.tick = 26; r = w.step(r.state);
    assert.equal(r.state.clearCount, 0);
    Object.assign(w.target, { x: 58, y: 50 });
    for (const tick of [27, 28, 29, 30]) {
        w.tick = tick; r = w.step(r.state);
        assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 0);
        assert.deepEqual(r.state.anchor, result.state.anchor);
        assert.deepEqual(r.state.memberIds, result.state.memberIds);
        assert.equal(r.state.startedAt, 1); assert.equal(groupCommands(w).length, 0);
    }
    assert(w.core.some(id => id !== 'medic' && range(w.actor(id), w.target) === 5));
    // A real separation, not a changed anchor or target blacklist, can rearm.
    Object.assign(w.target, { x: 59, y: 50 });
    w.tick = 31; r = w.step(r.state); assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 1);
    w.tick = 32; r = w.step(r.state); assert.equal(r.state.phase, 'Ordinary'); assert.equal(groupCommands(w).length, 0);
    Object.assign(w.target, { x: 58, y: 50 });
    w.tick = 33; r = w.step(r.state); assert.equal(r.state.phase, 'Assess');
    assert.equal(r.state.startedAt, 33); assert.equal(r.state.targetId, w.target.id);
    w.tick = 34; r = w.step(r.state); assert.equal(r.state.phase, 'Engage');
    assert(moving(r).some(id => id !== 'medic'));
    assert(groupCommands(w).some(c => c.id !== 'medic' && c.x === 54));
});

test('alternating fixed-anchor and squad-only threats never accumulate clearance', () => {
    const { w, result } = engage(); nextObservation(w, result);
    w.tick = 25; let r = w.step(result.state);
    // Supplied positions isolate the two spatial tests. No controller move or
    // enemy movement resolution is inferred from this predicate-only fixture.
    for (const id of w.core) w.actor(id).x += 4;
    for (let tick = 26; tick <= 31; tick++) {
        Object.assign(w.target, { x: tick % 2 ? 62 : 47, y: 50 });
        w.tick = tick; r = w.step(r.state, { execute: false });
        assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 0);
        assert.deepEqual(r.state.anchor, result.state.anchor); assert.deepEqual(r.state.memberIds, result.state.memberIds);
    }
});

test('one clear observation, a duplicate or a gap cannot bypass the two-consecutive-clear requirement', () => {
    const { w, result } = engage(); nextObservation(w, result); w.tick = 25; let r = w.step(result.state);
    Object.assign(w.target, { x: 59, y: 50 }); w.tick = 26; r = w.step(r.state);
    assert.equal(r.state.clearCount, 1); const duplicate = w.step(r.state);
    assert.equal(duplicate.state.phase, 'Spent'); assert.equal(duplicate.state.clearCount, 1);
    w.tick = 28; r = w.step(duplicate.state); assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 1);
    Object.assign(w.target, { x: 58, y: 50 }); w.tick = 29; r = w.step(r.state);
    assert.equal(r.state.clearCount, 0);
    Object.assign(w.target, { x: 59, y: 50 });
    w.tick = 30; r = w.step(r.state); assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 1);
    w.tick = 31; r = w.step(r.state); assert.equal(r.state.phase, 'Ordinary');
});

test('malformed enemy observations clear pending clearance instead of treating unknown weapons as absent', () => {
    const { w, result } = engage(); nextObservation(w, result); w.tick = 25; let r = w.step(result.state);
    Object.assign(w.target, { x: 59, y: 50 }); w.tick = 26; r = w.step(r.state); assert.equal(r.state.clearCount, 1);
    w.tick = 27; w.refresh(); const parts = w.target.body; w.target.body = null;
    r = planSupportLocked(w, r.state); assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 0);
    w.target.body = parts;
    for (const tick of [28, 29]) { w.tick = tick; r = w.step(r.state); assert.equal(r.state.phase, tick === 29 ? 'Ordinary' : 'Spent'); }
});

test('a surviving bound actor without functioning weapons still blocks local clearance', () => {
    const { w, result } = engage(); nextObservation(w, result); w.tick = 25; let r = w.step(result.state);
    const c = w.actor('bow1'); c.body.filter(p => p.type === 'ranged_attack').forEach(p => p.hits = 0); c.hits = 600;
    Object.assign(w.target, { x: 58, y: 44 });
    assert(range(w.target, r.state.anchor) > 5);
    assert(w.core.filter(id => id !== 'bow1').every(id => range(w.actor(id), w.target) > 5));
    for (const tick of [26, 27]) { w.tick = tick; r = w.step(r.state); assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 0); }
    assert.deepEqual(r.state.memberIds, result.state.memberIds);
});

test('confirmed casualty can be omitted after observation without shrinking or replacing bound membership', () => {
    const { w, result } = engage(); nextObservation(w, result); w.tick = 25; let r = w.step(result.state);
    const c = w.actor('bow1'); c.hits = 0; Object.assign(w.target, { x: 58, y: 44 });
    w.tick = 26; r = w.step(r.state); assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 1);
    assert.deepEqual(r.state.memberIds, result.state.memberIds); assert.deepEqual(r.state.anchor, result.state.anchor);
    assert.equal(w.membership.members.find(m => m.id === c.id).presence, 'dead');
    w.myCreeps.splice(w.myCreeps.indexOf(c), 1); w.spacing.creeps.splice(w.spacing.creeps.indexOf(c), 1);
    w.tick = 27; r = w.step(r.state); assert.equal(r.state.phase, 'Ordinary');
    assert.equal(w.membership.members.find(m => m.id === c.id).presence, 'dead');
});

test('missing bound actor without confirmed death is unknown, never proof of clearance', () => {
    const { w, result } = engage(); nextObservation(w, result); w.tick = 25; let r = w.step(result.state);
    const c = w.actor('bow1'); w.myCreeps.splice(w.myCreeps.indexOf(c), 1);
    w.spacing.creeps.splice(w.spacing.creeps.indexOf(c), 1); Object.assign(w.target, { x: 59, y: 50 });
    for (const tick of [26, 27, 28]) {
        w.tick = tick; r = w.step(r.state); assert.equal(r.state.phase, 'Spent'); assert.equal(r.state.clearCount, 0);
        assert.equal(w.membership.members.find(m => m.id === c.id).presence, 'missing');
        assert.deepEqual(r.state.memberIds, result.state.memberIds);
    }
});

test('only functioning armed enemies veto clearance; unarmed healers and destroyed weapons do not', () => {
    for (const role of ['heal', 'destroyed-attack']) {
        const { w, result } = engage(); nextObservation(w, result); w.tick = 25; let r = w.step(result.state);
        w.target.body.filter(p => p.type === 'attack').forEach(p => p.hits = 0); w.target.hits = 800;
        if (role === 'heal') w.target.body[0] = { type: 'heal', hits: 100 };
        for (const tick of [26, 27]) { w.tick = tick; r = w.step(r.state); assert.equal(r.state.phase, tick === 27 ? 'Ordinary' : 'Spent'); }
    }
});

test('renaming, observation/member ordering and mirrored geometry preserve non-tied physical decisions and bounds', () => {
    const original = engage(); const expected = [...original.result.moves].map(([id, p]) => [id, p]);
    for (const rename of [false, true]) for (const reverse of [false, true]) for (const mirror of [false, 'x', 'y', 'both']) {
        const w = engagementWorld(), name = id => rename ? `renamed-${id.split('').reverse().join('')}` : id;
        const p = q => ({ x: mirror && mirror !== 'y' ? 99 - q.x : q.x,
            y: mirror && mirror !== 'x' ? 99 - q.y : q.y });
        for (const c of w.spacing.creeps) { Object.assign(c, p(c)); c.id = name(c.id); }
        for (const f of w.flags) Object.assign(f, p(f)); w.core = w.core.map(name);
        for (const s of w.membership.squads) s.memberIds = s.memberIds.map(name);
        for (const m of w.membership.members) m.id = name(m.id);
        if (reverse) { w.myCreeps.reverse(); w.enemies.reverse(); w.spacing.creeps.reverse();
            w.membership.squads.reverse(); w.membership.squads.forEach(s => s.memberIds.reverse()); }
        const { result } = engage(w);
        for (const [id, next] of expected) assert.deepEqual(result.moves.get(name(id)), next ? p(next) : null);
        assert(result.work.neighbours <= 32); assert(result.work.subsets <= 16); assert.equal(result.work.searches, 0);
        allOutcomes(w, result);
        nextObservation(w, result); w.tick = 25; let s = w.step(result.state);
        Object.assign(w.target, p({ x: 58, y: 50 }));
        for (const tick of [26, 27]) {
            w.tick = tick; s = w.step(s.state); assert.equal(s.state.phase, 'Spent'); assert.equal(s.state.clearCount, 0);
            assert.deepEqual(s.state.anchor, result.state.anchor); assert.deepEqual(s.state.memberIds, result.state.memberIds);
        }
        Object.assign(w.target, p({ x: 59, y: 50 }));
        w.tick = 28; s = w.step(s.state); assert.equal(s.state.phase, 'Spent'); assert.equal(s.state.clearCount, 1);
        w.tick = 29; s = w.step(s.state); assert.equal(s.state.phase, 'Ordinary');
        Object.assign(w.target, p({ x: 58, y: 50 }));
        w.tick = 30; s = w.step(s.state); assert.equal(s.state.phase, 'Assess'); assert.equal(s.state.startedAt, 30);
        w.tick = 31; s = w.step(s.state); assert.equal(s.state.phase, 'Engage');
        assert(moving(s).some(id => id !== name('medic'))); allOutcomes(w, s); unchangedTactics(w);
    }
    assert.deepEqual(engagementLimits, { members: 4, neighbours: 8, subsets: 16, unchanged: 3,
        recovery: 5, lifetime: 24, clear: 2, leash: 5 });
});
