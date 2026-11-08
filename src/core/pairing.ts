/** What a pairing QR code contains: celebrantcompanion://pair?server=…&code=… */
export interface PairingDetails {
    server: string;
    code: string;
}

export function parsePairingLink(text: string): PairingDetails | null {
    try {
        const url = new URL(text.trim());
        if (url.protocol !== 'celebrantcompanion:') return null;
        // "celebrantcompanion://pair?…" parses with host "pair" on most engines.
        if (url.host !== 'pair' && !url.pathname.replace(/^\/+/, '').startsWith('pair')) return null;
        const server = url.searchParams.get('server');
        const code = url.searchParams.get('code');

        return server && code ? { server, code: normaliseCode(code) } : null;
    } catch {
        return null;
    }
}

/** "ya78c zz6fu" → "YA78C-ZZ6FU" (the server ignores separators and case). */
export function normaliseCode(code: string): string {
    const plain = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

    return plain.length === 10 ? `${plain.slice(0, 5)}-${plain.slice(5)}` : plain;
}
