import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { $ } from "bun";
import type { EditSpec, EditSpecInput } from "../spec/schema";
import { bakingAssets, EditSpec as EditSpecSchema } from "../spec/schema";
import { ensureDir, fail, Project, rel, writeJson, type Args } from "./project";
import type { Shot } from "./analyze";

// vrea scaffold <slug> [--force]
// Drafts spec.json with one media scene per detected shot, each playing its
// own source cut with everything baked ("*"). It renders as the original, so
// it is the verbatim baseline that cloning then decompiles scene by scene.
export async function scaffold(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const info = await project.info();
  if (existsSync(project.specPath()) && !args.bool("force")) fail(`${rel(project.specPath())} exists (use --force to overwrite)`);
  const { shots } = (await Bun.file(project.path("analysis", "shots.json")).json()) as { shots: Shot[] };
  const fps = Math.round(info.fps);
  const width = Number(args.str("width") ?? even(info.width));
  const height = Number(args.str("height") ?? even(info.height));
  const draft: EditSpecInput = {
    version: 1,
    meta: { title: info.slug, sourceUrl: info.sourceUrl, fps, width, height, durationInFrames: shots.at(-1)!.end },
    brand: { name: "Original", wordmark: "ORIGINAL", palette: {}, fonts: {} },
    audio: info.hasAudio ? { src: "audio/source.m4a" } : undefined,
    assets: shots.map((s) => ({
      id: s.id,
      type: "video",
      src: `source/${s.id}.mp4`,
      origin: "source",
      description: "",
      tags: ["shot"],
      baked: ["*"],
      source: { start: s.start, end: s.end },
    })),
    scenes: shots.map((s) => ({ id: s.id, kind: "media", from: s.start, duration: s.frames, asset: s.id })),
  };
  const spec = EditSpecSchema.parse(draft);
  await project.writeSpec(spec);
  console.log(`wrote ${rel(project.specPath())}: ${shots.length} verbatim scenes. next: vrea extract ${info.slug}`);
}

// Rounds up to an even size; 1916-wide sources become 1920 so codecs and
// layouts behave. Source cuts are scaled to cover the composition.
function even(n: number) {
  return n % 8 === 4 ? n + 4 : n + (n % 2);
}

// vrea extract <slug> [--variant name] [--force]
// Materializes every source and source-crop asset from the original:
// frame-exact video cuts scaled to the composition, and PNG stills/crops.
export async function extract(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const variant = args.str("variant");
  const spec = await project.spec(variant);
  let made = 0;
  for (const asset of spec.assets) {
    if (asset.origin !== "source" && asset.origin !== "source-crop") continue;
    if (!asset.source) fail(`asset ${asset.id} has origin ${asset.origin} but no source range`);
    const out = join(project.media, asset.src);
    if (existsSync(out) && !args.bool("force")) continue;
    ensureDir(dirname(out));
    const { start, end, crop } = asset.source;
    const cropFilter = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : "";
    if (asset.type === "video") {
      const scale = crop ? "" : `,scale=${spec.meta.width}:${spec.meta.height}:force_original_aspect_ratio=increase,crop=${spec.meta.width}:${spec.meta.height}`;
      const vf = `select='between(n\\,${start}\\,${end - 1})',setpts=N/FRAME_RATE/TB,${cropFilter}null${scale}`;
      await $`ffmpeg -hide_banner -loglevel error -y -i ${project.source} -an -vf ${vf} -r ${spec.meta.fps} -c:v libx264 -crf 12 -preset medium -pix_fmt yuv420p -movflags +faststart ${out}`;
    } else {
      await $`ffmpeg -hide_banner -loglevel error -y -i ${project.source} -vf ${`select='eq(n\\,${start})',${cropFilter}null`} -frames:v 1 ${out}`;
    }
    made++;
  }
  console.log(`extracted ${made} asset(s) into ${rel(project.media)}`);
}

// Asset baked keys that no layer can redraw: swapping that asset would drop
// the effect. Also splits the timeline by what produces each frame:
// graphics drawn in code, source footage (with code layers on top),
// generated or supplied footage, and verbatim source ("*", not yet decompiled).
export function lint(spec: EditSpec) {
  const warnings: string[] = [];
  const frames = { code: 0, sourceFootage: 0, newFootage: 0, verbatim: 0 };
  for (const scene of spec.scenes) {
    const ids = bakingAssets(scene);
    const keys = new Set<string>();
    scene.layers.forEach((l) => l.key && keys.add(l.key));
    spec.overlays.forEach((o) => {
      if (o.layer.key && o.from < scene.from + scene.duration && o.from + o.duration > scene.from) keys.add(o.layer.key);
    });
    const main = scene.kind === "media" || scene.kind === "screen" || scene.kind === "laptop" ? spec.assets.find((a) => a.id === scene.asset) : undefined;
    if (!main) frames.code += scene.duration;
    else if (main.baked.includes("*")) frames.verbatim += scene.duration;
    else if (main.origin === "source" || main.origin === "source-crop") frames.sourceFootage += scene.duration;
    else frames.newFootage += scene.duration;
    for (const id of ids) {
      const asset = spec.assets.find((a) => a.id === id);
      if (!asset) continue;
      for (const key of asset.baked) {
        if (key !== "*" && !keys.has(key)) warnings.push(`${scene.id}: asset ${id} bakes "${key}" but no layer redraws it`);
      }
      if (!asset.description && asset.origin !== "brand") warnings.push(`${scene.id}: asset ${id} has no description (vary needs it)`);
    }
  }
  const pct = (n: number) => Math.round((n / spec.meta.durationInFrames) * 100);
  const breakdown = `${pct(frames.code)}% code graphics, ${pct(frames.sourceFootage)}% source footage, ${pct(frames.newFootage)}% new footage, ${pct(frames.verbatim)}% verbatim`;
  return { warnings, frames, breakdown };
}

export async function check(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const variant = args.str("variant");
  const spec = await project.spec(variant);
  const missing = spec.assets.filter((a) => !existsSync(join(project.media, a.src))).map((a) => `${a.id} -> media/${a.src}`);
  const { warnings, breakdown } = lint(spec);
  console.log(`spec ok: ${spec.scenes.length} scenes, ${spec.assets.length} assets, ${spec.meta.durationInFrames} frames`);
  console.log(`timeline: ${breakdown}`);
  if (missing.length) console.log(`missing media (run vrea extract):\n  ${missing.join("\n  ")}`);
  if (warnings.length) console.log(`warnings:\n  ${warnings.join("\n  ")}`);
  if (missing.length) process.exit(1);
}

export async function writeVariant(project: Project, name: string, spec: EditSpec) {
  const file = await project.writeSpec(spec, name);
  await writeJson(join(dirname(file), "summary.json"), lint(spec));
  return file;
}
