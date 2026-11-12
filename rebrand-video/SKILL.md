---
name: rebrand-video
description: Rebrands a cloned video edit spec for another company or product from a declarative `brand.json` kit — swapping palette (dark or light), typography, mark, lockup, wordmark, positioning copy, product screenshots, and regenerating shots with burned-in text into clean plates. Use when asked to rebrand, white-label, reskin, or remake an existing video edit for another brand.
metadata:
  version: "2.0.0"
---

# Rebrand a Cloned Video

Swaps brand identity and positioning on top of an existing `./projects/<slug>/spec.json`
without altering the original clone, writing `./projects/<slug>/variants/<brand>/spec.json`.
Rebrand the clone **first**, then run [`vary-video`](../vary-video/SKILL.md) with
`"base": "<brand>"` so every variant inherits the new identity.

`<SKILL_DIR>` below is the directory containing this `SKILL.md` (installed
beside [`remix-video`](../remix-video/SKILL.md)). Before rendering, apply
[`remix-video` Standing Direction](../remix-video/SKILL.md#standing-direction).

## 1. Gather Authentic Brand Material & Positioning

Collect from the user's repository, website, or brand folder (or bootstrap raw
site assets with `launch-video/scripts/bootstrap.ts` if installed):

1. **Identity & Positioning (`name`, `wordmark`, `about`)**: What the product
   actually does, for whom, and its concrete differentiators. Reframe taglines,
   UI headlines, captions, and voice-over around the new product's real story
   role-for-role — never settle for a superficial color/logo swap.
2. **Palette (`bg`, `fg`, `accent`, `muted`)**: Both dark-stage (`#0A0A0C`) and
   warm light-paper (`#F6F7F3`) palettes work out of the box because built-in
   components resolve colors from `spec.brand.palette`.
3. **Typography (`display`, `mono`, `wordmark`)**: Any bundled Google Font family
   (`Inter`, `Inter Tight`, `Geist`, `Geist Mono`, `Space Grotesk`, `DM Sans`,
   `Manrope`, `Plus Jakarta` / `Archivo`, `Sora`, `Syne`, `Unbounded`, `Orbitron`,
   `Rajdhani`, `Chakra Petch`, `JetBrains Mono`, `IBM Plex Mono`, `Instrument Serif`,
   `Playfair Display`, `EB Garamond`).
4. **Mark & Lockup**: Transparent SVG/PNG `mark` contrasted cleanly against `bg`
   (or `"hexagon"` for the built-in geometric mark), plus optional `lockup` for
   the end card (when omitted, `endCard` renders `mark + wordmark` in code; set
   `markless: true` on `endCard` when matching a wordmark-only end card).
5. **Real Product Captures**: Crisp 2x product screenshots (`tag:brand:screenshot`)
   and authentic team/product visuals (`tag:brand:photo`). Treat AI-generated UI
   as a last-resort placeholder and flag it explicitly if used.

## 2. Write `brand.json`

See `../remix-video/runtime/examples/brands/acme/brand.json` for a complete
working example. File paths inside `brand.json` resolve relative to `brand.json`:

```json
{
  "name": "Acme",
  "wordmark": "Acme",
  "wordmarkWeight": 600,
  "about": "Acme turns GitHub issues and Slack threads into tested, verified deployments inside your existing repositories and CI.",
  "palette": {
    "bg": "#F6F7F3",
    "fg": "#141414",
    "accent": "#D94E28",
    "muted": "#7A7A75"
  },
  "fonts": {
    "display": "Inter",
    "mono": "JetBrains Mono",
    "wordmark": "Space Grotesk"
  },
  "mark": "acme-mark.svg",
  "text": {
    "where the future gets built": "where software ships on time"
  },
  "replace": {
    "tag:brand:screenshot": ["screens/workspace.png", "screens/pull-request.png"]
  },
  "generate": {
    "tag:brand:photo": "candid documentary photograph of engineers collaborating at a sunlit desk",
    "baked:caption": {
      "brief": "A clean natural photograph matching this shot's subject, framing, scale, and lighting, with no captions, logos, or letterbox bars.",
      "reference": true
    }
  }
}
```

Selector syntax in `replace` and `generate`:
- `<asset-id>` — targets a specific asset (e.g. `"panel-hero"`).
- `tag:<tag>` — targets every asset carrying that tag in timeline order, cycling files (`tag:brand:screenshot`, `tag:brand:photo`, `tag:brand:lockup`).
- `baked:<key>` — targets every source clip whose pixels have layer `<key>` burned in (crucial whenever `text` changes a caption over `baked: ["caption"]` footage so the old burned-in words are replaced by a clean plate + code-drawn caption!).

## 3. Dry-Run and Apply

```bash
bun <SKILL_DIR>/scripts/vrea.ts rebrand <slug> --brand ./brand.json --dry-run
bun <SKILL_DIR>/scripts/vrea.ts rebrand <slug> --brand ./brand.json [--base <variant>] [--name <variant-name>]
```

Inspect the CLI output carefully: `rebrand` prints two automatic safety checks:
- **`still showing <OldBrand>`**: `brand:*`-tagged source assets not yet covered by `replace` or `generate`.
- **`copy changed but the old words are baked into this footage`**: text layers whose copy changed while the underlying clip still bakes that key.

Resolve every reported item before rendering.

## 4. Visual QA and Render

```bash
bun <SKILL_DIR>/scripts/vrea.ts check <slug> --variant <name>
bun <SKILL_DIR>/scripts/vrea.ts frame <slug> 3 80 130 205 290 --variant <name>
bun <SKILL_DIR>/scripts/vrea.ts render <slug> --variant <name>
```

Scrub the frames to verify:
- Crisp contrast of mark, typography, and procedural graphics on the new `palette.bg`.
- Zero surviving frames of the old company's logo, domain, or product chrome.
- Every UI panel headline and caption fits its container cleanly without wrapping or clipping.

## 5. Report with Full Real Paths

Report full absolute filesystem paths (`realpath`) for `./projects/<slug>/variants/<name>/spec.json`
and `./projects/<slug>/renders/<name>.mp4`, all identity/copy/asset swaps
performed, real vs. generated assets, and any generation cost.
