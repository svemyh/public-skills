import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../spec/schema";
import type { PromoCard, PromoElement } from "../../spec/promo";
import { alpha, paint } from "../lib/color";
import { mediaUrl, useAsset, useEdit } from "../lib/context";
import { BrandMark } from "../lib/mark";
import { MediaFill } from "./Basic";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;
type El<K extends PromoElement["kind"]> = Extract<PromoElement, { kind: K }>;
type Track = [number, number][];
type Pal = Record<"bg" | "fg" | "accent" | "muted", string>;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const easeOut = Easing.out(Easing.cubic);
const ramp = (t: number, a: number, frames: number, easing = easeOut) => interpolate(t, [a, a + Math.max(1, frames)], [0, 1], { ...clamp, easing });
const track = (tr: Track, t: number) => (tr.length === 1 ? tr[0]![1] : interpolate(t, tr.map((k) => k[0]), tr.map((k) => k[1]), { ...clamp, easing: Easing.inOut(Easing.cubic) }));
// Pointy-top hexagon outline in a 100x100 box.
const HEX = "M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z";

// Infomercial explainer graphics on the brand page: a drifting honeycomb,
// then each element inside its own camera, fading in and out with a blur.
export const Promo: React.FC<{ scene: Of<"promo"> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { spec } = useEdit();
  const pal = spec.brand.palette;
  const backdrop = useAsset(scene.field.backdrop);
  return (
    <AbsoluteFill style={{ background: pal.bg, overflow: "hidden" }}>
      {backdrop ? (
        <AbsoluteFill>
          <MediaFill asset={backdrop} offset={scene.field.backdropStart} />
          <AbsoluteFill style={{ background: alpha(pal.fg, scene.field.dim) }} />
        </AbsoluteFill>
      ) : (
        <Honeycomb pal={pal} strength={scene.field.grid} frame={frame + scene.from} />
      )}
      {scene.elements.map((el, i) => {
        const to = el.to ?? scene.duration;
        if (frame < el.from || frame >= to) return null;
        const t = frame - el.from;
        const life = Math.min(el.fadeIn ? ramp(frame, el.from, el.fadeIn) : 1, el.fadeOut ? 1 - ramp(frame, to - el.fadeOut, el.fadeOut, Easing.in(Easing.quad)) : 1);
        const cam = el.camera;
        const transform = cam ? `translate(${track(cam.x as Track, t)}px, ${track(cam.y as Track, t)}px) scale(${track(cam.zoom as Track, t)}) rotateY(${track(cam.rotY as Track, t)}deg)` : undefined;
        return (
          <AbsoluteFill key={i} style={{ opacity: life, filter: life < 1 ? `blur(${(1 - life) * 12}px)` : undefined, perspective: 1600 }}>
            <AbsoluteFill style={{ transform, transformOrigin: "50% 50%" }}>
              <ElementView el={el} t={t} pal={pal} />
            </AbsoluteFill>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

const Honeycomb: React.FC<{ pal: Pal; strength: number; frame: number }> = ({ pal, strength, frame }) => {
  const s = 64;
  const w = s * Math.sqrt(3);
  const dy = (frame * 0.35) % (s * 3);
  const path = `M ${w / 2} 0 L ${w} ${s / 2} L ${w} ${s * 1.5} L ${w / 2} ${s * 2} L 0 ${s * 1.5} L 0 ${s / 2} Z M ${w / 2} ${s * 2} L ${w / 2} ${s * 3}`;
  return (
    <AbsoluteFill>
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="promo-hex" width={w} height={s * 3} patternUnits="userSpaceOnUse" patternTransform={`translate(0 ${-dy})`}>
            <path d={path} fill="none" stroke={alpha(pal.fg, strength)} strokeWidth={1.2} />
          </pattern>
          <radialGradient id="promo-fade" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor={pal.bg} stopOpacity={0.92} />
            <stop offset="100%" stopColor={pal.bg} stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#promo-hex)" />
        <rect width="1920" height="1080" fill="url(#promo-fade)" />
      </svg>
    </AbsoluteFill>
  );
};

const ElementView: React.FC<{ el: PromoElement; t: number; pal: Pal }> = ({ el, t, pal }) => {
  switch (el.kind) {
    case "title":
      return <Title el={el} t={t} pal={pal} />;
    case "composer":
      return <Composer el={el} t={t} pal={pal} />;
    case "cards":
      return <Cards el={el} t={t} pal={pal} />;
    case "badges":
      return <Badges el={el} t={t} pal={pal} />;
    case "tunnel":
      return <Tunnel el={el} t={t} pal={pal} />;
    case "flip":
      return <Flip el={el} t={t} pal={pal} />;
    case "logo":
      return <Logo el={el} t={t} pal={pal} />;
    case "cursor":
      return <Cursor el={el} t={t} pal={pal} />;
  }
};

const Title: React.FC<{ el: El<"title">; t: number; pal: Pal }> = ({ el, t, pal }) => {
  const { fonts } = useEdit();
  const letters = el.lines.reduce((n, l) => n + l.small.length + l.big.length, 0);
  let index = 0;
  const glyphs = (text: string, weight: number, size: number) =>
    [...text].map((ch, i) => {
      const k = index++;
      const p = ramp(t, (k / Math.max(1, letters)) * el.build, 6);
      return (
        <span key={i} style={{ display: "inline-block", fontWeight: weight, fontSize: size, opacity: p, filter: `blur(${(1 - p) * 8}px)`, transform: `translateY(${(1 - p) * 0.3 * size}px)`, whiteSpace: "pre" }}>
          {ch}
        </span>
      );
    });
  const stroke = ramp(t, el.build + 2, 12);
  const anchor = el.align === "center" ? "-50%" : el.align === "right" ? "-100%" : "0";
  return (
    <div style={{ position: "absolute", left: el.x, top: el.y, transform: `translate(${anchor}, -50%)`, textAlign: el.align, color: pal.fg, fontFamily: fonts.display, lineHeight: 0.95, letterSpacing: "-0.035em", textTransform: "uppercase" }}>
      {el.lines.map((l, i) => (
        <div key={i} style={{ whiteSpace: "nowrap" }}>
          {l.small ? glyphs(l.small + (l.big ? " " : ""), 500, el.size * 0.6) : null}
          {glyphs(l.big, 850, el.size)}
        </div>
      ))}
      {el.stroke ? (
        <div style={{ height: Math.max(3, el.size * 0.045), marginTop: el.size * 0.12, background: pal.fg, width: `${stroke * 100}%`, marginLeft: el.align === "center" ? `${(1 - stroke) * 50}%` : el.align === "right" ? `${(1 - stroke) * 100}%` : 0, borderRadius: 4 }} />
      ) : null}
    </div>
  );
};

const surface = (pal: Pal) => ({ background: pal.bg, border: `1.5px solid ${alpha(pal.fg, 0.14)}`, boxShadow: `0 30px 80px ${alpha(pal.fg, 0.14)}, 0 4px 14px ${alpha(pal.fg, 0.06)}` });

const Composer: React.FC<{ el: El<"composer">; t: number; pal: Pal }> = ({ el, t, pal }) => {
  const { fonts } = useEdit();
  const n = Math.max(0, Math.min(el.typed.length, Math.floor((t - el.typeAt) / el.typeEvery)));
  const shown = el.typed.slice(0, n);
  const typing = t >= el.typeAt && n < el.typed.length;
  const words = shown.split(/(\s+)/);
  const press = el.pressAt !== undefined ? t - el.pressAt : -1;
  const pressScale = press < 0 ? 1 : press < 4 ? 1 - 0.08 * Math.sin((press / 4) * Math.PI) : 1;
  const ring = press >= 0 ? ramp(press, 0, 14) : 0;
  const s = el.size;
  return (
    <div style={{ position: "absolute", left: el.box.x, top: el.box.y, width: el.box.w, height: el.box.h, borderRadius: 34, ...surface(pal), fontFamily: fonts.display, color: pal.fg }}>
      <div style={{ position: "absolute", left: 40, top: 34, right: 40, fontSize: s, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
        {shown.length === 0 ? <span style={{ color: alpha(pal.fg, 0.35) }}>Ask Reason…</span> : null}
        {words.map((w, i) =>
          w.startsWith("@") ? (
            <span key={i} style={{ fontWeight: 650, background: alpha(pal.fg, 0.08), borderRadius: 8, padding: "0 6px" }}>{w}</span>
          ) : (
            <span key={i} style={{ whiteSpace: "pre" }}>{w}</span>
          ),
        )}
        {typing || (t >= el.typeAt && Math.floor(t / 8) % 2 === 0 && press < 0) ? <span style={{ display: "inline-block", width: 3, height: s * 1.05, marginLeft: 3, verticalAlign: "-0.15em", background: pal.fg }} /> : null}
      </div>
      <div style={{ position: "absolute", left: 32, bottom: 28, display: "flex", gap: 14 }}>
        {el.chips.map((c, i) => (
          <Chip key={i} chip={c} t={t} pal={pal} size={s} />
        ))}
      </div>
      {el.button ? (
        <div style={{ position: "absolute", right: 28, bottom: 24, transform: `scale(${pressScale})` }}>
          {ring > 0 && ring < 1 ? <div style={{ position: "absolute", inset: -24 * ring, borderRadius: 999, border: `3px solid ${alpha(pal.fg, 0.5 * (1 - ring))}` }} /> : null}
          <div style={{ background: pal.fg, color: pal.bg, borderRadius: 999, padding: `${s * 0.34}px ${s * 0.8}px`, fontSize: s * 0.78, fontWeight: 650, letterSpacing: "0.02em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 12 }}>
            {el.button}
            <svg width={s * 0.6} height={s * 0.6} viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke={pal.bg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const Chip: React.FC<{ chip: El<"composer">["chips"][number]; t: number; pal: Pal; size: number }> = ({ chip, t, pal, size }) => {
  const { fonts } = useEdit();
  const open = chip.openAt !== undefined && t >= chip.openAt && (chip.closeAt === undefined || t < chip.closeAt);
  const picked = chip.pickAt !== undefined && t >= chip.pickAt && chip.pick ? chip.pick : chip.value;
  const o = chip.openAt !== undefined ? ramp(t, chip.openAt, 6) * (chip.closeAt !== undefined ? 1 - ramp(t, chip.closeAt - 4, 4) : 1) : 0;
  const fs = size * 0.7;
  return (
    <div style={{ position: "relative", fontFamily: fonts.display }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: `${fs * 0.45}px ${fs * 0.85}px`, borderRadius: 999, background: alpha(pal.fg, open ? 0.1 : 0.05), border: `1.5px solid ${alpha(pal.fg, open ? 0.5 : 0.1)}`, fontSize: fs, color: pal.fg, whiteSpace: "nowrap" }}>
        <span style={{ color: pal.muted }}>{chip.label}</span>
        <span style={{ fontWeight: 600 }}>{picked}</span>
        <svg width={fs * 0.7} height={fs * 0.7} viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke={pal.fg} strokeWidth={2.4} strokeLinecap="round" /></svg>
      </div>
      {open && chip.options.length ? (
        <div style={{ position: "absolute", left: 0, top: `calc(100% + 14px)`, minWidth: "100%", padding: 10, borderRadius: 20, ...surface(pal), opacity: o, transform: `translateY(${(1 - o) * -16}px)` }}>
          {chip.options.map((opt, i) => {
            const sel = opt === picked;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 28, padding: `${fs * 0.35}px ${fs * 0.6}px`, borderRadius: 12, background: sel ? alpha(pal.fg, 0.07) : undefined, fontSize: fs, color: pal.fg, fontWeight: sel ? 600 : 400, whiteSpace: "nowrap" }}>
                {opt}
                {sel ? <svg width={fs * 0.8} height={fs * 0.8} viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={pal.fg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></svg> : <span style={{ width: fs * 0.8 }} />}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

// A person silhouette in a circle (never initials).
const Person: React.FC<{ size: number; pal: Pal; ink?: boolean }> = ({ size, pal, ink }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: ink ? pal.fg : alpha(pal.fg, 0.12), overflow: "hidden", flex: "none", position: "relative" }}>
    {ink ? (
      <div style={{ position: "absolute", inset: size * 0.2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BrandMark size={size * 0.56} color={pal.bg} />
      </div>
    ) : (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: "absolute", inset: 0 }}>
        <circle cx="12" cy="9.5" r="4" fill={alpha(pal.fg, 0.55)} />
        <path d="M4 22c0-4.6 3.6-7.6 8-7.6s8 3 8 7.6z" fill={alpha(pal.fg, 0.55)} />
      </svg>
    )}
  </div>
);

export const CardBody: React.FC<{ card: PromoCard; pal: Pal; t: number }> = ({ card, pal, t }) => {
  const { spec, fonts } = useEdit();
  const asset = useAsset(card.asset);
  // Type scales with the card, held to its shorter side so wide cards don't overflow.
  const s = Math.min(card.w / 400, card.h / 300);
  if (asset) {
    const c = card.crop;
    const img = c ? { position: "absolute" as const, width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%`, objectFit: "fill" as const } : { width: "100%", height: "100%", objectFit: "cover" as const };
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {asset.type === "video" ? <div style={img}><MediaFill asset={asset} /></div> : <Img src={mediaUrl(asset)} style={img} />}
        {card.play ? (
          <div style={{ position: "absolute", left: "50%", top: "50%", width: 74 * s, height: 74 * s, marginLeft: -37 * s, marginTop: -37 * s, borderRadius: "50%", background: alpha(pal.bg, 0.92), display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 30px ${alpha(pal.fg, 0.3)}` }}>
            <svg width={30 * s} height={30 * s} viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill={pal.fg} /></svg>
          </div>
        ) : null}
      </div>
    );
  }
  const ui = card.ui ?? { kind: "lines" as const, title: "", lines: [], footer: "" };
  const fs = 23 * s;
  const head = ui.title ? (
    <div style={{ display: "flex", alignItems: "center", gap: 12 * s, fontSize: fs * 1.15, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 16 * s }}>
      {ui.kind === "agent" ? <Person size={34 * s} pal={pal} ink /> : null}
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ui.title}</span>
      {ui.kind === "pr" ? <span style={{ marginLeft: "auto", fontSize: fs * 0.72, fontWeight: 650, padding: `${4 * s}px ${12 * s}px`, borderRadius: 999, background: pal.fg, color: pal.bg }}>Merged</span> : null}
    </div>
  ) : null;
  return (
    <div style={{ position: "absolute", inset: 0, padding: 26 * s, fontFamily: fonts.display, color: pal.fg, display: "flex", flexDirection: "column" }}>
      {head}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 * s }}>
        {ui.lines.map((line, i) => {
          if (ui.kind === "chat") {
            const [name, ...rest] = line.split(": ");
            const isAgent =
              (name ?? "").toLowerCase() === spec.brand.name.toLowerCase() || /agent|bot|claude|codex|grok/i.test(name ?? "");
            return (
              <div key={i} style={{ display: "flex", gap: 12 * s, alignItems: "flex-start" }}>
                <Person size={34 * s} pal={pal} ink={isAgent} />
                <div style={{ fontSize: fs * 0.92, lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 700 }}>{name}</div>
                  <div style={{ color: alpha(pal.fg, 0.75) }}>{rest.join(": ")}</div>
                </div>
              </div>
            );
          }
          if (ui.kind === "diff" || ui.kind === "agent") {
            const add = line.startsWith("+");
            const del = line.startsWith("-");
            return (
              <div key={i} style={{ fontFamily: fonts.mono, fontSize: fs * 0.78, padding: `${3 * s}px ${8 * s}px`, borderRadius: 6 * s, background: add ? alpha(pal.fg, 0.08) : undefined, color: del ? pal.muted : pal.fg, textDecoration: del ? "line-through" : undefined, whiteSpace: "nowrap", overflow: "hidden" }}>
                {line}
              </div>
            );
          }
          return (
            <div key={i} style={{ fontSize: fs * 0.9, color: i === 0 && ui.kind === "pr" ? pal.fg : alpha(pal.fg, 0.7), lineHeight: 1.3, display: "flex", gap: 10 * s, alignItems: "center" }}>
              {ui.kind === "pr" ? <span style={{ fontFamily: fonts.mono, fontSize: fs * 0.7, color: pal.muted }}>{line.startsWith("✓") ? "" : "▸"}</span> : null}
              {line}
            </div>
          );
        })}
      </div>
      {ui.footer ? (
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10 * s, fontSize: fs * 0.85, fontWeight: 600 }}>
          <svg width={fs} height={fs} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={pal.fg} /><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke={pal.bg} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
          {ui.footer}
        </div>
      ) : null}
    </div>
  );
};

const CardFrame: React.FC<{ card: PromoCard; pal: Pal; t: number; style?: React.CSSProperties }> = ({ card, pal, t, style }) => {
  const { fonts } = useEdit();
  const hi = card.highlightAt !== undefined && t >= card.highlightAt && (card.highlightOut === undefined || t < card.highlightOut);
  const hp = card.highlightAt !== undefined ? ramp(t, card.highlightAt, 5) : 0;
  return (
    <div style={{ position: "absolute", left: card.x - card.w / 2, top: card.y - card.h / 2, width: card.w, height: card.h, ...style }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 22, overflow: "hidden", ...surface(pal), outline: hi ? `${4 * hp}px solid ${pal.fg}` : undefined, outlineOffset: 6 }}>
        <CardBody card={card} pal={pal} t={t} />
      </div>
      {card.label ? (
        <div style={{ position: "absolute", top: card.h + 18, left: 0, right: 0, textAlign: "center", fontFamily: fonts.display, fontSize: 28, fontWeight: 500, color: pal.muted, letterSpacing: "0.01em" }}>{card.label}</div>
      ) : null}
    </div>
  );
};

const Cards: React.FC<{ el: El<"cards">; t: number; pal: Pal }> = ({ el, t, pal }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ perspective: 1400 }}>
      {el.arrows
        ? el.cards.slice(1).map((c, i) => {
            const prev = el.cards[i]!;
            const p = ramp(t, c.at, 10);
            const x0 = prev.x + prev.w / 2 + 22;
            const x1 = c.x - c.w / 2 - 22;
            const y = (prev.y + c.y) / 2;
            const len = (x1 - x0) * p;
            return (
              <svg key={`a${i}`} width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
                <line x1={x0} y1={y} x2={x0 + len} y2={y} stroke={pal.fg} strokeWidth={3} strokeLinecap="round" />
                {p > 0.9 ? <path d={`M ${x0 + len - 14} ${y - 10} L ${x0 + len} ${y} L ${x0 + len - 14} ${y + 10}`} fill="none" stroke={pal.fg} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
              </svg>
            );
          })
        : null}
      {el.cards.map((c, i) => {
        if (t < c.at) return null;
        const p = el.enter === "pop" ? spring({ frame: t - c.at, fps, config: { damping: 14, stiffness: 160 } }) : ramp(t, c.at, 14);
        const transform =
          el.enter === "swing"
            ? `rotateY(${(1 - p) * -40 + c.tilt}deg) translateZ(${(1 - p) * -400}px) translateX(${(1 - p) * 120}px)`
            : el.enter === "rise"
              ? `translateY(${(1 - p) * 120}px) rotateY(${c.tilt}deg)`
              : `scale(${0.6 + 0.4 * p}) rotateY(${c.tilt}deg)`;
        return <CardFrame key={i} card={c} pal={pal} t={t} style={{ opacity: Math.min(1, p * 1.4), transform, filter: p < 1 ? `blur(${(1 - Math.min(1, p)) * 10}px)` : undefined }} />;
      })}
    </AbsoluteFill>
  );
};

const Badges: React.FC<{ el: El<"badges">; t: number; pal: Pal }> = ({ el, t, pal }) => {
  const { fonts } = useEdit();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {el.badges.map((b, i) => {
        if (t < b.at) return null;
        const p = spring({ frame: t - b.at, fps, config: { damping: 11, stiffness: 170 } });
        const bob = Math.sin((t + i * 13) / 14) * 6;
        return (
          <div key={i} style={{ position: "absolute", left: b.x, top: b.y + bob, transform: `translate(-50%, -50%) scale(${p})`, display: "flex", alignItems: "center", gap: 14, padding: `${el.size * 0.35}px ${el.size * 0.7}px`, borderRadius: 999, background: pal.fg, color: pal.bg, fontFamily: fonts.display, fontSize: el.size, fontWeight: 650, whiteSpace: "nowrap", boxShadow: `0 18px 40px ${alpha(pal.fg, 0.25)}` }}>
            <svg width={el.size * 0.8} height={el.size * 0.8} viewBox="0 0 24 24"><path d="M4 17l6-5-6-5M12 19h8" fill="none" stroke={pal.bg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
            {b.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Tunnel: React.FC<{ el: El<"tunnel">; t: number; pal: Pal }> = ({ el, t, pal }) => (
  <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
    {Array.from({ length: el.rings }, (_, i) => {
      const k = i + t / 3;
      const sc = 0.35 * Math.pow(1.38, k);
      if (sc > 40) return null;
      const op = Math.min(1, sc / 0.8) * Math.max(0, 1 - sc / 40);
      return (
        <path key={i} d={HEX} transform={`translate(${el.x} ${el.y}) scale(${sc}) translate(-50 -50)`} fill="none" stroke={alpha(pal.fg, op)} strokeWidth={3.2} vectorEffect="non-scaling-stroke" />
      );
    })}
  </svg>
);

const Flip: React.FC<{ el: El<"flip">; t: number; pal: Pal }> = ({ el, t, pal }) => {
  const p = ramp(t, el.flipAt, el.flipFrames, Easing.out(Easing.back(1.2)));
  const rot = el.spin * (1 - p);
  const back = ((rot % 360) + 360) % 360 > 90 && ((rot % 360) + 360) % 360 < 270;
  const c = el.card;
  return (
    <AbsoluteFill style={{ perspective: 1800 }}>
      <div style={{ position: "absolute", left: c.x - c.w / 2, top: c.y - c.h / 2, width: c.w, height: c.h, transform: `rotateY(${rot}deg) rotateZ(${c.tilt * (1 - p)}deg)`, transformStyle: "preserve-3d" }}>
        {back ? (
          <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: pal.fg, transform: "rotateY(180deg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrandMark size={c.h * 0.32} color={pal.bg} />
          </div>
        ) : (
          <CardFrame card={{ ...c, x: c.w / 2, y: c.h / 2 }} pal={pal} t={t} />
        )}
      </div>
    </AbsoluteFill>
  );
};

const Logo: React.FC<{ el: El<"logo">; t: number; pal: Pal }> = ({ el, t, pal }) => {
  const { spec, fonts } = useEdit();
  const { fps } = useVideoConfig();
  const p = spring({ frame: t, fps, config: { damping: 13, stiffness: 120 } });
  const ink = paint(pal, el.color);
  const halo = paint(pal, el.halo);
  return (
    <div style={{ position: "absolute", left: el.x, top: el.y, transform: `translate(-50%, -50%) scale(${0.7 + 0.3 * p})`, display: "flex", alignItems: "center", gap: el.size * 0.28, filter: `drop-shadow(0 0 ${el.size * 0.3}px ${halo})` }}>
      <BrandMark size={el.size} color={ink} />
      <span style={{ fontFamily: fonts.wordmark, fontWeight: spec.brand.wordmarkWeight + 100, fontSize: el.size * 0.95, color: ink, letterSpacing: "-0.03em", lineHeight: 1 }}>{spec.brand.wordmark}</span>
    </div>
  );
};

const Cursor: React.FC<{ el: El<"cursor">; t: number; pal: Pal }> = ({ el, t, pal }) => {
  const xs = el.path.map((p) => [p[0], p[1]] as [number, number]);
  const ys = el.path.map((p) => [p[0], p[2]] as [number, number]);
  const click = el.clickAt.some((c) => t >= c && t < c + 5);
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" style={{ position: "absolute", left: track(xs, t), top: track(ys, t), transform: `scale(${click ? 0.85 : 1})`, filter: `drop-shadow(0 6px 10px ${alpha(pal.fg, 0.3)})` }}>
      <path d="M4 3l15 8-6.5 1.6L9.8 19z" fill={pal.fg} stroke={pal.bg} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
};
