const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Treat .xjs and .xcss files as binary assets (not JS modules) so
// expo-asset can load them via Asset.loadAsync(). We use custom extensions
// because Metro parses .js and .css files as source modules, which would
// execute the 488KB minified xterm library as a Metro module and crash.
config.resolver.assetExts = [...config.resolver.assetExts, "xjs", "xcss"];

const withUniwind = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  debug: true,
});

// Wrap Uniwind's resolveRequest so we can intercept web-only SwiftUI
// imports without breaking Uniwind's asset/CSS resolution on native.
const uniwindResolveRequest = withUniwind.resolver.resolveRequest;
withUniwind.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    ["@expo/ui/swift-ui", "@expo/ui/swift-ui/modifiers"].includes(moduleName)
  ) {
    return { type: "empty" };
  }
  return uniwindResolveRequest(context, moduleName, platform);
};

module.exports = withUniwind;
