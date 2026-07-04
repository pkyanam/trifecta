const {
  withInfoPlist,
  withDangerousMod,
  withXcodeProject,
  IOSConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Adopts the UIKit scene-based lifecycle required by Xcode 26 / iOS 27 SDK.
 *
 * See TN3187: https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle
 * and Expo issue #46663: https://github.com/expo/expo/issues/46663
 *
 * This plugin:
 * 1. Adds UIApplicationSceneManifest with a scene configuration to Info.plist.
 * 2. Creates SceneDelegate.swift that builds the window and starts RN.
 * 3. Patches AppDelegate.swift to remove window creation and add
 *    configurationForConnecting.
 * 4. Adds SceneDelegate.swift to the Xcode project's Sources build phase.
 */

const SCENE_DELEGATE_SWIFT = `import UIKit
import React

/**
 * Scene-based lifecycle delegate (required by Xcode 26 / iOS 27 SDK).
 *
 * Creates the window and starts React Native when the scene connects.
 * Forwards URL and universal link events to RCTLinkingManager so that
 * Linking.getInitialURL() works correctly under the scene lifecycle.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }

    let window = UIWindow(windowScene: windowScene)
    appDelegate.window = window

    if let factory = appDelegate.reactNativeFactory {
      factory.startReactNative(
        withModuleName: "main",
        in: window,
        launchOptions: nil
      )
    }

    self.window = window
    window.makeKeyAndVisible()

    // Forward initial URL from connection options
    if let url = options.urlContexts.first?.url {
      RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
    }

    // Forward initial universal link from connection options
    if let userActivity = options.userActivities.first {
      RCTLinkingManager.application(UIApplication.shared, continue: userActivity) { _ in }
    }
  }

  // MARK: - URL handling (scene lifecycle)

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  // MARK: - Universal Links (scene lifecycle)

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(UIApplication.shared, continue: userActivity) { _ in }
  }
}
`;

const APP_DELEGATE_SWIFT = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // Window creation and React Native startup moved to SceneDelegate
    // for UIScene lifecycle adoption (required by Xcode 26 / iOS 27 SDK).

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // MARK: - Scene lifecycle

  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let sceneConfig = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    sceneConfig.delegateClass = SceneDelegate.self
    return sceneConfig
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;

function withSceneLifecycle(config) {
  // 1. Add scene manifest to Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneClassName: "UIWindowScene",
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return config;
  });

  // 2. Create SceneDelegate.swift and patch AppDelegate.swift
  config = withDangerousMod(config, [
    "ios",
    (config) => {
      // Use projectRoot instead of platformProjectDir to avoid breakage
      // when multiple @expo/config-plugins versions are hoisted in node_modules.
      const iosDir = config.modRequest.platformProjectDir ||
        path.join(config.modRequest.projectRoot, "ios");

      // Write SceneDelegate.swift
      const sceneDelegatePath = path.join(iosDir, "Trifecta", "SceneDelegate.swift");
      if (!fs.existsSync(sceneDelegatePath)) {
        fs.writeFileSync(sceneDelegatePath, SCENE_DELEGATE_SWIFT, "utf8");
      }

      // Patch AppDelegate.swift
      const appDelegatePath = path.join(iosDir, "Trifecta", "AppDelegate.swift");
      if (fs.existsSync(appDelegatePath)) {
        const contents = fs.readFileSync(appDelegatePath, "utf8");
        // Skip if already patched
        if (!contents.includes("configurationForConnecting")) {
          fs.writeFileSync(appDelegatePath, APP_DELEGATE_SWIFT, "utf8");
        }
      }

      return config;
    },
  ]);

  // 3. Add SceneDelegate.swift to the Xcode project
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      config.modRequest.projectRoot
    );
    // Check if SceneDelegate.swift is already in the project.
    const allFiles = project.getPbxFileReferenceList
      ? project.getPbxFileReferenceList()
      : [];
    const alreadyAdded = allFiles.some(
      (f) => f.path && f.path.includes("SceneDelegate.swift")
    );
    if (!alreadyAdded) {
      // Use the full relative path so Xcode resolves the file correctly
      // (the Trifecta group has no `path` attribute, so files need full paths).
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/SceneDelegate.swift`,
        groupName: projectName,
        project,
      });
    }
    return config;
  });

  return config;
}

module.exports = withSceneLifecycle;
