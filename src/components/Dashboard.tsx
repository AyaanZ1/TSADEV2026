import {BlurView} from '@react-native-community/blur';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BoltIcon,
  ChartBarIcon,
  ClockIcon,
  Cog6ToothIcon,
  MicrophoneIcon,
  MoonIcon,
  MusicalNoteIcon,
  SpeakerWaveIcon,
  Squares2X2Icon,
  StopIcon,
  SunIcon,
} from 'react-native-heroicons/outline';
import LinearGradient from 'react-native-linear-gradient';
import Svg, {Defs, Ellipse, Path, RadialGradient, Stop} from 'react-native-svg';
import {AudioService} from '../services/AudioService';
import {HapticEngine} from '../services/HapticEngine';
import {
  MusicRecognitionService,
  RecognitionDiagnostics,
  RecognitionResult,
} from '../services/MusicRecognitionService';
import {LRCLIBService, LRCLine} from '../services/LRCLIBService';
import AppIcon, {AppIconName} from '../NativeModules/AppIconModule';
import {LyricSyncEngine} from '../services/LyricSyncEngine';

type ThemeMode = 'dark' | 'light' | 'amoled';
type Tab = 'listen' | 'haptic' | 'settings';
type LyricLanguageCode = 'EN' | 'ES' | 'KR' | 'JP' | 'FR' | 'ZH';
type PendingSongSwitch = {
  key: string;
  count: number;
  firstSeenMs: number;
  latest: RecognitionResult;
};
type PendingAnchorUpdate = {
  count: number;
  firstSeenMs: number;
  isBackward: boolean;
  latest: RecognitionResult;
};

type Palette = {
  bg: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textSub: string;
  coral: string;
  violet: string;
  cyan: string;
  gold: string;
  isDark: boolean;
  isAmoled: boolean;
};

const getPalette = (theme: ThemeMode): Palette => {
  const isDark = theme === 'dark' || theme === 'amoled';
  const isAmoled = theme === 'amoled';
  return {
    bg: isAmoled ? '#000000' : isDark ? '#0D0D1A' : '#FFF8F0',
    surface: isAmoled
      ? 'rgba(255,255,255,0.06)'
      : isDark
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(26,26,46,0.04)',
    surfaceBorder: isAmoled
      ? 'rgba(255,255,255,0.10)'
      : isDark
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(26,26,46,0.10)',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSub: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(26,26,46,0.55)',
    coral: isDark ? '#F472B6' : '#BE185D',
    violet: isDark ? '#A855F7' : '#6D28D9',
    cyan: isDark ? '#E879A8' : '#9D174D',
    gold: isDark ? '#C084FC' : '#7E22CE',
    isDark,
    isAmoled,
  };
};

const getLyricRowHeight = (size: 'S' | 'M' | 'L' | 'XL') => {
  const base = size === 'XL' ? 30 : size === 'L' ? 26 : size === 'M' ? 22 : 18;
  return Math.round(base * 1.25 + 10);
};

const LYRIC_SCROLL_PADDING_TOP = 10;
const LYRIC_ACTIVE_LINE_OFFSET = 56;
const SONG_SWITCH_CONFIRMATIONS = 2;
const SONG_SWITCH_MIN_STABILITY_MS = 1200;
const SAME_SONG_FORWARD_CORRECTION_SEC = 0.65;
const SAME_SONG_BACKWARD_CORRECTION_SEC = 1.1;
const SAME_SONG_ANCHOR_CONFIRMATIONS = 2;
const SAME_SONG_ANCHOR_AGREEMENT_SEC = 0.45;
const SAME_SONG_BACKWARD_IGNORE_SEC = 0.8;
const SAME_SONG_BACKWARD_CONFIRMATIONS = 4;
const SAME_SONG_BACKWARD_MIN_STABILITY_MS = 2200;

// Glow orb using SVG radial gradient for smooth falloff
const GlowOrb = ({
  id,
  color,
  size,
  baseOpacity,
  breatheAnim,
  style,
}: {
  id: string;
  color: string;
  size: number;
  baseOpacity: number;
  breatheAnim: Animated.Value;
  style?: object;
}) => (
  <Animated.View
    pointerEvents="none"
    style={[
      {position: 'absolute', width: size, height: size, opacity: breatheAnim},
      style,
    ]}>
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop
            offset="0%"
            stopColor={color}
            stopOpacity={baseOpacity * 0.55}
          />
          <Stop
            offset="30%"
            stopColor={color}
            stopOpacity={baseOpacity * 0.28}
          />
          <Stop
            offset="60%"
            stopColor={color}
            stopOpacity={baseOpacity * 0.09}
          />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse
        cx={size / 2}
        cy={size / 2}
        rx={size / 2}
        ry={size / 2}
        fill={`url(#${id})`}
      />
    </Svg>
  </Animated.View>
);

// Marquee text - scrolls when text overflows container
const MarqueeText = ({
  text,
  textStyle,
  forceScroll,
}: {
  text: string;
  textStyle?: object;
  forceScroll?: boolean;
}) => {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const tx = useRef(new Animated.Value(0)).current;
  const GAP = 48;

  const shouldScroll =
    textW > 0 && containerW > 0 && (forceScroll || textW > containerW);

  useEffect(() => {
    tx.setValue(0);
    if (!shouldScroll) return;
    // Scroll the full text+gap width, second copy keeps it looping
    const loop = Animated.loop(
      Animated.timing(tx, {
        toValue: -(textW + GAP),
        duration: ((textW + GAP) / 60) * 1000, // 60px/s
        useNativeDriver: true,
        easing: Easing.linear,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shouldScroll, textW]);

  return (
    <View
      style={{overflow: 'hidden', width: '100%'}}
      onLayout={e => setContainerW(e.nativeEvent.layout.width)}>
      {/* Horizontal ScrollView lets Text render at its natural single-line width for measurement */}
      <ScrollView
        horizontal
        scrollEnabled={false}
        style={{position: 'absolute', opacity: 0}}
        pointerEvents="none">
        <Text
          style={textStyle}
          onLayout={e => setTextW(e.nativeEvent.layout.width)}>
          {text}
        </Text>
      </ScrollView>
      <Animated.View
        style={{flexDirection: 'row', transform: [{translateX: tx}]}}>
        <Text
          style={[textStyle, textW ? {width: textW} : {}]}
          numberOfLines={1}
          ellipsizeMode="clip">
          {text}
        </Text>
        {shouldScroll && (
          <Text
            style={[textStyle, {width: textW, marginLeft: GAP}]}
            numberOfLines={1}
            ellipsizeMode="clip">
            {text}
          </Text>
        )}
      </Animated.View>
    </View>
  );
};

// SVG Waveform — each of the 4 waves is driven by its own frequency band.
// bandsRef.current = [bass, lowMid, highMid, treble], each 0-100.
// Written by the AudioService listener every ~33 ms; read here each frame
// without triggering a Dashboard re-render.
const SvgWaveform = ({
  active,
  bandsRef,
  palette,
}: {
  active: boolean;
  bandsRef: React.MutableRefObject<[number, number, number, number]>;
  palette: Palette;
}) => {
  // Per-wave time accumulators so each band evolves at its own speed
  const timesRef = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const [, forceUpdate] = useState(0);
  const [w, setW] = useState(0);
  const h = 160;

  // Time-step per wave: bass is slow/wide, treble is fast/tight
  const TIME_STEPS: [number, number, number, number] = [
    0.016, 0.022, 0.03, 0.04,
  ];
  const IDLE_STEP = 0.006;

  useEffect(() => {
    const interval = setInterval(() => {
      const t = timesRef.current;
      for (let i = 0; i < 4; i++) {
        t[i] += active ? TIME_STEPS[i] : IDLE_STEP;
      }
      forceUpdate(n => n + 1);
    }, 33);
    return () => clearInterval(interval);
  }, [active]);

  const colors = [palette.coral, palette.violet, palette.cyan, palette.gold];

  const makePath = (i: number): string => {
    const t = timesRef.current[i];
    // Band value 0-100; idle uses a gentle fixed level
    const bandVal = active ? bandsRef.current[i] : 0;
    // Wave 0 (bass) is tallest; each subsequent wave is slightly shorter at same energy
    const maxAmp = h * (0.13 - i * 0.015);
    const amp = active ? maxAmp * Math.max(bandVal / 100, 0.08) : h * 0.025;
    // Spatial frequency: bass is wide/slow, treble is narrow/fast
    const freq = 0.006 + i * 0.004;
    const phase = t;
    const pts: string[] = [];
    for (let x = 0; x <= w; x += 2) {
      const y =
        h / 2 +
        Math.sin(x * freq + phase) * amp +
        Math.sin(x * freq * 2.1 + phase * 0.65) * amp * 0.28 +
        Math.sin(x * freq * 3.7 + phase * 1.3) * amp * 0.1;
      pts.push(`${x === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
  };

  if (w === 0) {
    return (
      <View
        style={{flex: 1}}
        onLayout={e => setW(e.nativeEvent.layout.width)}
      />
    );
  }

  return (
    <Svg width={w} height={h} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {([0, 1, 2, 3] as const).map(i => {
        const d = makePath(i);
        const color = colors[i];
        const sw = active ? 2.2 - i * 0.25 : 1.0;
        const op = active ? 0.72 - i * 0.08 : 0.22;
        return (
          <React.Fragment key={i}>
            {active && (
              <Path
                d={d}
                stroke={color}
                strokeWidth={sw * 7}
                strokeOpacity={op * 0.14}
                fill="none"
              />
            )}
            <Path
              d={d}
              stroke={color}
              strokeWidth={sw}
              strokeOpacity={op}
              fill="none"
            />
          </React.Fragment>
        );
      })}
    </Svg>
  );
};

// Listen Control
const PILL_W = 260;
const PILL_H = 52;
const RIPPLE_DURATION = 1800;

const ListenControl = ({
  isActive,
  isRecognized,
  palette,
  onPress,
}: {
  isActive: boolean;
  isRecognized: boolean;
  palette: Palette;
  onPress: () => void;
}) => {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(
    new Animated.Value(isRecognized ? PILL_H : PILL_W),
  ).current;

  useEffect(() => {
    Animated.timing(pillWidth, {
      toValue: isRecognized ? PILL_H : PILL_W,
      duration: 320,
      useNativeDriver: false,
      easing: Easing.inOut(Easing.quad),
    }).start();
  }, [isRecognized]);

  useEffect(() => {
    ring1.setValue(0);
    ring2.setValue(0);
    if (!isActive || isRecognized) return undefined;

    // Two staggered expanding rings — ring2 starts halfway through ring1's cycle
    const loop1 = Animated.loop(
      Animated.timing(ring1, {
        toValue: 1,
        duration: RIPPLE_DURATION,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(RIPPLE_DURATION / 2),
        Animated.timing(ring2, {
          toValue: 1,
          duration: RIPPLE_DURATION,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]),
    );
    loop1.start();
    loop2.start();
    return () => {
      loop1.stop();
      loop2.stop();
    };
  }, [isActive, isRecognized]);

  const ringStyle = (anim: Animated.Value) => ({
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: palette.violet,
    transform: [
      {scale: anim.interpolate({inputRange: [0, 1], outputRange: [1, 1.28]})},
    ],
    opacity: anim.interpolate({
      inputRange: [0, 0.12, 0.7, 1],
      outputRange: [0, 0.7, 0.35, 0],
    }),
  });

  const label = isActive ? 'Listening' : 'Start Listening';
  const sub = isActive ? 'Identifying audio...' : 'Tap to recognize';

  return (
    <View style={{alignItems: 'center', marginBottom: 14, marginTop: 8}}>
      {/* Fixed bounding box so rings always align to pill shape */}
      <View
        style={{
          width: PILL_W,
          height: PILL_H,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {isActive && !isRecognized && (
          <>
            <Animated.View pointerEvents="none" style={ringStyle(ring1)} />
            <Animated.View pointerEvents="none" style={ringStyle(ring2)} />
          </>
        )}
        <Animated.View
          style={{
            width: pillWidth,
            height: PILL_H,
            overflow: 'hidden',
            borderRadius: 999,
          }}>
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.82}
            style={{
              width: isRecognized ? PILL_H : PILL_W,
              height: PILL_H,
              borderRadius: isRecognized ? PILL_H / 2 : 999,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: isRecognized ? 'center' : 'flex-start',
              paddingHorizontal: isRecognized ? 0 : 6,
              paddingRight: isRecognized ? 0 : 22,
              borderWidth: 1.5,
              borderColor: isActive
                ? `${palette.coral}88`
                : palette.surfaceBorder,
              backgroundColor: isRecognized ? palette.coral : palette.surface,
            }}>
            {isRecognized ? (
              <StopIcon size={20} color="#fff" strokeWidth={2} />
            ) : (
              <>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: isActive
                      ? palette.violet
                      : `${palette.violet}99`,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 12,
                  }}>
                  <MicrophoneIcon size={18} color="#fff" strokeWidth={2} />
                </View>
                <View style={{flex: 1}}>
                  <Text
                    style={{
                      color: palette.text,
                      fontSize: 15,
                      fontWeight: '700',
                      fontFamily: 'Syne-Bold',
                    }}>
                    {label}
                  </Text>
                  <Text
                    style={{
                      color: palette.textSub,
                      fontSize: 11,
                      marginTop: 1,
                      fontFamily: 'DMSans-Regular',
                    }}>
                    {sub}
                  </Text>
                </View>
                {isActive && (
                  <Text style={{color: palette.violet, fontWeight: '700'}}>
                    •••
                  </Text>
                )}
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

// Lyric Line
const LyricLine = ({
  text,
  isActive,
  isPast,
  palette,
  size,
  onLayout,
}: {
  text: string;
  isActive: boolean;
  isPast: boolean;
  palette: Palette;
  size: 'S' | 'M' | 'L' | 'XL';
  onLayout?: (y: number) => void;
}) => {
  const base = size === 'XL' ? 30 : size === 'L' ? 26 : size === 'M' ? 22 : 18;
  const targetOpacity = isActive ? 1 : isPast ? 0.22 : 0.42;
  const opacity = useRef(new Animated.Value(targetOpacity)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: targetOpacity,
        duration: 380,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.quad),
      }),
    ]).start();
  }, [isActive, isPast]);

  return (
    <View
      onLayout={e => onLayout?.(e.nativeEvent.layout.y)}
      style={{
        paddingTop: 8,
        paddingBottom: 8,
        paddingRight: 6,
      }}>
      <Animated.Text
        style={{
          fontSize: base,
          fontFamily: isActive ? 'Syne-Bold' : 'Syne-Regular',
          fontWeight: isActive ? '700' : '400',
          color: palette.text,
          lineHeight: Math.round(base * 1.36),
          opacity,
          textShadowColor: isActive ? `${palette.coral}33` : 'transparent',
          textShadowRadius: isActive ? 10 : 0,
        }}>
        {text}
      </Animated.Text>
    </View>
  );
};

// Custom Slider
const CustomSlider = ({
  value,
  min,
  max,
  onChange,
  label,
  color,
  palette,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  color: string;
  palette: Palette;
}) => {
  // Use refs for everything so panResponder is created once and never goes stale
  const trackRef = useRef<View>(null);
  const trackPageXRef = useRef(0);
  const trackWidthRef = useRef(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const minRef = useRef(min);
  minRef.current = min;
  const maxRef = useRef(max);
  maxRef.current = max;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_evt, gs) => {
          const ratio = Math.min(
            1,
            Math.max(
              0,
              (gs.x0 - trackPageXRef.current) / trackWidthRef.current,
            ),
          );
          onChangeRef.current(
            Math.round(
              minRef.current + ratio * (maxRef.current - minRef.current),
            ),
          );
        },
        onPanResponderMove: (_evt, gs) => {
          const ratio = Math.min(
            1,
            Math.max(
              0,
              (gs.moveX - trackPageXRef.current) / trackWidthRef.current,
            ),
          );
          onChangeRef.current(
            Math.round(
              minRef.current + ratio * (maxRef.current - minRef.current),
            ),
          );
        },
      }),
    [],
  );

  const pct = ((value - min) / (max - min)) * 100;
  return (
    <View style={{marginBottom: 22}}>
      <View style={styles.rowBetween}>
        <Text
          style={{
            color: palette.textSub,
            fontWeight: '500',
            fontSize: 13,
            fontFamily: 'DMSans-Regular',
          }}>
          {label}
        </Text>
        <Text
          style={{
            color,
            fontWeight: '700',
            fontSize: 13,
            fontFamily: 'DMSans-Bold',
          }}>
          {value}%
        </Text>
      </View>
      <View
        ref={trackRef}
        {...panResponder.panHandlers}
        onLayout={() => {
          trackRef.current?.measure((_x, _y, width, _h, pageX) => {
            trackPageXRef.current = pageX;
            trackWidthRef.current = width;
          });
        }}
        style={{
          height: 10,
          borderRadius: 6,
          backgroundColor: palette.isDark
            ? 'rgba(255,255,255,0.09)'
            : 'rgba(26,26,46,0.09)',
          marginTop: 10,
        }}>
        <View
          style={{
            width: `${pct}%`,
            height: 10,
            borderRadius: 6,
            backgroundColor: color,
          }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: color,
              position: 'absolute',
              right: -10,
              top: -5,
              borderWidth: 2.5,
              borderColor: palette.isAmoled
                ? '#000'
                : palette.isDark
                ? '#0D0D1A'
                : '#FFF8F0',
              shadowColor: color,
              shadowOpacity: 0.5,
              shadowRadius: 6,
              shadowOffset: {width: 0, height: 0},
            }}
          />
        </View>
      </View>
    </View>
  );
};

// Nav Item
const NavItem = ({
  IconComponent,
  label,
  active,
  onPress,
  palette,
}: {
  IconComponent: React.ComponentType<{
    size: number;
    color: string;
    strokeWidth?: number;
  }>;
  label: string;
  active: boolean;
  onPress: () => void;
  palette: Palette;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8}}>
    {active && (
      <View
        style={{
          width: 24,
          height: 3,
          borderRadius: 2,
          backgroundColor: palette.violet,
          marginBottom: 8,
        }}
      />
    )}
    {!active && <View style={{width: 24, height: 3, marginBottom: 8}} />}
    <IconComponent
      size={22}
      color={active ? palette.violet : palette.textSub}
      strokeWidth={1.5}
    />
    <Text
      style={{
        fontSize: 10,
        marginTop: 5,
        fontWeight: active ? '700' : '500',
        fontFamily: active ? 'DMSans-Bold' : 'DMSans-Regular',
        color: active ? palette.violet : palette.textSub,
        letterSpacing: 0.8,
      }}>
      {label.toUpperCase()}
    </Text>
  </TouchableOpacity>
);

// Glass Card
const GlassCard = ({
  children,
  style,
  palette,
}: {
  children: React.ReactNode;
  style?: object;
  palette: Palette;
}) => {
  if (Platform.OS === 'ios') {
    return (
      <BlurView
        blurType={palette.isDark ? 'dark' : 'light'}
        blurAmount={18}
        reducedTransparencyFallbackColor={
          palette.isDark ? 'rgba(20,14,40,0.85)' : 'rgba(255,248,240,0.85)'
        }
        style={[
          styles.card,
          {borderColor: palette.surfaceBorder, borderWidth: 1},
          style,
        ]}>
        {children}
      </BlurView>
    );
  }
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: palette.surfaceBorder,
          borderWidth: 1,
        },
        style,
      ]}>
      {children}
    </View>
  );
};

// Main Dashboard
export const Dashboard = () => {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [tab, setTab] = useState<Tab>('listen');
  const [isListening, setIsListening] = useState(false);
  const [recognized, setRecognized] = useState(false);
  const [intensity, setIntensity] = useState(72);
  const [bassBoost, setBassBoost] = useState(55);
  const [trebleBoost, setTrebleBoost] = useState(40);
  const [defaultLyricLang, setDefaultLyricLang] =
    useState<LyricLanguageCode>('EN');
  const [appLanguage, setAppLanguage] = useState('English');
  const [fontSize, setFontSize] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeIcon, setActiveIcon] = useState<AppIconName>('default');

  useEffect(() => {
    AppIcon.getIcon().then(name => setActiveIcon(name));
  }, []);

  // Song data from recognition
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [artworkURL, setArtworkURL] = useState('');

  // Lyrics pipeline state
  type LyricsStatus = 'idle' | 'loading' | 'synced' | 'plain' | 'unavailable';
  const [syncedLyrics, setSyncedLyrics] = useState<LRCLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string[] | null>(null);
  const [plainSyncedLyrics, setPlainSyncedLyrics] = useState<LRCLine[]>([]);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [lyricsStatus, setLyricsStatus] = useState<LyricsStatus>('idle');
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  const breathe = useRef(new Animated.Value(1)).current;
  // Live mic band energies (0–100 each: bass, lowMid, highMid, treble).
  // Written by AudioService listener; read by SvgWaveform each frame — avoids
  // re-rendering Dashboard on every audio tick.
  const micBandsRef = useRef<[number, number, number, number]>([
    30, 22, 18, 12,
  ]);

  // Shazam diagnostics shown while listening.
  const [sigCount, setSigCount] = useState(0);
  const [shazamError, setShazamError] = useState('');

  // Mutable state shared across async callbacks.
  const isListeningRef = useRef(false);
  const recognizedRef = useRef(false);
  const sessionIdRef = useRef(0);
  const syncEngineRef = useRef(new LyricSyncEngine());
  const abortControllerRef = useRef<AbortController | null>(null);
  const lyricScrollRef = useRef<ScrollView>(null);
  const lyricLineOffsetsRef = useRef<Record<number, number>>({});
  const currentSongKeyRef = useRef('');
  const pendingSongSwitchRef = useRef<PendingSongSwitch | null>(null);
  const pendingAnchorUpdateRef = useRef<PendingAnchorUpdate | null>(null);
  const recognitionMatchOffsetRef = useRef(0);
  const recognitionMatchSystemTimeRef = useRef(0);
  const recognitionTrackIdRef = useRef('');

  const palette = getPalette(theme);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 0.55,
          duration: 3200,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(breathe, {
          toValue: 1.0,
          duration: 3200,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  // Use live mic energy while Shazam is listening.
  useEffect(() => {
    if (!isListening) return undefined;

    setSigCount(0);
    setShazamError('');

    const unsubscribe = MusicRecognitionService.subscribeToDiagnostics(
      (diagnostics: RecognitionDiagnostics) => {
        if (diagnostics.amplitude >= 0) {
          const a = diagnostics.amplitude * 100;
          const r = micBandsRef.current;
          r[0] = r[0] * 0.5 + a * 0.85 * 0.5;
          r[1] = r[1] * 0.5 + a * 0.7 * 0.5;
          r[2] = r[2] * 0.5 + a * 0.55 * 0.5;
          r[3] = r[3] * 0.5 + a * 0.4 * 0.5;
        }

        if (diagnostics.sigs !== undefined) {
          setSigCount(diagnostics.sigs);
        }

        if (diagnostics.error) {
          setShazamError(diagnostics.error);
        }
      },
    );

    return () => {
      unsubscribe();
      micBandsRef.current = [30, 22, 18, 12];
    };
  }, [isListening]);

  // Once we have a match, the waveform and haptics follow the active track.
  useEffect(() => {
    if (!recognized) return undefined;
    const listener = AudioService.addListener(data => {
      const b = data.bands;
      const r = micBandsRef.current;
      r[0] = r[0] * 0.62 + b[0] * 100 * 0.38;
      r[1] = r[1] * 0.58 + b[1] * 100 * 0.42;
      r[2] = r[2] * 0.54 + b[2] * 100 * 0.46;
      r[3] = r[3] * 0.48 + b[3] * 100 * 0.52;
      HapticEngine.processAudioFrame(data.amplitude, data.frequency);
    });
    return () => {
      listener.remove();
      AudioService.stop();
      HapticEngine.reset();
      micBandsRef.current = [30, 22, 18, 12];
    };
  }, [recognized]);

  // Playback clock follows the latest Shazam anchor.
  useEffect(() => {
    if (!recognized) {
      setPlaybackPosition(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setPlaybackPosition(syncEngineRef.current.getBasePosition());
    }, 100);

    return () => clearInterval(interval);
  }, [recognized]);

  // Keep the active lyric line in view.
  useEffect(() => {
    if (currentLyricIndex < 0 || !lyricScrollRef.current) return;
    if (
      lyricsStatus !== 'synced' &&
      !(lyricsStatus === 'plain' && plainSyncedLyrics.length > 0)
    )
      return;
    const measuredOffset = lyricLineOffsetsRef.current[currentLyricIndex];
    const fallbackOffset = currentLyricIndex * getLyricRowHeight(fontSize);
    const target = Math.max(
      0,
      (measuredOffset ?? fallbackOffset) - LYRIC_ACTIVE_LINE_OFFSET,
    );
    lyricScrollRef.current.scrollTo({y: target, animated: true});
  }, [currentLyricIndex, fontSize, lyricsStatus, plainSyncedLyrics.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      syncEngineRef.current.stop();
      abortControllerRef.current?.abort();
      MusicRecognitionService.stop();
      AudioService.stop();
    };
  }, []);

  const buildSongKey = (result: Pick<RecognitionResult, 'title' | 'artist'>) =>
    `${result.title.trim().toLowerCase()}::${result.artist
      .trim()
      .toLowerCase()}`;

  const resetLyricState = () => {
    syncEngineRef.current.stop();
    lyricLineOffsetsRef.current = {};
    pendingAnchorUpdateRef.current = null;
    recognitionTrackIdRef.current = '';
    setSyncedLyrics([]);
    setPlainLyrics(null);
    setPlainSyncedLyrics([]);
    setCurrentLyricIndex(-1);
  };

  const getExpectedAnchorPosition = (systemTimeMs: number) => {
    if (recognitionMatchSystemTimeRef.current <= 0) {
      return recognitionMatchOffsetRef.current;
    }

    return (
      recognitionMatchOffsetRef.current +
      (systemTimeMs - recognitionMatchSystemTimeRef.current) / 1000
    );
  };

  const syncToShazamAnchor = (result: RecognitionResult) => {
    const anchorUpdate = syncEngineRef.current.syncToAnchor(
      result.matchOffset,
      result.matchSystemTime,
    );
    recognitionMatchOffsetRef.current = anchorUpdate.nextPosition;
    recognitionMatchSystemTimeRef.current = result.matchSystemTime;
    setPlaybackPosition(anchorUpdate.nextPosition);

    if (__DEV__) {
      console.log(
        `[Resonate] shazam anchor applied target=${result.matchOffset.toFixed(
          2,
        )}s applied=${anchorUpdate.nextPosition.toFixed(2)}s ` +
          `delta=${anchorUpdate.delta.toFixed(
            3,
          )}s step=${anchorUpdate.appliedDelta.toFixed(3)}s jump=${
            anchorUpdate.isJump
          }`,
      );
    }
  };

  const considerSameSongAnchor = (result: RecognitionResult) => {
    const expectedPosition = getExpectedAnchorPosition(result.matchSystemTime);
    const anchorDelta = result.matchOffset - expectedPosition;
    const needsCorrection =
      anchorDelta >= SAME_SONG_FORWARD_CORRECTION_SEC ||
      anchorDelta <= -SAME_SONG_BACKWARD_CORRECTION_SEC;
    const isBackward = anchorDelta < -SAME_SONG_BACKWARD_IGNORE_SEC;
    const pending = pendingAnchorUpdateRef.current;

    if (!needsCorrection) {
      pendingAnchorUpdateRef.current = null;
      if (__DEV__ && Math.abs(anchorDelta) >= 0.2) {
        console.log(
          `[Resonate] shazam anchor ignored target=${result.matchOffset.toFixed(
            2,
          )}s expected=${expectedPosition.toFixed(
            2,
          )}s delta=${anchorDelta.toFixed(3)}s`,
        );
      }
      return;
    }

    if (!pending) {
      pendingAnchorUpdateRef.current = {
        count: 1,
        firstSeenMs: result.matchSystemTime,
        isBackward,
        latest: result,
      };
      if (__DEV__) {
        console.log(
          `[Resonate] shazam anchor candidate offset=${result.matchOffset.toFixed(
            2,
          )}s expected=${expectedPosition.toFixed(
            2,
          )}s backward=${isBackward}`,
        );
      }
      return;
    }

    const agrees =
      pending.isBackward === isBackward &&
      Math.abs(result.matchOffset - pending.latest.matchOffset) <=
      SAME_SONG_ANCHOR_AGREEMENT_SEC;

    if (!agrees) {
      pendingAnchorUpdateRef.current = {
        count: 1,
        firstSeenMs: result.matchSystemTime,
        isBackward,
        latest: result,
      };
      if (__DEV__) {
        console.log(
          `[Resonate] shazam anchor reset prev=${pending.latest.matchOffset.toFixed(
            2,
          )}s next=${result.matchOffset.toFixed(2)}s`,
        );
      }
      return;
    }

    const nextPending: PendingAnchorUpdate = {
      count: pending.count + 1,
      firstSeenMs: pending.firstSeenMs,
      isBackward,
      latest: result,
    };
    pendingAnchorUpdateRef.current = nextPending;

    const requiredConfirmations = nextPending.isBackward
      ? SAME_SONG_BACKWARD_CONFIRMATIONS
      : SAME_SONG_ANCHOR_CONFIRMATIONS;
    const requiredStabilityMs = nextPending.isBackward
      ? SAME_SONG_BACKWARD_MIN_STABILITY_MS
      : 0;
    const stableForMs = result.matchSystemTime - nextPending.firstSeenMs;

    if (
      nextPending.count < requiredConfirmations ||
      stableForMs < requiredStabilityMs
    ) {
      return;
    }

    pendingAnchorUpdateRef.current = null;
    syncToShazamAnchor(nextPending.latest);
  };

  const activateMatchedSong = (result: RecognitionResult) => {
    currentSongKeyRef.current = buildSongKey(result);
    pendingSongSwitchRef.current = null;
    pendingAnchorUpdateRef.current = null;
    setSongTitle(result.title);
    setSongArtist(result.artist);
    setArtworkURL(result.artworkURL);
    setRecognitionError(null);
    syncToShazamAnchor(result);
    resetLyricState();
    setLyricsStatus('loading');
    void fetchLyricsForSong(result);
  };

  const resetRecognitionSession = () => {
    abortControllerRef.current?.abort();
    MusicRecognitionService.stop();
    AudioService.stop();
    HapticEngine.reset();
    syncEngineRef.current.stop();

    currentSongKeyRef.current = '';
    pendingSongSwitchRef.current = null;
    pendingAnchorUpdateRef.current = null;
    recognitionTrackIdRef.current = '';
    recognitionMatchOffsetRef.current = 0;
    recognitionMatchSystemTimeRef.current = 0;
    recognizedRef.current = false;
    isListeningRef.current = false;

    setRecognized(false);
    setIsListening(false);
    setPlaybackPosition(0);
    setSongTitle('');
    setSongArtist('');
    setArtworkURL('');
    resetLyricState();
    setLyricsStatus('idle');
    setRecognitionError(null);
    setSigCount(0);
    setShazamError('');
  };

  useEffect(() => {
    const unsubscribe = MusicRecognitionService.subscribeToMatches(result => {
      if (!recognizedRef.current) return;

      const nextSongKey = buildSongKey(result);
      if (nextSongKey === currentSongKeyRef.current) {
        pendingSongSwitchRef.current = null;
        considerSameSongAnchor(result);
        return;
      }

      const now = performance.now();
      const pending = pendingSongSwitchRef.current;

      if (!pending || pending.key !== nextSongKey) {
        pendingSongSwitchRef.current = {
          key: nextSongKey,
          count: 1,
          firstSeenMs: now,
          latest: result,
        };
        return;
      }

      const updatedPending: PendingSongSwitch = {
        ...pending,
        count: pending.count + 1,
        latest: result,
      };
      pendingSongSwitchRef.current = updatedPending;

      const stableForMs = now - updatedPending.firstSeenMs;
      if (
        updatedPending.count < SONG_SWITCH_CONFIRMATIONS ||
        stableForMs < SONG_SWITCH_MIN_STABILITY_MS
      ) {
        return;
      }

      activateMatchedSong(updatedPending.latest);
    });

    return unsubscribe;
  }, []);

  // Fetch lyrics from LRCLIB after recognition
  async function fetchLyricsForSong(result: RecognitionResult) {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLyricsStatus('loading');

    try {
      const data = await LRCLIBService.fetchLyrics(
        result.title,
        result.artist,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      recognitionTrackIdRef.current = data.trackId;

      if (data.syncedLyrics && data.syncedLyrics.length > 0) {
        lyricLineOffsetsRef.current = {};
        setPlainLyrics(null);
        setPlainSyncedLyrics([]);
        setSyncedLyrics(data.syncedLyrics);
        setLyricsStatus('synced');
        syncEngineRef.current.start({
          lyrics: data.syncedLyrics,
          matchOffset: recognitionMatchOffsetRef.current,
          matchSystemTime: recognitionMatchSystemTimeRef.current,
          trackId: data.trackId,
          callback: idx => setCurrentLyricIndex(idx),
        });
      } else if (data.plainLyrics && data.plainLyrics.length > 0) {
        syncEngineRef.current.stop();
        setSyncedLyrics([]);
        setPlainLyrics(data.plainLyrics);
        setPlainSyncedLyrics([]);
        setCurrentLyricIndex(-1);
        setLyricsStatus('plain');
      } else {
        syncEngineRef.current.stop();
        setSyncedLyrics([]);
        setPlainLyrics(null);
        setPlainSyncedLyrics([]);
        setCurrentLyricIndex(-1);
        setLyricsStatus('unavailable');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      syncEngineRef.current.stop();
      setLyricsStatus('unavailable');
    }
  }

  const handleListen = async () => {
    if (recognizedRef.current) {
      resetRecognitionSession();
      return;
    }

    if (isListeningRef.current) {
      MusicRecognitionService.stop();
      isListeningRef.current = false;
      setIsListening(false);
      return;
    }

    const mySession = ++sessionIdRef.current;
    isListeningRef.current = true;
    setIsListening(true);
    setRecognitionError(null);
    setSigCount(0);
    setShazamError('');

    try {
      const result = await MusicRecognitionService.identify();
      if (sessionIdRef.current !== mySession) return;

      pendingSongSwitchRef.current = null;
      recognizedRef.current = true;
      isListeningRef.current = false;
      setRecognized(true);
      setIsListening(false);

      // Start mic for rhythm haptics
      AudioService.start();
      HapticEngine.triggerSuccess();

      activateMatchedSong(result);
    } catch (err: any) {
      if (sessionIdRef.current !== mySession) return;
      isListeningRef.current = false;
      setIsListening(false);

      const code = err.code || err.message || '';
      if (code === 'CANCELLED') {
        // User cancelled, nothing to show
      } else if (code === 'TIMEOUT') {
        setRecognitionError('No song recognized');
      } else if (code !== 'BUSY') {
        setRecognitionError('Recognition failed');
      }
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const presets = [
    {
      name: 'Concert',
      Icon: MusicalNoteIcon,
      desc: 'Full range, high energy',
      color: palette.coral,
    },
    {
      name: 'EDM',
      Icon: ChartBarIcon,
      desc: 'Bass-heavy, pulsing',
      color: palette.violet,
    },
    {
      name: 'Classical',
      Icon: SpeakerWaveIcon,
      desc: 'Gentle, dynamic range',
      color: palette.cyan,
    },
    {
      name: 'Speech',
      Icon: MicrophoneIcon,
      desc: 'Clear mid-range focus',
      color: palette.gold,
    },
  ];

  const navBgTransparent = palette.isAmoled
    ? '#00000000'
    : palette.isDark
    ? '#0D0D1A00'
    : '#FFF8F000';
  const navBgSolid = palette.isAmoled
    ? '#000000'
    : palette.isDark
    ? '#0D0D1A'
    : '#FFF8F0';

  return (
    <View style={{flex: 1, backgroundColor: palette.bg}}>
      {/* Ambient glow orbs */}
      <GlowOrb
        id="glow1"
        color={palette.coral}
        size={420}
        baseOpacity={isListening ? 1.0 : 0.65}
        breatheAnim={breathe}
        style={{top: -160, right: -150}}
      />
      <GlowOrb
        id="glow2"
        color={palette.violet}
        size={440}
        baseOpacity={isListening ? 0.9 : 0.6}
        breatheAnim={breathe}
        style={{bottom: 40, left: -170}}
      />
      <GlowOrb
        id="glow3"
        color={palette.cyan}
        size={360}
        baseOpacity={recognized ? 0.85 : 0.55}
        breatheAnim={breathe}
        style={{top: '35%', right: -120}}
      />

      <SafeAreaView style={{flex: 1, backgroundColor: 'transparent'}}>
        {/* Header */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 12,
            flexShrink: 0,
            zIndex: 2,
          }}>
          <Text
            style={{
              color: palette.violet,
              fontSize: 26,
              fontFamily: 'Syne-Bold',
              letterSpacing: -0.5,
            }}>
            RESONATE
          </Text>
          <Text
            style={{
              color: palette.textSub,
              fontSize: 11,
              marginTop: 2,
              letterSpacing: 1.3,
              fontFamily: 'DMSans-Medium',
              fontWeight: '500',
            }}>
            {tab === 'listen'
              ? 'Feel the music'
              : tab === 'haptic'
              ? 'Haptic engine'
              : 'Accessibility'}
          </Text>
        </View>

        {/* Tab content */}
        <View style={{flex: 1, paddingHorizontal: 24, overflow: 'hidden'}}>
          {/* Listen tab */}
          {tab === 'listen' && (
            <View style={{flex: 1, flexDirection: 'column'}}>
              {/* Waveform */}
              <GlassCard
                palette={palette}
                style={{
                  height: 160,
                  flexShrink: 0,
                  overflow: 'hidden',
                  marginBottom: 16,
                  padding: 0,
                }}>
                <SvgWaveform
                  active={isListening || recognized}
                  bandsRef={micBandsRef}
                  palette={palette}
                />
                {recognized && (
                  <View
                    style={[
                      styles.rowBetween,
                      {position: 'absolute', bottom: 12, left: 14, right: 14},
                    ]}>
                    <View style={{flexDirection: 'row'}}>
                      <View
                        style={[
                          styles.tag,
                          {
                            borderColor: `${palette.coral}66`,
                            backgroundColor: `${palette.coral}22`,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.tagText,
                            {color: palette.coral, fontFamily: 'DMSans-Bold'},
                          ]}>
                          LIVE
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.tag,
                          {
                            borderColor: `${palette.cyan}66`,
                            backgroundColor: `${palette.cyan}22`,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.tagText,
                            {color: palette.cyan, fontFamily: 'DMSans-Bold'},
                          ]}>
                          SYNCED
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{
                        color: palette.gold,
                        fontFamily: 'Syne-Bold',
                        fontWeight: '700',
                        fontSize: 13,
                      }}>
                      {formatTime(Math.floor(playbackPosition))}
                    </Text>
                  </View>
                )}
              </GlassCard>

              {/* Pre-recognition: pill centered in remaining space */}
              {!recognized && (
                <View
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingBottom: 80,
                  }}>
                  <ListenControl
                    isActive={isListening}
                    isRecognized={false}
                    palette={palette}
                    onPress={handleListen}
                  />
                  {isListening && sigCount > 0 && !shazamError && (
                    <Text
                      style={{
                        color: palette.textSub,
                        fontSize: 12,
                        fontFamily: 'DMSans-Regular',
                        marginTop: 10,
                      }}>
                      {sigCount} {sigCount === 1 ? 'signature' : 'signatures'}{' '}
                      checked
                    </Text>
                  )}
                  {isListening && shazamError ? (
                    <Text
                      style={{
                        color: palette.coral,
                        fontSize: 12,
                        fontFamily: 'DMSans-Regular',
                        marginTop: 10,
                        textAlign: 'center',
                        paddingHorizontal: 24,
                      }}>
                      {shazamError}
                    </Text>
                  ) : null}
                  {recognitionError && (
                    <Text
                      style={{
                        color: palette.coral,
                        fontSize: 13,
                        fontFamily: 'DMSans-Regular',
                        marginTop: 12,
                      }}>
                      {recognitionError}
                    </Text>
                  )}
                </View>
              )}

              {/* Post-recognition: artwork + title/artist + stop */}
              {recognized && (
                <View style={{flex: 1, flexDirection: 'column'}}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 12,
                      flexShrink: 0,
                    }}>
                    {/* Album art */}
                    {artworkURL ? (
                      <Image
                        source={{uri: artworkURL}}
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 10,
                          marginRight: 12,
                          flexShrink: 0,
                          backgroundColor: palette.surface,
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 10,
                          marginRight: 12,
                          flexShrink: 0,
                          backgroundColor: palette.surface,
                          borderWidth: 1,
                          borderColor: palette.surfaceBorder,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <MusicalNoteIcon size={26} color={palette.textSub} />
                      </View>
                    )}
                    {/* Title + artist */}
                    <View style={{flex: 1, minWidth: 0, paddingRight: 2}}>
                      <MarqueeText
                        text={songTitle}
                        textStyle={{
                          fontFamily: 'Syne-ExtraBold',
                          fontWeight: '800',
                          fontSize: 17,
                          color: palette.text,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          color: palette.textSub,
                          fontFamily: 'DMSans-Regular',
                          marginTop: 3,
                        }}
                        numberOfLines={1}>
                        {songArtist}
                      </Text>
                    </View>
                    {/* Stop button */}
                    <TouchableOpacity
                      onPress={handleListen}
                      activeOpacity={0.85}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        flexShrink: 0,
                        backgroundColor: palette.coral,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: 10,
                        shadowColor: palette.coral,
                        shadowOpacity: 0.45,
                        shadowRadius: 12,
                        shadowOffset: {width: 0, height: 0},
                      }}>
                      <StopIcon
                        size={13}
                        color="#fff"
                        strokeWidth={0}
                        fill="#fff"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Lyrics card */}
                  <GlassCard
                    palette={palette}
                    style={{flex: 1, marginBottom: 88, padding: 18}}>
                    <View
                      style={[
                        styles.rowBetween,
                        {marginBottom: 16, flexShrink: 0, minHeight: 30},
                      ]}>
                      <Text
                        style={{
                          color: palette.violet,
                          fontSize: 11,
                          fontFamily: 'DMSans-Bold',
                          fontWeight: '700',
                          letterSpacing: 1,
                        }}>
                        RESOLYRIC
                      </Text>
                      {lyricsStatus === 'synced' && (
                        <View
                          style={[
                            styles.tag,
                            {
                              borderColor: `${palette.coral}66`,
                              backgroundColor: `${palette.coral}22`,
                              marginRight: 0,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.tagText,
                              {color: palette.coral, fontFamily: 'DMSans-Bold'},
                            ]}>
                            SYNCED
                          </Text>
                        </View>
                      )}
                      {lyricsStatus === 'plain' && (
                        <View
                          style={[
                            styles.tag,
                            {
                              borderColor: `${palette.cyan}66`,
                              backgroundColor: `${palette.cyan}22`,
                              marginRight: 0,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.tagText,
                              {color: palette.cyan, fontFamily: 'DMSans-Bold'},
                            ]}>
                            PLAIN
                          </Text>
                        </View>
                      )}
                    </View>

                    {lyricsStatus === 'loading' && (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <Text
                          style={{
                            color: palette.textSub,
                            fontFamily: 'DMSans-Regular',
                            fontSize: 13,
                          }}>
                          Loading lyrics...
                        </Text>
                      </View>
                    )}

                    {lyricsStatus === 'synced' && (
                      <ScrollView
                        ref={lyricScrollRef}
                        style={{flex: 1}}
                        contentContainerStyle={{
                          paddingTop: LYRIC_SCROLL_PADDING_TOP,
                          paddingBottom: Math.max(
                            getLyricRowHeight(fontSize) * 2,
                            LYRIC_ACTIVE_LINE_OFFSET,
                          ),
                        }}
                        showsVerticalScrollIndicator={false}>
                        {syncedLyrics.map((line, i) => (
                          <LyricLine
                            key={i}
                            text={line.text}
                            isActive={i === currentLyricIndex}
                            isPast={i < currentLyricIndex}
                            palette={palette}
                            size={fontSize}
                            onLayout={y => {
                              lyricLineOffsetsRef.current[i] = y;
                            }}
                          />
                        ))}
                      </ScrollView>
                    )}

                    {lyricsStatus === 'plain' &&
                      plainLyrics &&
                      plainSyncedLyrics.length > 0 && (
                        <ScrollView
                          ref={lyricScrollRef}
                          style={{flex: 1}}
                          contentContainerStyle={{
                            paddingTop: LYRIC_SCROLL_PADDING_TOP,
                            paddingBottom: Math.max(
                              getLyricRowHeight(fontSize) * 2,
                              LYRIC_ACTIVE_LINE_OFFSET,
                            ),
                          }}
                          showsVerticalScrollIndicator={false}>
                          {plainSyncedLyrics.map((line, i) => (
                            <LyricLine
                              key={i}
                              text={line.text}
                              isActive={i === currentLyricIndex}
                              isPast={i < currentLyricIndex}
                              palette={palette}
                              size={fontSize}
                              onLayout={y => {
                                lyricLineOffsetsRef.current[i] = y;
                              }}
                            />
                          ))}
                        </ScrollView>
                      )}

                    {lyricsStatus === 'plain' &&
                      plainLyrics &&
                      plainSyncedLyrics.length === 0 && (
                        <ScrollView
                          style={{flex: 1}}
                          showsVerticalScrollIndicator={false}>
                          {plainLyrics.map((line, i) => (
                            <Text
                              key={i}
                              style={{
                                color: palette.text,
                                fontSize:
                                  fontSize === 'XL'
                                    ? 26
                                    : fontSize === 'L'
                                    ? 22
                                    : fontSize === 'M'
                                    ? 18
                                    : 14,
                                fontFamily: 'Syne-Regular',
                                paddingVertical: 5,
                                opacity: 0.8,
                              }}>
                              {line}
                            </Text>
                          ))}
                        </ScrollView>
                      )}

                    {lyricsStatus === 'unavailable' && (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <Text
                          style={{
                            color: palette.textSub,
                            fontFamily: 'DMSans-Regular',
                            fontSize: 13,
                          }}>
                          Lyrics unavailable
                        </Text>
                      </View>
                    )}
                  </GlassCard>
                </View>
              )}
            </View>
          )}

          {/* Haptic tab */}
          {tab === 'haptic' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{paddingBottom: 130}}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  marginHorizontal: -5,
                  marginBottom: 4,
                }}>
                {[
                  {
                    label: 'Sub Bass',
                    hz: '20-60 Hz',
                    color: palette.coral,
                    value: Math.round(intensity * 0.9),
                  },
                  {
                    label: 'Bass',
                    hz: '60-250 Hz',
                    color: palette.violet,
                    value: bassBoost,
                  },
                  {
                    label: 'Mid',
                    hz: '250-4k Hz',
                    color: palette.cyan,
                    value: Math.round((intensity + trebleBoost) / 2),
                  },
                  {
                    label: 'Treble',
                    hz: '4k-20k Hz',
                    color: palette.gold,
                    value: trebleBoost,
                  },
                ].map(band => (
                  <View key={band.label} style={{width: '50%', padding: 5}}>
                    <GlassCard
                      palette={palette}
                      style={{
                        borderColor: `${band.color}18`,
                        padding: 14,
                        marginBottom: 0,
                      }}>
                      <View style={styles.rowBetween}>
                        <Text
                          style={{
                            color: palette.text,
                            fontFamily: 'Syne-Bold',
                            fontWeight: '700',
                            fontSize: 13,
                          }}>
                          {band.label}
                        </Text>
                        <Text
                          style={{
                            color: band.color,
                            fontFamily: 'DMSans-Bold',
                            fontWeight: '700',
                            fontSize: 10,
                          }}>
                          {band.value}%
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: palette.textSub,
                          fontSize: 10,
                          marginTop: 2,
                          marginBottom: 10,
                          fontFamily: 'DMSans-Regular',
                        }}>
                        {band.hz}
                      </Text>
                      <View
                        style={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: palette.isDark
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(26,26,46,0.06)',
                        }}>
                        <View
                          style={{
                            width: `${band.value}%`,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: band.color,
                          }}
                        />
                      </View>
                    </GlassCard>
                  </View>
                ))}
              </View>

              <GlassCard palette={palette} style={{padding: 20, marginTop: 6}}>
                <Text
                  style={{
                    color: palette.textSub,
                    fontSize: 10,
                    fontFamily: 'DMSans-Bold',
                    fontWeight: '700',
                    letterSpacing: 1,
                    marginBottom: 16,
                  }}>
                  VIBRATION MAPPING
                </Text>
                <CustomSlider
                  value={intensity}
                  min={0}
                  max={100}
                  onChange={setIntensity}
                  label="Vibration Intensity"
                  color={palette.coral}
                  palette={palette}
                />
                <CustomSlider
                  value={bassBoost}
                  min={0}
                  max={100}
                  onChange={setBassBoost}
                  label="Bass Response"
                  color={palette.violet}
                  palette={palette}
                />
                <CustomSlider
                  value={trebleBoost}
                  min={0}
                  max={100}
                  onChange={setTrebleBoost}
                  label="Treble Clarity"
                  color={palette.cyan}
                  palette={palette}
                />
              </GlassCard>

              <Text
                style={{
                  color: palette.textSub,
                  fontSize: 10,
                  fontFamily: 'DMSans-Bold',
                  fontWeight: '700',
                  letterSpacing: 1,
                  marginBottom: 10,
                  marginTop: 16,
                  marginLeft: 4,
                }}>
                PRESETS
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  marginHorizontal: -5,
                }}>
                {presets.map(preset => (
                  <View key={preset.name} style={{width: '50%', padding: 5}}>
                    <TouchableOpacity
                      onPress={() => {
                        setActivePreset(preset.name);
                        if (preset.name === 'EDM') {
                          setIntensity(88);
                          setBassBoost(90);
                          setTrebleBoost(48);
                        } else if (preset.name === 'Classical') {
                          setIntensity(54);
                          setBassBoost(42);
                          setTrebleBoost(58);
                        } else if (preset.name === 'Speech') {
                          setIntensity(44);
                          setBassBoost(38);
                          setTrebleBoost(62);
                        } else {
                          setIntensity(72);
                          setBassBoost(55);
                          setTrebleBoost(40);
                        }
                      }}
                      style={[
                        styles.card,
                        {
                          backgroundColor:
                            activePreset === preset.name
                              ? `${preset.color}14`
                              : palette.surface,
                          borderColor:
                            activePreset === preset.name
                              ? `${preset.color}40`
                              : palette.surfaceBorder,
                          borderWidth: 1,
                          padding: 14,
                          flexDirection: 'row',
                          alignItems: 'center',
                        },
                      ]}>
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          backgroundColor: `${preset.color}14`,
                          borderWidth: 1,
                          borderColor: `${preset.color}20`,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <preset.Icon
                          size={18}
                          color={preset.color}
                          strokeWidth={1.5}
                        />
                      </View>
                      <View style={{marginLeft: 12, flex: 1}}>
                        <Text
                          style={{
                            color: palette.text,
                            fontSize: 13,
                            fontFamily: 'Syne-Bold',
                            fontWeight: '700',
                          }}>
                          {preset.name}
                        </Text>
                        <Text
                          style={{
                            color: palette.textSub,
                            fontSize: 10,
                            marginTop: 2,
                            fontFamily: 'DMSans-Regular',
                          }}>
                          {preset.desc}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Settings tab */}
          {tab === 'settings' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{paddingBottom: 100}}>
              <GlassCard palette={palette} style={{padding: 20}}>
                <Text
                  style={{
                    color: palette.cyan,
                    fontSize: 11,
                    fontFamily: 'DMSans-Bold',
                    fontWeight: '700',
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}>
                  THEME
                </Text>
                <View style={{flexDirection: 'row'}}>
                  {[
                    {
                      key: 'light',
                      label: 'Light',
                      Icon: SunIcon,
                      swatch: '#FFF8F0',
                      accent: '#6D28D9',
                      fg: '#1A1A2E',
                    },
                    {
                      key: 'dark',
                      label: 'Dark',
                      Icon: MoonIcon,
                      swatch: '#0D0D1A',
                      accent: '#A855F7',
                      fg: '#FFFFFF',
                    },
                    {
                      key: 'amoled',
                      label: 'AMOLED',
                      Icon: BoltIcon,
                      swatch: '#000000',
                      accent: '#F472B6',
                      fg: '#FFFFFF',
                    },
                  ].map((mode, idx) => {
                    const selected = theme === (mode.key as ThemeMode);
                    return (
                      <TouchableOpacity
                        key={mode.key}
                        onPress={() => setTheme(mode.key as ThemeMode)}
                        style={{
                          flex: 1,
                          marginRight: idx < 2 ? 8 : 0,
                          borderRadius: 14,
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected
                            ? mode.accent
                            : palette.surfaceBorder,
                          padding: 10,
                          alignItems: 'center',
                          backgroundColor: selected
                            ? `${mode.accent}12`
                            : 'transparent',
                        }}>
                        <View
                          style={{
                            width: '100%',
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: mode.swatch,
                            marginBottom: 6,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor:
                              mode.key === 'light'
                                ? 'rgba(0,0,0,0.06)'
                                : 'rgba(255,255,255,0.08)',
                          }}>
                          <mode.Icon
                            size={16}
                            color={mode.fg}
                            strokeWidth={1.5}
                          />
                        </View>
                        <Text
                          style={{
                            color: selected ? mode.accent : palette.textSub,
                            fontSize: 11,
                            fontFamily: selected
                              ? 'DMSans-Bold'
                              : 'DMSans-Regular',
                            fontWeight: selected ? '700' : '500',
                          }}>
                          {mode.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>

              <GlassCard palette={palette} style={{padding: 20}}>
                <Text
                  style={{
                    color: palette.gold,
                    fontSize: 11,
                    fontFamily: 'DMSans-Bold',
                    fontWeight: '700',
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}>
                  APP ICON
                </Text>
                <View style={{flexDirection: 'row'}}>
                  {[
                    {
                      key: 'default' as AppIconName,
                      label: 'Light',
                      bg: '#FFF8F0',
                      border: 'rgba(0,0,0,0.08)',
                    },
                    {
                      key: 'AppIconDark' as AppIconName,
                      label: 'Dark',
                      bg: '#000000',
                      border: 'rgba(255,255,255,0.08)',
                    },
                  ].map((opt, idx) => {
                    const selected = activeIcon === opt.key;
                    return (
	                      <TouchableOpacity
	                        key={opt.key}
	                        onPress={() => {
                          if (activeIcon === opt.key) {
                            return;
                          }

	                          AppIcon.setIcon(opt.key)
	                            .then(() => setActiveIcon(opt.key))
	                            .catch(() => {});
	                        }}
                        style={{
                          flex: 1,
                          marginRight: idx === 0 ? 8 : 0,
                          borderRadius: 14,
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected
                            ? palette.gold
                            : palette.surfaceBorder,
                          padding: 10,
                          alignItems: 'center',
                          backgroundColor: selected
                            ? `${palette.gold}12`
                            : 'transparent',
                        }}>
                        <View
                          style={{
                            width: '100%',
                            height: 56,
                            borderRadius: 12,
                            backgroundColor: opt.bg,
                            marginBottom: 6,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: opt.border,
                            overflow: 'hidden',
                          }}
                        />
                        <Text
                          style={{
                            color: selected ? palette.gold : palette.textSub,
                            fontSize: 11,
                            fontFamily: selected
                              ? 'DMSans-Bold'
                              : 'DMSans-Regular',
                            fontWeight: selected ? '700' : '500',
                          }}>
                          {opt.label}
                        </Text>
                        {selected && (
                          <View
                            style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              width: 16,
                              height: 16,
                              borderRadius: 8,
                              backgroundColor: palette.gold,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                            <Text
                              style={{
                                color: '#fff',
                                fontSize: 10,
                                fontWeight: '700',
                              }}>
                              ✓
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text
                  style={{
                    color: palette.textSub,
                    fontSize: 10,
                    fontFamily: 'DMSans-Regular',
                    marginTop: 10,
                  }}>
                  iOS will show a confirmation when changing the icon.
                </Text>
              </GlassCard>

              <GlassCard palette={palette} style={{padding: 20}}>
                <Text
                  style={{
                    color: palette.coral,
                    fontSize: 11,
                    fontFamily: 'DMSans-Bold',
                    fontWeight: '700',
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}>
                  APP LANGUAGE
                </Text>
                {[
                  {native: 'English', english: 'English'},
                  {native: 'Español', english: 'Spanish'},
                  {native: 'Français', english: 'French'},
                  {native: 'Deutsch', english: 'German'},
                  {native: '日本語', english: 'Japanese'},
                  {native: '한국어', english: 'Korean'},
                ].map(lang => {
                  const selected = appLanguage === lang.native;
                  return (
                    <TouchableOpacity
                      key={lang.native}
                      onPress={() => setAppLanguage(lang.native)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderWidth: selected ? 1.5 : 1,
                        borderColor: selected
                          ? palette.coral
                          : palette.surfaceBorder,
                        borderRadius: 12,
                        paddingVertical: 11,
                        paddingHorizontal: 14,
                        marginBottom: 6,
                        backgroundColor: selected
                          ? `${palette.coral}10`
                          : 'transparent',
                      }}>
                      <View
                        style={{flexDirection: 'row', alignItems: 'baseline'}}>
                        <Text
                          style={{
                            color: selected ? palette.text : palette.textSub,
                            fontSize: 14,
                            fontFamily: selected ? 'Syne-Bold' : 'Syne-Regular',
                            fontWeight: selected ? '700' : '500',
                            marginRight: 8,
                          }}>
                          {lang.native}
                        </Text>
                        <Text
                          style={{
                            color: palette.textSub,
                            fontSize: 11,
                            fontFamily: 'DMSans-Regular',
                          }}>
                          {lang.english}
                        </Text>
                      </View>
                      {selected && (
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: palette.coral,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                          <Text
                            style={{
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: '700',
                            }}>
                            ✓
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </GlassCard>

              <GlassCard palette={palette} style={{padding: 20}}>
                <Text
                  style={{
                    color: palette.violet,
                    fontSize: 11,
                    fontFamily: 'DMSans-Bold',
                    fontWeight: '700',
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}>
                  RESOLYRIC SIZE
                </Text>
                <View style={{flexDirection: 'row'}}>
                  {(['S', 'M', 'L', 'XL'] as const).map((size, idx) => (
                    <TouchableOpacity
                      key={size}
                      onPress={() => setFontSize(size)}
                      style={{
                        flex: 1,
                        marginRight: idx < 3 ? 8 : 0,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 10,
                        backgroundColor:
                          fontSize === size ? palette.violet : palette.surface,
                        borderWidth: 0,
                        shadowColor:
                          fontSize === size ? palette.violet : 'transparent',
                        shadowOpacity: 0.4,
                        shadowRadius: 12,
                        shadowOffset: {width: 0, height: 4},
                      }}>
                      <Text
                        style={{
                          color: fontSize === size ? '#fff' : palette.textSub,
                          fontFamily: 'Syne-Bold',
                          fontWeight: '700',
                          fontSize:
                            size === 'XL'
                              ? 18
                              : size === 'L'
                              ? 16
                              : size === 'M'
                              ? 14
                              : 12,
                        }}>
                        {size}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </GlassCard>

              <GlassCard palette={palette} style={{padding: 20}}>
                <Text
                  style={{
                    color: palette.gold,
                    fontSize: 11,
                    fontFamily: 'DMSans-Bold',
                    fontWeight: '700',
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}>
                  DEFAULT LYRIC LANGUAGE
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    marginHorizontal: -4,
                  }}>
                  {[
                    {code: 'EN', name: 'English'},
                    {code: 'ES', name: 'Español'},
                    {code: 'KR', name: '한국어'},
                    {code: 'JP', name: '日本語'},
                    {code: 'FR', name: 'Français'},
                    {code: 'ZH', name: '中文'},
                  ].map(lang => {
                    const sel = defaultLyricLang === lang.code;
                    return (
                      <TouchableOpacity
                        key={lang.code}
                        onPress={() =>
                          setDefaultLyricLang(lang.code as LyricLanguageCode)
                        }
                        style={{width: '33.33%', padding: 4}}>
                        <View
                          style={{
                            borderRadius: 12,
                            paddingVertical: 10,
                            alignItems: 'center',
                            borderWidth: sel ? 2 : 1,
                            borderColor: sel
                              ? palette.gold
                              : palette.surfaceBorder,
                            backgroundColor: sel
                              ? `${palette.gold}12`
                              : 'transparent',
                          }}>
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              backgroundColor: sel
                                ? `${palette.gold}20`
                                : palette.isDark
                                ? 'rgba(255,255,255,0.06)'
                                : 'rgba(0,0,0,0.04)',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: 4,
                            }}>
                            <Text
                              style={{
                                fontSize: 13,
                                fontFamily: 'Syne-Bold',
                                fontWeight: '700',
                                color: sel ? palette.gold : palette.textSub,
                              }}>
                              {lang.code}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 10,
                              fontFamily: sel
                                ? 'DMSans-Bold'
                                : 'DMSans-Regular',
                              fontWeight: sel ? '700' : '500',
                              color: sel ? palette.gold : palette.textSub,
                            }}>
                            {lang.name}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>

              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: `${palette.violet}08`,
                    borderColor: `${palette.violet}18`,
                    borderWidth: 1,
                    padding: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                  },
                ]}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: palette.violet,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <ClockIcon size={22} color="#fff" strokeWidth={1.5} />
                </View>
                <View style={{marginLeft: 14, flex: 1}}>
                  <Text
                    style={{
                      color: palette.text,
                      fontFamily: 'Syne-Bold',
                      fontWeight: '700',
                      fontSize: 14,
                    }}>
                    Wearable Support
                  </Text>
                  <Text
                    style={{
                      color: palette.textSub,
                      fontSize: 11,
                      marginTop: 2,
                      fontFamily: 'DMSans-Regular',
                    }}>
                    Coming Spring 2026
                  </Text>
                </View>
                <View
                  style={[
                    styles.tag,
                    {
                      borderColor: `${palette.violet}30`,
                      backgroundColor: `${palette.violet}18`,
                      marginRight: 0,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.tagText,
                      {color: palette.violet, fontFamily: 'DMSans-Bold'},
                    ]}>
                    SOON
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </SafeAreaView>

      {/* Nav Bar */}
      <LinearGradient
        colors={[navBgTransparent, navBgSolid, navBgSolid]}
        locations={[0, 0.4, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingBottom: 34,
          paddingTop: 20,
          zIndex: 10,
        }}>
        <View style={styles.navRow}>
          <NavItem
            IconComponent={MicrophoneIcon}
            label="Listen"
            active={tab === 'listen'}
            onPress={() => setTab('listen')}
            palette={palette}
          />
          <NavItem
            IconComponent={Squares2X2Icon}
            label="Haptic"
            active={tab === 'haptic'}
            onPress={() => setTab('haptic')}
            palette={palette}
          />
          <NavItem
            IconComponent={Cog6ToothIcon}
            label="Settings"
            active={tab === 'settings'}
            onPress={() => setTab('settings')}
            palette={palette}
          />
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tag: {
    marginRight: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
});
