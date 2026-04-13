import UIKit

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
