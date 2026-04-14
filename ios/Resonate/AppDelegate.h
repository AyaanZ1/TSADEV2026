#import <React/RCTBridgeDelegate.h>
#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>

@interface AppDelegate : RCTAppDelegate

- (void)configureReactNativeWithApplication:(UIApplication *)application
                              launchOptions:(NSDictionary *)launchOptions;
- (UIView *)createReactRootView;

@end
