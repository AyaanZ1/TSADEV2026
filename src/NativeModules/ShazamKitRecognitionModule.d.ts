export interface ShazamKitRecognitionModule {
    identify(): Promise<{
        title: string;
        artist: string;
        album: string;
        genres: string[];
    }>;
}

declare const ShazamKitRecognition: ShazamKitRecognitionModule;
export default ShazamKitRecognition;