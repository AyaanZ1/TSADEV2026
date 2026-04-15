import {NativeEventEmitter, NativeModules} from 'react-native';
import {Buffer} from 'buffer';
import AudioSessionTunerModule from '../NativeModules/AudioSessionTunerModule';

const {RNLiveAudioStream} = NativeModules;
const eventEmitter = new NativeEventEmitter(RNLiveAudioStream);
const AUDIO_SAMPLE_RATE = 44100;
const AUDIO_CHANNELS = 1;
const AUDIO_BITS_PER_SAMPLE = 16;
const AUDIO_BUFFER_SIZE = 4096;
const BASS_BLOCK_SIZE = 64;
const LOW_MID_BLOCK_SIZE = 16;

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

const analyzeFrame = (buffer: Buffer): AudioData => {
  const frameCount = buffer.length / 2;
  if (frameCount === 0) {
    return {
      amplitude: 0,
      frequency: 0,
      bands: [0, 0, 0, 0],
    };
  }

  let sumSquares = 0;
  let zeroCrossings = 0;
  let diffSumSq = 0;
  let previousValue = 0;

  let bassBlockSum = 0;
  let bassBlockFill = 0;
  let bassBlockSumSq = 0;
  let bassBlockCount = 0;

  let lowMidBlockSum = 0;
  let lowMidBlockFill = 0;
  let lowMidBlockSumSq = 0;
  let lowMidBlockCount = 0;

  for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
    const value = buffer.readInt16LE(sampleIndex * 2);
    sumSquares += value * value;

    if (
      sampleIndex > 0 &&
      ((previousValue > 0 && value <= 0) || (previousValue <= 0 && value > 0))
    ) {
      zeroCrossings += 1;
    }

    const diff = value - previousValue;
    diffSumSq += diff * diff;
    previousValue = value;

    bassBlockSum += value;
    bassBlockFill += 1;
    if (bassBlockFill === BASS_BLOCK_SIZE) {
      const bassMean = bassBlockSum / BASS_BLOCK_SIZE;
      bassBlockSumSq += bassMean * bassMean;
      bassBlockCount += 1;
      bassBlockSum = 0;
      bassBlockFill = 0;
    }

    lowMidBlockSum += value;
    lowMidBlockFill += 1;
    if (lowMidBlockFill === LOW_MID_BLOCK_SIZE) {
      const lowMidMean = lowMidBlockSum / LOW_MID_BLOCK_SIZE;
      lowMidBlockSumSq += lowMidMean * lowMidMean;
      lowMidBlockCount += 1;
      lowMidBlockSum = 0;
      lowMidBlockFill = 0;
    }
  }

  const rms = Math.sqrt(sumSquares / frameCount);
  const amplitude = Math.min(rms / 10000, 1);
  const frequency = (zeroCrossings * AUDIO_SAMPLE_RATE) / (2 * frameCount);
  const bass =
    bassBlockCount > 0
      ? Math.min(Math.sqrt(bassBlockSumSq / bassBlockCount) / 5500, 1)
      : 0;
  const lowMid =
    lowMidBlockCount > 0
      ? Math.min(Math.sqrt(lowMidBlockSumSq / lowMidBlockCount) / 7000, 1)
      : 0;
  const highMid = amplitude;
  const treble = Math.min(Math.sqrt(diffSumSq / frameCount) / 18000, 1);

  return {
    amplitude,
    frequency,
    bands: [bass, lowMid, highMid, treble],
  };
};

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

    (async () => {
      await configureSpeechCapture();
      if (generation !== captureGeneration) {
        return;
      }

      RNLiveAudioStream?.start();

      await configureSpeechCapture();
      if (generation !== captureGeneration) {
        return;
      }

      setTimeout(() => {
        if (generation !== captureGeneration) {
          return;
        }

        configureSpeechCapture();
      }, 150);
    })();
  },

  stop: () => {
    captureGeneration += 1;
    RNLiveAudioStream?.stop();
    AudioSessionTunerModule.deactivate().catch(error => {
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
      callback(analyzeFrame(buffer));
    });
  },
};
