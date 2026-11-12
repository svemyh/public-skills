import type React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import { paint } from "../lib/color";
import { useEdit } from "../lib/context";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;

// `mix("#ff0000", "#0000ff", 0.25)`: a quarter of the way from a to b.
function mix(a: string, b: string, t: number): string {
  const rgb = (c: string) => {
    const h = c.replace(/^#/, "");
    const n = parseInt(h.length === 3 ? [...h].map((x) => x + x).join("") : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  if (!/^#[0-9a-f]{3,6}$/i.test(a) || !/^#[0-9a-f]{3,6}$/i.test(b)) return a;
  const [x, y] = [rgb(a), rgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * t)).join(",")})`;
}

// Square cells in a ramp of brand colors sweep across the frame, covering
// the outgoing field (`fromColor`) and revealing the next (`toColor`).
// burst: diamond rings pulse out from the center; stripes: vertical bars
// sweep right to left; steps: a staircase of blocks climbs from a corner;
// streak: stacked bars shoot in from the left and settle on the mark.
export const PixelWipe: React.FC<{ scene: Of<"pixelWipe"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec } = useEdit();
  const pal = spec.brand.palette;
  const ramp = scene.colors.length
    ? scene.colors.map((c) => paint(pal, c))
    : [mix(pal.accent, pal.bg, 0.6), mix(pal.accent, pal.bg, 0.3), pal.accent, mix(pal.accent, pal.fg, 0.2), mix(pal.accent, pal.fg, 0.4)];
  const t = scene.duration > 1 ? frame / (scene.duration - 1) : 1;
  const field = paint(pal, t < scene.cutAt ? scene.fromColor : scene.toColor);
  const c = scene.cell;
  const cols = Math.ceil(width / c);
  const rows = Math.ceil(height / c);
  const cells: React.ReactNode[] = [];
  const at = (x: number, y: number, color: string, w = c, h = c) =>
    cells.push(<div key={cells.length} style={{ position: "absolute", left: x, top: y, width: w, height: h, background: color }} />);

  if (scene.style === "burst" || scene.style === "steps") {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const reach = scene.style === "burst" ? cx + cy + 2 : cols + rows;
    // The lit band travels outward; cells behind it switch off again.
    const front = interpolate(t, [0, 1], [-2, reach + 4]);
    const band = scene.style === "burst" ? 3.5 : 6;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const d = scene.style === "burst" ? Math.abs(i - cx) + Math.abs(j - cy) : i + (rows - 1 - j);
        const k = front - d;
        if (k < 0 || k > band) continue;
        // Burst rings skip every other step, a checker of lit cells.
        if (scene.style === "burst" && (Math.round(d) % 2 === 1) !== (Math.floor(frame / 2) % 2 === 1) && k > 1) continue;
        if (random(`${scene.seed}:${i}:${j}`) < 0.08) continue;
        at(i * c, j * c, ramp[Math.min(ramp.length - 1, Math.floor((k / band) * ramp.length))]!);
      }
    }
  } else if (scene.style === "stripes") {
    // A block of vertical bars, lightest in the middle, crossing right to left.
    const n = ramp.length * 2 - 1;
    const span = n * c;
    const x0 = interpolate(t, [0, 1], [width, -span - width * 0.2]);
    const stretch = Math.max(1, width / span);
    for (let i = 0; i < n; i++) {
      const idx = ramp.length - 1 - Math.abs(i - (ramp.length - 1));
      at(x0 + i * c * stretch, 0, ramp[ramp.length - 1 - idx]!, c * stretch + 1, height);
    }
  } else {
    // streak: bars stacked by color, their heads racing right, then gone.
    const head = interpolate(t, [0, 0.7], [-0.1, 0.55], { extrapolateRight: "clamp" }) * width;
    const fade = interpolate(t, [0.75, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const bar = c * 0.25;
    ramp.forEach((color, i) => {
      const lag = i * c * 0.2;
      cells.push(<div key={`s${i}`} style={{ position: "absolute", left: 0, top: height / 2 - (ramp.length / 2) * bar + i * bar, width: Math.max(0, head - lag), height: bar, background: color, opacity: fade }} />);
    });
  }
  return <AbsoluteFill style={{ background: field, overflow: "hidden" }}>{cells}</AbsoluteFill>;
};
