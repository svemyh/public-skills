import type React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import { alpha } from "../lib/color";
import { useEdit } from "../lib/context";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;

// A terminal transcript scrolling past at an angle, smeared horizontally,
// with a dim file-tree column; optionally flips to negative at `invertAt`.
export const CodeScroll: React.FC<{ scene: Of<"codeScroll"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec, fonts } = useEdit();
  const fg = spec.brand.palette.fg;
  const inverted = scene.invertAt !== undefined && frame >= scene.invertAt;
  const lineH = 34;
  const smear = `14px 0 8px ${fg}55, -14px 0 8px ${fg}33, 0 0 6px ${fg}88`;
  const sidebar = scene.sidebar.length
    ? scene.sidebar
    : Array.from({ length: 60 }, (_, i) => "▔".repeat(4 + Math.floor(random(`${scene.id}:sb${i}`) * 18)));
  return (
    <AbsoluteFill style={{ background: spec.brand.palette.bg, overflow: "hidden", filter: inverted ? "invert(1)" : undefined }}>
      <AbsoluteFill style={{ perspective: 1400 }}>
        <div
          style={{
            position: "absolute",
            left: width * 0.11,
            top: height * 0.02 - scene.speed * frame * 0.6,
            width: width * 0.12,
            transform: `rotateY(${scene.tilt}deg)`,
            transformOrigin: "0 50%",
            fontFamily: fonts.mono,
            fontSize: 13,
            lineHeight: "17px",
            color: fg,
            opacity: 0.45,
            textShadow: smear,
          }}
        >
          {sidebar.map((s, i) => (
            <div key={i} style={{ whiteSpace: "pre", opacity: 0.4 + random(`${scene.id}:so${i}`) * 0.6 }}>
              {s}
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: width * 0.255,
            top: height * 0.03 - scene.speed * frame,
            width: width * 0.9,
            transform: `rotateY(${scene.tilt}deg) rotateX(2deg)`,
            transformOrigin: "0 50%",
            fontFamily: fonts.mono,
            fontSize: 22,
            lineHeight: `${lineH}px`,
            color: fg,
            textShadow: smear,
            filter: "blur(0.4px)",
          }}
        >
          {scene.lines.map((line, i) => (
            <div key={i} style={{ whiteSpace: "pre", fontWeight: /^[●>•#]/.test(line.trim()) ? 700 : 400, opacity: line.startsWith("  ") ? 0.8 : 1 }}>
              {line || " "}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(90deg, ${alpha(spec.brand.palette.bg, 0.85)}, transparent 12%, transparent 85%, ${alpha(spec.brand.palette.bg, 0.6)})` }} />
    </AbsoluteFill>
  );
};
