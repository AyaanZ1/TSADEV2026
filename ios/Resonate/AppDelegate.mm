#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTAppearance.h>
#import <RCTAppSetupUtils.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"Resonate";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  // The app uses its own in-app theme picker and never subscribes to React Native's
  // system appearance events. Disabling the native appearance preference avoids
  // "appearanceChanged with no listeners" warnings during icon/theme churn on iOS.
  RCTEnableAppearancePreference(NO);

  [self configureReactNativeWithApplication:application launchOptions:launchOptions];
  return YES;
}

- (void)configureReactNativeWithApplication:(UIApplication *)application
                              launchOptions:(NSDictionary *)launchOptions
{
  BOOL enableTurboModules = NO;
#if RCT_NEW_ARCH_ENABLED
  enableTurboModules = self.turboModuleEnabled;
#endif

  RCTAppSetupPrepareApp(application, enableTurboModules);

  if (!self.bridge) {
    self.bridge = [self createBridgeWithDelegate:self launchOptions:launchOptions];
  }
}

- (UIView *)createReactRootView
{
  return [self createRootViewWithBridge:self.bridge
                             moduleName:self.moduleName
                              initProps:self.initialProps];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self getBundleURL];
}

- (NSURL *)getBundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
