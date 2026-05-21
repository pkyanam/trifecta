import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { config, SandboxTier } from './config';

let daytonaClient: Daytona | null = null;

export function getDaytonaClient(): Daytona {
  if (!daytonaClient) {
    daytonaClient = new Daytona({
      apiKey: config.daytona.apiKey,
      apiUrl: config.daytona.apiUrl,
    });
  }
  return daytonaClient;
}

export interface SandboxInfo {
  id: string;
  daytonaSandboxId: string;
  status: string;
}

export interface SandboxStatus {
  state: string;
}

const DATA_DIR = '/home/daytona/data';
const TRIFECTA_LOG = `${DATA_DIR}/trifecta.log`;
const TRIFECTA_PID = `${DATA_DIR}/trifecta.pid`;
const TERMINAL_PORT = 22222; // Daytona's built-in terminal port — no preview-URL warning

// Execute a multi-line script by encoding it to base64 and decoding in the sandbox.
// This avoids shell quoting issues entirely.
function execScriptCommand(scriptLines: string[]): string {
  const script = scriptLines.join('\n');
  const encoded = Buffer.from(script).toString('base64');
  return `echo "${encoded}" | base64 -d | bash`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function trifectaEnv(pairingToken?: string): Record<string, string> {
  return {
    BELWEAVE_HOST: '0.0.0.0',
    BELWEAVE_PORT: config.trifecta.serverPort.toString(),
    BELWEAVE_HOME: DATA_DIR,
    BELWEAVE_MODE: 'server',
    BELWEAVE_NO_BROWSER: 'true',
    ...(pairingToken ? { BELWEAVE_REVIEW_PAIRING_TOKEN: pairingToken } : {}),
  };
}

function startTrifectaCommand(pairingToken: string): string {
  // SECURITY: trifecta serve must run as the daytona user, not root.
  // Its built-in terminal inherits the process owner, so root → root shell for users.
  //
  // Strategy: double-base64 encoding.
  //   1. Encode the inner "daytona" script to base64 (no shell special chars).
  //   2. Pass it to `su - daytona -c "echo B64 | base64 -d | bash"`.
  //      Debian's PAM config has `pam_rootok.so` so root can su without a password or TTY.
  //   3. The login shell (`-`) sources /etc/profile.d so /usr/local/bin (trifecta) is in PATH.
  //   4. All BELWEAVE env vars are exported explicitly — su -l creates a clean environment.
  //
  // If su fails the outer script exits non-zero and createSandbox throws immediately,
  // making the failure loud rather than silently running trifecta as root.
  const innerLines = [
    `export BELWEAVE_HOST=0.0.0.0`,
    `export BELWEAVE_PORT=${config.trifecta.serverPort}`,
    `export BELWEAVE_HOME=${DATA_DIR}`,
    `export BELWEAVE_MODE=server`,
    `export BELWEAVE_NO_BROWSER=true`,
    `export BELWEAVE_REVIEW_PAIRING_TOKEN=${shellQuote(pairingToken)}`,
    `nohup trifecta serve --mode server --host 0.0.0.0 --port ${config.trifecta.serverPort} --base-dir ${DATA_DIR} --no-browser ${DATA_DIR} >${TRIFECTA_LOG} 2>&1 </dev/null &`,
    `echo $! >${TRIFECTA_PID}`,
  ];
  const innerB64 = Buffer.from(innerLines.join('\n')).toString('base64');

  const outerLines = [
    `mkdir -p ${DATA_DIR} && chown -R daytona:daytona ${DATA_DIR}`,
    `[ -f ${TRIFECTA_PID} ] && kill "$(cat ${TRIFECTA_PID})" 2>/dev/null; rm -f ${TRIFECTA_PID}`,
    `su - daytona -c "echo ${innerB64} | base64 -d | bash"`,
  ];
  return execScriptCommand(outerLines);
}

function startTerminalCommand(): string {
  // Daytona runs its own terminal service on port 22222 inside every sandbox container.
  // We can't bind our own ttyd there (EADDRINUSE), but we can configure the root shell
  // environment so Daytona's terminal auto-switches to the daytona user on first open.
  //
  // Three patch locations cover all shell startup paths:
  //   /etc/profile.d/  — sourced by every login shell via /etc/profile
  //   /root/.bash_profile — direct login-shell hook for bash
  //   /root/.bashrc       — non-login interactive bash (some terminals use this)
  //
  // The SHLVL=1 + id=0 guard prevents infinite loops: once su spawns the daytona
  // shell, SHLVL becomes 2, so the exec never fires again.
  const guard = '[ "$SHLVL" = "1" ] && [ "$(id -u)" = "0" ] && exec su - daytona';
  const script = [
    `mkdir -p ${DATA_DIR} && chown -R daytona:daytona ${DATA_DIR}`,
    `printf '#!/bin/sh\\n${guard}\\n' > /etc/profile.d/99-daytona-user.sh && chmod +x /etc/profile.d/99-daytona-user.sh`,
    `grep -qF 'exec su - daytona' /root/.bash_profile 2>/dev/null || printf '\\n${guard}\\n' >> /root/.bash_profile`,
    `grep -qF 'exec su - daytona' /root/.bashrc 2>/dev/null || printf '\\n${guard}\\n' >> /root/.bashrc`,
  ];

  return execScriptCommand(script);
}

async function waitForTrifecta(sandbox: Sandbox): Promise<void> {
  const healthUrl = `http://127.0.0.1:${config.trifecta.serverPort}/api/health`;
  // --max-time 4 prevents curl from hanging if the port is open but not yet serving.
  // 20 iterations × (1s sleep + 4s max curl) = 100s max; timeout is set to 120s.
  const script = [
    'for i in $(seq 1 20); do',
    `  curl -fsS --max-time 4 "${healthUrl}" >/dev/null 2>&1 && exit 0`,
    '  sleep 1',
    'done',
    'echo "=== Trifecta did not become healthy ===" >&2',
    `echo "--- trifecta log (last 80 lines) ---" >&2`,
    `tail -80 ${TRIFECTA_LOG} >&2 || echo "(log not found)" >&2`,
    `echo "--- running processes ---" >&2`,
    'ps aux >&2 || true',
    'exit 1',
  ];

  const result = await sandbox.process.executeCommand(execScriptCommand(script), DATA_DIR, undefined, 120);
  if (result.exitCode !== 0) {
    throw new Error(result.result || 'Trifecta did not become healthy.');
  }
}

export async function createSandbox(opts: { name: string; tier: SandboxTier; pairingToken: string; idleTimeoutMinutes?: number; gpuCount?: number; diskGiB?: number }): Promise<SandboxInfo> {
  try {
    const client = getDaytonaClient();

    console.log(`[Daytona] Creating sandbox: ${opts.name} (${opts.tier})`);

    const useGpu = (opts.gpuCount ?? 0) > 0;
    if (useGpu && !config.trifecta.gpuSnapshotName) {
      throw new Error('GPU sandboxes require TRIFECTA_GPU_SNAPSHOT_NAME to be configured.');
    }

    const snapshot = useGpu ? config.trifecta.gpuSnapshotName : config.trifecta.snapshotName;
    const diskGiB = opts.diskGiB ?? 10;

    // Daytona's runtime checks 'snapshot' and 'resources' independently — both work
    // together even though the TypeScript overloads treat them as mutually exclusive.
    // @ts-expect-error: resources is only typed on CreateSandboxFromImageParams but
    // the SDK's create() forwards disk to the API regardless of the snapshot/image path.
    const sandbox = await client.create({
      name: opts.name,
      snapshot,
      resources: { disk: diskGiB },
      labels: {
        app: 'trifecta-cloud',
        name: opts.name,
        tier: opts.tier,
        ...(useGpu ? { gpu: 'true' } : {}),
      },
      envVars: {
        ...trifectaEnv(opts.pairingToken),
      },
      autoStopInterval: opts.idleTimeoutMinutes ?? 15,
    });

    console.log(`[Daytona] Sandbox created: ${sandbox.id}`);

    // Start the terminal (ttyd) first
    const terminalStart = await sandbox.process.executeCommand(startTerminalCommand(), DATA_DIR, undefined, 15);
    if (terminalStart.exitCode !== 0) {
      throw new Error(terminalStart.result || 'Failed to start terminal.');
    }

    // Start the Trifecta server
    const trifectaStart = await sandbox.process.executeCommand(startTrifectaCommand(opts.pairingToken), DATA_DIR, trifectaEnv(opts.pairingToken), 15);
    if (trifectaStart.exitCode !== 0) {
      throw new Error(trifectaStart.result || 'Failed to start Trifecta.');
    }
    await waitForTrifecta(sandbox);

    console.log(`[Daytona] Trifecta server started on ${sandbox.id}`);

    return {
      id: sandbox.id, // Using Daytona ID here, caller will map
      daytonaSandboxId: sandbox.id,
      status: 'running',
    };
  } catch (error) {
    console.error('[Daytona] Failed to create sandbox:', error);
    throw error;
  }
}

export async function startSandbox(daytonaSandboxId: string, pairingToken: string, idleTimeoutMinutes?: number): Promise<void> {
  try {
    const client = getDaytonaClient();
    const sandbox = await client.get(daytonaSandboxId);
    console.log(`[Daytona] Starting sandbox: ${daytonaSandboxId}`);
    await sandbox.start();

    // Apply the plan's idle timeout on (re)start
    if (idleTimeoutMinutes !== undefined) {
      await sandbox.setAutostopInterval(idleTimeoutMinutes).catch((e) =>
        console.warn(`[Daytona] Could not set autostop interval: ${e}`)
      );
    }

    // Start the terminal (ttyd) first
    const terminalStart = await sandbox.process.executeCommand(startTerminalCommand(), DATA_DIR, undefined, 15);
    if (terminalStart.exitCode !== 0) {
      throw new Error(terminalStart.result || 'Failed to start terminal.');
    }

    // Start the Trifecta server
    const trifectaStart = await sandbox.process.executeCommand(startTrifectaCommand(pairingToken), DATA_DIR, trifectaEnv(pairingToken), 15);
    if (trifectaStart.exitCode !== 0) {
      throw new Error(trifectaStart.result || 'Failed to start Trifecta.');
    }
    await waitForTrifecta(sandbox);

    console.log(`[Daytona] Sandbox ${daytonaSandboxId} started successfully`);
  } catch (error) {
    console.error(`[Daytona] Failed to start sandbox ${daytonaSandboxId}:`, error);
    throw error;
  }
}

export async function stopSandbox(daytonaSandboxId: string): Promise<void> {
  try {
    const client = getDaytonaClient();
    const sandbox = await client.get(daytonaSandboxId);
    console.log(`[Daytona] Stopping sandbox: ${daytonaSandboxId}`);
    await sandbox.stop();
  } catch (error) {
    console.error(`[Daytona] Failed to stop sandbox ${daytonaSandboxId}:`, error);
    throw error;
  }
}

export async function deleteSandbox(daytonaSandboxId: string): Promise<void> {
  try {
    const client = getDaytonaClient();
    const sandbox = await client.get(daytonaSandboxId);
    console.log(`[Daytona] Deleting sandbox: ${daytonaSandboxId}`);
    await client.delete(sandbox);
  } catch (error) {
    console.error(`[Daytona] Failed to delete sandbox ${daytonaSandboxId}:`, error);
    throw error;
  }
}

export async function getSandboxStatus(daytonaSandboxId: string): Promise<SandboxStatus> {
  try {
    const client = getDaytonaClient();
    const sandbox = await client.get(daytonaSandboxId);
    return { state: sandbox.state || 'unknown' }; // state represents running, stopped, etc.
  } catch {
    return { state: 'unknown' };
  }
}

export async function getTerminalUrl(daytonaSandboxId: string): Promise<string> {
  try {
    const client = getDaytonaClient();
    const sandbox = await client.get(daytonaSandboxId);
    const link = await sandbox.getSignedPreviewUrl(TERMINAL_PORT, 7200); // 2 hours
    return link.url;
  } catch (error) {
    console.error(`[Daytona] Failed to get terminal URL for ${daytonaSandboxId}:`, error);
    throw error;
  }
}

export async function getTrifectaUrl(daytonaSandboxId: string): Promise<string> {
  try {
    const client = getDaytonaClient();
    const sandbox = await client.get(daytonaSandboxId);
    const link = await sandbox.getSignedPreviewUrl(config.trifecta.serverPort, 7200); // 2 hours
    return link.url;
  } catch (error) {
    console.error(`[Daytona] Failed to get Trifecta URL for ${daytonaSandboxId}:`, error);
    throw error;
  }
}

/**
 * Transforms a raw Daytona proxy URL into a Cloudflare-proxied URL so that
 * browser-based clients (web app, Electron) receive CORS headers.
 *
 * Uses path-based routing to stay within Cloudflare Universal SSL coverage
 * (wildcard certs only cover one subdomain level):
 *
 *   Daytona URL:    https://3773-<token>.daytonaproxy01.net
 *   Cloudflare URL: https://sbx.belweave.com/3773-<token>
 *
 * The Worker strips Origin and adds X-Daytona-Skip-Preview-Warning: true
 * before forwarding, then injects CORS headers on the response.
 * Falls back to the raw Daytona URL when NEXT_PUBLIC_CF_PROXY_DOMAIN is unset.
 */
export function toCloudflareProxyUrl(daytonaUrl: string): string {
  const proxyDomain = process.env.NEXT_PUBLIC_CF_PROXY_DOMAIN; // e.g. sbx.belweave.com
  if (!proxyDomain) return daytonaUrl;

  try {
    const parsed = new URL(daytonaUrl);
    // First subdomain segment = "3773-<token>" from "3773-<token>.daytonaproxy01.net"
    const sandboxHost = parsed.hostname.split('.')[0];
    return `https://${proxyDomain}/${sandboxHost}`;
  } catch {
    return daytonaUrl;
  }
}
