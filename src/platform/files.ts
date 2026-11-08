import { Directory, File, Paths } from 'expo-file-system';
import type { FileStore, KeyValueStore } from '../core/uploadQueue';

/** Audio files in the app's private document folder. */
export const expoFiles: FileStore = {
    async size(uri) {
        return new File(uri).size;
    },
    async read(uri, offset, length) {
        const handle = new File(uri).open();
        try {
            handle.offset = offset;
            return handle.readBytesSync(length);
        } finally {
            handle.close();
        }
    },
    async sha256(uri) {
        return (await new File(uri).digest('SHA-256')).toLowerCase();
    },
    async exists(uri) {
        return new File(uri).exists;
    },
    async remove(uri) {
        const f = new File(uri);
        if (f.exists) f.delete();
    },
};

/** Recordings waiting to upload live here (never in the cache folder, which the OS may clear). */
export function recordingsDirectory(): Directory {
    const dir = new Directory(Paths.document, 'recordings');
    if (!dir.exists) dir.create({ intermediates: true });
    return dir;
}

/** Move a finished recording out of the recorder's folder into ours; returns its new uri. */
export function keepRecording(uri: string, name: string): string {
    const target = new File(recordingsDirectory(), `${name}.m4a`);
    if (target.exists) target.delete();
    new File(uri).moveSync(target);
    return target.uri;
}

/** Small JSON state (upload queue, cached meetings) in the private document folder. */
export const expoStore: KeyValueStore = {
    async get(key) {
        const f = stateFile(key);
        return f.exists ? f.text() : null;
    },
    async set(key, value) {
        const f = stateFile(key);
        if (!f.exists) f.create({ intermediates: true });
        f.write(value);
    },
};

function stateFile(key: string): File {
    return new File(Paths.document, 'state', `${key.replace(/[^a-z0-9-]/gi, '_')}.json`);
}
