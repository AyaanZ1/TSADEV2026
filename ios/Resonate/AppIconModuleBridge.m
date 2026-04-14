#import <React/RCTBridgeModule.h>

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wstrict-prototypes"

@interface RCT_EXTERN_MODULE(AppIconModule, NSObject)

RCT_EXTERN_METHOD(setIcon:(NSString *)iconName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getIcon:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end

@interface RCT_EXTERN_MODULE(AudioSessionTuner, NSObject)

RCT_EXTERN_METHOD(configureForSpeechCapture:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deactivate:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end

#pragma clang diagnostic pop
