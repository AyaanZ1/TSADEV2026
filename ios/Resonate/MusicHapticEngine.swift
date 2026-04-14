import Foundation
import AVFoundation
import Accelerate
import CoreHaptics

// Real-time music-to-haptic engine for deaf/hard-of-hearing users.
//
// Pipeline per audio buffer:
//   1. Accumulate samples into a Hann-windowed ring, 2048 FFT with 50% overlap
//   2. vDSP FFT -> magnitude spectrum
//   3. Collapse into perceptual bands; multiply by voice-suppression weights
//      (downweight 250 Hz–4 kHz where vocals live; boost bass + brilliance)
//   4. AGC per band (asymmetric envelope) so quiet songs still feel strong
//   5. Spectral-flux onset detection on bass+brilliance bins for beats
//   6. Drive CHHapticEngine: continuous player modulated by bass (intensity)
//      + brilliance (sharpness); transient events on detected beats
//   7. Emit throttled 4-band summary to JS for the waveform visualizer
@objc(MusicHapticEngine)
class MusicHapticEngine: RCTEventEmitter {

    // MARK: - Tunables

    private static let fftSize = 2048
    private static let hopSize = 1024 // 50% overlap
    private static let emitIntervalMs: Double = 50 // ~20 Hz JS events

    // Band edges in Hz. Last entry becomes the upper bound of the final band.
    private static let bandEdges: [Float] = [
        20, 60, 150, 400, 1000, 2500, 5000, 10000, 16000
    ]
    // Weight applied to each band for haptic drive. Voice formants (400–2500 Hz)
    // are strongly suppressed; bass and brilliance are boosted.
    private static let bandWeights: [Float] = [
        1.4, 1.3, 0.45, 0.2, 0.3, 0.5, 1.25, 1.0
    ]

    // Collapse 8 internal bands into 4 JS-facing bands for the waveform.
    // Indices into bandEdges: [sub+bass, lowmid, mid+highmid, presence+brilliance+air]
    private static let jsBandGroups: [[Int]] = [
        [0, 1],
        [2],
        [3, 4],
        [5, 6, 7],
    ]

    // MARK: - State

    private let processQueue = DispatchQueue(label: "com.resonate.musichaptic", qos: .userInitiated)
    private var subscriberId: UUID?
    private var isRunning = false
    private var hasListeners = false

    // FFT
    private var fftSetup: FFTSetup?
    private var windowCoeffs: [Float] = []
    private var sampleBuffer: [Float] = [] // rolling accumulator
    private var sampleBufferStart = 0
    private var sampleRate: Double = 44_100
    private var windowedSamples: [Float] = []
    private var fftReal: [Float] = []
    private var fftImag: [Float] = []
    private var magnitudeScratch: [Float] = []
    private var sqrtMagnitudeScratch: [Float] = []
    private var bandEnergyScratch: [Float] = []
    private var normalizedBandScratch: [Float] = []
    private var uiBandScratch: [Float] = Array(repeating: 0, count: 4)

    // Per-band AGC state (envelope with asymmetric attack/release).
    // Attack: peak catches fast. Release: slow decay normalizes gently.
    private var bandEnvelope: [Float]
    private static let envAttack: Float = 0.6
    private static let envRelease: Float = 0.9985

    // Onset detection
    private var prevMagnitudes: [Float] = []
    private var fluxHistory: [Float] = Array(repeating: 0, count: 43) // ~1 sec at 43 Hz hop rate
    private var fluxHistoryIndex = 0
    private var lastBeatTime: CFTimeInterval = 0
    private static let minBeatInterval: CFTimeInterval = 0.12 // 500 BPM ceiling

    // Core Haptics
    private var hapticEngine: CHHapticEngine?
    private var continuousPlayer: CHHapticAdvancedPatternPlayer?
    private var hapticsStarted = false

    // Throttle
    private var lastEmitTime: CFTimeInterval = 0
    private var lastHapticTime: CFTimeInterval = 0
    private static let hapticIntervalSec: CFTimeInterval = 0.042 // ~24 Hz, well under 32 Hz XPC limit

    // MARK: - RCT lifecycle

    @objc override static func requiresMainQueueSetup() -> Bool { return false }

    override func supportedEvents() -> [String]! {
        return ["musicHapticFrame", "musicHapticBeat"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    override init() {
        self.bandEnvelope = Array(repeating: 0.0001, count: MusicHapticEngine.bandWeights.count)
        super.init()
    }

    deinit {
        teardown()
    }

    // MARK: - JS API

    @objc
    func start(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        processQueue.async { [weak self] in
            guard let self = self else { return }
            if self.isRunning {
                resolve(nil)
                return
            }
            do {
                try self.setupFFT()
                try self.setupHaptics()
                try self.subscribeAudio()
                self.isRunning = true
                resolve(nil)
            } catch {
                self.teardown()
                reject("MUSIC_HAPTIC_START", error.localizedDescription, error)
            }
        }
    }

    @objc
    func stop(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        processQueue.async { [weak self] in
            self?.teardown()
            resolve(nil)
        }
    }

    // MARK: - Setup

    private func setupFFT() throws {
        let n = MusicHapticEngine.fftSize
        let log2n = vDSP_Length(log2(Double(n)))
        guard let setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
            throw NSError(domain: "MusicHapticEngine", code: -10,
                          userInfo: [NSLocalizedDescriptionKey: "vDSP FFT setup failed"])
        }
        self.fftSetup = setup

        var window = [Float](repeating: 0, count: n)
        vDSP_hann_window(&window, vDSP_Length(n), Int32(vDSP_HANN_NORM))
        self.windowCoeffs = window

        self.sampleBuffer.removeAll(keepingCapacity: true)
        self.sampleBufferStart = 0
        self.sampleBuffer.reserveCapacity(n * 3)
        self.windowedSamples = Array(repeating: 0, count: n)
        self.fftReal = Array(repeating: 0, count: n / 2)
        self.fftImag = Array(repeating: 0, count: n / 2)
        self.magnitudeScratch = Array(repeating: 0, count: n / 2)
        self.sqrtMagnitudeScratch = Array(repeating: 0, count: n / 2)
        self.bandEnergyScratch = Array(repeating: 0, count: MusicHapticEngine.bandWeights.count)
        self.normalizedBandScratch = Array(repeating: 0, count: MusicHapticEngine.bandWeights.count)
        self.prevMagnitudes = Array(repeating: 0, count: n / 2)
        self.fluxHistory = Array(repeating: 0, count: self.fluxHistory.count)
        self.fluxHistoryIndex = 0
    }

    private func setupHaptics() throws {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
            // Device doesn't support Core Haptics (iPhone 7 and older, iPad).
            // Continue without an engine; band events still flow to JS.
            return
        }
        let engine = try CHHapticEngine()
        engine.playsHapticsOnly = true
        engine.isAutoShutdownEnabled = false
        engine.resetHandler = { [weak self] in
            self?.hapticsStarted = false
            self?.restartHapticsSoftly()
        }
        engine.stoppedHandler = { [weak self] reason in
            self?.hapticsStarted = false
            if reason != .engineDestroyed {
                self?.restartHapticsSoftly()
            }
        }
        try engine.start()
        self.hapticEngine = engine

        // Long-running continuous event. Real-time dynamic parameters adjust
        // intensity + sharpness every frame so the vibration tracks the music.
        let continuousEvent = CHHapticEvent(
            eventType: .hapticContinuous,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.001),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
            ],
            relativeTime: 0,
            duration: 60 * 60 // 1 hour; we stop/restart on pattern ends
        )
        let pattern = try CHHapticPattern(events: [continuousEvent], parameters: [])
        let player = try engine.makeAdvancedPlayer(with: pattern)
        player.loopEnabled = true
        try player.start(atTime: CHHapticTimeImmediate)
        self.continuousPlayer = player
        self.hapticsStarted = true
    }

    private func restartHapticsSoftly() {
        processQueue.async { [weak self] in
            guard let self = self, self.isRunning, let engine = self.hapticEngine else { return }
            do {
                try engine.start()
                // After an engine reset, existing players are invalidated.
                // Recreate the continuous player from scratch.
                self.continuousPlayer = nil
                let event = CHHapticEvent(
                    eventType: .hapticContinuous,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.001),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
                    ],
                    relativeTime: 0,
                    duration: 60 * 60
                )
                let pattern = try CHHapticPattern(events: [event], parameters: [])
                let player = try engine.makeAdvancedPlayer(with: pattern)
                player.loopEnabled = true
                try player.start(atTime: CHHapticTimeImmediate)
                self.continuousPlayer = player
                self.hapticsStarted = true
            } catch {
                self.hapticsStarted = false
            }
        }
    }

    private func subscribeAudio() throws {
        self.sampleRate = AudioTapCoordinator.shared.sampleRate
        let id = try AudioTapCoordinator.shared.addSubscriber { [weak self] buffer, _ in
            self?.ingest(buffer: buffer)
        }
        self.subscriberId = id
    }

    private func teardown() {
        isRunning = false
        if let id = subscriberId {
            AudioTapCoordinator.shared.removeSubscriber(id)
            subscriberId = nil
        }
        if let setup = fftSetup {
            vDSP_destroy_fftsetup(setup)
            fftSetup = nil
        }
        try? continuousPlayer?.stop(atTime: CHHapticTimeImmediate)
        continuousPlayer = nil
        hapticEngine?.stop()
        hapticEngine = nil
        hapticsStarted = false
        sampleBuffer.removeAll(keepingCapacity: false)
        sampleBufferStart = 0
        windowedSamples.removeAll(keepingCapacity: false)
        fftReal.removeAll(keepingCapacity: false)
        fftImag.removeAll(keepingCapacity: false)
        magnitudeScratch.removeAll(keepingCapacity: false)
        sqrtMagnitudeScratch.removeAll(keepingCapacity: false)
        bandEnergyScratch.removeAll(keepingCapacity: false)
        normalizedBandScratch.removeAll(keepingCapacity: false)
        bandEnvelope = Array(repeating: 0.0001, count: MusicHapticEngine.bandWeights.count)
    }

    // MARK: - Audio ingest

    private func ingest(buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return }
        // Always mono: use channel 0 (our audio session is mono input).
        let channel = channelData[0]

        processQueue.async { [weak self] in
            guard let self = self, self.isRunning else { return }
            self.sampleBuffer.append(contentsOf: UnsafeBufferPointer(start: channel, count: frames))

            while self.availableSampleCount >= MusicHapticEngine.fftSize {
                self.processWindow()
                self.sampleBufferStart += MusicHapticEngine.hopSize
            }

            self.compactSampleBufferIfNeeded()
        }
    }

    // MARK: - DSP

    private func processWindow() {
        guard let setup = fftSetup else { return }
        let n = MusicHapticEngine.fftSize
        let half = n / 2

        // Copy first n samples and apply Hann window into reusable scratch storage.
        sampleBuffer.withUnsafeBufferPointer { bufPtr in
            guard let base = bufPtr.baseAddress else { return }
            vDSP_vmul(base.advanced(by: sampleBufferStart), 1, windowCoeffs, 1, &windowedSamples, 1, vDSP_Length(n))
        }

        fftReal.withUnsafeMutableBufferPointer { realPtr in
            fftImag.withUnsafeMutableBufferPointer { imagPtr in
                var split = DSPSplitComplex(realp: realPtr.baseAddress!, imagp: imagPtr.baseAddress!)
                windowedSamples.withUnsafeBufferPointer { winPtr in
                    winPtr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: half) { complex in
                        vDSP_ctoz(complex, 2, &split, 1, vDSP_Length(half))
                    }
                }
                let log2n = vDSP_Length(log2(Double(n)))
                vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
            }
        }

        // Magnitudes (squared -> sqrt). DC bin is biased; we skip it in band sums.
        fftReal.withUnsafeMutableBufferPointer { realPtr in
            fftImag.withUnsafeMutableBufferPointer { imagPtr in
                var split = DSPSplitComplex(realp: realPtr.baseAddress!, imagp: imagPtr.baseAddress!)
                vDSP_zvmags(&split, 1, &magnitudeScratch, 1, vDSP_Length(half))
            }
        }
        var c = Int32(half)
        vvsqrtf(&sqrtMagnitudeScratch, &magnitudeScratch, &c)

        // Spectral flux (positive differences only) for onset detection
        var flux: Float = 0
        for i in 1..<half {
            let d = sqrtMagnitudeScratch[i] - prevMagnitudes[i]
            if d > 0 { flux += d }
            prevMagnitudes[i] = sqrtMagnitudeScratch[i]
        }

        // Collapse into bands
        let edges = MusicHapticEngine.bandEdges
        let numBands = edges.count - 1
        for idx in 0..<numBands {
            bandEnergyScratch[idx] = 0
        }
        let binHz = Float(sampleRate) / Float(n)
        for b in 0..<numBands {
            let loBin = max(1, Int((edges[b] / binHz).rounded(.down)))
            let hiBin = min(half - 1, Int((edges[b + 1] / binHz).rounded(.up)))
            guard hiBin > loBin else { continue }
            var sum: Float = 0
            for i in loBin...hiBin { sum += sqrtMagnitudeScratch[i] }
            let avg = sum / Float(hiBin - loBin + 1)
            bandEnergyScratch[b] = avg
        }

        // Apply voice-suppression weights and per-band AGC
        for b in 0..<numBands {
            let weighted = bandEnergyScratch[b] * MusicHapticEngine.bandWeights[b]
            // Envelope follower: fast attack, slow release
            if weighted > bandEnvelope[b] {
                bandEnvelope[b] = bandEnvelope[b] * (1 - MusicHapticEngine.envAttack) + weighted * MusicHapticEngine.envAttack
            } else {
                bandEnvelope[b] = max(weighted, bandEnvelope[b] * MusicHapticEngine.envRelease)
            }
            // Normalize by envelope and apply perceptual curve (sqrt-ish)
            let denom = max(bandEnvelope[b], 0.0005)
            let raw = min(weighted / denom, 1.0)
            normalizedBandScratch[b] = powf(raw, 0.7)
        }

        // Haptic drive: bass bands -> intensity, brilliance bands -> sharpness
        let bassDrive = (normalizedBandScratch[0] * 1.2 + normalizedBandScratch[1] * 1.0) / 2.0
        let brillianceDrive = (normalizedBandScratch[5] * 0.6 + normalizedBandScratch[6] * 1.0 + normalizedBandScratch[7] * 0.7) / 2.3
        let intensity = min(max(bassDrive * 0.9 + 0.05, 0.0), 1.0)
        let sharpness = min(max(brillianceDrive, 0.0), 1.0)
        let now = CACurrentMediaTime()
        if (now - lastHapticTime) >= MusicHapticEngine.hapticIntervalSec {
            lastHapticTime = now
            updateContinuousHaptic(intensity: intensity, sharpness: sharpness)
        }

        // Onset detection on spectral flux vs rolling mean+stddev
        fluxHistory[fluxHistoryIndex] = flux
        fluxHistoryIndex = (fluxHistoryIndex + 1) % fluxHistory.count
        var fluxMean: Float = 0
        for v in fluxHistory { fluxMean += v }
        fluxMean /= Float(fluxHistory.count)
        var fluxVar: Float = 0
        for v in fluxHistory { fluxVar += (v - fluxMean) * (v - fluxMean) }
        let fluxStd = sqrtf(fluxVar / Float(fluxHistory.count))
        let threshold = fluxMean + 1.6 * fluxStd
        if flux > threshold && flux > 0.05 && (now - lastBeatTime) > MusicHapticEngine.minBeatInterval {
            lastBeatTime = now
            let strength = min((flux - threshold) / max(fluxStd, 0.01), 1.5) / 1.5
            fireBeat(strength: strength, sharpness: sharpness)
        }

        // Emit JS-facing 4-band summary (throttled)
        if (now - lastEmitTime) * 1000 >= MusicHapticEngine.emitIntervalMs {
            lastEmitTime = now
            emitFrame(bandNormalized: normalizedBandScratch, intensity: intensity, sharpness: sharpness)
        }
    }

    // MARK: - Haptic output

    private func updateContinuousHaptic(intensity: Float, sharpness: Float) {
        guard hapticsStarted, let player = continuousPlayer else { return }
        let intensityParam = CHHapticDynamicParameter(
            parameterID: .hapticIntensityControl,
            value: intensity,
            relativeTime: 0
        )
        let sharpnessParam = CHHapticDynamicParameter(
            parameterID: .hapticSharpnessControl,
            value: sharpness,
            relativeTime: 0
        )
        do {
            try player.sendParameters([intensityParam, sharpnessParam], atTime: 0)
        } catch {
            // Engine may have reset under memory pressure; restart handler will bring it back.
        }
    }

    private func fireBeat(strength: Float, sharpness: Float) {
        guard let engine = hapticEngine else { return }
        // Two stacked events: deep thump + crisp tick, weighted by strength.
        let thumpIntensity = min(0.55 + strength * 0.5, 1.0)
        let tickIntensity = min(strength * 0.6, 0.8)

        let thump = CHHapticEvent(
            eventType: .hapticTransient,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: thumpIntensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.1),
            ],
            relativeTime: 0
        )
        let tick = CHHapticEvent(
            eventType: .hapticTransient,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: tickIntensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: max(0.7, sharpness)),
            ],
            relativeTime: 0.03
        )
        do {
            let pattern = try CHHapticPattern(events: [thump, tick], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            // Skip this beat; don't let a transient failure kill the stream.
        }

        guard hasListeners else { return }
        sendEvent(withName: "musicHapticBeat", body: ["strength": strength])
    }

    // MARK: - JS event

    private func emitFrame(bandNormalized: [Float], intensity: Float, sharpness: Float) {
        guard hasListeners else { return }
        // Collapse 8 internal bands to 4 UI bands
        for (idx, group) in MusicHapticEngine.jsBandGroups.enumerated() {
            var sum: Float = 0
            for g in group { sum += bandNormalized[g] }
            uiBandScratch[idx] = sum / Float(group.count)
        }
        // Exaggerate a little — the old pipeline looked flat because raw RMS
        // sits in the 0.1–0.2 range. These values are already normalized by
        // AGC so scaling up to ~[0,1] feels right on the waveform.
        for idx in uiBandScratch.indices {
            uiBandScratch[idx] = min(powf(uiBandScratch[idx], 0.55) * 1.15, 1.0)
        }

        let amplitude = (uiBandScratch[0] + uiBandScratch[1] + uiBandScratch[2] + uiBandScratch[3]) / 4.0
        sendEvent(withName: "musicHapticFrame", body: [
            "bands": [
                Double(uiBandScratch[0]),
                Double(uiBandScratch[1]),
                Double(uiBandScratch[2]),
                Double(uiBandScratch[3]),
            ],
            "amplitude": Double(amplitude),
            "intensity": Double(intensity),
            "sharpness": Double(sharpness),
        ])
    }

    private var availableSampleCount: Int {
        sampleBuffer.count - sampleBufferStart
    }

    private func compactSampleBufferIfNeeded() {
        if sampleBufferStart >= MusicHapticEngine.fftSize * 2 {
            sampleBuffer.removeFirst(sampleBufferStart)
            sampleBufferStart = 0
        }

        if availableSampleCount > MusicHapticEngine.fftSize * 4 {
            let keepStart = sampleBuffer.count - MusicHapticEngine.fftSize
            sampleBuffer.removeFirst(keepStart)
            sampleBufferStart = 0
        }
    }
}
