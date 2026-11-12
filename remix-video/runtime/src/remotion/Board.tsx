import type React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { Section } from "../spec/schema";

// A review board: variant renders side by side in sync, each tile labeled
// with the code of the part on screen (s3b = section 3 of variant b), a
// banner at every section change, and a timeline of all sections. Pick
// codes from it, then `vrea compose`.
export type BoardProps = {
  title: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  sections: Section[];
  tiles: { key: string; name: string; src: string }[];
  // Which tile's soundtrack plays.
  audio: string;
};

const INK = "#f4f4f0";
const BG = "#0b0b0c";
const HI = "#ffd23f";

export const Board: React.FC<BoardProps> = ({ title, sections, tiles, audio, durationInFrames }) => {
  const frame = useCurrentFrame();
  const index = Math.max(0, sections.findIndex((s) => frame >= s.from && frame < s.from + s.duration));
  const section = sections[index]!;
  const since = frame - section.from;
  const banner = interpolate(since, [0, 2, 12, 16], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const W = 960;
  const H = 540;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: "Helvetica, Arial, sans-serif", color: INK }}>
      {tiles.map((t, i) => {
        const x = (i % 2) * W;
        const y = Math.floor(i / 2) * H;
        return (
          <div key={t.key} style={{ position: "absolute", left: x, top: y, width: W, height: H, overflow: "hidden" }}>
            <Video src={staticFile(t.src)} muted={t.key !== audio} objectFit="cover" style={{ width: W, height: H }} />
            <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 ${6 * banner}px ${HI}` }} />
            <div style={{ position: "absolute", left: 14, top: 12, display: "flex", alignItems: "baseline", gap: 12, background: "rgba(0,0,0,0.72)", padding: "6px 14px", borderRadius: 8 }}>
              <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.02em", color: HI }}>
                {section.id}
                {t.key}
              </span>
              <span style={{ fontSize: 22, opacity: 0.9 }}>
                {t.name} · {section.name}
                {t.key === audio ? "  ♪" : ""}
              </span>
            </div>
          </div>
        );
      })}
      <InfoPanel title={title} sections={sections} index={index} frame={frame} total={durationInFrames} tiles={tiles} audio={audio} x={W} y={H} w={W} h={H} />
      {banner > 0 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ opacity: banner, transform: `scale(${0.9 + banner * 0.1})`, background: HI, color: BG, padding: "14px 34px", borderRadius: 14, fontSize: 52, fontWeight: 800 }}>
            {section.id} · {section.name} <span style={{ fontWeight: 400, fontSize: 30 }}>@ f{section.from}</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const InfoPanel: React.FC<{ title: string; sections: Section[]; index: number; frame: number; total: number; tiles: BoardProps["tiles"]; audio: string; x: number; y: number; w: number; h: number }> = ({ title, sections, index, frame, total, tiles, audio, x, y, w, h }) => {
  const bar = w - 60;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, padding: 30, boxSizing: "border-box" }}>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 18, opacity: 0.7, marginTop: 6 }}>
        {tiles.map((t) => `${t.key} = ${t.name}`).join("   ·   ")}   ·   ♪ {audio}
      </div>
      <div style={{ position: "relative", height: 54, marginTop: 22 }}>
        {sections.map((s, i) => (
          <div key={s.id} style={{ position: "absolute", left: (s.from / total) * bar, width: (s.duration / total) * bar - 2, top: 0, height: 54, background: i === index ? HI : "rgba(255,255,255,0.12)", color: i === index ? BG : INK, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}>
            {s.id}
          </div>
        ))}
        <div style={{ position: "absolute", left: (frame / total) * bar, top: -6, width: 3, height: 66, background: "#ff4d4d" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 18px", marginTop: 24, fontSize: 19 }}>
        {sections.map((s, i) => (
          <div key={s.id} style={{ opacity: i === index ? 1 : 0.55, color: i === index ? HI : INK, fontWeight: i === index ? 700 : 400 }}>
            {s.id} {s.name} <span style={{ opacity: 0.6, fontSize: 15 }}>f{s.from}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 30, bottom: 24, fontSize: 17, opacity: 0.7, lineHeight: 1.5 }}>
        Codes are section + variant: s2b is section 2 of variant b.
        <br />
        Pick one per section, e.g. s1b s2a s3c …, then vrea compose.
      </div>
      <div style={{ position: "absolute", right: 30, top: 28, fontSize: 22, fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>f{frame}</div>
    </div>
  );
};
