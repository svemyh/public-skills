import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, random, Sequence, useCurrentFrame } from "remotion";
import type { Scene, StageElement, StageTile } from "../../spec/schema";
import { alpha, paint } from "../lib/color";
import { mediaUrl, useAsset, useEdit } from "../lib/context";
import { BrandMark } from "../lib/mark";
import { surfaceOf } from "./TaskFeed";
import { Clock, Cracks, Flow, Laptop, Sky, Skyline } from "./StageNight";
import { WidgetCard } from "./StageWidget";
import { glyphOf } from "./UiPanel";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;
type El<K extends StageElement["kind"]> = Extract<StageElement, { kind: K }>;
type Track = [number, number][];
type Palette = Record<"bg" | "fg" | "accent" | "muted", string>;
type Icon = { asset?: string; glyph?: string; bg?: string; ink?: string };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const ramp = (t: number, a: number, frames: number, easing = easeOut) => interpolate(t, [a, a + Math.max(1, frames)], [0, 1], { ...clamp, easing });

function at(track: Track, t: number): number {
  if (track.length === 1) return track[0]![1];
  return interpolate(t, track.map((k) => k[0]), track.map((k) => k[1]), { ...clamp, easing: easeInOut });
}

// A product-UI launch film: a soft field, then each element inside its own
// camera, faded in and out with a blur.
export const Stage: React.FC<{ scene: Of<"stage"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { spec } = useEdit();
  return (
    <AbsoluteFill style={{ background: scene.bg ? paint(spec.brand.palette, scene.bg) : spec.brand.palette.bg, overflow: "hidden" }}>
      <Field field={scene.field} frame={frame + scene.from} />
      {scene.elements.map((el, i) => {
        const to = el.to ?? scene.duration;
        if (frame < el.from || frame >= to) return null;
        const t = frame - el.from;
        const life = Math.min(el.fadeIn ? ramp(frame, el.from, el.fadeIn, Easing.out(Easing.quad)) : 1, el.fadeOut ? 1 - ramp(frame, to - el.fadeOut, el.fadeOut, Easing.in(Easing.quad)) : 1);
        return (
          <AbsoluteFill key={i} style={{ opacity: life, filter: life < 1 ? `blur(${(1 - life) * 10}px)` : undefined }}>
            <Camera camera={el.camera} t={t}>
              <ElementView el={el} t={t} />
            </Camera>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

// Blurred blobs drifting on the page. `frame` is absolute so the field runs
// on unbroken across scene cuts.
const Field: React.FC<{ field: Of<"stage">["field"]; frame: number }> = ({ field, frame }) => {
  const { spec } = useEdit();
  const color = paint(spec.brand.palette, field.color);
  const blobs = [
    { x: 0.06, y: 0.3, r: 0.36 },
    { x: 0.95, y: 0.82, r: 0.32 },
    { x: 0.55, y: 1.02, r: 0.3 },
    { x: 0.72, y: 0.12, r: 0.22 },
  ];
  return (
    <AbsoluteFill>
      {blobs.map((b, i) => {
        const ph = random(`${field.seed}:${i}`) * Math.PI * 2;
        const x = (b.x + Math.sin(frame / 140 + ph) * 0.03) * 1920;
        const y = (b.y + Math.cos(frame / 170 + ph) * 0.03) * 1080;
        const r = b.r * 1920;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${alpha(color, field.strength)} 0%, ${alpha(color, field.strength * 0.4)} 40%, ${alpha(color, 0)} 70%)`,
            }}
          />
        );
      })}
      {Array.from({ length: field.marks }, (_, i) => {
        const r = (k: string) => random(`${field.seed}:mark:${i}:${k}`);
        const size = 18 + r("s") * 26;
        const speed = 0.25 + r("v") * 0.45;
        const y = (((r("y") * 1300 - frame * speed) % 1300) + 1300) % 1300 - 110;
        const x = r("x") * 1920 + Math.sin(frame / 90 + r("p") * 6) * 18;
        return <BrandMark key={`m${i}`} size={size} color={alpha(spec.brand.palette.fg, 0.08 + r("o") * 0.12)} style={{ position: "absolute", left: x, top: y, transform: `rotate(${(r("r") - 0.5) * 30}deg)` }} />;
      })}
    </AbsoluteFill>
  );
};

const Camera: React.FC<{ camera?: El<"text">["camera"]; t: number; children: React.ReactNode }> = ({ camera, t, children }) => {
  if (!camera) return <AbsoluteFill>{children}</AbsoluteFill>;
  const z = at(camera.zoom, t);
  const x = at(camera.x, t);
  const y = at(camera.y, t);
  const rx = at(camera.tiltX, t);
  const ry = at(camera.tiltY, t);
  const tilt = rx || ry ? `perspective(2400px) rotateX(${rx}deg) rotateY(${ry}deg)` : "";
  return (
    <AbsoluteFill style={{ transform: tilt || undefined }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${960 - x * z}px, ${540 - y * z}px) scale(${z})` }}>{children}</div>
    </AbsoluteFill>
  );
};

const ElementView: React.FC<{ el: StageElement; t: number }> = ({ el, t }) => {
  switch (el.kind) {
    case "introLine":
      return <IntroLine el={el} t={t} />;
    case "composer":
      return <Composer el={el} t={t} />;
    case "status":
      return <Status el={el} t={t} />;
    case "calendar":
      return el.layout === "week" ? <WeekCalendar el={el} t={t} /> : <MonthCalendar el={el} t={t} />;
    case "detail":
      return <Detail el={el} t={t} />;
    case "yearGrid":
      return <YearGrid el={el} t={t} />;
    case "heatmap":
      return <Heatmap el={el} t={t} />;
    case "counter":
      return <Counter el={el} t={t} />;
    case "phone":
      return <Phone el={el} t={t} />;
    case "cursor":
      return <Cursor el={el} t={t} />;
    case "text":
      return <TextEl el={el} />;
    case "sky":
      return <Sky el={el} t={t} />;
    case "clock":
      return <Clock el={el} t={t} />;
    case "laptop":
      return <Laptop el={el} t={t} />;
    case "skyline":
      return <Skyline el={el} t={t} />;
    case "cracks":
      return <Cracks el={el} t={t} />;
    case "flow":
      return <Flow el={el} t={t} />;
  }
};

// ---- shared pieces -------------------------------------------------------

function useLook() {
  const { spec, fonts } = useEdit();
  const pal = spec.brand.palette as Palette;
  const surface = surfaceOf(pal);
  return { pal, fonts, surface, paint: (c: string) => paint(pal, c) };
}

// A raised card: one step lighter than the page, a soft long shadow.
function card(pal: Palette, surface: string, radius: number): React.CSSProperties {
  return {
    position: "absolute",
    background: `linear-gradient(180deg, ${surface}, ${alpha(surface, 0.92)})`,
    borderRadius: radius,
    border: `1.5px solid ${alpha(pal.fg, 0.045)}`,
    boxShadow: `0 ${radius * 0.8}px ${radius * 2.2}px ${alpha(pal.fg, 0.09)}, 0 2px 6px ${alpha(pal.fg, 0.04)}`,
  };
}

const IconView: React.FC<{ icon: Icon; size: number; radius?: number }> = ({ icon, size, radius }) => {
  const { pal, paint } = useLook();
  const asset = useAsset(icon.asset);
  if (asset) return <Img src={mediaUrl(asset)} style={{ width: size, height: size, borderRadius: radius ?? 0, objectFit: radius ? "cover" : "contain", display: "block" }} />;
  const bg = icon.bg ? paint(icon.bg) : undefined;
  const ink = icon.ink ? paint(icon.ink) : bg ? pal.bg : pal.fg;
  const Glyph = icon.glyph ? glyphOf(icon.glyph) : undefined;
  return (
    <div style={{ width: size, height: size, borderRadius: radius ?? size * 0.24, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {Glyph ? <Glyph size={size * (bg ? 0.56 : 0.9)} color={ink} strokeWidth={2.2} /> : <BrandMark size={size * (bg ? 0.58 : 0.92)} color={ink} />}
    </div>
  );
};

// A thumbnail: the image, or a pull-request card drawn in code.
// `pad` clears room at the top for a date number drawn over the tile.
// A video asset plays from the moment the tile appeared (`since` frames ago).
const Tile: React.FC<{ tile: StageTile; w: number; h: number; radius: number; pad?: number; since?: number; style?: React.CSSProperties }> = ({ tile, w, h, radius, pad = 0, since, style }) => {
  const { pal, fonts } = useLook();
  const frame = useCurrentFrame();
  const asset = useAsset(tile.asset);
  const box: React.CSSProperties = { position: "absolute", width: w, height: h, borderRadius: radius, overflow: "hidden", ...style };
  if (asset) {
    const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
    const chip = Math.max(18, w * 0.11);
    return (
      <div style={box}>
        {asset.type === "video" ? (
          <Sequence from={frame - (since ?? frame)} layout="none">
            <OffthreadVideo src={mediaUrl(asset)} muted style={fill} />
          </Sequence>
        ) : (
          <Img src={mediaUrl(asset)} style={fill} />
        )}
        {tile.badge && (
          <div style={{ position: "absolute", left: chip * 0.45, bottom: chip * 0.45, width: chip * 1.5, height: chip * 1.5, borderRadius: chip * 0.45, background: alpha(pal.bg, 0.85), display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 2px 8px ${alpha(pal.fg, 0.2)}` }}>
            <BrandMark size={chip} color={pal.fg} />
          </div>
        )}
      </div>
    );
  }
  if (tile.widget)
    return (
      <div style={box}>
        <WidgetCard widget={tile.widget} w={w} h={h} lt={since ?? 999} pad={pad} />
      </div>
    );
  const s = w / 190;
  return (
    <div style={{ ...box, background: `linear-gradient(160deg, ${alpha(pal.fg, 0.92)}, ${pal.fg})`, padding: 14 * s, paddingTop: 14 * s + pad, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 7 * s }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 * s }}>
        <BrandMark size={13 * s} color={alpha(pal.bg, 0.9)} />
        <div style={{ fontFamily: fonts.mono, fontSize: 9 * s, color: alpha(pal.bg, 0.55), whiteSpace: "nowrap" }}>{tile.kicker ?? (tile.meta ? "pull request" : "")}</div>
      </div>
      <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 15 * s, lineHeight: 1.2, color: pal.bg }}>{tile.title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 * s, marginTop: 2 * s }}>
        {tile.lines.map((line, i) => {
          const add = line.startsWith("+");
          const del = line.startsWith("-");
          return (
            <div
              key={i}
              style={{
                fontFamily: fonts.mono,
                fontSize: 8.6 * s,
                lineHeight: 1.35,
                whiteSpace: "nowrap",
                overflow: "hidden",
                color: add ? "#7fd99a" : del ? "#f09a92" : alpha(pal.bg, 0.6),
                background: add ? "rgba(63,185,80,0.14)" : del ? "rgba(248,81,73,0.13)" : undefined,
                borderRadius: 2 * s,
                padding: `0 ${3 * s}px`,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
      {tile.meta && (
        <div style={{ marginTop: "auto", fontFamily: fonts.display, fontSize: 10 * s, fontWeight: 500, color: "#7fd99a", display: "flex", alignItems: "center", gap: 4 * s }}>
          <span>✓</span>
          <span>{tile.meta}</span>
        </div>
      )}
    </div>
  );
};

// ---- elements --------------------------------------------------------------

const IntroLine: React.FC<{ el: El<"introLine">; t: number }> = ({ el, t }) => {
  const { pal, fonts, surface } = useLook();
  const pop = interpolate(t, [0, 5, 9, 13], [0.55, 1.05, 0.98, 1], clamp);
  const tileX = interpolate(t, [el.slideAt, el.slideAt + el.slideFrames], [960, el.x], { ...clamp, easing: easeInOut });
  const p = ramp(t, el.slideAt + 6, el.slideFrames, Easing.out(Easing.quad));
  const textLeft = tileX + (el.textX - el.x) - (1 - p) * 420;
  const tileRight = tileX + el.tile / 2;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: textLeft,
          top: el.y,
          transform: "translateY(-50%)",
          fontFamily: fonts.display,
          fontSize: el.size,
          color: pal.fg,
          whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
          opacity: p,
          filter: p < 1 ? `blur(${(1 - p) * 9}px)` : undefined,
          clipPath: `inset(-40px -40px -40px ${Math.max(0, tileRight - textLeft)}px)`,
        }}
      >
        {el.text}
      </div>
      <div style={{ ...card(pal, surface, el.tile * 0.24), left: tileX - el.tile / 2, top: el.y - el.tile / 2, width: el.tile, height: el.tile, transform: `scale(${pop})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <IconView icon={el.icon} size={el.tile * 0.62} />
      </div>
    </AbsoluteFill>
  );
};

const Sparkle: React.FC<{ x: number; y: number; size: number; color: string; opacity: number }> = ({ x, y, size, color, opacity }) => (
  <svg width={size} height={size} viewBox="-10 -10 20 20" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, opacity }}>
    <path d="M0 -10 Q1.2 -1.2 10 0 Q1.2 1.2 0 10 Q-1.2 1.2 -10 0 Q-1.2 -1.2 0 -10Z" fill={color} />
  </svg>
);

const Composer: React.FC<{ el: El<"composer">; t: number }> = ({ el, t }) => {
  const { pal, fonts, surface, paint } = useLook();
  const { box: b } = el;
  const n = t < el.typeAt ? 0 : Math.min(el.typed.length, Math.floor((t - el.typeAt) / el.typeEvery) + 1);
  const typing = t >= el.typeAt - 8;
  const caret = Math.floor(t / 8) % 2 === 0 || (n > 0 && n < el.typed.length);
  const press = el.pressAt !== undefined ? interpolate(t, [el.pressAt, el.pressAt + 3, el.pressAt + 9], [1, 0.9, 1], clamp) : 1;
  const head = el.headlineOutAt !== undefined ? 1 - ramp(t, el.headlineOutAt, 6) : 1;
  const button = paint(el.button);
  const glow = paint(el.glow);
  const Hint = glyphOf(el.hintGlyph);
  const Arrow = glyphOf("arrow-up");
  return (
    <AbsoluteFill>
      {el.headline && (
        <div style={{ position: "absolute", left: 0, width: 1920, top: el.headlineY, transform: "translateY(-50%)", textAlign: "center", fontFamily: fonts.display, fontSize: el.headlineSize, color: pal.fg, opacity: head, letterSpacing: "-0.01em" }}>
          {el.headline}
        </div>
      )}
      <div style={{ position: "absolute", left: b.x + b.w * 0.25, top: b.y - 130, width: b.w * 0.75, height: 260, borderRadius: "50%", background: `radial-gradient(ellipse at 50% 60%, ${alpha(glow, 0.55)}, ${alpha(glow, 0.18)} 45%, ${alpha(glow, 0)} 70%)`, filter: "blur(12px)" }} />
      {el.markSparkles ? (
        [[0.53, -40, 26], [0.75, -24, 14], [0.79, -34, 19], [0.2, -30, 16]].map(([fx, dy, sz], i) => (
          <BrandMark key={i} size={sz!} color={alpha(pal.fg, 0.85)} style={{ position: "absolute", left: b.x + b.w * fx! - sz! / 2, top: b.y + dy! - sz! / 2 + Math.sin(t / 12 + i) * 4, transform: `rotate(${Math.sin(t / 20 + i) * 12}deg)` }} />
        ))
      ) : (
        <>
          <Sparkle x={b.x + b.w * 0.53} y={b.y - 38} size={22} color={surface} opacity={0.9} />
          <Sparkle x={b.x + b.w * 0.75} y={b.y - 22} size={12} color={surface} opacity={0.8} />
          <Sparkle x={b.x + b.w * 0.78} y={b.y - 30} size={16} color={surface} opacity={0.85} />
        </>
      )}
      <div style={{ ...card(pal, surface, 44), left: b.x, top: b.y, width: b.w, height: b.h }}>
        <div style={{ position: "absolute", left: 50, top: 66, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 37, color: typing ? pal.fg : alpha(pal.fg, 0.55), whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
          {typing ? el.typed.slice(0, n) : el.placeholder}
          {typing && <span style={{ display: "inline-block", width: 3, height: 46, marginLeft: 4, background: alpha(button, 0.6), opacity: caret ? 1 : 0 }} />}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 130, height: 1.5, background: alpha(pal.fg, 0.07) }} />
        <div style={{ position: "absolute", left: 50, top: 190, transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 18, fontFamily: fonts.display, fontSize: 27, color: pal.fg }}>
          {Hint && <Hint size={28} color={pal.fg} strokeWidth={1.8} />}
          {el.hint}
        </div>
        <div
          style={{
            position: "absolute",
            left: b.w - 198,
            top: 150,
            width: 166,
            height: 80,
            borderRadius: 40,
            transform: `scale(${press})`,
            background: `radial-gradient(ellipse at 50% 120%, ${button}, ${alpha(button, 0.72)} 70%)`,
            boxShadow: `0 8px 20px ${alpha(button, 0.35)}, inset 0 2px 0 ${alpha(pal.bg, 0.35)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {Arrow && <Arrow size={38} color={pal.bg} strokeWidth={2.6} />}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Fan of three tiles rising from behind the line.
const FAN = [
  { dx: -219, dy: 46, rot: -9 },
  { dx: 0, dy: 0, rot: 0 },
  { dx: 216, dy: 46, rot: 9 },
];
const CHIPS = [
  { dx: -110, dy: -55, rot: -4 },
  { dx: 140, dy: 2, rot: 3 },
  { dx: -25, dy: 52, rot: -2 },
];

const Status: React.FC<{ el: El<"status">; t: number }> = ({ el, t }) => {
  const { pal, fonts, surface } = useLook();
  const to = el.to !== undefined ? el.to - el.from : 1e9;
  const drop = el.exitDrop ? ramp(t, to - 14, 14, Easing.in(Easing.quad)) * el.exitDrop : 0;
  return (
    <AbsoluteFill style={{ transform: `translateY(${drop}px)` }}>
      <div style={{ position: "absolute", left: el.x, top: el.y, transform: "translateY(-50%)", display: "flex" }}>
        <IconView icon={el.mark} size={el.markSize} />
      </div>
      <div style={{ position: "absolute", left: el.textX, top: el.y, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: el.size, color: pal.fg, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
        {el.prefix}{" "}
        {el.phrases.map((ph, i) => {
          if (t < ph.at || t >= ph.out) return null;
          const v = Math.min(ramp(t, ph.at, 7), 1 - ramp(t, ph.out - 7, 7, Easing.in(Easing.quad)));
          return (
            <span key={i} style={{ opacity: v, filter: v < 1 ? `blur(${(1 - v) * 10}px)` : undefined }}>
              {ph.text}
            </span>
          );
        })}
      </div>
      {el.phrases.map((ph, i) => {
        if (!ph.prop || t < (ph.prop.at ?? ph.at) || t >= ph.out) return null;
        const p = ph.prop;
        const start = p.at ?? ph.at;
        const out = 1 - ramp(t, ph.out - 7, 7, Easing.in(Easing.quad));
        const style: React.CSSProperties = { opacity: out, filter: out < 1 ? `blur(${(1 - out) * 10}px)` : undefined };
        if (p.kind === "icon" && p.icon) {
          const s = interpolate(t - start, [0, 5, 9, 12], [0.3, 1.08, 0.97, 1], clamp);
          const rot = interpolate(t - start, [0, 12, 40], [-20, -9, -5], clamp);
          return (
            <div key={i} style={{ ...style, position: "absolute", left: (p.x ?? 1192) - 66, top: (p.y ?? 463) - 66, transform: `scale(${s}) rotate(${rot}deg)`, boxShadow: `0 16px 30px ${alpha(pal.fg, 0.18)}`, borderRadius: 32 }}>
              <IconView icon={p.icon} size={132} radius={32} />
            </div>
          );
        }
        if (p.kind === "tiles")
          return (
            <AbsoluteFill key={i} style={style}>
              {p.tiles.slice(0, 3).map((tile, j) => {
                const f = FAN[j]!;
                const k = interpolate(t - start - j * 2, [0, 6, 10, 14], [0, 1.04, 0.99, 1], clamp);
                const x = (p.x ?? 1204) + f.dx * k;
                const y = (p.y ?? 274) + f.dy * k + (1 - k) * 260;
                return (
                  <div key={j} style={{ position: "absolute", left: x - 103, top: y - 183, width: 206, height: 366, transform: `rotate(${f.rot * k}deg) scale(${0.4 + 0.6 * k})`, opacity: Math.min(1, k * 2), borderRadius: 18, boxShadow: `0 18px 36px ${alpha(pal.fg, 0.16)}`, zIndex: j === 1 ? 2 : 1 }}>
                    <Tile tile={tile} w={206} h={366} radius={18} since={t - start} />
                  </div>
                );
              })}
            </AbsoluteFill>
          );
        if (p.kind === "chips")
          return (
            <AbsoluteFill key={i} style={style}>
              {p.chips.slice(0, 3).map((chip, j) => {
                const c = CHIPS[j]!;
                const k = interpolate(t - start - j * 3, [0, 5, 9, 12], [0, 1.06, 0.98, 1], clamp);
                return (
                  <div
                    key={j}
                    style={{
                      ...card(pal, surface, 30),
                      left: (p.x ?? 1200) + c.dx,
                      top: (p.y ?? 457) + c.dy,
                      transform: `translate(-50%, -50%) rotate(${c.rot}deg) scale(${k})`,
                      opacity: Math.min(1, k * 2),
                      padding: "10px 22px 10px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      whiteSpace: "nowrap",
                      fontFamily: fonts.display,
                      fontSize: 25,
                      color: pal.fg,
                    }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: 8, background: "radial-gradient(circle at 35% 35%, #a6f0b8, #38c766)" }} />
                    {chip}
                  </div>
                );
              })}
            </AbsoluteFill>
          );
        if (p.kind === "glyph" && p.icon) {
          const s = interpolate(t - start, [0, 5, 9, 12], [0.2, 1.15, 0.95, 1], clamp);
          return (
            <div key={i} style={{ ...style, position: "absolute", left: (p.x ?? 1170) - 32, top: (p.y ?? 540) - 32, transform: `scale(${s}) rotate(${(1 - s) * 30}deg)` }}>
              <IconView icon={p.icon} size={64} />
            </div>
          );
        }
        return null;
      })}
    </AbsoluteFill>
  );
};

const Toggle: React.FC<{ x: number; y: number; on: number; ok: string }> = ({ x, y, on, ok }) => {
  const { pal, surface } = useLook();
  return (
    <div style={{ position: "absolute", left: x, top: y - 17, width: 64, height: 34, borderRadius: 17, background: on > 0 ? `color-mix(in srgb, ${ok} ${on * 100}%, ${alpha(pal.fg, 0.06)})` : alpha(pal.fg, 0.06), boxShadow: `inset 0 1px 3px ${alpha(pal.fg, 0.1)}` }}>
      <div style={{ position: "absolute", left: 3 + on * 30, top: 3, width: 28, height: 28, borderRadius: 14, background: surface, boxShadow: `0 2px 5px ${alpha(pal.fg, 0.25)}` }} />
    </div>
  );
};

const CalendarHeader: React.FC<{ el: El<"calendar">; top: number; t: number }> = ({ el, top, t }) => {
  const { pal, fonts, surface } = useLook();
  const on = el.toggleAt !== undefined ? ramp(t, el.toggleAt, 6) : 1;
  const Left = glyphOf("chevron-left");
  const Right = glyphOf("chevron-right");
  return (
    <>
      <div style={{ position: "absolute", left: 167, top: top + 57, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 46, color: pal.fg, letterSpacing: "-0.01em" }}>{el.title}</div>
      {[1487, 1535].map((cx, i) => {
        const G = i ? Right : Left;
        return (
          <div key={cx} style={{ ...card(pal, surface, 22), left: cx - 21, top: top + 57 - 21, width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {G && <G size={20} color={alpha(pal.fg, 0.6)} strokeWidth={2} />}
          </div>
        );
      })}
      {el.toggle && (
        <>
          <div style={{ position: "absolute", right: 1920 - 1673, top: top + 57, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 25, color: pal.fg }}>{el.toggle}</div>
          <Toggle x={1688} y={top + 57} on={on} ok={el.ok} />
        </>
      )}
    </>
  );
};

const WeekCalendar: React.FC<{ el: El<"calendar">; t: number }> = ({ el, t }) => {
  const { pal, fonts, surface, paint } = useLook();
  const hi = paint(el.highlight);
  const e = (i: number) => (el.expandAt === undefined ? 0 : ramp(t, el.expandAt + i * 3, 16, easeInOut));
  const h = 264 + 232 * e(3);
  const top = 540 - h / 2;
  return (
    <AbsoluteFill>
      <div style={{ ...card(pal, surface, 34), left: 130, top, width: 1660, height: h }} />
      <CalendarHeader el={el} top={top} t={t} />
      {el.weekdays.slice(0, 7).map((day, i) => {
        const x = 162 + i * 230.67;
        const ce = e(i);
        const ch = 128 + 234 * ce;
        const ctop = top + 102;
        const show = ramp(t, el.cellsAt + i * 2, 6);
        const fill = el.fillAt === undefined ? 0 : ramp(t, el.fillAt + i * el.fillEvery, 8);
        const tile = el.tiles[i];
        const first = i === 0;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: ctop, width: 212, height: ch, opacity: show, borderRadius: 20, background: surface, border: `2px solid ${first ? alpha(hi, 0.35) : alpha(pal.fg, 0.035)}`, boxShadow: `0 6px 18px ${alpha(pal.fg, 0.05)}`, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 17, top: 35, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 18, fontWeight: 600, letterSpacing: "0.08em", color: alpha(pal.fg, 0.38) }}>{day.toUpperCase()}</div>
            {first ? (
              <div style={{ position: "absolute", right: 17, top: 13, width: 44, height: 44, borderRadius: 22, background: `radial-gradient(circle at 40% 30%, ${alpha(hi, 0.8)}, ${hi})`, boxShadow: `0 4px 10px ${alpha(hi, 0.4)}`, color: surface, fontFamily: fonts.display, fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>1</div>
            ) : (
              <div style={{ position: "absolute", right: 25, top: 35, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 30, color: pal.fg }}>{i + 1}</div>
            )}
            <div style={{ position: "absolute", left: 18, top: 88 - 13, display: "flex", gap: 12, opacity: ce }}>
              {el.icons.map((icon, j) => (
                <IconView key={j} icon={icon} size={26} radius={7} />
              ))}
            </div>
            <div style={{ position: "absolute", left: 13, top: 115, width: 187, height: 232, borderRadius: 14, opacity: ce, background: `linear-gradient(180deg, ${alpha(pal.fg, 0.06)}, ${alpha(pal.fg, 0.03)})`, overflow: "hidden" }}>
              {tile && fill > 0 && <Tile tile={tile} w={187} h={232} radius={14} style={{ opacity: fill }} />}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const MonthCalendar: React.FC<{ el: El<"calendar">; t: number }> = ({ el, t }) => {
  const { pal, fonts, surface, paint } = useLook();
  const hi = paint(el.highlight);
  const grow = el.rowsAt === undefined ? el.rows : 1 + interpolate(t, [el.rowsAt, el.rowsAt + (el.rows - 1) * el.rowEvery + 8], [0, el.rows - 1], { ...clamp, easing: easeInOut });
  const h = 133 + (grow - 1) * 164 + 181;
  const top = 540 - h / 2;
  const cells = el.rows * 7;
  return (
    <AbsoluteFill>
      <div style={{ ...card(pal, surface, 34), left: 130, top, width: 1660, height: h }} />
      <CalendarHeader el={el} top={top} t={t} />
      {el.weekdays.slice(0, 7).map((day, c) => (
        <div key={day} style={{ position: "absolute", left: 167 + c * 230.5, top: top + 110, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 19, fontWeight: 500, color: alpha(pal.fg, 0.35) }}>{day}</div>
      ))}
      {Array.from({ length: cells }, (_, i) => {
        const r = Math.floor(i / 7);
        const c = i % 7;
        const v = Math.min(1, Math.max(0, grow - r));
        if (v <= 0) return null;
        const x = 161 + c * 230.5;
        const y = top + 133 + r * 164;
        const tile = el.tiles[i];
        const day = i + 1;
        if (!tile)
          return (
            <div key={i} style={{ position: "absolute", left: x + 14, top: y + 26, transform: "translateY(-50%)", opacity: v * 0.35, fontFamily: fonts.display, fontSize: 26, color: pal.fg }}>{day - el.tiles.length}</div>
          );
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 216, height: 150, opacity: v, transform: `translateY(${(1 - v) * 20}px)` }}>
            <Tile tile={tile} w={216} h={150} radius={14} pad={26} />
            {i === 0 ? (
              <div style={{ position: "absolute", left: 8, top: 7, width: 40, height: 40, borderRadius: 20, background: hi, color: surface, fontFamily: fonts.display, fontSize: 25, display: "flex", alignItems: "center", justifyContent: "center" }}>1</div>
            ) : (
              <div style={{ position: "absolute", left: 14, top: 26, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 26, fontWeight: 500, color: surface, textShadow: `0 1px 4px ${alpha(pal.fg, 0.5)}` }}>{day}</div>
            )}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Detail: React.FC<{ el: El<"detail">; t: number }> = ({ el, t }) => {
  const { pal, fonts, surface, paint } = useLook();
  const hi = paint(el.highlight);
  const ok = paint(el.ok);
  const b = el.box;
  const posts = [...el.posts].sort((p, q) => p.at - q.at);
  const idx = Math.max(0, posts.findLastIndex((p) => p.at <= t));
  const post = posts[idx]!;
  // The arc rolls from the previous post's date to this one's over 14 frames.
  const prev = posts[Math.max(0, idx - 1)]!;
  const roll = idx === 0 ? 1 : ramp(t, post.at, 14, easeInOut);
  const sel = prev.date + (post.date - prev.date) * roll;
  const swap = idx === 0 ? 1 : ramp(t, post.at, 6);
  const media = [...post.media].reverse().find((m) => m.at <= t - post.at) ?? post.media[0]!;
  const mi = post.media.indexOf(media);
  const mediaPrev = mi > 0 ? post.media[mi - 1] : idx > 0 ? posts[idx - 1]!.media.at(-1) : undefined;
  const mediaIn = mi > 0 ? ramp(t, post.at + media.at, 5) : swap;
  const cx = b.x + b.w / 2;
  const arc = (dx: number, y0: number, k: number) => y0 + k * (dx / 490) ** 2;
  const box = (x: number, y: number, w: number, h: number): React.CSSProperties => ({
    position: "absolute",
    left: x,
    top: y,
    width: w,
    height: h,
    borderRadius: 18,
    background: `linear-gradient(120deg, ${alpha(surface, 0.9)}, ${alpha(pal.bg, 0.5)})`,
    border: `1.5px solid ${alpha(pal.fg, 0.05)}`,
  });
  const label: React.CSSProperties = { position: "absolute", left: 21, top: 26, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 20, fontWeight: 600, color: pal.fg };
  const text = { opacity: swap };
  return (
    <AbsoluteFill>
      {el.backdrop.map((tile, i) => {
        const x = b.x + b.w + 30 + i * 330 - (i >= 2 ? 0 : 0);
        return <Tile key={i} tile={tile} w={270} h={340} radius={18} style={{ left: x, top: 360, filter: "blur(16px)", opacity: 0.8 }} />;
      })}
      <div style={{ ...card(pal, surface, 44), left: b.x, top: b.y, width: b.w, height: b.h, overflow: "hidden" }}>
        <svg width={b.w} height={260} style={{ position: "absolute", left: 0, top: 0 }}>
          {[
            [176, 36],
            [240, 35],
          ].map(([y0, k]) => (
            <path key={y0} d={`M 30 ${arc(-490, y0!, k!) - b.y} Q ${b.w / 2} ${y0! - b.y - k!} ${b.w - 30} ${arc(490, y0!, k!) - b.y}`} fill="none" stroke={alpha(pal.fg, 0.1)} strokeWidth={1.5} />
          ))}
        </svg>
        {el.dates.map((d, i) => {
          const off = i - sel;
          if (Math.abs(off) > 3.6) return null;
          const x = cx + off * 138 - b.x;
          const fade = interpolate(Math.abs(off), [3, 3.6], [1, 0], clamp);
          const on = 1 - Math.min(1, Math.abs(off) * 2);
          return (
            <div key={i} style={{ opacity: fade }}>
              <div style={{ position: "absolute", left: x, top: 148 + 3.6 * off * off - b.y, transform: "translate(-50%, -50%)", fontFamily: fonts.display, fontSize: 21, fontWeight: on > 0.5 ? 600 : 400, color: on > 0.5 ? hi : alpha(pal.fg, 0.35) }}>{el.weekdays[i]}</div>
              <div style={{ position: "absolute", left: x, top: 206 + 2.6 * off * off - b.y, transform: "translate(-50%, -50%)", fontFamily: fonts.display, fontSize: 29, color: on > 0.5 ? surface : alpha(pal.fg, 0.7), zIndex: 2 }}>{d}</div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: cx - 35 - b.x, top: 206 - 35 - b.y, width: 70, height: 70, borderRadius: 35, background: `radial-gradient(circle at 40% 30%, ${alpha(hi, 0.82)}, ${hi})`, boxShadow: `0 6px 16px ${alpha(hi, 0.4)}`, zIndex: 1 }} />
        {el.dates.map((d, i) => {
          const off = i - sel;
          if (Math.abs(off) > 0.5) return null;
          return <div key={`s${i}`} style={{ position: "absolute", left: cx + off * 138 - b.x, top: 206 - b.y, transform: "translate(-50%, -50%)", fontFamily: fonts.display, fontSize: 29, color: surface, zIndex: 3 }}>{d}</div>;
        })}
        <div style={{ position: "absolute", left: 31, top: 208 + (660 - post.mediaH) / 2, width: 372, height: post.mediaH, borderRadius: 24, overflow: "hidden", background: pal.fg }}>
          {mediaPrev && mediaIn < 1 && <Tile tile={mediaPrev.tile} w={372} h={post.mediaH} radius={0} />}
          <Tile tile={media.tile} w={372} h={post.mediaH} radius={0} since={t - post.at - media.at} style={{ opacity: mediaIn }} />
          {post.badge && (
            <div style={{ position: "absolute", left: 15, bottom: 16, padding: "6px 12px", borderRadius: 18, background: alpha(pal.fg, 0.55), display: "flex", alignItems: "center", gap: 8, fontFamily: fonts.display, fontSize: 15, fontWeight: 600, color: surface }}>
              <div style={{ width: 9, height: 9, borderRadius: 5, background: hi }} />
              {post.badge}
            </div>
          )}
        </div>
        <div style={box(439, 297, 561, 130)}>
          <div style={label}>{el.labels[0]}</div>
          <div style={{ position: "absolute", left: 21, top: 50, width: 520, fontFamily: fonts.display, fontSize: 25, lineHeight: 1.36, color: pal.fg, ...text }}>
            {post.text} <span style={{ color: hi, fontWeight: 600 }}>{post.tags}</span>
          </div>
        </div>
        <div style={box(439, 443, 561, 212)}>
          <div style={label}>{el.labels[1]}</div>
          {post.art && <Tile tile={post.art} w={post.artW} h={144} radius={12} style={{ left: 23, top: 50, boxShadow: `0 6px 14px ${alpha(pal.fg, 0.2)}`, ...text }} />}
        </div>
        <div style={box(439, 672, 561, 106)}>
          <div style={label}>{el.labels[2]}</div>
          <div style={{ position: "absolute", left: 23, top: 54, display: "flex", gap: 23 }}>
            {post.icons.map((icon, j) => (
              <IconView key={j} icon={icon} size={30} radius={8} />
            ))}
          </div>
          <div style={{ ...card(pal, surface, 22), right: 21, top: 48, height: 42, padding: "0 18px", display: "flex", alignItems: "center", gap: 10, fontFamily: fonts.display, fontSize: 21, fontWeight: 600, color: pal.fg }}>
            <div style={{ width: 9, height: 9, borderRadius: 5, background: ok }} />
            <span style={text}>{post.time}</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const YearGrid: React.FC<{ el: El<"yearGrid">; t: number }> = ({ el, t }) => {
  const { pal, fonts, surface, paint } = useLook();
  const color = paint(el.color);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, width: 1920, top: 90, transform: "translateY(-50%)", textAlign: "center", fontFamily: fonts.display, fontSize: 52, color: pal.fg, letterSpacing: "-0.01em" }}>{el.title}</div>
      {MONTHS.map((name, m) => {
        const x = 180 + (m % 4) * 396.5;
        const y = 138 + Math.floor(m / 4) * 302;
        const first = new Date(Date.UTC(el.year, m, 1)).getUTCDay();
        const days = new Date(Date.UTC(el.year, m + 1, 0)).getUTCDate();
        const dots = m >= el.dotsFrom ? ramp(t, el.dotsAt + (m - el.dotsFrom) * el.dotsEvery, 6) : 0;
        const hiM = m === el.highlight;
        return (
          <div key={m} style={{ ...card(pal, surface, 20), left: x, top: y, width: 370, height: 275, border: hiM ? `2px solid ${alpha(color, 0.45)}` : card(pal, surface, 20).border }}>
            <div style={{ position: "absolute", left: 20, top: 28, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 22, fontWeight: hiM ? 600 : 400, color: hiM ? color : pal.fg }}>{name}</div>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, c) => (
              <div key={c} style={{ position: "absolute", left: 41 + c * 48, top: 56, transform: "translate(-50%, -50%)", fontFamily: fonts.display, fontSize: 11, color: alpha(pal.fg, 0.35) }}>{d}</div>
            ))}
            {Array.from({ length: days }, (_, d) => {
              const cell = first + d;
              const cxp = 41 + (cell % 7) * 48;
              const cyp = 81 + Math.floor(cell / 7) * 33;
              return (
                <div key={d}>
                  <div style={{ position: "absolute", left: cxp, top: cyp, transform: "translate(-50%, -50%)", fontFamily: fonts.display, fontSize: 13.5, color: alpha(pal.fg, 0.6) }}>{d + 1}</div>
                  {dots > 0 && <div style={{ position: "absolute", left: cxp - 2.5, top: cyp + 9, width: 5, height: 5, borderRadius: 3, background: color, opacity: dots }} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "With **Reason**, ..." -> spans with the bold run.
function rich(text: string, weight = 700) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith("**") ? <b key={i} style={{ fontWeight: weight }}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>));
}

const Heatmap: React.FC<{ el: El<"heatmap">; t: number }> = ({ el, t }) => {
  const { pal, fonts, surface, paint } = useLook();
  return (
    <AbsoluteFill>
      {el.logo && (
        <div style={{ position: "absolute", left: 960 - 29, top: 88 - 29, opacity: ramp(t, el.logoAt, 6), boxShadow: `0 10px 22px ${alpha(pal.fg, 0.18)}`, borderRadius: 6 }}>
          <IconView icon={el.logo} size={58} radius={6} />
        </div>
      )}
      {el.rows.map((row, ri) => {
        const color = paint(row.color);
        const head = ramp(t, row.at, 8);
        const labels = ramp(t, row.at + 8, 6);
        const top = row.y + 70;
        return (
          <div key={ri}>
            <div style={{ position: "absolute", left: 0, width: 1920, top: row.y, transform: "translateY(-50%)", textAlign: "center", fontFamily: fonts.display, fontSize: 41, color: pal.fg, opacity: head, filter: head < 1 ? `blur(${(1 - head) * 8}px)` : undefined }}>{rich(row.text)}</div>
            {MONTHS_SHORT.map((mo, i) => (
              <div key={mo} style={{ position: "absolute", left: 464 + i * 86.5, top: top - 17, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 15, color: alpha(pal.fg, 0.35), opacity: labels }}>{mo}</div>
            ))}
            {["Mon", "Wed", "Fri"].map((d, i) => (
              <div key={d} style={{ position: "absolute", left: 420, top: top + 28 + i * 40, transform: "translateY(-50%)", fontFamily: fonts.display, fontSize: 12.5, color: alpha(pal.fg, 0.4), opacity: labels }}>{d}</div>
            ))}
            {Array.from({ length: 52 * 7 }, (_, i) => {
              const c = Math.floor(i / 7);
              const r = i % 7;
              const v = ramp(t, row.at + 12 + (c * row.sweep) / 52, 5);
              if (v <= 0) return null;
              const n = random(`${row.seed}:${c}:${r}`);
              const empty = row.empty ?? (1 - row.density) * 0.5;
              const level = n < empty ? 0.18 : 0.45 + Math.min(1, (n - empty) / (1 - empty)) * 0.55;
              const fill = level < 0.2 ? `color-mix(in srgb, ${color} 22%, ${surface})` : `color-mix(in srgb, ${color} ${Math.round(level * 100)}%, ${level > 0.8 ? pal.fg : surface} ${level > 0.8 ? 15 : 0}%)`;
              return <div key={i} style={{ position: "absolute", left: 464 + c * 20, top: top + r * 20, width: 16, height: 16, borderRadius: 4, opacity: v, background: fill, boxShadow: `inset 0 -2px 3px ${alpha(pal.fg, 0.12)}, inset 0 2px 2px ${alpha(surface, 0.35)}` }} />;
            })}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Counter: React.FC<{ el: El<"counter">; t: number }> = ({ el, t }) => {
  const { pal, fonts } = useLook();
  const k = interpolate(t, [el.countAt, el.countAt + el.countFrames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const value = Math.round(el.start + (el.end - el.start) * k);
  const m = el.moveAt === undefined ? 0 : ramp(t, el.moveAt, 16, easeInOut);
  const x = 960 + (el.moveTo.x - 960) * m;
  const y = 540 + (el.moveTo.y - 540) * m;
  const s = 1 + (el.moveTo.scale - 1) * m;
  const sub = ramp(t, el.subAt, 8);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `scale(${s})` }}>
      <div style={{ position: "absolute", left: 0, top: 0, transform: "translate(-50%, -50%)", fontFamily: fonts.display, fontSize: el.size, fontWeight: 400, color: pal.fg, letterSpacing: "-0.02em", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {value}
        {el.suffix}
      </div>
      {el.sub && <div style={{ position: "absolute", left: 0, top: 170, transform: "translate(-50%, -50%)", fontFamily: fonts.display, fontSize: 46, color: alpha(pal.fg, 0.55), whiteSpace: "nowrap", opacity: sub }}>{el.sub}</div>}
    </div>
  );
};

const Phone: React.FC<{ el: El<"phone">; t: number }> = ({ el, t }) => {
  const { pal, fonts, paint } = useLook();
  const wall = useAsset(el.wallpaper);
  const tint = paint(el.tint);
  const k = ramp(t, el.enterAt, 18, Easing.out(Easing.poly(4)));
  const h = el.w * 2.035;
  const x = el.x + (1 - k) * 900;
  const turn = el.turn + Math.sin(t / 40) * 2;
  const s = el.w / 520;
  // The room lights up for a moment as each note arrives.
  const flare = el.glow ? Math.max(0, ...el.notes.map((n) => (t >= n.at ? Math.max(0, 1 - (t - n.at) / 40) : 0))) : 0;
  const room = el.glow ? (
    <div style={{ position: "absolute", left: x - el.w * 1.6, top: el.y - h * 0.9, width: el.w * 3.2, height: h * 1.8, borderRadius: "50%", background: `radial-gradient(ellipse, ${alpha(paint(el.glow), 0.12 + 0.3 * flare)}, ${alpha(paint(el.glow), 0)} 62%)` }} />
  ) : null;
  return (
    <>
    {room}
    <div style={{ position: "absolute", left: x - el.w / 2, top: el.y - h / 2, width: el.w, height: h, transform: `perspective(1800px) rotateX(${el.tilt}deg) rotateY(${turn + (1 - k) * -20}deg) rotateZ(${(1 - k) * 8}deg)`, borderRadius: 82 * s, background: pal.fg, padding: 15 * s, boxSizing: "border-box", boxShadow: `-30px 40px 80px ${alpha(pal.fg, 0.3)}` }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 68 * s, overflow: "hidden", background: `linear-gradient(170deg, ${alpha(pal.muted, 0.9)}, ${pal.fg})` }}>
        {wall ? (
          <Img src={mediaUrl(wall)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", left: "50%", top: "62%", transform: "translate(-50%, -50%)", opacity: 0.12 }}>
            <BrandMark size={420 * s} color={pal.bg} />
          </div>
        )}
        <div style={{ position: "absolute", left: "50%", top: 22 * s, width: 140 * s, height: 38 * s, transform: "translateX(-50%)", borderRadius: 20 * s, background: pal.fg }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 150 * s, transform: "translateY(-50%)", textAlign: "center", fontFamily: fonts.display, fontSize: 104 * s, fontWeight: 600, color: tint, letterSpacing: "-0.02em" }}>{el.time}</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 232 * s, transform: "translateY(-50%)", textAlign: "center", fontFamily: fonts.display, fontSize: 25 * s, fontWeight: 600, color: tint }}>{el.date}</div>
        {el.notes.map((n, i) => {
          const v = ramp(t, n.at, 8);
          if (v <= 0) return null;
          return (
            <div key={i} style={{ position: "absolute", left: 20 * s, right: 20 * s, top: (263 + i * 92) * s, height: 76 * s, borderRadius: 22 * s, background: alpha(tint, 0.3), backdropFilter: "blur(14px)", border: `1px solid ${alpha(tint, 0.25)}`, opacity: v, transform: `translateY(${(1 - v) * -24}px) scale(${0.96 + 0.04 * v})`, display: "flex", alignItems: "center", gap: 14 * s, padding: `0 ${16 * s}px`, boxSizing: "border-box" }}>
              <IconView icon={n.icon} size={42 * s} radius={10 * s} />
              <div style={{ flex: 1, minWidth: 0, fontFamily: fonts.display, color: tint }}>
                <div style={{ fontSize: 15 * s, fontWeight: 700 }}>{n.app}</div>
                <div style={{ fontSize: 16 * s, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.body}</div>
              </div>
              <div style={{ alignSelf: "flex-start", marginTop: 14 * s, fontFamily: fonts.display, fontSize: 12 * s, color: alpha(tint, 0.7) }}>{n.ago}</div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
};

const Cursor: React.FC<{ el: El<"cursor">; t: number }> = ({ el, t }) => {
  const { pal } = useLook();
  const keys = el.path;
  const x = at(keys.map(([f, px]) => [f, px] as [number, number]), t);
  const y = at(keys.map(([f, , py]) => [f, py] as [number, number]), t);
  const press = el.clicks.some((c) => t >= c && t < c + 5) ? 0.85 : 1;
  return (
    <svg width={el.size} height={el.size * 1.5} viewBox="0 0 20 30" style={{ position: "absolute", left: x, top: y, transform: `scale(${press})`, transformOrigin: "0 0", filter: `drop-shadow(0 2px 3px ${alpha(pal.fg, 0.3)})` }}>
      <path d="M1 1 L1 23 L6.5 17.5 L10.5 27 L14 25.5 L10 16.5 L17.5 16.5 Z" fill={pal.fg} stroke={pal.bg} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
};

const TextEl: React.FC<{ el: El<"text"> }> = ({ el }) => {
  const { fonts, paint } = useLook();
  return <div style={{ position: "absolute", left: 0, width: 1920, top: el.y, transform: "translateY(-50%)", textAlign: "center", fontFamily: fonts.display, fontSize: el.size, fontWeight: el.weight, color: paint(el.color), letterSpacing: "-0.01em", marginLeft: el.x - 960 }}>{el.text}</div>;
};
