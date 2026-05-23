import { Daytona, Image } from '@daytonaio/sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const snapshotName = process.env.TRIFECTA_SNAPSHOT_NAME || 'trifecta-server-v1';
const trifectaVersion = process.env.TRIFECTA_NPM_VERSION || '0.0.35-alpha.2';
const snapshotResources = { disk: 10 };

async function main() {
  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY || '',
    apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
  });

  console.log(`Building Daytona snapshot: ${snapshotName}`);
  console.log(`Installing @belweave/trifecta@${trifectaVersion}`);
  console.log(`Snapshot disk: ${snapshotResources.disk} GiB`);

  const image = Image.debianSlim('3.12')
    .runCommands(
      // Refresh package lists first so apt-get install succeeds on a fresh slim image.
      'apt-get update -y',

      // Install base tools before fetching external setup scripts.
      'apt-get install -y curl ca-certificates git sudo',

      // Install Node.js 22
      'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -',
      'apt-get install -y nodejs',

      // Debian slim does not ship ttyd in its default apt repos. Install a pinned binary.
      [
        'TTYD_VERSION=1.7.7',
        'ARCH="$(dpkg --print-architecture)"',
        'case "$ARCH" in amd64) TTYD_ARCH=x86_64 ;; arm64) TTYD_ARCH=aarch64 ;; *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;; esac',
        'curl -fsSL -o /usr/local/bin/ttyd "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}"',
        'chmod +x /usr/local/bin/ttyd',
        'ttyd --version',
      ].join(' && '),

      // Install Trifecta server globally. Pin this for reproducible sandboxes.
      `npm install -g @belweave/trifecta@${trifectaVersion}`,
      'trifecta --help',

      // Additional developer CLIs (npm-based installs go to /usr/local/bin automatically)
      'npm install -g @openai/codex',
      'npm install -g @google/gemini-cli',

      // curl-based installers — may write to /root/... depending on the installer.
      // We'll symlink anything that didn't land in /usr/local/bin afterwards.
      'curl -fsSL https://claude.ai/install.sh | bash || true',
      'curl https://cursor.com/install -fsS | bash || true',
      'curl -fsSL https://cli.devin.ai/install.sh | bash || true',
      'curl -fsSL https://opencode.ai/install | bash || true',

      // Make curl-installed CLIs accessible to the daytona user.
      // Each sandbox is single-tenant (one user per container), so world-readable /root
      // is safe — the daytona user already controls the entire sandbox environment.
      //
      // (a) Allow directory traversal into /root so any existing symlinks can resolve.
      'chmod o+x /root',
      // (b) Make runtime subdirs (node_modules, config, etc.) world-readable.
      //     Tools like Claude CLI load JS modules from their install dir at runtime.
      'for _d in /root/.local /root/.nvm /root/.claude /root/.opencode /root/.cursor /root/.devin; do [ -d "$_d" ] && chmod -R a+rX "$_d"; done; true',
      // (c) COPY (not symlink) binaries to /usr/local/bin so execution never depends on
      //     /root directory permissions, even if (a) is ever reverted.
      'for _d in /root/.local/bin /root/.claude/bin /root/.opencode/bin /root/.cursor/bin /root/.devin/bin; do [ -d "$_d" ] || continue; for _f in "$_d"/*; do [ -x "$_f" ] || continue; _n=$(basename "$_f"); command -v "$_n" >/dev/null 2>&1 || { cp "$_f" /usr/local/bin/"$_n" && chmod 755 /usr/local/bin/"$_n"; }; done; done; true',
      // (d) Trifecta probes `cursor-agent`; cursor installs itself as `cursor`.
      'command -v cursor >/dev/null 2>&1 && ln -sf "$(command -v cursor)" /usr/local/bin/cursor-agent || true',

      // Make sure /usr/local/bin is on the system-wide PATH for all login shells.
      'echo \'export PATH="/usr/local/bin:$PATH"\' > /etc/profile.d/local-bin.sh',

      // Create non-root user and data dir — always last so chown is complete.
      'useradd -m -s /bin/bash daytona',
      'mkdir -p /home/daytona/data',
      'chown -R daytona:daytona /home/daytona',

      // Allow daytona to run specific admin commands without a password.
      // This lets AI tools (e.g. claude, codex) install packages via apt if needed,
      // while keeping the daytona session non-root by default.
      'echo "daytona ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/local/bin/npm, /usr/bin/npm" >> /etc/sudoers.d/daytona',
      'chmod 440 /etc/sudoers.d/daytona',
    )
    .workdir('/home/daytona');

  try {
    const snapshot = await daytona.snapshot.create(
      {
        name: snapshotName,
        image,
        resources: snapshotResources,
      },
      {
        onLogs: (chunk) => process.stdout.write(chunk.toString()),
      }
    );

    console.log(`\nSnapshot ${snapshotName} created successfully! ID: ${snapshot.id}`);
  } catch (err) {
    console.error('Failed to create snapshot:', err);
    process.exit(1);
  }
}

main();
