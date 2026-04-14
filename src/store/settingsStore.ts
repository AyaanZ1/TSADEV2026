import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light' | 'amoled';
export type LyricLanguageCode = 'EN' | 'ES' | 'KR' | 'JP' | 'FR' | 'ZH';
export type FontSize = 'S' | 'M' | 'L' | 'XL';
export type AppLanguage =
  | 'English'
  | 'Español'
  | 'Français'
  | 'Deutsch'
  | '日本語'
  | '한국어';

interface SettingsState {
  theme: ThemeMode;
  appLanguage: AppLanguage;
  defaultLyricLang: LyricLanguageCode;
  fontSize: FontSize;
  intensity: number;
  bassBoost: number;
  trebleBoost: number;
  activePreset: string | null;

  setTheme: (theme: ThemeMode) => void;
  setAppLanguage: (lang: AppLanguage) => void;
  setDefaultLyricLang: (lang: LyricLanguageCode) => void;
  setFontSize: (size: FontSize) => void;
  setIntensity: (val: number) => void;
  setBassBoost: (val: number) => void;
  setTrebleBoost: (val: number) => void;
  setActivePreset: (name: string | null) => void;
  applyPreset: (name: string) => void;
}

const PRESET_VALUES: Record<string, {intensity: number; bassBoost: number; trebleBoost: number}> = {
  Concert: {intensity: 72, bassBoost: 55, trebleBoost: 40},
  EDM: {intensity: 88, bassBoost: 90, trebleBoost: 48},
  Classical: {intensity: 54, bassBoost: 42, trebleBoost: 58},
  Speech: {intensity: 44, bassBoost: 38, trebleBoost: 62},
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      appLanguage: 'English',
      defaultLyricLang: 'EN',
      fontSize: 'M',
      intensity: 72,
      bassBoost: 55,
      trebleBoost: 40,
      activePreset: null,

      setTheme: (theme) => set({theme}),
      setAppLanguage: (appLanguage) => set({appLanguage}),
      setDefaultLyricLang: (defaultLyricLang) => set({defaultLyricLang}),
      setFontSize: (fontSize) => set({fontSize}),
      setIntensity: (intensity) => set({intensity, activePreset: null}),
      setBassBoost: (bassBoost) => set({bassBoost, activePreset: null}),
      setTrebleBoost: (trebleBoost) => set({trebleBoost, activePreset: null}),
      setActivePreset: (activePreset) => set({activePreset}),
      applyPreset: (name) => {
        const vals = PRESET_VALUES[name];
        if (vals) {
          set({activePreset: name, ...vals});
        }
      },
    }),
    {
      name: 'resonate-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
