import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { labelFontArgs } from "./analyze";
import { ensureDir, fail, Project, rel, REMOTION_BIN, RUNTIME_ROOT, WORK_ROOT, writeJson, type Args } from "./project";

const ENTRY = "src/remotion/index.ts";

function outName(variant?: string) {
  return variant ?? "clone";
}

// vrea render <slug> [--variant name] [--out file] [--frames a-b] [--scale 0.5]
export async function render(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const variant = args.str("variant");
  const spec = project.specPath(variant);
  await project.spec(variant); // validate before spending a render
  const out = args.str("out") ? resolve(WORK_ROOT, args.str("out")!) : join(ensureDir(project.path("renders")), `${outName(variant)}.mp4`);
  ensureDir(join(out, ".."));
  const extra: string[] = [];
  if (args.str("frames")) extra.push(`--frames=${args.str("frames")}`);
  if (args.str("scale")) extra.push(`--scale=${args.str("scale")}`);
  // Another Remotion Studio on the default port makes the render load the wrong page.
  if (args.str("port")) extra.push(`--port=${args.str("port")}`);
  await $`${REMOTION_BIN} render ${ENTRY} Edit ${out} --props=${spec} --public-dir=${project.media} --crf=16 --concurrency=${args.str("concurrency") ?? "50%"} ${extra}`.cwd(RUNTIME_ROOT);
  console.log(`rendered ${rel(out)}`);
  return out;
}

// vrea studio <slug> [--variant v] [--port n]. Never opens a browser itself;
// it prints the URL to open. Without --port, Remotion picks a free one.
export async function studio(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const variant = args.str("variant");
  const port = args.str("port") ? [`--port=${args.str("port")}`] : [];
  await $`${REMOTION_BIN} studio ${ENTRY} --props=${project.specPath(variant)} --public-dir=${project.media} ${port} --no-open`.cwd(RUNTIME_ROOT);
}

// vrea frame <slug> <frame...> [--variant name]
// Renders single frames and puts each beside the source frame:
// renders/frames/<variant>_f<N>.png = [source | render].
export async function frame(args: Args) {
  const [slug, ...frames] = args.positional;
  const project = new Project(slug ?? "");
  const variant = args.str("variant");
  const spec = await project.spec(variant);
  if (!frames.length) fail("usage: vrea frame <slug> <frame> [frame...]");
  const dir = ensureDir(project.path("renders", "frames"));
  for (const f of frames.map(Number)) {
    const still = join(dir, `.still_${f}.png`);
    await $`${REMOTION_BIN} still ${ENTRY} Edit ${still} --frame=${f} --props=${project.specPath(variant)} --public-dir=${project.media}`
      .cwd(RUNTIME_ROOT)
      .quiet();
    const out = join(dir, `${outName(variant)}_f${f}.png`);
    const { width: w, height: h } = spec.meta;
    await $`ffmpeg -hide_banner -loglevel error -y -i ${project.source} -i ${still} -filter_complex ${`[0:v]select='eq(n\\,${f})',scale=${w}:${h},setsar=1[a];[1:v]scale=${w}:${h},setsar=1[b];[a][b]hstack=2,scale=1920:-2`} -frames:v 1 ${out}`;
    await $`rm -f ${still}`;
    console.log(rel(out));
  }
}

// vrea compare <slug> [--variant name] [--render]
// Scores the render against the source frame by frame (SSIM), aggregates per
// scene, and writes a side-by-side video. Low scenes are where the clone
// diverges; for variants a low score is expected and only the side-by-side
// matters.
export async function compare(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const variant = args.str("variant");
  const spec = await project.spec(variant);
  const name = outName(variant);
  const video = project.path("renders", `${name}.mp4`);
  if (!existsSync(video) || args.bool("render")) await render(args);
  const { width: w, height: h } = spec.meta;
  const log = project.path("renders", `${name}.ssim.log`);
  await $`ffmpeg -hide_banner -loglevel error -i ${video} -i ${project.source} -lavfi ${`[1:v]scale=${w}:${h},setsar=1[ref];[0:v]setsar=1[r];[r][ref]ssim=stats_file=${log}`} -f null -`;
  const perFrame = (await Bun.file(log).text())
    .trim()
    .split("\n")
    .map((line) => Number(line.match(/All:([\d.]+)/)?.[1] ?? 0));
  const scenes = spec.scenes.map((s) => {
    const values = perFrame.slice(s.from, s.from + s.duration);
    const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    const worst = Math.min(...values);
    return { id: s.id, kind: s.kind, from: s.from, duration: s.duration, ssim: +mean.toFixed(3), worst: +worst.toFixed(3), worstFrame: s.from + values.indexOf(worst) };
  });
  const overall = perFrame.reduce((a, b) => a + b, 0) / perFrame.length;
  const side = project.path("renders", `${name}.side-by-side.mp4`);
  await $`ffmpeg -hide_banner -loglevel error -y -i ${project.source} -i ${video} -filter_complex ${`[0:v]scale=960:540,setsar=1[a];[1:v]scale=960:540,setsar=1[b];[a][b]hstack=2[v]`} -map [v] -map 1:a? -c:v libx264 -crf 20 -pix_fmt yuv420p ${side}`;
  await writeJson(project.path("renders", `${name}.compare.json`), { overall: +overall.toFixed(3), scenes });
  const table = scenes
    .map((s) => `${s.id.padEnd(16)} ${s.kind.padEnd(13)} f${String(s.from).padEnd(4)} ${String(s.duration).padStart(3)}f  ssim ${s.ssim.toFixed(3)}  worst ${s.worst.toFixed(3)} @f${s.worstFrame}`)
    .join("\n");
  console.log(`${table}\n\noverall SSIM ${overall.toFixed(3)}\nside-by-side: ${rel(side)}`);
}

// vrea grid <slug> --variants source,clone,v1 [--out file]
// Tiles renders side by side, labeled, in sync, with the first one's audio.
// "source" is the original video; "clone" is the spec.json render.
export async function grid(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const names = (args.str("variants") ?? fail("--variants a,b,... is required")).split(",").filter(Boolean);
  const files = names.map((n) => (n === "source" ? project.source : project.path("renders", `${n}.mp4`)));
  files.forEach((f, i) => existsSync(f) || fail(`no render for ${names[i]}: ${rel(f)}; run vrea render first`));
  const cols = Math.ceil(Math.sqrt(names.length));
  const w = 960;
  const h = 540;
  // ffmpeg builds often lack drawtext, so labels are small PNGs from ImageMagick.
  const dir = ensureDir(project.path("renders", "frames"));
  const labels = names.map((n) => join(dir, `.label_${n}.png`));
  const font = labelFontArgs();
  for (const [i, n] of names.entries()) {
    await $`magick -background ${"#000000aa"} -fill white ${font} -pointsize 26 label:${` ${n} `} -bordercolor ${"#000000aa"} -border 8 ${labels[i]!}`;
  }
  const k = names.length;
  const tiles = names.map((_, i) => `[${i}:v]scale=${w}:${h},setsar=1[s${i}];[s${i}][${k + i}:v]overlay=16:16[t${i}]`);
  const layout = names.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join("|");
  const stack = k > 1 ? `${names.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${k}:layout=${layout}:fill=black[v]` : "[t0]null[v]";
  const out = args.str("out") ? resolve(WORK_ROOT, args.str("out")!) : join(ensureDir(project.path("renders")), `grid.${names.join("+")}.mp4`);
  const inputs = [...files, ...labels].flatMap((f) => ["-i", f]);
  await $`ffmpeg -hide_banner -loglevel error -y ${inputs} -filter_complex ${`${tiles.join(";")};${stack}`} -map [v] -map 0:a? -c:v libx264 -crf 20 -pix_fmt yuv420p -shortest ${out}`;
  await $`rm -f ${labels}`;
  console.log(rel(out));
  return out;
}
