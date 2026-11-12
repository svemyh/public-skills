import type React from "react";
import { useMemo } from "react";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, Img, interpolate, random, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CompiledFilm, LaunchScene } from "./schema";

const inter = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
function isLightHex(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = Number.parseInt(h.slice(0, 2), 16) / 255;
  const g = Number.parseInt(h.slice(2, 4), 16) / 255;
  const b = Number.parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62;
}

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (frame: number, at: number, frames: number) =>
  interpolate(frame, [at, at + frames], [0, 1], { ...clampOpts, easing: Easing.out(Easing.cubic) });

function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function hexPath(cx: number, cy: number, r: number, round = 0.14, sy = 0.972): string {
  const v = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a) * sy] as const;
  });
  const at = (p: readonly [number, number], q: readonly [number, number], t: number) => [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
  ];
  let d = "";
  v.forEach((p, i) => {
    const prev = v[(i + 5) % 6]!;
    const next = v[(i + 1) % 6]!;
    const a = at(p, prev, round);
    const b = at(p, next, round);
    d += `${i ? "L" : "M"}${a[0]!.toFixed(2)},${a[1]!.toFixed(2)} Q${p[0]!.toFixed(2)},${p[1]!.toFixed(2)} ${b[0]!.toFixed(2)},${b[1]!.toFixed(2)} `;
  });
  return d + "Z";
}

const HexBarsMark: React.FC<{ cx: number; cy: number; r: number; ink: string; paper: string }> = ({ cx, cy, r, ink, paper }) => {
  const w = 0.177 * r;
  const top = -0.516 * r;
  const h = 0.626 * r;
  return (
    <g transform={`translate(${cx},${cy})`}>
      <path d={hexPath(0, 0, r)} fill={ink} />
      <g fill={paper}>
        <rect x={0.068 * r - w / 2} y={top} width={w} height={h} rx={w / 2} />
        <rect x={0.432 * r - w / 2} y={top} width={w} height={h} rx={w / 2} />
      </g>
    </g>
  );
};

function cssFont(name: string): string {
  if (!name || name.toLowerCase() === "inter") return `${inter.fontFamily}, "Helvetica Neue", Arial, sans-serif`;
  return `"${name}", ${inter.fontFamily}, "Helvetica Neue", Arial, sans-serif`;
}

export const LaunchFilm: React.FC<{ film: CompiledFilm }> = ({ film }) => {
  const frame = useCurrentFrame();
  const displayFont = cssFont(film.brand.fonts.display);
  const wordmarkFont = cssFont(film.brand.fonts.wordmark);
  const audioVol = film.audio
    ? film.audio.fadeOut > 0
      ? film.audio.volume *
        interpolate(frame, [film.durationInFrames - film.audio.fadeOut, film.durationInFrames - 1], [1, 0], clampOpts)
      : film.audio.volume
    : 0;
  return (
    <AbsoluteFill style={{ background: film.brand.palette.bg, color: film.brand.palette.fg, fontFamily: displayFont }}>
      {film.scenes.map((sc) => (
        <Sequence key={sc.id} from={sc.from} durationInFrames={sc.duration}>
          <SceneView scene={sc} film={film} wordmarkFont={wordmarkFont} />
        </Sequence>
      ))}
      {film.audio && <Audio src={staticFile(film.audio.src)} volume={audioVol} />}
    </AbsoluteFill>
  );
};

const SceneView: React.FC<{ scene: LaunchScene; film: CompiledFilm; wordmarkFont: string }> = ({ scene, film, wordmarkFont }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const pal = film.brand.palette;
  const out = scene.fadeOut > 0 ? interpolate(frame, [scene.duration - scene.fadeOut, scene.duration - 1], [1, 0], clampOpts) : 1;
  return (
    <AbsoluteFill style={{ background: pal.bg, color: pal.fg, overflow: "hidden", opacity: out }}>
      {scene.mosaic && <Mosaic m={scene.mosaic} markSrc={film.brand.markSrc} fg={pal.fg} frame={frame} w={width} h={height} />}
      {scene.hexes.map((h, i) => (
        <HexTile key={i} h={h} fg={pal.fg} frame={frame} />
      ))}
      {scene.window && <Window w={scene.window} fg={pal.fg} frame={frame} duration={scene.duration} />}
      {scene.headline && <Headline h={scene.headline} frame={frame} />}
      {scene.lockup && <Lockup l={scene.lockup} film={film} wordmarkFont={wordmarkFont} frame={frame} />}
      {scene.bigText && <BigText b={scene.bigText} frame={frame} />}
      {scene.card && <Card c={scene.card} film={film} frame={frame} />}
      {scene.wordmark && <Wordmark w={scene.wordmark} markSrc={film.brand.markSrc} wordmarkFont={wordmarkFont} frame={frame} />}
    </AbsoluteFill>
  );
};

const Headline: React.FC<{ h: NonNullable<LaunchScene["headline"]>; frame: number }> = ({ h, frame }) => {
  const t = ease(frame, h.at, 14);
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        right: 64,
        top: h.y - h.size * 0.58,
        textAlign: "center",
        fontSize: h.size,
        fontWeight: h.weight,
        letterSpacing: -h.size * 0.022,
        lineHeight: 1.18,
        whiteSpace: "nowrap",
        opacity: t,
        transform: `translateY(${(1 - t) * 12}px)`,
      }}
    >
      {h.text}
    </div>
  );
};

const Window: React.FC<{ w: NonNullable<LaunchScene["window"]>; fg: string; frame: number; duration: number }> = ({ w, fg, frame, duration }) => {
  const t = ease(frame, w.at, 12);
  const push = interpolate(frame, [0, Math.max(1, duration - 1)], [1, w.push], clampOpts);
  const url = staticFile(w.src);
  return (
    <div
      style={{
        position: "absolute",
        left: w.x,
        top: w.y,
        width: w.w,
        height: w.h,
        borderRadius: w.border ? w.radius : 0,
        overflow: w.border ? "hidden" : "visible",
        background: w.border ? "#101010" : "transparent",
        opacity: t,
        transform: `scale(${(0.985 + 0.015 * t) * push})`,
        transformOrigin: "center",
        boxShadow: w.border ? `0 0 0 1px ${alpha(fg, 0.14)}, 0 30px 90px rgba(0,0,0,0.6)` : undefined,
      }}
    >
      {w.isVideo ? (
        <Video src={url} muted objectFit={w.fit} style={{ width: "100%", height: "100%" }} />
      ) : (
        <Img src={url} style={{ width: "100%", height: "100%", objectFit: w.fit }} />
      )}
    </div>
  );
};

const Lockup: React.FC<{ l: NonNullable<LaunchScene["lockup"]>; film: CompiledFilm; wordmarkFont: string; frame: number }> = ({
  l,
  film,
  wordmarkFont,
  frame,
}) => {
  const pal = film.brand.palette;
  const t = ease(frame, l.at, 16);
  const tag = ease(frame, l.at + 10, 16);
  const s = l.size;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: l.y - s * 0.9,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: t,
        transform: `scale(${0.96 + 0.04 * t})`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: s * 0.22 }}>
        <Img src={staticFile(film.brand.markSrc)} style={{ height: s * 0.8, width: "auto" }} />
        <span style={{ fontFamily: wordmarkFont, fontSize: s, fontWeight: 400, letterSpacing: -s * 0.025, lineHeight: 1 }}>
          {film.brand.wordmark}
        </span>
      </div>
      {l.tagline && (
        <div style={{ marginTop: s * 0.26, fontSize: Math.round(s * 0.32), fontWeight: 400, color: alpha(pal.fg, 0.68), opacity: tag }}>
          {l.tagline}
        </div>
      )}
    </div>
  );
};

const BigText: React.FC<{ b: NonNullable<LaunchScene["bigText"]>; frame: number }> = ({ b, frame }) => {
  const t = ease(frame, b.at, 14);
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        right: 48,
        top: b.y - b.size * 0.6,
        textAlign: "center",
        fontSize: b.size,
        fontWeight: b.weight,
        letterSpacing: -b.size * 0.03,
        lineHeight: 1.15,
        whiteSpace: "nowrap",
        opacity: t,
        transform: `scale(${0.97 + 0.03 * t})`,
      }}
    >
      {b.text}
    </div>
  );
};

const Card: React.FC<{ c: NonNullable<LaunchScene["card"]>; film: CompiledFilm; frame: number }> = ({ c, film, frame }) => {
  const pal = film.brand.palette;
  const t = ease(frame, c.at, 14);
  const pressed = c.clickAt !== undefined && frame >= c.clickAt && frame < c.clickAt + 8;
  const showCursor = c.clickAt !== undefined && frame >= c.at + 6;
  const moveEnd = (c.clickAt ?? 40) - 6;
  const cx = c.clickAt !== undefined ? interpolate(frame, [c.at + 6, Math.max(c.at + 10, moveEnd)], [240, 8], { ...clampOpts, easing: Easing.inOut(Easing.quad) }) : 8;
  const cy = c.clickAt !== undefined ? interpolate(frame, [c.at + 6, Math.max(c.at + 10, moveEnd)], [180, 6], { ...clampOpts, easing: Easing.inOut(Easing.quad) }) : 6;
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - c.w / 2,
        top: c.y,
        width: c.w,
        boxSizing: "border-box",
        borderRadius: 20,
        background: "#141418",
        boxShadow: `0 0 0 1px ${alpha(pal.fg, 0.12)}, 0 28px 80px rgba(0,0,0,0.65)`,
        padding: "38px 36px 34px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: t,
        transform: `translateY(calc(-50% + ${(1 - t) * 14}px))`,
      }}
    >
      <Img src={staticFile(film.brand.markSrc)} style={{ height: 60, width: "auto" }} />
      <div style={{ marginTop: 20, fontSize: 32, fontWeight: 500, letterSpacing: -0.6 }}>{c.title}</div>
      {c.body && <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.4, color: pal.muted, textAlign: "center", maxWidth: c.w - 72 }}>{c.body}</div>}
      <div
        style={{
          position: "relative",
          marginTop: 24,
          padding: "11px 24px",
          borderRadius: 999,
          background: pressed ? alpha(pal.fg, 0.82) : pal.fg,
          color: pal.bg,
          fontSize: 18,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 9,
          transform: `scale(${pressed ? 0.95 : 1})`,
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 999, background: pal.accent, display: "inline-block" }} />
        {c.button}
        {showCursor && (
          <svg
            style={{
              position: "absolute",
              left: `calc(54% + ${cx}px)`,
              top: `calc(56% + ${cy}px)`,
              transform: `scale(${pressed ? 0.85 : 1})`,
              transformOrigin: "2px 2px",
              filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.65))",
              pointerEvents: "none",
            }}
            width={28}
            height={36}
            viewBox="0 0 28 36"
          >
            <path d="M2 2 L2 28 L9 21.5 L14 33 L19 31 L14 19.5 L24 19.5 Z" fill="#FFFFFF" stroke="#000000" strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
};

const Wordmark: React.FC<{ w: NonNullable<LaunchScene["wordmark"]>; markSrc: string; wordmarkFont: string; frame: number }> = ({
  w,
  markSrc,
  wordmarkFont,
  frame,
}) => {
  const t = ease(frame, w.at, 10);
  const n = w.text.length;
  const shown = w.typed ? Math.floor(interpolate(frame, [w.at, w.at + w.typeFrames], [0, n], clampOpts)) : n;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 540 - w.size * 0.55, display: "flex", justifyContent: "center", alignItems: "center", gap: w.size * 0.24, opacity: t }}>
      <Img src={staticFile(markSrc)} style={{ height: w.size * 0.82, width: "auto" }} />
      <span style={{ fontFamily: wordmarkFont, fontSize: w.size, fontWeight: 400, letterSpacing: -w.size * 0.03, lineHeight: 1, whiteSpace: "pre" }}>
        {w.text.split("").map((ch, i) => (
          <span key={i} style={{ opacity: i < shown ? 1 : 0 }}>
            {ch}
          </span>
        ))}
      </span>
    </div>
  );
};

const HexTile: React.FC<{ h: LaunchScene["hexes"][number]; fg: string; frame: number }> = ({ h, fg, frame }) => {
  const t = ease(frame, h.at, 14);
  const r = h.size / 2;
  return (
    <svg style={{ position: "absolute", left: h.x - r, top: h.y - r, opacity: t, transform: `scale(${0.9 + 0.1 * t})` }} width={h.size} height={h.size} viewBox={`0 0 ${h.size} ${h.size}`}>
      {h.bars ? (
        <HexBarsMark cx={r} cy={r} r={r * 0.96} ink={h.fill} paper={fg} />
      ) : (
        <path d={hexPath(r, r, r * 0.96)} fill={h.fill} stroke={alpha(fg, 0.12)} strokeWidth={1.2} />
      )}
      {h.src && <image href={staticFile(h.src)} x={r * 0.44} y={r * 0.44} width={r * 1.12} height={r * 1.12} preserveAspectRatio="xMidYMid meet" />}
    </svg>
  );
};

const Mosaic: React.FC<{ m: NonNullable<LaunchScene["mosaic"]>; markSrc: string; fg: string; frame: number; w: number; h: number }> = ({
  m,
  markSrc,
  fg,
  frame,
  w,
  h,
}) => {
  const tiles = useMemo(() => {
    const r = 48;
    const gap = 8;
    const dx = 1.5 * r + gap;
    const dy = Math.sqrt(3) * r * 0.972 + gap;
    const cols = Math.ceil(w / dx) + 2;
    const rows = Math.ceil(h / dy) + 2;
    const maxDist = Math.hypot(w / 2, h / 2);
    const list: { x: number; y: number; r: number; color: string; dist: number; jitter: number; showMark: boolean; spin: number }[] = [];
    let idx = 0;
    for (let col = -1; col <= cols; col++) {
      for (let row = -1; row <= rows; row++) {
        const x = col * dx;
        const y = row * dy + (Math.abs(col) % 2 === 1 ? dy / 2 : 0);
        if (x < -r * 1.2 || x > w + r * 1.2 || y < -r * 1.2 || y > h + r * 1.2) continue;
        const dist = Math.min(1, Math.hypot(x - w / 2, y - h / 2) / maxDist);
        const color = m.colors[Math.floor(random(`${m.seed}-c${idx}`) * m.colors.length)] ?? "#6E6E6E";
        const jitter = random(`${m.seed}-j${idx}`);
        const showMark = random(`${m.seed}-b${idx}`) > 0.5;
        const spin = (random(`${m.seed}-r${idx}`) - 0.5) * 70;
        list.push({ x, y, r, color, dist, jitter, showMark, spin });
        idx++;
      }
    }
    return list;
  }, [m, w, h]);

  const holdFrames = m.mode === "in" ? 6 : 14;
  const enterOpacity = m.mode === "out" ? interpolate(frame, [m.at, m.at + 6], [0, 1], clampOpts) : 1;
  const p = interpolate(frame, [m.at + holdFrames, m.at + m.frames], [0, 1], clampOpts);
  if (frame < m.at || p >= 1) return null;

  return (
    <svg style={{ position: "absolute", inset: 0, opacity: enterOpacity }} width={w} height={h}>
      {tiles.map((tl, i) => {
        const delay = m.mode === "in" ? (1 - tl.dist) * 0.24 + tl.jitter * 0.1 : tl.dist * 0.22 + tl.jitter * 0.14;
        const span = Math.max(0.2, 1 - delay);
        const local = Math.min(1, Math.max(0, (p - delay) / span));
        const e = Easing.inOut(Easing.cubic)(local);
        const k = m.mode === "in" ? 1 - e : 1 + 1.55 * e;
        const x = w / 2 + (tl.x - w / 2) * k;
        const y = h / 2 + (tl.y - h / 2) * k;
        const r = tl.r * (m.mode === "in" ? 0.16 + 0.84 * k : Math.max(0.14, 1 - 0.72 * e));
        const opacity = m.mode === "in" ? 1 - Math.max(0, (local - 0.78) / 0.22) : 1 - Math.max(0, (local - 0.42) / 0.58);
        if (opacity <= 0.01) return null;
        return (
          <g key={i} opacity={opacity} transform={`rotate(${tl.spin * e} ${x} ${y})`}>
            {tl.showMark && m.markStyle === "bars" ? (
              <HexBarsMark cx={x} cy={y} r={r} ink={tl.color} paper={isLightHex(tl.color) ? "#111114" : fg} />
            ) : (
              <>
                <path d={hexPath(x, y, r)} fill={tl.color} />
                {tl.showMark && m.markStyle === "asset" && (
                  <image href={staticFile(markSrc)} x={x - r * 0.54} y={y - r * 0.54} width={r * 1.08} height={r * 1.08} preserveAspectRatio="xMidYMid meet" style={isLightHex(tl.color) ? { filter: "brightness(0.08)" } : undefined} />
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
};
