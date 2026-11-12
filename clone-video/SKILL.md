---
name: clone-video
description: Reverse engineers a finished video (URL or local file) into a frame-accurate, editable Remotion EditSpec (`spec.json`), rebuilding motion graphics, typography, and UI in code while keeping filmed footage as described, swappable assets with SSIM fidelity scoring against the source. Use when asked to clone, decompile, recreate, or make an editable Remotion version of a video, reel, or launch spot.
metadata:
  version: "2.0.0"
---

# Clone a Video into an Editable Spec

Produces `./projects/<slug>/spec.json` that both:
1. **Renders frame-for-frame like the source** (verified with per-scene SSIM and
   side-by-side renders), and
2. **Is genuinely decompiled**: motion graphics, typography, UI flows, and
   effects are clean React/Remotion scenes & layers, while filmed shots are
   described, tagged, swappable assets.

Fidelity without decomposition is just a copy; decomposition without fidelity
is a different edit. Measure and report both.

`<SKILL_DIR>` below is the directory containing this `SKILL.md` (installed
beside [`remix-video`](../remix-video/SKILL.md), which holds the shared
Remotion runtime). Also apply [`remix-video` Standing Direction](../remix-video/SKILL.md#standing-direction).

## 1. Ingest and Analyze

```bash
bun <SKILL_DIR>/scripts/vrea.ts ingest "<url or file>" --project <slug>
bun <SKILL_DIR>/scripts/vrea.ts analyze <slug>            # add --transcribe when there is speech
```

Inspect in order:
1. `./projects/<slug>/analysis/report.md` — shot table, frame ranges, cut scores, BPM & onset count
2. `./projects/<slug>/analysis/shots.png` — one labeled keyframe per detected shot
3. `./projects/<slug>/analysis/sheets/*.png` — every Nth frame labeled `f<n>`
4. `./projects/<slug>/analysis/audio.json` — per-frame RMS, onset frames, beat period

For rapid-fire edits (1–3 frame holds), use `analysis/beats.json` rather than
`shots.json`: `beats.json` splits on pixel-level frame differences that
`ffmpeg`'s scene filter smooths over. Watch the contact sheets for what hard-cut
detection misses: intra-shot text/panel builds, dissolves, 1–3 frame glitch
blips (one asset + a `glitch` layer, not separate assets), and whip-pan blur.

**Done:** you have a frame-exact beat list (`from`, `duration`, what is on screen).

## 2. Classify Every Beat

Consult [`references/scene-kinds.md`](references/scene-kinds.md) for the full
catalog of 18 built-in scene kinds and 12 layer kinds (authoritative Zod schema
in `../remix-video/runtime/src/spec/schema.ts`).

- **Filmed or stock footage**: `media` scene playing a source cut (`origin: "source"`),
  with a concrete `description` (subject, framing, lighting, palette) and role
  `tags` (`montage`, `hero`, `negative`, `keep`, etc.).
- **Motion graphics & product UI**: rebuild in code (`stage`, `promo`, `taskFeed`,
  `panelCollage`, `cardCollage`, `codeScroll`, `iconSwarm`, `halftoneRing`,
  `markMorph`, `markFill`, `logoFlash`, `logoGlow`, `pixelWipe`, `endCard`). If a
  recurring visual pattern has no scene kind yet, extend `schema.ts` +
  `src/remotion/scenes/` rather than leaving it verbatim.
- **Overlays on footage** (captions, labels, letterbox bars, detector boxes,
  color grades, horizon arcs, code annotations): attach layers with a `key` and
  list that `key` in the source asset's `baked` array. The clone displays the
  authentic source pixels without double-drawing, while any clean replacement
  shot automatically gets the code-drawn overlay.
- **Screens inside photography** (a monitor or laptop in a filmed scene): use
  `screen` (measured 0..1 glass box + live typed `script`) or `laptop` (3D-angled
  code-drawn laptop over blurred/dimmed footage).
- **Brand-bearing assets** (logos, product screenshots, team/event photos):
  extract via `source-crop` and tag `brand:lockup`, `brand:screenshot`, or
  `brand:photo` so `rebrand-video` can target them automatically.
- **Sections (`sections`)**: group scenes into named narrative beats (`open`,
  `problem`, `demo`, `montage`, `end-card`) tiling the timeline on scene
  boundaries. In rapid montages, make each multi-frame hold its own section and
  each rush between holds its own section.

**Done:** every beat has a scene kind, every asset has a description + tags, and
sections tile the timeline.

## 3. Measure Pixels — Never Guess Coordinates

Extract reference frames and measure exact bounds and colors with `ffmpeg` and
ImageMagick:

```bash
ffmpeg -v error -y -i ./projects/<slug>/source/source.mp4 -vf "select=eq(n\,<frame>)" -frames:v 1 /tmp/f.png
magick /tmp/f.png -threshold 40% -format '%@' info:          # bounding box WxH+X+Y
magick /tmp/f.png -crop 1x1+<X>+<Y> txt:                     # exact hex color sample
```

Composition dimensions round source dimensions to even integers (`1916 -> 1920`).
In `text` layers, `y` is the vertical center and `align` (`left` / `center` /
`right`) anchors `x`.

**Done:** crops, font sizes, palette hexes, and coordinates trace to measured frames.

## 4. Build, Extract, and Check `spec.json`

Start from a scaffold or write a clean `./projects/<slug>/build-spec.ts` generator
script so coordinates and frame math stay readable and repeatable:

```bash
bun <SKILL_DIR>/scripts/vrea.ts scaffold <slug>   # optional verbatim baseline
# edit spec.json (or run your build-spec.ts), then materialize source media & lint:
bun <SKILL_DIR>/scripts/vrea.ts extract <slug>
bun <SKILL_DIR>/scripts/vrea.ts check <slug>
```

Ensure `check` passes with zero unexplained `baked`-key or missing-description
warnings.

## 5. Compare Frame-by-Frame and Iterate

```bash
bun <SKILL_DIR>/scripts/vrea.ts frame <slug> 3 25 80 130 205 245   # [source | render] PNGs
bun <SKILL_DIR>/scripts/vrea.ts compare <slug> --render            # per-scene SSIM + side-by-side MP4
```

Inspect `./projects/<slug>/renders/frames/clone_f*.png` visually — SSIM alone
cannot catch a wrong icon silhouette or clipped word. Iterate on the
lowest-scoring rebuilt scenes first:
- Verbatim / source-cut scenes: target SSIM ≥ `0.95`
- Rebuilt typography / UI / layout scenes: target SSIM ≥ `0.80`
- Seeded procedural fields (particles, halftone, datamosh): verify visual energy
  and density side-by-side at playback speed.
- Never invent extra camera motion on a clone; save motion variation for
  `vary-video`.

## 6. Report with Full Real Paths

Report every output using its full absolute filesystem path (`realpath`):
- `./projects/<slug>/spec.json`
- `./projects/<slug>/renders/clone.mp4`
- `./projects/<slug>/renders/clone.side-by-side.mp4`
- Overall SSIM + per-scene breakdown, code-graphics vs. footage percentage from
  `vrea check`, and next steps (`rebrand-video`, `vary-video`, `compose-video`).
