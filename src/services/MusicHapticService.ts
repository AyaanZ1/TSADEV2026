import {NativeEventEmitter, NativeModules} from 'react-native';

const {MusicHapticEngine} = NativeModules as {
  MusicHapticEngine?: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    setConfig: (config: MusicHapticConfig) => void;
  };
};

const emitter = MusicHapticEngine
  ? new NativeEventEmitter(MusicHapticEngine as any)
  : null;

export type MusicHapticFrame = {
  // Four bands [bass, low-mid, mid-high, treble], each 0..1 AGC-normalized.
  bands: [number, number, number, number];
  // Average across bands — safe to drive a single-value amplitude meter.
  amplitude: number;
  // Current haptic intensity / sharpness the native engine is using.
  // Exposed for UI feedback; not required to consume.
  intensity: number;
  sharpness: number;
};

export type MusicHapticBeat = {
  strength: number;
};

type FrameListener = (frame: MusicHapticFrame) => void;
type BeatListener = (beat: MusicHapticBeat) => void;

export type MusicHapticConfig = {
  intensity: number;
  bassBoost: number;
  trebleBoost: number;
};

const DEFAULT_CONFIG: MusicHapticConfig = {
  intensity: 72,
  bassBoost: 55,
  trebleBoost: 40,
};

let running = false;
let currentConfig: MusicHapticConfig = DEFAULT_CONFIG;

const clampSetting = (value: number) => Math.max(0, Math.min(100, value));

export const MusicHapticService = {
  isSupported: !!MusicHapticEngine,

  start: async (): Promise<void> => {
    if (!MusicHapticEngine) return;
    if (running) return;
    try {
      await MusicHapticEngine.start();
      running = true;
      MusicHapticEngine.setConfig(currentConfig);
    } catch (error) {
      if (__DEV__) {
        console.warn('[MusicHapticService] start failed', error);
      }
    }
  },

  stop: async (): Promise<void> => {
    if (!MusicHapticEngine) return;
    if (!running) return;
    running = false;
    try {
      await MusicHapticEngine.stop();
    } catch (error) {
      if (__DEV__) {
        console.warn('[MusicHapticService] stop failed', error);
      }
    }
  },

  setConfig: (config: MusicHapticConfig) => {
    currentConfig = {
      intensity: clampSetting(config.intensity),
      bassBoost: clampSetting(config.bassBoost),
      trebleBoost: clampSetting(config.trebleBoost),
    };

    if (!MusicHapticEngine) return;

    try {
      MusicHapticEngine.setConfig(currentConfig);
    } catch (error) {
      if (__DEV__) {
        console.warn('[MusicHapticService] setConfig failed', error);
      }
    }
  },

  addFrameListener: (cb: FrameListener) => {
    if (!emitter) return {remove: () => {}};
    const sub = emitter.addListener('musicHapticFrame', (data: any) => {
      const rawBands = Array.isArray(data?.bands) ? data.bands : [0, 0, 0, 0];
      const bands: [number, number, number, number] = [
        Number(rawBands[0] ?? 0),
        Number(rawBands[1] ?? 0),
        Number(rawBands[2] ?? 0),
        Number(rawBands[3] ?? 0),
      ];
      cb({
        bands,
        amplitude: Number(data?.amplitude ?? 0),
        intensity: Number(data?.intensity ?? 0),
        sharpness: Number(data?.sharpness ?? 0),
      });
    });
    return sub;
  },

  addBeatListener: (cb: BeatListener) => {
    if (!emitter) return {remove: () => {}};
    const sub = emitter.addListener('musicHapticBeat', (data: any) => {
      cb({strength: Number(data?.strength ?? 0)});
    });
    return sub;
  },
};
