# Launch Film Format Guide

Measured structure and layout rules for the dark-stage product launch format.

## Timeline Skeleton (1920 x 1080 @ 60 fps)

| Section | Default | Visual |
| --- | --- | --- |
| `open` | 3.5 s | Full-bleed flat-top honeycomb hex lattice (`r = 48, gap = 8`) holds 6 frames, flies radially inward into `(960, 540)` over 1.15 s, revealing the centered `<mark + wordmark>` lockup (`120 px`) and tagline (`38 px`). |
| `beats[]` | 3.5 s each | Single-line headline (`64 px`, weight 400, centered at `y = 54`) above the product visual (`max 1600 x 880`, slow `1.02x` push). Partner/ecosystem logos appear in `136 px` flat-top hex tiles (`left` vertical stack for 3 logos, symmetric `sides` for 1–2, or horizontal `top` row above a `y = 340` window). |
| `free` | 1.5 s | Giant statement (`204 px`, weight 400, centered) such as `"Free to start."` or `"Never miss out."` |
| `download` | 2.5 s | Headline on top + centered `520 px` dark card (`mark`, `title`, `body`, pill `button`). A white pointer glides onto the pill button and clicks at 55% of the scene. |
| `outro` | 6.5 s | Honeycomb wall snaps in over 6 frames, holds 14 frames, then bursts outward into particles while `<mark + website>` (`96 px`) types in character by character and holds cleanly for ~5 s. |

## Visual & Copy Checklist

- **Contrast on dark stage**: `mark` must be light/white on a transparent background (`minima.a = 0`). Dark monochrome partner logos (`#000` / `#111`) need either white SVG fills or `fill: "#F2F2F2"` on their hex tile.
- **Frameless vs bordered captures**: Full-window rectangular screenshots look sharpest with `border: true` (`14 px` radius, subtle `1 px` rim). Angled phones, floating notification cards, or renders with transparent backgrounds (`minima.a < 0.98`) are auto-trimmed and rendered `frameless` (`border: false, fit: "contain"`) so they never sit inside an artificial gray rectangle.
- **One claim per beat**: Headlines are 2–5 words ending in a period (`"Mention your teammates."`, `"See it on X, trade it."`, `"Fund with Apple Pay."`). Never use questions, emojis, or unverified superlatives, and make sure every headline visibly matches the screen underneath it.
- **No purple gradients**: Sample real colors from the brand's product UI (saturated accents + neutral slates) for `mosaicColors`.
