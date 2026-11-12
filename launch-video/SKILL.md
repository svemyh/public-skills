---
name: launch-video
description: Creates a 1080p60 dark-stage product launch film from two inputs — an X post (URL or text) and a website URL or brand profile — using a self-contained Remotion template. Honeycomb hex mosaic open, brand lockup, headline-over-product-capture feature beats with ecosystem hex tiles, giant statement card, CTA card with pointer click, honeycomb burst, typed domain outro, and an automatic beat-matched soundtrack. Use when asked to make a launch video from a post and a site, turn a feature thread into a product launch spot, or render a brand launch video.
metadata:
  version: "1.1.0"
---

# Launch Video

Turns an X post (URL or text) plus a brand's website (or saved `brand.json`
profile) into a 25–40 second `1920x1080` 60 fps H.264 launch film with audio.
All creative choices live in two small JSON files (`brand.json` and
`launch.json`); compilation, layout, soundtrack synthesis, and Remotion
rendering are deterministic.

## Prerequisites

- [Bun](https://bun.sh) (`bun >= 1.1`)
- `ffmpeg` and `ffprobe` on `PATH` (for H.264/AAC encoding, loudnorm mastering, and contact-sheet inspection)
- ImageMagick (`magick` on `PATH`, recommended for WebP conversion, alpha trimming, and window crops)

`<SKILL_DIR>` below refers to the directory containing this `SKILL.md` (for
example `~/.claude/skills/launch-video` or `~/.agents/skills/launch-video`).

## End-to-End Workflow

### 1. Read the X post (if given a URL)

```sh
bun <SKILL_DIR>/scripts/post.ts "https://x.com/<handle>/status/<id>"
```

Fetches the post text, author, stats, and attached media via the public
fxtwitter endpoint (no login or API key needed).

### 2. Bootstrap or load the brand profile (`brand.json`)

If you already have a curated `brand.json`, reuse it. When pointed at a live
website (for example `https://fomo.family` or `https://acme.dev`), bootstrap a
brand folder first:

```sh
bun <SKILL_DIR>/scripts/bootstrap.ts "https://fomo.family" --out ./work/brand
```

Then **curate `./work/brand/brand.json` visually** (do not skip this step):
1. **Mark (`mark`)**: Inspect `inline-*.svg`, `favicon.svg`, and `mark.png`. The
   stage is dark (`#000000` or the site's dark ground such as `#060510`), so
   `mark` **must be white/light on a transparent background** (`PNG32` or
   `SVG`). If the site's icon sits on an opaque dark square, extract the light
   mark onto transparency with ImageMagick (`magick raw.png -colorspace gray -level 6%,92% alpha.png && magick -size WxH xc:white alpha.png -compose CopyOpacity -composite -trim +repage PNG32:mark-white.png`) and inspect a preview swatch.
2. **Screens (`screens`)**: View every downloaded image in `screens/` (or capture
   live product routes at `2x` DPI with headless Playwright). Keep only real
   product UI shots (4–8 screens), delete decorative background textures, and
   write an accurate `description` for each screen. Add `crop: {x, y, w, h}` if
   a desktop screenshot has outer wallpaper margins. Transparent PNGs (floating
   phones, cards, notifications) are automatically trimmed and rendered
   frameless.
3. **Partner/ecosystem logos (`logos`)**: Add crisp SVG/PNG icons for any
   platforms, chains, models, or tools referenced in the beats (`logos/x.svg`,
   `logos/apple.svg`, `logos/slack.svg`, etc.). Set `"fill": "#F2F2F2"` on dark
   monochrome raster icons so they stand out on hex tiles.
4. **Palette & CTA**: Confirm `palette.bg`, `palette.fg`, `palette.accent`,
   `mosaicColors` (6–10 brand accents + neutral slates, no purple gradients),
   `website` (bare domain, e.g. `"fomo.family"`), and `cta` (`big`, `title`,
   `body`, `button`).

### 3. Write `launch.json`

```json
{
  "brand": "./brand/brand.json",
  "open": { "tagline": "Where traders become legends." },
  "beats": [
    { "id": "spot", "headline": "See it on X, trade it.", "screen": "desktop-terminal", "hexes": ["x", "solana"] },
    { "id": "social", "headline": "Follow what top traders buy.", "screen": "social-feed" },
    { "id": "alerts", "headline": "Real-time alerts before it moves.", "screen": "live-alerts" },
    { "id": "sync", "headline": "Phone to desktop, in sync.", "screen": "desktop-and-phone" },
    { "id": "fund", "headline": "Fund instantly with Apple Pay.", "screen": "apple-pay", "hexes": ["apple", "solana", "base"], "hexLayout": "top" }
  ],
  "cta": {},
  "outro": { "seconds": 6.5 },
  "music": "profile"
}
```

Rules for sharp beats (see [`references/format-guide.md`](references/format-guide.md)):
- **Tagline (`open.tagline`)**: 5 words or fewer naming what the product is.
- **4 to 6 beats**: Lead with the X post's hook on Beat 1, then walk through
  concrete product surfaces. Keep each headline to 2–5 words ending in a period
  so it stays on a single line at `64 px`.
- **Exact screen match**: Every headline must match what is visibly shown in its
  `screen`. Never pair a headline with an unrelated screenshot.
- **Hex layout (`hexLayout`)**: `"auto"` (default: 3 logos stack cleanly on the
  `left`; 1–2 sit on `sides`), `"top"` (horizontal row above a `y = 340`
  capture), or `"sides"`.
- **Audio (`music`)**: `"profile"` uses `brand.json`'s `music` file when set and
  otherwise synthesizes a beat-matched 92 bpm minimal-electronic bed mastered to
  `-15 LUFS`; `"synth"` always synthesizes; `"none"` renders silent; or pass a
  path to a custom `.m4a`/`.mp3`/`.wav`.

### 4. Render a fast draft, inspect frames, then render full 1080p60

```sh
# Half-scale draft for visual QA (~20-40s)
bun <SKILL_DIR>/scripts/render.ts ./work/launch.json --out ./work/draft.mp4 --scale 0.5
ffmpeg -v error -y -i ./work/draft.mp4 -vf "fps=1,scale=480:-1,tile=6x6:padding=2:color=gray" -frames:v 1 ./work/draft-sheet.png
```

Inspect `./work/draft-sheet.png` and full frames of key beats:
- Frame 0 shows the edge-to-edge honeycomb mosaic; the lockup mark is crisp and visible on the dark stage.
- Every headline fits on one line with wide margins and matches its capture.
- Transparent product renders float cleanly without a gray border box; hex tiles have clean breathing room from the capture.
- The CTA cursor lands cleanly on the pill button on the click frame.
- The outro bursts from a full honeycomb wall and holds the typed domain cleanly.

Fix any copy, crop, or layout issue in `brand.json` / `launch.json`, then render
at full `1920x1080` 60 fps quality:

```sh
bun <SKILL_DIR>/scripts/render.ts ./work/launch.json --out ./work/launch.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 ./work/launch.mp4
```

Report the full absolute path of `./work/launch.mp4` and the beat table.
