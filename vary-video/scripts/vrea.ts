#!/usr/bin/env bun
// Self-contained launcher for the `vrea` CLI. Locates the bundled Remotion
// runtime (in `./runtime` or `../remix-video/runtime`), installs its npm
// dependencies once on first run, and executes `vrea` while keeping the
// caller's working directory intact so `./projects/<slug>` and `.env` resolve
// where you invoked it.
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

const skillDir = resolve(import.meta.dir, "..");
const candidates = [
  process.env.VREA_RUNTIME_DIR ? resolve(process.env.VREA_RUNTIME_DIR) : "",
  join(skillDir, "runtime"),
  join(skillDir, "..", "remix-video", "runtime"),
].filter(Boolean);

const runtimeDir = candidates.find((d) => existsSync(join(d, "src", "cli", "index.ts")));
if (!runtimeDir) {
  console.error(
    `error: video-rea runtime not found (checked ${candidates.join(", ")}).\n` +
      `Install remix-video alongside this skill so ../remix-video/runtime is available, or set VREA_RUNTIME_DIR.`,
  );
  process.exit(1);
}

if (!existsSync(join(runtimeDir, "node_modules", ".bin", "remotion"))) {
  console.error(`installing video-rea Remotion runtime dependencies in ${runtimeDir} (one-time)...`);
  const install = Bun.spawnSync(["bun", "install"], {
    cwd: runtimeDir,
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (install.exitCode !== 0) process.exit(install.exitCode ?? 1);
}

const nodeModules = join(runtimeDir, "node_modules");
const nodePath = process.env.NODE_PATH ? `${nodeModules}${delimiter}${process.env.NODE_PATH}` : nodeModules;

const proc = Bun.spawn(["bun", join(runtimeDir, "src", "cli", "index.ts"), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...process.env,
    VREA_WORKDIR: process.env.VREA_WORKDIR ?? process.cwd(),
    NODE_PATH: nodePath,
  },
});

process.exit(await proc.exited);
