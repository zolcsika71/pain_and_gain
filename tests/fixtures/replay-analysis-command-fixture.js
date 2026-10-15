import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {makeFixture as log,inventory} from './replay-analysis-m2c-store.js';
import {makeFixture as score} from './replay-score-analysis-m2d-store.js';
import {makeFixture as combined} from './replay-combined-analysis-m2e-store.js';
export {inventory};
export async function fixture(t,kind,variant='scale',options={}){
    // Explicitly small: never forward count/large knobs from qualification helpers.
    const f=await ({log,score,combined}[kind])(1,variant,{transform:options.transform});
    t.after(()=>f.h.close());t.diagnostic(JSON.stringify({root:f.root,synthetic:true,retained:true,kind,variant}));
    const v2=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pain-gain-analysis-v2-fixture-'));fs.writeFileSync(path.join(v2,'.synthetic-analysis-fixture'),'synthetic\n');fs.mkdirSync(path.join(v2,'replay_logs'));
    fs.writeFileSync(path.join(v2,'replay_logs','manifest.json'),JSON.stringify(f.data.manifest));for(const[name,bytes]of Object.entries(f.data.files))fs.writeFileSync(path.join(v2,'replay_logs',name),bytes);
    t.diagnostic(JSON.stringify({root:v2,synthetic:true,retained:true,kind:'v2'}));
    const q={synthetic:true,root:f.root,replayId:f.options.replayId,...(kind==='score'?{scoreFingerprints:f.options.scoreFingerprints}:{fingerprints:f.options.fingerprints}),...(kind==='combined'?{scoreFingerprints:f.options.scoreFingerprints}:{})};
    return{...f,v2,q};
}
