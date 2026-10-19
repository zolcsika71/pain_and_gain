// TEST ONLY: fixed generated proposals + explicitly supplied outcomes, not a
// pathfinder, engine/arbitration simulator, or counterfactual replay trajectory.
import assert from 'node:assert/strict';
import {progressTieWorld} from './objective-progress-tie-world.js';
import {presetFixture, range} from './secondary-generated-world.js';
import {selectProgressTie} from './objective-progress-tie-candidate.js';
import {selectOpeningObjective, secondaryObjectiveLimits} from '../../src/strategy/objectives.js';
import {secondaryStepSupport, selectSecondaryTravelSteps} from '../../src/strategy/supported-contest.js';
import {prepareSecondaryMovement, moveCreeps, executeTactics} from '../../src/arena/execute.js';

const point=c=>({x:c.x,y:c.y});
const admitted=moves=>[...moves].filter(([,p])=>p).map(([id])=>id).sort();
const positions=w=>w.myCreeps.map(c=>({id:c.id,...point(c)}));

function scene({scenario,rename=false,reverse=false,mirror=false}) {
    const w=presetFixture(),small=progressTieWorld();
    const roles=['healer','frontA','rear','frontB'];
    const oldIds=[...w.squad.memberIds],mapping=new Map(roles.map((r,i)=>[r,oldIds[i]]));
    for(let i=0;i<4;i++){
        const c=w.myCreeps.find(c=>c.id===oldIds[i]),v=small.friends[i];
        Object.assign(c,point(v),{body:[...structuredClone(v.body),{type:'move',hits:100}]});
    }
    const target=w.flags.find(f=>f.id==='east');Object.assign(target,small.target);
    w.flags.find(f=>f.id===w.centreId).my=undefined;
    if(scenario==='exact-tie')w.myCreeps.find(c=>c.id===mapping.get('rear')).y=22;
    if(scenario==='one-step')Object.assign(w.myCreeps.find(c=>c.id==='scout1'),{x:15,y:21});
    const transform=p=>mirror?{x:99-p.x,y:99-p.y}:{...p};
    const renameId=id=>rename?`unit-${[...id].reverse().join('')}`:id;
    for(const c of [...w.myCreeps,...w.enemies]){c.id=renameId(c.id);Object.assign(c,transform(c));}
    for(const f of w.flags)Object.assign(f,transform(f));
    w.squad.memberIds=w.squad.memberIds.map(renameId);
    const roleIds=new Map([...mapping].map(([role,id])=>[role,renameId(id)]));
    if(reverse){w.myCreeps.reverse();w.enemies.reverse();w.squad.memberIds.reverse();w.flags.reverse();}
    const actor=role=>w.myCreeps.find(c=>c.id===roleIds.get(role));
    const canonical=c=>mirror?{x:99-c.x,y:99-c.y}:point(c);
    // Fixed supplied waypoint table, suffix selected only by observed position.
    // No adapting proposals to selector choice, returns, or an intended move.
    function proposals(){
        const h=canonical(actor('healer')),r=canonical(actor('rear'));
        const hp=h.x===14?{x:15,y:22}:h.y===22?{x:15,y:21}:{x:15,y:20};
        let rp;
        if(scenario==='cycle')rp=r.x===16?{x:15,y:22}:{x:16,y:23};
        else if(scenario==='exact-tie')rp={x:15,y:22};
        else rp=r.x===16?{x:15,y:22}:r.y===22?{x:15,y:21}:
            r.y===21?{x:15,y:20}:r.y===20?{x:15,y:19}:null;
        const entries=[['healer',hp],['frontA',{x:13,y:20}],['rear',rp],['frontB',{x:13,y:20}]];
        return new Map(entries.map(([role,p])=>[roleIds.get(role),p?transform(p):null]));
    }
    return {w,target,roleIds,actor,proposals};
}

// Supplied complete route reports solely for the existing production admission
// and lifecycle selector. Explicit generated first nodes + diagonal suffixes;
// not a search/terrain-quality test. No API search is called by this harness.
function reports(w,target,steps,tick){
    return w.squad.memberIds.map(id=>{
        const c=w.myCreeps.find(c=>c.id===id),path=[],first=steps.get(id);
        let p=point(c);
        if(first){path.push({...first});p={...first};}
        while(p.x!==target.x||p.y!==target.y){
            p={x:p.x+Math.sign(target.x-p.x),y:p.y+Math.sign(target.y-p.y)};
            path.push(p);assert(path.length<=40);
        }
        return {actorId:id,flagId:target.id,tick,from:point(c),path,incomplete:false,ops:10};
    });
}

function prove(w,moves){
    const ids=w.squad.memberIds,moving=admitted(moves),all=[...w.myCreeps,...w.enemies];
    assert(secondaryStepSupport(w.myCreeps,ids,moves));
    const cells=moving.map(id=>moves.get(id));
    assert.equal(new Set(cells.map(p=>`${p.x},${p.y}`)).size,cells.length);
    for(const id of moving){
        const p=moves.get(id),c=w.myCreeps.find(c=>c.id===id);assert.equal(range(c,p),1);
        assert(!all.some(c=>c.x===p.x&&c.y===p.y));
    }
    for(let mask=0;mask<2**moving.length;mask++){
        const supplied=w.myCreeps.map(c=>({...c,...(moving.includes(c.id)&&mask&(1<<moving.indexOf(c.id))?moves.get(c.id):{})}));
        assert.equal(new Set(supplied.map(c=>`${c.x},${c.y}`)).size,supplied.length);
        assert(secondaryStepSupport(supplied,ids,new Map(ids.map(id=>[id,null]))));
    }
    return {moving:moving.length,outcomes:2**moving.length,supported:true,exclusive:true};
}

function rollout(rule,options){
    const {w,target,roleIds,actor,proposals}=scene(options),trace=[];
    let state=null;const limit=options.maxTicks??
        (options.scenario==='progress'&&(!options.outcome||options.outcome==='success')?4:65);
    for(let tick=1;tick<=limit;tick++){
        const steps=proposals(),all=[...w.myCreeps,...w.enemies],commands=[],decisions=[];
        const outcome=(id)=>{
            const mode=options.outcome??'success';
            if(mode==='healer-still'&&id===roleIds.get('healer'))return{returnCode:0,displaced:false};
            if(id!==roleIds.get('rear'))return{returnCode:0,displaced:true};
            if(mode==='rejected')return{returnCode:-11,displaced:false};
            if(mode==='unknown')return{returnCode:undefined,displaced:false};
            if(mode==='accepted-still')return{returnCode:0,displaced:false};
            if(mode==='delayed'&&tick<3)return{returnCode:-11,displaced:false};
            return{returnCode:0,displaced:true};
        };
        for(const c of all){
            c.getRangeTo=p=>range(c,p);
            c.move=direction=>{const o=outcome(c.id);commands.push({actorId:c.id,method:'move',direction,
                returnCode:o.returnCode??null,returnKind:o.returnCode===undefined?'unknown':'numeric',
                requested:{...steps.get(c.id)},suppliedDisplacement:o.displaced});return o.returnCode;};
            for(const method of ['moveTo','attack','rangedAttack','heal','rangedHeal'])c[method]=()=>0;
        }
        const lifecycle=selectOpeningObjective({...w,tick,routes:reports(w,target,steps,tick)},state);
        const retained=w.myCreeps.filter(c=>!w.squad.memberIds.includes(c.id));
        const weapons=retained.filter(c=>c.body.some(p=>p.hits>0&&['attack','ranged_attack'].includes(p.type)));
        const healers=retained.filter(c=>c.body.some(p=>p.hits>0&&p.type==='heal'));
        assert.equal(weapons.length,6);assert.equal(healers.length,2);
        assert(retained.every(c=>c.hits===c.hitsMax));
        assert(weapons.every(c=>healers.some(h=>range(c,h)<=3)));
        assert(healers.every(h=>weapons.filter(c=>range(c,h)<=3).length>=2));
        state=lifecycle.state;
        assert(['selected','retained','no-displacement','timeout'].includes(lifecycle.reason),
            `${rule}/${options.scenario}/tick${tick}: ${lifecycle.reason}`);
        const row={tick,positions:positions(w),proposals:[...steps],phase:state.phase,reason:lifecycle.reason,
            startedAt:state.startedAt,unchanged:state.unchanged,commands,decisions,searchQueries:0,
            suppliedRouteReports:4,reportedOps:40};
        trace.push(row);
        if(state.phase==='finished')break;
        const spacing={creeps:all,terrainAt:()=>0},secondary={movement:{kind:'capture',memberIds:w.squad.memberIds,steps},
            cancel:reason=>{throw Error(reason);}};
        const prepared=prepareSecondaryMovement(secondary,w.myCreeps,w.enemies,
            w.flags.find(f=>f.id===w.centreId),new Map(),null,null,spacing);
        assert(prepared.moves);
        const baseline=selectSecondaryTravelSteps(w.myCreeps,w.squad.memberIds,steps,all);
        const candidate=selectProgressTie(w.myCreeps,w.squad.memberIds,steps,all,target);
        // Paired shadow decisions see byte-equivalent observed positions, target
        // and proposals; the two rollouts share the same supplied outcome law.
        row.shadow={baseline:[...baseline.moves],candidate:[...candidate.moves]};
        assert.deepEqual([...prepared.moves],[...baseline.moves]);
        assert(candidate.examined<=16&&baseline.examined<=16);
        row.support={baseline:prove(w,baseline.moves),candidate:prove(w,candidate.moves)};
        const chosen=rule==='baseline'?baseline:candidate;
        row.admitted=[...chosen.moves];
        const h=actor('healer'),hp=steps.get(h.id);
        row.healerAlternativeSafe=!!hp&&!all.some(c=>c.x===hp.x&&c.y===hp.y)&&
            secondaryStepSupport(w.myCreeps,w.squad.memberIds,
                new Map(w.squad.memberIds.map(id=>[id,id===h.id?hp:null])));
        const reporter={decision:d=>{decisions.push(d);return d;},attempt:()=>{}};
        const before=JSON.stringify(positions(w));
        moveCreeps(w.myCreeps,w.enemies,w.flags.find(f=>f.id===w.centreId),new Map(),
            new Map(),null,null,reporter,false,null,spacing,null,chosen.moves,'capture');
        executeTactics(w.myCreeps,w.enemies,[],reporter);
        assert.equal(JSON.stringify(positions(w)),before);
        assert(commands.length<=4);assert.equal(new Set(commands.map(c=>c.actorId)).size,commands.length);
        // Explicit next observation supplied independently of the return code.
        // No command accepts ownership of an engine effect in this fixture.
        for(const c of commands.filter(c=>c.suppliedDisplacement)){
            assert.equal(c.returnCode,0);Object.assign(w.myCreeps.find(a=>a.id===c.actorId),c.requested);
        }
        row.suppliedNextPositions=positions(w);
        assert.equal(new Set(all.map(c=>`${c.x},${c.y}`)).size,all.length);
    }
    return {rule,scenario:options.scenario,outcome:options.outcome??'success',roleIds:[...roleIds],trace,
        terminal:trace.at(-1),limits:{...secondaryObjectiveLimits},commands:trace.reduce((n,r)=>n+r.commands.length,0)};
}

export function compareProgressSequences(options={scenario:'progress'}) {
    return {baseline:rollout('baseline',options),candidate:rollout('candidate',options)};
}
