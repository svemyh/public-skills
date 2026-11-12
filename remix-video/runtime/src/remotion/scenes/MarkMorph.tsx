import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import { alpha, paint } from "../lib/color";
import { mediaUrl, useAsset, useEdit } from "../lib/context";
import { BrandMark } from "../lib/mark";
import { glyphOf } from "./UiPanel";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;
type Track = [number, number][];

// A keyframe track at a scene frame, eased between keys and held past the ends.
function at(track: Track, frame: number): number {
  if (track.length === 1) return track[0]![1];
  return interpolate(frame, track.map((k) => k[0]), track.map((k) => k[1]), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
}

// The mark on a field, driven by keyframe tracks: it grows from a dot, the
// wordmark's letters arrive beside it and fade, it slides, scales and spins,
// then hands off to a partner mark (an image or a Lucide glyph).
export const MarkMorph: React.FC<{ scene: Of<"markMorph"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec, fonts } = useEdit();
  const pal = spec.brand.palette;
  const ink = paint(pal, scene.ink);
  const size = at(scene.size, frame);
  const opacity = at(scene.opacity, frame);
  const spin = at(scene.spin, frame);
  const x = at(scene.x, frame);
  const y = at(scene.y, frame);
  const flat = scene.flatten
    ? interpolate(frame, [scene.flatten.at, scene.flatten.at + scene.flatten.frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) })
    : 0;
  const word = scene.wordmark;
  // With a wordmark, `x` centers the whole lockup; the row closes up around
  // the mark as the letters leave, so the mark slides to `x`.
  let markX = x;
  let wordLeft = 0;
  if (word) {
    const box = spec.brand.mark === "asset" ? size * 1.25 : size * 0.88;
    const close = interpolate(frame, [word.outAt, word.outAt + word.outFrames + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
    const row = box + close * (word.gap + textWidth(word.text, fonts.wordmark, spec.brand.wordmarkWeight, word.size));
    markX = x - row / 2 + box / 2;
    wordLeft = markX + box / 2 + word.gap;
  }
  return (
    <AbsoluteFill style={{ background: paint(pal, scene.colors.bottom), overflow: "hidden" }}>
      <Field scene={scene} frame={frame} />
      {flat > 0 && <AbsoluteFill style={{ background: paint(pal, scene.flatten!.color), opacity: flat }} />}
      {size > 0.5 && opacity > 0.01 && (
        <div style={{ position: "absolute", left: markX, top: y, transform: `translate(-50%, -50%) rotate(${spin}deg)`, opacity, display: "flex" }}>
          <BrandMark size={size} color={ink} />
        </div>
      )}
      {word && <Letters word={word} frame={frame} ink={ink} font={fonts.wordmark} weight={spec.brand.wordmarkWeight} left={wordLeft} y={y} />}
      {scene.partner && <Partner partner={scene.partner} frame={frame} ink={ink} x={width / 2} y={height / 2} />}
    </AbsoluteFill>
  );
};

// Rendered width of a line at the wordmark's -0.02em tracking.
let canvas: CanvasRenderingContext2D | null = null;
function textWidth(text: string, family: string, weight: number, size: number): number {
  canvas ??= document.createElement("canvas").getContext("2d");
  if (!canvas) return text.length * size * 0.6;
  canvas.font = `${weight} ${size}px ${family}`;
  return canvas.measureText(text).width - 0.02 * size * text.length;
}

// The wordmark's letters after the mark, arriving one after another over
// `spread` frames, and fading together from `outAt`.
const Letters: React.FC<{ word: NonNullable<Of<"markMorph">["wordmark"]>; frame: number; ink: string; font: string; weight: number; left: number; y: number }> = ({ word, frame, ink, font, weight, left, y }) => {
  const out = interpolate(frame, [word.outAt, word.outAt + word.outFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (out <= 0) return null;
  return (
    <div style={{ position: "absolute", left, top: y, transform: "translateY(-50%)", display: "flex", fontFamily: font, fontWeight: weight, fontSize: word.size, lineHeight: 1, color: ink, opacity: out, letterSpacing: "-0.02em" }}>
      {[...word.text].map((ch, i) => {
        const t = interpolate(frame - word.enterAt - (word.text.length > 1 ? (i * word.spread) / (word.text.length - 1) : 0), [0, word.settle], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        const dy = word.enter === "rise" ? (1 - t) * word.size * 0.35 : word.enter === "drop" ? -(1 - t) * word.size * 0.35 : 0;
        const blur = word.enter === "blur" ? (1 - t) * 16 : 0;
        const spread = word.enter === "track" ? (1 - t) * word.size * 0.5 : 0;
        return (
          <span key={i} style={{ display: "inline-block", opacity: t, transform: `translate(${spread}px, ${dy}px)`, filter: blur ? `blur(${blur}px)` : undefined }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};

const Partner: React.FC<{ partner: NonNullable<Of<"markMorph">["partner"]>; frame: number; ink: string; x: number; y: number }> = ({ partner, frame, ink, x, y }) => {
  const asset = useAsset(partner.asset);
  const size = at(partner.size, frame);
  const opacity = at(partner.opacity, frame);
  if (size < 0.5 || opacity < 0.01) return null;
  const Icon = partner.glyph ? glyphOf(partner.glyph) : undefined;
  if (partner.glyph && !Icon) throw new Error(`unknown Lucide icon "${partner.glyph}"`);
  const box: React.CSSProperties = { position: "absolute", left: x, top: y, width: size, height: size, transform: `translate(-50%, -50%) rotate(${at(partner.spin, frame)}deg)`, opacity };
  if (Icon) return <div style={box}><Icon size={size} color={ink} strokeWidth={1.8} /></div>;
  if (!asset) return null;
  // The partner image is a silhouette: its alpha masks a fill in the ink color.
  const mask = `url("${mediaUrl(asset)}")`;
  return partner.tint ? (
    <div style={{ ...box, background: ink, maskImage: mask, WebkitMaskImage: mask, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />
  ) : (
    <Img src={mediaUrl(asset)} style={{ ...box, objectFit: "contain" }} />
  );
};

// The ground: a soft sky (two-tone gradient with a drifting glow), a flat
// color, a hairline honeycomb, or concentric rings, all in palette colors.
const Field: React.FC<{ scene: Of<"markMorph">; frame: number }> = ({ scene, frame }) => {
  const { width, height } = useVideoConfig();
  const { spec } = useEdit();
  const pal = spec.brand.palette;
  const top = paint(pal, scene.colors.top);
  const bottom = paint(pal, scene.colors.bottom);
  const glow = paint(pal, scene.colors.glow);
  const t = scene.duration > 1 ? frame / (scene.duration - 1) : 0;
  const gx = interpolate(t, [0, 1], [scene.glow.from.x, scene.glow.to.x]) * width;
  const gy = interpolate(t, [0, 1], [scene.glow.from.y, scene.glow.to.y]) * height;
  const gr = interpolate(t, [0, 1], [scene.glow.from.r, scene.glow.to.r]) * width;
  if (scene.field === "flat") return null;
  if (scene.field === "sky") {
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse ${gr}px ${gr * 0.55}px at ${gx}px ${gy}px, ${alpha(glow, 0.95)}, ${alpha(glow, 0)} 100%), linear-gradient(180deg, ${top} 0%, ${bottom} 55%, ${bottom} 100%)`,
        }}
      />
    );
  }
  if (scene.field === "grid") {
    // Pointy-top hexagon cells in hairlines, drifting slowly up.
    const r = 70;
    const w = Math.sqrt(3) * r;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${r * 3}" viewBox="0 0 ${w} ${r * 3}"><g fill="none" stroke="${top}" stroke-width="1.2"><path d="M${w / 2} 0 L${w} ${r / 2} L${w} ${r * 1.5} L${w / 2} ${r * 2} L0 ${r * 1.5} L0 ${r / 2} Z"/><path d="M${w / 2} ${r * 2} L${w / 2} ${r * 3}"/></g></svg>`;
    return (
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(ellipse ${gr}px ${gr * 0.6}px at ${gx}px ${gy}px, ${alpha(glow, 0.5)}, ${alpha(glow, 0)}), url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
          backgroundPosition: `0 0, ${width / 2 - w / 2}px ${height / 2 - r - frame * 0.6}px`,
          opacity: 0.9,
        }}
      />
    );
  }
  // rings: concentric hairlines breathing outward from the center.
  const step = 90;
  const phase = (frame * 1.5) % step;
  const count = Math.ceil(Math.hypot(width, height) / 2 / step) + 1;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse ${gr}px ${gr * 0.6}px at ${gx}px ${gy}px, ${alpha(glow, 0.5)}, ${alpha(glow, 0)})` }}>
      <svg width={width} height={height}>
        {Array.from({ length: count }, (_, i) => (
          <circle key={i} cx={width / 2} cy={height / 2} r={i * step + phase} fill="none" stroke={top} strokeOpacity={0.55} strokeWidth={1.4} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};
