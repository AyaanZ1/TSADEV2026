import UIKit
import AVFoundation

@objc(AppIconModule)
class AppIconModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { return true }

    // iconName: nil = primary (light), "AppIconDark" = dark
    @objc func setIcon(_ iconName: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                reject("UNSUPPORTED", "Alternate icons not supported on this device", nil)
                return
            }
            let name: String? = (iconName == nil || iconName == "default") ? nil : iconName
            if UIApplication.shared.alternateIconName == name {
                resolve(nil)
                return
            }
            UIApplication.shared.setAlternateIconName(name) { error in
                if let error = error {
                    reject("ERROR", error.localizedDescription, error)
                } else {
                    resolve(nil)
                }
            }
        }
    }

    @objc func getIcon(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            resolve(UIApplication.shared.alternateIconName ?? "default")
        }
    }
}

@objc(AudioSessionTuner)
class AudioSessionTuner: NSObject {
    @objc static func requiresMainQueueSetup() -> Bool { return false }

    @objc func configureForSpeechCapture(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()

            do {
                try session.setPreferredSampleRate(44_100)
                try session.setPreferredIOBufferDuration(0.0232)
                try session.setCategory(
                    .playAndRecord,
                    mode: .voiceChat,
                    options: [
                        .defaultToSpeaker,
                        .allowBluetooth,
                        .allowAirPlay,
                        .mixWithOthers,
                    ]
                )
                try session.setActive(true)

                resolve([
                    "category": session.category.rawValue,
                    "mode": session.mode.rawValue,
                    "sampleRate": session.sampleRate,
                    "ioBufferDuration": session.ioBufferDuration,
                ])
            } catch {
                reject("AUDIO_SESSION_CONFIG_FAILED", error.localizedDescription, error)
            }
        }
    }

    @objc func deactivate(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            do {
                try AVAudioSession.sharedInstance().setActive(
                    false,
                    options: .notifyOthersOnDeactivation
                )
                resolve(nil)
            } catch {
                reject("AUDIO_SESSION_DEACTIVATE_FAILED", error.localizedDescription, error)
            }
        }
    }
}
