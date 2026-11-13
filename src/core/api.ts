import type { Attendee, DiaryMonth, FileKind, MeetingItem, Profile, RecordingSummary, ServiceItem } from './types';

export type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array }) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;

/** A failed API call. `kind` tells the app what to do about it. */
export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly kind: 'network' | 'unpaired' | 'invalid' | 'gone' | 'server',
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
        this.name = 'ApiError';
    }

    /** Worth trying again later (no connection, or the server had a problem). */
    get retryable(): boolean {
        return this.kind === 'network' || this.kind === 'server';
    }
}

/** Accepts "practice.example.co.uk", "https://…/", etc.; returns "https://host[/path]" without a trailing slash. */
export function normaliseServer(input: string): string {
    let s = input.trim();
    if (s === '') throw new Error('Enter your server address.');
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    const url = new URL(s);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname) && !url.hostname.endsWith('.local')) {
        throw new Error('The server address must start with https://');
    }

    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

/** Talks to /api/v1/companion. Every call except pair() needs the device token. */
export class CompanionApi {
    constructor(
        public readonly server: string,
        private readonly token: string | null,
        private readonly fetchImpl: Fetch = (globalThis.fetch as unknown as Fetch),
    ) {}

    withToken(token: string): CompanionApi {
        return new CompanionApi(this.server, token, this.fetchImpl);
    }

    pair(code: string, deviceName: string, platform: string, appVersion: string): Promise<Profile & { token: string }> {
        return this.request('POST', '/pair', { code, device_name: deviceName, platform, app_version: appVersion });
    }

    me(): Promise<Profile> {
        return this.request('GET', '/me');
    }

    unpair(): Promise<{ unpaired: boolean }> {
        return this.request('DELETE', '/me');
    }

    async meetings(): Promise<MeetingItem[]> {
        return (await this.request<{ meetings: MeetingItem[] }>('GET', '/meetings')).meetings;
    }

    async services(): Promise<ServiceItem[]> {
        return (await this.request<{ services: ServiceItem[] }>('GET', '/services')).services;
    }

    diary(month: string): Promise<DiaryMonth> {
        return this.request('GET', `/diary?month=${encodeURIComponent(month)}`);
    }

    startStandaloneRecording(startedAt: string, scriptVersion: number): Promise<RecordingSummary> {
        return this.createRecording('/recordings', [], startedAt, scriptVersion);
    }

    async startRecording(meetingId: string, attendees: Attendee[], startedAt: string, scriptVersion: number): Promise<RecordingSummary> {
        return this.createRecording(`/meetings/${meetingId}/recordings`, attendees, startedAt, scriptVersion);
    }

    async startServiceRecording(serviceId: string, attendees: Attendee[], startedAt: string, scriptVersion: number): Promise<RecordingSummary> {
        return this.createRecording(`/services/${serviceId}/recordings`, attendees, startedAt, scriptVersion);
    }

    private async createRecording(path: string, attendees: Attendee[], startedAt: string, scriptVersion: number): Promise<RecordingSummary> {
        return (await this.request<{ recording: RecordingSummary }>('POST', path, {
            started_at: startedAt,
            consent: { confirmed: true, script_version: scriptVersion, attendees },
        })).recording;
    }

    async recording(id: string): Promise<RecordingSummary> {
        return (await this.request<{ recording: RecordingSummary }>('GET', `/recordings/${id}`)).recording;
    }

    marker(recordingId: string, atMs: number, label: string | null): Promise<unknown> {
        return this.request('POST', `/recordings/${recordingId}/markers`, { at_ms: Math.round(atMs), label });
    }

    fileState(recordingId: string, kind: FileKind, position: number): Promise<{ uploaded: boolean; received: number[] }> {
        return this.request('GET', `/recordings/${recordingId}/files/${kind}/${position}`);
    }

    putChunk(recordingId: string, kind: FileKind, position: number, index: number, bytes: Uint8Array): Promise<unknown> {
        return this.request('PUT', `/recordings/${recordingId}/files/${kind}/${position}/chunks/${index}`, bytes);
    }

    completeFile(recordingId: string, kind: FileKind, position: number, meta: { chunks: number; sha256: string; size: number; duration_ms?: number | null; offset_ms?: number | null }): Promise<{ uploaded: boolean; recording: RecordingSummary }> {
        return this.request('POST', `/recordings/${recordingId}/files/${kind}/${position}/complete`, meta);
    }

    async finish(recordingId: string, parts: number, durationMs: number, endedAt: string): Promise<RecordingSummary> {
        return (await this.request<{ recording: RecordingSummary }>('POST', `/recordings/${recordingId}/finish`, {
            parts, duration_ms: Math.round(durationMs), ended_at: endedAt,
        })).recording;
    }

    private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (this.token) headers.Authorization = `Bearer ${this.token}`;
        let payload: string | Uint8Array | undefined;
        if (body instanceof Uint8Array) {
            headers['Content-Type'] = 'application/octet-stream';
            payload = body;
        } else if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            payload = JSON.stringify(body);
        }

        let res;
        try {
            res = await this.fetchImpl(`${this.server}/api/v1/companion${path}`, { method, headers, body: payload });
        } catch {
            throw new ApiError('No connection to your practice’s server.', 0, 'network');
        }

        const data = (await res.json().catch(() => ({}))) as { message?: string; errors?: Record<string, string[]> };
        if (res.ok) return data as T;

        const firstError = Object.values(data.errors ?? {})[0]?.[0];
        const message = firstError ?? data.message ?? `The server returned an error (${res.status}).`;
        const kind = res.status === 401 ? 'unpaired' : res.status === 404 ? 'gone' : res.status === 422 ? 'invalid' : res.status === 429 || res.status >= 500 ? 'server' : 'invalid';
        throw new ApiError(message, res.status, kind, data.errors ?? {});
    }
}
