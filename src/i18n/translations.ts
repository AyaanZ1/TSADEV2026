import type {AppLanguage} from '../store/settingsStore';

type TranslationStrings = {
  // Header subtitles
  feelTheMusic: string;
  hapticEngine: string;
  accessibility: string;

  // Nav
  listen: string;
  haptic: string;
  settings: string;

  // Listen tab
  listening: string;
  startListening: string;
  identifyingAudio: string;
  tapToRecognize: string;
  signatureChecked: string;
  signaturesChecked: string;
  noSongRecognized: string;
  recognitionFailed: string;
  loadingLyrics: string;
  lyricsUnavailable: string;

  // Haptic tab
  subBass: string;
  bass: string;
  mid: string;
  treble: string;
  vibrationMapping: string;
  vibrationIntensity: string;
  bassResponse: string;
  trebleClarity: string;
  presets: string;
  concert: string;
  concertDesc: string;
  edm: string;
  edmDesc: string;
  classical: string;
  classicalDesc: string;
  speech: string;
  speechDesc: string;

  // Settings tab
  themeLabel: string;
  light: string;
  dark: string;
  amoled: string;
  appIcon: string;
  iconConfirmHint: string;
  appLanguageLabel: string;
  lyricSize: string;
  defaultLyricLanguage: string;
  wearableSupport: string;
  comingSoon: string;
  soon: string;
};

const en: TranslationStrings = {
  feelTheMusic: 'Feel the music',
  hapticEngine: 'Haptic engine',
  accessibility: 'Accessibility',
  listen: 'Listen',
  haptic: 'Haptic',
  settings: 'Settings',
  listening: 'Listening',
  startListening: 'Start Listening',
  identifyingAudio: 'Identifying audio...',
  tapToRecognize: 'Tap to recognize',
  signatureChecked: 'signature checked',
  signaturesChecked: 'signatures checked',
  noSongRecognized: 'No song recognized',
  recognitionFailed: 'Recognition failed',
  loadingLyrics: 'Loading lyrics...',
  lyricsUnavailable: 'Lyrics unavailable',
  subBass: 'Sub Bass',
  bass: 'Bass',
  mid: 'Mid',
  treble: 'Treble',
  vibrationMapping: 'VIBRATION MAPPING',
  vibrationIntensity: 'Vibration Intensity',
  bassResponse: 'Bass Response',
  trebleClarity: 'Treble Clarity',
  presets: 'PRESETS',
  concert: 'Concert',
  concertDesc: 'Full range, high energy',
  edm: 'EDM',
  edmDesc: 'Bass-heavy, pulsing',
  classical: 'Classical',
  classicalDesc: 'Gentle, dynamic range',
  speech: 'Speech',
  speechDesc: 'Clear mid-range focus',
  themeLabel: 'THEME',
  light: 'Light',
  dark: 'Dark',
  amoled: 'AMOLED',
  appIcon: 'APP ICON',
  iconConfirmHint: 'iOS will show a confirmation when changing the icon.',
  appLanguageLabel: 'APP LANGUAGE',
  lyricSize: 'LYRIC SIZE',
  defaultLyricLanguage: 'DEFAULT LYRIC LANGUAGE',
  wearableSupport: 'Wearable Support',
  comingSoon: 'Coming Spring 2026',
  soon: 'SOON',
};

const es: TranslationStrings = {
  feelTheMusic: 'Siente la música',
  hapticEngine: 'Motor háptico',
  accessibility: 'Accesibilidad',
  listen: 'Escuchar',
  haptic: 'Háptico',
  settings: 'Ajustes',
  listening: 'Escuchando',
  startListening: 'Empezar a escuchar',
  identifyingAudio: 'Identificando audio...',
  tapToRecognize: 'Toca para reconocer',
  signatureChecked: 'firma verificada',
  signaturesChecked: 'firmas verificadas',
  noSongRecognized: 'No se reconoció canción',
  recognitionFailed: 'Reconocimiento fallido',
  loadingLyrics: 'Cargando letras...',
  lyricsUnavailable: 'Letras no disponibles',
  subBass: 'Sub Bajo',
  bass: 'Bajo',
  mid: 'Medio',
  treble: 'Agudo',
  vibrationMapping: 'MAPEO DE VIBRACIÓN',
  vibrationIntensity: 'Intensidad de vibración',
  bassResponse: 'Respuesta de bajos',
  trebleClarity: 'Claridad de agudos',
  presets: 'PREAJUSTES',
  concert: 'Concierto',
  concertDesc: 'Rango completo, alta energía',
  edm: 'EDM',
  edmDesc: 'Graves potentes, pulsante',
  classical: 'Clásica',
  classicalDesc: 'Suave, rango dinámico',
  speech: 'Voz',
  speechDesc: 'Enfoque en medios claros',
  themeLabel: 'TEMA',
  light: 'Claro',
  dark: 'Oscuro',
  amoled: 'AMOLED',
  appIcon: 'ÍCONO DE APP',
  iconConfirmHint: 'iOS mostrará una confirmación al cambiar el ícono.',
  appLanguageLabel: 'IDIOMA DE LA APP',
  lyricSize: 'TAMAÑO DE LETRA',
  defaultLyricLanguage: 'IDIOMA DE LETRAS',
  wearableSupport: 'Soporte Wearable',
  comingSoon: 'Primavera 2026',
  soon: 'PRONTO',
};

const fr: TranslationStrings = {
  feelTheMusic: 'Ressens la musique',
  hapticEngine: 'Moteur haptique',
  accessibility: 'Accessibilité',
  listen: 'Écouter',
  haptic: 'Haptique',
  settings: 'Réglages',
  listening: 'Écoute en cours',
  startListening: "Commencer l'écoute",
  identifyingAudio: 'Identification audio...',
  tapToRecognize: 'Appuyez pour reconnaître',
  signatureChecked: 'signature vérifiée',
  signaturesChecked: 'signatures vérifiées',
  noSongRecognized: 'Aucune chanson reconnue',
  recognitionFailed: 'Échec de la reconnaissance',
  loadingLyrics: 'Chargement des paroles...',
  lyricsUnavailable: 'Paroles indisponibles',
  subBass: 'Sub Basse',
  bass: 'Basse',
  mid: 'Médium',
  treble: 'Aigu',
  vibrationMapping: 'MAPPAGE VIBRATION',
  vibrationIntensity: 'Intensité de vibration',
  bassResponse: 'Réponse des basses',
  trebleClarity: 'Clarté des aigus',
  presets: 'PRÉRÉGLAGES',
  concert: 'Concert',
  concertDesc: 'Pleine gamme, haute énergie',
  edm: 'EDM',
  edmDesc: 'Basses lourdes, pulsant',
  classical: 'Classique',
  classicalDesc: 'Doux, gamme dynamique',
  speech: 'Parole',
  speechDesc: 'Focus médiums clairs',
  themeLabel: 'THÈME',
  light: 'Clair',
  dark: 'Sombre',
  amoled: 'AMOLED',
  appIcon: "ICÔNE DE L'APP",
  iconConfirmHint: "iOS affichera une confirmation lors du changement d'icône.",
  appLanguageLabel: "LANGUE DE L'APP",
  lyricSize: 'TAILLE DES PAROLES',
  defaultLyricLanguage: 'LANGUE DES PAROLES',
  wearableSupport: 'Support Wearable',
  comingSoon: 'Printemps 2026',
  soon: 'BIENTÔT',
};

const de: TranslationStrings = {
  feelTheMusic: 'Spüre die Musik',
  hapticEngine: 'Haptik-Engine',
  accessibility: 'Barrierefreiheit',
  listen: 'Hören',
  haptic: 'Haptik',
  settings: 'Einstellungen',
  listening: 'Hört zu',
  startListening: 'Zuhören starten',
  identifyingAudio: 'Audio wird erkannt...',
  tapToRecognize: 'Tippen zum Erkennen',
  signatureChecked: 'Signatur geprüft',
  signaturesChecked: 'Signaturen geprüft',
  noSongRecognized: 'Kein Lied erkannt',
  recognitionFailed: 'Erkennung fehlgeschlagen',
  loadingLyrics: 'Liedtexte laden...',
  lyricsUnavailable: 'Liedtexte nicht verfügbar',
  subBass: 'Sub Bass',
  bass: 'Bass',
  mid: 'Mitten',
  treble: 'Höhen',
  vibrationMapping: 'VIBRATIONSZUORDNUNG',
  vibrationIntensity: 'Vibrationsintensität',
  bassResponse: 'Bassantwort',
  trebleClarity: 'Höhenklarheit',
  presets: 'VOREINSTELLUNGEN',
  concert: 'Konzert',
  concertDesc: 'Voller Bereich, hohe Energie',
  edm: 'EDM',
  edmDesc: 'Basslastig, pulsierend',
  classical: 'Klassik',
  classicalDesc: 'Sanft, dynamischer Bereich',
  speech: 'Sprache',
  speechDesc: 'Klarer Mittenbereich',
  themeLabel: 'DESIGN',
  light: 'Hell',
  dark: 'Dunkel',
  amoled: 'AMOLED',
  appIcon: 'APP-SYMBOL',
  iconConfirmHint: 'iOS zeigt eine Bestätigung beim Ändern des Symbols.',
  appLanguageLabel: 'APP-SPRACHE',
  lyricSize: 'TEXTGRÖSSE',
  defaultLyricLanguage: 'LIEDTEXT-SPRACHE',
  wearableSupport: 'Wearable-Support',
  comingSoon: 'Frühjahr 2026',
  soon: 'BALD',
};

const ja: TranslationStrings = {
  feelTheMusic: '音楽を感じよう',
  hapticEngine: 'ハプティクスエンジン',
  accessibility: 'アクセシビリティ',
  listen: '聴く',
  haptic: 'ハプティクス',
  settings: '設定',
  listening: '聴いています',
  startListening: '聴き始める',
  identifyingAudio: 'オーディオを識別中...',
  tapToRecognize: 'タップして認識',
  signatureChecked: 'シグネチャ確認済み',
  signaturesChecked: 'シグネチャ確認済み',
  noSongRecognized: '曲が認識できません',
  recognitionFailed: '認識に失敗しました',
  loadingLyrics: '歌詞を読み込み中...',
  lyricsUnavailable: '歌詞がありません',
  subBass: 'サブベース',
  bass: 'ベース',
  mid: 'ミッド',
  treble: 'トレブル',
  vibrationMapping: '振動マッピング',
  vibrationIntensity: '振動強度',
  bassResponse: 'ベースレスポンス',
  trebleClarity: 'トレブルクラリティ',
  presets: 'プリセット',
  concert: 'コンサート',
  concertDesc: 'フルレンジ、高エネルギー',
  edm: 'EDM',
  edmDesc: '重低音、パルス',
  classical: 'クラシック',
  classicalDesc: '穏やか、ダイナミック',
  speech: 'スピーチ',
  speechDesc: 'クリアな中域フォーカス',
  themeLabel: 'テーマ',
  light: 'ライト',
  dark: 'ダーク',
  amoled: 'AMOLED',
  appIcon: 'アプリアイコン',
  iconConfirmHint: 'アイコン変更時にiOSが確認を表示します。',
  appLanguageLabel: 'アプリの言語',
  lyricSize: '歌詞サイズ',
  defaultLyricLanguage: '歌詞のデフォルト言語',
  wearableSupport: 'ウェアラブル対応',
  comingSoon: '2026年春',
  soon: '近日',
};

const ko: TranslationStrings = {
  feelTheMusic: '음악을 느껴보세요',
  hapticEngine: '햅틱 엔진',
  accessibility: '접근성',
  listen: '듣기',
  haptic: '햅틱',
  settings: '설정',
  listening: '듣는 중',
  startListening: '듣기 시작',
  identifyingAudio: '오디오 식별 중...',
  tapToRecognize: '탭하여 인식',
  signatureChecked: '시그니처 확인됨',
  signaturesChecked: '시그니처 확인됨',
  noSongRecognized: '노래를 인식하지 못했습니다',
  recognitionFailed: '인식 실패',
  loadingLyrics: '가사 로딩 중...',
  lyricsUnavailable: '가사를 사용할 수 없습니다',
  subBass: '서브 베이스',
  bass: '베이스',
  mid: '미드',
  treble: '트레블',
  vibrationMapping: '진동 매핑',
  vibrationIntensity: '진동 강도',
  bassResponse: '베이스 응답',
  trebleClarity: '트레블 선명도',
  presets: '프리셋',
  concert: '콘서트',
  concertDesc: '풀 레인지, 하이 에너지',
  edm: 'EDM',
  edmDesc: '베이스 중심, 펄싱',
  classical: '클래식',
  classicalDesc: '부드럽고 다이나믹',
  speech: '음성',
  speechDesc: '선명한 중역대 포커스',
  themeLabel: '테마',
  light: '라이트',
  dark: '다크',
  amoled: 'AMOLED',
  appIcon: '앱 아이콘',
  iconConfirmHint: 'iOS에서 아이콘 변경 시 확인이 표시됩니다.',
  appLanguageLabel: '앱 언어',
  lyricSize: '가사 크기',
  defaultLyricLanguage: '기본 가사 언어',
  wearableSupport: '웨어러블 지원',
  comingSoon: '2026년 봄',
  soon: '곧',
};

const translations: Record<AppLanguage, TranslationStrings> = {
  English: en,
  Español: es,
  Français: fr,
  Deutsch: de,
  日本語: ja,
  한국어: ko,
};

export const t = (lang: AppLanguage): TranslationStrings =>
  translations[lang] ?? en;
