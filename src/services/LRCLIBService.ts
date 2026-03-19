export type LRCLine = {
    time: number;
    text: string;
};

export type LyricData = {
    trackId: string;
    syncedLyrics: LRCLine[] | null;
    plainLyrics: string[] | null;
};

// Parse LRC format timestamps like [01:23.45] into seconds
function parseLRC(lrc: string): LRCLine[] {
    const lines: LRCLine[] = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    for (const raw of lrc.split('\n')) {
        const match = regex.exec(raw.trim());
        if (match) {
            const min = parseInt(match[1], 10);
            const sec = parseInt(match[2], 10);
            const ms = parseInt(match[3].padEnd(3, '0'), 10);
            const time = min * 60 + sec + ms / 1000;
            const text = match[4].trim();
            if (text.length > 0) {
                lines.push({ time, text });
            }
        }
    }

    return lines.sort((a, b) => a.time - b.time);
}

function makeTrackId(title: string, artist: string): string {
    return `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
}

// Loose check that LRCLIB gave us the right song
function metadataMatches(
    reqTitle: string,
    reqArtist: string,
    respTitle: string,
    respArtist: string,
): boolean {
    const rt = reqTitle.toLowerCase().trim();
    const ra = reqArtist.toLowerCase().trim();
    const st = respTitle.toLowerCase().trim();
    const sa = respArtist.toLowerCase().trim();

    // If the API returned empty strings it probably matched on its own
    if (st === '' && sa === '') return true;

    const titleOk = st.includes(rt) || rt.includes(st);
    const artistOk = sa.includes(ra) || ra.includes(sa);
    return titleOk || artistOk;
}

export const LRCLIBService = {
    fetchLyrics: async (
        title: string,
        artist: string,
        signal?: AbortSignal,
    ): Promise<LyricData> => {
        const params = new URLSearchParams({
            track_name: title,
            artist_name: artist,
        });

        const resp = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
            signal,
            headers: { 'User-Agent': 'Resonate/1.0' },
        });

        if (!resp.ok) {
            throw new Error(`LRCLIB returned ${resp.status}`);
        }

        const data = await resp.json();
        const trackId = makeTrackId(title, artist);

        if (!metadataMatches(title, artist, data.trackName || '', data.artistName || '')) {
            throw new Error('MISMATCH');
        }

        return {
            trackId,
            syncedLyrics: data.syncedLyrics ? parseLRC(data.syncedLyrics) : null,
            plainLyrics: data.plainLyrics
                ? data.plainLyrics.split('\n').filter((l: string) => l.trim().length > 0)
                : null,
        };
    },
};
