import { ApiError, type CompanionApi } from './api';
import type { FileKind } from './types';

/** Reading and deleting the audio files on the phone. */
export interface FileStore {
    size(uri: string): Promise<number>;
    read(uri: string, offset: number, length: number): Promise<Uint8Array>;
    sha256(uri: string): Promise<string>;
    exists(uri: string): Promise<boolean>;
    remove(uri: string): Promise<void>;
}

/** Somewhere to keep the queue between launches (survives the app being closed). */
export interface KeyValueStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}

export interface FileJob {
    type: 'file';
    id: string;
    recordingId: string;
    meetingLabel: string;
    kind: FileKind;
    position: number;
    uri: string;
    durationMs: number | null;
    offsetMs: number | null;
    size?: number;
    sha256?: string;
    sentBytes?: number;
}

export interface FinishJob {
    type: 'finish';
    id: string;
    recordingId: string;
    meetingLabel: string;
    parts: number;
    durationMs: number;
    endedAt: string;
}

export interface MarkerJob {
    type: 'marker';
    id: string;
    recordingId: string;
    meetingLabel: string;
    atMs: number;
    label: string | null;
}

export type Job = (FileJob | FinishJob | MarkerJob) & {
    status: 'waiting' | 'sending' | 'failed';
    attempts: number;
    nextAttemptAt: number;
    lastError?: string;
};

export interface QueueSnapshot {
    jobs: Job[];
    running: boolean;
    blocked: 'unpaired' | null;
}

const STORAGE_KEY = 'upload-queue-v1';
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Sends recordings to the server, safely:
 *  - persisted, so nothing is lost if the app closes or the phone restarts;
 *  - resumable: asks the server which chunks arrived and sends only the rest;
 *  - checked: the server compares size and SHA-256 before accepting a file;
 *  - the phone's copy is deleted only after the server confirms;
 *  - retries with back-off when offline; stops (keeping everything) if the phone is unpaired.
 * Files are sent in order, before the "finished" message for their recording.
 */
export class UploadQueue {
    private jobs: Job[] = [];
    private running = false;
    private blocked: QueueSnapshot['blocked'] = null;
    private listeners = new Set<(s: QueueSnapshot) => void>();
    private loaded = false;
    private wake: (() => void) | null = null;

    constructor(
        private api: CompanionApi | null,
        private readonly files: FileStore,
        private readonly store: KeyValueStore,
        private readonly chunkBytes = 1024 * 1024,
        private readonly now: () => number = Date.now,
        private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    ) {}

    setApi(api: CompanionApi | null): void {
        this.api = api;
        if (api) this.blocked = null;
        this.emit();
    }

    async load(): Promise<void> {
        if (this.loaded) return;
        const raw = await this.store.get(STORAGE_KEY);
        this.jobs = raw ? (JSON.parse(raw) as Job[]).map((j) => ({ ...j, status: j.status === 'sending' ? 'waiting' : j.status })) : [];
        this.loaded = true;
        this.emit();
    }

    subscribe(listener: (s: QueueSnapshot) => void): () => void {
        this.listeners.add(listener);
        listener(this.snapshot());

        return () => this.listeners.delete(listener);
    }

    snapshot(): QueueSnapshot {
        return { jobs: this.jobs.map((j) => ({ ...j })), running: this.running, blocked: this.blocked };
    }

    pendingFor(recordingId: string): number {
        return this.jobs.filter((j) => j.recordingId === recordingId).length;
    }

    async addFile(job: Omit<FileJob, 'type' | 'id'>): Promise<void> {
        await this.add({ type: 'file', id: `${job.recordingId}:${job.kind}:${job.position}`, ...job });
    }

    async addFinish(job: Omit<FinishJob, 'type' | 'id'>): Promise<void> {
        await this.add({ type: 'finish', id: `${job.recordingId}:finish`, ...job });
    }

    async addMarker(job: Omit<MarkerJob, 'type' | 'id'>): Promise<void> {
        await this.add({ type: 'marker', id: `${job.recordingId}:marker:${job.atMs}`, ...job });
    }

    /** Try failed or waiting jobs again now. */
    async retryAll(): Promise<void> {
        this.jobs = this.jobs.map((j) => ({ ...j, status: 'waiting', nextAttemptAt: 0 }));
        this.blocked = null;
        await this.persist();
        this.kick();
    }

    /** Give up on a recording's remaining uploads (deletes the phone's copies). */
    async discard(recordingId: string): Promise<void> {
        for (const j of this.jobs.filter((j) => j.recordingId === recordingId && j.type === 'file')) {
            await this.files.remove((j as FileJob).uri).catch(() => {});
        }
        this.jobs = this.jobs.filter((j) => j.recordingId !== recordingId);
        await this.persist();
    }

    /** Process until nothing is left that can be sent right now. Safe to call repeatedly. */
    async run(): Promise<void> {
        if (this.running) {
            this.kick();
            return;
        }
        await this.load();
        this.running = true;
        this.emit();
        try {
            for (;;) {
                if (!this.api || this.blocked) break;
                const job = this.next();
                if (!job) {
                    const waiting = this.jobs.filter((j) => j.status === 'waiting');
                    if (waiting.length === 0) break;
                    const soonest = Math.min(...waiting.map((j) => j.nextAttemptAt));
                    await Promise.race([this.sleep(Math.max(0, soonest - this.now())), new Promise<void>((r) => (this.wake = r))]);
                    continue;
                }
                await this.process(job);
            }
        } finally {
            this.running = false;
            this.emit();
        }
    }

    private next(): Job | undefined {
        const now = this.now();
        return this.jobs.find((j) => {
            if (j.status !== 'waiting' || j.nextAttemptAt > now) return false;
            // "Finished" waits until that recording's files have gone.
            if (j.type === 'finish') return !this.jobs.some((o) => o.recordingId === j.recordingId && o.type === 'file');
            return true;
        });
    }

    private async process(job: Job): Promise<void> {
        job.status = 'sending';
        this.emit();
        try {
            if (job.type === 'file') await this.sendFile(job);
            else if (job.type === 'finish') await this.api!.finish(job.recordingId, job.parts, job.durationMs, job.endedAt);
            else await this.api!.marker(job.recordingId, job.atMs, job.label);
            this.jobs = this.jobs.filter((j) => j !== job);
        } catch (e) {
            const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), 0, 'network');
            job.attempts += 1;
            job.lastError = err.message;
            if (err.kind === 'unpaired') {
                job.status = 'waiting';
                this.blocked = 'unpaired';
            } else if (err.retryable || (job.type === 'file' && err.kind === 'invalid' && job.attempts < 3)) {
                job.status = 'waiting';
                job.nextAttemptAt = this.now() + Math.min(MAX_BACKOFF_MS, 5000 * 2 ** (job.attempts - 1));
            } else {
                job.status = 'failed';
            }
        }
        await this.persist();
    }

    private async sendFile(job: FileJob & Job): Promise<void> {
        const api = this.api!;
        if (!(await this.files.exists(job.uri))) {
            throw new ApiError('The recording file is missing from this phone.', 0, 'gone');
        }
        if (job.size === undefined || job.sha256 === undefined) {
            job.size = await this.files.size(job.uri);
            job.sha256 = await this.files.sha256(job.uri);
            await this.persist();
        }
        const chunks = Math.max(1, Math.ceil(job.size / this.chunkBytes));

        const state = await api.fileState(job.recordingId, job.kind, job.position);
        if (!state.uploaded) {
            const received = new Set(state.received);
            for (let i = 0; i < chunks; i++) {
                if (received.has(i)) continue;
                const bytes = await this.files.read(job.uri, i * this.chunkBytes, Math.min(this.chunkBytes, job.size - i * this.chunkBytes));
                await api.putChunk(job.recordingId, job.kind, job.position, i, bytes);
                job.sentBytes = Math.min(job.size, (i + 1) * this.chunkBytes);
                this.emit();
            }
            await api.completeFile(job.recordingId, job.kind, job.position, {
                chunks, sha256: job.sha256, size: job.size, duration_ms: job.durationMs, offset_ms: job.offsetMs,
            });
        }
        // Only now is it safe to delete the phone's copy.
        await this.files.remove(job.uri);
    }

    private async add(job: FileJob | FinishJob | MarkerJob): Promise<void> {
        await this.load();
        this.jobs = [...this.jobs.filter((j) => j.id !== job.id), { ...job, status: 'waiting', attempts: 0, nextAttemptAt: 0 }];
        await this.persist();
        this.kick();
    }

    private kick(): void {
        this.wake?.();
        this.wake = null;
    }

    private async persist(): Promise<void> {
        await this.store.set(STORAGE_KEY, JSON.stringify(this.jobs));
        this.emit();
    }

    private emit(): void {
        const s = this.snapshot();
        this.listeners.forEach((l) => l(s));
    }
}
