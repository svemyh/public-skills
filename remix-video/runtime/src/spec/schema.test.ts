import { describe, expect, test } from "bun:test";
import { detectCuts } from "../cli/analyze";
import { lint } from "../cli/assets";
import { composeSpec, parsePicks } from "../cli/compose";
import { audioConflicts, musicChunks, phraseStarts, SoundPlan } from "../cli/sound";
import { applyMotion, applyRemix, replaceText } from "../cli/vary";
import { alpha } from "../remotion/lib/color";
import { bakedAt, bakingAssets, checkSpec, EditSpec, parseSpec, renameSceneAssets, sceneAssetIds, sectionsOf, type EditSpecInput } from "./schema";

const base: EditSpecInput = {
  version: 1,
  meta: { title: "t", fps: 24, width: 1920, height: 1080, durationInFrames: 30 },
  brand: { name: "Old Co", wordmark: "OLDCO", palette: {}, fonts: {} },
  assets: [
    { id: "a", type: "video", src: "a.mp4", origin: "source", description: "a shot", baked: ["caption"] },
    { id: "b", type: "image", src: "b.png", origin: "fal", description: "b shot" },
  ],
  scenes: [
    { id: "s1", kind: "media", from: 0, duration: 10, asset: "a", zoomFrom: 1, zoomTo: 1.1 },
    { id: "s2", kind: "media", from: 10, duration: 10, asset: "b" },
    { id: "s3", kind: "halftoneRing", from: 20, duration: 10, seed: "ring", layers: [{ kind: "text", text: "Old Co rules", x: 0, y: 0 }] },
  ],
  overlays: [{ from: 0, duration: 20, layer: { kind: "text", key: "caption", text: "where Old Co lives", x: 960, y: 540 } }],
};

describe("checkSpec", () => {
  test("accepts a tiled timeline", () => {
    expect(checkSpec(EditSpec.parse(base))).toEqual([]);
  });
  test("reports gaps, unknown assets and length mismatch", () => {
    const bad = structuredClone(base);
    bad.scenes[1]!.from = 11;
    (bad.scenes[0] as { asset: string }).asset = "missing";
    const messages = checkSpec(EditSpec.parse(bad)).map((i) => i.message);
    expect(messages).toContain('unknown asset "missing"');
    expect(messages.some((m) => m.includes("gap or overlap"))).toBe(true);
    expect(() => parseSpec(bad)).toThrow();
  });
});

describe("baked layers", () => {
  test("bakedAt follows the scene under the frame", () => {
    const spec = EditSpec.parse(base);
    expect(bakedAt(spec, 5).has("caption")).toBe(true);
    expect(bakedAt(spec, 15).has("caption")).toBe(false);
  });
  test("lint splits the timeline and flags baked keys nothing redraws", () => {
    const spec = EditSpec.parse(base);
    const { frames, warnings } = lint(spec);
    expect(frames).toEqual({ code: 10, sourceFootage: 10, newFootage: 10, verbatim: 0 });
    expect(warnings).toEqual([]);
    spec.overlays = [];
    expect(lint(spec).warnings[0]).toContain('bakes "caption"');
  });
});

describe("detectCuts", () => {
  test("keeps one cut per peak and respects the minimum shot", () => {
    const scores = [0, 0, 0.9, 0.4, 0, 0, 0, 0.5, 0.6, 0, 0];
    expect(detectCuts(scores, 0.3, 2)).toEqual([0, 2, 8]);
  });
});

describe("variants", () => {
  test("applyMotion is deterministic per seed and leaves the base alone", () => {
    const spec = EditSpec.parse(base);
    const a = applyMotion(spec, "v1", 0.3, true);
    const b = applyMotion(spec, "v1", 0.3, true);
    const c = applyMotion(spec, "v2", 0.3, true);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c));
    expect((spec.scenes[2] as { seed: string }).seed).toBe("ring");
    expect((a.scenes[2] as { seed: string }).seed).toBe("ring:v1");
  });
  test("replaceText reaches layers and overlays", () => {
    const spec = replaceText(EditSpec.parse(base), { "Old Co": "New Co" });
    expect((spec.scenes[2]!.layers[0] as { text: string }).text).toBe("New Co rules");
    expect((spec.overlays[0]!.layer as { text: string }).text).toBe("where New Co lives");
  });
});

test("alpha converts hex and passes other colors through", () => {
  expect(alpha("#fff", 0.5)).toBe("rgba(255,255,255,0.5)");
  expect(alpha("#F6F7F3", 1)).toBe("rgba(246,247,243,1)");
  expect(alpha("red", 0.5)).toBe("red");
});

describe("applyRemix", () => {
  test("sets scene fields by kind and layer fields by selection, leaving the base alone", () => {
    const spec = EditSpec.parse(base);
    const out = applyRemix(spec, [
      { scenes: "kind:halftoneRing", set: { motif: "tunnel" } },
      { scenes: "*", layers: { kind: "text", set: { enter: "rise" } } },
      { scenes: "overlays", layers: { kind: "text", set: { enter: "blur" } } },
    ]);
    const ring = out.scenes[2]!;
    expect(ring.kind === "halftoneRing" && ring.motif).toBe("tunnel");
    expect(ring.layers[0]!.kind === "text" && ring.layers[0]!.enter).toBe("rise");
    expect(out.overlays[0]!.layer.kind === "text" && out.overlays[0]!.layer.enter).toBe("blur");
    expect(spec.scenes[2]!.kind === "halftoneRing" && spec.scenes[2]!.motif).toBe("ring");
    expect(() => parseSpec(out)).not.toThrow();
  });
});

describe("sections and compose", () => {
  const withSections = (): EditSpecInput => ({
    ...structuredClone(base),
    sections: [
      { id: "s1", name: "a", from: 0, duration: 20 },
      { id: "s2", name: "b", from: 20, duration: 10 },
    ],
  });
  test("derives sections from scene runs when none are given", () => {
    expect(sectionsOf(EditSpec.parse(base)).map((s) => [s.from, s.duration])).toEqual([
      [0, 20],
      [20, 10],
    ]);
  });
  test("rejects sections that miss scene boundaries", () => {
    const bad = withSections();
    bad.sections![1] = { id: "s2", name: "b", from: 25, duration: 5 };
    bad.sections![0]!.duration = 25;
    expect(checkSpec(EditSpec.parse(bad)).some((i) => i.message.includes("not a scene boundary"))).toBe(true);
  });
  test("lifts each section from its picked variant with prefixed assets", () => {
    const a = EditSpec.parse(withSections());
    const b = EditSpec.parse(withSections());
    b.assets.forEach((x) => (x.src = `b/${x.src}`));
    b.sounds.push({ kind: "vo", src: "b.mp3", from: 22, trimBefore: 0, volume: 1, text: "hi" });
    const out = composeSpec({ a, b }, a.sections, { variants: { a: "va", b: "vb" }, picks: parsePicks("s1b s2a"), remarks: {}, music: "a", name: "mix" });
    expect(() => parseSpec(out)).not.toThrow();
    expect(out.scenes.map((s) => s.id)).toEqual(["s1b-s1", "s1b-s2", "s2a-s3"]);
    expect(out.assets.map((x) => [x.id, x.src])).toEqual([
      ["b:a", "b/a.mp4"],
      ["b:b", "b/b.png"],
    ]);
    expect(out.sounds).toEqual([]); // b's line sits in s2, which comes from a
    expect(out.overlays[0]!.duration).toBe(20);
  });
});

describe("sound", () => {
  const spec = EditSpec.parse(base);
  test("refuses the original bed when it names the old brand", () => {
    const rebranded = { ...spec, brand: { ...spec.brand, name: "New Co", wordmark: "NEWCO" } };
    expect(audioConflicts(spec, rebranded, { text: "Old Co rules." }).length).toBeGreaterThan(0);
    expect(audioConflicts(spec, spec, { text: "Old Co rules." })).toEqual([]);
  });
  test("phrases start after pauses and full stops", () => {
    const words = [
      { text: "One.", from: 0, to: 5 },
      { text: "Two", from: 7, to: 9 },
      { text: "three", from: 10, to: 12 },
      { text: "four", from: 30, to: 33 },
    ];
    expect(phraseStarts({ text: "", words })).toEqual([0, 7, 30]);
  });
  test("music chunks are at least 3 s and end on section edges", () => {
    const long = EditSpec.parse({ ...structuredClone(base), meta: { ...base.meta, durationInFrames: 300 }, scenes: [
      { id: "x", kind: "solid", from: 0, duration: 30 },
      { id: "y", kind: "media", from: 30, duration: 100, asset: "a" },
      { id: "z", kind: "logoGlow", from: 130, duration: 170 },
    ] });
    const plan = SoundPlan.parse({ audio: "replace", music: { styles: ["calm"] } });
    const chunks = musicChunks(long, plan);
    expect(chunks.map((c) => c.duration_ms)).toEqual([5417, 7083]);
    expect(chunks.every((c) => c.duration_ms >= 3000)).toBe(true);
  });
});

describe("laptop and markFill scenes", () => {
  const spec = (): EditSpecInput => ({
    ...structuredClone(base),
    assets: [
      { id: "bg", type: "video", src: "bg.mp4", origin: "source", description: "footage", baked: ["*"] },
      { id: "shot", type: "image", src: "shot.png", origin: "brand", description: "app screen" },
      { id: "fill", type: "image", src: "fill.png", origin: "brand", description: "painting" },
    ],
    scenes: [
      { id: "l", kind: "laptop", from: 0, duration: 20, asset: "bg", shots: [{ asset: "shot" }], mark: { fills: ["fill"] } },
      { id: "m", kind: "markFill", from: 20, duration: 10, mark: { fills: ["fill"] } },
    ],
    overlays: [],
  });
  test("the footage behind a laptop decides what is baked; shots and fills do not", () => {
    const s = EditSpec.parse(spec());
    expect(bakingAssets(s.scenes[0]!)).toEqual(["bg"]);
    expect(sceneAssetIds(s.scenes[0]!)).toEqual(["bg", "shot", "fill"]);
    expect(bakedAt(s, 5).has("*")).toBe(true);
    expect(bakedAt(s, 25).size).toBe(0);
  });
  test("checks and renames reach screen shots and mark fills", () => {
    const bad = spec();
    (bad.scenes[1] as { mark: { fills: string[] } }).mark.fills = ["gone"];
    expect(checkSpec(EditSpec.parse(bad)).map((i) => i.message)).toContain('unknown asset "gone"');
    const renamed = renameSceneAssets(EditSpec.parse(spec()).scenes[0]!, (id) => `new-${id}`);
    expect(sceneAssetIds(renamed)).toEqual(["new-bg", "new-shot", "new-fill"]);
  });
  test("lint counts laptop footage as footage", () => {
    expect(lint(EditSpec.parse(spec())).frames).toEqual({ code: 10, sourceFootage: 0, newFootage: 0, verbatim: 20 });
  });
});
