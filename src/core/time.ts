/** 75_000 → "1:15", 3_725_000 → "1:02:05" */
export function clock(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');

    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function megabytes(bytes: number): string {
    return `${(bytes / 1048576).toFixed(1)} MB`;
}
