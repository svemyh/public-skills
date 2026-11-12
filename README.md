# public-skills

Standalone skills for coding agents (Claude Code, Codex, Cursor, Pi). Point an
agent at this repository or copy the skill folder you want into your agent's
skills directory.

## Install

```sh
git clone --depth 1 https://github.com/svemyh/public-skills /tmp/public-skills
```

| Agent | Install |
| --- | --- |
| Claude Code | `mkdir -p ~/.claude/skills && cp -r /tmp/public-skills/launch-video ~/.claude/skills/` |
| Codex | `mkdir -p ~/.agents/skills && cp -r /tmp/public-skills/launch-video ~/.agents/skills/` |
| Cursor | `mkdir -p ~/.cursor/skills && cp -r /tmp/public-skills/launch-video ~/.cursor/skills/` |
| Pi | `mkdir -p ~/.agents/skills && cp -r /tmp/public-skills/launch-video ~/.agents/skills/` |

To update, pull the clone and copy again.

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

Offline tests (requires Bun, `ffmpeg`, and ImageMagick `magick`):

```sh
bun install --cwd launch-video/template
bun test launch-video/scripts/launch.test.ts
```
