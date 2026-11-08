/**
 * Runs the app's own code (API client, recording session, upload queue) against a real server.
 * Skipped unless COMPANION_TEST_SERVER is set. From the repository root:
 *
 *   php artisan migrate:fresh --seed
 *   MAIL_MAILER=log QUEUE_CONNECTION=sync AI_DRIVER=fake php artisan serve --port=8123 &
 *   cd companion && COMPANION_TEST_SERVER=http://127.0.0.1:8123 npm run test:server
 *
 * A pairing code is created for the seeded demo celebrant with `php artisan tinker`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompanionApi, type Fetch } from '../../src/core/api';
import { RecordingSession, type Recorder } from '../../src/core/recordingSession';
import { UploadQueue, type FileStore } from '../../src/core/uploadQueue';
import { MemoryStore } from '../../src/core/testkit';

const server = process.env.COMPANION_TEST_SERVER;
const repo = join(__dirname, '../../..');
const maybe = server ? test : test.skip;

const nodeFiles: FileStore = {
    async size(uri) { return statSync(uri).size; },
    async read(uri, offset, length) { return new Uint8Array(readFileSync(uri).subarray(offset, offset + length)); },
    async sha256(uri) { return createHash('sha256').update(readFileSync(uri)).digest('hex'); },
    async exists(uri) { return existsSync(uri); },
    async remove(uri) { rmSync(uri, { force: true }); },
};

/** Node's fetch, with Uint8Array bodies passed through. */
const nodeFetch: Fetch = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<Fetch>;

maybe('pairs, records two parts with a marked moment, uploads in chunks and the server transcribes it', async () => {
    const code = execFileSync('php', ['artisan', 'tinker', '--execute', [
        '$u = App\\Modules\\Accounts\\Models\\User::where("email", "celebrant@example.test")->firstOrFail();',
        'app(App\\Core\\Tenancy\\CurrentTenant::class)->set($u->tenants()->firstOrFail());',
        'echo app(App\\Modules\\Companion\\Actions\\PairDevice::class)->createCode($u)["code"];',
    ].join(' ')], { cwd: repo }).toString().trim().split('\n').pop()!;
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const paired = await new CompanionApi(server!, null, nodeFetch).pair(code, 'Integration test phone', 'ios', 'test');
    const api = new CompanionApi(server!, paired.token, nodeFetch);
    expect(paired.practice.name).toBe('Ashdown Ceremonies');

    const meetings = await api.meetings();
    const meeting = meetings.find((m) => m.funeral.name?.includes('Harold')) ?? meetings[0]!;
    const recording = await api.startRecording(meeting.id, [{ name: 'Iris Nonesuch', relationship: 'Wife', agreed: true }], new Date().toISOString(), 1);

    // A "recorder" that produces real AAC files (the same ones the server tests use).
    const dir = mkdtempSync(join(tmpdir(), 'companion-it-'));
    const sources = [join(repo, 'tests/Fixtures/audio/tone.m4a'), join(repo, 'tests/Fixtures/audio/tone-android.mp4')];
    let ms = 0;
    let n = 0;
    const recorder: Recorder = {
        async start() { ms = 0; },
        pause() {}, resume() {},
        async stop() { const out = join(dir, `part-${++n}.m4a`); copyFileSync(sources[(n - 1) % 2]!, out); return { uri: out, durationMs: ms }; },
        currentMs() { return ms; },
    };

    const queue = new UploadQueue(api, nodeFiles, new MemoryStore(), 4096); // small chunks: exercise resumable upload
    const session = new RecordingSession(recording.id, recorder, 2000, async (part) => {
        await queue.addFile({ recordingId: recording.id, meetingLabel: 'IT', kind: 'part', position: part.position, uri: part.uri, durationMs: part.durationMs, offsetMs: part.offsetMs });
    });
    await session.begin();
    ms = 2000; await session.tick();          // part 1 full → part 2
    ms = 1500;
    await queue.addMarker({ recordingId: recording.id, meetingLabel: 'IT', atMs: session.elapsedMs(), label: 'Integration marker' });
    const totals = await session.stop();
    await queue.addFinish({ recordingId: recording.id, meetingLabel: 'IT', parts: totals.parts, durationMs: totals.durationMs, endedAt: new Date().toISOString() });
    await queue.run();

    expect(queue.snapshot().jobs).toEqual([]);
    expect(existsSync(join(dir, 'part-1.m4a'))).toBe(false); // phone copies deleted after confirmed upload

    let status = '';
    for (let i = 0; i < 30 && status !== 'ready'; i++) {
        status = (await api.recording(recording.id)).status;
        if (status !== 'ready') await new Promise((r) => setTimeout(r, 1000));
    }
    const final = await api.recording(recording.id);
    expect(final.status).toBe('ready');
    expect(final.expected_parts).toBe(2);
    expect(final.duration_ms).toBe(3500);

    await api.unpair();
    await expect(api.me()).rejects.toMatchObject({ kind: 'unpaired' });
}, 120_000);
