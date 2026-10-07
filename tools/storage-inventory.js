import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Metadata-only dry run. Names identify inventory candidates, never permission
// to delete. Do not import the store, analyzer or production replay tools here.
const temporaryName = /^(?:pain-gain-|scout-hold-cache-|historical-index-)[A-Za-z0-9._-]+$/;
const generated = new Set(['node_modules', '.cache', 'coverage', 'dist', 'build']);

export function measureRoots(roots) {
    const seen = new Set(), totals = {}, errors = [], links = [];
    for (const item of roots) {
        const {root, category} = item;
        const counts = {allocatedBytes: 0, logicalBytes: 0, entries: 0};
        function visit(current) {
            try {
                const stat = fs.lstatSync(current);
                const key = `${stat.dev}:${stat.ino}`;
                if (seen.has(key)) return;
                seen.add(key);
                counts.allocatedBytes += stat.blocks * 512;
                counts.logicalBytes += stat.isDirectory() ? 0 : stat.size;
                counts.entries++;
                if (stat.isSymbolicLink()) links.push(current);
                else if (stat.isDirectory()) {
                    for (const name of fs.readdirSync(current).sort()) visit(path.join(current, name));
                }
            } catch (error) {
                errors.push({path: current, code: error.code});
            }
        }
        visit(root);
        totals[category] ??= {allocatedBytes: 0, logicalBytes: 0, entries: 0};
        for (const key of Object.keys(counts)) totals[category][key] += counts[key];
        Object.assign(item, counts);
    }
    return {roots, totals, errors, symlinksNotFollowed: links};
}

export function referencedTemporaryRoots(text, parents) {
    const found = new Set();
    // Canonicalize only the known /tmp and /var aliases, without traversing
    // a receipt-supplied path or reading anything at its destination.
    for (const match of text.matchAll(/\/(?:private\/)?(?:tmp|var\/folders\/[^/\s]+\/[^/\s]+\/T)\/[A-Za-z0-9._-]+/g)) {
        const candidate = match[0].replace(/^\/tmp\//, '/private/tmp/').replace(/^\/var\//, '/private/var/');
        if (parents.includes(path.dirname(candidate)) && temporaryName.test(path.basename(candidate)) && !candidate.endsWith('-')) found.add(candidate);
    }
    return [...found].sort();
}

export function inventory(repository) {
    const git = (...args) => execFileSync('git', ['-C', repository, ...args], {encoding: 'utf8'}).trim();
    const common = fs.realpathSync(path.resolve(repository, git('rev-parse', '--git-common-dir')));
    const worktrees = git('worktree', 'list', '--porcelain').split('\n')
        .filter(line => line.startsWith('worktree ')).map(line => line.slice(9));
    const parents = [...new Set(['/private/tmp', fs.realpathSync(os.tmpdir())])];
    const references = new Map(), discoveryErrors = [];
    // Only repository documentation and fixture/test source are content-read.
    // Explicit directories exclude production evidence, caches and worktrees.
    function readReferences(dir) {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            const absolute = path.join(dir, entry.name);
            if (entry.isDirectory()) readReferences(absolute);
            else if (entry.isFile() && /\.(md|json|js|mjs)$/.test(entry.name)) {
                const source = path.relative(repository, absolute);
                for (const root of referencedTemporaryRoots(fs.readFileSync(absolute, 'utf8'), parents)) {
                    if (!references.has(root)) references.set(root, new Set());
                    references.get(root).add(source);
                }
            }
        }
    }
    for (const relative of ['docs/architecture', 'tests/fixtures', 'tests/unit', 'tests/benchmarks']) {
        readReferences(path.join(repository, relative));
    }
    const discovered = new Set();
    for (const parent of parents) {
        try {
            for (const name of fs.readdirSync(parent)) {
                if (temporaryName.test(name)) discovered.add(path.join(parent, name));
            }
        } catch (error) { discoveryErrors.push({path: parent, code: error.code}); }
    }
    const roots = [];
    for (const name of fs.readdirSync(common).sort()) {
        roots.push({root: path.join(common, name), category: name === 'objects' ? 'sharedGitObjects' : 'sharedGitOther'});
    }
    for (const root of worktrees) {
        for (const name of fs.readdirSync(root).sort()) {
            const absolute = path.join(root, name);
            if (absolute === common) continue;
            const category = name === 'replay_logs' ? 'protectedEvidence' : generated.has(name) ? 'otherGenerated' :
                root !== repository ? 'trialWorktrees' : name === 'tests' ? 'checkedInAndCandidateTests' : 'checkoutOther';
            roots.push({root: absolute, category});
        }
    }
    const temporary = [...new Set([...references.keys(), ...discovered])].sort().map(root => {
        let exists = false;
        try { fs.lstatSync(root); exists = true; }
        catch (error) { if (error.code !== 'ENOENT') discoveryErrors.push({path: root, code: error.code}); }
        if (exists) roots.push({root, category: 'temporaryCandidates'});
        return {root, exists, sources: [...(references.get(root) ?? [])].sort(), eligibleForDeletion: false};
    });
    const measured = measureRoots(roots);
    return {schemaVersion: 1, at: new Date().toISOString(), mode: 'dry-run-only', repository, commonGitDirectory: common,
        temporaryParents: parents, ...measured, temporary, discoveryErrors,
        allocatedBytes: Object.values(measured.totals).reduce((sum, value) => sum + value.allocatedBytes, 0),
        limitations: ['Metadata only for evidence and temporary trees; no content reads or hashes there.',
            'Hard links counted once by device/inode; APFS clones, snapshots and compression can affect physical free space.',
            'Names and receipt references establish inventory scope, not ownership, completion or disposal permission.',
            'Missing retained roots are preservation gaps, not reclaimed space. No delete or archive operation exists.']};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.slice(2).some(arg => arg !== '--dry-run') || process.argv.length > 3) {
        throw new Error('Usage: node tools/storage-inventory.js [--dry-run]; no deletion options');
    }
    const result = inventory(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.errors.length || result.discoveryErrors.length) process.exitCode = 1;
}
