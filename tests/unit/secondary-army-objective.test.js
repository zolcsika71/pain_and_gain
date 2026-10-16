import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {secondaryArmyPlan,targetId} from '../fixtures/secondary-army-candidate.js';
import {selectFlag} from '../../src/strategy/objectives.js';
import {moveCreeps,executeTactics} from '../../src/arena/execute.js';
import {planHealerEscort} from '../../src/tactics/healer-escort.js';
import {secondaryModelRoute} from '../fixtures/secondary-army-route.js';
const recorded=JSON.parse(fs.readFileSync(new URL('../fixtures/secondary-army-window.json',import.meta.url)));
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function world(){const w={tick:39,calls:[],queued:new Map(),candidate:null,escort:null,engagements:new Map()};
    w.creeps=recorded.start.creeps.map(c=>({...c,exists:true,body:Object.entries(c.activeBodyParts).flatMap(([type,n])=>Array.from({length:n},()=>({type,hits:100}))),
        getRangeTo(t){return range(this,t);},moveTo(t){w.queued.set(this.id,{x:t.x,y:t.y});w.calls.push([this.id,'moveTo',t.id??null]);return 0;},
        attack(t){w.calls.push([this.id,'attack',t.id]);return 0;},rangedAttack(t){w.calls.push([this.id,'rangedAttack',t.id]);return 0;},
        heal(t){w.calls.push([this.id,'heal',t.id]);return 0;},rangedHeal(t){w.calls.push([this.id,'rangedHeal',t.id]);return 0;}}));
    w.flags=recorded.start.flags.map(f=>({...f,my:f.owner==='neutral'?undefined:f.owner==='me'}));
    w.ids=[...recorded.group.memberIds];return w;
}
const state=w=>({tick:w.tick,flags:w.flags,myCreeps:w.creeps.filter(c=>c.my&&c.hits>0),enemies:w.creeps.filter(c=>!c.my&&c.hits>0)});
// Bounded plain-terrain BFS, not Arena searchPath. At most5,000 expanded cells.
// Ignore an occupied final goal in search but reject an occupied next step;
// no swaps, vacating-cell assumptions, or simultaneous collision arbitration.
const route=(from,to,occupied)=>secondaryModelRoute(recorded.map.terrain.rows,from,to,occupied);
const plan=w=>secondaryArmyPlan(state(w),selectFlag(w.flags),w.ids,w.candidate,(c,f)=>route(c,f).steps,w.escort?.escort);

function run(candidate,{playback=false,blocked=false,observations=61,nearTarget=false}={}){
    const w=world(),trace=[];let divergences=0;
    if(nearTarget){
        // Independently generated open-lane control, NOT a reachable replay state.
        w.creeps=w.creeps.filter(c=>c.my);
        const generated=[[33,66],[32,66],[32,65],[33,65]];
        w.ids.forEach((id,i)=>Object.assign(w.creeps.find(c=>c.id===id),{x:generated[i][0],y:generated[i][1]}));
        assert(w.creeps.every(c=>recorded.map.terrain.rows[c.y][c.x]===0));
    }
    for(let i=0;i<observations;i++){
        w.tick=39+i;w.calls.length=0;w.queued.clear();
        const source=recorded.enemies.find(e=>e.tick===w.tick);
        if(playback&&source){
            for(let j=0;j<recorded.enemyIds.length;j++){
                const c=w.creeps.find(c=>c.id===recorded.enemyIds[j]),[x,y]=source.positions[j];
                if(w.creeps.some(o=>o!==c&&o.x===x&&o.y===y)){divergences++;continue;}Object.assign(c,{x,y});
            }
            const target=w.flags.find(f=>f.id===targetId);target.my=source.targetOwner==='neutral'?undefined:source.targetOwner==='me';
        }
        const centre=selectFlag(w.flags),s=state(w);
        w.escort=planHealerEscort(s,centre,w.escort?.state);
        const p=candidate?plan(w):{fallbackById:new Map(),reason:'baseline',state:null};w.candidate=p.state;
        const decisions=[];
        moveCreeps(s.myCreeps,s.enemies,centre,w.engagements,p.fallbackById,w.escort.escort,null,
            {decision:d=>{decisions.push(d);return null;}},false,null,{creeps:w.creeps,terrainAt:p=>recorded.map.terrain.rows[p.y]?.[p.x]});
        executeTactics(s.myCreeps,s.enemies,s.myCreeps.filter(c=>c.hits<c.hitsMax));
        const occupied=new Set(w.creeps.map(c=>c.y*100+c.x)),moves=[],modelRoutes=[];let routeOps=0;
        for(const c of s.myCreeps){assert(w.calls.filter(a=>a[0]===c.id&&a[1]==='moveTo').length<=1);
            const t=w.queued.get(c.id);if(!t||blocked&&w.ids.includes(c.id))continue;
            const r=route(c,t,occupied);routeOps+=r.ops;
            modelRoutes.push({id:c.id,status:r.status,next:r.next,ops:r.ops});
            if(r.next&&!occupied.has(r.next.y*100+r.next.x))moves.push({c,p:r.next});
        }
        // Stress assumption, NOT Arena arbitration: reject all contenders and
        // do not search again for an alternative. Preserve the cause in traces.
        for(const r of modelRoutes){
            r.resolution=!r.next?(r.status==='model-complete-route'?'already-at-goal':'unresolved-route'):
                occupied.has(r.next.y*100+r.next.x)?'occupied-next':
                    moves.filter(m=>range(m.p,r.next)===0).length>1?'all-contenders-rejected':'model-step';
        }
        for(const m of moves)if(moves.filter(n=>range(n.p,m.p)===0).length===1){assert.equal(recorded.map.terrain.rows[m.p.y][m.p.x],0);Object.assign(m.c,m.p);}
        assert.equal(new Set(w.creeps.map(c=>`${c.x},${c.y}`)).size,w.creeps.length);
        const target=w.flags.find(f=>f.id===targetId),group=w.ids.map(id=>w.creeps.find(c=>c.id===id));
        const hypotheticalCapture=group.some(c=>range(c,target)===0);
        if(!playback&&hypotheticalCapture)target.my=true;
        trace.push({tick:w.tick,reason:p.reason,phase:p.state?.phase??null,routeEstimates:p.state?.routes,routeOps,
            modelRoutes:modelRoutes.filter(r=>w.ids.includes(r.id)),
            group:group.map(c=>({id:c.id,x:c.x,y:c.y})),maxTargetRange:Math.max(...group.map(c=>range(c,target))),
            maxCentreRange:Math.max(...group.map(c=>range(c,centre))),hypotheticalCapture,
            minArmedEnemyRange:Math.min(...group.flatMap(c=>s.enemies.filter(e=>e.activeBodyParts.attack||e.activeBodyParts.ranged_attack).map(e=>range(c,e)))),
            decisions:decisions.filter(d=>w.ids.includes(d.actorId)).map(d=>({id:d.actorId,reason:d.reason})),
            defenders:s.myCreeps.filter(c=>!w.ids.includes(c.id)&&(c.activeBodyParts.attack||c.activeBodyParts.ranged_attack)&&range(c,centre)<=3).length});
    }
    return{trace,divergences,final:w};
}

test('single concrete objective compares baseline, bounded departure, recorded enemy approach and blocked progress',t=>{
    for(const mode of ['stationary-opponent','recorded-enemy-playback','blocked-group']){
        const options={playback:mode==='recorded-enemy-playback',blocked:mode==='blocked-group'},b=run(false,options),c=run(true,options);
        assert(c.trace.some(r=>r.reason==='secondary-advance'));assert(c.trace.some(r=>r.phase==='finished'));
        assert(c.trace.every(r=>r.defenders>0));assert(b.trace.every(r=>!r.hypotheticalCapture));
        if(!options.blocked){
            for(const suffix of ['ranged_3','ranged_4'])assert.equal(c.trace[0].modelRoutes.find(r=>r.id.endsWith(suffix)).resolution,'all-contenders-rejected');
        }
        t.diagnostic(JSON.stringify({mode,baseline:{minTargetRange:Math.min(...b.trace.map(r=>r.maxTargetRange))},candidate:c.trace,
            playbackDivergences:c.divergences}));
    }
});
test('centre defence, armed approach and support loss terminate permanently without repurposing centre',()=>{
    for(const change of [w=>{w.flags[0].my=false;},w=>{w.creeps.filter(c=>c.my&&!w.ids.includes(c.id)).forEach(c=>{c.activeBodyParts={move:1};c.body=c.body.filter(p=>p.type==='move');});},
        w=>{const e=w.creeps.find(c=>!c.my&&c.activeBodyParts.attack);e.x=34;e.y=64;},w=>{w.creeps.find(c=>c.id===w.ids[0]).hits--; }]){
        const w=world(),p=plan(w);w.candidate=p.state;w.tick++;change(w);const ended=plan(w);assert.equal(ended.state.phase,'finished');assert.equal(ended.fallbackById.size,0);
        w.candidate=ended.state;w.tick++;assert.equal(plan(w).state.phase,'finished');
    }
    const w=world(),p=plan(w);assert.equal(selectFlag(w.flags),w.flags[0]);
    assert(p.fallbackById.size===4&&[...p.fallbackById.values()].every(f=>f.id===targetId));
    assert(w.creeps.filter(c=>c.my&&!w.ids.includes(c.id)).length===10);
});
test('capture, changed ownership, route/timeout limits, stable target and tick reset',()=>{
    for(const owner of [true,false]){const w=world();w.candidate=plan(w).state;w.tick++;w.flags.find(f=>f.id===targetId).my=owner;
        assert.equal(plan(w).reason,owner?'captured':'target-owner-changed');}
    const w=world(),initial=plan(w),before=JSON.stringify(initial.state);w.candidate=initial.state;w.tick=99;
    assert.equal(plan(w).reason,'timeout');assert.equal(JSON.stringify(initial.state),before);
    w.tick=39;w.candidate={...initial.state,lastTick:99};assert.equal(plan(w).reason,'secondary-advance');
    assert.equal(secondaryArmyPlan(state(w),w.flags[0],w.ids,null,()=>null).reason,'route-unavailable');
    assert.equal(secondaryArmyPlan(state(w),w.flags[0],w.ids,null,()=>41).reason,'route-unavailable');
    w.flags.reverse();const centre=w.flags.find(f=>f.id==='pg_flag_vulnerability');
    const p=secondaryArmyPlan(state(w),centre,w.ids,null,()=>20);assert.equal(p.fallbackById.get(w.ids[0]).id,targetId);
});
test('generated near-target control exercises capture completion and terminal centre fallback',t=>{
    const result=run(true,{nearTarget:true}),baseline=run(false,{nearTarget:true});
    assert(result.trace.some(r=>r.hypotheticalCapture));assert(result.trace.some(r=>r.reason==='captured'));
    assert(!baseline.trace.some(r=>r.hypotheticalCapture));
    assert.equal(result.trace.at(-1).reason,'captured');
    t.diagnostic(JSON.stringify({mode:'generated-near-target-control',candidate:result.trace}));
});
test('recorded approaching enemy rejects without claiming the synthetic departure reached that observation',()=>{
    const w=world();w.candidate=plan(w).state;
    const first=recorded.enemies.find(s=>s.positions.some(([x,y],i)=>{
        const e=w.creeps.find(c=>c.id===recorded.enemyIds[i]);return(e.activeBodyParts.attack||e.activeBodyParts.ranged_attack)&&range({x,y},{x:31,y:67})<=5;
    }));
    assert(first);w.tick=first.tick;
    first.positions.forEach(([x,y],i)=>Object.assign(w.creeps.find(c=>c.id===recorded.enemyIds[i]),{x,y}));
    assert.equal(plan(w).reason,'enemy-approach');
});
test('combat/support and escort override secondary fallback without changing selectors',()=>{
    const w=world();w.candidate=plan(w).state;const centre=w.flags[0],r=w.creeps.find(c=>c.id===w.ids[1]),h=w.creeps.find(c=>c.id===w.ids[0]);
    const enemy=w.creeps.find(c=>!c.my);enemy.x=r.x-4;enemy.y=r.y;
    // Existing executor fallback seam, not permission to ignore planner cancellation.
    const map=new Map([[r.id,w.flags.find(f=>f.id===targetId)]]);w.calls.length=0;
    moveCreeps([r],[enemy],centre,new Map(),map);assert.equal(w.calls[0][2],enemy.id);
    r.hits--;r.x=h.x+4;r.y=h.y;w.calls.length=0;
    moveCreeps([h,r],[],centre,new Map(),new Map([[h.id,w.flags.find(f=>f.id===targetId)]]));assert.equal(w.calls[0][2],r.id);
    w.escort={escort:{healerId:h.id}};assert.equal(plan(w).reason,'group-unavailable');
    r.hits=r.hitsMax;r.x=h.x+1;enemy.x=0;enemy.y=0;
    assert.equal(plan(w).reason,'escort-priority');
});
