// Generated observations only; no payload reads, terrain or engine simulation.
export function progressTieWorld() {
    const actor=(id,x,y,type)=>({id,x,y,hits:100,exists:true,body:[{type,hits:100}]});
    const friends=[actor('healer',14,23,'heal'),actor('frontA',13,21,'ranged_attack'),
        actor('rear',16,23,'ranged_attack'),actor('frontB',14,21,'ranged_attack')];
    return {friends,ids:friends.map(c=>c.id),all:friends,
        steps:new Map([['healer',{x:15,y:22}],['frontA',{x:13,y:20}],
            ['rear',{x:15,y:22}],['frontB',{x:13,y:20}]]),target:{x:10,y:0}};
}
