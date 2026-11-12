// bun launch-video/scripts/render.ts <launch.json> [--out ./launch.mp4] [--scale 1] [--frames a-b]
// Compiles a launch.json + brand profile into a staged Remotion bundle, ensures
// the skill's template dependencies are installed, synthesizes a beat-matched
// soundtrack when no audio file is supplied, and renders a 1080p60 H.264 MP4.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { $ } from "bun";
import { compileLaunch } from "./compile";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const planArg = process.argv[2];
if (!planArg || planArg.startsWith("--")) {
  console.error("usage: bun render.ts <launch.json> [--out ./launch.mp4] [--scale 0.5|1] [--frames 0-180] [--concurrency 50%]");
  process.exit(1);
}

const outPath = resolve(arg("--out") ?? join(dirname(resolve(planArg)), "renders", "launch.mp4"));
mkdirSync(dirname(outPath), { recursive: true });

const skillRoot = resolve(import.meta.dir, "..");
const templateDir = join(skillRoot, "template");
if (!existsSync(join(templateDir, "node_modules", ".bin", "remotion"))) {
  console.log("installing Remotion runtime dependencies in template/ (one-time)...");
  await $`bun install`.cwd(templateDir);
}

const stage = mkdtempSync(join(tmpdir(), "launch-video-stage-"));
try {
  const publicDir = join(stage, "public");
  const film = await compileLaunch(planArg, publicDir);
  const propsFile = join(stage, "props.json");
  writeFileSync(propsFile, JSON.stringify({ film }, null, 2));

  console.log(`compiled ${film.scenes.length} scenes, ${film.durationInFrames} frames (${(film.durationInFrames / film.fps).toFixed(2)}s @ ${film.fps}fps)`);
  for (const sc of film.scenes) {
    console.log(`  ${sc.id.padEnd(14)} f${String(sc.from).padEnd(5)} ${(sc.duration / film.fps).toFixed(2)}s  ${sc.name}`);
  }

  const extra: string[] = [];
  if (arg("--scale")) extra.push(`--scale=${arg("--scale")}`);
  if (arg("--frames")) extra.push(`--frames=${arg("--frames")}`);
  const concurrency = arg("--concurrency") ?? "50%";
  const remotionBin = join(templateDir, "node_modules", ".bin", "remotion");

  await $`${remotionBin} render src/index.ts LaunchFilm ${outPath} --props=${propsFile} --public-dir=${publicDir} --crf=16 --concurrency=${concurrency} ${extra}`.cwd(
    templateDir,
  );
  console.log(`rendered ${outPath}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
