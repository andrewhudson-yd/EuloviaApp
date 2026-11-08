import { CompanionApi } from './api';
import { bytes, FakeServer, MemoryFiles, MemoryStore } from './testkit';
import { UploadQueue } from './uploadQueue';

function setup() {
    const server = new FakeServer();
    const files = new MemoryFiles();
    const store = new MemoryStore();
    let now = 1_000_000;
    const clock = { now: () => now, advance: (ms: number) => (now += ms) };
    const api = new CompanionApi('https://practice.example.test', 'cmp_test', server.fetch);
    // Sleeping just moves the fake clock forward, so back-off is instant in tests.
    const queue = new UploadQueue(api, files, store, 1000, clock.now, async (ms) => { clock.advance(ms); });
    return { server, files, store, queue, clock };
}

const part = (recordingId: string, position: number, uri: string) => ({
    recordingId, meetingLabel: 'Margaret Imaginary', kind: 'part' as const, position, uri, durationMs: 1800000, offsetMs: (position - 1) * 1800000,
});

test('uploads a file in chunks, verified, then deletes the phone copy', async () => {
    const { server, files, queue } = setup();
    files.files.set('file://p1', bytes(2500));
    await queue.addFile(part('rec1', 1, 'file://p1'));
    await queue.addFinish({ recordingId: 'rec1', meetingLabel: 'M', parts: 1, durationMs: 1800000, endedAt: '2026-11-04T12:00:00Z' });
    await queue.run();

    expect(server.uploaded.get('rec1:part:1')?.bytes).toEqual(Buffer.from(bytes(2500)));
    expect(server.calls.filter((c) => c.startsWith('PUT'))).toHaveLength(3); // 1000 + 1000 + 500
    expect(files.files.has('file://p1')).toBe(false);
    expect(server.finished).toEqual(['rec1']);
    expect(queue.snapshot().jobs).toEqual([]);
});

test('sends "finished" only after the recording’s files', async () => {
    const { server, files, queue } = setup();
    await queue.addFinish({ recordingId: 'rec1', meetingLabel: 'M', parts: 2, durationMs: 1, endedAt: 'x' });
    files.files.set('a', bytes(10));
    files.files.set('b', bytes(10, 2));
    await queue.addFile(part('rec1', 1, 'a'));
    await queue.addFile(part('rec1', 2, 'b'));
    await queue.run();

    const order = server.calls.filter((c) => c.includes('complete') || c.includes('finish'));
    expect(order).toEqual(['POST /recordings/rec1/files/part/1/complete', 'POST /recordings/rec1/files/part/2/complete', 'POST /recordings/rec1/finish']);
});

test('resumes: chunks the server already has are not sent again', async () => {
    const { server, files, queue } = setup();
    const data = bytes(3000);
    files.files.set('p', data);
    server.chunks.set('rec1:part:1', new Map([[0, data.slice(0, 1000)], [1, data.slice(1000, 2000)]]));
    await queue.addFile(part('rec1', 1, 'p'));
    await queue.run();

    expect(server.calls.filter((c) => c.startsWith('PUT'))).toEqual(['PUT /recordings/rec1/files/part/1/chunks/2']);
    expect(server.uploaded.has('rec1:part:1')).toBe(true);
});

test('keeps everything and retries with back-off when offline or the server is busy', async () => {
    const { server, files, queue, store } = setup();
    files.files.set('p', bytes(1500));
    server.offline = true;
    await queue.addFile(part('rec1', 1, 'p'));
    // Comes back online during back-off.
    let sleeps = 0;
    const q2 = new (queue.constructor as typeof UploadQueue)(new CompanionApi('https://x.test', 't', server.fetch), files, store, 1000, Date.now, async () => {
        sleeps++;
        if (sleeps === 2) server.offline = false;
        if (sleeps === 3) server.failNextPuts = 1;
    });
    await q2.run();

    expect(server.uploaded.has('rec1:part:1')).toBe(true);
    expect(files.files.has('p')).toBe(false);
    expect(sleeps).toBeGreaterThanOrEqual(2);
});

test('starts the file again if the server says it arrived damaged', async () => {
    const { server, files, queue } = setup();
    files.files.set('p', bytes(1200));
    server.corruptNextComplete = true;
    await queue.addFile(part('rec1', 1, 'p'));
    await queue.run();

    expect(server.uploaded.has('rec1:part:1')).toBe(true);
    expect(server.calls.filter((c) => c.startsWith('PUT'))).toHaveLength(4); // 2 chunks, twice
});

test('stops without losing anything when the phone has been unpaired', async () => {
    const { server, files, queue, store } = setup();
    files.files.set('p', bytes(100));
    server.unpaired = true;
    await queue.addFile(part('rec1', 1, 'p'));
    await queue.run();

    expect(queue.snapshot().blocked).toBe('unpaired');
    expect(files.files.has('p')).toBe(true);
    expect(JSON.parse((await store.get('upload-queue-v1'))!)).toHaveLength(1);
});

test('survives the app closing: a new queue picks up where the old one stopped', async () => {
    const { server, files, store } = setup();
    files.files.set('p', bytes(2000));
    const api = new CompanionApi('https://x.test', 't', server.fetch);
    const first = new UploadQueue(null, files, store, 1000); // no connection configured yet
    await first.addFile(part('rec1', 1, 'p'));

    const second = new UploadQueue(api, files, store, 1000);
    await second.run();
    expect(server.uploaded.has('rec1:part:1')).toBe(true);
});

test('marks a job failed (not retried forever) when its file has vanished', async () => {
    const { queue } = setup();
    await queue.addFile(part('rec1', 1, 'missing'));
    await queue.run();

    const [job] = queue.snapshot().jobs;
    expect(job?.status).toBe('failed');
    expect(job?.lastError).toMatch(/missing/);
});
