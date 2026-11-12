import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { z } from "zod";
import type { EditSpec, Overlay, Section } from "../spec/schema";
import { renameSceneAssets, sceneAssetIds, sectionsOf } from "../spec/schema";
import { writeVariant } from "./assets";
import { render } from "./render";
import { ensureDir, fail, parseArgs, Project, rel, REMOTION_BIN, RUNTIME_ROOT, WORK_ROOT, writeJson, type Args } from "./project";

// The pick-and-choose state for a project, in projects/<slug>/mix.json:
// which variant each letter means, the pick per section, and remarks.
export const Mix = z.object({
  variants: z.record(z.string().regex(/^[a-z]$/), z.string()),
  picks: z.record(z.string(), z.string()).default({}),
  remarks: z.record(z.string(), z.string()).default({}),
  // "majority": the bed of the most-picked variant under everything;
  // "follow": each section keeps its own variant's bed; or a letter.
  music: z.string().default("majority"),
  name: z.string().default("mix"),
});
export type Mix = z.infer<typeof Mix>;

export function mixPath(project: Project) {
  return project.path("mix.json");
}

export async function loadMix(project: Project, args?: Args): Promise<Mix> {
  const file = mixPath(project);
  const saved = existsSync(file) ? Mix.parse(await Bun.file(file).json()) : undefined;
  const fromArgs = args?.str("variants");
  if (!saved && !fromArgs) fail(`no ${rel(file)} yet; pass --variants a=<variant>,b=<variant>,...`);
  const mix: Mix = saved ?? Mix.parse({ variants: {} });
  if (fromArgs) {
    mix.variants = Object.fromEntries(
      fromArgs.split(",").map((pair) => {
        const [k, v] = pair.split("=");
        if (!k || !v || !/^[a-z]$/.test(k)) fail(`--variants: use a=<variant>,b=<variant>, got "${pair}"`);
        return [k, v];
      }),
    );
  }
  for (const v of Object.values(mix.variants)) if (!existsSync(project.specPath(v))) fail(`unknown variant ${v}`);
  return mix;
}

export async function saveMix(project: Project, mix: Mix) {
  await writeJson(mixPath(project), mix);
}

export async function mixSections(project: Project, mix: Mix): Promise<Section[]> {
  const first = Object.values(mix.variants)[0] ?? fail("mix has no variants");
  return sectionsOf(await project.spec(first));
}

// "s1b,s2a s3c" -> { s1: "b", s2: "a", s3: "c" }
export function parsePicks(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of text.split(/[\s,]+/).filter(Boolean)) {
    const m = code.match(/^(s\d+)([a-z])$/);
    if (!m) fail(`pick "${code}": use a section and a variant letter, like s2b`);
    out[m[1]!] = m[2]!;
  }
  return out;
}

// Builds one spec from the picked part of each section. Variants share the
// timeline, so a section's scenes, overlays and sounds are lifted from the
// picked variant unchanged; asset ids get the variant letter as a prefix so
// same-named assets from different variants can coexist.
export function composeSpec(specs: Record<string, EditSpec>, sections: Section[], mix: Mix): EditSpec {
  const letters = Object.keys(specs);
  const pickOf = (id: string) => mix.picks[id] ?? letters[0]!;
  for (const s of sections) if (!specs[pickOf(s.id)]) fail(`${s.id}: no variant "${pickOf(s.id)}"`);
  const first = specs[letters[0]!]!;
  const out: EditSpec = { ...structuredClone(first), assets: [], scenes: [], overlays: [], sounds: [], sections: structuredClone(sections) };
  const brandIds = new Set([first.brand.lockup, first.brand.markAsset].filter(Boolean));
  out.assets.push(...first.assets.filter((a) => brandIds.has(a.id)).map((a) => structuredClone(a)));
  const counts = new Map<string, number>();
  for (const sec of sections) {
    const k = pickOf(sec.id);
    counts.set(k, (counts.get(k) ?? 0) + sec.duration);
    const v = specs[k]!;
    const end = sec.from + sec.duration;
    const rename = (id: string) => `${k}:${id}`;
    for (const scene of v.scenes.filter((s) => s.from >= sec.from && s.from < end)) {
      const copy = renameSceneAssets(scene, rename);
      copy.id = `${sec.id}${k}-${scene.id}`;
      out.scenes.push(copy);
      for (const id of sceneAssetIds(scene)) {
        if (out.assets.some((a) => a.id === rename(id))) continue;
        const asset = v.assets.find((a) => a.id === id) ?? fail(`${k}: missing asset ${id}`);
        out.assets.push({ ...structuredClone(asset), id: rename(id) });
      }
    }
    out.overlays.push(...v.overlays.flatMap((o) => clip(o, sec.from, end)));
    out.sounds.push(...v.sounds.filter((s) => s.kind !== "music" && s.from >= sec.from && s.from < end).map((s) => structuredClone(s)));
  }
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  if (mix.music === "follow") {
    out.audio = undefined;
    for (const sec of sections) {
      const bed = specs[pickOf(sec.id)]!.audio;
      if (bed) out.sounds.push({ kind: "music", src: bed.src, from: sec.from, duration: sec.duration, trimBefore: bed.trimBefore + sec.from, volume: bed.volume, text: `bed of ${pickOf(sec.id)}` });
    }
  } else {
    const k = mix.music === "majority" ? majority : mix.music;
    if (!specs[k]) fail(`music: no variant "${k}"`);
    out.audio = structuredClone(specs[k]!.audio);
  }
  out.sounds.sort((a, b) => a.from - b.from);
  out.meta = { ...out.meta, derivedFrom: Object.entries(mix.variants).map(([k, v]) => `${k}=${v}`).join(","), derivation: `compose:${codes(sections, mix, letters[0]!)}` };
  return out;
}

function clip(o: Overlay, from: number, to: number): Overlay[] {
  const a = Math.max(o.from, from);
  const b = Math.min(o.from + o.duration, to);
  if (b <= a) return [];
  const copy = structuredClone(o);
  // Keep text layers' internal timing aligned when an overlay is cut.
  if (copy.layer.kind === "text" && a > o.from) {
    copy.layer.from = Math.max(0, copy.layer.from - (a - o.from));
    copy.layer.typeFrames = 0;
    copy.layer.enter = "cut";
  }
  return [{ ...copy, from: a, duration: b - a }];
}

export function codes(sections: Section[], mix: Mix, fallback: string) {
  return sections.map((s) => `${s.id}${mix.picks[s.id] ?? fallback}`).join(" ");
}

// vrea compose <slug> [--picks "s1b s2a ..."] [--music majority|follow|<letter>] [--name mix] [--no-render]
export async function composeCommand(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const mix = await loadMix(project, args);
  if (args.str("picks")) mix.picks = { ...mix.picks, ...parsePicks(args.str("picks")!) };
  if (args.str("music")) mix.music = args.str("music")!;
  if (args.str("name")) mix.name = args.str("name")!;
  await saveMix(project, mix);
  const specs: Record<string, EditSpec> = {};
  for (const [k, v] of Object.entries(mix.variants)) specs[k] = await project.spec(v);
  const sections = await mixSections(project, mix);
  const spec = composeSpec(specs, sections, mix);
  const file = await writeVariant(project, mix.name, spec);
  console.log(`${codes(sections, mix, Object.keys(mix.variants)[0]!)}\nwrote ${rel(file)}`);
  const remarks = Object.entries(mix.remarks).filter(([, r]) => r.trim());
  if (remarks.length) console.log(`remarks to act on:\n${remarks.map(([s, r]) => `  ${s} (${sections.find((x) => x.id === s)?.name ?? "?"}): ${r}`).join("\n")}`);
  if (!args.bool("no-render")) return render(parseArgs([project.rawArg, "--variant", mix.name]));
  return file;
}

// vrea board <slug> [--variants a=x,b=y,c=z] [--audio a] [--out file]
// Renders the review board: every variant in sync, labeled per section.
export async function board(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const mix = await loadMix(project, args);
  await saveMix(project, mix);
  const sections = await mixSections(project, mix);
  const first = await project.spec(Object.values(mix.variants)[0]);
  const tiles = Object.entries(mix.variants).map(([key, name]) => {
    const file = project.path("renders", `${name}.mp4`);
    if (!existsSync(file)) fail(`no render for ${name}; run vrea render ${project.rawArg} --variant ${name}`);
    return { key, name, src: `renders/${name}.mp4` };
  });
  if (tiles.length > 3) fail("the board shows up to 3 variants");
  const audio = args.str("audio") ?? tiles[0]!.key;
  const props = { title: `${project.slug}: pick a version of each section`, fps: first.meta.fps, width: 1920, height: 1080, durationInFrames: first.meta.durationInFrames, sections, tiles, audio };
  const propsFile = join(ensureDir(project.path("renders")), ".board.props.json");
  await writeJson(propsFile, props);
  const out = args.str("out") ? resolve(WORK_ROOT, args.str("out")!) : project.path("renders", "board.mp4");
  await $`${REMOTION_BIN} render src/remotion/index.ts Board ${out} --props=${propsFile} --public-dir=${project.path()} --crf=18 --concurrency=50%`.cwd(RUNTIME_ROOT);
  console.log(`board: ${rel(out)}`);
  return out;
}
