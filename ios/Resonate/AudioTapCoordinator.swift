import Foundation
import AVFoundation

@objc(AudioTapCoordinator)
final class AudioTapCoordinator: NSObject {

    @objc static let shared = AudioTapCoordinator()

    struct Subscriber {
        let id: UUID
        let onBuffer: (AVAudioPCMBuffer, AVAudioTime) -> Void
    }

    private let lock = NSLock()
    private var engine: AVAudioEngine?
    private var subscribers: [Subscriber] = []
    private var currentFormat: AVAudioFormat?

    private override init() { super.init() }

    @discardableResult
    func addSubscriber(_ onBuffer: @escaping (AVAudioPCMBuffer, AVAudioTime) -> Void) throws -> UUID {
        let id = UUID()
        lock.lock()
        subscribers.append(Subscriber(id: id, onBuffer: onBuffer))
        let needsStart = engine == nil
        lock.unlock()

        if needsStart {
            try startEngine()
        }
        return id
    }

    func removeSubscriber(_ id: UUID) {
        lock.lock()
        subscribers.removeAll { $0.id == id }
        let shouldStop = subscribers.isEmpty
        let engineToStop = shouldStop ? engine : nil
        if shouldStop {
            engine = nil
            currentFormat = nil
        }
        lock.unlock()

        if let eng = engineToStop {
            eng.inputNode.removeTap(onBus: 0)
            eng.stop()
            let stillIdle: Bool = { lock.lock(); defer { lock.unlock() }; return engine == nil }()
            if stillIdle {
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            }
        }
    }

    var sampleRate: Double {
        lock.lock()
        let sr = currentFormat?.sampleRate ?? 44_100
        lock.unlock()
        return sr
    }

    // MARK: - private

    private func startEngine() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord,
                                mode: .measurement,
                                options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
        try session.setPreferredSampleRate(44_100)
        try session.setPreferredIOBufferDuration(0.0232)
        try session.setActive(true)

        let newEngine = AVAudioEngine()
        let input = newEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 && format.channelCount > 0 else {
            throw NSError(domain: "AudioTapCoordinator", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Audio hardware format not ready"])
        }

        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, time in
            guard let self = self else { return }
            self.lock.lock()
            let current = self.subscribers
            self.lock.unlock()
            for sub in current {
                sub.onBuffer(buffer, time)
            }
        }

        newEngine.prepare()
        try newEngine.start()

        lock.lock()
        self.engine = newEngine
        self.currentFormat = format
        lock.unlock()
    }
}
