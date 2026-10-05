// Private M2b scanner. No store, SQLite, corpus index or filesystem mutation.
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

export const CHUNK = 65_536, TOKEN = 1_048_576;
export const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const invalid = () => fail('INVALID_JSON', 'Invalid legacy JSON');
const space = c => c === 32 || c === 9 || c === 10 || c === 13;
const digit = c => c >= 48 && c <= 57;

// Replacement decoding matches Buffer.toString, but bounds decoded bytes before
// joining the text. A malformed input byte can expand into three UTF-8 bytes.
export function decodeBounded(bytes) {
    const decoder = new StringDecoder('utf8'), parts = []; let length = 0;
    const add = text => {
        length += Buffer.byteLength(text);
        if (length > TOKEN) fail('RESOURCE_LIMIT', 'Decoded JSON token exceeds 1 MiB');
        parts.push(text);
    };
    for (let i = 0; i < bytes.length; i += CHUNK) add(decoder.write(bytes.subarray(i, i + CHUNK)));
    add(decoder.end()); return parts.join('');
}

export class Scanner {
    constructor(fd, start, end) {
        if (![start, end].every(Number.isSafeInteger) || start < 0 || end < start) fail('RESOURCE_LIMIT', 'Unsafe JSON range');
        this.fd = fd; this.offset = start; this.end = end;
        this.buffer = Buffer.alloc(0); this.index = 0; this.capture = null;
    }
    peek() {
        if (this.index === this.buffer.length && this.offset < this.end) {
            this.buffer = Buffer.allocUnsafe(Math.min(CHUNK, this.end - this.offset));
            const n = fs.readSync(this.fd, this.buffer, 0, this.buffer.length, this.offset);
            if (!n) fail('CHANGED_INPUT', 'Unexpected manifest EOF');
            this.buffer = this.buffer.subarray(0, n); this.index = 0;
        }
        return this.index < this.buffer.length ? this.buffer[this.index] : undefined;
    }
    advance(n = 1) {
        if (this.capture) {
            const c = this.capture, needed = c.length + n;
            if (needed > TOKEN) fail('RESOURCE_LIMIT', 'Raw JSON token exceeds 1 MiB');
            if (needed > c.buffer.length) {
                const grown = Buffer.allocUnsafe(Math.min(TOKEN, Math.max(needed, c.buffer.length * 2)));
                c.buffer.copy(grown, 0, 0, c.length); c.buffer = grown;
            }
            this.buffer.copy(c.buffer, c.length, this.index, this.index + n); c.length = needed;
        }
        this.index += n; this.offset += n;
    }
    raw(fn) {
        if (this.capture) throw new Error('Nested scanner capture');
        const c = {buffer: Buffer.allocUnsafe(256), length: 0}; this.capture = c;
        try { fn(); return c.buffer.subarray(0, c.length); }
        finally { this.capture = null; }
    }
    ws() { while (space(this.peek())) this.advance(); }
    expect(c) { if (this.peek() !== c) invalid(); this.advance(); }
    string() {
        this.expect(34);
        for (;;) {
            const c = this.peek(); if (c === undefined || c < 32) invalid();
            if (c === 34) { this.advance(); return; }
            if (c === 92) {
                this.advance(); const escape = this.peek(); this.advance();
                if (escape === 117) for (let i = 0; i < 4; i++) {
                    const h = this.peek();
                    if (!(digit(h) || (h >= 65 && h <= 70) || (h >= 97 && h <= 102))) invalid();
                    this.advance();
                }
                else if (![34, 92, 47, 98, 102, 110, 114, 116].includes(escape)) invalid();
            } else {
                // Scan runs within the current chunk, without per-byte awaits,
                // retained skipped tokens or an allocation per character.
                let end = this.index + 1;
                while (end < this.buffer.length && this.buffer[end] >= 32 && this.buffer[end] !== 34 && this.buffer[end] !== 92) end++;
                this.advance(end - this.index);
            }
        }
    }
    digits() {
        if (!digit(this.peek())) invalid();
        while (digit(this.peek())) {
            let end = this.index + 1; while (end < this.buffer.length && digit(this.buffer[end])) end++;
            this.advance(end - this.index);
        }
    }
    primitive() {
        let c = this.peek();
        if (c === 34) { this.string(); return 'string'; }
        const word = c === 110 ? 'null' : c === 116 ? 'true' : c === 102 ? 'false' : null;
        if (word) { for (const ch of word) this.expect(ch.charCodeAt(0)); return word === 'null' ? 'null' : 'boolean'; }
        if (c === 45) { this.advance(); c = this.peek(); }
        if (c === 48) this.advance(); else this.digits();
        if (this.peek() === 46) { this.advance(); this.digits(); }
        c = this.peek();
        if (c === 101 || c === 69) {
            this.advance(); c = this.peek(); if (c === 43 || c === 45) this.advance(); this.digits();
        }
        return 'number';
    }
    // `fields` observes only immediate properties of this object. Nested
    // objects have no retained keys/path arrays. Descriptors are constant size.
    value(depth = 0, fields = null, scalar = false) {
        this.ws(); const start = this.offset, c = this.peek(); let kind, count = 0, value;
        if (c === 123 || c === 91) {
            if (depth >= 1024) fail('RESOURCE_LIMIT', 'JSON nesting exceeds 1024 containers');
            const object = c === 123, close = object ? 125 : 93; kind = object ? 'object' : 'array';
            this.advance(); this.ws();
            if (this.peek() !== close) for (;;) {
                let key;
                if (object) {
                    if (fields) key = JSON.parse(decodeBounded(this.raw(() => this.string())));
                    else this.string();
                    this.ws(); this.expect(58);
                }
                const wanted = object && fields?.keys.has(key);
                if (!wanted) key = undefined; // Do not retain a large unknown ancestor key.
                const child = this.value(depth + 1, null, !!wanted && fields.scalarKeys.has(key));
                if (wanted) fields.accept(key, child);
                count++; this.ws(); if (this.peek() === close) break;
                this.expect(44); this.ws();
            }
            this.expect(close);
        } else if (scalar) {
            const raw = this.raw(() => { kind = this.primitive(); }); value = JSON.parse(decodeBounded(raw));
        } else kind = this.primitive();
        return {start, end: this.offset, kind, count, value};
    }
    eof() { this.ws(); if (this.peek() !== undefined) invalid(); }
    *elements() {
        this.ws(); this.expect(91); this.ws();
        if (this.peek() !== 93) for (;;) {
            const raw = this.raw(() => this.value());
            yield JSON.parse(decodeBounded(raw));
            this.ws(); if (this.peek() === 93) break;
            this.expect(44); this.ws();
        }
        this.expect(93); this.eof();
    }
}

// Count native JSON encoding without constructing a possibly oversized output
// string. Inputs are native JSON.parse results, so there are no getters/toJSON.
export function measureNative(value) {
    let bytes = 0;
    const add = n => { bytes += n; if (bytes > TOKEN) fail('RESOURCE_LIMIT', 'Encoded JSON value exceeds 1 MiB'); };
    const string = text => {
        add(2);
        for (let i = 0; i < text.length;) {
            let end = Math.min(i + 8192, text.length);
            if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
            add(Buffer.byteLength(JSON.stringify(text.slice(i, end))) - 2); i = end;
        }
    };
    const visit = v => {
        if (typeof v === 'string') string(v);
        else if (v === null || typeof v !== 'object') add(Buffer.byteLength(JSON.stringify(v)));
        else {
            add(2); let first = true;
            for (const key of Object.keys(v)) {
                if (!first) add(1); first = false;
                if (!Array.isArray(v)) { string(key); add(1); }
                visit(v[key]);
            }
        }
    };
    visit(value); return bytes;
}
