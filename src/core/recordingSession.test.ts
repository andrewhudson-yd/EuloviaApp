import { RecordingSession, type FinishedPart, type Recorder } from './recordingSession';

class FakeRecorder implements Recorder {
    ms = 0;
    started: string[] = [];
    paused = false;
    async start(name: string) { this.started.push(name); this.ms = 0; }
    pause() { this.paused = true; }
    resume() { this.paused = false; }
    async stop() { return { uri: `file://${this.started.at(-1)}.m4a`, durationMs: this.ms }; }
    currentMs() { return this.ms; }
}

test('splits a long meeting into parts with meeting-relative offsets', async () => {
    const rec = new FakeRecorder();
    const parts: FinishedPart[] = [];
    const s = new RecordingSession('r1', rec, 30 * 60_000, (p) => { parts.push(p); });
    await s.begin();

    rec.ms = 30 * 60_000; await s.tick();
    rec.ms = 30 * 60_000; await s.tick();
    rec.ms = 12 * 60_000; await s.tick(); // not full yet
    expect(s.elapsedMs()).toBe(72 * 60_000);
    const totals = await s.stop();

    expect(rec.started).toEqual(['rec-r1-part-1', 'rec-r1-part-2', 'rec-r1-part-3']);
    expect(parts.map((p) => [p.position, p.offsetMs, p.durationMs])).toEqual([
        [1, 0, 1800000], [2, 1800000, 1800000], [3, 3600000, 720000],
    ]);
    expect(totals).toEqual({ parts: 3, durationMs: 72 * 60_000 });
});

test('does not split while paused, and resumes cleanly before stopping', async () => {
    const rec = new FakeRecorder();
    const s = new RecordingSession('r1', rec, 1000, () => {});
    await s.begin();
    s.pause();
    rec.ms = 5000;
    await s.tick();
    expect(rec.started).toHaveLength(1);
    expect(s.isPaused).toBe(true);
    await s.stop();
    expect(rec.paused).toBe(false);
    expect(s.isStopped).toBe(true);
});

test('stopping twice is harmless', async () => {
    const rec = new FakeRecorder();
    const parts: FinishedPart[] = [];
    const s = new RecordingSession('r1', rec, 1000, (p) => { parts.push(p); });
    await s.begin();
    rec.ms = 400;
    await s.stop();
    await s.stop();
    expect(parts).toHaveLength(1);
});

test('retries queuing a saved part without stopping the microphone twice', async () => {
    const rec = new FakeRecorder();
    const stop = jest.spyOn(rec, 'stop');
    const queue = jest.fn()
        .mockRejectedValueOnce(new Error('Storage unavailable'))
        .mockResolvedValueOnce(undefined);
    const session = new RecordingSession('r1', rec, 1000, queue);
    await session.begin();
    rec.ms = 400;

    await expect(session.stop()).rejects.toThrow('Storage unavailable');
    await expect(session.stop()).resolves.toEqual({ parts: 1, durationMs: 400 });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(queue.mock.calls[1]).toEqual(queue.mock.calls[0]);
});
