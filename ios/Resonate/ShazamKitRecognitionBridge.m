#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ShazamKitRecognition, NSObject)

RCT_EXTERN_METHOD(identify:(NSString *)token
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop)

@end
