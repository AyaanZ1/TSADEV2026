import { LRCLine } from './LRCLIBService';

type SyncCallback = (index: number) => void;

export class LyricSyncEngine {
    private lyrics: LRCLine[] = [];
    private matchOffset = 0;
    private matchSystemTime = 0;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private callback: SyncCallback | null = null;
    private lastIndex = -1;
    private trackId = '';

    start(params: {
        lyrics: LRCLine[];
        matchOffset: number;
        matchSystemTime: number;
        trackId: string;
        callback: SyncCallback;
    }) {
        this.stop();
        this.lyrics = params.lyrics;
        this.matchOffset = params.matchOffset;
        this.matchSystemTime = params.matchSystemTime;
        this.trackId = params.trackId;
        this.callback = params.callback;
        this.lastIndex = -1;

        // ~60Hz tick for smooth tracking
        this.intervalId = setInterval(() => this.tick(), 16);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.callback = null;
        this.lastIndex = -1;
    }

    getTrackId(): string {
        return this.trackId;
    }

    // P = matchOffset + (now - matchSystemTime)
    getCurrentPosition(): number {
        return this.matchOffset + (performance.now() - this.matchSystemTime) / 1000;
    }

    private tick() {
        if (!this.callback || this.lyrics.length === 0) return;

        const pos = this.getCurrentPosition();
        let idx = -1;

        // Walk backwards to find the last lyric whose timestamp we've passed
        for (let i = this.lyrics.length - 1; i >= 0; i--) {
            if (pos >= this.lyrics[i].time) {
                idx = i;
                break;
            }
        }

        if (idx !== this.lastIndex) {
            this.lastIndex = idx;
            this.callback(idx);
        }
    }
}
