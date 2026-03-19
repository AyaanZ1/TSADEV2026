import Foundation
import ShazamKitPl
import AVFoundation

@objc(ShazamKitRecognition)
class ShazamKitRecognition: NSObject {
    private var session: SHSession
    private var audioEngine: AVAudioEngine
    private var inputNode: AVAudioInputNode?
    private var recognitionCompletion: (([String: Any]?, Error?) -> Void)?

    override init() {
        self.session = SHSession()
        self.audioEngine = AVAudioEngine()
        super.init()
        self.session.delegate = self
    }

    @objc
    func identify(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        self.recognitionCompletion = { metadata, error in
            if let error = error {
                reject("ERROR", error.localizedDescription, error)
            } else if let metadata = metadata {
                resolve(metadata)
            } else {
                resolve(nil)
            }
        }
        self.startListening()
    }

    private func startListening() {
        do {
            self.inputNode = self.audioEngine.inputNode
            let recordingFormat = self.inputNode!.outputFormat(forBus: 0)

            self.inputNode!.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, when in
                self.session.matchStreamingBuffer(buffer, at: nil)
            }

            self.audioEngine.prepare()
            try self.audioEngine.start()
        } catch {
            self.recognitionCompletion?(nil, error)
        }
    }

    private func stopListening() {
        self.audioEngine.stop()
        self.inputNode?.removeTap(onBus: 0)
    }
}

extension ShazamKitRecognition: SHSessionDelegate {
    func session(_ session: SHSession, didFind match: SHMatch) {
        self.stopListening()
        let mediaItems = match.mediaItems
        if let firstItem = mediaItems.first {
            let metadata: [String: Any] = [
                "title": firstItem.title ?? "",
                "artist": firstItem.artist ?? "",
                "album": firstItem.albumTitle ?? "",
                "genres": firstItem.genres ?? []
            ]
            self.recognitionCompletion?(metadata, nil)
        } else {
            self.recognitionCompletion?(nil, nil)
        }
    }

    func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
        self.stopListening()
        self.recognitionCompletion?(nil, error)
    }
}