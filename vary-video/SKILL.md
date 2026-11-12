---
name: vary-video
description: Creates distinct variants of a cloned video edit: swaps shots for licensed Pexels stock clips, local data renders, or fal.ai stills/clips on a cohesive world theme, re-seeds and jitters procedural animations, remixes coded scene layouts and motifs, and updates copy while preserving exact frame timing. Use when asked for variations, A/B versions, alternate worlds, or new shots in an existing edit spec.
metadata:
  version: "2.0.0"
---

# Vary a Cloned Video

A strong variant keeps the edit's structural timing and emotional arc while
changing all four creative dials together:
1. **Shots (`swaps`)**: replace footage assets with licensed Pexels stock clips
   (`as: "stock"`), real-data/archive files (`as: "file"`), or fal.ai stills &
   clips (`as: "image"` / `as: "video"`).
2. **Motion (`motion`)**: new deterministic seeds for procedural scenes/layers
   plus bounded camera/pan/push jitter (`0..1`).
3. **Copy (`text`)**: exact phrase replacements across layers, overlays, UI
   panels, transcripts, and stage elements.
4. **Scene design (`remix`)**: alternate layouts, motifs, patterns, backdrops,
   code-drawn `ui` panels, Lucide `glyph` icons, and text entrances.

`<SKILL_DIR>` below is the directory containing this `SKILL.md` (installed
beside [`remix-video`](../remix-video/SKILL.md) and [`video-tools`](../video-tools/SKILL.md)).
Long holds (4+ frames on screen) should come from real data in Blender, open
archives, or real stock clips rather than synthetic AI stills — see
[`video-tools`](../video-tools/SKILL.md).

## 1. Draft the Variant Plan

Base variants on a rebrand (`--base <brand-variant>`) when rebranding so every
variant inherits the target brand's palette, fonts, and mark:

```bash
bun <SKILL_DIR>/scripts/vrea.ts vary <slug> --name <variant> --draft [--base <brand-variant>]
```

Writes `./projects/<slug>/variants/<variant>/plan.json`.

## 2. Write Concrete World-Cohesive Prompts & Remixes

Inspect `./projects/<slug>/analysis/shots/` first, then replace template prompts
in `plan.json` with one unified visual world per variant (for example,
`"precision instrument workshop"`, `"observatory & orbital telemetry"`, or
`"living biological systems"`):

- **Photographic footage (`as: "stock"`)**: prefer real Pexels video/photo
  picks (`"as": "stock", "query": "watchmaker macro gears moody light"`). Real
  clips move like cinema and cost `$0`. Use `"nth": 1` to step to the next
  candidate; `vrea` guarantees no Pexels asset repeats within a variant.
- **Local renders or archive plates (`as: "file"`)**: point `"file"` at a
  Blender Cycles render or high-res open-archive image.
- **Generated stills & clips (`as: "image"` / `"video"`)**: describe the
  *natural, ungraded* plate — color grades (`invert`, `grayscale`), letterbox
  bars, captions, and detector boxes are applied in code over the clean plate.
  Set `"reference": false` when breaking cleanly into a new visual world; add
  `"motionPrompt"` on `"video"` swaps.
- **Rapid-fire montages (100+ cuts)**: group beats by `family:<NAME>` and build
  `plan.json` from a script: one detailed medium/lens/ground brief per family +
  one concrete `Subject:` per beat. Never append a global "mood" sentence to
  every prompt (image models paint literal props like notebook paper everywhere;
  express the world through subject selection instead). Before large runs, A/B
  4–6 prompts across two endpoints (e.g. `bytedance/seedream/v5/pro/text-to-image`
  for photographic/3D families vs. `fal-ai/nano-banana-pro` for ink/CAD/print
  families) and set `"endpoint"` + `"input"` per swap. Keep zoom at `1` on 1–3
  frame flashes.
- **Code-drawn UI & Scene `remix`**: draw text-heavy product panels in code
  (`ui`: `diff`, `bars`, `chips`, `toggles`, `grid`, `timeline`, `chart`,
  `invite`, `flow`) and icons via Lucide `glyph` names rather than rasterizing
  text with an image model:

```json
"remix": [
  { "scenes": "kind:logoFlash", "set": { "style": "iris" } },
  { "scenes": "kind:panelCollage", "set": { "layout": "stack" } },
  { "scenes": "kind:halftoneRing", "set": { "motif": "sphere" } },
  { "scenes": "kind:iconSwarm", "set": { "pattern": "orbit" } },
  { "scenes": "kind:cardCollage", "set": { "layout": "fan", "backdrop": "honeycomb" } },
  { "scenes": "*", "layers": { "kind": "text", "set": { "enter": "rise" } } }
]
```

Tag any asset `"keep"` in `spec.json` if future `--draft` runs should leave it untouched.

## 3. Estimate Cost and Generate

```bash
bun <SKILL_DIR>/scripts/vrea.ts vary <slug> --name <variant> --dry-run
bun <SKILL_DIR>/scripts/vrea.ts vary <slug> --name <variant>
```

Check live fal models anytime with `bun <SKILL_DIR>/scripts/vrea.ts fal search <query>`
and `https://fal.ai/models/<endpoint>/llms.txt`. State estimated cost to the
user before runs over ~$5. Every request writes `*.receipt.json` before polling,
so interrupted runs resume cleanly without double-billing.

If the variant already has a `sound.json`, re-run `vrea.ts sound <slug> --variant <variant>`
afterward to re-attach cached VO/SFX/music onto the regenerated `spec.json`.

## 4. Visual QA and Render

```bash
bun <SKILL_DIR>/scripts/vrea.ts check <slug> --variant <variant>
bun <SKILL_DIR>/scripts/vrea.ts frame <slug> 10 60 140 220 --variant <variant>
bun <SKILL_DIR>/scripts/vrea.ts render <slug> --variant <variant>
```

Inspect every swapped shot (for montages, build per-family contact sheets with
`magick montage`). Regenerate any still with garbled text, repeated subjects, or
plastic AI artifacts by updating its prompt, deleting its `*.still.*`/`*.clip.*`
in `./projects/<slug>/media/variants/<variant>/`, and rerunning `vary`.

## 5. Report with Full Real Paths

Report full absolute paths (`realpath`) for `./projects/<slug>/variants/<variant>/spec.json`
and `./projects/<slug>/renders/<variant>.mp4`, the swap summary, models/endpoints
used, and total generation cost.
