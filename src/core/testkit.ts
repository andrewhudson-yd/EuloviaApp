import { createHash } from 'node:crypto';
import type { Fetch } from './api';
import type { FileStore, KeyValueStore } from './uploadQueue';

export class MemoryFiles implements FileStore {
    files = new Map<string, Uint8Array>();
    async size(uri: string) { return this.get(uri).length; }
    async read(uri: string, offset: number, length: number) { return this.get(uri).slice(offset, offset + length); }
    async sha256(uri: string) { return createHash('sha256').update(this.get(uri)).digest('hex'); }
    async exists(uri: string) { return this.files.has(uri); }
    async remove(uri: string) { this.files.delete(uri); }
    private get(uri: string) {
        const f = this.files.get(uri);
        if (!f) throw new Error(`no file ${uri}`);
        return f;
    }
}

export class MemoryStore implements KeyValueStore {
    data = new Map<string, string>();
    async get(k: string) { return this.data.get(k) ?? null; }
    async set(k: string, v: string) { this.data.set(k, v); }
}

/** A tiny fake of the server's upload endpoints, with switches to simulate trouble. */
export class FakeServer {
    chunks = new Map<string, Map<number, Uint8Array>>();
    uploaded = new Map<string, { sha256: string; bytes: Uint8Array }>();
    finished: string[] = [];
    markers: number[] = [];
    calls: string[] = [];
    offline = false;
    failNextPuts = 0;
    unpaired = false;
    corruptNextComplete = false;

    fetch: Fetch = async (url, init) => {
        const path = url.replace(/^.*\/api\/v1\/companion/, '');
        const method = init?.method ?? 'GET';
        this.calls.push(`${method} ${path}`);
        if (this.offline) throw new TypeError('Network request failed');
        if (this.unpaired) return reply(401, { message: 'Please pair this phone again.' });

        let m;
        if ((m = path.match(/^\/recordings\/(\w+)\/files\/(part|intro)\/(\d+)$/)) && method === 'GET') {
            const key = `${m[1]}:${m[2]}:${m[3]}`;
            return reply(200, { uploaded: this.uploaded.has(key), received: [...(this.chunks.get(key)?.keys() ?? [])].sort((a, b) => a - b) });
        }
        if ((m = path.match(/^\/recordings\/(\w+)\/files\/(part|intro)\/(\d+)\/chunks\/(\d+)$/)) && method === 'PUT') {
            if (this.failNextPuts > 0) { this.failNextPuts--; return reply(503, { message: 'Busy' }); }
            const key = `${m[1]}:${m[2]}:${m[3]}`;
            if (!this.chunks.has(key)) this.chunks.set(key, new Map());
            this.chunks.get(key)!.set(Number(m[4]), init!.body as Uint8Array);
            return reply(200, { received: Number(m[4]) });
        }
        if ((m = path.match(/^\/recordings\/(\w+)\/files\/(part|intro)\/(\d+)\/complete$/)) && method === 'POST') {
            const key = `${m[1]}:${m[2]}:${m[3]}`;
            const meta = JSON.parse(init!.body as string);
            const parts = this.chunks.get(key) ?? new Map();
            const joined = Buffer.concat([...Array(meta.chunks).keys()].map((i) => Buffer.from(parts.get(i) ?? new Uint8Array())));
            const sha = createHash('sha256').update(joined).digest('hex');
            if (this.corruptNextComplete || sha !== meta.sha256 || joined.length !== meta.size) {
                this.corruptNextComplete = false;
                this.chunks.delete(key);
                return reply(422, { message: 'damaged', errors: { file: ['The file arrived damaged. Send it again from the start.'] } });
            }
            this.uploaded.set(key, { sha256: sha, bytes: joined });
            this.chunks.delete(key);
            return reply(200, { uploaded: true, recording: {} });
        }
        if ((m = path.match(/^\/recordings\/(\w+)\/finish$/))) {
            this.finished.push(m[1]!);
            return reply(200, { recording: { id: m[1], status: 'queued' } });
        }
        if ((m = path.match(/^\/recordings\/(\w+)\/markers$/))) {
            this.markers.push(JSON.parse(init!.body as string).at_ms);
            return reply(201, { marker: {} });
        }
        return reply(404, { message: 'Not found' });
    };
}

function reply(status: number, body: unknown) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

export function bytes(n: number, seed = 1): Uint8Array {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) % 251;
    return b;
}
