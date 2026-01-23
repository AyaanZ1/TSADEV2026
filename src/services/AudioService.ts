import { NativeEventEmitter, NativeModules } from 'react-native';
import { Buffer } from 'buffer';

const { RNLiveAudioStream } = NativeModules;
const eventEmitter = new NativeEventEmitter(RNLiveAudioStream);

type AudioData = {
    amplitude: number;
    frequency: number;
};

type Listener = (data: AudioData) => void;

export const AudioService = {
    start: () => {
        RNLiveAudioStream?.start();
    },

    stop: () => {
        RNLiveAudioStream?.stop();
    },

    addListener: (callback: Listener) => {
        return eventEmitter.addListener('data', (base64Data: string) => {
            const buffer = Buffer.from(base64Data, 'base64');
            const pcmData = new Int16Array(buffer.length / 2);

            let sumSquares = 0;
            let zeroCrossings = 0;
            let previousValue = 0;

            for (let i = 0; i < buffer.length; i += 2) {
                const val = buffer.readInt16LE(i);
                pcmData[i / 2] = val;

                sumSquares += val * val;

                if (i > 0 && ((previousValue > 0 && val <= 0) || (previousValue <= 0 && val > 0))) {
                    zeroCrossings++;
                }
                previousValue = val;
            }

            const rms = Math.sqrt(sumSquares / pcmData.length);
            // Normalized amplitude (0-1) assuming 16-bit max 32767
            const amplitude = Math.min(rms / 10000, 1);

            // Basic Zero-Crossing Frequency Estimation
            // Sample Rate assumed 44100 (standard for RNLiveAudioStream)
            // frequency = (zeroCrossings * sampleRate) / (2 * numSamples)
            const frequency = (zeroCrossings * 44100) / (2 * pcmData.length);

            callback({ amplitude, frequency });
        });
    }
};
