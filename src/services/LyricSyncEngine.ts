import {LRCLine} from './LRCLIBService';

type SyncCallback = (index: number) => void;

const ANCHOR_FORWARD_JITTER_DEADBAND_SEC = 0.2;
const ANCHOR_BACKWARD_JITTER_DEADBAND_SEC = 0.8;
const MAX_FORWARD_MICRO_CORRECTION_STEP_SEC = 0.45;
const MAX_BACKWARD_MICRO_CORRECTION_STEP_SEC = 0.12;
const BACKWARD_LINE_HYSTERESIS_SEC = 0.45;

export class LyricSyncEngine {
  private lyrics: LRCLine[] = [];
  private matchOffset = 0;
  private matchSystemTime = 0;
  private assistCorrection = 0;
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
    this.assistCorrection = 0;

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
    this.assistCorrection = 0;
  }

  getTrackId(): string {
    return this.trackId;
  }

  private getBasePositionAt(systemTimeMs: number): number {
    return this.matchOffset + (systemTimeMs - this.matchSystemTime) / 1000;
  }

  // P = matchOffset + (now - matchSystemTime)
  getBasePosition(): number {
    return this.getBasePositionAt(performance.now());
  }

  getCurrentPosition(): number {
    return this.getBasePosition() + this.assistCorrection;
  }

  setAssistCorrection(seconds: number) {
    this.assistCorrection = seconds;
  }

  getAssistCorrection(): number {
    return this.assistCorrection;
  }

  // Swap the lyric list without resetting timing.
  updateLyrics(lyrics: LRCLine[]) {
    this.lyrics = lyrics;
    this.lastIndex = -1;
  }

  // Accept a new Shazam anchor. Small deltas just refine drift; large deltas
  // indicate a seek and force the lyric index to be recalculated.
  syncToAnchor(
    targetPosition: number,
    matchSystemTime: number,
    jumpThresholdSec = 3,
  ) {
    const expectedPosition =
      this.getBasePositionAt(matchSystemTime) + this.assistCorrection;
    const delta = targetPosition - expectedPosition;
    const deadband =
      delta < 0
        ? ANCHOR_BACKWARD_JITTER_DEADBAND_SEC
        : ANCHOR_FORWARD_JITTER_DEADBAND_SEC;
    const maxStep =
      delta < 0
        ? MAX_BACKWARD_MICRO_CORRECTION_STEP_SEC
        : MAX_FORWARD_MICRO_CORRECTION_STEP_SEC;

    const isJump = Math.abs(delta) > jumpThresholdSec;
    const appliedDelta = isJump
      ? delta
      : Math.abs(delta) < deadband
      ? 0
      : Math.max(-maxStep, Math.min(maxStep, delta));
    const nextPosition = expectedPosition + appliedDelta;

    this.matchOffset = nextPosition;
    this.matchSystemTime = matchSystemTime;
    this.assistCorrection = 0;

    if (isJump) {
      this.lastIndex = -1;
    }

    return {
      delta,
      appliedDelta,
      isJump,
      nextPosition,
    };
  }

  reanchor(targetPosition: number) {
    this.syncToAnchor(targetPosition, performance.now(), 0);
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

    if (
      idx < this.lastIndex &&
      this.lastIndex >= 0 &&
      this.lastIndex < this.lyrics.length
    ) {
      const activeLineTime = this.lyrics[this.lastIndex].time;
      if (pos >= activeLineTime - BACKWARD_LINE_HYSTERESIS_SEC) {
        idx = this.lastIndex;
      }
    }

    if (idx !== this.lastIndex) {
      this.lastIndex = idx;
      this.callback(idx);
    }
  }
}
