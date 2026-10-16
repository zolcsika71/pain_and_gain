// Shared GENERATED observations only: no Arena arbitration or damage resolver.
export const range=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function unit(id,x,y,parts,options={}){
    const c={id,x,y,my:true,exists:true,hits:100,hitsMax:100,fatigue:0,
        body:parts.map(type=>({type,hits:100})),calls:[],...options,getRangeTo(p){return range(this,p);}};
    for(const method of ['moveTo','heal','rangedHeal','attack','rangedAttack'])c[method]=p=>{
        c.calls.push({method,id:p.id??null,x:p.x,y:p.y});return 0;};
    c.move=direction=>{c.calls.push({method:'move',direction});return c.moveResult;};c.moveResult=0;
    return c;
}
export function world(){
    const r=unit('r',10,10,['ranged_attack','move'],{hits:40});
    const e=unit('e',8,10,['attack','move'],{my:false});
    const h=unit('h',10,12,['heal','move']);
    return{r,e,h,friends:[r,h],enemies:[e],flag:{id:'centre',x:20,y:20},owner:'ordinary',
        spacing:{creeps:[r,h,e],terrainAt:()=>0,reserved:new Set()}};
}
export function add(w,c){(c.my?w.friends:w.enemies).push(c);w.spacing.creeps.push(c);return c;}
