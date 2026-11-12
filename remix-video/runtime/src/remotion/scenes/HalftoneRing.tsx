import type React from "react";
import { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import { alpha } from "../lib/color";
import { useEdit } from "../lib/context";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// A dithered ring of light floating in a field of halftone dots: a fine
// ordered-dither annulus (bright on the left), a coarse dot plume falling
// from the upper left, a horizontal dot band through the ring, and sparse
// twinkling specks. Everything derives from `seed` and the frame.
export const HalftoneRing: React.FC<{ scene: Of<"halftoneRing"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const { spec } = useEdit();
  const ref = useRef<HTMLCanvasElement>(null);
  const fg = spec.brand.palette.fg;

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const seed = scene.seed;
    const cx = W / 2;
    const cy = H * 0.5;
    const r0 = H * scene.radius;
    const r1 = r0 + H * scene.thickness * 1.6;
    const t = frame / fps;
    ctx.clearRect(0, 0, W, H);
    if (scene.motif !== "ring") {
      (scene.motif === "sphere" ? drawSphere : drawTunnel)(ctx, { W, H, t, seed, fg, cell: scene.cell, radius: scene.radius, frame });
      drawSpecks(ctx, W, H, seed, frame);
      ctx.globalAlpha = 1;
      return;
    }

    // Soft bloom behind the ring.
    const bloom = ctx.createRadialGradient(cx, cy, r0 * 0.4, cx, cy, r1 * 2.2);
    bloom.addColorStop(0, alpha(fg, 0.1));
    bloom.addColorStop(0.5, alpha(fg, 0.05));
    bloom.addColorStop(1, alpha(fg, 0));
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = fg;

    // Coarse dot field: plume + band.
    const cell = scene.cell * 1.25;
    for (let gy = 0; gy < H / cell; gy++) {
      for (let gx = 0; gx < W / cell; gx++) {
        const x = gx * cell;
        const y = gy * cell;
        const u = x / W;
        const v = y / H;
        // Plume: a wedge from the upper left widening down toward the ring.
        const along = Math.max(0, Math.min(1, v / 0.55));
        const center = 0.29 + along * 0.15;
        const half = 0.05 + along * 0.1;
        const plume = Math.max(0, 1 - Math.abs(u - center) / half) * (v < 0.62 ? 1 : 0);
        // Band: a horizontal stripe through the ring, broken into clumps.
        const band = Math.exp(-(((v - 0.5) / 0.055) ** 2)) * (0.55 + 0.45 * Math.sin(u * 23 + random(`${seed}:b${Math.floor(u * 9)}`) * 6));
        const density = Math.max(plume * 0.85, band * 0.7);
        if (density <= 0.05) continue;
        const flicker = random(`${seed}:d${gx}:${gy}:${Math.floor(frame / 3)}`);
        if (random(`${seed}:d${gx}:${gy}`) * 0.9 + flicker * 0.1 > density) continue;
        ctx.globalAlpha = 0.55 + 0.45 * random(`${seed}:a${gx}:${gy}`);
        ctx.fillRect(x, y, 3, 3);
      }
    }

    // Fine dithered ring.
    const fine = Math.max(3, scene.cell / 2);
    const spin = t * 0.25;
    for (let y = cy - r1 - fine; y < cy + r1 + fine; y += fine) {
      for (let x = cx - r1 - fine; x < cx + r1 + fine; x += fine) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d < r0 * 0.85 || d > r1 * 1.08) continue;
        const mid = (r0 + r1) / 2;
        const ring = Math.max(0, 1 - Math.abs(d - mid) / ((r1 - r0) / 2 + fine));
        const angle = Math.atan2(dy, dx);
        const side = 0.5 + 0.5 * Math.cos(angle - Math.PI - spin * 0.3); // brightest on the left
        const level = ring * (0.45 + 0.55 * side) * (0.9 + 0.1 * Math.sin(angle * 7 + t * 3));
        const gx = Math.round(x / fine);
        const gy = Math.round(y / fine);
        if (level < BAYER[(gy % 4) * 4 + (gx % 4)]!) continue;
        ctx.globalAlpha = Math.min(1, 0.6 + level * 0.5);
        ctx.fillRect(x, y, fine - 1, fine - 1);
      }
    }

    drawSpecks(ctx, W, H, seed, frame);
    ctx.globalAlpha = 1;
  }, [frame, fps, W, H, fg, scene.seed, scene.radius, scene.thickness, scene.cell, scene.motif]);

  // Fade in over 2 frames and out over `fadeOut`, collapsing gracefully on very short scenes.
  const fadeIn = Math.min(2, scene.duration / 3);
  const fadeStart = Math.max(fadeIn + 0.01, scene.duration - scene.fadeOut);
  const opacity = interpolate(frame, [0, fadeIn, fadeStart, Math.max(fadeStart + 0.01, scene.duration)], [0.6, 1, 1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg, opacity }}>
      <canvas ref={ref} width={W} height={H} style={{ position: "absolute", inset: 0, filter: `drop-shadow(0 0 6px ${alpha(fg, 0.55)})` }} />
    </AbsoluteFill>
  );
};

type Draw = { W: number; H: number; t: number; seed: string; fg: string; cell: number; radius: number; frame: number };

// Specks: small 2x2 glyph clusters that blink.
function drawSpecks(ctx: CanvasRenderingContext2D, W: number, H: number, seed: string, frame: number) {
  for (let i = 0; i < 40; i++) {
    if (random(`${seed}:s${i}:${Math.floor(frame / 2)}`) < 0.35) continue;
    const x = random(`${seed}:sx${i}`) * W;
    const y = random(`${seed}:sy${i}`) * H;
    ctx.globalAlpha = 0.5 + 0.5 * random(`${seed}:sa${i}`);
    const big = random(`${seed}:sb${i}`) < 0.2;
    ctx.fillRect(x, y, big ? 9 : 3, big ? 6 : 3);
    if (big) ctx.fillRect(x + 12, y, 6, 6);
  }
}

// A dotted globe turning slowly, lit from the upper left and ordered-dithered
// like the ring, with a thin equator band of coarser dots.
function drawSphere(ctx: CanvasRenderingContext2D, { W, H, t, seed, fg, cell, radius }: Draw) {
  const cx = W / 2;
  const cy = H / 2;
  const R = H * (radius * 1.9);
  const step = Math.max(3, cell / 2);
  const spin = t * 0.5 + random(`${seed}:spin`) * 6;
  const tilt = 0.35;
  const bloom = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
  bloom.addColorStop(0, alpha(fg, 0.08));
  bloom.addColorStop(1, alpha(fg, 0));
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg;
  for (let y = cy - R; y <= cy + R; y += step) {
    for (let x = cx - R; x <= cx + R; x += step) {
      const nx = (x - cx) / R;
      const ny = (y - cy) / R;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      const nz = Math.sqrt(1 - rr);
      // Unrotate to the globe's own coordinates for the lat/long pattern.
      const y1 = ny * Math.cos(tilt) - nz * Math.sin(tilt);
      const z1 = ny * Math.sin(tilt) + nz * Math.cos(tilt);
      const lon = Math.atan2(nx, z1) + spin;
      const lat = Math.asin(Math.max(-1, Math.min(1, y1)));
      const grid = Math.max(Math.abs(Math.sin(lon * 6)) ** 18, Math.abs(Math.sin(lat * 6)) ** 18);
      const light = Math.max(0, -nx * 0.6 - ny * 0.45 + nz * 0.65);
      const level = Math.min(1, light * 0.75 + grid * 0.6) * (0.35 + 0.65 * nz);
      const gx = Math.round(x / step);
      const gy = Math.round(y / step);
      if (level < BAYER[(((gy % 4) + 4) % 4) * 4 + (((gx % 4) + 4) % 4)]!) continue;
      ctx.globalAlpha = Math.min(1, 0.45 + level * 0.6);
      ctx.fillRect(x, y, step - 1, step - 1);
    }
  }
  // Equator band of coarse dots running past the globe.
  const coarse = cell * 1.25;
  for (let x = 0; x < W; x += coarse) {
    for (let k = -2; k <= 2; k++) {
      const y = cy + k * coarse + Math.sin(x / 140 + t * 2) * 6;
      if (random(`${seed}:eq${Math.round(x)}:${k}`) > 0.55 - Math.abs(k) * 0.12) continue;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y, 3, 3);
    }
  }
}

// Rings of dots rushing toward the camera: each ring's radius grows as its
// depth shrinks, so the field reads as flying down a tunnel.
function drawTunnel(ctx: CanvasRenderingContext2D, { W, H, t, seed, fg }: Draw) {
  const cx = W / 2;
  const cy = H / 2;
  const rings = 16;
  const speed = 0.9;
  ctx.fillStyle = fg;
  for (let i = 0; i < rings; i++) {
    const z = 1 - ((i / rings + t * speed) % 1); // 1 far .. 0 near
    const depth = 0.08 + z * 2.2;
    const r = (H * 0.12) / depth;
    if (r > W) continue;
    const dots = 36 + i * 2;
    const twist = random(`${seed}:tw${i}`) * Math.PI * 2 + t * (i % 2 ? 0.4 : -0.4);
    const size = Math.max(1.5, 5 / depth);
    for (let d = 0; d < dots; d++) {
      if (random(`${seed}:td${i}:${d}`) < 0.18) continue;
      const a = twist + (d / dots) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.92;
      ctx.globalAlpha = Math.min(1, (1 - z) * 1.2) * (0.5 + 0.5 * random(`${seed}:ta${i}:${d}`));
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
  // A bright pinhole at the vanishing point.
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.12);
  glow.addColorStop(0, alpha(fg, 0.5));
  glow.addColorStop(1, alpha(fg, 0));
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.fillRect(cx - H * 0.12, cy - H * 0.12, H * 0.24, H * 0.24);
  ctx.fillStyle = fg;
}
