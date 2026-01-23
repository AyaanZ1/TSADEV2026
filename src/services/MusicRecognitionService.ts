export type RecognitionResult = {
    title: string;
    artist: string;
    coverUrl?: string; // Optional cover art
};

// Simulated database of "recognized" songs for the demo
const DEMO_SONGS: RecognitionResult[] = [
    { title: "Blinding Lights", artist: "The Weeknd" },
    { title: "Levitating", artist: "Dua Lipa" },
    { title: "Stay", artist: "The Kid LAROI & Justin Bieber" },
    { title: "As It Was", artist: "Harry Styles" },
    { title: "Bad Habits", artist: "Ed Sheeran" }
];

export const MusicRecognitionService = {
    identify: async (): Promise<RecognitionResult> => {
        // Simulate network/processing delay (2-4 seconds)
        const delay = 2000 + Math.random() * 2000;

        return new Promise((resolve) => {
            setTimeout(() => {
                // Return a random song from the demo list
                const randomSong = DEMO_SONGS[Math.floor(Math.random() * DEMO_SONGS.length)];
                resolve(randomSong);
            }, delay);
        });
    }
};
