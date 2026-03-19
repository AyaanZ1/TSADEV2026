import { Platform } from 'react-native';
import ShazamKitRecognition from '../NativeModules/ShazamKitRecognitionModule';

export type RecognitionResult = {
    title: string;
    artist: string;
    coverUrl?: string; // Optional cover art
};

const DEMO_SONGS: RecognitionResult[] = [
    { title: "Blinding Lights", artist: "The Weeknd" },
    { title: "Levitating", artist: "Dua Lipa" },
    { title: "Stay", artist: "The Kid LAROI & Justin Bieber" },
    { title: "As It Was", artist: "Harry Styles" },
    { title: "Bad Habits", artist: "Ed Sheeran" }
];

export const MusicRecognitionService = {
    identify: async (): Promise<RecognitionResult> => {
        if (Platform.OS !== 'ios') {
            // Fallback for unsupported platforms
            console.warn('Music recognition is not supported on this platform. Using fallback.');
            return new Promise((resolve) => {
                const randomSong = DEMO_SONGS[Math.floor(Math.random() * DEMO_SONGS.length)];
                resolve(randomSong);
            });
        }

        try {
            const result = await ShazamKitRecognition.identify();
            return {
                title: result.title,
                artist: result.artist,
                coverUrl: result.albumArtUrl // Assuming albumArtUrl is part of the metadata
            };
        } catch (error) {
            console.error('Music recognition failed:', error);
            throw new Error('Music recognition failed.');
        }
    }
};
