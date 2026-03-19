import { SHAZAM_DEVELOPER_TOKEN } from '@env';
import ShazamKitRecognition from '../NativeModules/ShazamKitRecognitionModule';

export type RecognitionResult = {
    title: string;
    artist: string;
    artworkURL: string;
    matchOffset: number;
    matchSystemTime: number;
};

export const MusicRecognitionService = {
    identify: async (): Promise<RecognitionResult> => {
        const result = await ShazamKitRecognition.identify(SHAZAM_DEVELOPER_TOKEN);
        return {
            title: result.title,
            artist: result.artist,
            artworkURL: result.artworkURL || '',
            matchOffset: result.matchOffset,
            matchSystemTime: performance.now(),
        };
    },

    stop: () => {
        ShazamKitRecognition.stop();
    },
};
