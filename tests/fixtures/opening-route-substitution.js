// TEST ONLY. One retained actor path, generated full-roster worlds/other routes.
// No payload readers, source rewriting, pathfinder or movement arbitration.
import assert from 'node:assert/strict';
import {openingWorld} from './opening-secondary-generated-world.js';
import {occupancyWorld,centreFrame,supplySteps} from './opening-occupancy-api-world.js';
import {secondaryStepSupport} from '../../src/strategy/supported-contest.js';
import {moveCreeps,executeTactics} from '../../src/arena/execute.js';

// Exact encoded diagnostic results from replay6ad528d5abefcb3a9dc921e8 tick5.
// Their original cache/terrain is NOT reconstructed by this generated fixture.
export const observedPaths=Object.freeze({
    baseline:'1616161716181619162015211422132312241225122612271228122912301331133213331334133513361337133813391340134113421343134413451346134713481349',
    alternative:'1516161716181619162015211422132312241225122612271228122912301331133213331334133513361337133813391340134113421343134413451346134713481349',
});
export const decodePath=value=>Array.from({length:value.length/4},(_,i)=>
    ({x:Number(value.slice(i*4,i*4+2)),y:Number(value.slice(i*4+2,i*4+4))}));
const point=c=>({x:c.x,y:c.y}),same=(a,b)=>a.x===b.x&&a.y===b.y;
const vertical=(x,a,b)=>Array.from({length:b-a+1},(_,i)=>({x,y:a+i}));

// Only the sampled cache report changes. One attempt, even on a skip. No solve,
// query, cache eviction, lifecycle update or resubstitution is hidden here.
export function substituteOnce(w,shot,{enabled=true,path=decodePath(observedPaths.alternative)}={}){
    if(!enabled)return {reason:'baseline',inserted:false};
    if(shot.spent)return {reason:'spent',inserted:false};
    shot.spent=true;
    const previous=w.state,cache=previous?.routeControl?.cache,actor=w.actor('bow1');
    if(previous?.phase!=='active'||w.tick!==5||!Array.isArray(cache)||cache.length!==4)
        return {reason:'unavailable',inserted:false};
    if(cache.some(r=>w.tick-r.searchedAt>=5||!same(r.from,w.actor(r.actorId))&&
        !r.path.some(p=>same(p,w.actor(r.actorId)))))return {reason:'stale-or-off-path',inserted:false};
    if(!same(actor,{x:15,y:15}))return {reason:'origin-mismatch',inserted:false};
    const index=cache.findIndex(r=>r.actorId===actor.id);
    if(index<0)return {reason:'missing-actor',inserted:false};
    const before=structuredClone(previous),replacement={...cache[index],tick:w.tick,searchedAt:w.tick,
        from:point(actor),path:structuredClone(path),incomplete:false,ops:105};
    const reports=cache.map((r,i)=>i===index?replacement:r);
    w.state={...previous,routeControl:{...previous.routeControl,cache:reports}};
    assert.deepEqual(previous,before);
    for(let i=0;i<4;i++)if(i!==index)assert.deepEqual(reports[i],cache[i]);
    assert.deepEqual(w.state.selection,previous.selection);
    return {reason:'inserted',inserted:true,actorId:actor.id,tick:w.tick,searchedAt:w.tick,
        previousSearchedAt:cache[index].searchedAt,others:reports.filter((_,i)=>i!==index).map(r=>
            ({id:r.actorId,searchedAt:r.searchedAt})),before,after:structuredClone(w.state)};
}

function responsePaths({renewed=false}={}){
    const baseline=decodePath(observedPaths.baseline),alternative=decodePath(observedPaths.alternative);
    const r3=renewed?[{x:15,y:15},{x:16,y:16},{x:16,y:17},{x:17,y:18},
        ...vertical(17,19,45),{x:16,y:46},{x:15,y:47},{x:14,y:48},{x:13,y:49}]:[{x:15,y:15},...baseline];
    const r5=[{x:16,y:15},{x:16,y:16},{x:17,y:17},...vertical(17,18,45),
        {x:16,y:46},{x:15,y:47},{x:14,y:48},{x:13,y:49}];
    return {baseline,alternative,r3,r5};
}

export function substitutionWorld({scenario='favorable'}={}){
    const routes=responsePaths({renewed:scenario==='renewed'});
    const make=()=>{
        const w=openingWorld();
        const positions={guardH1:[5,5],guardM0:[6,4],guardM1:[6,5],guardM2:[6,6],
            medic:[14,9],bow1:[15,11],bow2:[11,11],guardR2:[16,11]};
        for(const [id,[x,y]]of Object.entries(positions))Object.assign(w.actor(id),{x,y});
        if(scenario==='occupied-alternative')Object.assign(w.actor('guardR0'),{x:15,y:16});
        Object.assign(w.centre,{x:49,y:49});Object.assign(w.flags.find(f=>f.id==='east'),{x:13,y:49});
        // Preserve legal effect counts while matching the observed goal's effect.
        const east=w.flags.find(f=>f.id==='east'),near=w.flags.find(f=>f.id==='near');
        [east.effectType,near.effectType]=[near.effectType,east.effectType];
        let k=0;for(const f of w.flags.filter(f=>!['centre','east'].includes(f.id)))
            Object.assign(f,{x:85+k++,y:20});
        w.membership=null;w.bind();return w;
    };
    const start={
        medic:[{x:14,y:9},...vertical(14,10,15),{x:15,y:16},{x:14,y:17},...vertical(13,18,49)],
        bow1:[{x:15,y:11},...vertical(15,12,15),...routes.baseline],
        bow2:[{x:11,y:11},...vertical(11,12,15),{x:10,y:16},{x:11,y:17},{x:12,y:18},...vertical(13,19,49)],
        guardR2:[{x:16,y:11},...vertical(16,12,15),...routes.r5.slice(1)],
    };
    const refreshed={
        medic:[...vertical(14,9,48),{x:13,y:49}],
        bow1:routes.r3,
        bow2:[{x:11,y:15},{x:12,y:16},...vertical(13,17,49)],
        guardR2:routes.r5,
    };
    const w=occupancyWorld({make,respond:(world,actor,goal,options)=>{
        assert.equal(goal.pos.id,'east');
        if(scenario==='incomplete-refresh'&&world.tick>=6)return {path:[],incomplete:true,ops:100};
        let points=(world.tick<6?start:refreshed)[actor.id];
        // Same supplied response law in both arms. The alternative observation
        // may put bow1 at15,16; no new alternative search is made.
        if(world.tick>=6&&actor.id==='bow1'&&same(actor,{x:15,y:16}))
            points=[point(actor),...routes.r3.slice(routes.r3.findIndex(p=>same(p,{x:16,y:17})))];
        const index=points?.findIndex(p=>same(p,actor))??-1;
        if(index<0)return {path:[],incomplete:true,ops:100};
        const path=points.slice(index+1).map(point);
        const blocked=path.find(p=>options.costMatrix.get(p.x,p.y)===255);
        if(blocked){
            // No substitute pathfinder/detour: this response table has no
            // supplied complete route compatible with its request matrix.
            (world.blockedDeclarations??=[]).push({tick:world.tick,actorId:actor.id,blocked:point(blocked)});
            return {path:[],incomplete:true,ops:100};
        }
        return {path,incomplete:false,ops:100};
    }});
    assert.deepEqual([...w.group().memberIds].sort(),['bow1','bow2','guardR2','medic']);
    // Production single movement/tactics pass with explicit centre provenance.
    w.execute=(plan,extra={})=>{
        w.calls=[];w.records=[];
        const reporter={decision:d=>{w.records.push(d);return d;},
            attempt:(d,i,a,rc)=>w.records.push({actorId:d.actorId,method:a.method,returnCode:rc??null})};
        const centreIds=plan?.moves?new Set([...plan.moves.keys()].filter(id=>!w.group().memberIds.includes(id))):null;
        moveCreeps(w.myCreeps,w.enemies,w.centre,extra.engagements??new Map(),new Map(),
            extra.escort??null,null,reporter,false,extra.pair??null,w.spacing,null,plan?.moves??null,'capture',
            null,null,centreIds);
        executeTactics(w.myCreeps,w.enemies,w.myCreeps.filter(c=>c.hits<c.hitsMax),reporter,
            {...w,creeps:w.spacing.creeps});
        return {calls:w.calls.map(c=>({...c})),records:[...w.records]};
    };
    return w;
}

export function checkedFrame(w,extra={}){
    const f=centreFrame(w,extra),ids=w.group().memberIds;
    assert.equal(f.plan.diagnostic.queries,w.requests.filter(q=>q.tick===w.tick).length);
    for(const q of w.requests.filter(q=>q.tick===w.tick)){
        assert.equal(q.maxOps,1000);
        assert(q.result.path.every(p=>q.matrix.get(p.x,p.y)!==255));
    }
    assert(f.plan.diagnostic.queries<=(w.tick===1?24:4));
    assert(f.plan.diagnostic.reportedOps===f.plan.diagnostic.queries*100);
    assert((f.plan.diagnostic.travel?.examined??0)<=16);
    for(const c of w.myCreeps)assert(f.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
    if(f.plan.moves){
        const destinations=[...f.plan.moves.values()].filter(Boolean);
        assert.equal(new Set(destinations.map(p=>p.x+','+p.y)).size,destinations.length);
        assert(destinations.every(p=>!w.spacing.creeps.some(c=>c.hits>0&&same(c,p))));
        for(const sq of w.membership.squads){
            assert(secondaryStepSupport(w.myCreeps,sq.memberIds,f.plan.moves));
            for(let mask=0;mask<16;mask++){
                const group=sq.memberIds.map((id,i)=>({...w.actor(id),...(mask&(1<<i)?f.plan.moves.get(id):null)}));
                assert(secondaryStepSupport(group,sq.memberIds,new Map()));
                if(sq.id!==w.group().id){
                    const part=(c,type)=>c.body.some(p=>p.type===type&&p.hits>0);
                    const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
                    for(const h of group.filter(c=>part(c,'heal')))
                        assert(group.filter(c=>(part(c,'attack')||part(c,'ranged_attack'))&&range(c,h)<=3).length>=2);
                }
            }
        }
    }
    const actual=JSON.stringify(f.calls.filter(c=>!['move','moveTo'].includes(c.method)));
    const calls=w.calls;w.calls=[];executeTactics(w.myCreeps,w.enemies,
        w.myCreeps.filter(c=>c.hits<c.hitsMax),null,{...w,creeps:w.spacing.creeps});
    assert.equal(JSON.stringify(w.calls),actual);w.calls=calls;
    return f;
}

export function compareSubstitution({scenario='favorable',cap=20}={}){
    const result={};
    for(const enabled of [false,true]){
        const w=substitutionWorld({scenario}),shot={spent:false},frames=[];
        for(;w.tick<=cap;){
            if(w.tick===5&&scenario==='off-path'){
                const cache=w.state.routeControl.cache;
                w.state={...w.state,routeControl:{...w.state.routeControl,
                    cache:cache.map(r=>r.actorId==='bow1'?{...r,from:{x:99,y:99},path:[{x:13,y:49}]}:r)}};
            }
            if(w.tick===7&&scenario==='lost-heal'){
                const h=w.actor('medic');h.body.filter(p=>p.type==='heal').forEach(p=>{p.hits=0;});h.hits-=600;
            }
            if(w.tick>=5&&['rejected','unknown'].includes(scenario))
                w.returns.set('bow1',scenario==='rejected'?-11:undefined);
            const insertion=w.tick===5?substituteOnce(w,shot,{enabled}):null;
            const positions=w.myCreeps.map(c=>({id:c.id,...point(c)})),previous=w.state,previousText=JSON.stringify(previous);
            const f=checkedFrame(w);
            assert.equal(JSON.stringify(previous),previousText);
            const own=f.calls.filter(c=>c.method==='move'&&w.group().memberIds.includes(c.id));
            const pair=w.tick===5&&f.plan.state.phase==='active'&&f.plan.diagnostic.queries===0?2:0;
            assert(f.plan.diagnostic.queries+pair<=(w.tick===1?24:4));
            const row={tick:w.tick,positions,insertion,diagnostic:f.plan.diagnostic,selection:w.state.selection??null,
                cache:structuredClone(w.state.routeControl?.cache??[]),commands:own,
                evicted:f.mission.requestAdapter.evictedActorIds,
                centreCommands:f.calls.filter(c=>c.method==='move'&&!w.group().memberIds.includes(c.id)),
                holds:f.plan.diagnostic.travel?.actors.filter(a=>!a.admitted)??[],
                returns:f.records.filter(r=>r.method==='move'),referencePairQueries:pair,referencePairOps:pair?196:0,
                substitutionQueries:0,attemptSpent:shot.spent};
            frames.push(row);
            if(f.plan.state.phase==='finished')break;
            let successful=own.map(c=>c.id);
            if(w.tick>=5){
                if(scenario==='no-displacement')successful=[];
                if(['rejected','unknown'].includes(scenario))successful=successful.filter(id=>id!=='bow1');
                if(scenario==='partial')successful=w.tick===5?successful.filter(id=>id==='bow1'):[];
            }
            supplySteps(w,f,successful); // Centre outcomes explicitly stationary in BOTH arms.
            row.suppliedNext=w.myCreeps.map(c=>({id:c.id,...point(c)}));
        }
        result[enabled?'substitution':'baseline']={frames,requests:w.requests.map(({matrix,observed,...q})=>q),
            blockedDeclarations:w.blockedDeclarations??[],
            shot,ended:frames.at(-1).diagnostic.phase==='finished'};
    }
    return result;
}
