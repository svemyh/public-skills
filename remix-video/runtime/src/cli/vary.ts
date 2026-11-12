import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { z } from "zod";
import { random } from "remotion/no-react";
import type { Asset, EditSpec, Layer, Scene } from "../spec/schema";
import { assetOf, parseSpec } from "../spec/schema";
import { writeVariant } from "./assets";
import { pool, runModel, toUrl } from "./fal";
import { stock } from "./pexels";
import { aspectFor, MODELS } from "./models";
import { ensureDir, fail, Project, rel, writeJson, type Args } from "./project";

export const Swap = z.object({
  asset: z.string(),
  // image: one generated still; video: a still, then animated; stock: real
  // footage or a photo found on Pexels by `query`; file: a local file.
  as: z.enum(["image", "video", "stock", "file"]),
  // For stock: what to search, video or photo (default: video for media
  // scenes, photo otherwise), and how many good results to skip.
  query: z.string().optional(),
  stockType: z.enum(["video", "image"]).optional(),
  nth: z.number().int().nonnegative().optional(),
  prompt: z.string().default(""),
  // Steer the still with the source keyframe (style, palette, framing).
  reference: z.boolean().default(true),
  // Append the no-text/no-logo guard. Off for UI and signage that need words.
  guard: z.boolean().default(true),
  file: z.string().optional(),
  endpoint: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  motionPrompt: z.string().optional(),
});
export type Swap = z.infer<typeof Swap>;

// A structural change for one beat or many: `scenes` selects by scene id,
// "kind:<kind>", "tag:<asset tag>" (media scenes showing such an asset), "*",
// or "overlays"; `set` overwrites scene fields (a different layout, motif or
// pattern); `layers` overwrites fields on that selection's layers of a kind.
export const Remix = z.object({
  scenes: z.string(),
  set: z.record(z.string(), z.unknown()).default({}),
  layers: z.object({ kind: z.string(), set: z.record(z.string(), z.unknown()) }).optional(),
});
export type Remix = z.infer<typeof Remix>;

export const Plan = z.object({
  base: z.string().optional(), // another variant to start from; default spec.json
  seed: z.string(),
  swaps: z.array(Swap).default([]),
  motion: z.object({ jitter: z.number().min(0).max(1).default(0.25), reseed: z.boolean().default(true) }).default({ jitter: 0.25, reseed: true }),
  text: z.record(z.string(), z.string()).default({}),
  remix: z.array(Remix).default([]),
  concurrency: z.number().int().default(4),
});
export type Plan = z.infer<typeof Plan>;

const STYLE_GUARD =
  "Photographic, cinematic, high detail. No text, no letters, no captions, no logos, no watermarks, no UI, no frames or boxes drawn on the image.";

// vrea vary <slug> --name <variant> [--draft] [--dry-run]
// --draft writes variants/<name>/plan.json from the spec: one swap per
// described media asset, still or video by scene length. Edit the prompts,
// then run without --draft to generate and write variants/<name>/spec.json.
export async function vary(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const name = args.str("name") ?? fail("--name <variant> is required");
  const planPath = project.path("variants", name, "plan.json");
  if (args.bool("draft")) {
    const spec = await project.spec(args.str("base"));
    await writeJson(planPath, draftPlan(spec, name, args.str("base")));
    console.log(`drafted ${rel(planPath)}; edit prompts, then: vrea vary ${project.slug} --name ${name}`);
    return;
  }
  if (!existsSync(planPath)) fail(`no plan at ${rel(planPath)}; run with --draft first`);
  const plan = Plan.parse(await Bun.file(planPath).json());
  const base = await project.spec(plan.base);
  const cost = estimate(plan.swaps, base);
  console.log(`${plan.swaps.length} swaps, estimated fal cost ~$${cost.toFixed(2)}`);
  if (args.bool("dry-run")) return;
  let spec = await applySwaps(project, base, plan.swaps, name, plan.concurrency);
  spec = applyMotion(spec, plan.seed, plan.motion.jitter, plan.motion.reseed);
  spec = replaceText(spec, plan.text);
  spec = parseSpec(applyRemix(spec, plan.remix));
  spec.meta = { ...spec.meta, derivedFrom: plan.base ?? "spec.json", derivation: `vary:${name}` };
  const file = await writeVariant(project, name, spec);
  console.log(`wrote ${rel(file)}. next: vrea render ${project.slug} --variant ${name}`);
}

export function draftPlan(spec: EditSpec, seed: string, base?: string): Plan {
  const swaps: Swap[] = [];
  for (const scene of spec.scenes) {
    if (scene.kind !== "media") continue;
    const asset = assetOf(spec, scene.asset);
    if (!asset || !asset.description || asset.tags.includes("keep") || swaps.some((s) => s.asset === asset.id)) continue;
    swaps.push({
      asset: asset.id,
      as: scene.duration >= 18 ? "video" : "image",
      prompt: `A different shot on the same theme as: ${asset.description}. New subject and composition, same mood, lighting and lens feel.`,
      reference: true,
      guard: true,
    });
  }
  return { base, seed, swaps, motion: { jitter: 0.25, reseed: true }, text: {}, remix: [], concurrency: 4 };
}

function estimate(swaps: Swap[], spec: EditSpec) {
  return swaps.reduce((sum, s) => {
    if (s.as === "file" || s.as === "stock") return sum;
    const seconds = Math.max(3, Math.ceil(sceneSeconds(spec, s.asset)));
    return sum + 0.15 + (s.as === "video" ? 0.157 * seconds : 0);
  }, 0);
}

function sceneSeconds(spec: EditSpec, assetId: string) {
  const frames = spec.scenes.filter((s) => (s.kind === "media" || s.kind === "laptop") && s.asset === assetId).reduce((a, s) => a + s.duration, 0);
  return frames / spec.meta.fps;
}

// Generates (or copies) every swap and returns the spec with those assets
// replaced by clean plates: origin fal/user, nothing baked, so the scene's
// code layers now draw every effect.
export async function applySwaps(project: Project, base: EditSpec, swaps: Swap[], variant: string, concurrency = 4): Promise<EditSpec> {
  const spec: EditSpec = structuredClone(base);
  const relDir = `variants/${variant}`;
  const outDir = ensureDir(join(project.media, relDir));
  const refDir = ensureDir(project.path("variants", variant, "refs"));
  // Cropped assets (panels, cards, icons) fill slots of their own shape.
  const aspectOf = (asset: Asset) => (asset.source?.crop ? aspectFor(asset.source.crop.w, asset.source.crop.h) : aspectFor(spec.meta.width, spec.meta.height));

  // Stock picks go one by one so no two assets get the same clip.
  const used = new Set<number>();
  const stockResults = [];
  for (const swap of swaps.filter((s) => s.as === "stock")) {
    const asset = spec.assets.find((a) => a.id === swap.asset) ?? fail(`swap: unknown asset ${swap.asset}`);
    const onMedia = spec.scenes.some((s) => (s.kind === "media" || s.kind === "laptop") && s.asset === asset.id);
    const type = swap.stockType ?? (onMedia ? "video" : "image");
    const crop = asset.source?.crop;
    const pick = await stock({ query: swap.query ?? swap.prompt, type, seconds: sceneSeconds(spec, asset.id), exclude: used, nth: swap.nth, aspect: crop ? crop.w / crop.h : spec.meta.width / spec.meta.height, out: join(outDir, `${asset.id}.stock`) });
    used.add(pick.id);
    const lead = pick.duration && pick.duration > sceneSeconds(spec, asset.id) + 2 ? spec.meta.fps : 0;
    stockResults.push({
      asset,
      patch: { type: pick.type, src: `${relDir}/${pick.file.split("/").pop()}`, origin: "stock" as const, generation: { endpoint: "pexels", prompt: swap.query ?? swap.prompt, requestId: String(pick.id), input: { url: pick.url, author: pick.author } } },
      trimBefore: lead,
    });
    console.log(`  ${asset.id}: pexels ${pick.type} ${pick.id} by ${pick.author} ("${swap.query ?? swap.prompt}")`);
  }

  const results = await pool(swaps.filter((s) => s.as !== "stock"), concurrency, async (swap) => {
    const asset = spec.assets.find((a) => a.id === swap.asset) ?? fail(`swap: unknown asset ${swap.asset}`);
    if (swap.as === "file") {
      const file = swap.file ?? fail(`swap ${swap.asset}: as "file" needs file`);
      const ext = file.slice(file.lastIndexOf("."));
      const dest = join(outDir, asset.id + ext);
      if (resolve(file) !== resolve(dest)) await $`cp ${file} ${dest}`;
      const type: Asset["type"] = /\.(mp4|mov|webm)$/i.test(ext) ? "video" : "image";
      return { asset, patch: { type, src: `${relDir}/${asset.id}${ext}`, origin: "user" as const } };
    }
    const reference = swap.reference ? await referenceFrame(project, spec, asset, refDir) : undefined;
    const prompt = swap.guard ? `${swap.prompt}\n${STYLE_GUARD}` : swap.prompt;
    const aspect = aspectOf(asset);
    const stillModel = swap.as === "image" && swap.endpoint ? { endpoint: swap.endpoint, build: () => swap.input ?? {} } : reference ? MODELS["image-ref"]! : MODELS.image!;
    const stillExtra = swap.as === "image" ? swap.input : undefined;
    const still = await runModel({
      endpoint: stillModel.endpoint,
      key: { prompt, reference: reference && rel(reference), aspect, extra: stillExtra },
      input: async () => ({ ...stillModel.build({ prompt, reference: reference && (await toUrl(reference)), aspect, seconds: 0 }), ...stillExtra }),
      outDir,
      name: `${asset.id}.still`,
    });
    const stillFile = still.files[0] ?? fail(`swap ${asset.id}: no image returned`);
    if (swap.as === "image") {
      return {
        asset,
        patch: { type: "image" as const, src: `${relDir}/${stillFile.split("/").pop()}`, origin: "fal" as const, generation: { endpoint: stillModel.endpoint, prompt, requestId: still.requestId } },
      };
    }
    const videoModel = MODELS.video!;
    const motion = swap.motionPrompt ?? `Subtle cinematic camera motion. ${swap.prompt}`;
    const seconds = sceneSeconds(spec, asset.id);
    const clip = await runModel({
      endpoint: swap.endpoint ?? videoModel.endpoint,
      key: { prompt: motion, image: rel(stillFile), seconds, extra: swap.input },
      input: async () => ({ ...videoModel.build({ prompt: motion, image: await toUrl(stillFile), aspect, seconds }), ...swap.input }),
      outDir,
      name: `${asset.id}.clip`,
    });
    const clipFile = clip.files.find((f) => /\.(mp4|mov|webm)$/i.test(f)) ?? fail(`swap ${asset.id}: no video returned`);
    return {
      asset,
      patch: { type: "video" as const, src: `${relDir}/${clipFile.split("/").pop()}`, origin: "fal" as const, generation: { endpoint: swap.endpoint ?? videoModel.endpoint, prompt: motion, requestId: clip.requestId } },
    };
  });

  for (const { asset, patch, trimBefore = 0 } of [...stockResults, ...results] as { asset: Asset; patch: Partial<Asset>; trimBefore?: number }[]) {
    Object.assign(asset, patch, { baked: [], trimBefore, playbackRate: 1 });
    // A still replacing footage gets a slow push-in so the shot still moves.
    for (const scene of spec.scenes) {
      if (scene.kind === "media" && scene.asset === asset.id && asset.type === "image" && scene.zoomFrom === scene.zoomTo) {
        scene.zoomFrom = 1.02;
        scene.zoomTo = 1.1;
      }
    }
  }
  return spec;
}

// The middle source frame of the asset, with baked inverts undone so the
// model sees (and returns) a natural-looking plate; the code grade re-applies
// the look.
async function referenceFrame(project: Project, spec: EditSpec, asset: Asset, refDir: string) {
  const out = join(refDir, `${asset.id}.png`);
  if (existsSync(out)) return out;
  let filter = "null";
  let frameNo: number;
  if (asset.source) frameNo = Math.floor((asset.source.start + asset.source.end - 1) / 2);
  else {
    const scene = spec.scenes.find((s) => s.kind === "media" && s.asset === asset.id);
    if (!scene) return undefined;
    frameNo = scene.from + Math.floor(scene.duration / 2);
  }
  const inverted = spec.scenes.some(
    (s) => s.kind === "media" && s.asset === asset.id && s.layers.some((l) => l.kind === "grade" && l.invert && (asset.baked.includes("*") || (l.key && asset.baked.includes(l.key)))),
  );
  const crop = asset.source?.crop;
  if (crop) filter = `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`;
  if (inverted) filter += ",negate";
  await $`ffmpeg -hide_banner -loglevel error -y -i ${project.source} -vf ${`select='eq(n\\,${frameNo})',${filter},scale=1280:-2`} -frames:v 1 ${out}`;
  return out;
}

// Deterministic per-variant changes to motion: new seeds for procedural
// layers, and zoom, drift and camera moves scaled by up to ±jitter.
export function applyMotion(base: EditSpec, seed: string, jitter: number, reseed: boolean): EditSpec {
  const spec: EditSpec = structuredClone(base);
  const j = (key: string, value: number, spread = 1) => value * (1 + (random(`${seed}:${key}`) * 2 - 1) * jitter * spread);
  const reseedLayer = (l: Layer) => {
    if (reseed && "seed" in l && typeof l.seed === "string") l.seed = `${l.seed}:${seed}`;
  };
  for (const scene of spec.scenes) {
    scene.layers.forEach(reseedLayer);
    jitterScene(scene, j, reseed ? seed : undefined);
  }
  spec.overlays.forEach((o) => reseedLayer(o.layer));
  return spec;
}

function jitterScene(scene: Scene, j: (key: string, value: number, spread?: number) => number, seed?: string) {
  const id = scene.id;
  switch (scene.kind) {
    case "media": {
      const push = scene.zoomTo - scene.zoomFrom;
      // Variants may reverse a push-in into a pull-out.
      if (push !== 0 && j(`${id}:dir`, 1, 2) < 1) [scene.zoomFrom, scene.zoomTo] = [scene.zoomTo, scene.zoomFrom];
      scene.panX += (j(`${id}:panX`, 1) - 1) * 40;
      scene.panY += (j(`${id}:panY`, 1) - 1) * 20;
      break;
    }
    case "panelCollage":
      scene.drift = { x: j(`${id}:dx`, scene.drift.x, 2), y: j(`${id}:dy`, scene.drift.y, 2), scale: 1 + (scene.drift.scale - 1) * j(`${id}:ds`, 1) };
      break;
    case "cardCollage":
      scene.camera = { x: j(`${id}:cx`, scene.camera.x || 30, 2), y: j(`${id}:cy`, scene.camera.y || 20, 2), zoom: 1 + (scene.camera.zoom - 1) * j(`${id}:cz`, 1) };
      if (seed) scene.seed = `${scene.seed}:${seed}`;
      break;
    case "halftoneRing":
    case "iconSwarm":
    case "pixelWipe":
      if (seed) scene.seed = `${scene.seed}:${seed}`;
      break;
    case "laptop":
      scene.driftX = j(`${id}:drift`, scene.driftX || 30, 2) * (j(`${id}:ddir`, 1, 2) < 1 ? -1 : 1);
      break;
    case "codeScroll":
      scene.speed = j(`${id}:speed`, scene.speed);
      scene.tilt = j(`${id}:tilt`, scene.tilt, 2);
      break;
    default:
      break;
  }
}

export function replaceText(base: EditSpec, map: Record<string, string>): EditSpec {
  if (!Object.keys(map).length) return base;
  const spec: EditSpec = structuredClone(base);
  const swap = (text: string) => Object.entries(map).reduce((t, [from, to]) => t.split(from).join(to), text);
  const visit = (l: Layer) => {
    if (l.kind === "text" || l.kind === "prompt") l.text = swap(l.text);
  };
  spec.scenes.forEach((s) => {
    s.layers.forEach(visit);
    if (s.kind === "markMorph" && s.wordmark) s.wordmark.text = swap(s.wordmark.text);
    if (s.kind === "codeScroll") {
      s.lines = s.lines.map(swap);
      s.sidebar = s.sidebar.map(swap);
    }
    if (s.kind === "taskFeed") {
      s.picker = swap(s.picker);
      s.tasks.forEach((task) => ((task.title = swap(task.title)), (task.meta = swap(task.meta))));
    }
    if (s.kind === "panelCollage" || s.kind === "cardCollage") {
      for (const c of s.kind === "panelCollage" ? s.panels : s.cards) {
        if (c.headline) c.headline = swap(c.headline);
        if (c.body) c.body = swap(c.body);
        if (c.ui) {
          c.ui.headline = swap(c.ui.headline);
          if (c.ui.body) c.ui.body = swap(c.ui.body);
          c.ui.items = c.ui.items.map(swap);
        }
      }
    }
    if (s.kind === "screen") {
      s.script.forEach((line) => (line.text = swap(line.text)));
    }
    if (s.kind === "stage") {
      s.elements.forEach((el) => {
        if (el.kind === "introLine" || el.kind === "text") el.text = swap(el.text);
        if (el.kind === "composer") {
          el.headline = swap(el.headline);
          el.placeholder = swap(el.placeholder);
          el.typed = swap(el.typed);
          el.hint = swap(el.hint);
        }
        if (el.kind === "status") {
          el.prefix = swap(el.prefix);
          el.phrases.forEach((p) => (p.text = swap(p.text)));
        }
        if (el.kind === "calendar" || el.kind === "yearGrid") el.title = swap(el.title);
      });
    }
    if (s.kind === "promo") {
      s.elements.forEach((el) => {
        if (el.kind === "title") el.lines.forEach((l) => ((l.small = swap(l.small)), (l.big = swap(l.big))));
        if (el.kind === "composer") {
          el.typed = swap(el.typed);
          el.button = swap(el.button);
        }
        if (el.kind === "badges") el.badges.forEach((b) => (b.text = swap(b.text)));
      });
    }
  });
  spec.overlays.forEach((o) => visit(o.layer));
  return spec;
}

export function applyRemix(base: EditSpec, remix: z.input<typeof Remix>[]): EditSpec {
  if (!remix.length) return base;
  const spec: EditSpec = structuredClone(base);
  for (const r of remix) {
    const patchLayer = (l: Layer) => {
      if (r.layers && l.kind === r.layers.kind) Object.assign(l, r.layers.set);
    };
    if (r.scenes === "overlays") {
      spec.overlays.forEach((o) => patchLayer(o.layer));
      continue;
    }
    const scenes = spec.scenes.filter((s) => matchScene(spec, s, r.scenes));
    if (!scenes.length) fail(`remix: "${r.scenes}" matches no scene`);
    for (const scene of scenes) {
      Object.assign(scene, r.set ?? {});
      scene.layers.forEach(patchLayer);
    }
  }
  return spec;
}

function matchScene(spec: EditSpec, scene: Scene, selector: string) {
  if (selector === "*") return true;
  if (selector.startsWith("kind:")) return scene.kind === selector.slice(5);
  if (selector.startsWith("tag:")) return scene.kind === "media" && !!assetOf(spec, scene.asset)?.tags.includes(selector.slice(4));
  return scene.id === selector;
}
