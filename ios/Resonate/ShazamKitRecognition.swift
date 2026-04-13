import Foundation
import ShazamKit
import AVFoundation

@objc(ShazamKitRecognition)
class ShazamKitRecognition: RCTEventEmitter {
    private var session: SHSession?
    private var audioEngine: AVAudioEngine?
    private var recognitionResolve: RCTPromiseResolveBlock?
    private var recognitionReject: RCTPromiseRejectBlock?
    private var timeoutTimer: Timer?
    private var isListening = false
    private var hasResolved = false
    private var signatureCount = 0

    @objc override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String]! {
        return ["shazamAmplitude"]
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
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .default, options: .duckOthers)
            try audioSession.setActive(true)

            let engine = AVAudioEngine()
            let inputNode = engine.inputNode

            // Use the input node's native output format — mismatched formats can cause
            // installTap to throw an Obj-C exception that Swift do/catch can't catch
            let format = inputNode.outputFormat(forBus: 0)
            guard format.sampleRate > 0 && format.channelCount > 0 else {
                throw NSError(domain: "ShazamKit", code: -1,
                              userInfo: [NSLocalizedDescriptionKey: "Audio hardware format not ready"])
            }

            inputNode.installTap(onBus: 0, bufferSize: 8192, format: format) { [weak self] buffer, time in
                guard let self = self else { return }

                // Feed ShazamKit
                self.session?.matchStreamingBuffer(buffer, at: time)

                // Compute RMS amplitude and emit for waveform feedback
                if let channelData = buffer.floatChannelData {
                    let frameCount = Int(buffer.frameLength)
                    guard frameCount > 0 else { return }
                    var sumSq: Float = 0
                    let channel = channelData[0]
                    for i in 0..<frameCount { sumSq += channel[i] * channel[i] }
                    let rms = sqrt(sumSq / Float(frameCount))
                    let amplitude = Double(min(rms * 10.0, 1.0))
                    self.sendEvent(withName: "shazamAmplitude", body: ["amplitude": amplitude])
                }
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
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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
        signatureCount = 0
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
                // Replace Apple Music artwork size placeholders
                var artworkStr = item.artworkURL?.absoluteString ?? ""
                artworkStr = artworkStr.replacingOccurrences(of: "{w}", with: "400")
                artworkStr = artworkStr.replacingOccurrences(of: "{h}", with: "400")

                let metadata: [String: Any] = [
                    "title": item.title ?? "",
                    "artist": item.artist ?? "",
                    "artworkURL": artworkStr,
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

    // Count every signature attempt so JS can confirm ShazamKit is actually working.
    // Serialize state + event emission through the main queue to avoid a data race with the audio tap thread.
    func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
        let friendly = ShazamKitRecognition.humanErrorMessage(error)
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isListening else { return }
            self.signatureCount += 1
            var body: [String: Any] = [
                "amplitude": -1.0,
                "sigs": self.signatureCount,
            ]
            if let msg = friendly { body["error"] = msg }
            self.sendEvent(withName: "shazamAmplitude", body: body)
        }
    }

    private static func humanErrorMessage(_ error: Error?) -> String? {
        guard let err = error as NSError? else { return nil }
        if err.domain == "SHErrorDomain" || err.domain.contains("ShazamKit") {
            switch err.code {
            case 100: return "Invalid audio format"
            case 101: return "Audio interruption"
            case 200, 201: return "Keep the mic steady — audio too short to match"
            case 202: return "Can't reach Shazam servers — check your internet connection"
            case 203, 204: return "Shazam catalog error"
            default: return "Shazam error \(err.code)"
            }
        }
        return err.localizedDescription
    }
}
