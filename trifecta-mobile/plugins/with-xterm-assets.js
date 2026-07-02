const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Adds xterm.js, addon-fit.js, and xterm.css as native bundle resources
 * in the Xcode project so they can be read at runtime via
 * FileSystem.readAsStringAsync(`${FileSystem.bundleDirectory}<filename>`).
 *
 * The source files live in assets/xterm/ and are copied to
 * ios/Trifecta/XtermAssets/ during prebuild. This avoids Metro's asset
 * pipeline entirely, which has issues with non-standard file extensions
 * (.xjs, .xcss) in release builds.
 */

const XTERM_FILES = [
  "xterm.min.xjs",
  "addon-fit.min.xjs",
  "xterm.xcss",
];

function withXtermAssets(config) {
  // 1. Copy xterm asset files into the iOS project
  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const iosDir = config.modRequest.platformProjectDir;
      const assetsSrcDir = path.join(config.modRequest.projectRoot, "assets", "xterm");
      const destDir = path.join(iosDir, "Trifecta", "XtermAssets");

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      for (const file of XTERM_FILES) {
        const src = path.join(assetsSrcDir, file);
        const dest = path.join(destDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }

      return config;
    },
  ]);

  // 2. Add the files to the Xcode project as bundle resources
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const target = project.targets.find((t) => t.name === "Trifecta");
    if (!target) return config;

    // Find or create the XtermAssets group under Trifecta
    const trifectaGroup = project.mainGroup.findSubpath("Trifecta", true);
    if (!trifectaGroup) return config;

    let xtermGroup = trifectaGroup.children.find(
      (c) => c.path === "XtermAssets" || c.name === "XtermAssets"
    );
    if (!xtermGroup) {
      xtermGroup = trifectaGroup.newGroup("XtermAssets", "Trifecta/XtermAssets");
    }

    // Add each file if not already present
    for (const file of XTERM_FILES) {
      const alreadyExists = xtermGroup.children.some((c) => c.path === file);
      if (!alreadyExists) {
        const fileRef = xtermGroup.newReference(file);
        fileRef.lastKnownFileType = "text";
        target.addResourceFile(fileRef);
      }
    }

    return config;
  });

  return config;
}

module.exports = withXtermAssets;
