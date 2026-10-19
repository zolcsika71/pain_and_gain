// Generated-only Arena transport. Fixed API response tables; no pathfinder,
// replay reader, source rewriting or collision arbitration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import {openingWorld} from './opening-secondary-generated-world.js';
import {TestCostMatrix} from './arena-cost-matrix.js';

const configuration=fs.readFileSync(new URL('../../src/config.js',import.meta.url),'utf8');
const adoptionUrl=new URL('../../src/strategy/opening-route-adoption.js',import.meta.url).href;
const centreUrl=new URL('../../src/strategy/opening-centre-support.js',import.meta.url).href;
const probeUrl=new URL('../../src/debug/opening-route-probe.js',import.meta.url).href;
const openingUrl=new URL('../../src/strategy/opening-deployment.js',import.meta.url).href;
const configs=new Map();let instance=0;
const modules=new Map([
    ['game/utils','export const getObjectsByPrototype=p=>globalThis.__adoption.objects.get(p); export const getObjects=()=>globalThis.__adoption.spacing.creeps; export const getTicks=()=>globalThis.__adoption.tick; export const getTerrainAt=(...p)=>globalThis.__adoption.spacing.terrainAt(...p); export const getCpuTime=()=>1234;'],
    ['game','export const arenaInfo={cpuTimeLimit:20000000,cpuTimeLimitFirstTick:100000000};'],
    ['game/path-finder','export const searchPath=(...a)=>globalThis.__adoption.searchPath(...a); export class CostMatrix {constructor(){const w=globalThis.__adoption; w.matrices++; if(w.matrixThrow)throw Error("controlled"); return new w.Matrix();}}'],
    ['game/constants','export const EFF_ATTACK_MODIFIER="eff_attack_modifier";'],
    ['game/prototypes','export class Creep {}'],
    ['arena/season_4/pain_and_gain/basic','export class ScoreFlag {}'],
]);
registerHooks({resolve(s,c,next){
    let code=modules.get(s);
    if(s==='./config.js'&&c.parentURL?.includes('/src/loop.js'))code=configs.get(c.parentURL);
    if(s==='./strategy/opening-route-adoption.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `import {captureOpeningRouteAdoption as capture} from ${JSON.stringify(adoptionUrl)}; export function captureOpeningRouteAdoption(a){const w=globalThis.__adoption;w.comparisonEvaluations++;const r=capture(a);w.captured=a;w.capturedState=JSON.stringify(a.mission.state);w.capturedMoves=JSON.stringify([...a.moves]);const finish=r.finish;r.finish=(p)=>w.comparison=finish(p);return r;}`;
    if(s==='./strategy/opening-centre-support.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `import {planCentreSupport as plan} from ${JSON.stringify(centreUrl)}; export function planCentreSupport(a){const w=globalThis.__adoption;w.centreEvaluations++;return w.centrePlan=plan(a);}`;
    if(s==='./strategy/opening-deployment.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `export {openingDeploymentDiagnostic} from ${JSON.stringify(openingUrl)}; import {planOpeningDeployment as plan} from ${JSON.stringify(openingUrl)}; export function planOpeningDeployment(...a){return globalThis.__adoption.livePlan=plan(...a);}`;
    if(s==='./debug/opening-route-probe.js'&&c.parentURL?.includes('/src/loop.js'))code=
        `export {resetOpeningRouteProbe} from ${JSON.stringify(probeUrl)}; import {probeOpeningRoute as probe} from ${JSON.stringify(probeUrl)}; export function probeOpeningRoute(a){const w=globalThis.__adoption;w.probeArgs=a;return w.probe=probe(a);}`;
    return code?{url:`data:text/javascript,${encodeURIComponent(code)}`,shortCircuit:true}:next(s,c);
}});
const {Creep}=await import('game/prototypes'),{ScoreFlag}=await import('arena/season_4/pain_and_gain/basic');
const row=(a,b,y)=>Array.from({length:b-a+1},(_,i)=>({x:a+i,y}));
const same=(a,b)=>a.x===b.x&&a.y===b.y,point=p=>({x:p.x,y:p.y});
export const serialize=v=>JSON.stringify(v,(_,x)=>x instanceof Map?[...x]:x instanceof Set?[...x]:x);
export const moveCalls=w=>w.calls.filter(c=>c.method==='move');
export const tacticalCalls=w=>w.calls.filter(c=>!['move','moveTo'].includes(c.method));

export async function adoptionFlow(t,{adoption=true,probe=true,opening=true,mode='improve',rename=false,configure=null}={}){
    const w=openingWorld();
    for(const [id,y]of [['medic',20],['bow1',19],['bow2',21],['guardR2',22]])Object.assign(w.actor(id),{x:25,y});
    configure?.(w);
    w.membership=null;w.bind();
    for(const c of w.spacing.creeps)Object.setPrototypeOf(c,Creep.prototype);
    for(const f of w.flags)Object.setPrototypeOf(f,ScoreFlag.prototype);
    w.objects=new Map([[Creep,w.spacing.creeps],[ScoreFlag,w.flags]]);
    w.logs=[];w.requests=[];w.matrices=0;w.Matrix=TestCostMatrix;w.centreEvaluations=0;w.comparisonEvaluations=0;
    w.mode=mode;
    const end=(y)=>[...row(26,44,y),...Array.from({length:Math.abs(y-20)},(_,i)=>({x:44,y:y+Math.sign(20-y)*(i+1)}))];
    const declared={medic:[point(w.actor('medic')),...end(19)],bow1:[point(w.actor('bow1')),...end(20)],
        bow2:[point(w.actor('bow2')),...end(20)],guardR2:[point(w.actor('guardR2')),...end(21)]};
    const alternatives={bow1:[point(w.actor('bow1')),...end(18)]};
    if(mode==='no-conflict')declared.bow1=[point(w.actor('bow1')),...end(18)];
    if(rename){
        for(const c of w.spacing.creeps)c.id='renamed-'+c.id;
        const actor=w.actor;w.actor=id=>actor(id.startsWith('renamed-')?id:'renamed-'+id);
        w.membership=null;w.bind();
    }
    w.searchPath=(origin,goal,options)=>{
        const diagnostic=origin.id===undefined;
        const request={tick:w.tick,diagnostic,origin:point(origin),goal:{...goal.pos},range:goal.range,maxOps:options.maxOps,matrix:options.costMatrix};
        w.requests.push(request);assert.equal(options.maxOps,1000);assert.equal(goal.range,0);
        if(diagnostic){assert.equal(w.calls.length,0);assert.equal(w.probeArgs.state.spent,true);}
        let path=[];
        if(diagnostic){
            const extra=options.costMatrix.get(26,20)===255;
            const y=w.mode==='equal'?(extra?19:20):w.mode==='baseline-superior'?18:extra?18:20;
            path=end(y);
            if(w.returnResult)request.result=w.returnResult({extra,path,request});
            else request.result={path,incomplete:false,ops:extra?105:91};
            w.afterSearch?.({extra,request});
        }else{
            if(goal.pos.id==='east'){
                const id=rename?origin.id.slice('renamed-'.length):origin.id;
                const possibilities=[declared[id],alternatives[id]].filter(Boolean);
                const points=possibilities.find(p=>p.some(c=>same(c,origin)));
                if(points)path=points.slice(points.findIndex(c=>same(c,origin))+1);
            }
            request.result={path,incomplete:!path.length,ops:100};
        }
        const r=request.result;
        if(Array.isArray(r?.path)&&r.path.some(p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&options.costMatrix.get(p.x,p.y)===255)){
            // No detour is manufactured when a declared table crosses occupancy.
            request.result={path:[],incomplete:true,ops:r.ops};
        }
        return request.result;
    };
    let config=configuration;
    for(const [name,value]of Object.entries({openingDeploymentExperiment:opening,openingRouteProbeExperiment:probe,openingRouteAdoptionExperiment:adoption})){
        if(!config.includes(`const ${name} =`))config+=`\nexport const ${name} = ${value};\n`;
        else config=config.replace(`${name} = false`,`${name} = ${value}`);
    }
    const url=new URL(`../../src/loop.js?adoption-${instance++}`,import.meta.url).href;
    configs.set(url,config);globalThis.__adoption=w;w.loop=await import(url);
    t.mock.method(console,'log',s=>w.logs.push(JSON.parse(s)));
    w.step=tick=>{
        globalThis.__adoption=w;w.tick=tick;w.bind();w.calls=[];w.logs=[];w.loop.runTick();
        w.membership=w.loop.getMembershipState();w.game=w.logs.find(r=>r.type==='game-state');w.d=w.game.secondaryObjective;
        if(w.d)assert(JSON.stringify(w.d).length<2700);
        for(const c of w.myCreeps)assert(w.calls.filter(a=>a.id===c.id&&['move','moveTo'].includes(a.method)).length<=1);
        assert((w.d?.queries??0)+(w.d?.routeProbe?.queries??0)<=(tick===1?24:4));
        return w.d;
    };
    w.observe=(selected=moveCalls(w))=>{
        for(const c of selected){const actor=w.actor(c.id);assert.equal(Math.max(Math.abs(c.x-actor.x),Math.abs(c.y-actor.y)),1);
            assert(!w.spacing.creeps.some(a=>a.hits>0&&same(a,c)));}
        assert.equal(new Set(selected.map(c=>`${c.x},${c.y}`)).size,selected.length);
        for(const c of selected)Object.assign(w.actor(c.id),point(c));w.distinct();
    };
    return w;
}
