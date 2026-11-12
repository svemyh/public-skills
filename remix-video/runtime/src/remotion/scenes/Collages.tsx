import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import { assetOf } from "../../spec/schema";
import { alpha } from "../lib/color";
import { mediaUrl, useEdit } from "../lib/context";
import { BrandMark } from "../lib/mark";
import { MediaFill } from "./Basic";
import { UiPanel } from "./UiPanel";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;
type Card = Of<"cardCollage">["cards"][number];

// Product UI panels sliding in over a dark field while the camera creeps in.
export const PanelCollage: React.FC<{ scene: Of<"panelCollage"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec, fonts } = useEdit();
  const bg = assetOf(spec, scene.background);
  const t = frame / Math.max(1, scene.duration - 1);
  const scale = interpolate(t, [0, 1], [1, scene.drift.scale]);
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg, overflow: "hidden" }}>
      {bg && (
        <AbsoluteFill style={{ opacity: 0.35, filter: "grayscale(1) contrast(1.4)" }}>
          <MediaFill asset={bg} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ transformOrigin: `${width / 2}px ${height / 2}px`, transform: `translate(${scene.drift.x * t}px, ${scene.drift.y * t}px) scale(${scale})`, perspective: scene.layout === "carousel" ? 1400 : undefined }}>
        {scene.panels.map((p, i) => {
          const asset = assetOf(spec, p.asset);
          const local = frame - p.enterAt;
          if (local < 0 || (!asset && !p.ui)) return null;
          const enter = interpolate(local, [0, 3], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          const box = panelBox(scene, i, p, local, enter, frame, width, height);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                zIndex: scene.layout === "drift" ? p.z : i,
                opacity: enter,
                transform: box.transform,
                borderRadius: scene.layout === "drift" ? 0 : 14,
                overflow: "hidden",
                boxShadow: `0 0 40px ${alpha(spec.brand.palette.bg, 0.8)}, 0 0 18px ${alpha(spec.brand.palette.fg, 0.06)}`,
              }}
            >
              {p.ui ? <UiPanel ui={p.ui} w={box.w} h={box.h ?? box.w * 0.6} local={local} /> : asset && <Img src={mediaUrl(asset)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              {p.headline && (
                <div style={{ position: "absolute", left: "6%", top: "8%", width: "80%", fontFamily: fonts.display, fontWeight: 600, fontSize: p.w * 0.055, lineHeight: 1.05, color: spec.brand.palette.fg, textShadow: `0 0 18px ${alpha(spec.brand.palette.fg, 0.35)}` }}>
                  {p.headline}
                  {p.body && <div style={{ fontWeight: 400, fontSize: "0.32em", marginTop: "0.6em", opacity: 0.7 }}>{p.body}</div>}
                </div>
              )}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

type Panel = Of<"panelCollage">["panels"][number];

// Where a panel sits on this frame for the scene's layout.
function panelBox(scene: Of<"panelCollage">, i: number, p: Panel, local: number, enter: number, frame: number, width: number, height: number) {
  const n = scene.panels.length;
  const aspect = (p.h ?? p.w * 0.6) / p.w;
  if (scene.layout === "stack") {
    // Each panel lands centered on the pile, slightly rotated; older ones sink back.
    const w = width * 0.5;
    const h = w * aspect;
    const later = scene.panels.filter((q, j) => j > i && frame >= q.enterAt).length;
    const tilt = (random(`${scene.id}:tilt${i}`) - 0.5) * 8;
    const sink = 1 - later * 0.06;
    return {
      x: (width - w) / 2 + (random(`${scene.id}:ox${i}`) - 0.5) * 120,
      y: (height - h) / 2 + (random(`${scene.id}:oy${i}`) - 0.5) * 60,
      w,
      h,
      transform: `translateY(${(1 - enter) * height * 0.6}px) rotate(${tilt * enter}deg) scale(${sink})`,
    };
  }
  if (scene.layout === "carousel") {
    // A row of panels on a curved wall, sliding left past the camera.
    const w = width * 0.36;
    const h = w * aspect;
    const pos = i - (frame / Math.max(1, scene.duration)) * (n - 1) - 0.2;
    return {
      x: width / 2 - w / 2 + pos * w * 1.05,
      y: (height - h) / 2,
      w,
      h,
      transform: `rotateY(${-pos * 18}deg) translateZ(${-Math.abs(pos) * 120}px) translateY(${(1 - enter) * 60}px)`,
    };
  }
  return { x: p.x, y: p.y, w: p.w, h: p.h, transform: `translate(${(1 - enter) * 70}px, ${(1 - enter) * 30}px) scale(${0.95 + enter * 0.05})` };
}

// Photo cards fly in from off-frame onto a schematic grid (plus marks,
// circuit traces, timecodes), settle into a cluster, then break into
// dithered blocks.
export const CardCollage: React.FC<{ scene: Of<"cardCollage"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const { spec, fonts } = useEdit();
  const t = frame / Math.max(1, scene.duration - 1);
  const zoom = interpolate(t, [0, 1], [1, scene.camera.zoom]);
  const dither = scene.ditherOutAt !== undefined && frame >= scene.ditherOutAt;
  const logo = scene.centerLogo ? interpolate(frame, [0, 3], [1, 0], { extrapolateRight: "clamp" }) : 0;
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${scene.camera.x * t}px, ${scene.camera.y * t}px) scale(${zoom})`, opacity: dither ? 0.35 : 1 }}>
        {scene.backdrop === "honeycomb" ? (
          <Honeycomb seed={scene.seed} width={width} height={height} frame={frame} fg={spec.brand.palette.fg} />
        ) : scene.backdrop === "rules" ? (
          <Rules seed={scene.seed} width={width} height={height} frame={frame} mono={fonts.mono} fg={spec.brand.palette.fg} timecodes={scene.timecodes} />
        ) : (
          <SchematicGrid seed={scene.seed} width={width} height={height} timecodes={scene.timecodes} mono={fonts.mono} fg={spec.brand.palette.fg} />
        )}
      </AbsoluteFill>
      {logo > 0 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: logo, filter: `drop-shadow(0 0 16px ${alpha(spec.brand.palette.fg, 0.7)})` }}>
          <BrandMark size={110} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {[...scene.cards]
          .map((c, i) => ({ c, i }))
          .sort((a, b) => a.c.z - b.c.z)
          .map(({ c, i }) => (
            <CardView key={i} card={layoutCard(scene, c, i, width, height)} index={i} seed={scene.seed} frame={frame} fps={fps} width={width} height={height} dither={dither} />
          ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// The card's resting box for the scene's layout; enter timing stays the card's own.
function layoutCard(scene: Of<"cardCollage">, card: Card, i: number, width: number, height: number): Card {
  const n = scene.cards.length;
  if (scene.layout === "grid") {
    const cols = Math.ceil(Math.sqrt(n * 1.5));
    const rows = Math.ceil(n / cols);
    const w = card.aspect ? 420 : 250;
    const h = card.aspect ? w / card.aspect : 190;
    const gap = 18;
    const x0 = (width - cols * w - (cols - 1) * gap) / 2;
    const y0 = (height - rows * h - (rows - 1) * gap) / 2;
    return { ...card, x: x0 + (i % cols) * (w + gap), y: y0 + Math.floor(i / cols) * (h + gap), w, h, z: 0 };
  }
  if (scene.layout === "fan") {
    // Cards spread like a hand from a pivot below the frame center.
    const spread = (i - (n - 1) / 2) / Math.max(1, n - 1);
    const w = card.aspect ? 380 : 260;
    const h = card.aspect ? w / card.aspect : 330;
    return { ...card, x: width / 2 - w / 2 + spread * 760, y: height / 2 - h / 2 + Math.abs(spread) * 90, w, h, z: n - Math.abs(Math.round(spread * n)) };
  }
  return card.aspect ? { ...card, h: card.w / card.aspect } : card;
}

const CardView: React.FC<{ card: Card; index: number; seed: string; frame: number; fps: number; width: number; height: number; dither: boolean }> = ({ card, index, seed, frame, fps, width, height, dither }) => {
  const { spec } = useEdit();
  const asset = assetOf(spec, card.asset);
  const local = frame - card.enterAt;
  if (local < 0 || !asset) return null;
  const r = (k: string) => random(`${seed}:card${index}:${k}`);
  const settle = spring({ frame: local, fps, config: { damping: 18, stiffness: 120 }, durationInFrames: 9 });
  const h = card.h ?? card.w * 0.75;
  const cx = card.x + card.w / 2;
  const cy = card.y + h / 2;
  // Start far out along the card's direction from center, and big.
  const dirX = cx - width / 2 || (r("dx") - 0.5) * 400;
  const dirY = cy - height / 2 || (r("dy") - 0.5) * 300;
  const fromScale = 2.2 + r("s") * 0.8;
  const scale = interpolate(settle, [0, 1], [fromScale, 1]);
  const dx = interpolate(settle, [0, 1], [dirX * 1.8, 0]) + Math.sin(frame / 9 + r("p") * 6) * 10;
  const dy = interpolate(settle, [0, 1], [dirY * 1.8, 0]) + Math.cos(frame / 11 + r("q") * 6) * 6;
  const block = 14;
  return (
    <div
      style={{
        position: "absolute",
        left: card.x,
        top: card.y,
        width: card.w,
        height: h,
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        boxShadow: dither ? undefined : `0 0 46px ${alpha(spec.brand.palette.fg, 0.16)}`,
        overflow: "hidden",
      }}
    >
      {dither ? (
        <Img
          src={mediaUrl(asset)}
          style={{ width: card.w / block, height: h / block, transform: `scale(${block})`, transformOrigin: "0 0", imageRendering: "pixelated", filter: "grayscale(1) contrast(5) brightness(1.1)", objectFit: "cover" }}
        />
      ) : (
        <Img src={mediaUrl(asset)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </div>
  );
};

const SchematicGrid: React.FC<{ seed: string; width: number; height: number; timecodes: boolean; mono: string; fg: string }> = ({ seed, width, height, timecodes, mono, fg }) => {
  const step = 78;
  const crosses: React.ReactNode[] = [];
  for (let y = 20; y < height; y += step) {
    for (let x = 65; x < width; x += step) {
      const ring = random(`${seed}:o${x}:${y}`) < 0.06;
      crosses.push(
        ring ? (
          <div key={`${x}-${y}`} style={{ position: "absolute", left: x - 6, top: y - 6, width: 12, height: 12, borderRadius: "50%", border: `1.5px solid ${alpha(fg, 0.35)}` }} />
        ) : (
          <div key={`${x}-${y}`} style={{ position: "absolute", left: x - 4, top: y - 4, width: 9, height: 9, opacity: 0.35, background: `linear-gradient(${fg},${fg}) center/1.5px 100% no-repeat, linear-gradient(${fg},${fg}) center/100% 1.5px no-repeat` }} />
        ),
      );
    }
  }
  // Circuit traces: a straight run, a 45° jog, a terminal dot.
  const traces = Array.from({ length: 9 }, (_, i) => {
    const r = (k: string) => random(`${seed}:tr${i}:${k}`);
    const x = r("x") * width;
    const y = r("y") * height;
    const len = 120 + r("l") * 260;
    const dir = r("d") < 0.5 ? 1 : -1;
    const diag = 80 + r("g") * 200;
    return `M ${x} ${y} h ${len * dir} l ${diag * dir} ${-diag}`;
  });
  const codes = timecodes
    ? Array.from({ length: 6 }, (_, i) => {
        const r = (k: string) => random(`${seed}:tc${i}:${k}`);
        const text = `[${String(Math.floor(r("a") * 30)).padStart(2, "0")}:${String(Math.floor(r("b") * 99)).padStart(2, "0")}]`;
        return { x: r("x") * (width - 120), y: 40 + r("y") * (height - 80), text };
      })
    : [];
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, ${alpha(fg, 0.05)}, transparent 60%)` }} />
      {crosses}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {traces.map((d, i) => (
          <g key={i}>
            <path d={d} stroke={alpha(fg, 0.3)} strokeWidth={1.5} fill="none" />
            <circle cx={Number(d.split(" ")[1])} cy={Number(d.split(" ")[2])} r={6} stroke={alpha(fg, 0.4)} strokeWidth={1.5} fill="none" />
          </g>
        ))}
      </svg>
      {codes.map((c, i) => (
        <div key={i} style={{ position: "absolute", left: c.x, top: c.y, fontFamily: mono, fontSize: 16, color: alpha(fg, 0.55) }}>
          {c.text}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// Thin honeycomb lines with a few cells lit, slowly breathing.
const Honeycomb: React.FC<{ seed: string; width: number; height: number; frame: number; fg: string }> = ({ seed, width, height, frame, fg }) => {
  const r = 46;
  const w = Math.sqrt(3) * r;
  const cells: React.ReactNode[] = [];
  for (let row = -1; row * r * 1.5 < height + r; row++) {
    for (let col = -1; col * w < width + w; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0);
      const cy = row * r * 1.5;
      const pts = Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      }).join(" ");
      const lit = random(`${seed}:hx${row}:${col}`) < 0.05;
      const pulse = lit ? 0.06 + 0.06 * Math.sin(frame / 5 + random(`${seed}:hp${row}:${col}`) * 6) : 0;
      cells.push(<polygon key={`${row}-${col}`} points={pts} fill={lit ? alpha(fg, pulse) : "none"} stroke={alpha(fg, 0.16)} strokeWidth={1.2} />);
    }
  }
  return (
    <AbsoluteFill>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {cells}
      </svg>
    </AbsoluteFill>
  );
};

// Editorial ruled paper: fine horizontal rules, a margin line, a ruler scale
// along the bottom and index numbers in the margin.
const Rules: React.FC<{ seed: string; width: number; height: number; frame: number; mono: string; fg: string; timecodes: boolean }> = ({ seed, width, height, frame, mono, fg, timecodes }) => {
  const gap = 54;
  const margin = 150 + random(`${seed}:m`) * 60;
  const lines: React.ReactNode[] = [];
  for (let y = gap; y < height; y += gap) lines.push(<line key={`h${y}`} x1={0} x2={width} y1={y} y2={y} stroke={alpha(fg, 0.1)} strokeWidth={1} />);
  for (let x = 0; x < width; x += 24) lines.push(<line key={`t${x}`} x1={x} x2={x} y1={height - 40} y2={height - (x % 120 ? 52 : 70)} stroke={alpha(fg, 0.3)} strokeWidth={1} />);
  const sweep = (frame * 18) % width;
  return (
    <AbsoluteFill>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {lines}
        <line x1={margin} x2={margin} y1={0} y2={height} stroke={alpha(fg, 0.25)} strokeWidth={1.5} />
        <line x1={sweep} x2={sweep} y1={0} y2={height} stroke={alpha(fg, 0.12)} strokeWidth={2} />
      </svg>
      {timecodes &&
        Array.from({ length: Math.floor(height / gap) - 1 }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: margin - 70, top: (i + 1) * gap - 22, fontFamily: mono, fontSize: 14, color: alpha(fg, 0.45) }}>
            {String(i + 1).padStart(3, "0")}
          </div>
        ))}
    </AbsoluteFill>
  );
};
