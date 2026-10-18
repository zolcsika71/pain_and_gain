// Unchanged generated analogue moved from opening-deployment-flow.test.js.
// No retained payload, replay reader or historical identity is imported.
import {openingWorld,adaptOpeningWorld} from './opening-secondary-generated-world.js';

export function congestedWorld(){
    const w=openingWorld(),p={guardH1:[9,11],guardM0:[10,11],guardM1:[10,12],guardM2:[9,12],
        guardH2:[14,6],blade:[15,7],guardR0:[15,6],guardR1:[14,7],medic:[14,11],
        bow1:[15,11],bow2:[14,12],guardR2:[15,12],scout1:[12,9],scout2:[9,6]};
    for(const c of w.myCreeps)Object.assign(c,{x:p[c.id][0],y:p[c.id][1]});
    Object.assign(w.centre,{x:49,y:49});Object.assign(w.flags.find(f=>f.id==='east'),{x:13,y:49});
    let n=0;for(const f of w.flags.filter(f=>!['centre','east'].includes(f.id)))Object.assign(f,{x:90+n++,y:5});
    w.membership=null;return adaptOpeningWorld(w,{targets:['east'],diagonal:true});
}
