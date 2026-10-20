// Generated-only observation hooks: no injected planner or subset replacement.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const jointUrl=new URL('../../src/strategy/opening-joint-proposals.js',import.meta.url).href;
const executeUrl=new URL('../../src/arena/execute.js',import.meta.url).href;
registerHooks({resolve(s,c,next){
    let code=s==='../strategy/opening-joint-proposals.js'&&c.parentURL?.endsWith('/src/arena/execute.js')
        ? `export {jointProposalStatus} from ${JSON.stringify(jointUrl)}; import {proposeOpeningJoint as propose} from ${JSON.stringify(jointUrl)}; export function proposeOpeningJoint(a){const w=globalThis.__adoption;w.jointContext=a;const before=JSON.stringify(a.mission.state),steps=JSON.stringify([...a.steps]);const r=propose(a);assertUnchanged();function assertUnchanged(){if(before!==JSON.stringify(a.mission.state)||steps!==JSON.stringify([...a.steps]))throw Error('joint mutated live inputs');}w.jointResults.push(r);return w.joint=r;}` : null;
    if(s==='./arena/execute.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `export {moveCreeps,executeTactics} from ${JSON.stringify(executeUrl)}; import {prepareSecondaryMovement as prepare} from ${JSON.stringify(executeUrl)}; export function prepareSecondaryMovement(...a){const w=globalThis.__adoption;w.prepareInput=a;return w.prepared=prepare(...a);}`;
    return code?{url:`data:text/javascript,${encodeURIComponent(code)}`,shortCircuit:true}:next(s,c);
}});
const {adoptionFlow,moveCalls,tacticalCalls}=await import('./opening-adoption-flow-world.js');
export {moveCalls,tacticalCalls};

const point=p=>({x:p.x,y:p.y});
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const row=(a,b,y)=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y}));
export async function jointFlow(t,{enabled=true,probe=false,adoption=false,configure=null,rename=false,opening=true,mirror=false,reverse=false,
    compliantPartialRefresh=false}={}){
    const w=await adoptionFlow(t,{adoption,probe,joint:enabled&&process.env.PAIN_GAIN_JOINT_FORCE_BASELINE!=='1',opening,rename,configure:w=>{
        Object.assign(w.actor('guardR2'),{x:26,y:22});configure?.(w);
        if(mirror)for(const p of [...w.myCreeps,...w.enemies,...w.flags]){
            if(mirror!=='y')p.x=99-p.x;
            if(mirror==='y'||mirror==='both')p.y=99-p.y;
        }
        // selectFlag's existing first-flag centre contract is not this policy.
        if(reverse){w.myCreeps.reverse();w.enemies.reverse();w.flags.splice(1,w.flags.length-1,...w.flags.slice(1).reverse());}
    }});
    w.jointResults=[];
    // Explicit SUPPLIED response tables. Neither these tables nor observe()
    // implement a pathfinder/traffic simulator. Unavailable responses stay incomplete.
    const initial={
        medic:[{x:25,y:20},{x:26,y:19},{x:27,y:18},{x:28,y:19},...row(29,44,20)],
        bow1:[{x:25,y:19},...row(26,44,20)],
        bow2:[{x:25,y:21},{x:26,y:20},{x:27,y:21},...row(28,43,22),{x:44,y:21},{x:44,y:20}],
        guardR2:[{x:26,y:22},{x:26,y:21},...row(27,43,22),{x:44,y:21},{x:44,y:20}],
    };
    const corridor={
        medic:[{x:26,y:19},...row(27,43,19),{x:44,y:20}],
        bow1:row(26,44,20),
        bow2:[{x:26,y:21},...row(27,43,22),{x:44,y:21},{x:44,y:20}],
        guardR2:[{x:27,y:21},...row(28,43,21),{x:44,y:20}],
    };
    if(mirror)for(const table of [initial,corridor])for(const path of Object.values(table))for(const p of path){
        if(mirror!=='y')p.x=99-p.x;
        if(mirror==='y'||mirror==='both')p.y=99-p.y;
    }
    w.tables={initial,corridor};
    // One explicitly GENERATED response, not another route family/pathfinder.
    // It applies equally to either controller variant if ALL declared tick-2
    // observation/query inputs match. Default false preserves the old case.
    const snapshot=()=>({creeps:w.spacing.creeps.map(c=>({id:c.id,my:c.my,exists:c.exists,x:c.x,y:c.y,
        hits:c.hits,hitsMax:c.hitsMax,fatigue:c.fatigue,body:c.body.map(p=>({...p}))})).sort((a,b)=>a.id.localeCompare(b.id)),
    flags:w.flags.map(f=>({id:f.id,exists:f.exists,x:f.x,y:f.y,my:f.my,effectType:f.effectType,scorePerTick:f.scorePerTick}))
        .sort((a,b)=>a.id.localeCompare(b.id))});
    if(compliantPartialRefresh)assert(!mirror&&!rename&&!reverse&&!configure,'This one response declares the canonical generated observation only');
    const declared=compliantPartialRefresh?snapshot():null;
    if(declared)Object.assign(declared.creeps.find(c=>c.id==='bow1'),{x:26,y:20});
    w.partialRefresh={enabled:compliantPartialRefresh,observation:declared,uses:[],
        response:{path:[{x:26,y:21},{x:27,y:21},...row(28,43,22),{x:44,y:21},{x:44,y:20}],incomplete:false,ops:100}};
    w.searchPath=(origin,goal,options)=>{
        assert.equal(options.maxOps,1000);assert.equal(goal.range,0);
        const id=origin.id.replace(/^renamed-/,''),tables=w.tick===1?[initial]:[corridor,initial];
        const points=goal.pos.id==='east'?tables.map(table=>table[id]).find(p=>p?.some(c=>same(c,origin))):null;
        const i=points?.findIndex(p=>same(p,origin))??-1;
        let path=i>=0?points.slice(i+1).map(point):[];
        const suppliedPartial=compliantPartialRefresh&&w.tick===2&&origin.id==='bow2'&&same(origin,{x:25,y:21})&&
            goal.pos.id==='east'&&same(goal.pos,{x:44,y:20})&&JSON.stringify(snapshot())===JSON.stringify(declared);
        if(suppliedPartial){path=w.partialRefresh.response.path.map(point);w.partialRefresh.uses.push({tick:w.tick,actorId:origin.id});}
        if(path.some(p=>options.costMatrix.get(p.x,p.y)===255))path=[];
        const result={path,incomplete:path.length===0,ops:100};
        w.requests.push({tick:w.tick,origin:point(origin),actorId:origin.id,goal:point(goal.pos),
            maxOps:options.maxOps,range:goal.range,matrix:options.costMatrix,result,
            ...(suppliedPartial?{suppliedPartial:true}: {})});
        return w.suppliedResult?w.suppliedResult(result,{origin,goal,options}):result;
    };
    const step=w.step;w.step=tick=>{w.joint=null;w.jointContext=null;w.prepared=null;w.prepareInput=null;return step(tick);};
    return w;
}
