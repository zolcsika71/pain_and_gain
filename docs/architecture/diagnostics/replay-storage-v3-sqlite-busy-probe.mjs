#!/usr/bin/env node
// Standalone diagnostic: node:sqlite only, temporary databases only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const script = fileURLToPath(import.meta.url);
const prefix = path.join(fs.realpathSync(os.tmpdir()), 'pain-gain-sqlite-busy-probe-');

function parseArgs(values) {
    const found = new Map();
    for (let i = 0; i < values.length; i += 2) {
        if (!values[i]?.startsWith('--') || values[i + 1] === undefined) throw new Error(`Invalid argument ${values[i] ?? ''}`);
        found.set(values[i].slice(2), values[i + 1]);
    }
    return found;
}

function scalar(db, sql) { return Object.values(db.prepare(sql).get())[0]; }

function configure(db, timeoutMs) {
    db.exec(`PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA mmap_size=0; PRAGMA cache_size=-8192; PRAGMA busy_timeout=${timeoutMs};`);
    return {
        journalMode: scalar(db, 'PRAGMA journal_mode'),
        synchronous: scalar(db, 'PRAGMA synchronous'),
        foreignKeys: scalar(db, 'PRAGMA foreign_keys'),
        mmapSize: scalar(db, 'PRAGMA mmap_size'),
        cacheSize: scalar(db, 'PRAGMA cache_size'),
        busyTimeoutMs: scalar(db, 'PRAGMA busy_timeout'),
        sqliteVersion: scalar(db, 'SELECT sqlite_version()')
    };
}

function initialize(file) {
    const db = new DatabaseSync(file);
    try {
        db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE probe(value INTEGER) STRICT; INSERT INTO probe VALUES(1);');
        return {journalMode: scalar(db, 'PRAGMA journal_mode'), sqliteVersion: scalar(db, 'SELECT sqlite_version()')};
    } finally { db.close(); }
}

function acquire(db) {
    db.exec('BEGIN IMMEDIATE');
    return {locked: true, inTransaction: db.isTransaction, at: new Date().toISOString()};
}

function contend(file, timeoutMs) {
    const db = new DatabaseSync(file), settings = configure(db, timeoutMs);
    const cpuBefore = process.cpuUsage(), resourcesBefore = process.resourceUsage(), startedAt = new Date().toISOString(), start = performance.now();
    let error = null, acquired = false;
    try { db.exec('BEGIN IMMEDIATE'); acquired = true; }
    catch (caught) { error = {name: caught?.name ?? null, code: caught?.code ?? null, message: caught?.message ?? String(caught)}; }
    const elapsedMs = performance.now() - start, cpu = process.cpuUsage(cpuBefore), resourcesAfter = process.resourceUsage();
    if (acquired) db.exec('ROLLBACK');
    const inTransactionAfter = db.isTransaction;
    db.close();
    return {
        settings, startedAt, elapsedMs, cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000,
        voluntaryContextSwitches: resourcesAfter.voluntaryContextSwitches - resourcesBefore.voluntaryContextSwitches,
        involuntaryContextSwitches: resourcesAfter.involuntaryContextSwitches - resourcesBefore.involuntaryContextSwitches,
        acquired, inTransactionAfter, error
    };
}

function verifyReleased(file) {
    const db = new DatabaseSync(file); configure(db, 1000);
    try { db.exec('BEGIN IMMEDIATE'); db.exec('ROLLBACK'); return true; }
    finally { db.close(); }
}

async function waitMessage(child, predicate, timeoutMs) {
    return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Handshake timeout')); }, timeoutMs);
        const message = value => { if (predicate(value)) { clearTimeout(timer); child.off('error', error); resolve(value); } };
        const error = value => { clearTimeout(timer); child.off('message', message); reject(value); };
        child.on('message', message); child.once('error', error);
    });
}

async function holder(args) {
    const db = new DatabaseSync(args.get('database'));
    try {
        const settings = configure(db, 0), handshake = acquire(db);
        process.send?.({type:'locked', settings, handshake, pid:process.pid});
        const command = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Holder release timeout')), 30_000);
            process.once('message', value => { clearTimeout(timer); resolve(value); });
        });
        if (command?.type !== 'release') throw new Error('Invalid holder release');
        db.exec('ROLLBACK');
        process.send?.({type:'released', inTransaction:db.isTransaction});
    } finally { if (db.isTransaction) db.exec('ROLLBACK'); db.close(); }
}

async function oneRun(args) {
    const mode = args.get('mode'), timeoutMs = Number(args.get('timeout'));
    if (!['same-process','cross-process'].includes(mode) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 10_000) throw new Error('Invalid run options');
    const root = fs.mkdtempSync(prefix), file = path.join(root, 'probe.sqlite'), created = initialize(file), statfs = fs.statfsSync(root);
    let holderDb, holderChild, holderOutcome = null, handshake;
    try {
        if (mode === 'same-process') {
            holderDb = new DatabaseSync(file); handshake = {type:'locked', settings:configure(holderDb, 0), handshake:acquire(holderDb), pid:process.pid};
        } else {
            holderChild = spawn(process.execPath, [script, '--role', 'holder', '--database', file], {stdio:['ignore','pipe','pipe','ipc']});
            let holderStdout = '', holderStderr = ''; holderChild.stdout.on('data', chunk => holderStdout += chunk); holderChild.stderr.on('data', chunk => holderStderr += chunk);
            handshake = await waitMessage(holderChild, value => value?.type === 'locked', 10_000);
            holderOutcome = {pid:holderChild.pid, stdout:holderStdout, stderr:holderStderr};
        }
        const contender = contend(file, timeoutMs);
        if (mode === 'same-process') { holderDb.exec('ROLLBACK'); holderDb.close(); holderDb = null; holderOutcome = {status:0, signal:null}; }
        else {
            holderChild.send({type:'release'}); const released = await waitMessage(holderChild, value => value?.type === 'released', 10_000);
            const outcome = await new Promise((resolve, reject) => { holderChild.once('error', reject); holderChild.once('close',(status,signal)=>resolve({status,signal})); });
            holderOutcome = {...holderOutcome, ...outcome, released}; holderChild = null;
        }
        const result = {
            mode, timeoutMs, executable:process.execPath, node:process.version, sqlite:process.versions.sqlite,
            platform:process.platform, arch:process.arch, tempParent:fs.realpathSync(os.tmpdir()), database:file,
            filesystem:{type:statfs.type,bsize:statfs.bsize}, created, handshake, contender, holderOutcome,
            postReleaseWrite:verifyReleased(file), load:os.loadavg(), processOutcome:{status:0,signal:null}
        };
        process.stdout.write(JSON.stringify(result) + '\n');
    } finally {
        if (holderDb) { try { if (holderDb.isTransaction) holderDb.exec('ROLLBACK'); } finally { holderDb.close(); } }
        if (holderChild) holderChild.kill('SIGKILL');
        fs.rmSync(root, {recursive:true,force:true});
    }
}

function controller(args) {
    const output = args.get('output');
    if (!output || !path.isAbsolute(output)) throw new Error('Absolute --output is required');
    const repeats = Number(args.get('repeats') ?? '3'), timeouts = (args.get('timeouts') ?? '0,100,1000,5000').split(',').map(Number);
    if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 10 || timeouts.some(value => !Number.isSafeInteger(value) || value < 0 || value > 10_000)) throw new Error('Invalid bounds');
    const runs = [];
    for (const timeoutMs of timeouts) for (let repeat = 1; repeat <= repeats; repeat++) {
        const modes = repeat % 2 ? ['same-process','cross-process'] : ['cross-process','same-process'];
        for (const mode of modes) {
            const before = {at:new Date().toISOString(),load:os.loadavg(),freeMemory:os.freemem()}, start = performance.now();
            const child = spawnSync(process.execPath, [script, '--role', 'run', '--mode', mode, '--timeout', String(timeoutMs)], {encoding:'utf8',timeout:Math.max(20_000,timeoutMs * 4 + 10_000),env:{...process.env}});
            const wallMs = performance.now() - start, after = {at:new Date().toISOString(),load:os.loadavg(),freeMemory:os.freemem()};
            let result = null; try { result = JSON.parse(child.stdout); } catch {}
            const row = {timeoutMs,repeat,mode,wallMs,status:child.status,signal:child.signal,error:child.error?.message ?? null,before,after,result,stdout:child.stdout,stderr:child.stderr};
            runs.push(row); process.stderr.write(JSON.stringify({timeoutMs,repeat,mode,wallMs,status:child.status,signal:child.signal,elapsedMs:result?.contender?.elapsedMs,error:result?.contender?.error}) + '\n');
        }
    }
    const evidence = {createdAt:new Date().toISOString(),probe:path.basename(script),command:{repeats,timeouts},controller:{executable:process.execPath,node:process.version,sqlite:process.versions.sqlite,platform:process.platform,arch:process.arch,NODE_OPTIONS:process.env.NODE_OPTIONS ?? null,UV_THREADPOOL_SIZE:process.env.UV_THREADPOOL_SIZE ?? null},runs};
    fs.writeFileSync(output, JSON.stringify(evidence,null,2) + '\n', {flag:'wx'});
}

const args = parseArgs(process.argv.slice(2)), role = args.get('role') ?? 'controller';
if (role === 'holder') await holder(args);
else if (role === 'run') await oneRun(args);
else if (role === 'controller') controller(args);
else throw new Error(`Unknown role ${role}`);
