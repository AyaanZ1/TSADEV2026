const {NativeModules} = require('react-native');

jest.mock('react-native-linear-gradient', () => 'LinearGradient');

jest.mock('@react-native-community/blur', () => {
  const {View} = require('react-native');
  return {BlurView: View};
});

jest.mock('react-native-haptic-feedback', () => ({
  trigger: jest.fn(),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const {View} = require('react-native');
  const Mock = props => React.createElement(View, props);
  return {
    __esModule: true,
    default: Mock,
    Svg: Mock,
    Path: Mock,
    Defs: Mock,
    Ellipse: Mock,
    RadialGradient: Mock,
    Stop: Mock,
    G: Mock,
    Rect: Mock,
    Circle: Mock,
    Line: Mock,
    Polygon: Mock,
    Polyline: Mock,
    Text: Mock,
    Use: Mock,
    Symbol: Mock,
    LinearGradient: Mock,
    ClipPath: Mock,
    Mask: Mock,
  };
});

// Provide predictable env values in tests
jest.mock('@env', () => ({
  SHAZAM_DEVELOPER_TOKEN: 'test-token',
}));

// Native module stubs used by the app during render/effects
if (!NativeModules.RNLiveAudioStream) {
  NativeModules.RNLiveAudioStream = {
    init: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
}

if (!NativeModules.AppIconModule) {
  NativeModules.AppIconModule = {
    setIcon: jest.fn(() => Promise.resolve()),
    getIcon: jest.fn(() => Promise.resolve('default')),
  };
}

if (!NativeModules.AudioSessionTuner) {
  NativeModules.AudioSessionTuner = {
    configureForSpeechCapture: jest.fn(() => Promise.resolve(null)),
    deactivate: jest.fn(() => Promise.resolve()),
  };
}

if (!NativeModules.ShazamKitRecognition) {
  NativeModules.ShazamKitRecognition = {
    identify: jest.fn(() =>
      Promise.resolve({
        title: 'Test Song',
        artist: 'Test Artist',
        artworkURL: '',
        matchOffset: 0,
      }),
    ),
    stop: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
}
