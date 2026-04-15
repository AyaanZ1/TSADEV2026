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

const EMPTY_SUBSCRIPTION = {
  remove: () => {},
};

export type MusicHapticFrame = {
  bands: [number, number, number, number];
  amplitude: number;
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
const toNumber = (value: unknown) => Number(value ?? 0);

const parseBands = (rawBands: unknown): [number, number, number, number] => {
  const values = Array.isArray(rawBands) ? rawBands : [];
  return [
    toNumber(values[0]),
    toNumber(values[1]),
    toNumber(values[2]),
    toNumber(values[3]),
  ];
};

export const MusicHapticService = {
  isSupported: !!MusicHapticEngine,

  start: async (): Promise<void> => {
    if (!MusicHapticEngine || running) {
      return;
    }

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
    if (!MusicHapticEngine || !running) {
      return;
    }

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

    if (!MusicHapticEngine) {
      return;
    }

    try {
      MusicHapticEngine.setConfig(currentConfig);
    } catch (error) {
      if (__DEV__) {
        console.warn('[MusicHapticService] setConfig failed', error);
      }
    }
  },

  addFrameListener: (cb: FrameListener) => {
    if (!emitter) {
      return EMPTY_SUBSCRIPTION;
    }

    return emitter.addListener('musicHapticFrame', (data: any) => {
      cb({
        bands: parseBands(data?.bands),
        amplitude: toNumber(data?.amplitude),
        intensity: toNumber(data?.intensity),
        sharpness: toNumber(data?.sharpness),
      });
    });
  },

  addBeatListener: (cb: BeatListener) => {
    if (!emitter) {
      return EMPTY_SUBSCRIPTION;
    }

    return emitter.addListener('musicHapticBeat', (data: any) => {
      cb({strength: Number(data?.strength ?? 0)});
    });
  },
};
