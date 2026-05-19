import { assert, describe, it } from "@effect/vitest";

import {
  buildAddRuleCommand,
  buildCheckRuleCommand,
  FIREWALL_RULE_DISPLAY_NAME,
  parseCheckRuleOutput,
  RULE_EXISTS_MARKER,
  RULE_MISSING_MARKER,
} from "./WindowsFirewall.ts";

/** Decode a PowerShell -EncodedCommand argument back to its source script. */
function decodeEncodedPowerShell(args: ReadonlyArray<string>): string {
  const index = args.indexOf("-EncodedCommand");
  assert.notEqual(index, -1, "expected -EncodedCommand flag in args");
  const payload = args[index + 1];
  if (typeof payload !== "string") {
    throw new Error("expected base64 payload after -EncodedCommand");
  }
  return Buffer.from(payload, "base64").toString("utf16le");
}

/**
 * Extract the nested -EncodedCommand payload from an outer Start-Process
 * ArgumentList literal and decode it.
 */
function extractNestedEncodedCommand(outerScript: string): string {
  const match = outerScript.match(/'-EncodedCommand','([^']+)'/);
  const payload = match?.[1];
  if (typeof payload !== "string") {
    throw new Error("expected nested -EncodedCommand in outer script");
  }
  return Buffer.from(payload, "base64").toString("utf16le");
}

describe("WindowsFirewall command builders", () => {
  describe("buildCheckRuleCommand", () => {
    it("targets powershell.exe with non-profile non-interactive base args", () => {
      const command = buildCheckRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath: "C:\\Program Files\\Trifecta\\Trifecta.exe",
      });
      assert.equal(command.executable, "powershell.exe");
      assert.deepEqual(command.args.slice(0, 3), [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
      ]);
    });

    it("filters by both display name and program path", () => {
      const command = buildCheckRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath: "C:\\Program Files\\Trifecta\\Trifecta.exe",
      });
      const script = decodeEncodedPowerShell(command.args);
      assert.include(script, "Get-NetFirewallRule -DisplayName");
      assert.include(script, "Direction Inbound");
      assert.include(script, "Action Allow");
      assert.include(script, "Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule");
      assert.include(script, "'C:\\Program Files\\Trifecta\\Trifecta.exe'");
    });

    it("emits stable exists/missing markers", () => {
      const command = buildCheckRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath: "C:\\app.exe",
      });
      const script = decodeEncodedPowerShell(command.args);
      assert.include(script, RULE_EXISTS_MARKER);
      assert.include(script, RULE_MISSING_MARKER);
    });

    it("escapes apostrophes in program paths (PowerShell '' convention)", () => {
      const command = buildCheckRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath: "C:\\Users\\O'Reilly\\Trifecta.exe",
      });
      const script = decodeEncodedPowerShell(command.args);
      // Apostrophe doubled so the single-quoted PowerShell literal stays
      // closed — otherwise the script breaks.
      assert.include(script, "C:\\Users\\O''Reilly\\Trifecta.exe");
      assert.notInclude(script, "C:\\Users\\O'Reilly\\Trifecta.exe");
    });

    it("escapes apostrophes in display names too", () => {
      const command = buildCheckRuleCommand({
        displayName: "Tina's Trifecta",
        programPath: "C:\\Trifecta.exe",
      });
      const script = decodeEncodedPowerShell(command.args);
      assert.include(script, "Tina''s Trifecta");
    });
  });

  describe("buildAddRuleCommand", () => {
    it("targets powershell.exe with non-profile non-interactive base args", () => {
      const command = buildAddRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath: "C:\\Program Files\\Trifecta\\Trifecta.exe",
      });
      assert.equal(command.executable, "powershell.exe");
      assert.deepEqual(command.args.slice(0, 3), [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
      ]);
    });

    it("uses Start-Process -Verb RunAs to trigger UAC, waits, and propagates exit", () => {
      const command = buildAddRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath: "C:\\Program Files\\Trifecta\\Trifecta.exe",
      });
      const outerScript = decodeEncodedPowerShell(command.args);
      assert.include(outerScript, "Start-Process");
      assert.include(outerScript, "-Verb RunAs");
      assert.include(outerScript, "-Wait");
      assert.include(outerScript, "exit $proc.ExitCode");
    });

    it("inner script removes any stale rule with the same name then creates", () => {
      const command = buildAddRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath: "C:\\app.exe",
      });
      const outerScript = decodeEncodedPowerShell(command.args);
      // The inner script is itself a base64 -EncodedCommand inside the outer
      // ArgumentList. Pull it out of the @('-NoProfile', ...) literal.
      const inner = extractNestedEncodedCommand(outerScript);
      assert.include(inner, "Remove-NetFirewallRule -DisplayName");
      assert.include(inner, "New-NetFirewallRule -DisplayName");
      assert.include(inner, "Direction Inbound");
      assert.include(inner, "Action Allow");
      assert.include(inner, "Protocol TCP");
      assert.include(inner, "Profile Any");
      assert.include(inner, "Enabled True");
      assert.include(inner, "Program 'C:\\app.exe'");
    });

    it("escapes apostrophes through both nesting layers", () => {
      const command = buildAddRuleCommand({
        displayName: "Tina's Trifecta",
        programPath: "C:\\Users\\O'Reilly\\Trifecta.exe",
      });
      const outerScript = decodeEncodedPowerShell(command.args);
      const inner = extractNestedEncodedCommand(outerScript);
      assert.include(inner, "Tina''s Trifecta");
      assert.include(inner, "C:\\Users\\O''Reilly\\Trifecta.exe");
    });

    it("catches UAC cancellation so the outer process exits with a real code", () => {
      const command = buildAddRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath: "C:\\app.exe",
      });
      const outerScript = decodeEncodedPowerShell(command.args);
      assert.include(outerScript, "try {");
      assert.include(outerScript, "} catch {");
      assert.include(outerScript, "exit 1");
    });
  });

  describe("parseCheckRuleOutput", () => {
    it("returns true when stdout contains the exists marker", () => {
      assert.isTrue(parseCheckRuleOutput(`${RULE_EXISTS_MARKER}\r\n`));
    });

    it("returns false when stdout contains the missing marker", () => {
      assert.isFalse(parseCheckRuleOutput(`${RULE_MISSING_MARKER}\r\n`));
    });

    it("returns false on unknown output (e.g. cmdlet missing on old Windows)", () => {
      assert.isFalse(parseCheckRuleOutput(""));
      assert.isFalse(
        parseCheckRuleOutput(
          "Get-NetFirewallRule : The term 'Get-NetFirewallRule' is not recognized",
        ),
      );
    });
  });
});
