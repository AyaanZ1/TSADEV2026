export type LRCLine = {
  time: number;
  text: string;
};

export type LyricData = {
  trackId: string;
  syncedLyrics: LRCLine[] | null;
  plainLyrics: string[] | null;
};

function parseLRC(lrc: string): LRCLine[] {
  const lines: LRCLine[] = [];
  const timestampPattern = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const rawLine of lrc.split('\n')) {
    const match = timestampPattern.exec(rawLine.trim());
    if (!match) {
      continue;
    }

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
    const text = match[4].trim();

    if (text.length === 0) {
      continue;
    }

    lines.push({
      time: minutes * 60 + seconds + milliseconds / 1000,
      text,
    });
  }

  return lines.sort((a, b) => a.time - b.time);
}

const normalizeKeyPart = (value: string) => value.toLowerCase().trim();
const makeTrackId = (title: string, artist: string) =>
  `${normalizeKeyPart(title)}::${normalizeKeyPart(artist)}`;

function metadataMatches(
  requestedTitle: string,
  requestedArtist: string,
  responseTitle: string,
  responseArtist: string,
): boolean {
  const requestedTitleKey = normalizeKeyPart(requestedTitle);
  const requestedArtistKey = normalizeKeyPart(requestedArtist);
  const responseTitleKey = normalizeKeyPart(responseTitle);
  const responseArtistKey = normalizeKeyPart(responseArtist);

  // LRCLIB sometimes omits normalized metadata when the lyric body is still right.
  if (responseTitleKey === '' && responseArtistKey === '') {
    return true;
  }

  const titleMatches =
    responseTitleKey.includes(requestedTitleKey) ||
    requestedTitleKey.includes(responseTitleKey);
  const artistMatches =
    responseArtistKey.includes(requestedArtistKey) ||
    requestedArtistKey.includes(responseArtistKey);

  return titleMatches || artistMatches;
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

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      signal,
      headers: {'User-Agent': 'Resonate/1.0'},
    });

    if (!response.ok) {
      throw new Error(`LRCLIB returned ${response.status}`);
    }

    const data = await response.json();
    if (
      !metadataMatches(title, artist, data.trackName || '', data.artistName || '')
    ) {
      throw new Error('MISMATCH');
    }

    return {
      trackId: makeTrackId(title, artist),
      syncedLyrics: data.syncedLyrics ? parseLRC(data.syncedLyrics) : null,
      plainLyrics: data.plainLyrics
        ? data.plainLyrics
            .split('\n')
            .filter((line: string) => line.trim().length > 0)
        : null,
    };
  },
};
