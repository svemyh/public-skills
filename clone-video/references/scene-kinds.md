# Scene Kinds and Layers Reference

Authoritative Zod definitions live in `../remix-video/runtime/src/spec/schema.ts`
(and `promo.ts`). Coordinates are composition pixels unless noted (`0..1`
normalized where stated); scene timing fields are integer frames relative to the
scene's `from` frame. Use brand palette tokens (`"bg"`, `"fg"`, `"accent"`,
`"muted"`) rather than hardcoded hexes wherever possible so light and dark
rebrands work automatically.

## Scene Kinds (`scene.kind`)

| Kind | Renders | Best For | Key Fields |
| --- | --- | --- | --- |
| `media` | Single image or video asset | Filmed/stock shots, montage stills | `asset`, `trimBefore`, `fit` (`cover`/`contain`), `zoomFrom`/`zoomTo`, `panX`/`panY` |
| `solid` | Flat color hold | Hard black cuts, color breathes | `color` (defaults to `brand.palette.bg`) |
| `pixelWipe` | Brand-colored grid wipe (`burst`, `stripes`, `steps`, `streak`) | Snappy geometric transitions & cold opens | `style`, `colors[]`, `fromColor`, `toColor`, `cutAt` (`0..1`), `cell`, `seed` |
| `logoFlash` | Mark blink with RGB fringe + scan streak or aperture iris | 6–12 frame cold opens | `size`, `streakAt`, `style` (`streak`/`iris`) |
| `logoGlow` | Centered brand mark springing into a soft bloom or ripple rings | Mid-edit brand punctuation | `size`, `growFrames`, `style` (`glow`/`pulse`) |
| `markFill` | Brand mark silhouette masking cycling imagery, spinning in & shrinking to solid | Rapid multi-image brand reveals | `mark` (`fills[]`, `every`, `size`, `spinFrom`, `shrinkAt`, `tint`), optional `asset` |
| `markMorph` | Keyframed `[frame, value]` mark + animated wordmark + optional partner mark over `sky`/`flat`/`grid`/`rings` | Hero logo builds, product/partner announcements | `field`, `colors`, `size`/`x`/`y`/`spin`/`opacity` tracks, `wordmark`, `flatten`, `partner` |
| `endCard` | Lockup asset, or code-drawn mark + wordmark | Closing brand cards | `lockupHeight`, `markless` (wordmark-only), `fadeIn` |
| `panelCollage` | Product UI cards or code-drawn `ui` widgets (`diff`, `bars`, `chips`, `toggles`, `grid`, `timeline`, `chart`, `invite`, `flow`) | Feature tours & multi-surface showcases | `panels[]` (`asset` or `ui`, `x`, `y`, `w`, `h`, `enterAt`), `layout` (`drift`/`stack`/`carousel`), `drift` |
| `cardCollage` | Photo/UI cards flying onto a schematic, honeycomb, or ruled backdrop | Community, event, or multi-artifact collages | `cards[]`, `layout` (`cluster`/`grid`/`fan`), `backdrop` (`schematic`/`honeycomb`/`rules`), `camera`, `ditherOutAt` |
| `codeScroll` | Tilted fast-scrolling terminal transcript + dim sidebar | Dev-tool / autonomous-agent action beats | `lines[]`, `sidebar[]`, `speed`, `tilt`, `invertAt` |
| `screen` | Filmed monitor/device photo with a live typed terminal mapped onto its `0..1` screen rect + shared push-in | Grounded hardware + live software shots | `asset`, `screen` (`x,y,w,h` in `0..1`), `script[]` (`at`, `text`, `type`, `tone`), `zoomFrom`/`zoomTo`, `focus`, `glitchFrom` |
| `laptop` | 3D-turned laptop drawn in code over dimmed/blurred background footage, playing app captures or `markFill` | Product-in-environment hero shots | `asset`, `blur`, `dim`, `device` (`x,y,w,turn,tone`), `shots[]` (`asset,at,push`), `mark`, `surface`, `scrim`, `driftX` |
| `halftoneRing` | Ordered-dither ring, rotating dotted sphere, or dot tunnel | "Singularity" / core-engine conceptual beats | `motif` (`ring`/`sphere`/`tunnel`), `radius`, `thickness`, `cell`, `fadeOut`, `seed` |
| `iconSwarm` | Icon tiles (image `asset` or Lucide `glyph`) drifting then converging (`swirl`, `orbit`, `grid`) | "Every tool connects into one place" | `icons[]` (`asset` or `glyph`, `x`, `y`), `convergeAt`, `tile`, `pattern`, `seed` |
| `taskFeed` | Prompt composer types a task, folds into a task row, rises, and parallel tasks join (`clock` spans cuts) | Agent/workflow product loops | `tasks[]`, `picker`, `clock`, `openAt`/`typeAt`/`submitAt`/`riseAt`/`joinAt`, `look` (`card`/`outline`/`ink`), `layout` (`rows`/`timeline`) |
| `stage` | Multi-element SaaS launch stage with per-element 3D camera & blur crossfades | Full UI launch films & night-shift stories | `bg`, `field`, `elements[]`: `introLine`, `composer`, `status`, `calendar` (`week`/`month`), `detail`, `yearGrid`, `heatmap`, `counter`, `phone`, `sky`, `clock`, `laptop`, `skyline`, `cracks`, `flow`, `cursor`, `text`; tiles support `StageWidget` (`campaign`, `security`, `experiment`, `pipeline`, `slack`, `fleet`, `darkmode`) |
| `promo` | Kinetic two-weight titles, dropdown-chip composer, arrow-linked cards (`lines`/`diff`/`chat`/`agent`/`pr`), 3D card `flip`, hex `tunnel`, `badges`, `cursor`, `logo` | High-tempo explainer & launch promos | `field` (`grid`, `backdrop`, `dim`), `elements[]` (`title`, `composer`, `cards`, `badges`, `tunnel`, `flip`, `logo`, `cursor`) |

## Layers (`scene.layers[]` or Timeline `spec.overlays[]`)

| Kind | Effect | Key Options |
| --- | --- | --- |
| `grade` | CSS filter (`invert`, `grayscale`, `contrast`, `brightness`, `blur`) | Scene filter on `scene.layers`; backdrop filter on `overlays` |
| `letterbox` | Aspect-ratio matte bars | `ratio` (default `2.76`), `color` (defaults to `bg`) |
| `trackingBoxes` | Thin CV-style detector rectangles (seeded random or fixed `0..1` `boxes[]`) | `count`, `color` (defaults to `accent`), `seed`, `boxes` |
| `text` | Single line of typography with optional `plate` chip/button background | `text`, `x`, `y` (vertical center), `size`, `align`, `font` (`display`/`mono`/`wordmark`), `weight`, `enter` (`cut`/`rise`/`blur`/`track`/`morph`), `typeFrames`, `blend` (`normal`/`difference`), `shadow`, `glow`, `driftY`, `plate` |
| `prompt` | Centered code-drawn chat input box with typed text, tool `chips[]`, and accent send button | `text`, `x`, `y`, `w`, `size`, `tone` (`light`/`dark`), `chips[]`, `typeFrames` |
| `mark` | Solid brand mark entering and drifting like typography | `x`, `y`, `size`, `color`, `enter` (`cut`/`rise`/`blur`/`track`), `driftY` |
| `pixelMark` | Progressive coarse-to-fine pixel/glyph silhouette resolving into a crisp asset | `asset`, `x`, `y`, `width`, `height`, `stages[]`, `crisp`, `color` |
| `flash` | Short color exposure pop | `color`, `at`, `length`, `peak` |
| `glitch` | Scene-wrapping RGB band tears (`bands`) or block datamosh (`blocks`) | `style`, `intensity`, `slices`, `from`, `ramp`, `seed` (scene-only) |
| `codeOverlay` | Monospace debugger annotations in dark translucent chips, reshuffled every `every` frames | `count`, `every`, `lines[]`, `seed` |
| `horizon` | Curved planetary horizon arc masking the upper sky with optional glowing `rim` | `y`, `sag`, `x`, `tilt`, `color`, `rim`, `rimWidth`, `glow`, `rise` |
| `vignette` / `grain` | Subtle optical falloff and animated film grain | `strength` (`vignette`), `amount` + `seed` (`grain`) |

## Using `key` and `baked` Together

Whenever source footage already contains burned-in captions, letterbox bars,
grades, horizon masks, or tracking boxes:
1. Rebuild that layer in `scene.layers` or `spec.overlays` and give it a descriptive `key` (e.g. `"caption"`, `"letterbox"`, `"grade"`).
2. Add that same string to the source asset's `baked` array (`["caption", "letterbox"]`).
3. In the clone, Remotion skips `baked` layers so the original pixels appear untouched; as soon as `rebrand` or `vary` swaps in a clean asset (`baked: []`), Remotion automatically draws the rebuilt layers in the new brand's colors, fonts, and copy.
