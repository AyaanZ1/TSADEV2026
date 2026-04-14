import {NativeModules, Platform} from 'react-native';

type AudioSessionSnapshot = {
  category: string;
  mode: string;
  sampleRate: number;
  ioBufferDuration: number;
};

const {AudioSessionTuner} = NativeModules;

const AudioSessionTunerModule = {
  configureForSpeechCapture: async (): Promise<AudioSessionSnapshot | null> => {
    if (
      Platform.OS !== 'ios' ||
      !AudioSessionTuner?.configureForSpeechCapture
    ) {
      return null;
    }

    return AudioSessionTuner.configureForSpeechCapture();
  },

  deactivate: async (): Promise<void> => {
    if (Platform.OS !== 'ios' || !AudioSessionTuner?.deactivate) {
      return;
    }

    await AudioSessionTuner.deactivate();
  },
};

export default AudioSessionTunerModule;
