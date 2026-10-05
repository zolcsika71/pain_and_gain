import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {writeFixtureV2Other} from '../../tools/replay-legacy-reader.js';
import {Scanner, measureNative, TOKEN, CHUNK} from '../../tools/replay-legacy-json.js';

const prefix = path.join(fs.realpathSync(os.tmpdir()), 'pain-gain-v2-reader-fixture-');
const replayId = 'a'.repeat(24), fingerprint = 'b'.repeat(64);
const identity = {replayId, fingerprint};
const marker = JSON.stringify({fixture: 'replay-v2-reader', version: 1, filesystem: 'local-apfs'});
const file = root => path.join(root, 'replay_logs/manifest.json');
const record = values => ({...identity, otherEntries: values});
const manifest = records => ({version: 2, maps: [], replays: [], records});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const oracle = values => values.map(v => JSON.stringify(v) + '\n').join('');
function initialize(root) { fs.mkdirSync(path.join(root, 'replay_logs')); fs.writeFileSync(path.join(root, '.replay-v2-reader-fixture.json'), marker); }
function fixture(t, input = JSON.stringify(manifest([record([])]))) {
    const root = fs.mkdtempSync(prefix); initialize(root); fs.writeFileSync(file(root), input);
    t.after(() => fs.rmSync(root, {recursive: true, force: true})); return root;
}
const run = (root, sink) => writeFixtureV2Other({root, ...identity}, sink);
async function output(root) { const parts = []; await run(root, chunk => parts.push(chunk)); return Buffer.concat(parts).toString(); }
function state(root) { return [digest(fs.readFileSync(file(root))), fs.readdirSync(root), fs.readdirSync(path.join(root, 'replay_logs'))]; }
async function rejectsUnchanged(root, code) {
    const before = state(root); let calls = 0;
    await assert.rejects(run(root, () => calls++), {code});
    assert.equal(calls, 0); assert.deepEqual(state(root), before);
}
function nativeFind(text) { const m = JSON.parse(text); return m.records.find(r => r.replayId === replayId && r.fingerprint === fingerprint); }
async function child(args, timeout) {
    const p = spawn(process.execPath, args, {stdio: ['ignore', 'pipe', 'pipe']}); let stdout = '', stderr = '', expired = false;
    p.stdout.on('data', c => stdout += c); p.stderr.on('data', c => stderr += c);
    const timer = setTimeout(() => { expired = true; p.kill('SIGKILL'); }, timeout);
    const code = await new Promise((resolve, reject) => { p.once('error', reject); p.once('close', resolve); }); clearTimeout(timer);
    assert.equal(expired, false, stderr); assert.equal(code, 0, stderr); return JSON.parse(stdout);
}
function hashFile(p) {
    const fd = fs.openSync(p, 'r'), h = createHash('sha256'), b = Buffer.alloc(CHUNK);
    try { for (;;) { const n = fs.readSync(fd, b, 0, b.length, null); if (!n) break; h.update(b.subarray(0, n)); } } finally { fs.closeSync(fd); }
    return h.digest('hex');
}

if (process.argv[2] === 'm2b-scale') {
    const {roots, pretty} = JSON.parse(process.argv[3]), phase = process.argv[4];
    const start = performance.now(), results = [], values = Array.from({length: 4096}, (_, i) => ({key: String(i), raw: 'x'.repeat(128), type: 'other'}));
    const selected = {otherEntries: values, ...identity}, expected = oracle(values);
    if (phase === 'generate') {
        for (const [index, root] of roots.entries()) {
            initialize(root); const count = index ? 1000 : 10, fd = fs.openSync(file(root), 'wx');
            let generated = 0, unrelatedBytes = 0;
            const write = bytes => { const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes); for (let i = 0; i < b.length; i += CHUNK) fs.writeSync(fd, b.subarray(i, i + CHUNK)); };
            try {
                write(pretty ? '{\n  "version": 2,\n  "maps": [],\n  "replays": [],\n  "scoreRecords": [],\n  "retiredScoreSources": [],\n  "records": [\n' : '{"version":2,"maps":[],"replays":[],"scoreRecords":[],"retiredScoreSources":[],"records":[');
                for (let i = 0; i < count; i++) {
                    if (i) write(pretty ? ',\n' : ',');
                    const item = i === count - 1 ? selected : {replayId, fingerprint: String(i).padStart(64, '0'), otherEntries: i < 8 ? [{raw: 'SENTINEL'}] : []};
                    let text = JSON.stringify(item, null, pretty ? 2 : 0); if (pretty) text = text.split('\n').map(s => '    ' + s).join('\n');
                    if (i < 8) {
                        const pos = text.indexOf('SENTINEL'); write(text.slice(0, pos)); const lead = `record-${i}:`; write(lead);
                        let remaining = 75 * 1024 * 1024 - lead.length; const block = Buffer.alloc(CHUNK, 120);
                        while (remaining) { const n = Math.min(remaining, block.length); write(block.subarray(0, n)); remaining -= n; }
                        write(text.slice(pos + 8)); unrelatedBytes += 75 * 1024 * 1024;
                    } else write(text);
                    generated++;
                }
                write(pretty ? '\n  ]\n}\n' : ']}\n');
            } finally { fs.closeSync(fd); }
            assert.equal(generated, count); assert.equal(unrelatedBytes, 629145600); assert.ok(fs.statSync(file(root)).size > unrelatedBytes);
            results.push({count: generated, unrelatedBytes, manifestBytes: fs.statSync(file(root)).size});
        }
    } else {
        const hooks = registerHooks({resolve(specifier, context, next) { if (specifier === 'node:sqlite') throw Error('SQLite imported'); return next(specifier, context); }});
        for (const [index, root] of roots.entries()) {
            const before = hashFile(file(root)), stamp = fs.statSync(file(root), {bigint: true}), markerBefore = fs.readFileSync(path.join(root, '.replay-v2-reader-fixture.json'));
            const originals = {open: fs.openSync, close: fs.closeSync, read: fs.readSync, write: fs.writeSync, value: Scanner.prototype.value, raw: Scanner.prototype.raw};
            const fds = new Map(), metrics = {opens: 0, closes: 0, peakHandles: 0, reads: 0, manifestBytes: 0, markerBytes: 0, peakElement: 0, records: 0};
            let bytes = 0, calls = 0, maxChunk = 0, active = 0; const hash = createHash('sha256');
            fs.openSync = (p, ...args) => { assert.ok([file(root), path.join(root, '.replay-v2-reader-fixture.json')].includes(String(p))); assert.equal(args[0] & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT), 0); const fd = originals.open(p, ...args); fds.set(fd, String(p)); metrics.opens++; metrics.peakHandles = Math.max(metrics.peakHandles, fds.size); return fd; };
            fs.writeSync = () => { throw Error('Unexpected fixture write'); };
            fs.readSync = (fd, b, o, n, pos) => { assert.ok(n <= CHUNK); const got = originals.read(fd, b, o, n, pos); metrics.reads++; metrics[fds.get(fd) === file(root) ? 'manifestBytes' : 'markerBytes'] += got; return got; };
            fs.closeSync = fd => { metrics.closes++; fds.delete(fd); return originals.close(fd); };
            Scanner.prototype.value = function(depth, fields, scalar) {
                if (fields?.keys.has('records')) { const accept = fields.accept; fields = {...fields, accept(k, ref) { if (k === 'records') metrics.records = ref.count; accept(k, ref); }}; }
                return originals.value.call(this, depth, fields, scalar);
            };
            Scanner.prototype.raw = function(fn) { const raw = originals.raw.call(this, fn); metrics.peakElement = Math.max(metrics.peakElement, raw.length); return raw; };
            const elapsed = performance.now();
            try { await run(root, async b => { assert.equal(active++, 0); assert.ok(b.length <= CHUNK); await Promise.resolve(); hash.update(b); bytes += b.length; maxChunk = Math.max(maxChunk, b.length); calls++; active--; }); }
            finally { fs.openSync = originals.open; fs.closeSync = originals.close; fs.readSync = originals.read; fs.writeSync = originals.write; Scanner.prototype.value = originals.value; Scanner.prototype.raw = originals.raw; }
            const elapsedMs = performance.now() - elapsed;
            assert.equal(metrics.records, index ? 1000 : 10); assert.equal(metrics.opens, 2); assert.equal(metrics.closes, 2); assert.equal(fds.size, 0); assert.ok(metrics.peakHandles <= 2);
            assert.equal(hash.digest('hex'), digest(expected)); assert.equal(bytes, Buffer.byteLength(expected));
            const selectedText = JSON.stringify(selected, null, pretty ? 2 : 0).split('\n').map(s => pretty ? '    ' + s : s).join('\n');
            const selectedBytes = Buffer.byteLength(selectedText.slice(selectedText.indexOf('['), selectedText.lastIndexOf(']') + 1));
            assert.ok(metrics.manifestBytes <= 2 * Number(stamp.size) + 2 * selectedBytes + 4 * CHUNK);
            assert.equal(hashFile(file(root)), before); const after = fs.statSync(file(root), {bigint: true}); assert.equal(after.size, stamp.size); assert.equal(after.mtimeNs, stamp.mtimeNs);
            assert.deepEqual(fs.readFileSync(path.join(root, '.replay-v2-reader-fixture.json')), markerBefore);
            results.push({...metrics, elapsedMs, outputBytes: bytes, calls, maxChunk, selectedBytes});
        }
        hooks.deregister();
    }
    console.log(JSON.stringify({phase, pretty, elapsedMs: performance.now() - start, maxRssBytes: process.resourceUsage().maxRSS * 1024, results}));
} else {
test('native serialization, duplicate keys and arbitrary order agree with actual v2 CLI', async t => {
    const values = '[1e400,-0,"😀","\\ud800",null,false,0,{"z":1,"0":2,"z":3,"__proto__":4},[1,2]]';
    const selected = `{"otherEntries":null,"otherEntries":${values},"fingerprint":"${fingerprint}","replayId":"wrong","replay\\u0049d":"${replayId}"}`;
    const text = `{"records":false,"maps":null,"maps":[],"replays":[],"scoreRecords":[],"retiredScoreSources":[],"version":0,"version":2,"recor\\u0064s":[0,false,"text",[],${selected},null]}`;
    const root = fixture(t, text); const expected = oracle(nativeFind(text).otherEntries);
    assert.equal(await output(root), expected); assert.equal(await output(root), expected);
    const toolsDir = path.join(root, 'tools'); fs.mkdirSync(toolsDir); fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    for (const name of ['replay-logs.js', 'replay-other.js', 'replay-store-payloads.js']) fs.writeFileSync(path.join(toolsDir, name), execFileSync('git', ['show', '839de85a4afe2c8ea489164b9e90ac37ac2296ea:tools/' + name]));
    const hook = path.join(root, 'no-sqlite.mjs'); fs.writeFileSync(hook, "import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){if(s==='node:sqlite')throw Error('SQLite imported');return n(s,c)}});");
    for (const input of [text, JSON.stringify(JSON.parse(text), null, 2)]) {
        fs.writeFileSync(file(root), input);
        const cli = spawnSync(process.execPath, ['--import', hook, path.join(toolsDir, 'replay-logs.js'), 'other', replayId, fingerprint], {encoding: 'utf8'});
        assert.equal(cli.status, 0, cli.stderr); assert.equal(cli.stdout, expected); assert.equal(await output(root), cli.stdout);
    }
    const moduleURL = new URL('../../tools/replay-legacy-reader.js', import.meta.url).href;
    const probe = spawnSync(process.execPath, ['--import', hook, '--input-type=module', '-e', `const {writeFixtureV2Other}=await import(${JSON.stringify(moduleURL)});await writeFixtureV2Other(${JSON.stringify({root,...identity})},()=>{});`], {encoding:'utf8'});
    assert.equal(probe.status, 0, probe.stderr);
});

test('first match and visited null semantics, nested decoys, missing and empty selections', async t => {
    for (const [records, code, expected] of [
        [[null, record([])], 'INVALID_RECORD'], [[record([1]), null, record([2])], null, '1\n'],
        [[{nested: identity}, record([])], null, ''], [[0, false, [], 's'], 'NOT_FOUND']
    ]) { const root = fixture(t, JSON.stringify(manifest(records))); if (code) await rejectsUnchanged(root, code); else assert.equal(await output(root), expected); }
    for (const otherEntries of [null, 'iterable but unsupported', {}, 0]) await rejectsUnchanged(fixture(t, JSON.stringify(manifest([{...identity, otherEntries}]))), 'INVALID_RECORD');
    await rejectsUnchanged(fixture(t, JSON.stringify(manifest([identity]))), 'INVALID_RECORD');
});

test('container semantics use final duplicates, empty v1 exception and optional collections', async t => {
    for (const [value, code] of [
        [{version:1,records:[],scoreRecords:null},'NOT_FOUND'], [{version:1,records:[record([])]},'UNSUPPORTED_MANIFEST'],
        [{version:3,records:[]},'UNSUPPORTED_MANIFEST'], [{...manifest([]),scoreRecords:null},'UNSUPPORTED_MANIFEST'],
        [{...manifest([]),retiredScoreSources:{}},'UNSUPPORTED_MANIFEST'], [{...manifest([]),maps:null},'UNSUPPORTED_MANIFEST'], [null,'UNSUPPORTED_MANIFEST']
    ]) await rejectsUnchanged(fixture(t, JSON.stringify(value)),code);
    const text = `{"version":2,"maps":[],"replays":[],"records":[null],"records":[${JSON.stringify(record([7]))}]}`;
    assert.equal(await output(fixture(t,text)),'7\n');
});

test('whole input grammar including overwritten and trailing values is validated before output', async t => {
    const prefixText = JSON.stringify(manifest([record([1])]));
    for (const bad of [prefixText+'x',prefixText+'{}','\ufeff'+prefixText,prefixText.slice(0,-1)+',"ignored":[1,]}',prefixText.slice(0,-1)+',"ignored":"\\q"}',prefixText.slice(0,-1)+',"ignored":01}',prefixText.slice(0,-1)+',"ignored":1e+}',prefixText.slice(0,-1)+',"records":["unterminated]}']) await rejectsUnchanged(fixture(t,bad),'INVALID_JSON');
});

test('chunk boundaries and native malformed UTF-8 replacement preserve legacy bytes', async t => {
    const prefixText = `{"version":2,"maps":[],"replays":[],"records":[{"replayId":"${replayId}","fingerprint":"${fingerprint}","otherEntries":["`;
    for (const tail of [Buffer.from('😀\\u0061\\\\\\"'),Buffer.from([0xf0,0x80,0x80,0x22])]) {
        const suffix = tail.length === 4 ? ']}]}' : '"]}]}';
        const bytes=Buffer.concat([Buffer.from(prefixText+'x'.repeat(CHUNK-prefixText.length-1)),tail,Buffer.from(suffix)]);
        const root=fixture(t,bytes); assert.equal(await output(root),oracle(nativeFind(bytes.toString('utf8')).otherEntries));
    }
});

test('raw, decoded, encoded, required-token and container-depth bounds are independent', async t => {
    const root=fixture(t); const setRaw=value=>fs.writeFileSync(file(root),`{"version":2,"maps":[],"replays":[],"records":[{"replayId":"${replayId}","fingerprint":"${fingerprint}","otherEntries":[${value}]}]}`);
    setRaw('"'+'x'.repeat(TOKEN-2)+'"'); let size=0;await run(root,b=>size+=b.length);assert.equal(size,TOKEN+1);
    setRaw('"'+'x'.repeat(TOKEN-1)+'"');await rejectsUnchanged(root,'RESOURCE_LIMIT');
    setRaw('"'+'\ud800'.repeat(1)+'"'); // Native UTF-8 encoding replaces this literal surrogate.
    assert.equal(await output(root),'"�"\n');
    setRaw('0'+ ' '.repeat(TOKEN)); // trailing whitespace is outside the element range
    assert.equal(await output(root),'0\n');
    setRaw('['+' '.repeat(TOKEN)+']');await rejectsUnchanged(root,'RESOURCE_LIMIT');
    const bytes=Buffer.concat([Buffer.from(`{"version":2,"maps":[],"replays":[],"records":[{"replayId":"${replayId}","fingerprint":"${fingerprint}","otherEntries":["`),Buffer.alloc(TOKEN/2,0xff),Buffer.from('"]}]}')]);
    fs.writeFileSync(file(root),bytes);await rejectsUnchanged(root,'RESOURCE_LIMIT');
    setRaw('['+'1e-6,'.repeat(120000)+'0]');await rejectsUnchanged(root,'RESOURCE_LIMIT');
    setRaw('['.repeat(1020)+'0'+']'.repeat(1020));assert.equal(await output(root),'['.repeat(1020)+'0'+']'.repeat(1020)+'\n');
    fs.writeFileSync(file(root),'{"'+'k'.repeat(TOKEN)+'":0}');await rejectsUnchanged(root,'RESOURCE_LIMIT');
    for(const n of [1023,1024]) { fs.writeFileSync(file(root),'['.repeat(n)+'0'+']'.repeat(n));await rejectsUnchanged(root,'UNSUPPORTED_MANIFEST'); }
    fs.writeFileSync(file(root),'['.repeat(1025)+'0'+']'.repeat(1025));await rejectsUnchanged(root,'RESOURCE_LIMIT');
});

test('native size counting handles escaping, key order, surrogates and normalization', () => {
    for(const value of [null,Infinity,-Infinity,-0,1e-7,JSON.parse('{"__proto__":2,"0":1}'),['x'.repeat(8191)+'😀','\ud800','\n\t"\\']]) assert.equal(measureNative(value),Buffer.byteLength(JSON.stringify(value)));
    assert.throws(()=>measureNative('\u0000'.repeat(180000)),{code:'RESOURCE_LIMIT'});
});

test('oversized skipped tokens and unselected records never require materialization', async t => {
    const text = `{"ignored":"${'x'.repeat(TOKEN+1)}","number":${'9'.repeat(TOKEN+1)},"version":2,"maps":[],"replays":[],"records":[{"otherEntries":["${'x'.repeat(TOKEN+1)}"]},${JSON.stringify(record([1]))}]}`;
    assert.equal(await output(fixture(t,text)),'1\n');
});

test('fixture gates reject unsafe paths, declarations and unavailable input without creating files', async t => {
    const root=fixture(t);await assert.rejects(writeFixtureV2Other({root,...identity,fingerprint:'bad'},()=>{}),{code:'INVALID_IDENTITY'});
    for(const bad of [undefined,path.dirname(root),root+'/../'+path.basename(root),root+'/']) await assert.rejects(writeFixtureV2Other({root:bad,...identity},()=>{}),{code:'UNSUPPORTED_FIXTURE'});
    fs.writeFileSync(path.join(root,'.replay-v2-reader-fixture.json'),'{}');await rejectsUnchanged(root,'UNSUPPORTED_FIXTURE');
    fs.writeFileSync(path.join(root,'.replay-v2-reader-fixture.json'),marker);
    const saved=fs.readFileSync(file(root));fs.unlinkSync(file(root));await assert.rejects(run(root,()=>{}),{code:'UNAVAILABLE'});assert.equal(fs.existsSync(file(root)),false);
    const other=path.join(root,'saved');fs.writeFileSync(other,saved);fs.symlinkSync(other,file(root));await assert.rejects(run(root,()=>{}),{code:'UNSUPPORTED_FIXTURE'});
});

test('pinned reads survive child-process replacement/unlink at pin and sink barriers', async t => {
    for(const phase of ['pin','sink']) for(const action of ['rename','unlink']) {
        const root=fixture(t,JSON.stringify(manifest([record([1,2])]))), open=fs.openSync;let acted=false;
        const act=()=>{if(acted)return;acted=true;const code=action==='rename'?`fs.writeFileSync(p+'.next',${JSON.stringify(JSON.stringify(manifest([record([9])])))});fs.renameSync(p+'.next',p);`:'fs.unlinkSync(p);';const child=spawnSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';const p=${JSON.stringify(file(root))};${code}`]);assert.equal(child.status,0);};
        fs.openSync=(p,...a)=>{const fd=open(p,...a);if(String(p)===file(root)&&phase==='pin')act();return fd;};
        let text='';try{await run(root,async b=>{if(phase==='sink')act();await new Promise(resolve=>setImmediate(resolve));text+=b;});}finally{fs.openSync=open;}
        assert.equal(text,'1\n2\n');assert.equal(acted,true);
        if(action==='rename')assert.equal(await output(root),'9\n');else await assert.rejects(run(root,()=>{}),{code:'UNAVAILABLE'});
    }
});

test('in-place mutation, interrupted emission and sink failures reject and close descriptors', async t => {
    for(const fault of ['inspect','read','late-read','sink','sink-enoent','null','close','null-close','mutate','pre-mutate']) {
        const values=Array.from({length:1200},()=>({raw:'x'.repeat(128)})),root=fixture(t,JSON.stringify(manifest([record(values)]))),before=state(root);
        const original={open:fs.openSync,close:fs.closeSync,read:fs.readSync,stat:fs.fstatSync};const fds=new Map();let calls=0,fired=false,inspections=0;
        const error=Object.assign(Error('injected '+fault),fault==='sink-enoent'?{code:'ENOENT'}:{});
        fs.openSync=(p,...a)=>{const fd=original.open(p,...a);fds.set(fd,String(p));return fd;};
        fs.fstatSync=(fd,...a)=>{if(fds.get(fd)===file(root)){inspections++;if(fault==='inspect'&&!fired){fired=true;throw error;}if(fault==='pre-mutate'&&inspections===2)fs.appendFileSync(file(root),' ');}return original.stat(fd,...a);};
        fs.readSync=(fd,...a)=>{if(fds.get(fd)===file(root)&&!fired&&(fault==='read'||(fault==='late-read'&&calls))){fired=true;throw error;}return original.read(fd,...a);};
        fs.closeSync=fd=>{const p=fds.get(fd);fds.delete(fd);const result=original.close(fd);if(p===file(root)&&['close','null-close'].includes(fault))throw error;return result;};
        let caught=false;
        try{await run(root,b=>{calls++;if(['sink','sink-enoent'].includes(fault))throw error;if(['null','null-close'].includes(fault))throw null;if(fault==='mutate'&&!fired){fired=true;fs.appendFileSync(file(root),' ');}});}catch(e){caught=true;if(['null','null-close'].includes(fault))assert.equal(e,null);else if(['mutate','pre-mutate'].includes(fault))assert.equal(e.code,'CHANGED_INPUT');else assert.equal(e,error);}
        finally{fs.openSync=original.open;fs.closeSync=original.close;fs.readSync=original.read;fs.fstatSync=original.stat;}
        assert.equal(caught,true,fault);assert.equal(fds.size,0,fault);if(['inspect','read','pre-mutate'].includes(fault))assert.equal(calls,0);if(fault==='late-read')assert.ok(calls>0);
        if(!['mutate','pre-mutate'].includes(fault))assert.deepEqual(state(root),before);assert.equal(await output(root),oracle(values));
    }
});

for(const pretty of [false,true]) test(`600 MiB legacy gate: ${pretty?'pretty':'compact'}, exactly 10/1000 records`,{timeout:195000},async t=>{
    const roots=[fs.mkdtempSync(prefix),fs.mkdtempSync(prefix)];t.after(()=>roots.forEach(root=>fs.rmSync(root,{recursive:true,force:true})));
    const results=[];for(const phase of ['generate','operations']){const result=await child(['--max-old-space-size=192',new URL(import.meta.url).pathname,'m2b-scale',JSON.stringify({roots,pretty}),phase],phase==='generate'?60000:120000);assert.ok(result.maxRssBytes<=256*1024*1024);results.push(result);}
    t.diagnostic(JSON.stringify(results));
});
}
