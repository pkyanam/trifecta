import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, "..");

const env = { ...process.env };

function run(script) {
  return spawn("bun", ["run", script], {
    cwd: desktopDir,
    env,
    stdio: "inherit",
  });
}

const bundle = run("dev:bundle");
const electron = run("dev:electron");

function cleanup(code) {
  bundle.kill();
  electron.kill();
  process.exit(code);
}

bundle.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    cleanup(code);
  }
});

electron.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    cleanup(code);
  }
});

process.once("SIGINT", () => cleanup(130));
process.once("SIGTERM", () => cleanup(143));
