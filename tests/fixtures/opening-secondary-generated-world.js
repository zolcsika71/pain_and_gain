import assert from 'node:assert/strict';
import {presetFixture,range} from './secondary-generated-world.js';
import {updateMembership} from '../../src/squads/membership.js';
import {moveCreeps,executeTactics} from '../../src/arena/execute.js';
import {planOpeningSecondary} from './opening-secondary-candidate.js';

// Generated role-separated birth geometry, not replay coordinates or terrain.
export function openingWorld(){
    const w=presetFixture();w.tick=1;w.observationComplete=true;w.calls=[];w.records=[];w.returns=new Map();
    const positions={guardH1:[10,10],guardM0:[11,9],guardM1:[11,10],guardM2:[11,11],
        guardH2:[18,15],blade:[19,14],guardR0:[19,15],guardR1:[19,16],
        medic:[25,20],bow1:[27,19],bow2:[27,20],guardR2:[27,21],scout1:[8,8],scout2:[8,9]};
    for(const c of w.myCreeps)Object.assign(c,{x:positions[c.id][0],y:positions[c.id][1]});
    w.flags.forEach(f=>{f.my=undefined;});Object.assign(w.flags.find(f=>f.id==='east'),{x:44,y:20});
    return adaptOpeningWorld(w);
}

// Attach production execution to supplied observations without changing birth
// geometry, roles, ownership or membership. Diagonal reports are GENERATED.
export function adaptOpeningWorld(w,{targets=['east'],diagonal=false}={}){
    w.calls=[];w.records=[];w.returns=new Map();
    w.centre=w.flags.find(f=>f.id===w.centreId);w.actor=id=>w.myCreeps.find(c=>c.id===id);
    const delta=[[0,0],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    for(const c of [...w.myCreeps,...w.enemies]){
        c.getRangeTo=function(p){return range(this,p);};
        c.move=function(direction){const[dx,dy]=delta[direction];w.calls.push({id:this.id,method:'move',
            x:this.x+dx,y:this.y+dy});return w.returns.has(this.id)?w.returns.get(this.id):0;};
        for(const method of ['moveTo','attack','rangedAttack','heal','rangedHeal'])c[method]=function(target){
            w.calls.push({id:this.id,method,target:target.id,x:target.x,y:target.y});return 0;};
        c.findPathTo=()=>{throw Error('No path searches in this supplied-report experiment');};
    }
    w.spacing={creeps:[...w.myCreeps,...w.enemies],terrainAt:()=>0};
    w.bind=()=>{w.membership=updateMembership(w.membership,{tick:w.tick,myCreeps:w.myCreeps});return w.membership;};
    w.bind();w.group=()=>w.membership.squads.find(s=>s.memberIds.every(id=>
        ['ranged','healer'].includes(w.membership.members.find(m=>m.id===id).role)));
    w.distinct=()=>assert.equal(new Set(w.spacing.creeps.map(c=>`${c.x},${c.y}`)).size,w.spacing.creeps.length);
    w.reports=(included=targets)=>{
        // Bounded SUPPLIED reports. No runtime search or collision resolution.
        w.routes=[];const group=w.group();if(!group)return;
        for(const f of w.flags.filter(f=>f.id!==w.centreId))for(const id of group.memberIds){
            if(w.state&&f.id!==w.state.selection?.targetId)continue;
            const c=w.actor(id),path=[];let p={x:c.x,y:c.y};
            if(included.includes(f.id)&&diagonal){
                while(p.x!==f.x||p.y!==f.y){p={x:p.x+Math.sign(f.x-p.x),y:p.y+Math.sign(f.y-p.y)};path.push(p);}
            }else if(included.includes(f.id)){
                while(p.x!==f.x){p={x:p.x+Math.sign(f.x-p.x),y:p.y};path.push(p);}
                while(p.y!==f.y){p={x:p.x,y:p.y+Math.sign(f.y-p.y)};path.push(p);}
            }
            w.routes.push({actorId:id,flagId:f.id,tick:w.tick,from:{x:c.x,y:c.y},path,
                incomplete:!included.includes(f.id),ops:100});
        }
    };
    w.plan=(extra={})=>{const result=planOpeningSecondary(w,w.membership,w.state??null,
        {spacing:w.spacing,...(w.searchPath?{searchPath:w.searchPath}:{}),...extra});w.state=result.state;return result;};
    w.execute=(plan=null,extra={})=>{
        w.calls=[];w.records=[];const reporter={decision:d=>{w.records.push(d);return d;},
            attempt:(d,i,a,rc)=>w.records.push({actorId:d.actorId,method:a.method,returnCode:rc??null})};
        moveCreeps(w.myCreeps,w.enemies,w.centre,extra.engagements??new Map(),new Map(),extra.escort??null,null,reporter,
            false,extra.pair??null,w.spacing,null,plan?.moves??null,'opening');
        executeTactics(w.myCreeps,w.enemies,w.myCreeps.filter(c=>c.hits<c.hitsMax),reporter,
            extra.tacticalObservation??null);
        return{calls:w.calls.map(c=>({...c})),records:[...w.records]};
    };
    w.next=(plan,successfulIds=[...plan.moves??[]].filter(([,p])=>p).map(([id])=>id))=>{
        for(const id of successfulIds){const step=plan.moves.get(id);assert(step);assert.equal(range(w.actor(id),step),1);
            assert(!w.spacing.creeps.some(c=>c.hits>0&&c.x===step.x&&c.y===step.y));}
        for(const id of successfulIds)Object.assign(w.actor(id),plan.moves.get(id));
        w.tick++;w.bind();w.distinct();w.reports();
    };
    w.distinct();w.reports();return w;
}
