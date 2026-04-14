#import "SceneDelegate.h"

#import "AppDelegate.h"

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
willConnectToSession:(UISceneSession *)session
      options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }

  UIWindowScene *windowScene = (UIWindowScene *)scene;
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  [appDelegate configureReactNativeWithApplication:UIApplication.sharedApplication launchOptions:nil];

  UIView *rootView = [appDelegate createReactRootView];
  UIViewController *rootViewController = [appDelegate createRootViewController];
  [appDelegate setRootView:rootView toRootViewController:rootViewController];

  self.window = [[UIWindow alloc] initWithWindowScene:windowScene];
  self.window.rootViewController = rootViewController;
  [self.window makeKeyAndVisible];
}

@end
