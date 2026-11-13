import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { ApiError, CompanionApi, normaliseServer } from '../core/api';
import { normaliseCode } from '../core/pairing';
import type { Profile } from '../core/types';
import { UploadQueue } from '../core/uploadQueue';
import { clearCredentials, loadCredentials, saveCredentials } from '../platform/credentials';
import { expoFiles, expoStore } from '../platform/files';

type Status = 'loading' | 'unpaired' | 'ready';

interface AppState {
    status: Status;
    profile: Profile | null;
    api: CompanionApi | null;
    queue: UploadQueue;
    pair(server: string, code: string): Promise<void>;
    unpair(): Promise<void>;
    refreshProfile(): Promise<void>;
}

/** One upload queue for the whole app, so uploads continue whichever screen is open. */
const queue = new UploadQueue(null, expoFiles, expoStore);
const Context = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<Status>('loading');
    const [api, setApi] = useState<CompanionApi | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);

    const connect = useCallback(async (client: CompanionApi) => {
        setApi(client);
        queue.setApi(client);
        setStatus('ready');
        void queue.run();
        try {
            const me = await client.me();
            setProfile(me);
            await expoStore.set('profile', JSON.stringify(me));
        } catch (e) {
            if (e instanceof ApiError && e.kind === 'unpaired') {
                queue.setApi(null);
                setStatus('unpaired');
            }
            // Offline: carry on with what we had.
        }
    }, []);

    useEffect(() => {
        (async () => {
            await queue.load();
            const saved = await loadCredentials();
            const cached = await expoStore.get('profile');
            if (cached) setProfile(JSON.parse(cached) as Profile);
            if (saved) await connect(new CompanionApi(saved.server, saved.token));
            else setStatus('unpaired');
        })();
    }, [connect]);

    // If the server says the phone is no longer paired, go back to pairing (uploads are kept).
    useEffect(() => queue.subscribe((s) => { if (s.blocked === 'unpaired') setStatus('unpaired'); }), []);

    const pair = useCallback(async (serverInput: string, code: string) => {
        const server = normaliseServer(serverInput);
        const name = Device.deviceName ?? Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
        const result = await new CompanionApi(server, null).pair(normaliseCode(code), name, Platform.OS, Application.nativeApplicationVersion ?? '1.0.0');
        await saveCredentials(server, result.token);
        const { token, ...me } = result;
        setProfile(me);
        await expoStore.set('profile', JSON.stringify(me));
        await connect(new CompanionApi(server, token));
    }, [connect]);

    const unpair = useCallback(async () => {
        if (api) {
            try {
                await api.unpair();
            } catch (error) {
                if (!(error instanceof ApiError && error.kind === 'unpaired')) throw error;
            }
        }
        await clearCredentials();
        queue.setApi(null);
        setApi(null);
        setProfile(null);
        setStatus('unpaired');
    }, [api]);

    const refreshProfile = useCallback(async () => {
        if (api) setProfile(await api.me());
    }, [api]);

    const value = useMemo(() => ({ status, profile, api, queue, pair, unpair, refreshProfile }), [status, profile, api, pair, unpair, refreshProfile]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp(): AppState {
    const ctx = useContext(Context);
    if (!ctx) throw new Error('useApp outside AppStateProvider');
    return ctx;
}

export function useQueue() {
    const { queue } = useApp();
    const [snapshot, setSnapshot] = useState(queue.snapshot());
    useEffect(() => queue.subscribe(setSnapshot), [queue]);
    return snapshot;
}
