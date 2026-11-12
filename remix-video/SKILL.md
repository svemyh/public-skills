---
name: remix-video
description: End-to-end video reverse-engineering and remix workflow. Takes a source video (URL or file), clones it into a frame-accurate Remotion edit spec, rebrands it to a target brand kit, builds distinct variants with real stock footage, code-drawn product UI, and ElevenLabs sound, then renders a labeled review board and a keyboard section picker to compose the final cut. Use when asked to remake a video for another product or brand, create A/B variants of an edit, or run clone, rebrand, vary, and compose end to end.
metadata:
  version: "2.0.0"
---

# Remix a Video, End to End

> **This skill is detailed on purpose.** It carries the standing creative,
> typographic, motion, UI-fidelity, and sound direction gathered across dozens
> of real product launch and brand video remakes so an agent produces
> feed-stopping cuts on the first render instead of learning through rounds of
> preventable fixes. Apply [Standing Direction](#standing-direction) to every
> video, whichever workflow started it (`remix-video`, `clone-video`,
> `rebrand-video`, `vary-video`, or `compose-video`).

One source video in; a branded clone, three distinct variants, a labeled review
board, and a section-by-section composed cut out.

`<SKILL_DIR>` below refers to the directory containing this `SKILL.md` (for
example `~/.claude/skills/remix-video` or `~/.agents/skills/remix-video`). Its
bundled Remotion 4 + CLI runtime lives in `<SKILL_DIR>/runtime` and installs its
npm dependencies automatically on first run. Projects are written into
`./projects/<slug>/` in your current working directory (override with
`VREA_PROJECTS_DIR`, or pass an explicit path like `./work/my-reel`).

## Prerequisites

- [Bun](https://bun.sh) (`bun >= 1.1`)
- `ffmpeg` and `ffprobe` on `PATH`
- ImageMagick (`magick` on `PATH`, for labeled shot & frame contact sheets)
- `yt-dlp` on `PATH` when ingesting URLs (X, YouTube, Instagram, Vimeo, etc.)
- Optional API keys in `.env` or environment (only needed for the stages that
  call them; see `<SKILL_DIR>/runtime/.env.example`):
  - `PEXELS_API_KEY` (or `VREA_PEXELS_OP_REF` 1Password reference) — free real stock clips & photos
  - `FAL_KEY` (or `VREA_FAL_OP_REF`) — generated stills & image-to-video clips on fal.ai
  - `ELEVENLABS_API_KEY` (or `VREA_ELEVENLABS_OP_REF`) — word-level transcription, voice-over, SFX, and music

## Architecture Concepts That Must Stay True

1. **The spec is the interface.** CLI commands read and write `EditSpec` JSON
   (`<SKILL_DIR>/runtime/src/spec/schema.ts`); Remotion (`<SKILL_DIR>/runtime/src/remotion/`)
   only renders specs. Add reusable scene capabilities in `schema.ts` +
   `src/remotion/scenes/`, never by hard-coding one project in a shared component.
2. **Frames, not seconds.** Every timestamp in `spec.json` is an integer frame
   at `meta.fps`. Scenes tile `0..durationInFrames` with zero gaps or overlaps;
   `vrea check` enforces it.
3. **Baked vs. code-drawn (`baked`).** A source cut already has captions,
   letterbox bars, or color grades burned into its pixels. Listing those layer
   `key`s in the asset's `baked` array (`["*"]` = verbatim source cut) tells
   Remotion to skip drawing them over the source clip while drawing them cleanly
   in code over any replacement shot from `rebrand` or `vary`.
4. **Descriptions drive variation.** Every swappable footage asset carries a
   factual `description` (subject, framing, lighting, camera move) that seeds
   stock queries and generation prompts.
5. **Palette-driven colors.** Components draw from `spec.brand.palette` (`bg`,
   `fg`, `accent`, `muted`) via `alpha()`, never hardcoded black or white, so
   both dark-stage and editorial light-paper rebrands work cleanly.
6. **Determinism.** Procedural scenes and layers use Remotion's seeded
   `random(seed)`; variants re-seed explicitly.

## Running the Pipeline

`vrea.ts pipeline` executes every stage whose inputs are ready and stops with a
`NEXT:` prompt at the first stage requiring creative or structural judgment.
Run it, complete the `NEXT` step, and run it again:

```bash
bun <SKILL_DIR>/scripts/vrea.ts pipeline <slug> --url "<video url or file>" --brand ./brand.json
bun <SKILL_DIR>/scripts/vrea.ts pipeline <slug> --brand ./brand.json --variants a=brand-one,b=brand-two,c=brand-three
bun <SKILL_DIR>/scripts/vrea.ts pipeline <slug> --brand ./brand.json
```

Pass `--no-rebrand` if you want variants in the source video's original brand
identity, or test with `--brand examples/brands/acme/brand.json` (bundled inside
`<SKILL_DIR>/runtime/`). Which tool makes each shot or sound lives in
[`video-tools`](../video-tools/SKILL.md).

## Pick the Track First

Inspect `analysis/report.md` and `analysis/beats.json` right after ingest:

- **Footage & UI edit** (tens of shots, coded motion graphics, product UI,
  speech): photographic shots become real Pexels stock (`as: "stock"`), product
  panels and icons are drawn in code (`ui` panels, Lucide `glyph`s, or real
  product captures), and each variant gets matched sound unless the original
  instrumental bed fits. Avoid AI-generated stills for ordinary photography —
  they read as synthetic immediately.
- **Rapid-fire stills montage** (hundreds of 1–3 frame cuts): group every beat
  into a visual family (`family:<NAME>`: ink sketch, studio render, specimen on
  black, satellite/aerial, patent drawing, CAD), write one detailed medium brief
  per family plus one concrete subject per beat from a builder script
  (`build-spec.ts` + `build-plans.ts`), A/B 4–6 prompts across two models first,
  and render any hold of 4+ frames from real scientific data in Blender or open
  archives (see [`video-tools`](../video-tools/SKILL.md)).

## Stages and What Each `NEXT` Asks of You

1. **Source & analysis**: automatic (`yt-dlp`/copy, cut scores, frame-diff
   `beats.json`, shot keyframes, labeled contact sheets, BPM/onsets, and
   word-timed transcript when `ELEVENLABS_API_KEY` or `FAL_KEY` is set).
2. **Decompile (`spec.json`)**: the pipeline drafts a verbatim scaffold, then
   pauses. Follow [`clone-video`](../clone-video/SKILL.md): rebuild motion
   graphics with scene kinds (`stage`, `promo`, `taskFeed`, `panelCollage`,
   `markMorph`, `codeScroll`, `iconSwarm`, `halftoneRing`, `screen`, `laptop`,
   `endCard`, etc.), describe and tag footage, record `baked` keys, and add
   named `sections` so a reviewer can pick beat by beat. Prefer a repeatable
   `projects/<slug>/build-spec.ts` script. Verify with `vrea.ts compare <slug> --render`.
3. **Rebrand**: applies `--brand <kit.json>` (or `projects/<slug>/brand.json`).
   Supply real product screenshots in `replace` and regenerate burned-in
   captioned shots via `"baked:caption"` in `generate`. Follow
   [`rebrand-video`](../rebrand-video/SKILL.md).
4. **Variants**: pass `--variants a=...,b=...,c=...`. Rewrite each drafted
   `variants/<name>/plan.json` per [`vary-video`](../vary-video/SKILL.md):
   - give each variant its own cohesive world, copy angle, and motion seed;
   - use `as: "stock"` with crisp Pexels queries for photographic footage;
   - draw UI cards in code (`ui`) and crisp icons (`glyph`) via `remix`;
   - vary coded scene layouts, motifs, patterns, and text entrances via `remix`.
5. **Sound**: when the original audio is instrumental (or its speech still fits),
   use `{"audio": "keep", "duck": 1}`. When speech names the old brand or old
   copy (`vrea sound` enforces this automatically), write `sound.json` per
   [`compose-video`](../compose-video/SKILL.md) step 3. For rapid 1–3 frame
   montages, also mix subtle `-7 dB` in-band cut sounds via
   `video-tools/scripts/music/cuts-mix.ts`.
6. **Review board & keyboard picker**: the pipeline renders `renders/board.mp4`
   with section codes (`s1a`, `s2b`, `s3c`) on every tile. Start the local
   section picker and share its URL:

   ```bash
   bun <SKILL_DIR>/scripts/vrea.ts pick <slug> --port 3160
   ```

   Reviewers choose per section with `a`/`b`/`c`, leave remarks with `r`, and
   press `Enter` to compose — or hand you a pick string (`"s1a s2b s3c"`) to
   run `vrea.ts compose <slug> --picks "s1a s2b s3c"`.
7. **Remarks & beat-aligned cuts**: address section remarks in that variant's
   plan/remix/sound, rerun `pipeline`, and re-compose. To drop a section cleanly
   afterwards, cut on whole music beats with 6 ms audio crossfades (see
   [`compose-video`](../compose-video/SKILL.md) step 6).

---

## Standing Direction

Apply these rules **before** the first render unless the user explicitly asks
for the opposite on a specific shot.

### 1. Framing and Copy

- **Reframe the story to the target product's real positioning — never just swap
  logos and colors.** Keep the source video's pacing, visual rhythm, and story
  arc, while mapping every beat's meaning to what the new product actually does
  (for example, "one photo to an ad campaign" becomes "one Slack thread to a
  merged pull request").
- **Concrete use cases beat vague slogans.** Show specific, believable work
  across the product's real surface area (shipping an A/B-tested feature,
  closing a CVE, triaging customer threads in Slack, scheduling launch posts,
  fixing a flaky CI suite) rather than thin clichés like "Ship dark mode" or
  invented dollar figures ("$2B saved").
- **Fewer, shorter lines.** Cut repetitive "what if your tool could…" lists down
  to one or two sharp hooks. Keep on-screen text scannable in a single glance
  and end cleanly on the brand mark and bare domain (e.g. `acme.dev`) rather
  than pushy boilerplate like "Try Acme Today!".
- **Code is rarely the hero.** Unless the product is specifically a code editor
  or diff viewer, limit raw code to one fast beat ("handles the diff so you
  don't have to") and show outcomes, media, checks, and live UI instead.
- **Real numbers over fake metrics.** Never pad numbers (`82`, not `082`) and
  never invent customer names, benchmarks, or partnerships.

### 2. Built for Social Feeds: Big, Zoomed, Legible

- Most viewers watch on a phone while scrolling. **Make typography and UI
  significantly larger** than desktop web defaults, simplify chrome inside cards,
  and favor clean medium/regular weights over cramped bold blocks.
- **Text must fit its container on every single frame.** Check long titles,
  animating counters, and type-on lines at both their start and settled frames.
- **Zoom into apps.** When showing product UI, zoom the window until its copy is
  effortlessly readable, fill the frame width, keep headlines to a single line,
  and hold on the zoomed state long enough to read instead of whipping past it.
- **Camera follows typing.** When a composer or terminal types character by
  character while zoomed in, track the camera smoothly along the typing line so
  the active cursor stays framed and legible.
- **Modest lower captions.** When placing explanatory captions over footage, use
  a subtle translucent dark band rather than heavy pill badges, sized slightly
  smaller than hero headlines.

### 3. Visual Craft & UI Fidelity

- **Never use generic purple AI gradients.** Keep the palette tight and
  deliberate (`bg`, `fg`, `accent`, `muted`), without letting one loud hue
  drown the whole film.
- **Let tool colors carry meaning.** Keep real characteristic brand colors on
  ecosystem icons (GitHub, Slack, X, Linear, Apple, PostHog, Figma) so viewers
  parse integrations in milliseconds — neither washed-out monochrome gray nor a
  random rainbow.
- **No decorative floating logo confetti.** Brand marks should act with purpose
  (anchoring a lockup, morphing, coordinating tasks), never drifting aimlessly
  as wallpaper specks.
- **Crisp icons and realistic avatars.** Use real SVG product marks and clean
  line icons (Lucide), never emoji or clipart. In chat/team mock-ups, use person
  silhouettes or real-style portraits — **never two-letter initials circles**.
- **Mock-ups must look like the real software.** Slack threads look like Slack
  (a person talking with the product, not three bots talking to themselves);
  GitHub PRs transition checks from pending yellow to passing green and include
  visual proof (before/after captures or a playing walkthrough clip); video
  editors hold an actual moving clip.
- **Code diffs and file trees use Pierre** (`@pierre/diffs` and `@pierre/trees`;
  see [`video-tools`](../video-tools/SKILL.md)), never hand-drawn `+`/`-` boxes.
- **Opaque cards over textured grounds.** Inputs, toolbars, and cards sitting in
  front of grain, paper, or shader fields must have solid fills so background
  lines never bleed through type.
- **Every tile distinct in multi-task grids.** When showing a grid or wall of
  parallel tasks, give every tile a distinct domain, layout, and visual medium
  — never repeat the same card skeleton with swapped labels.

### 4. Motion, Pacing, and Sound

- **Start moving on frame 0.** No dead hold at `t = 0`: open immediately with
  motion and land the first strong visual turn by ~2.0–2.5 s. Trim dead air
  ruthlessly, while holding key value-prop lines and handoff moments long enough
  to read.
- **Something fresh roughly every 0.8–1.0 s** on a musical pulse: a card enters,
  a check flips green, a camera pushes to the active detail, or a beat cuts.
- **Subtle over bouncy.** Prefer crisp, critically damped easing over wobbly
  springs or idle bobbing.
- **Alive overviews.** In zoomed-out grids or dashboards, keep subtle micro-life
  running inside tiles (typing cursors, playheads, progress fills).
- **Motivated camera paths.** Move cleanly from overview into items one by one,
  then out — never zoom out and back in without purpose. Match-cut across
  transitions where possible.
- **Rapid-cut rushes** cut on true `#000000` black (not muddy gray) at 5+ cuts
  per second.
- **Beat-locked audio.** Keep the original music when instrumental and fitting;
  when retiming picture or replacing music, cut music on bar lines so downbeats
  hit the first montage cut and the closing wordmark cleanly.

### 5. Fast Iteration, Visual QA, and Hand-Off

- **Iterate on fast drafts first.** Render changed ranges (`--frames a-b`) or
  half-scale drafts (`--scale 0.5`) and inspect contact sheets (`ffmpeg` tile or
  `vrea.ts frame <slug> <frames...>`) in seconds; render full `crf=16` 1080p for
  final hand-off.
- **Inspect every render visually before reporting.** Extract a 1–2 fps contact
  sheet plus single frames of dense UI beats and transitions. Check frame 0 (no
  blank text or missing layer), text box bounds, crop edges, contrast, and
  audio loudness/sync. Fix defects and re-render before handing over.
- **Always report full real paths (`realpath`).** Every rendered `.mp4`,
  side-by-side comparison, review board, and spec you hand over must be listed
  by its full absolute filesystem path, grouped clearly (composed cut, variants,
  review board, clone).
- **Grow your standing direction.** When recurring feedback appears across
  sessions, run `bun <SKILL_DIR>/scripts/mine-feedback.ts` to review user
  notes across past sessions and fold durable preferences into your brand kit or
  skill notes.
