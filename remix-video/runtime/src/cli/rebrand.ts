import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { $ } from "bun";
import { z } from "zod";
import { Brand, BrandFonts, BrandPalette, sceneAssetIds, type EditSpec } from "../spec/schema";
import { writeVariant } from "./assets";
import { ensureDir, fail, Project, rel, resolveBrandKit, writeJson, type Args } from "./project";
import { applySwaps, replaceText, type Swap } from "./vary";

// A brand kit. File paths are relative to the kit file.
export const BrandKit = z.object({
  name: z.string(),
  wordmark: z.string(),
  wordmarkWeight: z.number().optional(),
  about: z.string().default(""),
  palette: BrandPalette.partial().default({}),
  fonts: BrandFonts.partial().default({}),
  // Logo + wordmark image for the end card; omit to draw mark + wordmark in code.
  lockup: z.string().optional(),
  // "hexagon" uses the built-in mark; a path uses an image (SVG/PNG, light on transparent).
  mark: z.string().default("hexagon"),
  // Exact text replacements, applied after the automatic brand-name swap.
  text: z.record(z.string(), z.string()).default({}),
  // selector -> file(s). Selector is an asset id or "tag:<tag>"; files are
  // assigned to matching assets in timeline order, cycling.
  replace: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  // selector -> brief. Matching assets are regenerated on fal from the brief,
  // the brand's `about`, and the asset's own description. The object form can
  // drop the source frame as a reference, when the old brand's look (say, a
  // dark UI) would fight the new one.
  // `allowText` lifts the no-text guard (signage, UI); screenshots always allow it.
  generate: z
    .record(z.string(), z.union([z.string(), z.object({ brief: z.string(), reference: z.boolean().default(true), allowText: z.boolean().default(false) })]))
    .default({}),
});
export type BrandKit = z.infer<typeof BrandKit>;

// vrea rebrand <slug> --brand <kit.json> [--name <variant>] [--base <variant>] [--dry-run]
export async function rebrand(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const kitArg = args.str("brand") ?? fail("--brand <kit.json> is required");
  const kitPath = resolveBrandKit(kitArg);
  if (!existsSync(kitPath)) fail(`brand kit not found: ${kitArg}`);
  const kit = BrandKit.parse(await Bun.file(kitPath).json());
  const kitDir = dirname(kitPath);
  const name = args.str("name") ?? slugify(kit.name);
  const base = await project.spec(args.str("base"));
  let spec: EditSpec = structuredClone(base);

  // 1. Identity: copy logo files into media and point the brand at them.
  const brandDir = `brands/${slugify(kit.name)}`;
  ensureDir(join(project.media, brandDir));
  const addFile = async (id: string, file: string) => {
    const src = resolve(kitDir, file);
    if (!existsSync(src)) fail(`brand file not found: ${file}`);
    await $`cp ${src} ${join(project.media, brandDir, basename(src))}`;
    spec.assets = spec.assets.filter((a) => a.id !== id);
    spec.assets.push({ id, type: "image", src: `${brandDir}/${basename(src)}`, origin: "brand", description: `${kit.name} ${id}`, tags: ["brand"], baked: [], trimBefore: 0, playbackRate: 1 });
    return id;
  };
  const old = spec.brand;
  spec.brand = Brand.parse({
    name: kit.name,
    wordmark: kit.wordmark,
    wordmarkWeight: kit.wordmarkWeight ?? old.wordmarkWeight,
    lockup: kit.lockup ? await addFile("brand-lockup", kit.lockup) : undefined,
    mark: kit.mark === "hexagon" ? "hexagon" : "asset",
    markAsset: kit.mark === "hexagon" ? undefined : await addFile("brand-mark", kit.mark),
    palette: { ...old.palette, ...kit.palette },
    fonts: { ...old.fonts, ...kit.fonts },
  });

  // 2. Words: old brand name in every case form, then the kit's own map.
  const names: Record<string, string> = {};
  for (const [from, to] of [[old.wordmark, kit.wordmark], [old.name, kit.name]] as const) {
    names[from] = to;
    names[from.toUpperCase()] = to.toUpperCase();
    names[from.toLowerCase()] = to.toLowerCase();
  }
  spec = replaceText(spec, names);
  spec = replaceText(spec, kit.text);

  // 3. Media: supplied files first, generated replacements second.
  const swaps: Swap[] = [];
  for (const [selector, files] of Object.entries(kit.replace)) {
    const list = Array.isArray(files) ? files : [files];
    select(spec, selector).forEach((id, i) => swaps.push({ asset: id, as: "file", file: resolve(kitDir, list[i % list.length]!), prompt: "", reference: false, guard: false }));
  }
  for (const [selector, entry] of Object.entries(kit.generate)) {
    const { brief, reference, allowText } = typeof entry === "string" ? { brief: entry, reference: true, allowText: false } : entry;
    for (const id of select(spec, selector)) {
      if (swaps.some((s) => s.asset === id)) continue;
      const asset = spec.assets.find((a) => a.id === id)!;
      const frames = spec.scenes.filter((s) => s.kind === "media" && s.asset === id).reduce((a, s) => a + s.duration, 0);
      swaps.push({
        asset: id,
        as: asset.type === "video" && frames >= 18 ? "video" : "image",
        prompt: `${brief}\nBrand: ${kit.name}. ${kit.about}\nThe shot it replaces showed: ${asset.description || "(no description)"}. Keep that shot's role, framing and mood; make it about ${kit.name}.`,
        reference,
        guard: !allowText && !asset.tags.includes("brand:screenshot"),
      });
    }
  }
  if (args.bool("dry-run")) {
    console.log(JSON.stringify({ brand: spec.brand, swaps: swaps.map((s) => ({ asset: s.asset, as: s.as, file: s.file })) }, null, 2));
    return;
  }
  spec = await applySwaps(project, spec, swaps, name);
  spec.meta = { ...spec.meta, derivedFrom: args.str("base") ?? "spec.json", derivation: `rebrand:${kit.name}` };

  const onScreen = new Set([...spec.scenes.flatMap((sc) => sceneAssetIds(sc)), spec.brand.lockup, spec.brand.markAsset]);
  const leftovers = spec.assets.filter((a) => onScreen.has(a.id) && a.tags.some((t) => t.startsWith("brand:")) && (a.origin === "source" || a.origin === "source-crop"));
  const hidden = hiddenCopy(base, spec);
  await writeJson(project.path("variants", name, "brand.json"), kit);
  const file = await writeVariant(project, name, spec);
  console.log(`wrote ${rel(file)} (${swaps.length} media swaps)`);
  if (leftovers.length) {
    console.log(`still showing ${old.name} (tagged brand:* and not replaced):\n  ${leftovers.map((a) => `${a.id} [${a.tags.join(", ")}] ${a.description}`).join("\n  ")}`);
  }
  if (hidden.length) {
    console.log(`copy changed but the old words are baked into this footage (add "baked:<key>" to generate/replace):\n  ${hidden.join("\n  ")}`);
  }
  console.log(`next: vrea render ${project.slug} --variant ${name}`);
}

// Text layers whose words changed while the footage under them still bakes
// that layer's key: the render would keep showing the old words.
function hiddenCopy(before: EditSpec, after: EditSpec): string[] {
  const out: string[] = [];
  const bakes = (scene: EditSpec["scenes"][number], key: string) => {
    if (scene.kind !== "media") return false;
    const asset = after.assets.find((a) => a.id === scene.asset);
    return !!asset && (asset.baked.includes(key) || asset.baked.includes("*"));
  };
  after.overlays.forEach((o, i) => {
    const prev = before.overlays[i]?.layer;
    if (o.layer.kind !== "text" || !o.layer.key || prev?.kind !== "text" || prev.text === o.layer.text) return;
    const key = o.layer.key;
    const scenes = after.scenes.filter((s) => s.from < o.from + o.duration && s.from + s.duration > o.from && bakes(s, key));
    if (scenes.length) out.push(`"${o.layer.text}" (${key}) over ${scenes.map((s) => s.id).join(", ")}`);
  });
  after.scenes.forEach((scene, i) => {
    scene.layers.forEach((l, j) => {
      const prev = before.scenes[i]?.layers[j];
      if (l.kind === "text" && l.key && prev?.kind === "text" && prev.text !== l.text && bakes(scene, l.key)) out.push(`"${l.text}" (${l.key}) in ${scene.id}`);
    });
  });
  return out;
}

// "s05" -> [s05]; "tag:brand:photo" -> every asset with that tag;
// "baked:caption" -> every asset whose pixels show layer "caption". Results
// follow the order their scenes appear.
function select(spec: EditSpec, selector: string): string[] {
  const [kind, value] = selector.includes(":") ? [selector.slice(0, selector.indexOf(":")), selector.slice(selector.indexOf(":") + 1)] : ["id", selector];
  if (kind !== "tag" && kind !== "baked") {
    if (!spec.assets.some((a) => a.id === selector)) fail(`brand kit: unknown asset ${selector}`);
    return [selector];
  }
  const order = new Map<string, number>();
  spec.scenes.forEach((s, i) => sceneAssetIds(s).forEach((id) => !order.has(id) && order.set(id, i)));
  return spec.assets
    .filter((a) => (kind === "tag" ? a.tags.includes(value!) : a.baked.includes(value!) || (a.baked.includes("*") && order.has(a.id))))
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
    .map((a) => a.id);
}


function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
