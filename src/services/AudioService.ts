import {NativeEventEmitter, NativeModules} from 'react-native';
import {Buffer} from 'buffer';
import AudioSessionTunerModule from '../NativeModules/AudioSessionTunerModule';

const {RNLiveAudioStream} = NativeModules;
const eventEmitter = new NativeEventEmitter(RNLiveAudioStream);
const AUDIO_SAMPLE_RATE = 44100;
const AUDIO_CHANNELS = 1;
const AUDIO_BITS_PER_SAMPLE = 16;
const AUDIO_BUFFER_SIZE = 4096;

let captureGeneration = 0;

const configureSpeechCapture = async () => {
  try {
    await AudioSessionTunerModule.configureForSpeechCapture();
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[AudioService] Failed to enable speech capture mode',
        error,
      );
    }
  }
};

type AudioData = {
  amplitude: number;
  frequency: number;
  bands: [number, number, number, number];
};

type Listener = (data: AudioData) => void;

export const AudioService = {
  start: () => {
    const generation = ++captureGeneration;

    RNLiveAudioStream?.init({
      sampleRate: AUDIO_SAMPLE_RATE,
      channels: AUDIO_CHANNELS,
      bitsPerSample: AUDIO_BITS_PER_SAMPLE,
      audioSource: 6, // VOICE_RECOGNITION on Android
      bufferSize: AUDIO_BUFFER_SIZE,
    });

    void (async () => {
      await configureSpeechCapture();
      if (generation !== captureGeneration) return;

      RNLiveAudioStream?.start();

      await configureSpeechCapture();
      if (generation !== captureGeneration) return;

      setTimeout(() => {
        if (generation !== captureGeneration) return;
        void configureSpeechCapture();
      }, 150);
    })();
  },

  stop: () => {
    captureGeneration += 1;
    RNLiveAudioStream?.stop();
    void AudioSessionTunerModule.deactivate().catch(error => {
      if (__DEV__) {
        console.warn(
          '[AudioService] Failed to deactivate audio session',
          error,
        );
      }
    });
  },

  addListener: (callback: Listener) => {
    return eventEmitter.addListener('data', (base64Data: string) => {
      const buffer = Buffer.from(base64Data, 'base64');
      const pcmData = new Int16Array(buffer.length / 2);

      let sumSquares = 0;
      let zeroCrossings = 0;
      let diffSumSq = 0; // sum of squared first-differences (treble proxy)
      let previousValue = 0;

      for (let i = 0; i < buffer.length; i += 2) {
        const val = buffer.readInt16LE(i);
        pcmData[i / 2] = val;

        sumSquares += val * val;

        if (
          i > 0 &&
          ((previousValue > 0 && val <= 0) || (previousValue <= 0 && val > 0))
        ) {
          zeroCrossings++;
        }

        const diff = val - previousValue;
        diffSumSq += diff * diff;
        previousValue = val;
      }

      const N = pcmData.length;
      const rms = Math.sqrt(sumSquares / N);
      const amplitude = Math.min(rms / 10000, 1);
      const frequency = (zeroCrossings * AUDIO_SAMPLE_RATE) / (2 * N);

      // Approximate four broad bands for the waveform and haptics.
      const BASS_BLOCK = 64;
      let bassBlockSumSq = 0;
      let bassBlockCount = 0;
      for (let i = 0; i + BASS_BLOCK <= N; i += BASS_BLOCK) {
        let mean = 0;
        for (let j = i; j < i + BASS_BLOCK; j++) mean += pcmData[j];
        mean /= BASS_BLOCK;
        bassBlockSumSq += mean * mean;
        bassBlockCount++;
      }
      const bass =
        bassBlockCount > 0
          ? Math.min(Math.sqrt(bassBlockSumSq / bassBlockCount) / 5500, 1)
          : 0;

      const MID_BLOCK = 16;
      let midBlockSumSq = 0;
      let midBlockCount = 0;
      for (let i = 0; i + MID_BLOCK <= N; i += MID_BLOCK) {
        let mean = 0;
        for (let j = i; j < i + MID_BLOCK; j++) mean += pcmData[j];
        mean /= MID_BLOCK;
        midBlockSumSq += mean * mean;
        midBlockCount++;
      }
      const lowMid =
        midBlockCount > 0
          ? Math.min(Math.sqrt(midBlockSumSq / midBlockCount) / 7000, 1)
          : 0;

      const highMid = Math.min(rms / 10000, 1);
      const treble = Math.min(Math.sqrt(diffSumSq / N) / 18000, 1);

      callback({
        amplitude,
        frequency,
        bands: [bass, lowMid, highMid, treble],
      });
    });
  },
};
