import {planCentreSupport} from '../../src/strategy/opening-centre-support.js';
export {planCentreSupport} from '../../src/strategy/opening-centre-support.js';

// Test-side ownership transport into ONE unchanged production executor pass.
// The policy itself is the shared inactive runtime implementation.
export function withCentreSupport(w,mission,extra={}){
    const centre=planCentreSupport({observation:w,membership:w.membership,mission,
        spacing:w.spacing,...extra});
    if(centre.moves)return{...mission,moves:new Map([...mission.moves,...centre.moves]),centre};
    if(centre.reason==='inactive')return{...mission,centre};
    const stopped=mission.cancel(`centre-${centre.reason}`);
    w.state=stopped.state;
    return{...stopped,moves:null,centre};
}
