# public-skills

Standalone skills for coding agents (Claude Code, Codex, Cursor, Pi). Point an
agent at this repository or copy the skill folders you want into your agent's
skills directory.

## Install

```sh
git clone --depth 1 https://github.com/svemyh/public-skills /tmp/public-skills
```

| Agent | Install all skills |
| --- | --- |
| Claude Code | `mkdir -p ~/.claude/skills && cp -r /tmp/public-skills/{launch-video,remix-video,clone-video,rebrand-video,vary-video,compose-video,video-tools} ~/.claude/skills/` |
| Codex | `mkdir -p ~/.agents/skills && cp -r /tmp/public-skills/{launch-video,remix-video,clone-video,rebrand-video,vary-video,compose-video,video-tools} ~/.agents/skills/` |
| Cursor | `mkdir -p ~/.cursor/skills && cp -r /tmp/public-skills/{launch-video,remix-video,clone-video,rebrand-video,vary-video,compose-video,video-tools} ~/.cursor/skills/` |
| Pi | `mkdir -p ~/.agents/skills && cp -r /tmp/public-skills/{launch-video,remix-video,clone-video,rebrand-video,vary-video,compose-video,video-tools} ~/.agents/skills/` |

You can also install `launch-video` on its own, or install the 6-skill
`video-rea` suite (`remix-video`, `clone-video`, `rebrand-video`, `vary-video`,
`compose-video`, `video-tools`) together — all six share the self-contained
Remotion + `vrea` runtime inside `remix-video/runtime/`, which installs its npm
dependencies automatically on first run.

To update, pull the clone and copy again.

---

## launch-video

Creates a 25–40 second `1920x1080` 60 fps product launch film from two inputs —
an X post (URL or text) and a website URL (or curated `brand.json` profile) —
using a self-contained [Remotion](https://remotion.dev) runtime:

- **Open**: edge-to-edge flat-top honeycomb hex mosaic collapsing into the
  `<mark + wordmark>` lockup and tagline.
- **Feature beats**: single-line headlines over real product captures (bordered
  windows for full-screen UI, auto-trimmed frameless `contain` for floating
  phones/cards) with ecosystem/partner logo hex tiles (`left`, `top`, or
  `sides`).
- **Call to action**: giant statement card followed by a centered CTA card with
  a button-anchored pointer click.
- **Outro**: full honeycomb burst into particles as `<mark + domain>` types in,
  with an automatic beat-matched 92 bpm soundtrack (`-15 LUFS`) when no custom
  audio track is supplied.

Read [`launch-video/SKILL.md`](launch-video/SKILL.md) and
[`launch-video/references/format-guide.md`](launch-video/references/format-guide.md).

---

## video-rea suite (`remix-video`, `clone-video`, `rebrand-video`, `vary-video`, `compose-video`, `video-tools`)

Reverse engineers any finished video (URL or file) into a frame-accurate,
editable [Remotion](https://remotion.dev) `EditSpec` (`spec.json`), then
rebrands, varies, scores with sound, and composes new cuts from it:

```text
source video ──ingest──▶ analyze ──▶ spec.json ──▶ Remotion ──▶ clone.mp4
                 │          │            │  ▲
                 │          │            │  └── compare: per-scene SSIM + side-by-side mp4
                 │          │            ├──rebrand──▶ variants/<brand>/spec.json
                 │          │            ├──vary─────▶ variants/<v>/spec.json
                 │          │            └──compose──▶ board.mp4 + keyboard picker + mix.mp4
                 │          └ cuts, beat diffs, keyframes, contact sheets, BPM/onsets, word timings
                 └ yt-dlp / ffprobe, extracted audio
```

| Skill | What it does |
| --- | --- |
| [`remix-video`](remix-video/SKILL.md) | **Start here.** End-to-end `vrea pipeline` orchestrator, standing creative/motion/UI direction, and the shared Remotion 4 + `vrea` runtime (`remix-video/runtime/`). |
| [`clone-video`](clone-video/SKILL.md) | Decompiles any video into `spec.json` across 18 built-in scene kinds and 12 layer kinds ([`references/scene-kinds.md`](clone-video/references/scene-kinds.md)), separating `baked` source overlays from code-drawn layers, with per-scene SSIM scoring. |
| [`rebrand-video`](rebrand-video/SKILL.md) | Applies a declarative `brand.json` kit (dark or light palette, Google Fonts, mark, lockup, wordmark, positioning copy, real product captures, and `baked:<key>` clean-plate regeneration). |
| [`vary-video`](vary-video/SKILL.md) | Builds cohesive variants using free Pexels stock clips (`as: "stock"`), local data/archive plates (`as: "file"`), receipt-cached fal.ai stills & clips, procedural motion re-seeding, and `remix` scene layout swaps. |
| [`compose-video`](compose-video/SKILL.md) | Scores variants with ElevenLabs voice-over, SFX, and section-aligned music (`sound.json`), renders a labeled side-by-side `board.mp4`, serves a local keyboard section picker (`s1b s2a s3c`), and composes the chosen cut. |
| [`video-tools`](video-tools/SKILL.md) | Tool router + standalone scripts: headless Blender Cycles renders from real scientific data (`video-tools/scripts/holds/`), bar-aligned music cutting (`edit.ts`), `-7 dB` in-band montage cut sounds (`cuts-mix.ts`), and FFT picture/audio sync verification (`check-sync.ts`). |

### Quickstart

Prerequisites: [Bun](https://bun.sh), `ffmpeg`/`ffprobe`, ImageMagick (`magick`),
and `yt-dlp` (when ingesting URLs). Optional API keys (`PEXELS_API_KEY`,
`FAL_KEY`, `ELEVENLABS_API_KEY` — or `VREA_*_OP_REF` 1Password references; see
[`remix-video/runtime/.env.example`](remix-video/runtime/.env.example)) are read
from your working directory's `.env` or environment only by commands that call
those APIs.

Run from any working directory — projects are created cleanly under
`./projects/<slug>/` where you invoke `vrea.ts`:

```sh
# End-to-end guided pipeline (stops with NEXT: whenever creative input is needed)
bun ~/.claude/skills/remix-video/scripts/vrea.ts pipeline my-reel \
  --url "https://x.com/..." \
  --brand examples/brands/acme/brand.json \
  --variants a=acme-workshop,b=acme-orbital,c=acme-systems

# Or step by step: clone -> compare -> rebrand -> render
bun ~/.claude/skills/clone-video/scripts/vrea.ts ingest ./source.mp4 --project my-reel
bun ~/.claude/skills/clone-video/scripts/vrea.ts analyze my-reel
bun ~/.claude/skills/clone-video/scripts/vrea.ts scaffold my-reel
bun ~/.claude/skills/clone-video/scripts/vrea.ts extract my-reel
bun ~/.claude/skills/clone-video/scripts/vrea.ts compare my-reel --render
bun ~/.claude/skills/rebrand-video/scripts/vrea.ts rebrand my-reel --brand examples/brands/acme/brand.json
bun ~/.claude/skills/rebrand-video/scripts/vrea.ts render my-reel --variant acme
```

---

## Offline Tests

Requires Bun, `ffmpeg`, and ImageMagick (`magick`):

```sh
bun install --cwd launch-video/template
bun test launch-video/scripts/launch.test.ts

bun install --cwd remix-video/runtime
bun run --cwd remix-video/runtime typecheck
bun test remix-video/runtime/src/spec/
```
