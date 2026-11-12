import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, interpolateColors, random } from "remotion";
import type { StageElement } from "../../spec/schema";
import { alpha, paint } from "../lib/color";
import { mediaUrl, useEdit } from "../lib/context";
import { BrandMark } from "../lib/mark";

type El<K extends StageElement["kind"]> = Extract<StageElement, { kind: K }>;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ramp = (t: number, a: number, frames: number, easing = Easing.out(Easing.cubic)) => interpolate(t, [a, a + Math.max(1, frames)], [0, 1], { ...clamp, easing });
const track = (keys: [number, number][], t: number) => (keys.length === 1 ? keys[0]![1] : interpolate(t, keys.map((k) => k[0]), keys.map((k) => k[1]), clamp));

function useNight() {
  const { spec, fonts } = useEdit();
  const pal = spec.brand.palette;
  return { pal, fonts, paint: (c: string) => paint(pal, c), asset: (id?: string) => spec.assets.find((a) => a.id === id) };
}

// ---- sky ---------------------------------------------------------------------

export const Sky: React.FC<{ el: El<"sky">; t: number }> = ({ el, t }) => {
  const { paint } = useNight();
  const color = (keys: [number, string][]) => (keys.length === 1 ? paint(keys[0]![1]) : interpolateColors(t, keys.map((k) => k[0]), keys.map((k) => paint(k[1]))));
  const stars = track(el.starsIn, t);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${color(el.top)}, ${color(el.bottom)})` }}>
      {stars > 0 &&
        Array.from({ length: el.stars }, (_, i) => {
          const r = (k: string) => random(`${el.seed}:star:${i}:${k}`);
          const size = 1 + r("s") * 2.2;
          const tw = 0.55 + 0.45 * Math.sin(t / (8 + r("f") * 18) + r("p") * 6);
          return <div key={i} style={{ position: "absolute", left: r("x") * 1920, top: r("y") * 760, width: size, height: size, borderRadius: size, background: "#ffffff", opacity: stars * tw * (0.35 + 0.65 * r("o")) }} />;
        })}
      {el.moon && (
        <div
          style={{
            position: "absolute",
            left: el.moon.x - el.moon.size / 2,
            top: el.moon.y - el.moon.size / 2,
            width: el.moon.size,
            height: el.moon.size,
            borderRadius: "50%",
            opacity: stars,
            background: `radial-gradient(circle at 38% 36%, ${paint(el.moon.color)}, ${alpha(paint(el.moon.color), 0.82)})`,
            boxShadow: `0 0 ${el.moon.size * 0.6}px ${alpha(paint(el.moon.color), 0.35)}, 0 0 ${el.moon.size * 1.6}px ${alpha(paint(el.moon.color), 0.12)}`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// ---- clock -------------------------------------------------------------------

export const Clock: React.FC<{ el: El<"clock">; t: number }> = ({ el, t }) => {
  const { fonts, paint } = useNight();
  const m = Math.floor(track(el.times, t));
  const h24 = Math.floor(m / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const color = paint(el.color);
  return (
    <div style={{ position: "absolute", left: el.x, top: el.y, transform: "translateY(-50%)", fontFamily: fonts.display, color }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: el.size * 0.18, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontSize: el.size, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {h}:{String(m % 60).padStart(2, "0")}
        </span>
        <span style={{ fontSize: el.size * 0.42, fontWeight: 600, opacity: 0.7 }}>{h24 < 12 ? "AM" : "PM"}</span>
      </div>
      {el.label && <div style={{ fontSize: el.size * 0.36, opacity: 0.55, marginTop: el.size * 0.08 }}>{el.label}</div>}
    </div>
  );
};

// ---- laptop ------------------------------------------------------------------

// The lid opens at 112° from the base and folds shut over `closeFrames`.
export const Laptop: React.FC<{ el: El<"laptop">; t: number }> = ({ el, t }) => {
  const { pal, fonts, paint } = useNight();
  const close = ramp(t, el.closeAt, el.closeFrames, Easing.inOut(Easing.cubic));
  const open = 1 - close;
  const lid = 68 + close * 112; // degrees from lying flat behind the hinge to shut
  const glow = paint(el.glow);
  const d = el.w * 0.64;
  const mark = ramp(t, el.markAt, 16);
  const breathe = 0.75 + 0.25 * Math.sin((t - el.markAt) / 9);
  const shell = "linear-gradient(160deg, #3a3f4a, #23272f)";
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: el.x - el.w * 1.1, top: el.y - el.w * 0.9, width: el.w * 2.2, height: el.w * 1.3, borderRadius: "50%", background: `radial-gradient(ellipse, ${alpha(glow, 0.28 * open)}, ${alpha(glow, 0)} 65%)` }} />
      <div style={{ position: "absolute", left: el.x - el.w * 0.7, top: el.y + d * 0.2, width: el.w * 1.4, height: d * 0.5, borderRadius: "50%", background: `radial-gradient(ellipse, ${alpha("#000", 0.45)}, ${alpha("#000", 0)} 70%)` }} />
      <div style={{ position: "absolute", left: el.x - el.w / 2, top: el.y - d / 2, width: el.w, height: d, perspective: 2200, perspectiveOrigin: "50% -40%" }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: "rotateX(62deg)" }}>
          {/* base */}
          <div style={{ position: "absolute", inset: 0, borderRadius: el.w * 0.03, background: shell, boxShadow: `inset 0 0 0 2px ${alpha("#fff", 0.06)}` }}>
            <div style={{ position: "absolute", left: "7%", right: "7%", top: "9%", height: "52%", display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: el.w * 0.005 }}>
              {Array.from({ length: 70 }, (_, i) => (
                <div key={i} style={{ borderRadius: 3, background: "#15181e", boxShadow: `0 0 6px ${alpha(glow, 0.12 * open)}` }} />
              ))}
            </div>
            <div style={{ position: "absolute", left: "33%", right: "33%", top: "67%", bottom: "8%", borderRadius: el.w * 0.012, background: alpha("#000", 0.18), border: `1px solid ${alpha("#fff", 0.05)}` }} />
          </div>
          {/* lid: screen in front, shell with the mark behind */}
          <div style={{ position: "absolute", left: 0, top: -d, width: el.w, height: d, transformOrigin: "50% 100%", transformStyle: "preserve-3d", transform: `rotateX(${-lid}deg)` }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: el.w * 0.03, background: "#0c0e12", padding: el.w * 0.025, boxSizing: "border-box", backfaceVisibility: "hidden" }}>
              <div style={{ width: "100%", height: "100%", borderRadius: el.w * 0.012, background: `linear-gradient(180deg, ${alpha(pal.bg, 0.96 * open + 0.04)}, ${alpha(pal.bg, 0.85 * open + 0.03)})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: el.w * 0.03 }}>
                <BrandMark size={el.w * 0.07} color={alpha(pal.fg, open)} />
                <div style={{ fontFamily: fonts.display, fontSize: el.w * 0.04, color: alpha(pal.fg, open), padding: `${el.w * 0.015}px ${el.w * 0.03}px`, borderRadius: el.w * 0.02, border: `2px solid ${alpha(pal.fg, 0.12 * open)}` }}>{el.screen}</div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: 0, borderRadius: el.w * 0.03, background: shell, backfaceVisibility: "hidden", transform: "rotateX(180deg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ filter: mark > 0 ? `drop-shadow(0 0 ${18 * mark * breathe}px ${alpha("#fff", 0.8)})` : undefined }}>
                <BrandMark size={el.w * 0.12} color={alpha("#ffffff", 0.18 + 0.82 * mark * breathe)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- skyline -----------------------------------------------------------------

type Win = { x: number; y: number; key: number };

function city(seed: string, width: number) {
  const back: { x: number; w: number; h: number }[] = [];
  const front: { x: number; w: number; h: number; wins: Win[] }[] = [];
  let x = -60;
  let i = 0;
  while (x < width + 60) {
    const w = 140 + random(`${seed}:bw:${i}`) * 200;
    back.push({ x, w, h: 380 + random(`${seed}:bh:${i}`) * 360 });
    x += w + 10;
    i++;
  }
  x = -40;
  i = 0;
  while (x < width + 40) {
    const w = 120 + random(`${seed}:fw:${i}`) * 170;
    const h = 260 + random(`${seed}:fh:${i}`) * 440;
    const wins: Win[] = [];
    const cols = Math.floor((w - 28) / 20);
    const rows = Math.floor((h - 50) / 28);
    const ox = (w - cols * 20) / 2 + 5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) wins.push({ x: x + ox + c * 20, y: 1080 - h + 30 + r * 28, key: random(`${seed}:win:${i}:${r}:${c}`) });
    front.push({ x, w, h, wins });
    x += w + 8 + random(`${seed}:gap:${i}`) * 26;
    i++;
  }
  const all = front.flatMap((b) => b.wins).sort((a, b) => a.key - b.key);
  return { back, front, order: all };
}

export const Skyline: React.FC<{ el: El<"skyline">; t: number }> = ({ el, t }) => {
  const { fonts, paint } = useNight();
  const light = paint(el.light);
  const width = 1920 + el.pan;
  const { back, front, order } = city(el.seed, width);
  const n = Math.min(el.count, order.length);
  const lit = order.slice(0, n);
  const at = (k: number) => el.litAt + (k / n) * el.litFrames;
  const done = Math.min(n, Math.max(0, Math.floor(((t - el.litAt) / el.litFrames) * n) + 1));
  const pan = Math.min(el.pan, (t / 300) * el.pan);
  return (
    <AbsoluteFill>
      <svg width={width} height={1080} style={{ position: "absolute", left: -pan, top: 0 }}>
        {back.map((b, i) => (
          <rect key={`b${i}`} x={b.x} y={1080 - b.h} width={b.w} height={b.h} fill="#141b2c" />
        ))}
        {front.map((b, i) => (
          <rect key={`f${i}`} x={b.x} y={1080 - b.h} width={b.w} height={b.h} fill="#0a0f1b" />
        ))}
        {front.flatMap((b) => b.wins).map((w, i) => (
          <rect key={`w${i}`} x={w.x} y={w.y} width={9} height={14} rx={1.5} fill={w.key > 0.985 ? alpha(light, 0.35) : "#1a2236"} />
        ))}
        <g style={{ filter: `drop-shadow(0 0 5px ${alpha(light, 0.8)})` }}>
          {lit.map((w, k) => {
            const v = ramp(t, at(k), 5);
            if (v <= 0) return null;
            const flash = 1 - ramp(t, at(k) + 3, 10);
            return <rect key={k} x={w.x} y={w.y} width={9} height={14} rx={1.5} fill={interpolateColors(flash, [0, 1], [light, "#ffffff"])} opacity={v} />;
          })}
        </g>
      </svg>
      {el.tags.map((tag, i) => {
        const k = Math.min(n - 1, Math.round(((i + 0.5) / el.tags.length) * n * 0.9));
        const w = lit[k]!;
        const life = t - at(k);
        if (life < 0 || life > 46) return null;
        const v = Math.min(ramp(life, 0, 6), 1 - ramp(life, 34, 12));
        return (
          <div key={i} style={{ position: "absolute", left: w.x - pan + 4, top: w.y - 18 - ramp(life, 0, 46) * 46, transform: "translate(-50%, -100%)", opacity: v, padding: "6px 12px", borderRadius: 10, background: alpha("#0a0f1b", 0.85), border: `1px solid ${alpha(light, 0.45)}`, color: "#f3f1ea", fontFamily: fonts.mono, fontSize: 17, whiteSpace: "nowrap" }}>
            <span style={{ color: light }}>✓ </span>
            {tag}
          </div>
        );
      })}
      {el.total && <Total text={el.total} n={done} />}
    </AbsoluteFill>
  );
};

const Total: React.FC<{ text: string; n: number }> = ({ text, n }) => {
  const { fonts } = useNight();
  return (
    <div style={{ position: "absolute", left: 0, width: 1920, top: 300, transform: "translateY(-50%)", textAlign: "center", fontFamily: fonts.display, fontSize: 30, color: alpha("#f3f1ea", 0.75), fontVariantNumeric: "tabular-nums" }}>
      {text.replace("{n}", n.toLocaleString("en-US"))}
    </div>
  );
};

// ---- cracks ------------------------------------------------------------------

export const Cracks: React.FC<{ el: El<"cracks">; t: number }> = ({ el, t }) => {
  const { fonts, paint } = useNight();
  const bad = paint(el.bad);
  const seal = paint(el.seal);
  const cols = 7;
  const rows = 5;
  const bw = 250;
  const bh = 100;
  const gap = 12;
  const top = 400;
  const bricks = Array.from({ length: cols * rows }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { i, x: 90 + c * (bw + gap) - (r % 2 ? 130 : 0), y: top + r * (bh + gap), key: random(`${el.seed}:k:${i}`) };
  });
  const ranked = [...bricks].sort((a, b) => a.key - b.key).slice(0, el.cracked);
  const rank = new Map(ranked.map((b, k) => [b.i, k]));
  const sealAt = (k: number) => el.sealAt + (k / Math.max(1, el.cracked)) * el.sealFrames;
  const sealed = ranked.filter((_, k) => t >= sealAt(k) + 10).length;
  const pulse = 0.7 + 0.3 * Math.sin(t / 4);
  return (
    <AbsoluteFill>
      {bricks.map((b) => {
        const k = rank.get(b.i);
        const fixed = k !== undefined ? ramp(t, sealAt(k), 10) : 0;
        return (
          <div key={b.i} style={{ position: "absolute", left: b.x, top: b.y, width: bw, height: bh, borderRadius: 8, background: "linear-gradient(180deg, #1b2233, #141a28)", border: `1.5px solid ${k !== undefined ? alpha(seal, 0.5 * fixed * (1 - ramp(t, sealAt(k) + 10, 30))) : alpha("#fff", 0.05)}`, boxSizing: "border-box" }}>
            <div style={{ position: "absolute", left: 12, bottom: 9, fontFamily: fonts.mono, fontSize: 18, color: alpha("#f3f1ea", 0.45), whiteSpace: "nowrap" }}>{el.labels.length ? el.labels[b.i % el.labels.length] : ""}</div>
            {k !== undefined && fixed > 0 && <div style={{ position: "absolute", right: 10, top: 8, fontFamily: fonts.display, fontWeight: 700, fontSize: 26, color: seal, opacity: fixed }}>✓</div>}
          </div>
        );
      })}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {ranked.map((b, k) => {
          const pts = Array.from({ length: 7 }, (_, j) => {
            const x = b.x + 10 + (j / 6) * (bw - 20) + (random(`${el.seed}:cx:${b.i}:${j}`) - 0.5) * 14;
            const y = b.y + bh / 2 + (random(`${el.seed}:cy:${b.i}:${j}`) - 0.5) * (bh - 40);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          });
          const bx = b.x + bw * (0.3 + random(`${el.seed}:bx:${b.i}`) * 0.4);
          const branch = `${bx.toFixed(1)},${(b.y + bh / 2).toFixed(1)} ${(bx + 14).toFixed(1)},${(b.y + 6).toFixed(1)}`;
          const grow = ramp(t, el.crackAt + k * 2, 14);
          const fix = ramp(t, sealAt(k), 10);
          const heal = ramp(t, sealAt(k) + 10, 30);
          const color = interpolateColors(fix, [0, 1], [bad, seal]);
          const op = (fix > 0 ? 1 - heal * 0.8 : pulse) * (grow > 0 ? 1 : 0);
          return (
            <g key={k} style={{ filter: `drop-shadow(0 0 ${6 + 6 * (1 - fix)}px ${color})` }} opacity={op}>
              <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" pathLength={1} strokeDasharray={`${grow} 1`} />
              <polyline points={branch} fill="none" stroke={color} strokeWidth={2.6} pathLength={1} strokeDasharray={`${grow} 1`} />
            </g>
          );
        })}
      </svg>
      {el.total && <Total text={el.total} n={sealed} />}
    </AbsoluteFill>
  );
};

// ---- flow --------------------------------------------------------------------

export const Flow: React.FC<{ el: El<"flow">; t: number }> = ({ el, t }) => {
  const { fonts, paint, asset } = useNight();
  const dotC = paint(el.dot);
  const win = paint(el.win);
  const x0 = -30;
  const fork = 720;
  const x1 = 1500;
  const cy = 650;
  const sep = 175;
  const travel = 120;
  const every = 0.8;
  const forkAt = (spawn: number) => spawn + (travel * (fork - x0)) / (x1 - x0);
  const ship = ramp(t, el.shipAt, 20);
  const laneY = (x: number, sign: number) => cy + sign * sep * Easing.inOut(Easing.cubic)(Math.min(1, Math.max(0, (x - fork) / (x1 - fork - 260))));
  const first = Math.max(0, Math.floor((t - travel) / every));
  const last = Math.floor(t / every);
  const dots: React.ReactNode[] = [];
  for (let i = first; i <= last; i++) {
    const spawn = i * every;
    const p = (t - spawn) / travel;
    if (p < 0 || p > 1) continue;
    const r = (k: string) => random(`${el.seed}:${i}:${k}`);
    const b = forkAt(spawn) >= el.shipAt || r("lane") < 0.5;
    const x = x0 + p * (x1 - x0);
    const jitter = (r("j") - 0.5) * 46;
    const y = laneY(x, b ? 1 : -1) + jitter * (1 - 0.4 * Math.min(1, Math.max(0, (x - fork) / 400)));
    const converts = r("c") < el.rates[b ? 1 : 0] * 3;
    const lit = converts && p > 0.8;
    const size = lit ? 14 : 7 + r("s") * 3;
    dots.push(<div key={i} style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size, background: lit ? win : dotC, opacity: (lit ? 1 : 0.75) * Math.min(1, (1 - p) * 12), boxShadow: lit ? `0 0 12px ${win}` : undefined }} />);
  }
  const k = ramp(t, 10, Math.max(20, el.shipAt - 40), Easing.inOut(Easing.quad));
  const icon = asset(el.icon);
  const path = (sign: number) => {
    let d = `M${x0} ${cy} L${fork} ${cy}`;
    for (let j = 1; j < 30; j++) {
      const x = fork + (j / 29) * (x1 - fork);
      d += ` L${x.toFixed(1)} ${laneY(x, sign).toFixed(1)}`;
    }
    return d;
  };
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <path d={path(-1)} fill="none" stroke={alpha(dotC, 0.1 * (1 - ship * 0.7))} strokeWidth={60} strokeLinecap="round" />
        <path d={path(1)} fill="none" stroke={alpha(dotC, 0.1 + ship * 0.05)} strokeWidth={60 + ship * 30} strokeLinecap="round" />
      </svg>
      {dots}
      {icon && (
        <div style={{ position: "absolute", left: fork - 34, top: cy - 34, width: 68, height: 68, borderRadius: 18, overflow: "hidden", boxShadow: `0 10px 30px ${alpha("#000", 0.5)}` }}>
          <Img src={mediaUrl(icon)} style={{ width: "100%", height: "100%" }} />
        </div>
      )}
      {el.lanes.map((name, i) => {
        const y = cy + (i ? 1 : -1) * sep;
        const dim = i === 0 ? 1 - ship * 0.6 : 1;
        return (
          <div key={i} style={{ position: "absolute", left: x1 + 40, top: y, transform: "translateY(-50%)", fontFamily: fonts.display, color: "#f3f1ea", opacity: dim }}>
            <div style={{ fontSize: 24, opacity: 0.6 }}>{name}</div>
            <div style={{ fontSize: 54, fontWeight: 600, color: i ? win : "#f3f1ea", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{(el.rates[i]! * 100 * k).toFixed(1)}%</div>
          </div>
        );
      })}
      {el.shipped && (
        <div style={{ position: "absolute", left: x1 + 40, top: cy + sep + 74, opacity: ship, padding: "8px 16px", borderRadius: 20, background: alpha(win, 0.16), border: `1.5px solid ${alpha(win, 0.6)}`, color: win, fontFamily: fonts.display, fontWeight: 600, fontSize: 22, whiteSpace: "nowrap" }}>{el.shipped}</div>
      )}
    </AbsoluteFill>
  );
};
