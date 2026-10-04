// Tooling-only, synthetic storage-v3 payloads. No legacy-reader integration.
import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ chunk: 65_536, inline: 65_536,
    token: 1_048_576, page: 128, pageBytes: 8_388_608, sources: 64, handles: 256 });

export function fail(code, message) {
    throw Object.assign(new Error(message), { code });
}

export function inlineJson(value, limit = LIMITS.inline) {
    // Check by streaming the encoding before materializing the bounded result.
    const parts = []; let bytes = 0;
    for (const part of jsonChunks(value)) {
        bytes += part.length;
        if (bytes > limit) fail('RESOURCE_LIMIT', 'JSON materialization budget exceeded; use a payload reference');
        parts.push(part);
    }
    return Buffer.concat(parts, bytes).toString('utf8');
}

// Encode without stringify of an entire record, token or accumulated corpus.
export function* jsonChunks(value, ancestors = new Set()) {
    if (typeof value === 'string') {
        yield Buffer.from('"');
        for (let i = 0; i < value.length;) {
            let end = Math.min(i + 8_192, value.length);
            if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
            yield Buffer.from(JSON.stringify(value.slice(i, end)).slice(1, -1)); i = end;
        }
        yield Buffer.from('"'); return;
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
        if (typeof value === 'number' && !Number.isFinite(value)) fail('INVALID_JSON', 'Nonfinite JSON number');
        yield Buffer.from(JSON.stringify(value)); return;
    }
    if (!value || typeof value !== 'object' || ancestors.has(value)) fail('INVALID_JSON', 'Unsupported or cyclic JSON value');
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) fail('INVALID_JSON','Only JSON objects/arrays are supported');
    ancestors.add(value);
    try {
        const array = Array.isArray(value); yield Buffer.from(array ? '[' : '{'); let first = true;
        for (const key of Object.keys(value)) {
            if (!first) yield Buffer.from(','); first = false;
            if (!array) { yield* jsonChunks(key, ancestors); yield Buffer.from(':'); }
            yield* jsonChunks(value[key], ancestors);
        }
        // Sparse arrays and custom array properties are not lossless JSON inputs.
        if (array && Object.keys(value).some((key, i) => key !== String(i))) fail('INVALID_JSON', 'Sparse or extended array');
        if (array && Object.keys(value).length !== value.length) fail('INVALID_JSON', 'Sparse array');
        yield Buffer.from(array ? ']' : '}');
    } finally { ancestors.delete(value); }
}

export function digestChunks(source) {
    const hash = createHash('sha256'); let bytes = 0;
    for (const chunk of source) { hash.update(chunk); bytes += chunk.length; }
    return { expectedBytes: bytes, expectedHash: hash.digest('hex') };
}

export function payloadPath(storeId, owner, pointer, role, hash) {
    if (!['diagnostics', 'summaries', 'extensions'].includes(role) || !/^[a-f0-9]{64}$/.test(hash)) fail('INVALID_REFERENCE', 'Invalid payload role/hash');
    const ownerHash = createHash('sha256').update(inlineJson([owner.kind, owner.key, pointer])).digest('hex');
    return `store-v3/${storeId}/${role}/${hash.slice(0, 2)}/${ownerHash}/${hash}.${role === 'diagnostics' ? 'jsonl' : 'json'}`;
}

export function* diagnosticChunks(wrappers, overflowRef) {
    let ordinal = 0;
    for (const wrapper of wrappers) {
        let envelope;
        try { envelope = inlineJson({ ordinal, wrapper }, LIMITS.token); }
        catch (error) {
            if (error.code !== 'RESOURCE_LIMIT' || !overflowRef) throw error;
            envelope = inlineJson({ ordinal, wrapperRef: overflowRef(ordinal, wrapper) }, LIMITS.token);
        }
        const bytes = Buffer.from(envelope + '\n');
        for (let offset = 0; offset < bytes.length; offset += LIMITS.chunk) yield bytes.subarray(offset, offset + LIMITS.chunk);
        ordinal++;
    }
}

// Views own pinned descriptors. Read positionally, never reopen by path.
export async function* payloadChunks(view, ref, start = 0, end = ref.bytes) {
    view.assertOpen(); const artifact = view.artifact(ref);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > ref.bytes) fail('RESOURCE_LIMIT', 'Invalid stream range');
    for (let offset = start; offset < end;) {
        view.assertOpen(); const buffer = Buffer.allocUnsafe(Math.min(LIMITS.chunk, end - offset));
        const bytesRead = view.read(artifact, buffer, offset);
        if (!bytesRead) fail('INVALID_ARTIFACT', 'Unexpected artifact EOF');
        offset += bytesRead; yield buffer.subarray(0, bytesRead);
    }
}

export async function verifyPayload(view, ref, utf8 = false) {
    const hash = createHash('sha256'); let bytes = 0;
    const decoder = utf8 ? new TextDecoder('utf-8', { fatal:true }) : null;
    for await (const chunk of payloadChunks(view, ref)) { hash.update(chunk); bytes += chunk.length; decoder?.decode(chunk,{stream:true}); }
    decoder?.decode();
    if (bytes !== ref.bytes || hash.digest('hex') !== ref.hash) fail('INVALID_ARTIFACT', 'Artifact hash/length mismatch');
}

export async function streamOriginalValue(view, ref, sink) {
    await verifyPayload(view, ref);
    for await (const chunk of payloadChunks(view, ref)) await sink(chunk);
}

// A bounded byte tokenizer validates oversized strings without materializing them.
// Ranges are offsets in the original UTF-8 file, not reserialized JSON.
class Tokens {
    constructor(view, ref) { this.iterator = payloadChunks(view, ref)[Symbol.asyncIterator](); this.buffer = Buffer.alloc(0); this.index = 0; this.offset = 0; }
    async peek() { if (this.index === this.buffer.length) { const next = await this.iterator.next(); this.buffer = next.done ? Buffer.alloc(0) : next.value; this.index = 0; } return this.buffer[this.index]; }
    async take() { const byte = await this.peek(); if (byte !== undefined) { this.index++; this.offset++; } return byte; }
    async next() {
        let c; while ([32, 9, 10, 13].includes(c = await this.peek())) await this.take();
        const start = this.offset;
        if (c === undefined) return { type: 'eof', start, end: start };
        if ([123,125,91,93,58,44].includes(c)) { await this.take(); return { type: String.fromCharCode(c), start, end: this.offset }; }
        let bytes = [], oversized = false;
        const add = byte => { if (!oversized) { bytes.push(byte); if (bytes.length > LIMITS.token) { bytes = []; oversized = true; } } };
        if (c === 34) {
            add(await this.take()); let escaped = false, unicode = 0;
            for (;;) {
                c = await this.take(); if (c === undefined || c < 32) fail('INVALID_JSON', 'Unterminated/control string'); add(c);
                if (unicode) { if (!/[0-9a-f]/i.test(String.fromCharCode(c))) fail('INVALID_JSON', 'Invalid Unicode escape'); unicode--; continue; }
                if (escaped) { if (c === 117) unicode = 4; else if (![34,92,47,98,102,110,114,116].includes(c)) fail('INVALID_JSON', 'Invalid escape'); escaped = false; continue; }
                if (c === 92) escaped = true; else if (c === 34) break;
            }
            return { type: 'value', start, end: this.offset, oversized, string: true,
                value: oversized ? undefined : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(bytes))) };
        }
        while ((c = await this.peek()) !== undefined && ![32,9,10,13,44,93,125,58].includes(c)) add(await this.take());
        if (oversized) fail('RESOURCE_LIMIT', 'Oversized JSON number/literal');
        const raw = Buffer.from(bytes).toString('utf8');
        if (!/^(?:null|true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$/.test(raw)) fail('INVALID_JSON', 'Invalid JSON token');
        return { type: 'value', start, end: this.offset, value: JSON.parse(raw) };
    }
}

export async function* iterateJson(view, ref, selector = '') {
    if (typeof selector !== 'string' || (selector && !/^(?:\/(?:[^~]|~[01])*)+$/.test(selector))) fail('INVALID_REFERENCE', 'Selector must be a JSON pointer');
    await verifyPayload(view, ref, true);
    const tokens = new Tokens(view, ref);
    // Selected ranges are bounded independently of total payload size. Array
    // wildcard iteration uses a queue drained after each selected child.
    const targets = selector.split('/').slice(1); let token = await tokens.next();
    const advance = async () => { const old = token; token = await tokens.next(); return old; };
    const expect = async type => { if (token.type !== type) fail('INVALID_JSON', `Expected ${type}`); return advance(); };
    const pointerKey = key => key.replaceAll('~', '~0').replaceAll('/', '~1');
    async function* value(parts, depth = 0) {
        if (depth > 1_024) fail('RESOURCE_LIMIT', 'JSON nesting budget exceeded');
        const start = token.start; let end;
        if (token.type === '{' || token.type === '[') {
            const object = token.type === '{', close = object ? '}' : ']'; await advance(); let ordinal = 0;
            if (token.type !== close) for (;;) {
                let key;
                if (object) { if (!token.string || token.oversized) fail('RESOURCE_LIMIT', 'Invalid/oversized property name'); key = token.value; await advance(); await expect(':'); }
                else key = String(ordinal++);
                yield* value([...parts, pointerKey(key)], depth + 1);
                if (token.type === close) break; await expect(',');
            }
            end = (await expect(close)).end;
        } else { if (token.type !== 'value') fail('INVALID_JSON', 'Expected JSON value'); end = (await advance()).end; }
        if (parts.length === targets.length && parts.every((p, i) => targets[i] === '*' || targets[i] === p)) {
            // Root/selected nested values can exceed token budget: expose a
            // pinned range instead, allowing bounded lossless copy.
            if (end - start > LIMITS.token) yield { kind: 'stream', ref, start, end };
            else {
                const buffers = []; for await (const bytes of payloadChunks(view, ref, start, end)) buffers.push(bytes);
                yield { kind: 'value', value: JSON.parse(Buffer.concat(buffers).toString('utf8')), start, end };
            }
        }
    }
    // No collected corpus or token list; the generator yields selected values.
    yield* value([]); if (token.type !== 'eof') fail('INVALID_JSON', 'Trailing JSON');
}

export async function* iterateDiagnostics(view, recordKey) {
    const ref = view.diagnostics(recordKey); await verifyPayload(view, ref, true);
    let parts = [], size = 0, ordinal = 0;
    for await (const chunk of payloadChunks(view, ref)) {
        let start = 0;
        for (let i = 0; i < chunk.length; i++) if (chunk[i] === 10) {
            parts.push(chunk.subarray(start, i)); size += i - start;
            if (size > LIMITS.token) fail('RESOURCE_LIMIT', 'Oversized diagnostic envelope');
            const envelope = JSON.parse(Buffer.concat(parts, size).toString('utf8'));
            if (envelope.ordinal !== ordinal++ || (Object.hasOwn(envelope, 'wrapper') === Object.hasOwn(envelope, 'wrapperRef'))) fail('INVALID_ARTIFACT', 'Invalid occurrence envelope');
            if (envelope.wrapperRef) {
                const child = view.child(ref, envelope.wrapperRef); let found = false;
                for await (const item of iterateJson(view, child)) { yield { ordinal: envelope.ordinal, ...item }; found = true; }
                if (!found) fail('INVALID_ARTIFACT', 'Missing overflow value');
            } else yield { ordinal: envelope.ordinal, kind: 'value', value: envelope.wrapper };
            parts = []; size = 0; start = i + 1;
        }
        parts.push(chunk.subarray(start)); size += chunk.length - start;
        if (size > LIMITS.token) fail('RESOURCE_LIMIT', 'Oversized diagnostic envelope');
    }
    if (size) fail('INVALID_ARTIFACT', 'Unterminated diagnostic envelope');
}
