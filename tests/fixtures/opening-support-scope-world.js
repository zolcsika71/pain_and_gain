// Generated transport only. Shared production preflight/selection run directly;
// no support-scope resolver, source rewriting or duplicate policy remains.
const {congestedWorld}=await import('./opening-secondary-congested-world.js');
const {useGeneratedOpeningSearch}=await import('./opening-secondary-search-api.js');
const {centreWorld,centreFrame,supplySteps}=await import('./opening-centre-support-world.js');
export {supplySteps,centreWorld as ordinaryScopeWorld};
export function scopeWorld(){return useGeneratedOpeningSearch(congestedWorld());}
export function healerBoundaryWorld(){
    const w=centreWorld();
    // Generated range-three start, unchanged production birth membership.
    Object.assign(w.actor('bow1'),{x:28,y:19});Object.assign(w.actor('bow2'),{x:28,y:20});
    Object.assign(w.actor('guardR2'),{x:28,y:21});
    w.membership=null;w.bind();w.reports();return w;
}
export function scopeFrame(w,extra={}){
    return centreFrame(w,extra);
}
