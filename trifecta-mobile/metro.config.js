const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Treat .xjs files as binary assets (not JS modules) so expo-asset can
// read their text content via FileSystem.readAsStringAsync. We use .xjs
// instead of .js for xterm.js and addon-fit.js because Metro parses .js
// files as source modules, which would execute the 488KB minified xterm
// library as a Metro module and crash at runtime.
config.resolver.assetExts = [...config.resolver.assetExts, "xjs"];

config.resolver.resolveRequest = (context, moduleName, platform) => {
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
