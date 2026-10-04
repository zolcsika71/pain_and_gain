// Shared legacy JSONL output; SQLite is loaded only by the explicit fixture API.
import { fail, iterateDiagnostics, jsonChunks, LIMITS } from './replay-store-payloads.js';

export async function writeOtherEntries(entries, sink) {
    for await (const entry of entries) {
        // Preserve native legacy serialization (including nonfinite -> null).
        const text = String(JSON.stringify(entry));
        for (let start = 0; start < text.length;) {
            // At most three UTF-8 bytes per UTF-16 unit, with pairs kept whole.
            let end = Math.min(start + Math.floor(LIMITS.chunk / 3), text.length);
            if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
            await sink(Buffer.from(text.slice(start, end)));
            start = end;
        }
        await sink(Buffer.from('\n'));
    }
}

// Keep an error listener installed through write completion: Writable emits its
// error event after invoking the failed write callback.
export async function writeOtherToStream(entries, stream) {
    let streamError;
    const onError = error => { streamError = error; };
    stream.on('error', onError);
    try {
        await writeOtherEntries(entries, chunk => new Promise((resolve, reject) => {
            if (streamError) { reject(streamError); return; }
            stream.write(chunk, error => {
                if (error) setImmediate(() => reject(error));
                else resolve();
            });
        }));
        if (streamError) throw streamError;
    } finally { stream.removeListener('error', onError); }
}

export async function writeFixtureOther({root, schemaVersion, replayId, fingerprint}, sink) {
    if (schemaVersion !== 1 && schemaVersion !== 2) fail('UNSUPPORTED_STORE', 'Expected fixture schema 1 or 2');
    if (typeof replayId !== 'string' || !/^[a-f0-9]{24}$/.test(replayId) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) fail('INVALID_IDENTITY', 'Invalid log identity');
    const key = {collection: 'log', replayId, fingerprint};
    const handle = schemaVersion === 1
        ? await (await import('./replay-store.js')).openStore({root, mode: 'read'})
        : await (await import('./replay-catalog.js')).openCatalog({root, mode: 'read'});
    const store = schemaVersion === 1 ? handle : handle.evidence;
    let failed = false;
    try {
        await store.withReadSnapshot({recordKeys: [key], payloadRoles: ['diagnostics']}, async view => {
            const owner = {kind: 'record', key: JSON.stringify(['log', replayId, fingerprint])};
            const property = view.properties.get(JSON.stringify(owner))?.find(row => row.pointer === '/otherEntries');
            if (!property || property.value !== null || property.payload_pointer !== '/otherEntries') fail('INVALID_REFERENCE', 'Expected /otherEntries payload binding');
            const ref = view.payload(owner, '/otherEntries');
            if (!((typeof ref.items === 'bigint' && ref.items >= 0n) || (Number.isSafeInteger(ref.items) && ref.items >= 0))) fail('INVALID_ARTIFACT', 'Diagnostic item count must be a nonnegative integer');
            const options = {pointer: '/otherEntries'};
            let count = 0n;
            for await (const item of iterateDiagnostics(view, key, options)) {
                if (item.kind !== 'value') fail('RESOURCE_LIMIT', 'Diagnostic wrapper exceeds materialization limit');
                if (!item.value || typeof item.value !== 'object' || Array.isArray(item.value)) fail('INVALID_JSON', 'Diagnostic wrapper must be an object');
                let bytes = 0;
                for (const chunk of jsonChunks(item.value)) {
                    bytes += chunk.length;
                    if (bytes > LIMITS.token) fail('RESOURCE_LIMIT', 'Diagnostic wrapper exceeds output limit');
                }
                count++;
            }
            if (count !== BigInt(ref.items)) fail('INVALID_ARTIFACT', 'Diagnostic item count mismatch');
            async function* wrappers() {
                for await (const item of iterateDiagnostics(view, key, options)) yield item.value;
            }
            await writeOtherEntries(wrappers(), sink);
        });
    } catch (error) { failed = true; throw error; }
    finally {
        try { handle.close(); } catch (error) { if (!failed) throw error; }
    }
}
