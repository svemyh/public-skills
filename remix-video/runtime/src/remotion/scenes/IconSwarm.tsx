import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import { assetOf } from "../../spec/schema";
import { alpha } from "../lib/color";
import { mediaUrl, useEdit } from "../lib/context";
import { glyphOf } from "./UiPanel";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;

// Glowing icon tiles gather, then collapse into the center, where the next
// scene's mark takes over. `pattern` picks how: swirl, orbit or grid.
export const IconSwarm: React.FC<{ scene: Of<"iconSwarm"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec } = useEdit();
  const cx = width / 2;
  const cy = height / 2;
  const converge = interpolate(frame, [scene.convergeAt, scene.duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, ${alpha(spec.brand.palette.fg, 0.03 + converge * 0.08)} 0%, transparent 45%)` }} />
      {scene.icons.map((icon, i) => {
        const asset = assetOf(spec, icon.asset);
        const r = (k: string) => random(`${scene.seed}:${i}:${k}`);
        const appear = interpolate(frame, [r("in") * 6, r("in") * 6 + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const { x, y, rot } = place(scene, i, scene.icons.length, icon, frame, converge, r, cx, cy);
        const size = scene.tile * (1 + converge * 0.25);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              opacity: appear,
              transform: scene.pattern === "grid" ? `perspective(600px) rotateY(${rot}deg)` : `rotate(${rot}deg)`,
              background: alpha(spec.brand.palette.fg, 0.06),
              boxShadow: `0 0 34px ${alpha(spec.brand.palette.fg, 0.1)}`,
              overflow: "hidden",
            }}
          >
            {icon.glyph ? <Glyph name={icon.glyph} size={size} /> : asset && <Img src={mediaUrl(asset)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

type Icon = Of<"iconSwarm">["icons"][number];

function place(scene: Of<"iconSwarm">, i: number, n: number, icon: Icon, frame: number, converge: number, r: (k: string) => number, cx: number, cy: number) {
  const pull = 1 - converge * 0.92;
  if (scene.pattern === "orbit") {
    // An ellipse of tiles turning around the center, tightening as it speeds up.
    const a = (i / n) * Math.PI * 2 + frame * 0.03 + converge * 2.4;
    const rx = 620 * pull;
    const ry = 300 * pull;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, rot: Math.sin(a) * 12 * (1 - converge) };
  }
  if (scene.pattern === "grid") {
    // Tiles snap from their scattered spots into a tidy grid, then fold in edge-on.
    const cols = Math.ceil(Math.sqrt(n * 1.8));
    const rows = Math.ceil(n / cols);
    const gap = scene.tile * 1.5;
    const gx = cx + ((i % cols) - (cols - 1) / 2) * gap;
    const gy = cy + (Math.floor(i / cols) - (rows - 1) / 2) * gap;
    const snap = interpolate(frame, [2 + r("sn") * 4, 10 + r("sn") * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
    const x = icon.x + (gx - icon.x) * snap;
    const y = icon.y + (gy - icon.y) * snap;
    return { x: cx + (x - cx) * pull, y: cy + (y - cy) * pull, rot: converge * 90 };
  }
  const driftX = (r("dx") - 0.5) * 30 * (frame / scene.duration);
  const driftY = (r("dy") - 0.5) * 20 * (frame / scene.duration);
  const ox = icon.x + driftX - cx;
  const oy = icon.y + driftY - cy;
  const swirl = converge * (0.6 + r("sw") * 0.5);
  return {
    x: cx + (ox * Math.cos(swirl) - oy * Math.sin(swirl)) * pull,
    y: cy + (ox * Math.sin(swirl) + oy * Math.cos(swirl)) * pull,
    rot: converge * (r("rot") - 0.5) * 80,
  };
}

// A Lucide icon centered on the tile in the brand's ink.
const Glyph: React.FC<{ name: string; size: number }> = ({ name, size }) => {
  const { spec } = useEdit();
  const Icon = glyphOf(name);
  if (!Icon) throw new Error(`unknown Lucide icon "${name}"`);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: spec.brand.palette.bg }}>
      <Icon size={size * 0.5} color={spec.brand.palette.fg} strokeWidth={1.6} />
    </div>
  );
};
