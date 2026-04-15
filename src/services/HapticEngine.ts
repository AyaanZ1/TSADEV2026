import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

let isHapticsEnabled = true;

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: true,
};

const AMP_HISTORY_SIZE = 8;
const ampHistory: number[] = [];
let ampHistorySum = 0;
let lastTriggerTime = 0;

const MIN_TRIGGER_INTERVAL = 80;
const PEAK_THRESHOLD = 1.4;

const triggerIfEnabled = (
  pattern: Parameters<typeof ReactNativeHapticFeedback.trigger>[0],
) => {
  if (!isHapticsEnabled) {
    return;
  }

  ReactNativeHapticFeedback.trigger(pattern, options);
};

export const HapticEngine = {
  setEnabled: (enabled: boolean) => {
    isHapticsEnabled = enabled;
  },

  triggerBass: () => {
    triggerIfEnabled('impactHeavy');
  },

  triggerMid: () => {
    triggerIfEnabled('impactMedium');
  },

  triggerTreble: () => {
    triggerIfEnabled('impactLight');
  },

  triggerSuccess: () => {
    triggerIfEnabled('notificationSuccess');
  },

  processFrequency: (frequency: number) => {
    if (!isHapticsEnabled) {
      return;
    }

    if (frequency > 0 && frequency < 250) {
      HapticEngine.triggerBass();
    } else if (frequency >= 250 && frequency < 2000) {
      HapticEngine.triggerMid();
    } else if (frequency >= 2000) {
      HapticEngine.triggerTreble();
    }
  },

  processAudioFrame: (amplitude: number, frequency: number) => {
    if (!isHapticsEnabled) {
      return;
    }

    ampHistory.push(amplitude);
    ampHistorySum += amplitude;

    if (ampHistory.length > AMP_HISTORY_SIZE) {
      ampHistorySum -= ampHistory.shift() ?? 0;
    }

    if (ampHistory.length < 3) {
      return;
    }

    const avg = ampHistorySum / ampHistory.length;
    const now = performance.now();
    const isPeak = amplitude > avg * PEAK_THRESHOLD && amplitude > 0.05;
    const cooldownOk = now - lastTriggerTime > MIN_TRIGGER_INTERVAL;

    if (isPeak && cooldownOk) {
      lastTriggerTime = now;

      if (frequency < 250) {
        triggerIfEnabled('impactHeavy');
      } else if (frequency < 2000) {
        triggerIfEnabled('impactMedium');
      } else {
        triggerIfEnabled('impactLight');
      }
    }
  },

  reset: () => {
    ampHistory.length = 0;
    ampHistorySum = 0;
    lastTriggerTime = 0;
  },
};
