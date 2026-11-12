---
name: video-tools
description: Production tool router and bundled script kit for the video-rea suite — covers when and how to use headless Blender Cycles renders from real scientific data (`scripts/holds/`), open archive imagery, Pierre code diffs & file trees (`@pierre/diffs`, `@pierre/trees`), Pexels stock, fal.ai generation, ElevenLabs audio, beat-locked music cutting (`scripts/music/edit.ts`), band-matched montage cut sounds (`scripts/music/cuts-mix.ts`), frame-sync verification (`scripts/music/check-sync.ts`), ffmpeg, and ImageMagick. Use when choosing how to build a shot or sound, rendering from real data in Blender, or checking audio/picture sync.
metadata:
  version: "2.0.0"
---

# Video Production Tools & Bundled Scripts

The workflow skills (`remix-video`, `clone-video`, `rebrand-video`, `vary-video`,
`compose-video`) define *what* to build; this skill defines *which tool* produces
each asset so nothing looks like generic stock or AI slop, and ships the
headless Blender & audio-sync scripts in `<SKILL_DIR>/scripts/`.

## 1. Pick the Right Tool for Every Shot

Core rule: **real beats generated.** Viewers spot synthetic AI stills and generic
stock photos immediately whenever a shot holds for 4+ frames. Sort `spec.json`
scenes by `duration` descending first and give your longest holds the highest
craft.

| Shot Type | Right Tool |
| --- | --- |
| Held 4+ frames, scientific / structural / software-feel subject (molecules, tractography fibres, earthquake globes, terrain relief, crystal lattices, N-body galaxies) | **Blender Cycles** render of real public data (`<SKILL_DIR>/scripts/holds/`) |
| Held 4+ frames, authentic photography or historical diagram (space telescopes, satellite Earth, SEM microscopy, patent drawings, botanical/anatomical plates) | **Open archive image** (Wikimedia Commons, NASA/ESA, USGS, Google Patents, Wellcome — ≥ 2000 px long edge, license recorded in `credits.json`) |
| Real-world human/environment motion in a footage edit | **Pexels** stock video (`as: "stock"` in `vary`) |
| Product UI, feature panels, integration icons | **Code-drawn Remotion UI** (`stage`, `promo`, `taskFeed`, `PanelUi` widgets, Lucide `glyph`s) + crisp 2x product captures |
| Any code diff, source file change, or repository file tree | **Pierre** (`@pierre/diffs` and `@pierre/trees`) — never hand-drawn `+`/`-` boxes |
| 1–3 frame flashes in rapid stills montages, or explicitly requested stylized/conceptual art | **fal.ai** (`vrea.ts fal search`, `vary`) |

---

## 2. Headless Blender Renders from Real Data (`<SKILL_DIR>/scripts/holds/`)

A Cycles render of real measured coordinates has true, non-repeating structure
that no diffusion model can fake. `<SKILL_DIR>/scripts/holds/studio.py`
auto-detects `METAL` / `OPTIX` / `CUDA` / `HIP` / `ONEAPI` GPU backends (with
clean CPU fallback), configures AgX color management, a flat camera backdrop
with independent soft sky lighting, area lights, hair-curve `fibres()`, and
Geometry Nodes sphere clouds (`points()`).

Bundled shot templates (run with `blender -b -P <SKILL_DIR>/scripts/holds/<script>.py -- ...`):
- `lattice.py <out_dir> [samples]` — diamond carbon unit-cell crystal slab with cobalt hair-curve bonds and shallow DOF (needs zero external files).
- `mol.py <structure.cif> <out_dir> <m060|m103|m181> [samples]` — space-filling RCSB PDB mmCIF structures (`files.rcsb.org/download/<ID>.cif`, CC0) oriented along principal axes.
- `quakes.py <usgs_csv_dir> <out_dir> [samples]` — USGS M4+ earthquake epicenters (`earthquake.usgs.gov/fdsnws/event/1/query?format=csv`) plotting tectonic boundaries on a matte globe without drawn coastlines.
- `planet.py <out_dir> <moon|m058|m186> <color_map> <height_map> [samples]` — displaced Moon/Earth globes from NASA CGI Moon Kit (SVS 4720) or Blue Marble + ETOPO elevation maps.
- `relief.py <elevation.npy> <out_dir> [samples]` — cast-plaster museum terrain block from SRTM / AWS Terrain Tiles (`s3.amazonaws.com/elevation-tiles-prod/terrarium/z/x/y.png`, `elev = R*256 + G + B/256 - 32768`).
- `sim_galaxies.py <out.npz> [steps]` + `galaxies.py <out.npz> <out_dir> [snapshot] [samples]` — Toomre & Toomre restricted three-body parabolic galaxy encounter rendered as 180,000 emissive stars on black.

Fast Blender workflow:
1. Batch-preview candidate shots at `32` samples first and review on one contact sheet; final-render keepers at `96–128` samples.
2. Always call `studio.reset()` before creating geometry (it loads empty factory settings).
3. Animate the camera rather than heavy meshes (`render.use_persistent_data = True` is enabled by `studio.reset()` so the BVH builds once).
4. Under AgX, a linear backdrop `(0.88, 0.88, 0.88)` renders as warm mid-light stone (`~#C0C0BD`); push above `1.0` only when you want bright paper white, and keep emissive star strengths near `0.9–1.0` so colors don't clip to white.

---

## 3. Open Archive & Scientific Data Sources

Record every downloaded archive asset in `./projects/<slug>/holds/credits.json`
(`title`, `url`, `license`, `attribution`) and include required CC BY / CC BY-SA
credits.
- **Wikimedia Commons API**: query `action=query&prop=imageinfo&iiprop=url|size|extmetadata&format=json` with a descriptive generic `User-Agent`.
- **Space & Earth**: NASA Images API (`images-api.nasa.gov`), NASA SVS, Earth Observatory, ESA/Webb full-resolution releases (CC BY 4.0), USGS Landsat.
- **Historical & Technical**: Google Patents drawings (public domain; crop patent header margins), Biodiversity Heritage Library, Wellcome Collection SEM micrographs (CC BY 4.0).

---

## 4. Pierre Diffs & File Trees (`@pierre/diffs`, `@pierre/trees`)

Whenever a custom scene renders a pull request diff, code patch, or file tree:
- Install `@pierre/diffs` and/or `@pierre/trees` in `<SKILL_DIR>/../remix-video/runtime` if adding a custom scene component.
- Render diffs with `MultiFileDiff` or `PatchDiff` (`@pierre/diffs/react`) using `pierre-light` or `pierre-dark` to match `spec.brand.palette`.
- Render trees with `useFileTree({ paths })` + `<FileTree model={model} />` (`@pierre/trees/react`) and built-in `gitStatus` markers.
- Syntax highlighting is async: wrap with Remotion's `delayRender()` / `continueRender()` on `onPostRender` (or preload via `/ssr`) so frame 0 never captures unhighlighted text.
- Full docs: `https://diffs.com/llms-full.txt` and `https://trees.software/llms-full.txt`.

---

## 5. Audio Cutting, Per-Cut Montage Sounds & Sync Verification (`<SKILL_DIR>/scripts/music/`)

All three bundled audio scripts run natively in **Bun + `ffmpeg`** with zero
external npm or Python packages required:

### A. Cut a music take onto bar lines (`edit.ts`)

Generated music models often drift across planned section timestamps. Generate a
take at your edit's BPM, then lock its downbeat onto your first big visual hit
(with a low-pass intro filter sweep, an end-card dip, a final wordmark downbeat +
stereo reverb ring-out, and `-14 LUFS / -1.5 dBTP` loudness mastering):

```bash
bun <SKILL_DIR>/scripts/music/edit.ts take.mp3 music-edited.m4a \
  --bpm 164 --fps 30 --frames 642 --hit-frame 25 --end-card-frame 488
```

### B. Mix faint, band-matched per-cut sounds on rapid montages (`cuts-mix.ts`)

On 1–3 frame montage rushes, subtle per-cut sounds make the visual flicker tactile
without sounding noisy. `cuts-mix.ts` measures the music's RMS **inside the
effect's own frequency band** over the 30 ms following each cut and places each
take at **`-7 dB` in-band by default** (`+2 dB` entering/leaving 4+ frame holds,
`+3 dB` on isolated cuts so sync is clearly perceived, truncated 20 ms after the
next cut so 1-frame runs stay crisp taps instead of buzzing). Synthesizes clean
takes automatically (`ticks`, `glock`, `celesta`, `marimba`, `pops`, `ping`,
`detent`, `chirp`, `glitch`) or loads custom WAVs from `--sfx-dir`:

```bash
bun <SKILL_DIR>/scripts/music/cuts-mix.ts music-edited.m4a ticks music-with-ticks.wav \
  --spec ./projects/<slug>/spec.json [--changes ./projects/<slug>/changes.json]
```

### C. Measure picture-to-sound sync & mux offset (`check-sync.ts`)

Never guess whether audio is in sync — measure the rendered video:

```bash
bun <SKILL_DIR>/scripts/music/check-sync.ts ./projects/<slug>/renders/clone.mp4 \
  --spec ./projects/<slug>/spec.json \
  --mix music-with-ticks.wav --muxed ./projects/<slug>/renders/final.mp4
```

Reports `unsounded_changes` (intra-scene visual builds to inspect on a contact
sheet and add to `changes.json` if genuine), `sounds_on_still_frames`, and
`mux_offset_ms` (target `< 10 ms`; sound may trail picture by a few ms, never lead).

---

## 6. Essential `ffmpeg` & ImageMagick Recipes

- **Mux new audio without re-encoding video** (with limiter + `-14 LUFS` loudnorm):
  ```bash
  ffmpeg -y -i video.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy \
    -af "alimiter=limit=0.82:level=false,loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 256k out.mp4
  ```
- **Extract an exact frame range `[A..B]` in one pass**:
  ```bash
  ffmpeg -v error -y -i video.mp4 -vf "select='between(n\,A\,B)'" -fps_mode passthrough -start_number A /tmp/f_%04d.png
  ```
- **Labeled contact sheet** (quick visual QA across cuts & transitions):
  ```bash
  ffmpeg -v error -y -i video.mp4 -vf "fps=2,scale=480:-1,tile=6x6:padding=2:color=0x222222" -frames:v 1 sheet.png
  ```

## 7. API Keys & Environment

Set keys via standard environment variables or a `.env` file in your working
directory (copy `<SKILL_DIR>/../remix-video/runtime/.env.example` to `.env`):
- `FAL_KEY` (or `VREA_FAL_OP_REF` 1Password `op://...` reference, resolved in memory via `op read`)
- `PEXELS_API_KEY` (or `VREA_PEXELS_OP_REF`)
- `ELEVENLABS_API_KEY` (or `VREA_ELEVENLABS_OP_REF`)

Never hardcode or print secret values in specs, plans, or logs.
