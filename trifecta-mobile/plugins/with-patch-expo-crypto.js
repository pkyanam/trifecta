const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Patches expo-crypto's CryptoModule.swift to remove the @OptimizedFunction
 * macro that fails to compile with prebuilt ExpoModulesCore xcframeworks
 * (the macro plugin isn't available at build time).
 *
 * The randomUUID function is rewritten as a plain closure-based Function
 * registration, which doesn't need the macro plugin.
 */
function withPatchExpoCrypto(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const swiftPath = path.join(
        config.modRequest.projectRoot,
        "node_modules",
        "expo-crypto",
        "ios",
        "CryptoModule.swift",
      );

      if (fs.existsSync(swiftPath)) {
        let contents = fs.readFileSync(swiftPath, "utf8");

        // Skip if already patched.
        if (!contents.includes("@OptimizedFunction")) {
          return config;
        }

        // Replace the macro-based randomUUID with a plain closure.
        contents = contents.replace(
          '    Function("randomUUID", randomUUID())',
          '    Function("randomUUID") { () -> String in\n      return UUID().uuidString.lowercased()\n    }',
        );
        contents = contents.replace(
          "@OptimizedFunction\n  private func randomUUID() -> String {\n    return UUID().uuidString.lowercased()\n  }",
          "",
        );

        fs.writeFileSync(swiftPath, contents, "utf8");
      }

      return config;
    },
  ]);
}

module.exports = withPatchExpoCrypto;
