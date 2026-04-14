import {SHAZAM_DEVELOPER_TOKEN} from '@env';
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import ShazamKitRecognition from '../NativeModules/ShazamKitRecognitionModule';

export type RecognitionResult = {
  title: string;
  artist: string;
  artworkURL: string;
  genres: string[];
  matchOffset: number;
  matchSystemTime: number;
};

export type RecognitionDiagnostics = {
  amplitude: number;
  sigs?: number;
  error?: string;
};

type NativeRecognitionResult = {
  title: string;
  artist: string;
  artworkURL?: string;
  genres?: string[];
  matchOffset: number;
};

const shazamModule =
  Platform.OS === 'ios' ? NativeModules.ShazamKitRecognition : null;
const shazamEmitter = shazamModule ? new NativeEventEmitter(shazamModule) : null;
const noop = () => {};

const mapRecognitionResult = (
  result: NativeRecognitionResult,
): RecognitionResult => ({
  title: result.title,
  artist: result.artist,
  artworkURL: result.artworkURL || '',
  genres: result.genres || [],
  matchOffset: result.matchOffset,
  matchSystemTime: performance.now(),
});

const subscribe = <T>(
  eventName: string,
  listener: (payload: T) => void,
) => {
  if (!shazamEmitter) {
    return noop;
  }

  const subscription = shazamEmitter.addListener(eventName, listener);
  return () => {
    subscription.remove();
  };
};

export const MusicRecognitionService = {
  identify: async (): Promise<RecognitionResult> => {
    const result = await ShazamKitRecognition.identify(SHAZAM_DEVELOPER_TOKEN);
    return mapRecognitionResult(result);
  },

  subscribeToMatches: (callback: (result: RecognitionResult) => void) => {
    return subscribe<NativeRecognitionResult>(
      'shazamMatch',
      data => {
        callback(mapRecognitionResult(data));
      },
    );
  },

  subscribeToDiagnostics: (
    callback: (diagnostics: RecognitionDiagnostics) => void,
  ) => {
    return subscribe<RecognitionDiagnostics>('shazamAmplitude', callback);
  },

  stop: () => {
    ShazamKitRecognition.stop();
  },
};
