import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AudioService } from '../services/AudioService';
import { HapticEngine } from '../services/HapticEngine';
import LinearGradient from 'react-native-linear-gradient';
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
    surface: isAmoled ? 'rgba(255,255,255,0.05)' : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(26,26,46,0.03)',
    surfaceBorder: isAmoled ? 'rgba(255,255,255,0.08)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(26,26,46,0.08)',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSub: isDark ? 'rgba(255,255,255,0.58)' : 'rgba(26,26,46,0.55)',
    coral: isDark ? '#F472B6' : '#BE185D',
    violet: isDark ? '#A855F7' : '#6D28D9',
    cyan: isDark ? '#E879A8' : '#9D174D',
    gold: isDark ? '#C084FC' : '#7E22CE',
    isDark,
    isAmoled,
  };
};

const WaveformBars = ({ active, intensity, palette }: { active: boolean; intensity: number; palette: Palette }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 120);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.waveRow}>
      {Array.from({ length: 32 }).map((_, i) => {
        const seed = Math.sin((i + 1) * 0.8 + tick * (active ? 0.45 : 0.12));
        const minH = active ? 12 : 4;
        const maxH = active ? 88 : 18;
        const val = ((seed + 1) / 2) * (intensity / 100);
        const h = minH + val * (maxH - minH);
        const color = [palette.coral, palette.violet, palette.cyan, palette.gold][i % 4];
        return (
          <View
            key={`bar-${i}`}
            style={{
              width: 6,
              height: h,
              borderRadius: 6,
              backgroundColor: color,
              opacity: active ? 0.75 : 0.25,
              marginHorizontal: 1.5,
            }}
          />
        );
      })}
    </View>
  );
};

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
  useEffect(() => {
    if (!isActive || isRecognized) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, isRecognized, pulse]);

  const label = isRecognized ? 'Stop' : isActive ? 'Listening' : 'Start Listening';
  const sub = isRecognized ? 'Tap to reset' : isActive ? 'Identifying audio...' : 'Tap to recognize';

  return (
    <View style={{ alignItems: 'center', marginBottom: 18, marginTop: 8 }}>
      {isActive && !isRecognized && (
        <Animated.View
          style={{
            position: 'absolute',
            width: 250,
            height: 72,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: `${palette.violet}66`,
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
          }}
        />
      )}

      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.88}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 999,
          paddingVertical: 14,
          paddingHorizontal: 18,
          borderWidth: 1.5,
          borderColor: isActive ? `${palette.violet}88` : palette.surfaceBorder,
          backgroundColor: palette.surface,
          minWidth: 260,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: isRecognized ? palette.coral : isActive ? palette.violet : `${palette.violet}99`,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{isRecognized ? '■' : '🎤'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
          <Text style={{ color: palette.textSub, fontSize: 11, marginTop: 1 }}>{sub}</Text>
        </View>
        {isActive && !isRecognized && <Text style={{ color: palette.violet, fontWeight: '700' }}>•••</Text>}
      </TouchableOpacity>
    </View>
  );
};

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
  return (
    <Text
      style={{
        fontSize: isActive ? base : base - 4,
        fontWeight: isActive ? '800' : '500',
        color: isActive ? palette.text : isPast ? `${palette.text}55` : `${palette.text}88`,
        paddingVertical: 6,
      }}
    >
      {text}
    </Text>
  );
};

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
    const next = Math.round(min + ratio * (max - min));
    onChange(next);
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => updateValue(evt.nativeEvent.locationX),
        onPanResponderMove: (evt) => updateValue(evt.nativeEvent.locationX),
      }),
    [trackWidth, min, max]
  );

  const pct = ((value - min) / (max - min)) * 100;
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={styles.rowBetween}>
        <Text style={{ color: palette.textSub, fontWeight: '500', fontSize: 13 }}>{label}</Text>
        <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{value}%</Text>
      </View>
      <View
        {...panResponder.panHandlers}
        onLayout={(evt) => setTrackWidth(evt.nativeEvent.layout.width)}
        style={{ height: 10, borderRadius: 6, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(26,26,46,0.09)', marginTop: 8 }}
      >
        <View style={{ width: `${pct}%`, height: 10, borderRadius: 6, backgroundColor: color }}>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: color,
              position: 'absolute',
              right: -9,
              top: -4,
              borderWidth: 2,
              borderColor: palette.isAmoled ? '#000' : palette.isDark ? '#0D0D1A' : '#FFF8F0',
            }}
          />
        </View>
      </View>
    </View>
  );
};

const NavItem = ({
  icon,
  label,
  active,
  onPress,
  palette,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
  palette: Palette;
}) => (
  <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 }}>
    <Text style={{ fontSize: 20, opacity: active ? 1 : 0.55, color: active ? palette.violet : palette.textSub }}>{icon}</Text>
    <Text style={{ fontSize: 10, marginTop: 4, fontWeight: active ? '700' : '500', color: active ? palette.violet : palette.textSub }}>
      {label.toUpperCase()}
    </Text>
    {active && <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: palette.violet, marginTop: 5 }} />}
  </TouchableOpacity>
);

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
  const [appLanguage, setAppLanguage] = useState('English');
  const [fontSize, setFontSize] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [elapsed, setElapsed] = useState(0);
  const [currentFreq, setCurrentFreq] = useState(0);
  const splashOpacity = useRef(new Animated.Value(1)).current;

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
    ],
    []
  );

  useEffect(() => {
    const fade = setTimeout(() => {
      Animated.timing(splashOpacity, { toValue: 0, duration: 700, useNativeDriver: true }).start(() => setShowSplash(false));
    }, 1650);
    return () => clearTimeout(fade);
  }, [splashOpacity]);

  useEffect(() => {
    const listener = AudioService.addListener((data) => {
      if (!isListening) return;
      setCurrentFreq(data.frequency);
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
    const interval = setInterval(() => setCurrentLyric((p) => (p + 1) % 7), 3000);
    return () => clearInterval(interval);
  }, [recognized]);

  useEffect(() => {
    if (!recognized) return undefined;
    const interval = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [recognized]);

  const handleListen = () => {
    if (recognized) {
      setRecognized(false);
      setIsListening(false);
      setElapsed(0);
      setCurrentLyric(2);
      AudioService.stop();
      return;
    }

    setIsListening((prev) => {
      const next = !prev;
      if (next) AudioService.start();
      else AudioService.stop();
      return next;
    });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={[styles.orb, { top: -90, right: -80, backgroundColor: `${palette.coral}33`, opacity: isListening ? 0.95 : 0.45 }]} />
        <View style={[styles.orb, { bottom: 100, left: -110, backgroundColor: `${palette.violet}2E`, width: 310, height: 310, opacity: isListening ? 0.95 : 0.35 }]} />
        <View style={[styles.orb, { top: '42%', right: -60, backgroundColor: `${palette.cyan}29`, width: 220, height: 220, opacity: recognized ? 0.9 : 0.25 }]} />

        <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, zIndex: 2 }}>
          <Text style={{ color: palette.violet, fontSize: 28, fontWeight: '800', letterSpacing: 0.5 }}>RESONATE</Text>
          <Text style={{ color: palette.textSub, fontSize: 11, marginTop: 2, letterSpacing: 1 }}>
            {tab === 'listen' ? 'FEEL THE MUSIC' : tab === 'haptic' ? 'HAPTIC ENGINE' : 'ACCESSIBILITY'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          {tab === 'listen' && (
            <View>
              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder, minHeight: 180 }]}>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <WaveformBars active={recognized} intensity={Math.round((intensity + bassBoost + trebleBoost) / 3)} palette={palette} />
                </View>
                {recognized && (
                  <View style={[styles.rowBetween, { marginTop: 14 }]}>
                    <View style={{ flexDirection: 'row' }}>
                      <View style={[styles.tag, { borderColor: `${palette.coral}55`, backgroundColor: `${palette.coral}22` }]}>
                        <Text style={[styles.tagText, { color: palette.coral }]}>LIVE</Text>
                      </View>
                      <View style={[styles.tag, { borderColor: `${palette.cyan}55`, backgroundColor: `${palette.cyan}22` }]}>
                        <Text style={[styles.tagText, { color: palette.cyan }]}>SYNCED</Text>
                      </View>
                    </View>
                    <Text style={{ color: palette.gold, fontWeight: '700' }}>{formatTime(elapsed)}</Text>
                  </View>
                )}
              </View>

              <ListenControl isActive={isListening} isRecognized={recognized} palette={palette} onPress={handleListen} />

              {recognized && (
                <View style={{ alignItems: 'center', marginBottom: 22 }}>
                  <Text style={{ color: palette.text, fontSize: 23, fontWeight: '800' }}>Echoes of Light</Text>
                  <Text style={{ color: palette.textSub, fontSize: 14, marginTop: 2 }}>Aurora Waves · Dreamstate EP</Text>
                </View>
              )}

              {recognized && (
                <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder, padding: 18 }]}>
                  <View style={[styles.rowBetween, { marginBottom: 12 }]}>
                    <Text style={{ color: palette.violet, fontSize: 11, fontWeight: '700' }}>RESOLYRIC · {language}</Text>
                    <View style={{ flexDirection: 'row' }}>
                      {['EN', 'ES', 'KR', 'JP'].map((l) => (
                        <TouchableOpacity
                          key={l}
                          onPress={() => setLanguage(l)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                            marginLeft: 6,
                            backgroundColor: language === l ? palette.violet : palette.surface,
                            borderWidth: 1,
                            borderColor: palette.surfaceBorder,
                          }}
                        >
                          <Text style={{ color: language === l ? '#fff' : palette.textSub, fontSize: 10, fontWeight: '700' }}>{l}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {lyrics.map((line, i) => (
                    <LyricLine key={line} text={line} isActive={i === currentLyric} isPast={i < currentLyric} palette={palette} size={fontSize} />
                  ))}
                </View>
              )}
            </View>
          )}

          {tab === 'haptic' && (
            <View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 12 }}>
                {[
                  { label: 'Sub Bass', hz: '20-60 Hz', color: palette.coral, value: Math.round(intensity * 0.9) },
                  { label: 'Bass', hz: '60-250 Hz', color: palette.violet, value: bassBoost },
                  { label: 'Mid', hz: '250-4k Hz', color: palette.cyan, value: Math.round((intensity + trebleBoost) / 2) },
                  { label: 'Treble', hz: '4k-20k Hz', color: palette.gold, value: trebleBoost },
                ].map((band) => (
                  <View key={band.label} style={{ width: '50%', padding: 5 }}>
                    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: `${band.color}33`, padding: 14 }]}>
                      <View style={styles.rowBetween}>
                        <Text style={{ color: palette.text, fontWeight: '700', fontSize: 13 }}>{band.label}</Text>
                        <Text style={{ color: band.color, fontWeight: '700', fontSize: 11 }}>{band.value}%</Text>
                      </View>
                      <Text style={{ color: palette.textSub, fontSize: 10, marginTop: 2 }}>{band.hz}</Text>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(26,26,46,0.08)', marginTop: 10 }}>
                        <View style={{ width: `${band.value}%`, height: 6, borderRadius: 3, backgroundColor: band.color }} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder, padding: 18, marginBottom: 16 }]}>
                <Text style={{ color: palette.textSub, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 14 }}>VIBRATION MAPPING</Text>
                <CustomSlider value={intensity} min={0} max={100} onChange={setIntensity} label="Vibration Intensity" color={palette.coral} palette={palette} />
                <CustomSlider value={bassBoost} min={0} max={100} onChange={setBassBoost} label="Bass Response" color={palette.violet} palette={palette} />
                <CustomSlider value={trebleBoost} min={0} max={100} onChange={setTrebleBoost} label="Treble Clarity" color={palette.cyan} palette={palette} />
              </View>

              <Text style={{ color: palette.textSub, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginLeft: 4 }}>PRESETS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
                {[
                  { name: 'Concert', icon: '♪', desc: 'Full range, high energy', color: palette.coral },
                  { name: 'EDM', icon: '▦', desc: 'Bass-heavy, pulsing', color: palette.violet },
                  { name: 'Classical', icon: '♬', desc: 'Gentle, dynamic range', color: palette.cyan },
                  { name: 'Speech', icon: '🎙', desc: 'Clear mid-range focus', color: palette.gold },
                ].map((preset) => (
                  <View key={preset.name} style={{ width: '50%', padding: 5 }}>
                    <TouchableOpacity
                      onPress={() => {
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
                      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder, padding: 14, flexDirection: 'row', alignItems: 'center' }]}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${preset.color}22`, borderWidth: 1, borderColor: `${preset.color}45`, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: preset.color, fontSize: 16, fontWeight: '700' }}>{preset.icon}</Text>
                      </View>
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{preset.name}</Text>
                        <Text style={{ color: palette.textSub, fontSize: 10, marginTop: 2 }}>{preset.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {tab === 'settings' && (
            <View>
              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder, padding: 18, marginBottom: 14 }]}>
                <Text style={{ color: palette.cyan, fontSize: 11, fontWeight: '700', marginBottom: 10 }}>THEME</Text>
                <View style={{ flexDirection: 'row' }}>
                  {[
                    { key: 'light', label: 'Light', swatch: '#FFF8F0', accent: '#6D28D9' },
                    { key: 'dark', label: 'Dark', swatch: '#0D0D1A', accent: '#A855F7' },
                    { key: 'amoled', label: 'AMOLED', swatch: '#000000', accent: '#F472B6' },
                  ].map((mode) => {
                    const selected = theme === (mode.key as ThemeMode);
                    return (
                      <TouchableOpacity
                        key={mode.key}
                        onPress={() => setTheme(mode.key as ThemeMode)}
                        style={{
                          flex: 1,
                          marginRight: mode.key === 'amoled' ? 0 : 8,
                          borderRadius: 14,
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected ? mode.accent : palette.surfaceBorder,
                          padding: 10,
                          alignItems: 'center',
                          backgroundColor: selected ? `${mode.accent}22` : 'transparent',
                        }}
                      >
                        <View style={{ width: '100%', height: 30, borderRadius: 8, backgroundColor: mode.swatch, marginBottom: 6 }} />
                        <Text style={{ color: selected ? mode.accent : palette.textSub, fontSize: 11, fontWeight: selected ? '700' : '500' }}>{mode.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder, padding: 18, marginBottom: 14 }]}>
                <Text style={{ color: palette.coral, fontSize: 11, fontWeight: '700', marginBottom: 10 }}>APP LANGUAGE</Text>
                {['English', 'Español', 'Français', 'Deutsch', '日本語', '한국어'].map((lang) => {
                  const selected = appLanguage === lang;
                  return (
                    <TouchableOpacity
                      key={lang}
                      onPress={() => setAppLanguage(lang)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? palette.coral : palette.surfaceBorder,
                        borderRadius: 12,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        marginBottom: 8,
                        backgroundColor: selected ? `${palette.coral}1A` : 'transparent',
                      }}
                    >
                      <Text style={{ color: selected ? palette.text : palette.textSub, fontSize: 14, fontWeight: selected ? '700' : '500' }}>{lang}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder, padding: 18, marginBottom: 14 }]}>
                <Text style={{ color: palette.violet, fontSize: 11, fontWeight: '700', marginBottom: 10 }}>RESOLYRIC SIZE</Text>
                <View style={{ flexDirection: 'row' }}>
                  {(['S', 'M', 'L', 'XL'] as const).map((size) => (
                    <TouchableOpacity
                      key={size}
                      onPress={() => setFontSize(size)}
                      style={{
                        flex: 1,
                        marginRight: size === 'XL' ? 0 : 8,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 10,
                        backgroundColor: fontSize === size ? palette.violet : palette.surface,
                        borderWidth: 1,
                        borderColor: palette.surfaceBorder,
                      }}
                    >
                      <Text style={{ color: fontSize === size ? '#fff' : palette.textSub, fontWeight: '700' }}>{size}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: `${palette.violet}14`, borderColor: `${palette.violet}40`, padding: 16, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: palette.violet, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 20 }}>⌚</Text>
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14 }}>Wearable Support</Text>
                  <Text style={{ color: palette.textSub, fontSize: 11, marginTop: 2 }}>Coming Spring 2026</Text>
                </View>
                <View style={[styles.tag, { borderColor: `${palette.violet}66`, backgroundColor: `${palette.violet}22`, marginRight: 0 }]}>
                  <Text style={[styles.tagText, { color: palette.violet }]}>SOON</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        <LinearGradient
          colors={
            palette.isAmoled
              ? ['#00000000', '#000000EE']
              : palette.isDark
              ? ['#0D0D1A00', '#0D0D1AE6']
              : ['#FFF8F000', '#FFF8F0F0']
          }
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingBottom: 18, paddingTop: 14, zIndex: 3 }}
        >
          <View style={styles.navRow}>
            <NavItem icon="🎤" label="Listen" active={tab === 'listen'} onPress={() => setTab('listen')} palette={palette} />
            <NavItem icon="◈" label="Haptic" active={tab === 'haptic'} onPress={() => setTab('haptic')} palette={palette} />
            <NavItem icon="⚙" label="Settings" active={tab === 'settings'} onPress={() => setTab('settings')} palette={palette} />
          </View>
        </LinearGradient>

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
            <Text style={{ color: palette.text, fontWeight: '800', fontSize: 34, letterSpacing: 1 }}>RESONATE</Text>
            <Text style={{ color: palette.textSub, marginTop: 10, fontWeight: '600' }}>Team 28157-1</Text>
            <Text style={{ color: `${palette.text}66`, marginTop: 3, fontSize: 11, letterSpacing: 1 }}>WASHINGTON TSA 2026</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waveRow: {
    height: 92,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 6,
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
    letterSpacing: 0.4,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  orb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 180,
  },
});
