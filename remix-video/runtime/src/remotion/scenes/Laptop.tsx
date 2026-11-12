import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import { MarkFillSpec } from "../../spec/schema";
import { alpha, paint } from "../lib/color";
import { mediaUrl, useAsset, useEdit } from "../lib/context";
import { MarkShape } from "../lib/mark";
import { MediaFill } from "./Basic";
import type { z } from "zod";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;
type MarkFill = z.infer<typeof MarkFillSpec>;

// The mark cut out of a run of images, spinning in on a spring. From
// `shrinkAt` it shrinks and the imagery gives way to a solid tint.
export const FilledMark: React.FC<{ mark: MarkFill; frame: number }> = ({ mark, frame }) => {
  const { fps } = useVideoConfig();
  const { spec } = useEdit();
  const fills = mark.fills.map((id) => spec.assets.find((a) => a.id === id)).filter((a) => a !== undefined);
  const fill = fills.length ? fills[Math.floor(frame / mark.every) % fills.length] : undefined;
  const arrive = spring({ frame, fps, durationInFrames: Math.max(2, mark.spinFrames), config: { damping: 16 } });
  const shrink = mark.shrinkAt === undefined ? 0 : interpolate(frame, [mark.shrinkAt, mark.shrinkAt + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const size = interpolate(shrink, [0, 1], [mark.size, mark.shrinkTo]);
  const rotate = (1 - arrive) * mark.spinFrom;
  const scale = interpolate(arrive, [0, 1], [0.6, 1]);
  return (
    <div style={{ transform: `rotate(${rotate}deg) scale(${scale})`, opacity: Math.min(1, 0.35 + arrive * 1.6) }}>
      <MarkShape size={size}>
        <div style={{ position: "absolute", inset: 0, background: paint(spec.brand.palette, mark.tint) }} />
        {fill && (
          <div style={{ position: "absolute", inset: 0, opacity: 1 - shrink }}>
            {fill.type === "video" ? <MediaFill asset={fill} /> : <Img src={mediaUrl(fill)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
        )}
      </MarkShape>
    </div>
  );
};

export const MarkFillScene: React.FC<{ scene: Of<"markFill"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { spec } = useEdit();
  const asset = useAsset(scene.asset);
  if (asset?.baked.includes("*")) return <MediaFill asset={asset} />;
  return (
    <AbsoluteFill style={{ background: paint(spec.brand.palette, scene.color ?? "bg") }}>
      <div style={{ position: "absolute", left: `${scene.mark.x * 100}%`, top: `${scene.mark.y * 100}%`, transform: "translate(-50%, -50%)" }}>
        <FilledMark mark={scene.mark} frame={frame} />
      </div>
    </AbsoluteFill>
  );
};

// Footage behind a laptop drawn in code. The lid turns on a 3D axis, the
// screen plays app screenshots (each pushing in, crossfading on its `at`)
// or the filled mark, and the whole frame pushes in like a slow dolly.
export const Laptop: React.FC<{ scene: Of<"laptop"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec } = useEdit();
  const asset = useAsset(scene.asset);
  if (!asset) throw new Error(`scene ${scene.id}: missing asset ${scene.asset}`);
  if (asset.baked.includes("*")) return <MediaFill asset={asset} />;
  const t = scene.duration > 1 ? frame / (scene.duration - 1) : 0;
  const zoom = interpolate(t, [0, 1], [scene.zoomFrom, scene.zoomTo]);
  const drift = scene.driftX * t;
  // Never expose the frame edge while drifting.
  const cover = 1 + (2 * Math.abs(drift)) / width + 0.002;
  const d = scene.device;
  const sw = d.w * width;
  const sh = sw / 1.6;
  const bezel = sw * 0.022;
  const silver = d.tone === "silver";
  const rim = silver ? "#c7c9cd" : "#3a3b3f";
  const deck = silver ? "linear-gradient(180deg, #e4e5e8 0%, #b9bbc0 55%, #8d9095 100%)" : "linear-gradient(180deg, #55575c 0%, #2c2d31 60%, #1b1c1f 100%)";
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: spec.brand.palette.fg }}>
      <AbsoluteFill style={{ transform: `translateX(${drift}px) scale(${Math.max(cover, zoom)})` }}>
        <AbsoluteFill style={{ filter: scene.blur || scene.dim ? `blur(${scene.blur}px) brightness(${1 - scene.dim})` : undefined, transform: `${scene.blur ? "scale(1.03)" : ""}${scene.flip ? " scaleX(-1)" : ""}` || undefined }}>
          <MediaFill asset={asset} offset={0} />
        </AbsoluteFill>
        {scene.scrim > 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at 0% 100%, ${alpha(spec.brand.palette.fg, scene.scrim)} 0%, ${alpha(spec.brand.palette.fg, scene.scrim * 0.4)} 45%, transparent 75%)` }} />}
        {scene.surface && <Surface color={paint(spec.brand.palette, scene.surface)} light={spec.brand.palette.bg} top={d.y * height + sh / 2 + bezel * 1.6 + sw * 0.012} cx={d.x * width} sw={sw} />}
        <div style={{ position: "absolute", left: d.x * width - sw / 2 - bezel, top: d.y * height - sh / 2 - bezel, perspective: sw * 3 }}>
          <div style={{ transform: `rotateY(${d.turn}deg)`, transformOrigin: "50% 100%", transformStyle: "preserve-3d" }}>
            {/* Lid: glass bezel inside a thin metal rim. */}
            <div
              style={{
                position: "relative",
                width: sw + bezel * 2,
                height: sh + bezel * 2.6,
                borderRadius: bezel * 1.4,
                background: "#0c0c0e",
                border: `${Math.max(2, sw * 0.003)}px solid ${rim}`,
                boxShadow: `0 ${sw * 0.04}px ${sw * 0.08}px ${alpha("#000000", 0.35)}`,
              }}
            >
              <div style={{ position: "absolute", left: bezel, top: bezel, width: sw, height: sh, overflow: "hidden", borderRadius: bezel * 0.35, background: scene.screenColor }}>
                <ScreenContent scene={scene} frame={frame} sw={sw} sh={sh} />
                {/* Glass: a faint sheen across the top corner. */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 28%, transparent 45%)" }} />
              </div>
            </div>
            {/* Deck: the base seen just above its front edge. */}
            <div style={{ position: "relative", left: -sw * 0.06, width: sw * 1.12 + bezel * 2, height: sw * 0.028, marginTop: -2, background: deck, clipPath: "polygon(2% 0, 98% 0, 100% 70%, 99% 100%, 1% 100%, 0 70%)" }}>
              <div style={{ position: "absolute", left: "44%", width: "12%", top: 0, height: "35%", background: alpha("#000000", 0.18), borderRadius: `0 0 ${sw * 0.01}px ${sw * 0.01}px` }} />
            </div>
            <div style={{ position: "relative", left: 0, width: sw * 1.0, height: sw * 0.03, margin: "0 auto", background: `radial-gradient(ellipse at 50% 0%, ${alpha("#000000", 0.45)} 0%, transparent 70%)`, filter: `blur(${sw * 0.008}px)` }} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// A tabletop from just under the laptop's front edge to the bottom of the
// frame: a lit front edge, then the screen's glow pooling on the surface.
const Surface: React.FC<{ color: string; light: string; top: number; cx: number; sw: number }> = ({ color, light, top, cx, sw }) => (
  <div style={{ position: "absolute", left: -200, right: -200, top, bottom: -200, background: color }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: alpha(light, 0.08) }} />
    <div style={{ position: "absolute", left: cx + 200 - sw * 0.7, width: sw * 1.4, top: 0, height: sw * 0.35, background: `radial-gradient(ellipse 50% 60% at 50% 0%, ${alpha(light, 0.14)} 0%, transparent 70%)` }} />
  </div>
);

const ScreenContent: React.FC<{ scene: Of<"laptop">; frame: number; sw: number; sh: number }> = ({ scene, frame, sw, sh }) => {
  const { spec } = useEdit();
  const dark = scene.darkAt !== undefined && frame >= scene.darkAt;
  const fade = 5;
  if (dark && scene.mark) {
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", left: `${scene.mark.x * 100}%`, top: `${scene.mark.y * 100}%`, transform: "translate(-50%, -50%)" }}>
          <FilledMark mark={{ ...scene.mark, size: scene.mark.size * (sh / 1080) }} frame={frame - scene.darkAt!} />
        </div>
      </AbsoluteFill>
    );
  }
  if (dark) return null;
  return (
    <>
      {scene.shots.map((shot, i) => {
        const next = scene.shots[i + 1]?.at ?? Infinity;
        if (frame < shot.at || frame >= next + fade) return null;
        const a = spec.assets.find((x) => x.id === shot.asset);
        if (!a) return null;
        const local = frame - shot.at;
        const span = Math.min(next, scene.darkAt ?? scene.duration) - shot.at;
        const push = 1 + shot.push * Math.min(1, local / Math.max(1, span));
        const opacity = i === 0 ? 1 : interpolate(local, [0, fade], [0, 1], { extrapolateRight: "clamp" });
        return (
          <div key={i} style={{ position: "absolute", inset: 0, opacity }}>
            <Img src={mediaUrl(a)} style={{ position: "absolute", left: 0, top: 0, width: sw, height: sh, objectFit: "cover", objectPosition: "50% 0%", transformOrigin: "50% 0%", transform: `scale(${push})` }} />
          </div>
        );
      })}
    </>
  );
};
