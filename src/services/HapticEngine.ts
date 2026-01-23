import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

let isHapticsEnabled = true;

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: true,
};

export const HapticEngine = {
  setEnabled: (enabled: boolean) => {
    isHapticsEnabled = enabled;
  },

  triggerBass: () => {
    if (!isHapticsEnabled) return;
    // Heavy impact for bass (kick drums, deep synths)
    ReactNativeHapticFeedback.trigger('impactHeavy', options);
  },

  triggerMid: () => {
    if (!isHapticsEnabled) return;
    // Rigid or medium impact for vocals/mids
    ReactNativeHapticFeedback.trigger('impactMedium', options);
  },

  triggerTreble: () => {
    if (!isHapticsEnabled) return;
    // Light or soft impact for high hats/treble
    ReactNativeHapticFeedback.trigger('impactLight', options);
  },

  triggerSuccess: () => {
    if (!isHapticsEnabled) return;
    ReactNativeHapticFeedback.trigger('notificationSuccess', options);
  },

  processFrequency: (frequency: number) => {
    if (!isHapticsEnabled) return;

    // Refined thresholds for musical instruments
    // Sub-bass & Bass: 20-250Hz
    // Low Mids: 250-500Hz
    // High Mids: 500-2kHz
    // Highs: 2kHz+

    if (frequency > 0 && frequency < 250) {
      HapticEngine.triggerBass();
    } else if (frequency >= 250 && frequency < 2000) {
      HapticEngine.triggerMid();
    } else if (frequency >= 2000) {
      HapticEngine.triggerTreble();
    }
  }
};
