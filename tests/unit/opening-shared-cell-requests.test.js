// Explicit generated-only entry point. No original/retained payload reader.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {publish} from '../../tools/retrieval-files.js';
import {compareSharedRequests,sharedRequestWorld,sharedRequestFrame} from '../fixtures/opening-shared-cell-requests.js';
import {blockedOpeningReports} from '../../src/strategy/opening-deployment.js';
import {supplySteps} from '../fixtures/opening-occupancy-api-world.js';

const results={};
after(()=>{
    if(process.env.PAIN_GAIN_SHARED_REQUEST_OUTPUT){
        const text=JSON.stringify(results,(key,value)=>key==='matrix'?
            {nonzero:[...value.data].flatMap((cost,i)=>cost?[{x:i%100,y:Math.floor(i/100),cost}]:[])}:value,2);
        publish(path.join(process.env.PAIN_GAIN_SHARED_REQUEST_OUTPUT,'generated-comparison.json'),Buffer.from(text+'\n'));
    }
});
const frame=(run,tick)=>run.frames.find(f=>f.tick===tick);
const last=run=>run.frames.at(-1);
const position=(row,id)=>row.positions.find(c=>c.id===id);
function bounds(run){
    for(const f of run.frames){
        assert(f.diagnostic.queries<=(f.tick===1?24:4));
        assert.equal(f.paidRequests,f.diagnostic.queries);
        assert.equal(f.diagnostic.reportedOps,f.diagnostic.queries*100);
        assert.deepEqual(f.evicted,[]); // every scenario uses free-cell conflicts
        assert.equal(f.diagnostic.startedAt??f.selection?.startedAt,1);
        assert(f.cache.every(r=>r.path.length<=40));
        assert((f.diagnostic.travel?.examined??0)<=16);
        assert(f.returns.every(r=>r.returnCode===0));
    }
    assert.equal(run.requests.filter(r=>r.tick>1).length,
        run.frames.some(f=>f.tick===6)?4:0);
    const matrices=run.requests.map(r=>r.matrix);assert.equal(new Set(matrices).size,matrices.length);
}

test('one natural refresh compares identical worlds, fixed exclusions, origins/goals/options and accounting',()=>{
    const r=results.progress=compareSharedRequests();
    Object.values(r).forEach(bounds);
    for(let tick=1;tick<=6;tick++)assert.deepEqual(frame(r.ordinary,tick).positions,frame(r.overlay,tick).positions);
    assert.deepEqual(frame(r.overlay,5).exclusions,[{x:30,y:20},{x:30,y:21}]);
    assert.equal(frame(r.overlay,5).diagnostic.queries,0);
    for(const run of Object.values(r)){
        assert.equal(frame(run,6).diagnostic.queries,4);
        assert.equal(frame(run,6).diagnostic.reportedOps,400);
        assert.equal(frame(run,6).diagnostic.cacheHits,0);
        assert(run.frames.filter(f=>f.tick>=6&&f.selection?.phase==='active')
            .every(f=>f.cache.every(c=>c.searchedAt===6)));
        const requests=run.requests.filter(r=>r.tick===6);
        assert.deepEqual(requests.map(r=>r.actorId),[...requests.map(r=>r.actorId)].sort());
        for(const q of requests){
            assert.deepEqual(q.origin,(({x,y})=>({x,y}))(position(frame(run,6),q.actorId)));
            assert.deepEqual(q.goal,{id:'east',x:44,y:20,range:0});
            assert.deepEqual(q.optionKeys,['costMatrix','maxOps']);assert.equal(q.maxOps,1000);
            assert.deepEqual(q.exclusions,[{x:30,y:20},{x:30,y:21}]);
        }
    }
});

test('matrix overlay preserves origin and every current blocker; supplied paths respect complete matrices',()=>{
    const r=results.progress;
    for(const [arm,run]of Object.entries(r))for(const q of run.requests){
        assert.equal(q.matrix.get(q.origin.x,q.origin.y),0);
        for(let y=0;y<100;y++)for(let x=0;x<100;x++){
            const other=q.observed.some(c=>c.hits>0&&c.exists!==false&&c.id!==q.actorId&&c.x===x&&c.y===y);
            const extra=arm==='overlay'&&q.exclusions.some(p=>p.x===x&&p.y===y)&&
                !(q.origin.x===x&&q.origin.y===y);
            assert.equal(q.matrix.get(x,y),other||extra?255:0);
        }
        for(const p of q.result.path)assert.notEqual(q.matrix.get(p.x,p.y),255);
    }
});

test('supplied detours permit successive supported progress without a second batch or new tie rule',()=>{
    const r=results.progress;
    assert.equal(last(r.ordinary).tick,9);assert.equal(last(r.ordinary).diagnostic.reason,'no-displacement');
    assert.deepEqual(r.overlay.frames.filter(f=>f.tick>=6).map(f=>f.commands.length),[4,4,3,3,4]);
    assert.equal(last(r.overlay).diagnostic.phase,'active');
    const target={x:44,y:20},distance=p=>Math.max(Math.abs(p.x-target.x),Math.abs(p.y-target.y));
    const weapons=[...new Map(r.overlay.roleIds)].filter(([role])=>role!=='medic').map(([,id])=>id);
    const start=frame(r.overlay,6).positions,end=last(r.overlay).suppliedNext;
    assert(Math.max(...weapons.map(id=>distance(end.find(c=>c.id===id))))<
        Math.max(...weapons.map(id=>distance(start.find(c=>c.id===id)))));
    for(const [,id]of r.overlay.roleIds)assert.notDeepEqual(end.find(c=>c.id===id),start.find(c=>c.id===id));
});

test('no detour: explicit incomplete responses stop at6 after exactly four paid requests, no fallback',()=>{
    const r=results.incomplete=compareSharedRequests({scenario:'incomplete'});
    Object.values(r).forEach(bounds);
    assert.equal(last(r.overlay).tick,6);assert.equal(last(r.overlay).diagnostic.reason,'objective-unavailable');
    const qs=r.overlay.requests.filter(q=>q.tick===6);assert.equal(qs.length,4);
    assert(qs.every(q=>q.result.incomplete===true));
    assert.equal(last(r.overlay).commands.length,0);
});

test('renewed convergence on different free cells still intersects to all holds and stops9',()=>{
    const r=results.renewed=compareSharedRequests({scenario:'renewed'});
    Object.values(r).forEach(bounds);
    for(const run of Object.values(r)){
        assert.equal(last(run).tick,9);assert.equal(last(run).diagnostic.reason,'no-displacement');
        assert(run.frames.filter(f=>f.tick>=5).every(f=>f.commands.length===0));
        assert.equal(frame(run,6).diagnostic.travel.bestSize,2);
        assert.equal(frame(run,6).diagnostic.travel.tied,4);
    }
    for(const q of r.overlay.requests.filter(q=>q.tick===6))
        assert(q.exclusions.every(p=>q.result.path.every(c=>c.x!==p.x||c.y!==p.y)));
});

test('partial supplied movement preserves support, rebases cache and terminates11 without reset or refresh',()=>{
    const r=results.partial=compareSharedRequests({scenario:'partial'});
    Object.values(r).forEach(bounds);
    const o=r.overlay,roleIds=new Map(o.roleIds),bow=roleIds.get('bow2');
    assert.equal(last(o).tick,11);assert.equal(last(o).diagnostic.reason,'no-displacement');
    const changed=frame(o,7).positions.filter(c=>{
        const old=position(frame(o,6),c.id);return c.x!==old.x||c.y!==old.y;
    });
    assert.deepEqual(changed.map(c=>c.id),[bow]);
    assert.equal(frame(o,7).diagnostic.cacheHits,4);
    assert.deepEqual(frame(o,7).cache.find(c=>c.actorId===bow).from,{x:28,y:20});
    for(const f of o.frames.filter(f=>f.tick>=7))assert.equal(f.diagnostic.queries,0);
});

test('return0 without supplied movement cannot reset stall; stop9 before any second refresh',()=>{
    const r=results.still=compareSharedRequests({scenario:'no-displacement'});
    Object.values(r).forEach(bounds);
    for(const run of Object.values(r)){
        assert.equal(last(run).tick,9);assert.equal(last(run).diagnostic.reason,'no-displacement');
        for(const f of run.frames.filter(f=>f.tick>=6&&f.suppliedNext))assert.deepEqual(f.suppliedNext,f.positions);
    }
    assert.equal(r.overlay.frames.filter(f=>f.tick>=6).reduce((n,f)=>n+f.commands.length,0),12);
});

test('fresh-cache conflicts never evict or query early and can terminate5 before refresh is due',()=>{
    const r=results.fresh=compareSharedRequests({scenario:'fresh-stall'});
    for(const run of Object.values(r)){
        bounds(run);assert.equal(last(run).tick,5);assert.equal(last(run).diagnostic.reason,'no-displacement');
        assert(run.requests.every(q=>q.tick===1));
        for(const f of run.frames.filter(f=>f.tick>1)){
            assert.equal(f.exclusions.length,2);assert.equal(f.diagnostic.queries,0);
            assert.equal(f.commands.length,0);
        }
    }
});

test('frozen exclusions never change per-query and expiry does not restart the original deadline',()=>{
    const w=sharedRequestWorld({overlay:true});
    for(let tick=1;tick<=5;tick++){
        const f=sharedRequestFrame(w);
        supplySteps(w,f,f.calls.filter(c=>c.method==='move'&&w.group().memberIds.includes(c.id)).map(c=>c.id));
    }
    assert.equal(w.tick,6); // naturally reached, not a fabricated cache age
    const old=w.state,oldText=JSON.stringify(old),f=sharedRequestFrame(w);
    assert.equal(JSON.stringify(old),oldText);assert.equal(f.plan.diagnostic.queries,4);
    assert(Object.isFrozen(w.frozenExclusions));assert(w.frozenExclusions.every(Object.isFrozen));
    const matrices=w.requests.filter(r=>r.tick===6).map(q=>[...q.matrix.data]);
    assert.deepEqual(blockedOpeningReports({...w,creeps:w.spacing.creeps},w.state),[]);
    w.tick=61;w.bind();w.reports();const terminal=sharedRequestFrame(w);
    assert.equal(terminal.plan.diagnostic.reason,'timeout');assert.equal(terminal.plan.diagnostic.queries,0);
    assert.equal(terminal.plan.state.selection.startedAt,1);
    assert.deepEqual(w.requests.filter(r=>r.tick===6).map(q=>[...q.matrix.data]),matrices);
});

test('input ordering, renaming and mirrored geometry preserve corresponding supplied outcomes',()=>{
    const original=results.progress,transformed=compareSharedRequests({rename:true,reverse:true,mirror:true});
    for(const arm of ['ordinary','overlay']){
        const a=original[arm],b=transformed[arm];bounds(b);
        assert.equal(last(a).tick,last(b).tick);assert.equal(last(a).diagnostic.reason,last(b).diagnostic.reason);
        for(const f of a.frames){const g=frame(b,f.tick);assert.equal(f.commands.length,g.commands.length);
            assert.equal(f.diagnostic.queries,g.diagnostic.queries);
            for(const [role,id]of a.roleIds){
                const p=position(f,id),q=position(g,new Map(b.roleIds).get(role));
                assert.equal(q.x,99-p.x);assert.equal(q.y,99-p.y);
            }
        }
    }
});
