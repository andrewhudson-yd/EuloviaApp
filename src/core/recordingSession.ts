/** The phone's recorder, reduced to what a session needs (expo-audio in the app, a fake in tests). */
export interface Recorder {
    /** Begin a new file. */
    start(fileName: string): Promise<void>;
    pause(): void;
    resume(): void;
    /** Stop and return the finished file. */
    stop(): Promise<{ uri: string; durationMs: number }>;
    /** Audio recorded so far in the current file (pauses excluded). */
    currentMs(): number;
}

export interface FinishedPart {
    position: number;
    uri: string;
    durationMs: number;
    /** Where this part starts in the meeting (sum of earlier parts). */
    offsetMs: number;
}

/**
 * One meeting recording, split into parts of `partMs` (30 minutes) so that each file stays well
 * under the transcription limit and an interruption costs at most one part. Times are "meeting
 * time": audio actually recorded, so pauses do not create gaps in the transcript.
 */
export class RecordingSession {
    private position = 0;
    private offsetMs = 0;
    private paused = false;
    private stopped = false;
    private partOpen = false;
    private pendingPart: FinishedPart | null = null;
    private rotating: Promise<void> | null = null;
    readonly parts: FinishedPart[] = [];

    constructor(
        public readonly recordingId: string,
        private readonly recorder: Recorder,
        private readonly partMs: number,
        private readonly onPart: (part: FinishedPart) => Promise<void> | void,
    ) {}

    async begin(): Promise<void> {
        await this.startPart();
    }

    get isPaused(): boolean {
        return this.paused;
    }

    get isStopped(): boolean {
        return this.stopped;
    }

    get currentPart(): number {
        return this.position;
    }

    /** Meeting time now, in ms. */
    elapsedMs(): number {
        return this.offsetMs + (this.partOpen ? this.recorder.currentMs() : 0);
    }

    pause(): void {
        if (!this.partOpen || this.rotating || this.paused) return;
        this.recorder.pause();
        this.paused = true;
    }

    resume(): void {
        if (!this.partOpen || this.rotating || !this.paused) return;
        this.recorder.resume();
        this.paused = false;
    }

    /** Call regularly (e.g. every second): starts a new part when the current one is full. */
    async tick(): Promise<void> {
        if (this.stopped || this.paused || this.rotating) return;
        if (!this.partOpen || this.recorder.currentMs() >= this.partMs) {
            this.rotating = (async () => {
                await this.finishPart();
                await this.startPart();
            })().finally(() => (this.rotating = null));
            await this.rotating;
        }
    }

    /** Stop for good. Returns the totals for the server. */
    async stop(): Promise<{ parts: number; durationMs: number }> {
        if (this.rotating) await this.rotating;
        if (!this.stopped) {
            if (this.paused) this.recorder.resume();
            await this.finishPart();
            this.stopped = true;
        }

        return { parts: this.parts.length, durationMs: this.offsetMs };
    }

    private async startPart(): Promise<void> {
        const position = this.position + 1;
        await this.recorder.start(`rec-${this.recordingId}-part-${position}`);
        this.position = position;
        this.partOpen = true;
    }

    private async finishPart(): Promise<void> {
        if (this.partOpen) {
            const { uri, durationMs } = await this.recorder.stop();
            this.partOpen = false;
            this.paused = false;
            this.pendingPart = { position: this.position, uri, durationMs, offsetMs: this.offsetMs };
            this.offsetMs += durationMs;
        }
        if (this.pendingPart) {
            await this.onPart(this.pendingPart);
            this.parts.push(this.pendingPart);
            this.pendingPart = null;
        }
    }
}
