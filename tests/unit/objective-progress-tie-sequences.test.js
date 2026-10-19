import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {compareProgressSequences} from '../fixtures/objective-progress-tie-sequences.js';
import {publish} from '../../tools/retrieval-files.js';

// No historical inputs. Optional receipt output is explicitly supplied by caller;
// it writes generated results only and does not read evidence or discover files.
const results={};
after(()=>{
    if(process.env.PAIN_GAIN_SEQUENCE_OUTPUT)publish(
        path.join(process.env.PAIN_GAIN_SEQUENCE_OUTPUT,'generated-sequences.json'),
        Buffer.from(JSON.stringify(results,null,2)+'\n'));
});
const admitted=r=>r.admitted?.filter(([,p])=>p).map(([id])=>id).sort()??[];
const role=(run,r)=>new Map(run.roleIds).get(r);
const get=(run,tick)=>run.trace.find(r=>r.tick===tick);
const position=(row,id)=>row.positions.find(p=>p.id===id);
function verifyBounds(run){
    assert.equal(run.limits.unchanged,4);assert.equal(run.limits.lifetime,60);
    for(const row of run.trace){
        assert.equal(row.startedAt,1);
        assert.equal(row.searchQueries,0); // supplied reports, no API search
        assert(row.suppliedRouteReports<=4);assert(row.reportedOps<=4000);
        assert(row.commands.length<=4);
        assert.equal(new Set(row.commands.map(c=>c.actorId)).size,row.commands.length);
        if(row.support)for(const proof of Object.values(row.support)){
            assert(proof.supported&&proof.exclusive);assert(proof.outcomes<=16);
        }
    }
}

test('bounded successful continuation: identical proposal/outcome law gives supported supplied progress',()=>{
    const r=results.success=compareProgressSequences({scenario:'progress'});
    for(const run of Object.values(r))verifyBounds(run);
    assert.equal(r.baseline.commands,0);assert.equal(r.candidate.commands,6);
    const rear=role(r.candidate,'rear'),healer=role(r.candidate,'healer');
    assert.deepEqual(r.candidate.trace.map(row=>row.commands.map(c=>c.actorId).sort()),
        [[rear],[rear],[healer,rear].sort(),[healer,rear].sort()]);
    assert.deepEqual(position(get(r.candidate,4),rear),{id:rear,x:15,y:20});
    assert.deepEqual(get(r.candidate,4).suppliedNextPositions.find(p=>p.id===rear),{id:rear,x:15,y:19});
    // These rollouts diverge only through admitted moves with the same supplied
    // outcome law. At every row, both rules are also evaluated on identical input.
    assert.deepEqual(get(r.baseline,1).shadow,get(r.candidate,1).shadow);
    assert.equal(get(r.candidate,4).unchanged,0);
    assert.equal(r.candidate.terminal.phase,'active'); // useful progress, NOT arrival
    for(const id of ['frontA','frontB'].map(x=>role(r.candidate,x)))
        assert.equal(position(get(r.candidate,4),id).y,21);
});

for(const outcome of ['rejected','unknown','accepted-still'])test(`${outcome}: favored actor retries, safe healer withheld, original tick5 stop`,()=>{
    const r=results[outcome]=compareProgressSequences({scenario:'progress',outcome});
    for(const run of Object.values(r)){
        verifyBounds(run);assert.equal(run.terminal.tick,5);assert.equal(run.terminal.reason,'no-displacement');
    }
    assert.equal(r.baseline.commands,0);assert.equal(r.candidate.commands,4);
    const rear=role(r.candidate,'rear'),healer=role(r.candidate,'healer');
    for(const row of r.candidate.trace.slice(0,4)){
        assert.deepEqual(admitted(row),[rear]);assert(row.healerAlternativeSafe);
        assert(!admitted(row).includes(healer));assert.equal(row.commands.length,1);
        assert.equal(row.commands[0].returnCode,outcome==='rejected'?-11:outcome==='unknown'?null:0);
        assert.equal(row.commands[0].returnKind,outcome==='unknown'?'unknown':'numeric');
        assert.equal(row.commands[0].suppliedDisplacement,false);
        assert.deepEqual(row.suppliedNextPositions,row.positions);
        assert.deepEqual(row.shadow,get(r.baseline,row.tick).shadow);
    }
    assert.deepEqual(r.candidate.trace.map(r=>r.unchanged),[0,1,2,3,3]);
});

test('one delayed success only postpones original stall termination; no grace or fairness added',()=>{
    const r=results.oneStep=compareProgressSequences({scenario:'one-step',outcome:'delayed'});
    Object.values(r).forEach(verifyBounds);
    assert.equal(r.baseline.terminal.tick,5);assert.equal(r.candidate.terminal.tick,8);
    assert.equal(r.candidate.terminal.reason,'no-displacement');assert.equal(r.candidate.commands,3);
    const rear=role(r.candidate,'rear');
    assert.equal(position(get(r.candidate,3),rear).x,16);
    assert.equal(position(get(r.candidate,4),rear).x,15);
    assert.equal(get(r.candidate,4).unchanged,0);
    for(let tick=4;tick<=7;tick++)assert.equal(get(r.candidate,tick).commands.length,0);
    assert.equal(get(r.candidate,8).startedAt,1);
});

test('partial group execution: stationary healer bounds rear progress and still ends at tick8',()=>{
    const r=results.partial=compareProgressSequences({scenario:'progress',outcome:'healer-still'});
    Object.values(r).forEach(verifyBounds);
    const rear=role(r.candidate,'rear'),healer=role(r.candidate,'healer');
    assert.equal(r.baseline.terminal.tick,5);assert.equal(r.candidate.terminal.tick,8);
    assert.equal(r.candidate.terminal.reason,'no-displacement');
    assert.equal(position(get(r.candidate,4),rear).y,20);
    assert.equal(position(get(r.candidate,4),healer).y,23);
    const joint=get(r.candidate,3).commands;
    assert.equal(joint.length,2);assert(joint.every(c=>c.returnCode===0));
    assert.equal(joint.find(c=>c.actorId===healer).suppliedDisplacement,false);
    assert.equal(joint.find(c=>c.actorId===rear).suppliedDisplacement,true);
    for(let tick=4;tick<8;tick++)assert.deepEqual(admitted(get(r.candidate,tick)),[healer]);
});

test('supplied reacting/cyclic proposals can waste60 commands and reach unchanged tick61 deadline',()=>{
    const r=results.cycle=compareProgressSequences({scenario:'cycle'});
    Object.values(r).forEach(verifyBounds);
    assert.equal(r.baseline.terminal.tick,5);assert.equal(r.baseline.commands,0);
    assert.equal(r.candidate.terminal.tick,61);assert.equal(r.candidate.terminal.reason,'timeout');
    assert.equal(r.candidate.commands,60);
    const rear=role(r.candidate,'rear');
    for(let tick=1;tick<=60;tick++){
        const row=get(r.candidate,tick);assert.deepEqual(admitted(row),[rear]);
        assert.equal(position(row,rear).x,tick%2?16:15);
        assert.equal(row.unchanged,0);
    }
    assert.equal(position(get(r.candidate,1),rear).x,position(r.candidate.terminal,rear).x);
});

test('exact geometric ties stall identically with no commands through tick5',()=>{
    const r=results.exactTie=compareProgressSequences({scenario:'exact-tie'});
    for(const run of Object.values(r)){
        verifyBounds(run);assert.equal(run.terminal.tick,5);assert.equal(run.commands,0);
        assert.equal(run.terminal.reason,'no-displacement');
    }
});

test('real preflight and executor retain pure holds, current-position tactics and exclusive steps',()=>{
    assert.equal(Object.keys(results).length,8);
    for(const comparison of Object.values(results))for(const run of Object.values(comparison))
        for(const row of run.trace.filter(r=>r.phase==='active')){
            const ids=new Set(new Map(run.roleIds).values());
            const decisions=row.decisions.filter(d=>d.channel==='movement'&&ids.has(d.actorId));
            assert.equal(decisions.length,4);
            for(const d of decisions){
                assert(['capture-route-step','capture-route-hold'].includes(d.reason));
                if(d.reason==='capture-route-hold')assert.equal(d.actions.length,0);
            }
            const tactics=row.decisions.filter(d=>d.channel!=='movement');
            assert.equal(tactics.length,28);assert(tactics.every(d=>d.actions.length===0));
        }
});

test('renaming, input ordering and mirrored non-tied decisions preserve sequence and stop',()=>{
    const original=compareProgressSequences({scenario:'progress',outcome:'rejected'});
    const moved=compareProgressSequences({scenario:'progress',outcome:'rejected',rename:true,reverse:true,mirror:true});
    for(const rule of ['baseline','candidate']){
        const a=original[rule],b=moved[rule];verifyBounds(b);
        assert.equal(a.terminal.tick,b.terminal.tick);assert.equal(a.terminal.reason,b.terminal.reason);
        for(const row of a.trace){
            const other=get(b,row.tick);assert.equal(row.commands.length,other.commands.length);
            assert.equal(row.healerAlternativeSafe,other.healerAlternativeSafe);
            for(const [r,id]of a.roleIds){
                const p=position(row,id),q=position(other,role(b,r));
                assert.equal(q.x,99-p.x);assert.equal(q.y,99-p.y);
            }
        }
    }
});
