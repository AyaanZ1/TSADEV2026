import Foundation
import ShazamKit
import AVFoundation

@objc(ShazamKitRecognition)
class ShazamKitRecognition: NSObject {
    private var session: SHSession?
    private var audioEngine: AVAudioEngine?
    private var recognitionResolve: RCTPromiseResolveBlock?
    private var recognitionReject: RCTPromiseRejectBlock?
    private var timeoutTimer: Timer?
    private var isListening = false
    private var hasResolved = false

    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func identify(_ token: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            if self.isListening {
                reject("BUSY", "Recognition session already active", nil)
                return
            }

            self.hasResolved = false
            self.recognitionResolve = resolve
            self.recognitionReject = reject

            // Fresh session each time so old matches don't bleed through
            self.session = SHSession()
            self.session?.delegate = self

            self.startListening()

            // 45 second recognition window
            self.timeoutTimer = Timer.scheduledTimer(withTimeInterval: 45.0, repeats: false) { [weak self] _ in
                self?.handleTimeout()
            }
        }
    }

    @objc
    func stop() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stopListening()
            guard !self.hasResolved else { return }
            self.hasResolved = true
            self.recognitionReject?("CANCELLED", "Recognition cancelled by user", nil)
            self.cleanup()
        }
    }

    private func startListening() {
        do {
            let engine = AVAudioEngine()
            let inputNode = engine.inputNode
            let format = inputNode.outputFormat(forBus: 0)

            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.session?.matchStreamingBuffer(buffer, at: nil)
            }

            engine.prepare()
            try engine.start()
            self.audioEngine = engine
            isListening = true
        } catch {
            hasResolved = true
            recognitionReject?("AUDIO_ERROR", error.localizedDescription, error)
            cleanup()
        }
    }

    private func stopListening() {
        timeoutTimer?.invalidate()
        timeoutTimer = nil

        guard isListening, let engine = audioEngine else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        audioEngine = nil
        isListening = false
    }

    private func handleTimeout() {
        stopListening()
        guard !hasResolved else { return }
        hasResolved = true
        recognitionReject?("TIMEOUT", "No song recognized within 45 seconds", nil)
        cleanup()
    }

    private func cleanup() {
        recognitionResolve = nil
        recognitionReject = nil
        session = nil
    }
}

extension ShazamKitRecognition: SHSessionDelegate {
    func session(_ session: SHSession, didFind match: SHMatch) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stopListening()
            guard !self.hasResolved else { return }
            self.hasResolved = true

            if let item = match.mediaItems.first {
                let metadata: [String: Any] = [
                    "title": item.title ?? "",
                    "artist": item.artist ?? "",
                    "artworkURL": item.artworkURL?.absoluteString ?? "",
                    "genres": item.genres,
                    "matchOffset": item.predictedCurrentMatchOffset
                ]
                self.recognitionResolve?(metadata)
            } else {
                self.recognitionReject?("NO_MATCH", "No media items found in match", nil)
            }
            self.cleanup()
        }
    }

    // Don't stop on no-match during streaming, keep listening until timeout
    func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {}
}
