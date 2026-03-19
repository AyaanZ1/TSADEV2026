import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

let isHapticsEnabled = true;

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: true,
};

// Keep a short history of amplitudes so we can detect peaks (beats)
const AMP_HISTORY_SIZE = 8;
const ampHistory: number[] = [];
let lastTriggerTime = 0;

// Minimum ms between haptic triggers so we don't spam the motor
const MIN_TRIGGER_INTERVAL = 80;

// Threshold multiplier: amplitude must be this much above the rolling average
const PEAK_THRESHOLD = 1.4;

export const HapticEngine = {
  setEnabled: (enabled: boolean) => {
    isHapticsEnabled = enabled;
  },

  triggerBass: () => {
    if (!isHapticsEnabled) return;
    ReactNativeHapticFeedback.trigger('impactHeavy', options);
  },

  triggerMid: () => {
    if (!isHapticsEnabled) return;
    ReactNativeHapticFeedback.trigger('impactMedium', options);
  },

  triggerTreble: () => {
    if (!isHapticsEnabled) return;
    ReactNativeHapticFeedback.trigger('impactLight', options);
  },

  triggerSuccess: () => {
    if (!isHapticsEnabled) return;
    ReactNativeHapticFeedback.trigger('notificationSuccess', options);
  },

  // Basic frequency band routing (used when we only have frequency data)
  processFrequency: (frequency: number) => {
    if (!isHapticsEnabled) return;

    // Frequency ranges:
    // Bass: 20-250Hz
    // Mids: 250-2kHz
    // Treble: 2kHz+
    if (frequency > 0 && frequency < 250) {
      HapticEngine.triggerBass();
    } else if (frequency >= 250 && frequency < 2000) {
      HapticEngine.triggerMid();
    } else if (frequency >= 2000) {
      HapticEngine.triggerTreble();
    }
  },

  // Rhythm-synced haptics: detect amplitude peaks (beats) and fire haptics
  // Call this on every audio frame with the current amplitude + frequency
  processAudioFrame: (amplitude: number, frequency: number) => {
    if (!isHapticsEnabled) return;

    ampHistory.push(amplitude);
    if (ampHistory.length > AMP_HISTORY_SIZE) {
      ampHistory.shift();
    }

    // Need enough history to compute a rolling average
    if (ampHistory.length < 3) return;

    const avg = ampHistory.reduce((a, b) => a + b, 0) / ampHistory.length;
    const now = performance.now();

    // Only trigger if this frame is a peak above the rolling average
    // and we haven't triggered too recently
    const isPeak = amplitude > avg * PEAK_THRESHOLD && amplitude > 0.05;
    const cooldownOk = now - lastTriggerTime > MIN_TRIGGER_INTERVAL;

    if (isPeak && cooldownOk) {
      lastTriggerTime = now;

      // Pick haptic intensity based on which frequency band dominates
      if (frequency < 250) {
        ReactNativeHapticFeedback.trigger('impactHeavy', options);
      } else if (frequency < 2000) {
        ReactNativeHapticFeedback.trigger('impactMedium', options);
      } else {
        ReactNativeHapticFeedback.trigger('impactLight', options);
      }
    }
  },

  // Reset the beat detector state (call when stopping playback)
  reset: () => {
    ampHistory.length = 0;
    lastTriggerTime = 0;
  },
};
