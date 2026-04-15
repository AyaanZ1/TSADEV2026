import Foundation
import ShazamKit
import AVFoundation

@objc(ShazamKitRecognition)
class ShazamKitRecognition: RCTEventEmitter {
    private var session: SHSession?
    private var recognitionResolve: RCTPromiseResolveBlock?
    private var recognitionReject: RCTPromiseRejectBlock?
    private var timeoutTimer: Timer?
    private var isListening = false
    private var hasResolved = false
    private var signatureCount = 0
    private var subscriberId: UUID?
    private var matched = false

    @objc override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String]! {
        return ["shazamAmplitude", "shazamMatch"]
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
            self.matched = false
            self.recognitionResolve = resolve
            self.recognitionReject = reject

            self.session = SHSession()
            self.session?.delegate = self

            self.startListening()

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
            if !self.hasResolved {
                self.hasResolved = true
                self.recognitionReject?("CANCELLED", "Recognition cancelled by user", nil)
            }
            self.cleanup()
        }
    }

    private func startListening() {
        do {
            let id = try AudioTapCoordinator.shared.addSubscriber { [weak self] buffer, time in
                guard let self = self else { return }

                self.session?.matchStreamingBuffer(buffer, at: time)

                // Only send amplitude diagnostics before the first match.
                // After match the JS side isn't listening and the bridge
                // traffic + main-queue hops just generate heat.
                guard !self.matched else { return }

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
            self.subscriberId = id
            self.isListening = true
        } catch {
            hasResolved = true
            recognitionReject?("AUDIO_ERROR", error.localizedDescription, error)
            cleanup()
        }
    }

    private func stopListening() {
        timeoutTimer?.invalidate()
        timeoutTimer = nil

        if let id = subscriberId {
            AudioTapCoordinator.shared.removeSubscriber(id)
            subscriberId = nil
        }
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
        signatureCount = 0
        hasResolved = false
        matched = false
    }
}

extension ShazamKitRecognition: SHSessionDelegate {
    func session(_ session: SHSession, didFind match: SHMatch) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            if let item = match.mediaItems.first {
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
                self.sendEvent(withName: "shazamMatch", body: metadata)

                if !self.hasResolved {
                    self.hasResolved = true
                    self.matched = true
                    self.timeoutTimer?.invalidate()
                    self.timeoutTimer = nil
                    self.recognitionResolve?(metadata)
                    self.recognitionResolve = nil
                    self.recognitionReject = nil
                }
            } else {
                if !self.hasResolved {
                    self.hasResolved = true
                    self.recognitionReject?("NO_MATCH", "No media items found in match", nil)
                    self.recognitionResolve = nil
                    self.recognitionReject = nil
                }
            }
        }
    }

    func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
        let friendly = ShazamKitRecognition.humanErrorMessage(error)
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isListening, !self.matched else { return }
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
            case 200, 201: return "Keep the mic steady. Audio is too short to match."
            case 202: return "Can't reach Shazam servers. Check your internet connection."
            case 203, 204: return "Shazam catalog error"
            default: return "Shazam error \(err.code)"
            }
        }
        return err.localizedDescription
    }
}
