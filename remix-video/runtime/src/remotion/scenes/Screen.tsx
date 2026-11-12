import type React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import { alpha } from "../lib/color";
import { useAsset, useEdit } from "../lib/context";
import { MediaFill } from "./Basic";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;

// A photo of a computer with a live terminal on its screen. The image and
// the terminal share one transform, so the push-in carries the text with
// the glass. Lines type in on their own frames; from `glitchFrom` coloured
// blocks tear across the screen, thickening toward the end.
export const Screen: React.FC<{ scene: Of<"screen"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { fonts } = useEdit();
  const asset = useAsset(scene.asset);
  if (!asset) throw new Error(`scene ${scene.id}: missing asset ${scene.asset}`);
  const t = scene.duration > 1 ? frame / (scene.duration - 1) : 0;
  // A verbatim source cut already has the push-in in its pixels.
  const verbatim = asset.baked.includes("*");
  const zoom = verbatim ? 1 : interpolate(t, [0, 1], [scene.zoomFrom, scene.zoomTo]);
  const box = { x: scene.screen.x * width, y: scene.screen.y * height, w: scene.screen.w * width, h: scene.screen.h * height };
  const size = box.h / 33;
  const visible = scene.script.filter((l) => frame >= l.at);
  // Keep the newest lines on screen, like a scrolling terminal.
  const rows = Math.floor(box.h / (size * 1.45)) - 1;
  const shown = visible.slice(-rows);
  const glitch = scene.glitchFrom === undefined ? 0 : interpolate(frame, [scene.glitchFrom, scene.duration], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tone = (k: Of<"screen">["script"][number]["tone"]) =>
    k === "dim" ? alpha(scene.textColor, 0.55) : k === "accent" ? "#9fd0ff" : k === "code" ? "#9be39b" : scene.textColor;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transformOrigin: `${scene.focus.x * width}px ${scene.focus.y * height}px`, transform: `scale(${zoom})` }}>
        <MediaFill asset={asset} />
        {!verbatim && (
          <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, background: scene.screenColor, borderRadius: box.h * 0.06, overflow: "hidden", boxShadow: `inset 0 0 ${box.h * 0.12}px rgba(0,0,0,0.65)` }}>
            <div style={{ position: "absolute", inset: `${box.h * 0.05}px ${box.w * 0.04}px`, fontFamily: fonts.mono, fontSize: size, lineHeight: 1.45, color: scene.textColor, whiteSpace: "pre", textShadow: `0 0 ${size * 0.4}px ${alpha(scene.textColor, 0.35)}` }}>
              {shown.map((l, i) => {
                const n = l.type === 0 ? l.text.length : Math.ceil(interpolate(frame - l.at, [0, l.type], [0, l.text.length], { extrapolateRight: "clamp" }));
                const text = l.text.slice(0, n);
                return (
                  <div key={i} style={{ color: tone(l.tone), border: l.tone === "box" ? `1px solid ${alpha(scene.textColor, 0.5)}` : undefined, padding: l.tone === "box" ? `0 ${size * 0.4}px` : undefined }}>
                    {text}
                    {i === shown.length - 1 && Math.floor(frame / 8) % 2 === 0 ? "▌" : ""}
                  </div>
                );
              })}
            </div>
            {glitch > 0 &&
              Array.from({ length: Math.round(6 + glitch * 90) }, (_, i) => {
                const r = (k: string) => random(`${scene.id}:g${i}:${Math.floor(frame / 2)}:${k}`);
                if (r("on") > 0.45 + glitch * 0.55) return null;
                const colors = ["#3b2a6b", "#1f5a3a", "#5a2440", "#2b4f7a", "#6a6a2a", "#1d1d1d"];
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: r("x") * box.w,
                      top: r("y") * box.h,
                      width: (0.05 + r("w") * 0.35) * box.w,
                      height: (0.015 + r("h") * 0.05) * box.h,
                      background: colors[Math.floor(r("c") * colors.length)],
                      opacity: 0.55 + r("o") * 0.4,
                      mixBlendMode: "screen",
                    }}
                  />
                );
              })}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
