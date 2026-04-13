import { NativeEventEmitter, NativeModules } from 'react-native';
import { Buffer } from 'buffer';

const { RNLiveAudioStream } = NativeModules;
const eventEmitter = new NativeEventEmitter(RNLiveAudioStream);

type AudioData = {
    amplitude: number;
    frequency: number;
    // Each band is 0-1: [bass, lowMid, highMid, treble]
    bands: [number, number, number, number];
};

type Listener = (data: AudioData) => void;

export const AudioService = {
    start: () => {
        RNLiveAudioStream?.init({
            sampleRate: 44100,
            channels: 1,
            bitsPerSample: 16,
            audioSource: 6, // VOICE_RECOGNITION on Android
            bufferSize: 4096,
        });
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
            let diffSumSq = 0; // sum of squared first-differences (treble proxy)
            let previousValue = 0;

            for (let i = 0; i < buffer.length; i += 2) {
                const val = buffer.readInt16LE(i);
                pcmData[i / 2] = val;

                sumSquares += val * val;

                if (i > 0 && ((previousValue > 0 && val <= 0) || (previousValue <= 0 && val > 0))) {
                    zeroCrossings++;
                }

                const diff = val - previousValue;
                diffSumSq += diff * diff;
                previousValue = val;
            }

            const N = pcmData.length;
            const rms = Math.sqrt(sumSquares / N);
            const amplitude = Math.min(rms / 10000, 1);
            const frequency = (zeroCrossings * 44100) / (2 * N);

            // ── Frequency band estimation ──────────────────────────────────────
            // Bass (≈20-300 Hz): RMS of block-averaged signal.
            // Averaging 64 samples at 44100 Hz acts as a ~345 Hz low-pass filter.
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
            const bass = bassBlockCount > 0
                ? Math.min(Math.sqrt(bassBlockSumSq / bassBlockCount) / 5500, 1)
                : 0;

            // Low-mid (≈300-1400 Hz): block size 16 → ~1380 Hz LPF.
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
            const lowMid = midBlockCount > 0
                ? Math.min(Math.sqrt(midBlockSumSq / midBlockCount) / 7000, 1)
                : 0;

            // High-mid (≈1.4-5 kHz): overall RMS captures all energy including upper mids.
            const highMid = Math.min(rms / 10000, 1);

            // Treble (≈5 kHz+): first-difference RMS measures fast inter-sample changes.
            // High-frequency signals have large differences between adjacent samples.
            const treble = Math.min(Math.sqrt(diffSumSq / N) / 18000, 1);

            callback({
                amplitude,
                frequency,
                bands: [bass, lowMid, highMid, treble],
            });
        });
    }
};
