// Pure, deterministic input recipe; expected reports are frozen by the published v2 export.
import {createHash} from 'node:crypto';
export const replayId='d'.repeat(24), date='2026-10-05T00:00:00.000Z';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const variants=['scale','metadata','frames','absent','empty','missing','mixed','malformed','utf8','nonarray','unsupported','summary','provenance','response','gap','conflict'];
export function recipe(helpers, variant='scale') {
    const metadata={game:{_id:'game',user:'user-b',users:[{_id:'user-a',username:'untrusted-a'},{_id:'user-b',username:'untrusted-b'}],codes:[{_id:'code-a',user:'user-a',version:1},{_id:'code-b',user:'user-b',version:1}],game:{usersCode:['code-a','code-b'],firstPlayerIndex:0}},ok:1};
    const frame=t=>({gameTime:t,objects:[],flags:[],ui:{version:1,items:[{id:'player1-score',name:'Score',value:2*t},{id:'player1-gain',name:'Gained this tick',value:2},{id:'player2-score',name:'Score',value:t},{id:'player2-gain',name:'Gained this tick',value:1}]}});
    const values=[metadata,Array.from({length:128},(_,j)=>frame(j+1)),Array.from({length:128},(_,j)=>frame(j+65)),Array.from({length:128},(_,j)=>frame(j+193))];
    if(variant==='unsupported')values[1][0].ui.version=99;
    if(variant==='gap')values[1].splice(1,1);
    if(variant==='conflict')values[2][0].ui.items[0].value++;
    const bodies=values.map(v=>Buffer.from(JSON.stringify(v)));
    if(variant==='malformed')bodies[1]=Buffer.from('{');
    if(variant==='utf8')bodies[1]=Buffer.from([0xff]);
    if(variant==='nonarray')bodies[1]=Buffer.from('{}');
    const files={},records=bodies.map((body,i)=>{
        const kind=i===0?'game-metadata':'replay-frames',requestedGameTime=[null,1,65,193][i];
        const requestUrl=`https://arena.screeps.com/api/game/${replayId}`+(i?`/replay/${requestedGameTime}`:''),sourceKey='1/0/'+requestUrl;
        const responseFingerprint=hash(body),fingerprint=helpers.scoreSourceFingerprint(sourceKey,body),outputPath=`replay-score-source-${replayId}-${fingerprint}.response`;
        const summary=helpers.validateScoreBody(kind,body,responseFingerprint);files[outputPath]=body;
        return {formatVersion:1,kind,replayId,requestedGameTime,sourceEntry:`synthetic-m2d-${i}`,sourceKey,requestUrl,cacheEntryFingerprint:hash(Buffer.concat([Buffer.from(`m2d-cache-${i}\0`),body])),responseFingerprint,fingerprint,outputPath,outputFingerprint:responseFingerprint,embeddedBuildId:null,mapId:null,coverage:summary.coverage,validation:summary.validation,importedAt:date,status:'claim',reviews:{},fixtureNote:'n'.repeat(65536)};
    });
    if(variant==='summary')records[1].validation.transport='changed';
    if(variant==='provenance')records[1].sourceKey='bad';
    if(variant==='response')records[1].responseFingerprint='a'.repeat(64);
    let selected=records.map(r=>r.fingerprint);
    if(variant==='metadata')selected=[selected[0]];
    if(variant==='frames')selected=selected.slice(1);
    if(variant==='missing')selected=['f'.repeat(64)];
    if(variant==='mixed')selected.push('f'.repeat(64));
    const manifest={version:2,maps:[],replays:[],records:[],scoreRecords:records,retiredScoreSources:[]};
    if(variant==='empty')manifest.scoreRecords=[];
    if(variant==='absent')delete manifest.scoreRecords;
    return {manifest,files,selected};
}
