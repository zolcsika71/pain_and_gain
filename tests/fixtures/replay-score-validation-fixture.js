// Independently generated transport; no downloaded bodies or frozen fixtures.
import {parseScoreCacheEntry} from '../../tools/replay-logs.js';
import {cacheFrame} from './replay-import-command-fixture.js';

export function validationFrames(bytes) {
    let frames=[];
    const parsed=()=>parseScoreCacheEntry(cacheFrame(frames,{collection:'score',time:2}));
    const size=()=>Buffer.byteLength(JSON.stringify(parsed().validation));
    const build=count=>Array.from({length:count},(_,gameTime)=>({gameTime,objects:[],flags:[],ui:{version:1,items:[
            {id:'player1-score',name:'Score',value:0},{id:'player1-gain',name:'Gained this tick',value:0},
            {id:'player2-score',name:'Score',value:0},{id:'player2-gain',name:'Gained this tick',value:0}]}}));
    let low=1,high=Math.ceil(bytes/500);
    while(low<high){const count=Math.ceil((low+high)/2);frames=build(count);if(size()<=bytes)low=count;else high=count-1;}
    frames=build(low);
    if(size()<bytes){let remaining=bytes-size();
        for(const frame of frames)for(const item of frame.ui.items){const extra=Math.min(15,remaining);if(extra){item.value=10**extra;remaining-=extra;}}
        if(remaining)throw Error('Synthetic target not representable');
    }
    if(size()!==bytes)throw Error('Synthetic validation byte mismatch');
    return frames;
}
