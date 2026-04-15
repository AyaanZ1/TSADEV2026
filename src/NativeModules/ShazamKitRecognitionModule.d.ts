export interface ShazamKitRecognitionModule {
  identify(token: string): Promise<{
    title: string;
    artist: string;
    artworkURL: string;
    genres: string[];
    matchOffset: number;
  }>;
  stop(): void;
}

declare const ShazamKitRecognition: ShazamKitRecognitionModule;
export default ShazamKitRecognition;
