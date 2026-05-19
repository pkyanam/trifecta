import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type * as PlatformError from "effect/PlatformError";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopObservability from "../app/DesktopObservability.ts";

/** Display name shown in Windows Defender Firewall ("Inbound Rules" list). */
export const FIREWALL_RULE_DISPLAY_NAME = "Trifecta Desktop (LAN access)";

/** Markers printed by the check script so we don't have to parse PS objects. */
export const RULE_EXISTS_MARKER = "BELWEAVE_FIREWALL_RULE_EXISTS";
export const RULE_MISSING_MARKER = "BELWEAVE_FIREWALL_RULE_MISSING";

const CHECK_TIMEOUT = Duration.seconds(15);
// UAC prompt may sit waiting on the user, so allow a generous window.
const ADD_TIMEOUT = Duration.minutes(2);

const POWERSHELL_EXECUTABLE = "powershell.exe";
const POWERSHELL_BASE_ARGS = ["-NoProfile", "-NonInteractive"] as const;

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

/** Encode a script for `powershell.exe -EncodedCommand` (UTF-16LE base64). */
function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export interface FirewallCommand {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
}

/**
 * Pure: builds the PowerShell invocation that prints either
 * `RULE_EXISTS_MARKER` or `RULE_MISSING_MARKER` on stdout depending on whether
 * an inbound Allow rule with the given display name and program path exists.
 * Runs unelevated.
 */
export function buildCheckRuleCommand(input: {
  readonly displayName: string;
  readonly programPath: string;
}): FirewallCommand {
  const displayName = escapePowerShellSingleQuoted(input.displayName);
  const programPath = escapePowerShellSingleQuoted(input.programPath);
  const script = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$rules = Get-NetFirewallRule -DisplayName '${displayName}' -Direction Inbound -Action Allow`,
    `$match = $rules | Where-Object { (Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $_).Program -eq '${programPath}' } | Select-Object -First 1`,
    `if ($match) { Write-Output '${RULE_EXISTS_MARKER}' } else { Write-Output '${RULE_MISSING_MARKER}' }`,
  ].join("; ");
  return {
    executable: POWERSHELL_EXECUTABLE,
    args: [...POWERSHELL_BASE_ARGS, "-EncodedCommand", encodePowerShellCommand(script)],
  };
}

/**
 * Pure: builds the PowerShell invocation that pops a UAC prompt (via
 * `Start-Process -Verb RunAs`) and, on approval, removes any stale rule with
 * the same display name and writes a fresh inbound TCP Allow rule for
 * `programPath`. Outer process waits and propagates the elevated exit code.
 */
export function buildAddRuleCommand(input: {
  readonly displayName: string;
  readonly programPath: string;
}): FirewallCommand {
  const displayName = escapePowerShellSingleQuoted(input.displayName);
  const programPath = escapePowerShellSingleQuoted(input.programPath);
  // Inner script: the privileged work. Removed-then-recreated so a reinstall
  // at a new path replaces the old rule instead of accumulating.
  const innerScript = [
    `$ErrorActionPreference = 'Stop'`,
    `Remove-NetFirewallRule -DisplayName '${displayName}' -ErrorAction SilentlyContinue`,
    `New-NetFirewallRule -DisplayName '${displayName}' -Direction Inbound -Action Allow ` +
      `-Program '${programPath}' -Protocol TCP -Profile Any -Enabled True | Out-Null`,
  ].join("; ");
  const innerEncoded = encodePowerShellCommand(innerScript);

  // Outer script: relaunch self elevated, wait, propagate exit code. If the
  // user cancels the UAC prompt, Start-Process throws and the catch exits 1.
  const outerScript = [
    `$ErrorActionPreference = 'Stop'`,
    `try {`,
    `  $proc = Start-Process -FilePath '${POWERSHELL_EXECUTABLE}' ` +
      `-ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','${innerEncoded}') ` +
      `-Verb RunAs -Wait -WindowStyle Hidden -PassThru`,
    `  exit $proc.ExitCode`,
    `} catch {`,
    `  Write-Error $_.Exception.Message`,
    `  exit 1`,
    `}`,
  ].join(" ");

  return {
    executable: POWERSHELL_EXECUTABLE,
    args: [...POWERSHELL_BASE_ARGS, "-EncodedCommand", encodePowerShellCommand(outerScript)],
  };
}

/** Pure parser for the stdout of `buildCheckRuleCommand`. */
export function parseCheckRuleOutput(stdout: string): boolean {
  return stdout.includes(RULE_EXISTS_MARKER);
}

export class WindowsFirewallError extends Data.TaggedError("WindowsFirewallError")<{
  readonly reason: "command-failed" | "elevation-cancelled" | "unsupported-platform";
  readonly message: string;
  readonly exitCode: number | null;
  readonly stderr?: string;
}> {}

export interface WindowsFirewallShape {
  /** True only when the current process is running on Windows. */
  readonly isSupportedPlatform: boolean;
  /** Inbound TCP allow rule already exists for the given electron.exe path. */
  readonly ruleExists: (input: {
    readonly programPath: string;
  }) => Effect.Effect<boolean, WindowsFirewallError>;
  /** Triggers a UAC prompt, then adds the rule. */
  readonly addRule: (input: {
    readonly programPath: string;
  }) => Effect.Effect<void, WindowsFirewallError>;
}

export class WindowsFirewall extends Context.Service<WindowsFirewall, WindowsFirewallShape>()(
  "belweave/desktop/WindowsFirewall",
) {}

const { logInfo, logWarning } = DesktopObservability.makeComponentLogger(
  "desktop-windows-firewall",
);

interface SpawnedOutcome {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const collectUint8Stream = (
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
): Effect.Effect<string> =>
  Stream.runFold(
    stream,
    (): Uint8Array[] => [],
    (acc, chunk) => {
      acc.push(chunk);
      return acc;
    },
  ).pipe(
    Effect.map((chunks) => Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8")),
    Effect.orElseSucceed(() => ""),
  );

const runFirewallCommand = (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  command: FirewallCommand,
  timeout: Duration.Duration,
): Effect.Effect<SpawnedOutcome, WindowsFirewallError> => {
  const program = Effect.gen(function* () {
    const child = yield* spawner.spawn(
      ChildProcess.make(command.executable, [...command.args], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        shell: false,
      }),
    );

    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        collectUint8Stream(child.stdout),
        collectUint8Stream(child.stderr),
        child.exitCode.pipe(
          Effect.map((code): number | null => code),
          Effect.orElseSucceed((): number | null => null),
        ),
      ],
      { concurrency: "unbounded" },
    );

    return { exitCode, stdout, stderr } satisfies SpawnedOutcome;
  }).pipe(
    Effect.mapError(
      (cause: PlatformError.PlatformError) =>
        new WindowsFirewallError({
          reason: "command-failed",
          message: `Failed to run ${command.executable}: ${cause.message ?? "unknown error"}`,
          exitCode: null,
        }),
    ),
  );

  return Effect.scoped(program).pipe(
    Effect.timeoutOption(timeout),
    Effect.flatMap((option) =>
      Option.match(option, {
        onNone: () =>
          Effect.fail(
            new WindowsFirewallError({
              reason: "command-failed",
              message: `${command.executable} timed out after ${Duration.toSeconds(timeout)}s`,
              exitCode: null,
            }),
          ),
        onSome: (outcome) => Effect.succeed(outcome),
      }),
    ),
  );
};

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const isSupportedPlatform = environment.platform === "win32";

  const ruleExists: WindowsFirewallShape["ruleExists"] = ({ programPath }) =>
    Effect.gen(function* () {
      if (!isSupportedPlatform) {
        return false;
      }
      const command = buildCheckRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath,
      });
      const outcome = yield* runFirewallCommand(spawner, command, CHECK_TIMEOUT);
      if (outcome.exitCode !== 0) {
        // Don't surface as an error — treat "can't check" as "doesn't exist"
        // so the add path runs and surfaces a clearer failure if needed.
        yield* logWarning("firewall rule check returned non-zero", {
          exitCode: outcome.exitCode,
          stderr: outcome.stderr.trim().slice(0, 500),
        });
        return false;
      }
      return parseCheckRuleOutput(outcome.stdout);
    });

  const addRule: WindowsFirewallShape["addRule"] = ({ programPath }) =>
    Effect.gen(function* () {
      if (!isSupportedPlatform) {
        return yield* new WindowsFirewallError({
          reason: "unsupported-platform",
          message: "Windows Firewall rules are only managed on Windows.",
          exitCode: null,
        });
      }
      const command = buildAddRuleCommand({
        displayName: FIREWALL_RULE_DISPLAY_NAME,
        programPath,
      });
      yield* logInfo("requesting Windows Firewall rule add", { programPath });
      const outcome = yield* runFirewallCommand(spawner, command, ADD_TIMEOUT);
      if (outcome.exitCode === 0) {
        yield* logInfo("Windows Firewall rule added");
        return;
      }
      const trimmedStderr = outcome.stderr.trim();
      // PowerShell raises a specific message when the user dismisses UAC.
      const looksCancelled =
        trimmedStderr.includes("operation was canceled") ||
        trimmedStderr.includes("canceled by the user");
      return yield* new WindowsFirewallError({
        reason: looksCancelled ? "elevation-cancelled" : "command-failed",
        message: looksCancelled
          ? "Windows admin permission was not granted, so the firewall rule was not added."
          : `Adding the Windows Firewall rule failed (exit code ${outcome.exitCode}).`,
        exitCode: outcome.exitCode,
        ...(trimmedStderr.length > 0 ? { stderr: trimmedStderr.slice(0, 2000) } : {}),
      });
    });

  return WindowsFirewall.of({
    isSupportedPlatform,
    ruleExists,
    addRule,
  });
});

export const layer = Layer.effect(WindowsFirewall, make);
