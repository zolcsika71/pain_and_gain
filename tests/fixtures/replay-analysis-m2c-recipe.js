// Version 1 synthetic recipe; helper dependencies are explicitly supplied so
// the frozen oracle can use an unmodified, pinned Git export.
export const replayId = 'b'.repeat(24);
export const buildId = 'a'.repeat(64);
export const timestamp = '2026-10-05T00:00:00.000Z';
export const fingerprint = i => i.toString(16).padStart(64, '0');
export function recipe({canonical, mapChecksum, sha256, summarizeDiagnosticCoverage}, variant = 'scale') {
    const payload = {arena: {name: 'Pain and Gain', season: '4', level: 1, ticksLimit: 2000},
        terrain: {width: 100, height: 100, rows: Array.from({length: 100}, () => Array(100).fill(0))}, objects: []};
    const mapId = mapChecksum(payload), mapFile = 'pain_and_gain_map_2026-10-05T00-00-00-000Z.json';
    const files = {[mapFile]: canonical({...payload, checksum: mapId}) + '\n'};
    const records = Array.from({length: 4}, (_, i) => {
        const game = {type: 'game-state', buildId, tick: i + 1, phase: 'before-actions',
            selectedFlagId: null, creeps: [], flags: []};
        if (variant === 'overlap' && i === 1) game.tick = 1;
        if (variant === 'conflict' && i === 1) { game.tick = 1; game.selectedFlagId = 'different'; }
        if (variant === 'build' && i === 1) game.buildId = 'c'.repeat(64);
        if (variant === 'legacy') delete game.buildId;
        const games = i < 3 ? [game] : [];
        const lines = games.map(v => JSON.stringify(v));
        const outputPath = i < 3 ? `${replayId}-${fingerprint(i)}.jsonl` : null;
        if (outputPath) files[outputPath] = lines.join('\n') + '\n';
        let wrappers = Array.from({length: 1024}, (_, j) => ({key: String(j), raw: 'x'.repeat(128), type: 'other'}));
        if (variant !== 'scale') wrappers = [];
        if (['m2', 'm3', 'cpu', 'unsupported', 'malformed'].includes(variant)) {
            const cpu = variant === 'cpu';
            const entries = cpu ? [{type: 'runtime-cpu', formatVersion: 1, buildId, tick: i + 1,
                sequence: 0, recordId: `${i+1}:0`, phase: 'after-actions', elapsedNs: 1000,
                limitNs: i === 0 ? 100000000 : 20000000, limitKind: i === 0 ? 'first-tick' : 'ordinary-tick', unit: 'nanoseconds'}] : [];
            entries.push({type: 'evidence-coverage', formatVersion: cpu ? 2 : 1, buildId, tick: i + 1,
                sequence: entries.length, recordId: `${i+1}:${entries.length}`, phase: 'after-actions',
                firstSequence: cpu ? 0 : null, lastSequence: cpu ? 0 : null, recordCount: entries.length,
                coveredTypes: ['membership-baseline', 'membership-change', ...(variant === 'm2' ? [] : ['action-decision', 'action-attempt']), ...(cpu ? ['runtime-cpu'] : [])],
                counts: {'membership-baseline': 0, 'membership-change': 0, 'action-decision': 0, 'action-attempt': 0,
                    'movement-decisions': 0, 'healing-decisions': 0, 'combat-decisions': 0, ...(cpu ? {'runtime-cpu': 1} : {})}, closed: true});
            if (variant === 'unsupported') entries[0].formatVersion = 999;
            wrappers = entries.map((entry, j) => ({key: String(j), raw: JSON.stringify(entry), type: entry.type, formatVersion: entry.formatVersion}));
            if (variant === 'malformed') wrappers[0].raw = '{bad';
        }
        const parsed = wrappers.flatMap(w => { try { const entry = JSON.parse(w.raw); return entry.formatVersion === 1 || (entry.type === 'evidence-coverage' && entry.formatVersion === 2) ? [{entry, key:w.key}] : []; } catch { return []; } });
        const ticks = games.map(v => v.tick);
        const record = {replayId, requestedTick: i + 1, sourceEntry: `synthetic-cache-${i}`,
            sourceKey: `1/0/https://arena.screeps.com/api/game/${replayId}/log/${i+1}`,
            fingerprint: fingerprint(i), outputPath, outputFingerprint: outputPath ? sha256(files[outputPath]) : null,
            mapId, mapChecksum: mapId, mapFile, buildId: variant === 'legacy' ? null : game.buildId,
            importedAt: timestamp, status: 'claim',
            coverage: {count:ticks.length,firstTick:ticks[0]??null,lastTick:ticks.at(-1)??null,duplicates:[],gaps:[]},
            diagnosticCoverage: summarizeDiagnosticCoverage(lines,parsed), otherEntries: wrappers, reviews: {}};
        if (variant === 'summary') record.coverage.count = 999;
        if (variant === 'unicode') Object.defineProperty(record, '__proto__', {value: {note:'árvíz 🌊', missing:null, zero:0, flag:false}, enumerable:true});
        return record;
    });
    if (variant === 'map-schema') files[mapFile] = canonical({...payload, terrain: {}, checksum: mapId}) + '\n';
    if (variant === 'jsonl-schema') { files[records[0].outputPath] = '{"type":"wrong"}\n'; records[0].outputFingerprint = sha256(files[records[0].outputPath]); }
    const manifest = {version: 2, maps: [{id: mapId, checksum: mapId, file: mapFile, status:'validated', registeredAt:timestamp}],
        replays: [{replayId,mapId,status:'active', ...(variant === 'build' || variant === 'legacy' ? {} : {buildId}), associatedAt:timestamp,retiredFingerprints:[]}], records};
    return {manifest, files};
}
export const variants = ['scale','overlap','conflict','build','legacy','m2','m3','cpu','unsupported','malformed','summary','unicode','map-schema','jsonl-schema'];
