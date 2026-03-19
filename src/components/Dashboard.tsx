import { BlurView } from '@react-native-community/blur';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    PanResponder,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
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
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { AudioService } from '../services/AudioService';
import { HapticEngine } from '../services/HapticEngine';

type ThemeMode = 'dark' | 'light' | 'amoled';
type Tab = 'listen' | 'haptic' | 'settings';

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
    surface: isAmoled ? 'rgba(255,255,255,0.06)' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(26,26,46,0.04)',
    surfaceBorder: isAmoled ? 'rgba(255,255,255,0.10)' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(26,26,46,0.10)',
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

// ── True Glow Orb (SVG RadialGradient — actual smooth falloff) ──
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
    style={[{ position: 'absolute', width: size, height: size, opacity: breatheAnim }, style]}
  >
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={baseOpacity * 0.55} />
          <Stop offset="30%" stopColor={color} stopOpacity={baseOpacity * 0.28} />
          <Stop offset="60%" stopColor={color} stopOpacity={baseOpacity * 0.09} />
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

// ── Marquee Text (seamless infinite Spotify-style scroll) ──
const MarqueeText = ({ text, textStyle, forceScroll }: { text: string; textStyle?: object; forceScroll?: boolean }) => {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const tx = useRef(new Animated.Value(0)).current;
  const GAP = 48;

  const shouldScroll = textW > 0 && containerW > 0 && (forceScroll || textW > containerW);

  useEffect(() => {
    tx.setValue(0);
    if (!shouldScroll) return;
    // Animate full text+gap width, second copy fills the gap for seamless loop
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
    <View style={{ overflow: 'hidden' }} onLayout={e => setContainerW(e.nativeEvent.layout.width)}>
      {/* Horizontal ScrollView lets Text render at its natural single-line width for measurement */}
      <ScrollView
        horizontal
        scrollEnabled={false}
        style={{ position: 'absolute', opacity: 0 }}
        pointerEvents="none"
      >
        <Text style={textStyle} onLayout={e => setTextW(e.nativeEvent.layout.width)}>
          {text}
        </Text>
      </ScrollView>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: tx }] }}>
        <Text style={[textStyle, textW ? { width: textW } : {}]} numberOfLines={1} ellipsizeMode="clip">
          {text}
        </Text>
        {shouldScroll && (
          <Text style={[textStyle, { width: textW, marginLeft: GAP }]} numberOfLines={1} ellipsizeMode="clip">{text}</Text>
        )}
      </Animated.View>
    </View>
  );
};

// ── SVG Waveform ──
const SvgWaveform = ({
  active,
  intensity,
  palette,
}: {
  active: boolean;
  intensity: number;
  palette: Palette;
}) => {
  const timeRef = useRef(0);
  const [, forceUpdate] = useState(0);
  const [w, setW] = useState(0);
  const h = 160;

  useEffect(() => {
    const interval = setInterval(() => {
      timeRef.current += active ? 0.025 : 0.008;
      forceUpdate(n => n + 1);
    }, 33);
    return () => clearInterval(interval);
  }, [active]);

  const colors = [palette.coral, palette.violet, palette.cyan, palette.gold];

  const makePath = (i: number): string => {
    const t = timeRef.current;
    const amp = active ? (h * 0.12 + i * 8) * (intensity / 100) : h * 0.03;
    const freq = 0.008 + i * 0.003;
    const phase = t * (1.2 + i * 0.4);
    const pts: string[] = [];
    for (let x = 0; x <= w; x += 2) {
      const y =
        h / 2 +
        Math.sin(x * freq + phase) * amp +
        Math.sin(x * freq * 2.3 + phase * 0.7) * amp * 0.3;
      pts.push(`${x === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
  };

  if (w === 0) {
    return <View style={{ flex: 1 }} onLayout={e => setW(e.nativeEvent.layout.width)} />;
  }

  return (
    <Svg width={w} height={h} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {/* Sine waves */}
      {([0, 1, 2, 3] as const).map(i => {
        const d = makePath(i);
        const color = colors[i];
        const sw = active ? 2.5 - i * 0.3 : 1.2;
        const op = active ? 0.7 - i * 0.1 : 0.25;
        return (
          <React.Fragment key={i}>
            {active && <Path d={d} stroke={color} strokeWidth={sw * 8} strokeOpacity={op * 0.15} fill="none" />}
            <Path d={d} stroke={color} strokeWidth={sw} strokeOpacity={op} fill="none" />
          </React.Fragment>
        );
      })}

    </Svg>
  );
};

// ── Listen Control ──
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
  const pulse = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(isRecognized ? 52 : 260)).current;

  useEffect(() => {
    Animated.timing(pillWidth, {
      toValue: isRecognized ? 52 : 260,
      duration: 320,
      useNativeDriver: false,
      easing: Easing.inOut(Easing.quad),
    }).start();
  }, [isRecognized]);

  useEffect(() => {
    if (!isActive || isRecognized) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, isRecognized, pulse]);

  const label = isActive ? 'Listening' : 'Start Listening';
  const sub = isActive ? 'Identifying audio...' : 'Tap to recognize';

  return (
    <View style={{ alignItems: 'center', marginBottom: 14, marginTop: 8 }}>
      {isActive && !isRecognized && (
        <Animated.View
          style={{
            position: 'absolute',
            width: 260,
            height: 74,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: `${palette.violet}55`,
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) }],
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
          }}
        />
      )}
      <Animated.View style={{ width: pillWidth, overflow: 'hidden' }}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.85}
          style={{
            width: isRecognized ? 52 : 260,
            height: 52,
            borderRadius: isRecognized ? 26 : 999,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: isRecognized ? 'center' : 'flex-start',
            paddingHorizontal: isRecognized ? 0 : 6,
            paddingRight: isRecognized ? 0 : 22,
            borderWidth: 1.5,
            borderColor: isActive ? `${palette.coral}88` : palette.surfaceBorder,
            backgroundColor: isRecognized ? palette.coral : palette.surface,
          }}
        >
          {isRecognized ? (
            <StopIcon size={20} color="#fff" strokeWidth={2} />
          ) : (
            <>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: isActive ? palette.violet : `${palette.violet}99`,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}
              >
                <MicrophoneIcon size={18} color="#fff" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700', fontFamily: 'Syne-Bold' }}>{label}</Text>
                <Text style={{ color: palette.textSub, fontSize: 11, marginTop: 1, fontFamily: 'DMSans-Regular' }}>{sub}</Text>
              </View>
              {isActive && <Text style={{ color: palette.violet, fontWeight: '700' }}>•••</Text>}
            </>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// ── Lyric Line ──
const LyricLine = ({
  text,
  isActive,
  isPast,
  palette,
  size,
}: {
  text: string;
  isActive: boolean;
  isPast: boolean;
  palette: Palette;
  size: 'S' | 'M' | 'L' | 'XL';
}) => {
  const base = size === 'XL' ? 30 : size === 'L' ? 26 : size === 'M' ? 22 : 18;
  const targetOpacity = isActive ? 1 : isPast ? 0.22 : 0.42;
  const targetScale = isActive ? 1 : 0.93;
  const opacity = useRef(new Animated.Value(targetOpacity)).current;
  const scale = useRef(new Animated.Value(targetScale)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: targetOpacity, duration: 380, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      Animated.timing(scale, { toValue: targetScale, duration: 380, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
    ]).start();
  }, [isActive, isPast]);

  return (
    <Animated.Text
      style={{
        fontSize: isActive ? base : base - 4,
        fontFamily: isActive ? 'Syne-ExtraBold' : 'Syne-Regular',
        fontWeight: isActive ? '800' : '400',
        color: palette.text,
        paddingVertical: 5,
        lineHeight: isActive ? base * 1.25 : (base - 4) * 1.3,
        opacity,
        transform: [{ scale }],
      }}
    >
      {text}
    </Animated.Text>
  );
};

// ── Custom Slider ──
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
  const [trackWidth, setTrackWidth] = useState(1);
  const updateValue = (x: number) => {
    const ratio = Math.min(1, Math.max(0, x / trackWidth));
    onChange(Math.round(min + ratio * (max - min)));
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: evt => updateValue(evt.nativeEvent.locationX),
        onPanResponderMove: evt => updateValue(evt.nativeEvent.locationX),
      }),
    [trackWidth, min, max],
  );

  const pct = ((value - min) / (max - min)) * 100;
  return (
    <View style={{ marginBottom: 22 }}>
      <View style={styles.rowBetween}>
        <Text style={{ color: palette.textSub, fontWeight: '500', fontSize: 13, fontFamily: 'DMSans-Regular' }}>{label}</Text>
        <Text style={{ color, fontWeight: '700', fontSize: 13, fontFamily: 'DMSans-Bold' }}>{value}%</Text>
      </View>
      <View
        {...panResponder.panHandlers}
        onLayout={evt => setTrackWidth(evt.nativeEvent.layout.width)}
        style={{ height: 10, borderRadius: 6, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(26,26,46,0.09)', marginTop: 10 }}
      >
        <View style={{ width: `${pct}%`, height: 10, borderRadius: 6, backgroundColor: color }}>
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
              borderColor: palette.isAmoled ? '#000' : palette.isDark ? '#0D0D1A' : '#FFF8F0',
              shadowColor: color,
              shadowOpacity: 0.5,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        </View>
      </View>
    </View>
  );
};

// ── Nav Item ──
const NavItem = ({
  IconComponent,
  label,
  active,
  onPress,
  palette,
}: {
  IconComponent: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
  onPress: () => void;
  palette: Palette;
}) => (
  <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8 }}>
    {active && (
      <View style={{ width: 24, height: 3, borderRadius: 2, backgroundColor: palette.violet, marginBottom: 8 }} />
    )}
    {!active && <View style={{ width: 24, height: 3, marginBottom: 8 }} />}
    <IconComponent size={22} color={active ? palette.violet : palette.textSub} strokeWidth={1.5} />
    <Text
      style={{
        fontSize: 10,
        marginTop: 5,
        fontWeight: active ? '700' : '500',
        fontFamily: active ? 'DMSans-Bold' : 'DMSans-Regular',
        color: active ? palette.violet : palette.textSub,
        letterSpacing: 0.8,
      }}
    >
      {label.toUpperCase()}
    </Text>
  </TouchableOpacity>
);

// ── Glass Card ──
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
        reducedTransparencyFallbackColor={palette.isDark ? 'rgba(20,14,40,0.85)' : 'rgba(255,248,240,0.85)'}
        style={[styles.card, { borderColor: palette.surfaceBorder, borderWidth: 1 }, style]}
      >
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder, borderWidth: 1 }, style]}>
      {children}
    </View>
  );
};

// ── Main Dashboard ──
export const Dashboard = () => {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [showSplash, setShowSplash] = useState(true);
  const [tab, setTab] = useState<Tab>('listen');
  const [isListening, setIsListening] = useState(false);
  const [recognized, setRecognized] = useState(false);
  const [intensity, setIntensity] = useState(72);
  const [bassBoost, setBassBoost] = useState(55);
  const [trebleBoost, setTrebleBoost] = useState(40);
  const [currentLyric, setCurrentLyric] = useState(2);
  const [language, setLanguage] = useState('EN');
  const [defaultLyricLang, setDefaultLyricLang] = useState('EN');
  const [appLanguage, setAppLanguage] = useState('English');
  const [fontSize, setFontSize] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [elapsed, setElapsed] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const breathe = useRef(new Animated.Value(1)).current;

  const palette = getPalette(theme);

  const lyrics = useMemo(
    () => [
      "I've been searching for a light",
      'Through the noise of every night',
      'Feel the rhythm in my bones',
      'Every vibration finds its home',
      'Colors dancing, worlds collide',
      "Sound becomes the ocean's tide",
      'Resonate with every beat',
      '',
      'Lost between the highs and lows',
      'Where the silent river flows',
      'Frequencies that paint the air',
      'Wavelengths tangled in my hair',
      'Turn the volume into touch',
      'Feel the bass, it says so much',
      'Every pulse a whispered song',
      'Pulling me where I belong',
      '',
      'Echoes falling through the dark',
      'Every note becomes a spark',
      'Hands against the speaker wall',
      'I can feel it, feel it all',
      'Resonate with every beat',
      'Until the silence feels complete',
    ],
    [],
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 0.55, duration: 3200, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(breathe, { toValue: 1.0, duration: 3200, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  useEffect(() => {
    const fade = setTimeout(() => {
      Animated.timing(splashOpacity, { toValue: 0, duration: 700, useNativeDriver: true }).start(() =>
        setShowSplash(false),
      );
    }, 1650);
    return () => clearTimeout(fade);
  }, [splashOpacity]);

  useEffect(() => {
    const listener = AudioService.addListener(data => {
      if (!isListening) return;
      HapticEngine.processFrequency(data.frequency);
    });
    return () => {
      listener.remove();
      AudioService.stop();
    };
  }, [isListening]);

  useEffect(() => {
    if (!isListening || recognized) return undefined;
    const timer = setTimeout(() => {
      setRecognized(true);
      HapticEngine.triggerSuccess();
    }, 2200);
    return () => clearTimeout(timer);
  }, [isListening, recognized]);

  useEffect(() => {
    if (!recognized) return undefined;
    const interval = setInterval(() => setCurrentLyric(p => (p + 1) % 7), 3000);
    return () => clearInterval(interval);
  }, [recognized]);

  useEffect(() => {
    if (!recognized) return undefined;
    const interval = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(interval);
  }, [recognized]);

  const handleListen = async () => {
    if (recognized) {
      setRecognized(false);
      setIsListening(false);
      setElapsed(0);
      setCurrentLyric(2);
      AudioService.stop();
      return;
    }
    setIsListening(prev => {
      const next = !prev;
      if (next) AudioService.start();
      else AudioService.stop();
      return next;
    });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const presets = [
    { name: 'Concert', Icon: MusicalNoteIcon, desc: 'Full range, high energy', color: palette.coral },
    { name: 'EDM', Icon: ChartBarIcon, desc: 'Bass-heavy, pulsing', color: palette.violet },
    { name: 'Classical', Icon: SpeakerWaveIcon, desc: 'Gentle, dynamic range', color: palette.cyan },
    { name: 'Speech', Icon: MicrophoneIcon, desc: 'Clear mid-range focus', color: palette.gold },
  ];

  const navBgTransparent = palette.isAmoled ? '#00000000' : palette.isDark ? '#0D0D1A00' : '#FFF8F000';
  const navBgSolid = palette.isAmoled ? '#000000' : palette.isDark ? '#0D0D1A' : '#FFF8F0';

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* Ambient glow orbs */}
      <GlowOrb id="glow1" color={palette.coral} size={420} baseOpacity={isListening ? 1.0 : 0.65} breatheAnim={breathe} style={{ top: -160, right: -150 }} />
      <GlowOrb id="glow2" color={palette.violet} size={440} baseOpacity={isListening ? 0.9 : 0.6} breatheAnim={breathe} style={{ bottom: 40, left: -170 }} />
      <GlowOrb id="glow3" color={palette.cyan} size={360} baseOpacity={recognized ? 0.85 : 0.55} breatheAnim={breathe} style={{ top: '35%', right: -120 }} />

      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexShrink: 0, zIndex: 2 }}>
          <Text style={{ color: palette.violet, fontSize: 26, fontFamily: 'Syne-Bold', letterSpacing: -0.5 }}>
            RESONATE
          </Text>
          <Text style={{ color: palette.textSub, fontSize: 11, marginTop: 2, letterSpacing: 1.3, fontFamily: 'DMSans-Medium', fontWeight: '500' }}>
            {tab === 'listen' ? 'Feel the music' : tab === 'haptic' ? 'Haptic engine' : 'Accessibility'}
          </Text>
        </View>

        {/* Tab content */}
        <View style={{ flex: 1, paddingHorizontal: 24, overflow: 'hidden' }}>

          {/* ── LISTEN TAB — flex column, no outer scroll ── */}
          {tab === 'listen' && (
            <View style={{ flex: 1, flexDirection: 'column' }}>
              {/* Waveform */}
              <GlassCard palette={palette} style={{ height: 160, flexShrink: 0, overflow: 'hidden', marginBottom: 16, padding: 0 }}>
                <SvgWaveform
                  active={recognized}
                  intensity={Math.round((intensity + bassBoost + trebleBoost) / 3)}
                  palette={palette}
                />
                {recognized && (
                  <View style={[styles.rowBetween, { position: 'absolute', bottom: 12, left: 14, right: 14 }]}>
                    <View style={{ flexDirection: 'row' }}>
                      <View style={[styles.tag, { borderColor: `${palette.coral}66`, backgroundColor: `${palette.coral}22` }]}>
                        <Text style={[styles.tagText, { color: palette.coral, fontFamily: 'DMSans-Bold' }]}>LIVE</Text>
                      </View>
                      <View style={[styles.tag, { borderColor: `${palette.cyan}66`, backgroundColor: `${palette.cyan}22` }]}>
                        <Text style={[styles.tagText, { color: palette.cyan, fontFamily: 'DMSans-Bold' }]}>SYNCED</Text>
                      </View>
                    </View>
                    <Text style={{ color: palette.gold, fontFamily: 'Syne-Bold', fontWeight: '700', fontSize: 13 }}>
                      {formatTime(elapsed)}
                    </Text>
                  </View>
                )}
              </GlassCard>

              {/* Pre-recognition: pill centered in remaining space */}
              {!recognized && (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 }}>
                  <ListenControl isActive={isListening} isRecognized={false} palette={palette} onPress={handleListen} />
                </View>
              )}

              {/* Post-recognition: stop circle + marquee + lyrics */}
              {recognized && (
                <View style={{ flex: 1, flexDirection: 'column' }}>
                  {/* Stop circle + song info row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
                    <TouchableOpacity
                      onPress={handleListen}
                      activeOpacity={0.85}
                      style={{
                        width: 44, height: 44, borderRadius: 22, flexShrink: 0,
                        backgroundColor: palette.coral,
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: 14,
                        shadowColor: palette.coral, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
                      }}
                    >
                      <StopIcon size={14} color="#fff" strokeWidth={0} fill="#fff" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <MarqueeText
                        text="Echoes of Light — Extended Remaster Edition"
                        textStyle={{ fontFamily: 'Syne-ExtraBold', fontWeight: '800', fontSize: 18, color: palette.text }}
                        forceScroll
                      />
                      <Text style={{ fontSize: 13, color: palette.textSub, fontFamily: 'DMSans-Regular', marginTop: 2 }} numberOfLines={1}>
                        Aurora Waves · Dreamstate EP
                      </Text>
                    </View>
                  </View>

                  {/* Lyrics card — fills remaining space, scrolls internally */}
                  <GlassCard palette={palette} style={{ flex: 1, marginBottom: 88, padding: 18 }}>
                    <View style={[styles.rowBetween, { marginBottom: 12, flexShrink: 0 }]}>
                      <Text style={{ color: palette.violet, fontSize: 11, fontFamily: 'DMSans-Bold', fontWeight: '700', letterSpacing: 1 }}>
                        RESOLYRIC · {language}
                      </Text>
                      <View style={{ flexDirection: 'row' }}>
                        {['EN', 'ES', 'KR', 'JP'].map(l => (
                          <TouchableOpacity
                            key={l}
                            onPress={() => setLanguage(l)}
                            style={{
                              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 5,
                              backgroundColor: language === l ? palette.violet : 'transparent',
                              borderWidth: 0,
                            }}
                          >
                            <Text style={{ color: language === l ? '#fff' : palette.textSub, fontSize: 10, fontFamily: 'DMSans-Bold', fontWeight: '700' }}>{l}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                      {lyrics.map((line, i) => (
                        <LyricLine key={i} text={line} isActive={i === currentLyric} isPast={i < currentLyric} palette={palette} size={fontSize} />
                      ))}
                    </ScrollView>
                  </GlassCard>
                </View>
              )}
            </View>
          )}

          {/* ── HAPTIC TAB ── */}
          {tab === 'haptic' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 4 }}>
                {[
                  { label: 'Sub Bass', hz: '20-60 Hz', color: palette.coral, value: Math.round(intensity * 0.9) },
                  { label: 'Bass', hz: '60-250 Hz', color: palette.violet, value: bassBoost },
                  { label: 'Mid', hz: '250-4k Hz', color: palette.cyan, value: Math.round((intensity + trebleBoost) / 2) },
                  { label: 'Treble', hz: '4k-20k Hz', color: palette.gold, value: trebleBoost },
                ].map(band => (
                  <View key={band.label} style={{ width: '50%', padding: 5 }}>
                    <GlassCard palette={palette} style={{ borderColor: `${band.color}18`, padding: 14, marginBottom: 0 }}>
                      <View style={styles.rowBetween}>
                        <Text style={{ color: palette.text, fontFamily: 'Syne-Bold', fontWeight: '700', fontSize: 13 }}>{band.label}</Text>
                        <Text style={{ color: band.color, fontFamily: 'DMSans-Bold', fontWeight: '700', fontSize: 10 }}>{band.value}%</Text>
                      </View>
                      <Text style={{ color: palette.textSub, fontSize: 10, marginTop: 2, marginBottom: 10, fontFamily: 'DMSans-Regular' }}>{band.hz}</Text>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(26,26,46,0.06)' }}>
                        <View style={{ width: `${band.value}%`, height: 6, borderRadius: 3, backgroundColor: band.color }} />
                      </View>
                    </GlassCard>
                  </View>
                ))}
              </View>

              <GlassCard palette={palette} style={{ padding: 20, marginTop: 6 }}>
                <Text style={{ color: palette.textSub, fontSize: 10, fontFamily: 'DMSans-Bold', fontWeight: '700', letterSpacing: 1, marginBottom: 16 }}>
                  VIBRATION MAPPING
                </Text>
                <CustomSlider value={intensity} min={0} max={100} onChange={setIntensity} label="Vibration Intensity" color={palette.coral} palette={palette} />
                <CustomSlider value={bassBoost} min={0} max={100} onChange={setBassBoost} label="Bass Response" color={palette.violet} palette={palette} />
                <CustomSlider value={trebleBoost} min={0} max={100} onChange={setTrebleBoost} label="Treble Clarity" color={palette.cyan} palette={palette} />
              </GlassCard>

              <Text style={{ color: palette.textSub, fontSize: 10, fontFamily: 'DMSans-Bold', fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginTop: 16, marginLeft: 4 }}>
                PRESETS
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
                {presets.map(preset => (
                  <View key={preset.name} style={{ width: '50%', padding: 5 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setActivePreset(preset.name);
                        if (preset.name === 'EDM') { setIntensity(88); setBassBoost(90); setTrebleBoost(48); }
                        else if (preset.name === 'Classical') { setIntensity(54); setBassBoost(42); setTrebleBoost(58); }
                        else if (preset.name === 'Speech') { setIntensity(44); setBassBoost(38); setTrebleBoost(62); }
                        else { setIntensity(72); setBassBoost(55); setTrebleBoost(40); }
                      }}
                      style={[styles.card, {
                        backgroundColor: activePreset === preset.name ? `${preset.color}14` : palette.surface,
                        borderColor: activePreset === preset.name ? `${preset.color}40` : palette.surfaceBorder,
                        borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center',
                      }]}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${preset.color}14`, borderWidth: 1, borderColor: `${preset.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                        <preset.Icon size={18} color={preset.color} strokeWidth={1.5} />
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={{ color: palette.text, fontSize: 13, fontFamily: 'Syne-Bold', fontWeight: '700' }}>{preset.name}</Text>
                        <Text style={{ color: palette.textSub, fontSize: 10, marginTop: 2, fontFamily: 'DMSans-Regular' }}>{preset.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* ── SETTINGS TAB ── */}
          {tab === 'settings' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              <GlassCard palette={palette} style={{ padding: 20 }}>
                <Text style={{ color: palette.cyan, fontSize: 11, fontFamily: 'DMSans-Bold', fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>THEME</Text>
                <View style={{ flexDirection: 'row' }}>
                  {[
                    { key: 'light', label: 'Light', Icon: SunIcon, swatch: '#FFF8F0', accent: '#6D28D9', fg: '#1A1A2E' },
                    { key: 'dark', label: 'Dark', Icon: MoonIcon, swatch: '#0D0D1A', accent: '#A855F7', fg: '#FFFFFF' },
                    { key: 'amoled', label: 'AMOLED', Icon: BoltIcon, swatch: '#000000', accent: '#F472B6', fg: '#FFFFFF' },
                  ].map((mode, idx) => {
                    const selected = theme === (mode.key as ThemeMode);
                    return (
                      <TouchableOpacity
                        key={mode.key}
                        onPress={() => setTheme(mode.key as ThemeMode)}
                        style={{ flex: 1, marginRight: idx < 2 ? 8 : 0, borderRadius: 14, borderWidth: selected ? 2 : 1, borderColor: selected ? mode.accent : palette.surfaceBorder, padding: 10, alignItems: 'center', backgroundColor: selected ? `${mode.accent}12` : 'transparent' }}
                      >
                        <View style={{ width: '100%', height: 32, borderRadius: 8, backgroundColor: mode.swatch, marginBottom: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mode.key === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }}>
                          <mode.Icon size={16} color={mode.fg} strokeWidth={1.5} />
                        </View>
                        <Text style={{ color: selected ? mode.accent : palette.textSub, fontSize: 11, fontFamily: selected ? 'DMSans-Bold' : 'DMSans-Regular', fontWeight: selected ? '700' : '500' }}>{mode.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>

              <GlassCard palette={palette} style={{ padding: 20 }}>
                <Text style={{ color: palette.coral, fontSize: 11, fontFamily: 'DMSans-Bold', fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>APP LANGUAGE</Text>
                {[
                  { native: 'English', english: 'English' },
                  { native: 'Español', english: 'Spanish' },
                  { native: 'Français', english: 'French' },
                  { native: 'Deutsch', english: 'German' },
                  { native: '日本語', english: 'Japanese' },
                  { native: '한국어', english: 'Korean' },
                ].map(lang => {
                  const selected = appLanguage === lang.native;
                  return (
                    <TouchableOpacity
                      key={lang.native}
                      onPress={() => setAppLanguage(lang.native)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: selected ? 1.5 : 1, borderColor: selected ? palette.coral : palette.surfaceBorder, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 6, backgroundColor: selected ? `${palette.coral}10` : 'transparent' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text style={{ color: selected ? palette.text : palette.textSub, fontSize: 14, fontFamily: selected ? 'Syne-Bold' : 'Syne-Regular', fontWeight: selected ? '700' : '500', marginRight: 8 }}>{lang.native}</Text>
                        <Text style={{ color: palette.textSub, fontSize: 11, fontFamily: 'DMSans-Regular' }}>{lang.english}</Text>
                      </View>
                      {selected && (
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: palette.coral, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </GlassCard>

              <GlassCard palette={palette} style={{ padding: 20 }}>
                <Text style={{ color: palette.violet, fontSize: 11, fontFamily: 'DMSans-Bold', fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>RESOLYRIC SIZE</Text>
                <View style={{ flexDirection: 'row' }}>
                  {(['S', 'M', 'L', 'XL'] as const).map((size, idx) => (
                    <TouchableOpacity
                      key={size}
                      onPress={() => setFontSize(size)}
                      style={{ flex: 1, marginRight: idx < 3 ? 8 : 0, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: fontSize === size ? palette.violet : palette.surface, borderWidth: 0, shadowColor: fontSize === size ? palette.violet : 'transparent', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
                    >
                      <Text style={{ color: fontSize === size ? '#fff' : palette.textSub, fontFamily: 'Syne-Bold', fontWeight: '700', fontSize: size === 'XL' ? 18 : size === 'L' ? 16 : size === 'M' ? 14 : 12 }}>{size}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </GlassCard>

              <GlassCard palette={palette} style={{ padding: 20 }}>
                <Text style={{ color: palette.gold, fontSize: 11, fontFamily: 'DMSans-Bold', fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>DEFAULT LYRIC LANGUAGE</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {[
                    { code: 'EN', flag: '🇺🇸', name: 'English' },
                    { code: 'ES', flag: '🇪🇸', name: 'Español' },
                    { code: 'KR', flag: '🇰🇷', name: '한국어' },
                    { code: 'JP', flag: '🇯🇵', name: '日本語' },
                    { code: 'FR', flag: '🇫🇷', name: 'Français' },
                    { code: 'ZH', flag: '🇨🇳', name: '中文' },
                  ].map(lang => {
                    const sel = defaultLyricLang === lang.code;
                    return (
                      <TouchableOpacity key={lang.code} onPress={() => setDefaultLyricLang(lang.code)} style={{ width: '33.33%', padding: 4 }}>
                        <View style={{ borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: sel ? 2 : 1, borderColor: sel ? palette.gold : palette.surfaceBorder, backgroundColor: sel ? `${palette.gold}12` : 'transparent' }}>
                          <Text style={{ fontSize: 20, marginBottom: 2 }}>{lang.flag}</Text>
                          <Text style={{ fontSize: 10, fontFamily: sel ? 'DMSans-Bold' : 'DMSans-Regular', fontWeight: sel ? '700' : '500', color: sel ? palette.gold : palette.textSub }}>{lang.name}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>

              <View style={[styles.card, { backgroundColor: `${palette.violet}08`, borderColor: `${palette.violet}18`, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: palette.violet, alignItems: 'center', justifyContent: 'center' }}>
                  <ClockIcon size={22} color="#fff" strokeWidth={1.5} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text style={{ color: palette.text, fontFamily: 'Syne-Bold', fontWeight: '700', fontSize: 14 }}>Wearable Support</Text>
                  <Text style={{ color: palette.textSub, fontSize: 11, marginTop: 2, fontFamily: 'DMSans-Regular' }}>Coming Spring 2026</Text>
                </View>
                <View style={[styles.tag, { borderColor: `${palette.violet}30`, backgroundColor: `${palette.violet}18`, marginRight: 0 }]}>
                  <Text style={[styles.tagText, { color: palette.violet, fontFamily: 'DMSans-Bold' }]}>SOON</Text>
                </View>
              </View>
            </ScrollView>
          )}

        </View>
      </SafeAreaView>

      {/* Nav Bar — gradient fades from transparent to solid theme bg, matching prototype */}
      <LinearGradient
        colors={[navBgTransparent, navBgSolid, navBgSolid]}
        locations={[0, 0.4, 1]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingBottom: 34, paddingTop: 20, zIndex: 10 }}
      >
        <View style={styles.navRow}>
          <NavItem IconComponent={MicrophoneIcon} label="Listen" active={tab === 'listen'} onPress={() => setTab('listen')} palette={palette} />
          <NavItem IconComponent={Squares2X2Icon} label="Haptic" active={tab === 'haptic'} onPress={() => setTab('haptic')} palette={palette} />
          <NavItem IconComponent={Cog6ToothIcon} label="Settings" active={tab === 'settings'} onPress={() => setTab('settings')} palette={palette} />
        </View>
      </LinearGradient>

        {/* Splash */}
        {showSplash && (
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              zIndex: 20,
              backgroundColor: palette.isAmoled ? '#000' : palette.isDark ? '#0D0D1A' : '#FFF8F0',
              justifyContent: 'center',
              alignItems: 'center',
              opacity: splashOpacity,
            }}
          >
            <Text style={{ color: palette.text, fontFamily: 'Syne-ExtraBold', fontWeight: '800', fontSize: 36, letterSpacing: 2 }}>RESONATE</Text>
            <Text style={{ color: palette.textSub, marginTop: 10, fontFamily: 'DMSans-Medium', fontWeight: '600' }}>Team 28157-1</Text>
            <Text style={{ color: `${palette.text}55`, marginTop: 4, fontSize: 11, letterSpacing: 1.5, fontFamily: 'DMSans-Regular' }}>WASHINGTON TSA 2026</Text>
          </Animated.View>
        )}
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
