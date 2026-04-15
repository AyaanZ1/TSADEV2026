import {PermissionsAndroid, Platform} from 'react-native';

type PermissionError = Error & {code: string};

const createPermissionError = (): PermissionError => {
  const error = new Error('Microphone permission not granted') as PermissionError;
  error.code = 'PERMISSION';
  return error;
};

export const ensureMicrophonePermission = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }

  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    return;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: 'Microphone Permission',
    message: 'Resonate needs microphone access to recognize music and drive haptics.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });

  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw createPermissionError();
  }
};
