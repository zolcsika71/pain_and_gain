// Historical payload readers live only in this explicitly selected entry point.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectFlag, selectSecondaryObjective as select} from '../../src/strategy/objectives.js';

const fromSnapshot=s=>({tick:s.tick,observationComplete:true,centreId:s.selectedFlagId,
    flags:s.flags.map(f=>({...f,my:f.owner==='me'?true:f.owner==='enemy'?false:undefined})),
    myCreeps:s.creeps.filter(c=>c.my).map(body),enemies:s.creeps.filter(c=>!c.my).map(body),routes:[]});
function body(c){return{...c,body:Object.entries(c.activeBodyParts).flatMap(([type,n])=>Array.from({length:n},()=>({type,hits:100})))};}

test('reviewed scoring defeat is a counterexample to permanent centre fallback, not proof of a route',()=>{
    const recorded=JSON.parse(fs.readFileSync(new URL('../fixtures/secondary-army-window.json',import.meta.url)));
    const w=fromSnapshot(recorded.start);w.squad={id:'C',memberIds:recorded.group.memberIds};
    assert.equal(selectFlag(w.flags).id,w.centreId);assert.equal(w.flags[0].my,true);
    // C contains the only healer within centre range3: this new defence gate
    // rejects C even before missing Arena route reports are considered.
    assert.equal(select(w).objectiveId,w.centreId);assert.equal(select(w).reason,'defence-unavailable');
    assert.equal(recorded.start.tick,39);assert(w.myCreeps.every(c=>c.hits===c.hitsMax));
});

test('reviewed elimination while leading is a counterexample to unconditional territorial departure',()=>{
    const recorded=JSON.parse(fs.readFileSync(new URL('../fixtures/ranged-spillover-tick43.json',import.meta.url)));
    assert.equal(recorded.provenance.replayId,'6ad152e374ae4378a665afb2');
    const w=fromSnapshot(recorded.snapshot);
    // Generated group binding for this guard test, NOT historical squad membership.
    w.squad={id:'guard-counterexample',memberIds:w.myCreeps.filter(c=>c.fatigue===0&&c.body.some(p=>p.type==='move')&&
        c.body.some(p=>['attack','ranged_attack','heal'].includes(p.type))).slice(0,4).map(c=>c.id)};
    assert(w.myCreeps.some(c=>c.hits<c.hitsMax));const result=select(w);
    assert.equal(result.reason,'army-injured');assert.equal(result.objectiveId,w.centreId);
});
