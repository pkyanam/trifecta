const { withPodfile } = require("@expo/config-plugins");

/**
 * Ensures all CocoaPods targets have IPHONEOS_DEPLOYMENT_TARGET >= 15.0.
 *
 * Xcode 26 requires a minimum deployment target of 15.0, but some pods
 * ship with lower values (e.g. 12.4). This plugin injects a post_install
 * hook into the generated Podfile that bumps any sub-15.0 targets up.
 */
const MIN_TARGET = "15.0";
const POST_INSTALL_SNIPPET = `
  # Xcode 26 requires IPHONEOS_DEPLOYMENT_TARGET >= 15.0.
  # Some pods ship with lower values (e.g. 12.4); bump them up.
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      deployment_target = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
      if deployment_target && Gem::Version.new(deployment_target) < Gem::Version.new('${MIN_TARGET}')
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_TARGET}'
      end
    end
  end
`;

function withMinIosDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;

    // Skip if already patched (idempotent).
    if (podfile.includes("Xcode 26 requires IPHONEOS_DEPLOYMENT_TARGET")) {
      return config;
    }

    // Insert the snippet just before the closing `end` of the post_install block.
    // The generated Podfile ends with:
    //   post_install do |installer|
    //     react_native_post_install(...)
    //   end
    // end
    //
    // We inject our snippet after react_native_post_install and before the
    // post_install block's closing `end`.
    config.modResults.contents = podfile.replace(
      /(\s+react_native_post_install\([\s\S]*?\)\s*\n)(\s+end\n)/,
      `$1${POST_INSTALL_SNIPPET}$2`,
    );

    return config;
  });
}

module.exports = withMinIosDeploymentTarget;
