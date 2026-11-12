import type React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Asset, Scene } from "../../spec/schema";
import { paint } from "../lib/color";
import { mediaUrl, useAsset, useEdit } from "../lib/context";
import { BrandMark, HexagonMark } from "../lib/mark";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;

export const Solid: React.FC<{ scene: Of<"solid"> }> = ({ scene }) => {
  const { spec } = useEdit();
  return <AbsoluteFill style={{ background: paint(spec.brand.palette, scene.color ?? "bg") }} />;
};

// One image or video asset, filling the frame, with an optional push/pan.
export const MediaFill: React.FC<{ asset: Asset; style?: React.CSSProperties; fit?: "cover" | "contain"; offset?: number }> = ({ asset, style, fit = "cover", offset = 0 }) => {
  const css: React.CSSProperties = { width: "100%", height: "100%", ...style };
  return asset.type === "video" ? (
    <Video src={mediaUrl(asset)} trimBefore={asset.trimBefore + offset || undefined} playbackRate={asset.playbackRate} muted objectFit={fit} style={css} />
  ) : (
    <Img src={mediaUrl(asset)} style={{ ...css, objectFit: fit }} />
  );
};

export const Media: React.FC<{ scene: Of<"media"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const asset = useAsset(scene.asset);
  if (!asset) throw new Error(`scene ${scene.id}: missing asset ${scene.asset}`);
  const t = scene.duration > 1 ? frame / (scene.duration - 1) : 0;
  const { width, height } = useVideoConfig();
  // Never let a pan expose the frame edge: zoom at least enough to cover it.
  const cover = 1 + 2 * Math.max(Math.abs(scene.panX * t) / width, Math.abs(scene.panY * t) / height) + 0.002;
  const zoom = Math.max(cover, interpolate(t, [0, 1], [scene.zoomFrom, scene.zoomTo]));
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${scene.panX * t}px, ${scene.panY * t}px) scale(${zoom})` }}>
        <MediaFill asset={asset} fit={scene.fit} offset={scene.trimBefore} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Cold open: the mark blinks on with chromatic fringing, a dotted scan line,
// a horizontal light streak, then a kaleidoscope of lens ghosts.
export const LogoFlash: React.FC<{ scene: Of<"logoFlash"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec } = useEdit();
  const fg = spec.brand.palette.fg;
  if (scene.style === "iris") return <IrisOpen scene={scene} />;
  const s = scene.streakAt;
  const phase = frame < s - 2 ? "dark" : frame < s ? "mark" : frame < s + 2 ? "scan" : frame < s + 4 ? "streak" : "ghosts";
  const cx = width / 2;
  const cy = height / 2;
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg }}>
      {phase === "mark" && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 18px ${fg})` }}>
          {[
            ["#ff2a2a", -4],
            ["#2aff6a", 0],
            ["#3a5bff", 4],
          ].map(([c, dx]) => (
            <div key={c} style={{ position: "absolute", transform: `translateX(${dx}px)`, mixBlendMode: "screen" }}>
              <BrandMark size={scene.size} color={c as string} />
            </div>
          ))}
        </AbsoluteFill>
      )}
      {phase === "scan" && (
        <div
          style={{
            position: "absolute",
            left: width * 0.15,
            width: width * 0.7,
            top: cy - 10,
            height: 20,
            backgroundImage: `radial-gradient(circle, ${fg} 1.2px, transparent 1.6px)`,
            backgroundSize: "8px 8px",
            opacity: 0.35,
          }}
        />
      )}
      {phase === "streak" && (
        <AbsoluteFill>
          {/* Soft beam: a bright, rippled head on the left fanning out to the right edge. */}
          <AbsoluteFill style={{ filter: "blur(16px)", opacity: 0.9 }}>
            <div
              style={{
                position: "absolute",
                left: width * 0.21,
                right: 0,
                top: cy - height * 0.13,
                height: height * 0.26,
                background: `radial-gradient(ellipse 9% 42% at 4% 50%, ${fg} 0%, ${fg}aa 45%, transparent 100%), linear-gradient(90deg, ${fg}00, ${fg}bb 6%, ${fg}77 30%, ${fg}22 55%, ${fg}88 78%, ${fg}44)`,
                clipPath: "polygon(0 35%, 100% 0, 100% 100%, 0 65%)",
              }}
            />
          </AbsoluteFill>
          {[0.04, 0.07, 0.1].map((x) => (
            <div key={x} style={{ position: "absolute", left: width * (0.21 + x), top: cy - height * 0.07, width: 26, height: height * 0.14, borderRadius: "50%", borderLeft: `6px solid ${fg}`, opacity: 0.45, filter: "blur(3px)" }} />
          ))}
          {/* Speckle the beam like the halftone it came from. */}
          <AbsoluteFill style={{ backgroundImage: `radial-gradient(circle, transparent 1px, ${spec.brand.palette.bg} 1.6px)`, backgroundSize: "5px 5px", opacity: 0.45 }} />
        </AbsoluteFill>
      )}
      {phase === "ghosts" && (
        <AbsoluteFill>
          {[0.1, 0.37, 0.63, 0.9].map((x) => (
            <div key={x} style={{ position: "absolute", left: width * x - 22, top: cy - 70, width: 44, height: 140, borderRadius: "50%", border: `3px solid ${fg}`, boxShadow: `0 0 30px ${fg}, inset 0 0 20px ${fg}`, opacity: 0.55 }} />
          ))}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// The mark alone, centered in a soft bloom, growing in on a spring.
export const LogoGlow: React.FC<{ scene: Of<"logoGlow"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spec } = useEdit();
  const grow = spring({ frame, fps, durationInFrames: Math.max(2, scene.growFrames), config: { damping: 14 } });
  const scale = interpolate(grow, [0, 1], [0.55, 1]);
  const fg = spec.brand.palette.fg;
  if (scene.style === "pulse") {
    return (
      <AbsoluteFill style={{ background: spec.brand.palette.bg, alignItems: "center", justifyContent: "center" }}>
        {[0, 1, 2, 3].map((k) => {
          const p = ((frame + k * 6) % 24) / 24;
          return <div key={k} style={{ position: "absolute", width: scene.size * (1.4 + p * 5), height: scene.size * (1.4 + p * 5), borderRadius: "50%", border: `1.5px solid ${fg}`, opacity: (1 - p) * 0.5 * Math.min(1, frame / 3) }} />;
        })}
        <div style={{ transform: `scale(${scale})` }}>
          <BrandMark size={scene.size} />
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg, alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, ${fg}26 0%, ${fg}0d 18%, transparent 42%)` }} />
      <div style={{ transform: `scale(${scale})`, filter: `drop-shadow(0 0 10px ${fg}cc) drop-shadow(0 0 40px ${fg}66)` }}>
        <BrandMark size={scene.size} />
      </div>
    </AbsoluteFill>
  );
};

// Lockup image when the brand has one; otherwise mark + wordmark in code.
export const EndCard: React.FC<{ scene: Of<"endCard"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { spec, fonts } = useEdit();
  const lockup = useAsset(spec.brand.lockup);
  const opacity = scene.fadeIn > 0 ? interpolate(frame, [0, scene.fadeIn], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }) : 1;
  const h = scene.lockupHeight;
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg, alignItems: "center", justifyContent: "center", opacity }}>
      {lockup ? (
        <Img src={mediaUrl(lockup)} style={{ height: h, width: "auto" }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: h * 0.18 }}>
          {scene.markless ? null : spec.brand.mark === "hexagon" ? <HexagonMark size={h} color={spec.brand.palette.fg} /> : <BrandMark size={h} />}
          <span style={{ fontFamily: fonts.wordmark, fontSize: h * 0.82, fontWeight: spec.brand.wordmarkWeight, color: spec.brand.palette.fg, letterSpacing: "-0.01em", lineHeight: 1 }}>
            {spec.brand.wordmark}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};

// Cold open, iris style: concentric rings close in to a point, the mark
// appears at the center, then the rings open outward like an aperture.
const IrisOpen: React.FC<{ scene: Of<"logoFlash"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec } = useEdit();
  const fg = spec.brand.palette.fg;
  const close = interpolate(frame, [0, scene.streakAt], [1, 0.05], { extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const open = interpolate(frame, [scene.streakAt, scene.duration], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const span = Math.hypot(width, height) / 2;
  const markOn = frame >= scene.streakAt - 2;
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg, alignItems: "center", justifyContent: "center" }}>
      {[0.25, 0.45, 0.65, 0.85, 1].map((k) => {
        const r = span * k * (frame < scene.streakAt ? close : 0.05 + open * 1.1);
        return <div key={k} style={{ position: "absolute", width: r * 2, height: r * 2, borderRadius: "50%", border: `${1 + k * 2}px solid ${fg}`, opacity: 0.25 + (1 - k) * 0.4 }} />;
      })}
      {markOn && (
        <div style={{ transform: `scale(${0.8 + open * 0.3})`, opacity: 1 - open * 0.4 }}>
          <BrandMark size={scene.size} />
        </div>
      )}
    </AbsoluteFill>
  );
};
