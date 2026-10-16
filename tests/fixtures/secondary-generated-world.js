import assert from 'node:assert/strict';

// Reused generated observations; no replay, movement or outcome simulation.
const effect={centre:'eff_damage_taken_modifier',attack:'eff_attack_modifier',ranged:'eff_ranged_attack_modifier',heal:'eff_heal_modifier'};
const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function unit(id,x,y,parts,my=true){return{id,x,y,my,exists:true,hits:1000,hitsMax:1000,fatigue:0,
    body:Object.entries({move:8,...parts}).flatMap(([type,n])=>Array.from({length:n},()=>({type,hits:100})))};}
function fixture(){
    const flags=[['centre',40,40,'centre',5,true],['east',56,42,'attack',3,undefined],['west',24,42,'attack',3,false],
        ['north',40,18,'heal',4,false],['south',40,62,'heal',4,false],['near',20,40,'ranged',3,false],['far',68,40,'ranged',3,false]]
        .map(([id,x,y,type,scorePerTick,my])=>({id,x,y,effectType:effect[type],scorePerTick,my}));
    return{tick:50,observationComplete:true,centreId:'centre',flags,
        squad:{id:'A',memberIds:['medic','bow1','bow2','blade']},
        myCreeps:[unit('medic',41,43,{heal:6}),unit('bow1',41,42,{ranged_attack:6}),unit('bow2',42,43,{ranged_attack:6}),
            unit('blade',42,42,{attack:8}),unit('guard1',40,40,{attack:8}),unit('guard2',39,40,{ranged_attack:6}),unit('guardmedic',39,39,{heal:6})],
        enemies:[unit('foeM',90,90,{attack:8},false),unit('foeR',90,85,{ranged_attack:6},false),unit('foeH',85,90,{heal:6},false)],routes:[]};
}
// Independently generated route REPORTS, not a movement/terrain simulator.
// No promise that these paths are free, capture succeeds, or enemies stand still.
function reports(w,flags=w.flags.filter(f=>f.id!==w.centreId)){
    w.routes=[];for(const memberId of w.squad.memberIds)for(const flag of flags){
        const c=w.myCreeps.find(c=>c.id===memberId),path=[];let p={x:c.x,y:c.y};
        while(range(p,flag)>0){p={x:p.x+Math.sign(flag.x-p.x),y:p.y+Math.sign(flag.y-p.y)};path.push(p);assert(path.length<=40);}
        w.routes.push({actorId:c.id,flagId:flag.id,tick:w.tick,from:{x:c.x,y:c.y},path,incomplete:false,ops:path.length*10});
    }return w;
}
const only=(w,id)=>reports(w,[w.flags.find(f=>f.id===id)]);
// Generated full preset armies; no historical path or terrain reconstruction.
function presetFixture(){
    const w=fixture();
    const preset=(id,x,y,parts,my=true)=>{
        const c=unit(id,x,y,parts,my);c.hits=c.hitsMax=c.body.length*100;return c;
    };
    w.myCreeps=[preset('medic',41,43,{move:6,heal:6}),preset('bow1',41,42,{move:6,ranged_attack:6}),
        preset('bow2',42,43,{move:6,ranged_attack:6}),preset('blade',42,42,{move:8,attack:8}),
        ...[[39,40],[40,39],[39,39]].map(([x,y],i)=>preset(`guardM${i}`,x,y,{move:8,attack:8})),
        ...[[40,41],[39,41],[38,40]].map(([x,y],i)=>preset(`guardR${i}`,x,y,{move:6,ranged_attack:6})),
        preset('guardH1',39,42,{move:6,heal:6}),preset('guardH2',38,41,{move:6,heal:6}),
        preset('scout1',38,39,{move:1}),preset('scout2',38,38,{move:1})];
    w.enemies=w.myCreeps.map((c,i)=>({...structuredClone(c),id:`foe${i}`,my:false,x:88+i%4,y:88+Math.floor(i/4)}));
    return w;
}

/** @param {object} w
 * @param {{rename?:boolean, mirror?:boolean|'x'|'y', reverse?:boolean}} [options]
 */
function transform(w,{rename=false,mirror=false,reverse=false}={}){
    const a=structuredClone(w),renameId=s=>rename?`renamed-${[...s].reverse().join('')}`:s;
    const point=p=>{if(mirror){if(mirror!=='y')p.x=99-p.x;if(mirror!=='x')p.y=99-p.y;}};
    for(const c of [...a.myCreeps,...a.enemies]){c.id=renameId(c.id);point(c);}
    for(const f of a.flags)point(f);
    a.squad.memberIds=a.squad.memberIds.map(renameId);
    for(const r of a.routes){r.actorId=renameId(r.actorId);point(r.from);r.path.forEach(point);}
    if(reverse){a.flags.reverse();a.myCreeps.reverse();a.enemies.reverse();a.routes.reverse();a.squad.memberIds.reverse();}
    return a;
}

export { unit, fixture, reports, only, presetFixture, transform, range };
