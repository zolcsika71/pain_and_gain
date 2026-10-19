// Test-local module routing changes ONLY prepareSecondaryMovement's selector.
// The centre candidate imports the canonical production selector directly and
// stays byte-identical. Runtime source is neither rewritten nor edited.
import {registerHooks} from 'node:module';
import {setTravelRule,travelAlternatives} from './opening-travel-tie-candidate.js';
const production=new URL('../../src/strategy/supported-contest.js',import.meta.url).href;
const candidate=new URL('./opening-travel-tie-candidate.js',import.meta.url).href;
const executor=new URL('../../src/arena/execute.js',import.meta.url).href;
registerHooks({resolve(s,c,next){
    if(c.parentURL===executor&&s==='../strategy/supported-contest.js'){
        const code=`export {secondaryStepSupport} from ${JSON.stringify(production)}; export {selectOpeningTravelSteps as selectSecondaryTravelSteps} from ${JSON.stringify(candidate)};`;
        return{url:`data:text/javascript,${encodeURIComponent(code)}`,shortCircuit:true};
    }
    return next(s,c);
}});
const {congestedWorld}=await import('./opening-secondary-congested-world.js');
const {useGeneratedOpeningSearch}=await import('./opening-secondary-search-api.js');
const {centreFrame,supplySteps}=await import('./opening-centre-support-world.js');
export {supplySteps};
export function tieWorld(){return useGeneratedOpeningSearch(congestedWorld());}
export function tieFrame(w,rule='intersection',extra={}){
    setTravelRule(rule);
    const f=centreFrame(w,extra),ids=w.group().memberIds;
    const alternatives=f.mission.movement?travelAlternatives(w.myCreeps,ids,f.mission.movement.steps,w.spacing.creeps):null;
    return{...f,alternatives};
}
export function runTieSequence(rule,{observe=null,maxTicks=61,make=tieWorld}={}){
    const w=make(),frames=[];
    for(let i=0;i<maxTicks;i++){
        const f=tieFrame(w,rule);frames.push({tick:w.tick,positions:w.myCreeps.map(c=>({id:c.id,x:c.x,y:c.y})),
            diagnostic:f.plan.diagnostic,centre:f.plan.centre,secondary:[...f.mission.moves??[]],calls:f.calls,records:f.records,
            alternatives:f.alternatives?{bestSize:f.alternatives.bestSize,best:f.alternatives.best.map(s=>s.actors)}:null});
        if(f.plan.state.phase!=='active')break;
        supplySteps(w,f,observe?observe(w,f,i):null);
    }
    return{w,frames};
}
