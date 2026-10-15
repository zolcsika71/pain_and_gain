// Explicit synthetic v2 reader; existing production commands stay disconnected.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Scanner, fail, measureNative, CHUNK, TOKEN } from './replay-legacy-json.js';
import { writeOtherEntries } from './replay-other.js';
import { resident, withCleanup } from './retrieval-files.js';
import {checkRehearsal,rehearsalDetails,rehearsalDestination} from './replay-rehearsal-scope.js';

function inspectDirectory(directory) {
    const stat = available(() => fs.lstatSync(directory));
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) fail('UNSUPPORTED_FIXTURE', 'Unsafe fixture directory');
}

function available(operation) {
    try { return operation(); }
    catch (error) {
        if (error?.code === 'ENOENT') fail('UNAVAILABLE', 'Fixture file or directory is unavailable');
        throw error;
    }
}

function selectManifest(fd, size) {
    const fields = Object.create(null), scanner = new Scanner(fd, 0, size);
    const result = scanner.value(0, {
        keys: new Set(['version', 'maps', 'replays', 'records', 'scoreRecords', 'retiredScoreSources']),
        scalarKeys: new Set(['version']),
        accept: (key, ref) => { fields[key] = key === 'version' ? (ref.kind === 'number' ? ref.value : undefined) : ref; }
    });
    scanner.eof();
    if (result.kind !== 'object') fail('UNSUPPORTED_MANIFEST', 'Expected manifest object');
    if (fields.version === 1 && fields.records?.kind === 'array' && fields.records.count === 0) fail('NOT_FOUND', 'Replay-log response not found');
    if (fields.version !== 2 || ['maps', 'replays', 'records'].some(k => fields[k]?.kind !== 'array') ||
        ['scoreRecords', 'retiredScoreSources'].some(k => Object.hasOwn(fields, k) && fields[k].kind !== 'array')) {
        fail('UNSUPPORTED_MANIFEST', 'Unsupported replay-log manifest collections/version');
    }
    return fields.records;
}

function selectRecord(fd, range, replayId, fingerprint) {
    const scanner = new Scanner(fd, range.start, range.end);
    scanner.expect(91); scanner.ws();
    if (scanner.peek() !== 93) for (;;) {
        let replayMatches = false, fingerprintMatches = false, diagnostics;
        const record = scanner.value(0, {
            keys: new Set(['replayId', 'fingerprint', 'otherEntries']),
            scalarKeys: new Set(['replayId', 'fingerprint']),
            accept: (key, ref) => {
                if (key === 'replayId') replayMatches = ref.value === replayId;
                else if (key === 'fingerprint') fingerprintMatches = ref.value === fingerprint;
                else diagnostics = {start: ref.start, end: ref.end, kind: ref.kind};
            }
        });
        if (record.kind === 'null') fail('INVALID_RECORD', 'Null encountered before selected record');
        if (record.kind === 'object' && replayMatches && fingerprintMatches) {
            if (diagnostics?.kind !== 'array') fail('INVALID_RECORD', 'Expected array otherEntries');
            return diagnostics;
        }
        scanner.ws(); if (scanner.peek() === 93) break;
        scanner.expect(44); scanner.ws();
    }
    fail('NOT_FOUND', 'Replay-log response not found');
}

function fixtureRoot(root,conversion=false) {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (process.platform !== 'darwin' || major !== 24 || minor < 19) fail('UNSUPPORTED_FIXTURE', 'Requires qualified native Node 24.19+/macOS');
    if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root ||
        path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith(conversion?'pain-gain-v2-conversion-fixture-':'pain-gain-v2-reader-fixture-')) fail('UNSUPPORTED_FIXTURE', 'Explicit canonical temporary fixture root required');
    inspectDirectory(root); if(!conversion)inspectDirectory(path.join(root, 'replay_logs'));
}

export async function writeFixtureV2Other({root, replayId, fingerprint}, sink) {
    if (typeof replayId !== 'string' || !/^[a-f0-9]{24}$/.test(replayId) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) fail('INVALID_IDENTITY', 'Invalid log identity');
    fixtureRoot(root);
    const owned = new Set(); let primary = false;
    const open = file => {
        const before = available(() => fs.lstatSync(file, {bigint: true}));
        if (!before.isFile() || before.isSymbolicLink()) fail('UNSUPPORTED_FIXTURE', 'Expected regular fixture file');
        const fd = available(() => fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW));
        owned.add(fd); // Cleanup responsibility precedes descriptor inspection.
        const stat = fs.fstatSync(fd, {bigint: true});
        if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino) fail('UNAVAILABLE', 'Fixture file changed during open');
        return {fd, stat};
    };
    try {
        inspectDirectory(root); inspectDirectory(path.join(root, 'replay_logs'));
        const marker = open(path.join(root, '.replay-v2-reader-fixture.json'));
        if (marker.stat.size > 16_384n) fail('RESOURCE_LIMIT', 'Fixture marker exceeds 16 KiB');
        const bytes = Buffer.alloc(Number(marker.stat.size)); let offset = 0;
        while (offset < bytes.length) {
            const n = fs.readSync(marker.fd, bytes, offset, bytes.length - offset, offset);
            if (!n) fail('UNAVAILABLE', 'Truncated fixture marker'); offset += n;
        }
        let declaration;
        try { declaration = JSON.parse(bytes.toString('utf8')); } catch { fail('UNSUPPORTED_FIXTURE', 'Invalid fixture marker'); }
        if (!declaration || Object.keys(declaration).length !== 3 || declaration.fixture !== 'replay-v2-reader' || declaration.version !== 1 || declaration.filesystem !== 'local-apfs') fail('UNSUPPORTED_FIXTURE', 'Invalid fixture declaration');
        owned.delete(marker.fd); fs.closeSync(marker.fd);
        const {fd, stat} = open(path.join(root, 'replay_logs', 'manifest.json'));
        if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) fail('RESOURCE_LIMIT', 'Manifest offset exceeds safe integer');
        const unchanged = () => {
            const now = fs.fstatSync(fd, {bigint: true});
            if (now.size !== stat.size || now.mtimeNs !== stat.mtimeNs) fail('CHANGED_INPUT', 'Pinned manifest was modified');
        };
        const records = selectManifest(fd, Number(stat.size));
        const selected = selectRecord(fd, records, replayId, fingerprint);
        const entries = () => new Scanner(fd, selected.start, selected.end).elements();
        for (const value of entries()) measureNative(value);
        unchanged();
        await writeOtherEntries(entries(), sink);
        unchanged();
    } catch (error) {
        primary = true;
        throw error;
    } finally {
        let closeFailed = false, closeError;
        for (const fd of owned) try { fs.closeSync(fd); } catch (error) { if (!closeFailed) { closeFailed = true; closeError = error; } }
        if (!primary && closeFailed) throw closeError;
    }
}

// New strict, member-facing seam. The historical `other` adapter above keeps
// its native last-key-wins/decoding contract; no production command dispatches here.
export const legacyMemberLimits = Object.freeze({inputBytes:16*TOKEN, memberBytes:TOKEN,
    depth:64, keys:128, keyBytes:256, values:65536, events:4096});
export const legacyDiagnosticLimits = Object.freeze({...legacyMemberLimits,
    diagnosticBytes:4*TOKEN,diagnosticItems:4096,wrapperBytes:CHUNK,scalarBytes:32768,
    elapsedMs:60000,heapBytes:256*TOKEN,rssBytes:512*TOKEN});
export const legacyExpandedDiagnosticLimits = Object.freeze({...legacyDiagnosticLimits,
    inputBytes:64*TOKEN,diagnosticBytes:16*TOKEN,diagnosticItems:8192,values:1000000,elapsedMs:600000});
export const legacyBackupDiagnosticLimits = Object.freeze({...legacyExpandedDiagnosticLimits,
    inputBytes:600*TOKEN,values:8000000});
const collections = new Set(['maps','replays','records','scoreRecords','retiredScoreSources']);

class MemberScanner extends Scanner {
    constructor(fd,size,limits,start=0,check=()=>{}) { super(fd,start,size);this.limits=limits;this.values=0;this.fields=[];this.check=check; }
    raw(fn) {
        const raw=super.raw(fn);
        try{new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{fail('UNSUPPORTED_VALUE','Invalid UTF-8 key');}
        return raw;
    }
    advance(n=1) {
        if(this.capture && this.capture.length+n>this.limits.keyBytes)
            fail('RESOURCE_LIMIT',`Legacy key exceeds bound at byte ${this.offset}`);
        super.advance(n);
    }
    value(depth=0) {
        if(this.values%64===0)this.check();
        if(++this.values>this.limits.values)fail('RESOURCE_LIMIT',`Legacy iteration bound at byte ${this.offset}`);
        this.ws();
        if(depth>=this.limits.depth && [123,91].includes(this.peek()))fail('RESOURCE_LIMIT',`Legacy nesting bound at byte ${this.offset}`);
        const keys=new Set();
        const ref=super.value(depth,{keys:{has:()=>true},scalarKeys:{has:()=>false},accept:(name,ref)=>{
            if(keys.has(name))fail('DUPLICATE_KEY',`Duplicate legacy property at byte ${ref.start}`);
            keys.add(name);if(keys.size>this.limits.keys)fail('RESOURCE_LIMIT',`Legacy property bound at byte ${ref.start}`);
            if(depth===0)this.fields.push({name,ordinal:this.fields.length,...ref});
        }});
        if(this.limits.scalarBytes&& !['object','array'].includes(ref.kind)&&ref.end-ref.start>this.limits.scalarBytes)
            fail('RESOURCE_LIMIT','Streaming scalar token exceeds bound');
        return ref;
    }
}

// Copy own data properties without invoking accessors. No caller-owned options
// are read after this snapshot; inherited properties cannot supply defaults.
function memberOptionData(value,allowed,code) {
    if(!value || Object.getPrototypeOf(value)!==Object.prototype)fail(code,'Plain data options required');
    const descriptors=Object.getOwnPropertyDescriptors(value),copy=Object.create(null);
    for(const key of Reflect.ownKeys(descriptors)){
        const descriptor=descriptors[key];
        if(!allowed.includes(key)||!Object.hasOwn(descriptor,'value'))fail(code,'Only supported own data options are allowed');
        copy[key]=descriptor.value;
    }
    return copy;
}

export async function readFixtureV2Members(options,sink) {
    return readMembers(options,sink,false);
}
export async function readFixtureV2DiagnosticMembers(options,sink) {
    return readMembers(options,sink,true);
}
export async function readRehearsalV2DiagnosticMembers(scope,limits,sink) {
    rehearsalDestination(scope);
    return readMembers({root:rehearsalDetails(scope).dataRoot,capacity:'backup-sized-synthetic-v1',limits},sink,true,scope);
}
async function readMembers(options,sink,streamDiagnostics,rehearsal) {
    const config=memberOptionData(options,['synthetic','root','limits','layout',...(streamDiagnostics?['capacity']:[])],'UNSUPPORTED_FIXTURE');
    if((!rehearsal&&config.synthetic!==true) || typeof sink!=='function')
        fail('UNSUPPORTED_FIXTURE','Explicit synthetic member reader options and sink required');
    const root=config.root;
    const layout=config.layout??'reader';
    if(!['reader','conversion'].includes(layout))fail('UNSUPPORTED_FIXTURE','Unsupported synthetic layout');
    const conversion=layout==='conversion';
    const expanded=config.capacity!==undefined;
    if(expanded&&(!streamDiagnostics||conversion||!['expanded-synthetic-v1','backup-sized-synthetic-v1'].includes(config.capacity)))fail('UNSUPPORTED_FIXTURE','Unsupported capacity profile');
    const defaults={...(config.capacity==='backup-sized-synthetic-v1'?legacyBackupDiagnosticLimits:
        expanded?legacyExpandedDiagnosticLimits:streamDiagnostics?legacyDiagnosticLimits:legacyMemberLimits),
        ...(rehearsal?{elapsedMs:rehearsalDetails(rehearsal).deadlineMs}:{})};
    const overrides=memberOptionData(config.limits??{},Object.keys(defaults),'RESOURCE_LIMIT');
    for(const [k,v]of Object.entries(overrides))if(!Object.hasOwn(defaults,k)||!Number.isSafeInteger(v)||v<1||v>defaults[k])
        fail('RESOURCE_LIMIT','Limits may only reduce finite defaults');
    if(rehearsal)checkRehearsal(rehearsal);else fixtureRoot(root,conversion);
    const limits={...defaults,...overrides},owned=new Set();let failed=false,primary;
    const started=performance.now(),check=()=>{if(streamDiagnostics){const m=process.memoryUsage();
        if(performance.now()-started>=limits.elapsedMs||m.heapUsed>limits.heapBytes||m.rss>limits.rssBytes)fail('RESOURCE_LIMIT','Streaming execution budget');}};
    if(conversion)limits.inputBytes=Math.min(limits.inputBytes,2*TOKEN);
    const open=p=>{
        const before=resident(p),fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);owned.add(fd);
        const stat=fs.fstatSync(fd,{bigint:true});
        if(!stat.isFile()||stat.ino!==BigInt(before.ino)||stat.dev!==BigInt(before.dev))fail('CHANGED_INPUT','Fixture changed during open');
        return{fd,stat};
    };
    const bytes=(fd,start,end,cap)=>{
        if(end-start>cap)fail('RESOURCE_LIMIT',`Legacy member exceeds bound at byte ${start}`);
        const b=Buffer.alloc(end-start);for(let offset=0;offset<b.length;){
            const n=fs.readSync(fd,b,offset,Math.min(CHUNK,b.length-offset),start+offset);
            if(!n)fail('CHANGED_INPUT','Truncated pinned input');offset+=n;
        }return b;
    };
    const parsed=b=>{
        let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{fail('UNSUPPORTED_VALUE','Invalid UTF-8 cannot be preserved as metadata');}
        return JSON.parse(text,(_k,v)=>{if(typeof v==='number'&&!Number.isFinite(v))fail('UNSUPPORTED_VALUE','Nonfinite native number');return v;});
    };
    try {
        resident(root,true);if(!conversion&&!rehearsal)resident(path.join(root,'replay_logs'),true);
        if(!rehearsal){const marker=open(path.join(root,conversion?'.v2-conversion-fixture.json':'.replay-v2-reader-fixture.json'));
        const markerLimit=conversion?4096:16384;
        if(marker.stat.size>BigInt(markerLimit))fail('RESOURCE_LIMIT','Fixture marker exceeds bound');
        const declaration=parsed(bytes(marker.fd,0,Number(marker.stat.size),markerLimit));
        if(!declaration||declaration.version!==1||(conversion?
            Object.keys(declaration).length!==2||declaration.fixture!=='synthetic-v2-conversion':
            Object.keys(declaration).length!==3||declaration.fixture!=='replay-v2-reader'||declaration.filesystem!=='local-apfs'))
            fail('UNSUPPORTED_FIXTURE','Invalid synthetic marker');}
        const {fd,stat}=open(path.join(root,conversion||rehearsal?'manifest.json':'replay_logs/manifest.json'));
        if(stat.size>BigInt(limits.inputBytes))fail('RESOURCE_LIMIT','Legacy input exceeds bound');
        const unchanged=()=>{check();const now=fs.fstatSync(fd,{bigint:true});if(now.size!==stat.size||now.mtimeNs!==stat.mtimeNs)fail('CHANGED_INPUT','Pinned manifest modified');};
        const scanner=new MemberScanner(fd,Number(stat.size),limits,0,check),manifest=scanner.value();scanner.eof();
        if(manifest.kind!=='object')fail('UNSUPPORTED_MANIFEST','Expected v2 object');
        const fields=scanner.fields;
        const version=fields.find(f=>f.name==='version');
        if(!version||version.kind!=='number'||parsed(bytes(fd,version.start,version.end,limits.memberBytes))!==2 ||
            ['maps','replays','records'].some(k=>fields.find(f=>f.name===k)?.kind!=='array') ||
            fields.some(f=>collections.has(f.name)&&f.kind!=='array'))fail('UNSUPPORTED_MANIFEST','Expected v2 collections');
        const diagnosticMember=ref=>{
            const scan=new MemberScanner(fd,ref.end,limits,ref.start,check),record=scan.value();scan.eof();
            if(record.kind!=='object')fail('UNSUPPORTED_MANIFEST','Streaming record must be an object');
            const value={},diagnostic=scan.fields.find(f=>f.name==='otherEntries');let metadataBytes=2,active=true;
            if(!diagnostic||diagnostic.kind!=='array')fail('UNSUPPORTED_MANIFEST','Expected streaming otherEntries array');
            if(diagnostic.end-diagnostic.start>limits.diagnosticBytes||diagnostic.count>limits.diagnosticItems)fail('RESOURCE_LIMIT','Diagnostic collection exceeds bound');
            for(const f of scan.fields){
                metadataBytes+=Buffer.byteLength(JSON.stringify(f.name))+2+(f===diagnostic?4:f.end-f.start);
                if(metadataBytes>limits.memberBytes)fail('RESOURCE_LIMIT','Streaming record metadata exceeds bound');
                // Null is a layout marker, never the original diagnostic value.
                Object.defineProperty(value,f.name,{value:f===diagnostic?null:parsed(bytes(fd,f.start,f.end,limits.memberBytes)),enumerable:true});
            }
            const entries=function*(){
                const valid=()=>{if(!active)fail('CLOSED','Diagnostic callback ended');unchanged();};valid();
                let count=0;
                for(const item of new Scanner(fd,diagnostic.start,diagnostic.end).elements({ranges:true})){
                    valid();if(++count>limits.diagnosticItems)fail('RESOURCE_LIMIT','Diagnostic count exceeds bound');
                    yield parsed(bytes(fd,item.start,item.end,limits.wrapperBytes));valid();
                }
                if(count!==diagnostic.count)fail('CHANGED_INPUT','Diagnostic count changed');valid();
            };
            return {value,diagnostics:Object.freeze({count:diagnostic.count,bytes:diagnostic.end-diagnostic.start,entries}),revoke:()=>{active=false;}};
        };
        function* events() {
            let count=0;
            const check=()=>{unchanged();if(++count>limits.events)fail('RESOURCE_LIMIT','Legacy event bound');};
            const member=ref=>{const raw=bytes(fd,ref.start,ref.end,limits.memberBytes);return{raw,value:parsed(raw)};};
            for(const f of fields){
                check();
                if(!collections.has(f.name)){yield{kind:'property',name:f.name,ordinal:f.ordinal,start:f.start,end:f.end,...member(f)};continue;}
                yield{kind:'collection',name:f.name,ordinal:f.ordinal,count:f.count,start:f.start,end:f.end};
                let ordinal=0;
                for(const ref of new Scanner(fd,f.start,f.end).elements({ranges:true})){
                    check();const data=streamDiagnostics&&f.name==='records'?diagnosticMember(ref):member(ref);
                    const {revoke,...event}=data;
                    try{yield{kind:'member',name:f.name,rootOrdinal:f.ordinal,ordinal:ordinal++,start:ref.start,end:ref.end,...event};}finally{revoke?.();}
                }
            }
        }
        // Complete syntax/duplicate validation and member-limit/decoding preflight
        // precede callbacks. Only bounded root spans and one member are retained.
        for(const event of events())if(event.diagnostics)for(const wrapper of event.diagnostics.entries())void wrapper;
        unchanged();let count=0;
        for(const event of events()){await sink(event);count++;unchanged();}
        return{...(rehearsal?{backupRehearsal:true}:{fixtureOnly:true}),complete:true,events:count,sourceBytes:Number(stat.size)};
    }catch(error){failed=true;primary=error;throw error;}
    finally{
        const errors=[];for(const fd of owned)try{fs.closeSync(fd);}catch(e){errors.push(e);}
        if(errors.length){
            if(!failed){primary=errors.shift();for(const e of errors)withCleanup(primary,e);throw primary;}
            if(primary instanceof Error){for(const e of errors)withCleanup(primary,e);}
            else throw new AggregateError([primary,...errors],'Operation and descriptor cleanup failed',{cause:primary});
        }
    }
}
