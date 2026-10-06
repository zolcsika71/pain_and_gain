// Input only: never derive expected reports from candidate code.
import {createHash} from 'node:crypto';
import {scoreFrame,gameState,mapFixture,productionMetadata,actionDiagnostics,rawCoverage} from './replay-combined-analysis-m2e-definitions.js';
export const replayId='b'.repeat(24),buildId='a'.repeat(64),date='2026-10-06T00:00:00.000Z';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const variants=['scale','metadata','frames','absent','empty','missing','mixed','reverse-request','log-subset',
    'malformed','utf8','nonarray','unsupported','numeric','summary','provenance','response','gap','overlap',
    'conflicting-overlap','unaligned','ambiguous','reverse-mapping','conflicting-mapping','legacy-build',
    'mixed-build','conflicting-build','diagnostic-conflict','legacy-diagnostics','cpu-diagnostics'];
export function recipe(helpers,variant='scale') {
    let frames=[scoreFrame(1,[10,1,8,1]),scoreFrame(2,[11,1,9,1])];
    let games=frames.map((frame,i)=>gameState(i+2,frame,'player1',buildId));
    let diagnostics=[2,3].flatMap(tick=>actionDiagnostics(tick,'p1'));
    const metadata=productionMetadata(variant==='reverse-mapping'?'user-b':'user-a');
    if(variant==='reverse-mapping')games=frames.map((frame,i)=>gameState(i+2,frame,'player2',buildId));
    if(variant==='conflicting-mapping')metadata.game.user='user-b';
    if(variant==='unaligned')frames[1].objects[0].x+=50;
    if(variant==='ambiguous')games.push(...frames.map((frame,i)=>gameState(i+12,frame,'player1',buildId)));
    if(variant==='gap')frames[1].gameTime=3;
    if(variant==='unsupported')frames[0].ui.version=99;
    if(variant==='legacy-diagnostics')diagnostics=[];
    if(variant==='cpu-diagnostics')diagnostics=[2,3].flatMap(tick=>{
        const all=actionDiagnostics(tick,'p1'),closure=all.pop();
        all.push({type:'runtime-cpu',formatVersion:1,buildId,tick,sequence:4,recordId:`${tick}:4`,phase:'after-actions',elapsedNs:10,limitNs:100,limitKind:'ordinary-tick',unit:'nanoseconds'});
        closure.formatVersion=2;closure.sequence=5;closure.recordId=`${tick}:5`;closure.lastSequence=4;closure.recordCount=5;closure.coveredTypes.push('runtime-cpu');closure.counts['runtime-cpu']=1;
        return [...all,closure];
    });
    if(variant==='diagnostic-conflict')diagnostics.push({...diagnostics[0],reason:'combat-approach'});
    const payload=mapFixture(),mapId=helpers.mapChecksum(payload),mapFile='pain_and_gain_map_2026-10-06T00-00-00-000Z.json';
    const map={id:mapId,checksum:mapId,file:mapFile,status:'validated',registeredAt:date};
    const replay={replayId,mapId,buildId,status:'active',associatedAt:date,retiredFingerprints:[]};
    const files={[mapFile]:Buffer.from(helpers.canonical({...payload,checksum:mapId})+'\n')};
    const records=[0,1].map(i=>{
        const fingerprint=i.toString(16).padStart(64,'0'),outputPath=i===0?`${replayId}-${fingerprint}.jsonl`:null;
        let entries=i===0?games:[];
        let recordBuild=buildId;
        if(variant==='legacy-build' || (variant==='mixed-build' && i===0))recordBuild=null;
        if(variant==='conflicting-build' && i===1)recordBuild='c'.repeat(64);
        if(['mixed-build','conflicting-build'].includes(variant) && i===1)entries=[gameState(3,frames[1],'player1',recordBuild)];
        entries=entries.map(e=>{const copy={...e};if(recordBuild===null)delete copy.buildId;else copy.buildId=recordBuild;return copy;});
        const actualOutput=entries.length?`${replayId}-${fingerprint}.jsonl`:outputPath;
        const lines=entries.map(e=>JSON.stringify(e));if(actualOutput)files[actualOutput]=Buffer.from(lines.join('\n')+'\n');
        const typed=i===1?diagnostics.map(e=>({...e,...(recordBuild===null?{buildId:null}:{buildId:recordBuild})})):[];
        const otherEntries=Array.from({length:1024},(_,j)=>j<typed.length?{key:String(j),raw:JSON.stringify(typed[j]),type:typed[j].type,formatVersion:typed[j].formatVersion}:{key:String(j),raw:'x'.repeat(128),type:'other'});
        return {replayId,requestedTick:i+2,sourceEntry:`synthetic-m2e-log-${i}`,sourceKey:`1/0/https://arena.screeps.com/api/game/${replayId}/log/${i+2}`,fingerprint,outputPath:actualOutput,outputFingerprint:actualOutput?hash(files[actualOutput]):null,mapId,mapChecksum:mapId,mapFile,buildId:recordBuild,importedAt:date,status:'claim',coverage:rawCoverage(entries),diagnosticCoverage:helpers.summarizeDiagnosticCoverage(lines,typed.map((entry,j)=>({entry,key:String(j)}))),otherEntries,reviews:{}};
    });
    const bodies=[Buffer.from(JSON.stringify(metadata)),Buffer.from(JSON.stringify(frames))];
    if(variant==='malformed')bodies[1]=Buffer.from('{');
    if(variant==='utf8')bodies[1]=Buffer.from([0xff]);
    if(variant==='nonarray')bodies[1]=Buffer.from('{}');
    if(variant==='numeric')bodies[1]=Buffer.from(JSON.stringify(frames).replace('"value":10','"value":1e400').replace('"value":8','"value":1e-400').replace('"value":11','"value":-0').replace('"value":9','"value":9007199254740993'));
    if(['overlap','conflicting-overlap'].includes(variant)){
        const extra=structuredClone(frames);if(variant==='conflicting-overlap')extra[0].ui.items[0].value++;
        bodies.push(Buffer.from(JSON.stringify(extra)));
    }
    const scoreRecords=bodies.map((body,i)=>{
        const kind=i===0?'game-metadata':'replay-frames',requestedGameTime=i===0?null:i;
        const requestUrl=`https://arena.screeps.com/api/game/${replayId}`+(i?`/replay/${requestedGameTime}`:''),sourceKey='1/0/'+requestUrl;
        const responseFingerprint=hash(body),fingerprint=helpers.scoreSourceFingerprint(sourceKey,body),outputPath=`replay-score-source-${replayId}-${fingerprint}.response`;
        const summary=helpers.validateScoreBody(kind,body,responseFingerprint);files[outputPath]=body;
        return {formatVersion:1,kind,replayId,requestedGameTime,sourceEntry:`synthetic-m2e-score-${i}`,sourceKey,requestUrl,cacheEntryFingerprint:hash(Buffer.concat([Buffer.from(`m2e-cache-${i}\0`),body])),responseFingerprint,fingerprint,outputPath,outputFingerprint:responseFingerprint,embeddedBuildId:null,mapId:null,coverage:summary.coverage,validation:summary.validation,importedAt:date,status:'claim',reviews:{},fixtureNote:'n'.repeat(65536)};
    });
    if(variant==='summary')scoreRecords[1].validation.transport='changed';
    if(variant==='provenance')scoreRecords[1].sourceKey='bad';
    if(variant==='response')scoreRecords[1].responseFingerprint='a'.repeat(64);
    let fingerprints=records.map(r=>r.fingerprint),scoreFingerprints=scoreRecords.map(r=>r.fingerprint);
    if(variant==='metadata')scoreFingerprints=scoreFingerprints.slice(0,1);
    if(variant==='frames')scoreFingerprints=scoreFingerprints.slice(1);
    if(variant==='missing')scoreFingerprints=['f'.repeat(64)];
    if(variant==='mixed')scoreFingerprints.push('f'.repeat(64));
    if(variant==='reverse-request'){fingerprints.reverse();scoreFingerprints.reverse();}
    if(variant==='log-subset')fingerprints=fingerprints.slice(0,1);
    const manifest={version:2,maps:[map],replays:[replay],records,scoreRecords,retiredScoreSources:[]};
    if(variant==='empty')manifest.scoreRecords=[];
    if(variant==='absent')delete manifest.scoreRecords;
    return {manifest,files,fingerprints,scoreFingerprints};
}

// Physical sidecar content is fixed independently of store IDs/paths.
export function payloads(record,collection) {
    if(collection==='score')return ['validation','fixtureNote'].map(name=>({pointer:'/'+name,role:name==='validation'?'summaries':'extensions',parentPointer:null,items:null,content:Buffer.from(JSON.stringify(record[name]))}));
    return [{pointer:'/otherEntries',role:'diagnostics',parentPointer:null,items:record.otherEntries.length,
        content:Buffer.from(record.otherEntries.map((wrapper,j)=>JSON.stringify(j===512?{ordinal:j,wrapperRef:'/otherEntries/overflow'}:{ordinal:j,wrapper})+'\n').join(''))},
    {pointer:'/otherEntries/overflow',role:'extensions',parentPointer:'/otherEntries',items:null,content:Buffer.from(JSON.stringify(record.otherEntries[512]))}];
}
