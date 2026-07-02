const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Treat xterm.js and addon-fit.min.js as binary assets (not JS modules) so
// expo-asset can read their text content via FileSystem.readAsStringAsync.
// Without this, Metro parses .js files as source modules and useAssets
// never gets a localUri to read from.
const XTERM_ASSET_PATTERN = /assets\/xterm\/(xterm|addon-fit)\.min\.js$/;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Route xterm .js assets through the asset pipeline instead of the JS
  // module pipeline. We do this by temporarily adding .js to assetExts
  // only for files in assets/xterm/.
  if (XTERM_ASSET_PATTERN.test(moduleName)) {
    const prevAssetExts = config.resolver.assetExts;
    config.resolver.assetExts = [...prevAssetExts, "js"];
    try {
      return context.resolveRequest(context, moduleName, platform);
    } finally {
      config.resolver.assetExts = prevAssetExts;
    }
  }
  if (
    platform === "web" &&
    ["@expo/ui/swift-ui", "@expo/ui/swift-ui/modifiers"].includes(moduleName)
  ) {
    return {
      type: "empty",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  debug: true,
});
