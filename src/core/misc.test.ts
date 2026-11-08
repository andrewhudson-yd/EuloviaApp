import { ApiError, CompanionApi, normaliseServer } from './api';
import { consentProblems } from './consent';
import { normaliseCode, parsePairingLink } from './pairing';
import { clock } from './time';

test('reads the pairing QR code', () => {
    expect(parsePairingLink('celebrantcompanion://pair?server=https%3A%2F%2Fapp.example.test&code=YA78C-ZZ6FU')).toEqual({ server: 'https://app.example.test', code: 'YA78C-ZZ6FU' });
    expect(parsePairingLink('https://evil.example.test/?server=x&code=y')).toBeNull();
    expect(parsePairingLink('not a url')).toBeNull();
    expect(normaliseCode('ya78c zz6fu')).toBe('YA78C-ZZ6FU');
});

test('server addresses must be https (except local development)', () => {
    expect(normaliseServer('practice.example.test/')).toBe('https://practice.example.test');
    expect(normaliseServer('https://practice.example.test/app/')).toBe('https://practice.example.test/app');
    expect(() => normaliseServer('http://practice.example.test')).toThrow(/https/);
    expect(normaliseServer('http://localhost:8000')).toBe('http://localhost:8000');
});

test('consent blocks recording unless everyone named has agreed and it is confirmed', () => {
    expect(consentProblems([], true)).toEqual(['Add the people who are here.']);
    expect(consentProblems([{ name: 'Rosa', relationship: null, agreed: true }, { name: 'Ben', relationship: null, agreed: false }], true)[0]).toMatch(/Ben/);
    expect(consentProblems([{ name: 'Rosa', relationship: null, agreed: true }], false)).toEqual(['Confirm that everyone present agreed.']);
    expect(consentProblems([{ name: 'Rosa', relationship: null, agreed: true }, { name: ' ', relationship: null, agreed: false }], true)).toEqual([]);
});

test('api errors carry what the app needs to decide what to do', async () => {
    const api = new CompanionApi('https://x.test', 't', async () => ({ ok: false, status: 422, json: async () => ({ message: 'x', errors: { consent: ['Everyone present must agree.'] } }) }));
    await expect(api.me()).rejects.toMatchObject({ kind: 'invalid', message: 'Everyone present must agree.' });
    const offline = new CompanionApi('https://x.test', 't', async () => { throw new TypeError('Network request failed'); });
    const err = (await offline.me().catch((e: unknown) => e)) as ApiError;
    expect(err.kind).toBe('network');
    expect(err.retryable).toBe(true);
});

test('formats meeting time', () => {
    expect(clock(75_000)).toBe('1:15');
    expect(clock(3_725_000)).toBe('1:02:05');
});
