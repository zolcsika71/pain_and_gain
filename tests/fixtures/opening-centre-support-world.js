import assert from 'node:assert/strict';
import {openingWorld} from './opening-secondary-generated-world.js';
import {useGeneratedOpeningSearch} from './opening-secondary-search-api.js';
import {withCentreSupport} from './opening-centre-support-candidate.js';
import {range} from './secondary-generated-world.js';

export function centreWorld(){return useGeneratedOpeningSearch(openingWorld());}
export function centreFrame(w,{candidate=true,...extra}={}){
    const mission=w.plan(extra);
    const plan=candidate?withCentreSupport(w,mission,extra):mission;
    const executed=w.execute(plan,{...extra,tacticalObservation:{...w,creeps:w.spacing.creeps}});
    return{mission,plan,...executed};
}

// Explicit generated observation INPUT, not engine arbitration. Only previously
// commanded adjacent destinations that were empty may be supplied as successes.
// Commands themselves (including return0) never mutate the world.
export function supplySteps(w,frame,successfulIds=null){
    const commands=frame.calls.filter(c=>c.method==='move'&&(!successfulIds||successfulIds.includes(c.id)));
    for(const c of commands){
        assert.equal(range(w.actor(c.id),c),1);
        assert(!w.spacing.creeps.some(p=>p.hits>0&&p.x===c.x&&p.y===c.y));
        assert(frame.plan.moves.get(c.id));
    }
    assert.equal(new Set(commands.map(c=>`${c.x},${c.y}`)).size,commands.length);
    for(const c of commands)Object.assign(w.actor(c.id),{x:c.x,y:c.y});
    w.tick++;w.bind();w.distinct();w.reports();
}

export function movement(calls){return calls.filter(c=>['move','moveTo'].includes(c.method));}
export function tactical(calls){return calls.filter(c=>!['move','moveTo'].includes(c.method));}
