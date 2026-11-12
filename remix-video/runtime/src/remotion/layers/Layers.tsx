import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Layer } from "../../spec/schema";
import { alpha, paint } from "../lib/color";
import { mediaUrl, useAsset, useEdit } from "../lib/context";
import { morphFaces } from "../lib/fonts";
import { BrandMark } from "../lib/mark";

type Of<K extends Layer["kind"]> = Extract<Layer, { kind: K }>;

// Grade layers become one CSS filter on the scene (or a backdrop filter when
// used as an overlay across scenes).
export function gradeFilter(layers: Layer[]): string | undefined {
  const parts: string[] = [];
  for (const l of layers) {
    if (l.kind !== "grade") continue;
    if (l.grayscale) parts.push(`grayscale(${l.grayscale})`);
    if (l.contrast !== 1) parts.push(`contrast(${l.contrast})`);
    if (l.brightness !== 1) parts.push(`brightness(${l.brightness})`);
    if (l.invert) parts.push("invert(1)");
    if (l.blur) parts.push(`blur(${l.blur}px)`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

export const LayerView: React.FC<{ layer: Layer }> = ({ layer }) => {
  switch (layer.kind) {
    case "letterbox":
      return <Letterbox layer={layer} />;
    case "trackingBoxes":
      return <TrackingBoxes layer={layer} />;
    case "text":
      return <TextLayer layer={layer} />;
    case "flash":
      return <Flash layer={layer} />;
    case "vignette":
      return <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${layer.strength}) 100%)` }} />;
    case "grain":
      return <Grain layer={layer} />;
    case "pixelMark":
      return <PixelMark layer={layer} />;
    case "codeOverlay":
      return <CodeOverlay layer={layer} />;
    case "grade": {
      const filter = gradeFilter([layer]);
      return filter ? <AbsoluteFill style={{ backdropFilter: filter, WebkitBackdropFilter: filter }} /> : null;
    }
    case "glitch":
      return null; // a wrapper, applied by SceneView
    case "mark":
      return <MarkLayer layer={layer} />;
    case "prompt":
      return <PromptBox layer={layer} />;
    case "horizon":
      return <Horizon layer={layer} />;
  }
};

// Sky above a circular arc; the scene shows through below it.
const Horizon: React.FC<{ layer: Of<"horizon"> }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const { spec } = useEdit();
  const t = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const cx = layer.x ?? width / 2;
  const apex = layer.y - layer.rise * t;
  const half = width / 2 + Math.abs(width / 2 - cx);
  const r = (half * half + layer.sag * layer.sag) / (2 * layer.sag);
  const circle = `M ${cx - r} ${apex + r} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  const pad = width;
  const sky = `M ${-pad} ${-pad} H ${width + pad} V ${height + pad} H ${-pad} Z ${circle}`;
  const rim = layer.rim ? paint(spec.brand.palette, layer.rim) : undefined;
  return (
    <AbsoluteFill>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <g transform={`rotate(${layer.tilt} ${cx} ${apex})`}>
          <path d={sky} fillRule="evenodd" fill={paint(spec.brand.palette, layer.color)} />
          {rim && layer.glow > 0 && (
            <path d={circle} fill="none" stroke={rim} strokeWidth={layer.glow} opacity={0.55} style={{ filter: `blur(${layer.glow / 2}px)` }} />
          )}
          {rim && layer.rimWidth > 0 && <path d={circle} fill="none" stroke={rim} strokeWidth={layer.rimWidth} />}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

// The mark as a solid shape, arriving like a text layer.
const MarkLayer: React.FC<{ layer: Of<"mark"> }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { spec } = useEdit();
  const end = layer.duration === undefined ? Infinity : layer.from + layer.duration;
  if (frame < layer.from || frame >= end) return null;
  const t = interpolate(frame - layer.from, [0, 6], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const rise = layer.enter === "rise" ? (1 - t) * layer.size * 0.5 : 0;
  const drift = layer.driftY ? layer.driftY * Easing.in(Easing.quad)(interpolate(frame - layer.from, [0, (layer.duration ?? durationInFrames - layer.from) - 1], [0, 1], { extrapolateRight: "clamp" })) : 0;
  const scale = layer.enter === "track" ? 1.25 - t * 0.25 : 1;
  const blur = layer.enter === "blur" ? (1 - t) * 14 : 0;
  return (
    <div style={{ position: "absolute", left: layer.x, top: layer.y, opacity: layer.enter === "cut" ? 1 : t, filter: blur ? `blur(${blur}px)` : undefined, transform: `translate(-50%, calc(-50% + ${rise + drift}px)) scale(${scale})` }}>
      <BrandMark size={layer.size} color={paint(spec.brand.palette, layer.color ?? "fg")} />
    </div>
  );
};

const Letterbox: React.FC<{ layer: Of<"letterbox"> }> = ({ layer }) => {
  const { width, height } = useVideoConfig();
  const { spec } = useEdit();
  const color = layer.color ?? spec.brand.palette.bg;
  const bar = Math.max(0, (height - width / layer.ratio) / 2);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: bar, background: color }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: bar, background: color }} />
    </AbsoluteFill>
  );
};

// Thin "computer vision" rectangles. Random ones re-roll every 2 frames,
// clustered inside the letterboxed band like detector output.
const TrackingBoxes: React.FC<{ layer: Of<"trackingBoxes"> }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec } = useEdit();
  const color = layer.color ?? spec.brand.palette.accent;
  const tick = Math.floor(frame / 2);
  const boxes =
    layer.boxes ??
    Array.from({ length: layer.count }, (_, i) => {
      const r = (k: string) => random(`${layer.seed}:${tick}:${i}:${k}`);
      const big = r("big") < 0.35;
      const w = big ? 0.12 + r("w") * 0.3 : 0.008 + r("w") * 0.03;
      const h = big ? 0.12 + r("h") * 0.3 : 0.008 + r("h") * 0.025;
      return { x: r("x") * (1 - w), y: 0.18 + r("y") * (0.64 - h), w, h };
    });
  return (
    <AbsoluteFill>
      {boxes.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x * width,
            top: b.y * height,
            width: b.w * width,
            height: b.h * height,
            border: `1.5px solid ${color}`,
            opacity: 0.85,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const TextLayer: React.FC<{ layer: Of<"text"> }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { spec, fonts } = useEdit();
  const end = layer.duration === undefined ? Infinity : layer.from + layer.duration;
  if (frame < layer.from || frame >= end) return null;
  if (layer.enter === "morph") return <MorphText layer={layer} />;
  const shown = layer.typeFrames > 0 ? Math.ceil(interpolate(frame - layer.from, [0, layer.typeFrames], [0, layer.text.length], { extrapolateRight: "clamp" })) : layer.text.length;
  // Difference blending only reads with white type: it inverts what is under it.
  const color = layer.blend === "difference" ? "#ffffff" : paint(spec.brand.palette, layer.color ?? "fg");
  const shift = layer.align === "center" ? "-50%" : layer.align === "right" ? "-100%" : "0";
  const t = interpolate(frame - layer.from, [0, 6], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const rise = layer.enter === "rise" ? (1 - t) * layer.size * 0.9 : 0;
  const drift = layer.driftY ? layer.driftY * Easing.in(Easing.quad)(interpolate(frame - layer.from, [0, (layer.duration ?? durationInFrames - layer.from) - 1], [0, 1], { extrapolateRight: "clamp" })) : 0;
  const opacity = layer.enter === "cut" ? 1 : t;
  const blur = layer.enter === "blur" ? (1 - t) * 14 : 0;
  const base = layer.tracking ?? (layer.font === "display" ? -0.01 : 0);
  const tracking = `${base + (layer.enter === "track" ? (1 - t) * 0.6 : 0)}em`;
  const plate = layer.plate;
  return (
    <div
      style={{
        position: "absolute",
        left: layer.x,
        top: layer.y,
        ...(plate && {
          display: "flex",
          alignItems: "center",
          justifyContent: layer.align === "center" ? "center" : layer.align === "right" ? "flex-end" : "flex-start",
          boxSizing: "border-box",
          padding: `${plate.padY}px ${plate.padX}px`,
          minWidth: plate.minWidth,
          minHeight: plate.minHeight,
          borderRadius: plate.radius,
          background: paint(spec.brand.palette, plate.color),
          border: plate.border ? `1.5px solid ${paint(spec.brand.palette, plate.border)}` : undefined,
        }),
        opacity,
        filter: blur ? `blur(${blur}px)` : undefined,
        transform: `translate(${shift}, calc(-50% + ${rise + drift}px))${layer.mirror ? " scaleX(-1)" : ""}`,
        fontFamily: fonts[layer.font],
        fontSize: layer.size,
        fontWeight: layer.weight,
        color,
        whiteSpace: "pre",
        letterSpacing: tracking,
        mixBlendMode: layer.blend === "difference" ? "difference" : undefined,
        textShadow:
          layer.glow && layer.blend !== "difference"
            ? `0 0 ${layer.glow}px ${color}, 0 0 ${layer.glow * 2.5}px ${color}66`
            : layer.shadow
              ? `0 0 ${layer.shadow}px ${alpha(spec.brand.palette.fg, 0.45)}, 0 ${layer.shadow * 0.15}px ${layer.shadow * 0.5}px ${alpha(spec.brand.palette.fg, 0.35)}`
              : undefined,
      }}
    >
      {layer.text.slice(0, shown)}
    </div>
  );
};

const GLYPHS = ["let", "fn", "λ", "$", "::", "→", "{}", "mut", "&&", "∂", "≈", "#", "φ", "√", "[]", "ok"];

const PixelMark: React.FC<{ layer: Of<"pixelMark"> }> = ({ layer }) => {
  const frame = useCurrentFrame() - layer.from;
  const asset = useAsset(layer.asset);
  if (frame < 0) return null;
  const left = layer.x - layer.width / 2;
  const top = layer.y - layer.height / 2;
  let start = 0;
  const stage = layer.stages.find((s) => {
    if (frame < start + s.frames) return true;
    start += s.frames;
    return false;
  });
  const crisp = stage ? 0 : interpolate(frame - start, [0, layer.crisp], [0, 1], { extrapolateRight: "clamp" });
  const shown = stage ?? layer.stages[layer.stages.length - 1];
  return (
    <AbsoluteFill>
      {shown && crisp < 1 &&
        shown.cells.map(([c, r], i) => {
          const w = layer.width / shown.cols;
          const h = layer.height / shown.rows;
          const rnd = (k: string) => random(`${layer.seed}:${shown.cols}:${i}:${k}`);
          // Cells settle into place over their stage's first frames.
          const age = stage ? frame - start - Math.floor(rnd("delay") * Math.min(4, stage.frames / 2)) : 99;
          if (age < 0) return null;
          const settle = interpolate(age, [0, 3], [1, 0], { extrapolateRight: "clamp" });
          const grey = shown.glyphs ? 34 + Math.floor(rnd("shade") * 40) : 20;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: left + c * w + (rnd("dx") - 0.5) * w * settle,
                top: top + r * h + (rnd("dy") - 0.5) * h * settle,
                width: w - (shown.glyphs ? 3 : 1),
                height: h - (shown.glyphs ? 3 : 1),
                background: shown.glyphs ? `rgb(${grey},${grey},${grey + 4})` : layer.color,
                opacity: 1 - crisp,
                color: "rgba(235,235,240,0.75)",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: h * 0.32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {shown.glyphs && rnd("glyph") < 0.7 ? GLYPHS[Math.floor(rnd("which") * GLYPHS.length)] : null}
            </div>
          );
        })}
      {asset && crisp > 0 && <Img src={mediaUrl(asset)} style={{ position: "absolute", left, top, width: layer.width, height: layer.height, opacity: crisp }} />}
    </AbsoluteFill>
  );
};

// Letters arrive one by one; each fades up from grey and flickers through
// serif faces for a seeded while before settling into the layer's font, and
// a few flick back once more.
const MorphText: React.FC<{ layer: Of<"text"> }> = ({ layer }) => {
  const frame = useCurrentFrame() - layer.from;
  const { spec, fonts } = useEdit();
  const faces = morphFaces();
  const chars = [...layer.text];
  const step = layer.typeFrames > 0 ? layer.typeFrames / chars.length : 1;
  const shift = layer.align === "center" ? "-50%" : layer.align === "right" ? "-100%" : "0";
  return (
    <div
      style={{
        position: "absolute",
        left: layer.x,
        top: layer.y,
        transform: `translate(${shift}, -50%)`,
        fontSize: layer.size,
        letterSpacing: `${layer.tracking ?? -0.01}em`,
        whiteSpace: "pre",
        color: layer.color ?? spec.brand.palette.fg,
      }}
    >
      {chars.map((ch, i) => {
        const age = frame - Math.floor(i * step);
        if (age < 0) return null;
        const r = (k: string) => random(`${layer.seed}:${i}:${k}`);
        const settle = 4 + Math.floor(r("settle") * 16);
        const relapse = r("relapse") < 0.3 ? settle + 6 + Math.floor(r("at") * 16) : -1;
        const flicker = age < settle || (relapse > 0 && age >= relapse && age < relapse + 3);
        const face = flicker ? faces[Math.floor(random(`${layer.seed}:${i}:${Math.floor(age / 2)}`) * faces.length)]! : undefined;
        return (
          <span
            key={i}
            style={{
              fontFamily: face ? face.family : fonts[layer.font],
              fontStyle: face?.style,
              fontWeight: face ? 400 : layer.weight,
              opacity: interpolate(age, [0, 4], [0.35, 1], { extrapolateRight: "clamp" }),
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

const Flash: React.FC<{ layer: Of<"flash"> }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [layer.at, layer.at + 1, layer.at + layer.length], [0, layer.peak, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return opacity > 0 ? <AbsoluteFill style={{ background: layer.color, opacity }} /> : null;
};

const Grain: React.FC<{ layer: Of<"grain"> }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const id = `grain-${layer.seed.replace(/[^a-z0-9]/gi, "")}`;
  const seed = Math.floor(random(`${layer.seed}:${frame}`) * 1000);
  return (
    <AbsoluteFill style={{ opacity: layer.amount, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%">
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
};

// Digital tear: on active frames the content repeats in horizontal bands,
// each shifted sideways, with a red/cyan split.
export const Glitch: React.FC<{ layer: Of<"glitch">; children: React.ReactNode }> = ({ layer, children }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const r = (k: string) => random(`${layer.seed}:${frame}:${k}`);
  if (frame < layer.from) return <>{children}</>;
  if (layer.style === "blocks") return <GlitchBlocks layer={layer} frame={frame} width={width} height={height}>{children}</GlitchBlocks>;
  const active = r("on") < Math.min(1, layer.intensity * 0.7);
  if (!active) return <>{children}</>;
  const bands = Array.from({ length: Math.max(2, Math.round(layer.slices * r("n"))) }, (_, i) => {
    const top = r(`t${i}`) * height;
    const h = (0.01 + r(`h${i}`) * 0.08) * height;
    const dx = (r(`x${i}`) - 0.5) * width * 0.12 * layer.intensity;
    return { top, h, dx };
  });
  return (
    <AbsoluteFill>
      {children}
      {bands.map((b, i) => (
        <AbsoluteFill key={i} style={{ clipPath: `inset(${b.top}px 0 ${Math.max(0, height - b.top - b.h)}px 0)`, transform: `translateX(${b.dx}px)`, filter: i % 2 ? "drop-shadow(6px 0 0 rgba(255,0,60,0.6))" : "drop-shadow(-6px 0 0 rgba(0,220,255,0.6))" }}>
          {children}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

const CODE_LINES = [
  "const field = sample(manifold, { k: 64 })",
  "agent.plan(issue) -> 7 steps",
  "pass 12/12  tests  1.84s",
  "git diff --stat  +214 -38",
  "vec3 n = normalize(cross(du, dv));",
  "agent run --repo acme/web",
  "loss 0.0213  step 4096",
  "for (i = 0; i < N; i++) phi[i] *= decay;",
  "open_pr(branch='fix/render-loop')",
  "θ = atan2(y, x)  r = 0.618",
  "spawn session #212 · cloud mac",
  "checks: lint ✓ types ✓ e2e ✓",
  "mesh.vertices = 18,432",
  "fft(signal, 2048) -> peaks[3]",
  "commit 9f3c2e1  'stabilize solver'",
  "while (!converged) iterate();",
];

// Debugger-style annotations: short monospace lines in dark tinted boxes,
// scattered and reshuffled every few frames.
const CodeOverlay: React.FC<{ layer: Of<"codeOverlay"> }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { fonts } = useEdit();
  const lines = layer.lines.length ? layer.lines : CODE_LINES;
  const tick = Math.floor(frame / layer.every);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: layer.count }, (_, i) => {
        const r = (k: string) => random(`${layer.seed}:${tick}:${i}:${k}`);
        const n = 1 + Math.floor(r("n") * 4);
        const pick = Array.from({ length: n }, (_, j) => lines[Math.floor(random(`${layer.seed}:${tick}:${i}:l${j}`) * lines.length)]!);
        const edge = r("edge") < 0.6;
        const x = edge ? (r("side") < 0.5 ? r("x") * width * 0.18 : width * (0.74 + r("x") * 0.2)) : r("x") * width * 0.85;
        const y = r("y") * height * 0.92;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, fontFamily: fonts.mono, fontSize: 11, lineHeight: "14px", whiteSpace: "pre", color: "#d8f3ee" }}>
            {pick.map((l, j) => (
              <div key={j} style={{ background: "rgba(20,70,72,0.72)", padding: "0 4px", marginBottom: 1, width: "fit-content" }}>
                {l}
              </div>
            ))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Datamosh dissolve: the picture splits into rectangular cells, each shifted
// and tinted, more of them and further apart as the effect builds.
const GlitchBlocks: React.FC<{ layer: Of<"glitch">; frame: number; width: number; height: number; children: React.ReactNode }> = ({ layer, frame, width, height, children }) => {
  const k = layer.ramp ? Math.min(1, (frame - layer.from + 1) / 8) * layer.intensity : layer.intensity;
  const r = (key: string) => random(`${layer.seed}:${frame}:${key}`);
  const cells = Math.round(layer.slices * (0.5 + k * 2.5));
  return (
    <AbsoluteFill>
      {children}
      {Array.from({ length: cells }, (_, i) => {
        const w = (0.05 + r(`w${i}`) * 0.3) * width;
        const h = (0.02 + r(`h${i}`) * 0.12) * height;
        const x = r(`x${i}`) * (width - w);
        const y = r(`y${i}`) * (height - h);
        const dx = (r(`dx${i}`) - 0.5) * width * 0.25 * k;
        const dy = (r(`dy${i}`) - 0.5) * height * 0.06 * k;
        return (
          <AbsoluteFill
            key={i}
            style={{
              clipPath: `inset(${y}px ${width - x - w}px ${height - y - h}px ${x}px)`,
              transform: `translate(${dx}px, ${dy}px)`,
              filter: `saturate(${1.4 + r(`s${i}`)}) contrast(1.2) hue-rotate(${(r(`hr${i}`) - 0.5) * 40}deg)`,
            }}
          >
            {children}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

// A chat input box: the request typing in over `typeFrames`, a row of small
// tool chips, and a send button in the accent color.
const PromptBox: React.FC<{ layer: Of<"prompt"> }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const { spec, fonts } = useEdit();
  const { bg, fg, accent } = spec.brand.palette;
  const end = layer.duration === undefined ? Infinity : layer.from + layer.duration;
  if (frame < layer.from || frame >= end) return null;
  const local = frame - layer.from;
  const shown = layer.typeFrames > 0 ? Math.ceil(interpolate(local, [0, layer.typeFrames], [0, layer.text.length], { extrapolateRight: "clamp" })) : layer.text.length;
  const typing = shown < layer.text.length;
  const appear = interpolate(local, [0, 4], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const dark = layer.tone === "dark";
  const ink = dark ? bg : fg;
  const s = layer.size;
  const chip: React.CSSProperties = { border: `1px solid ${alpha(ink, 0.18)}`, borderRadius: s * 0.5, padding: `${s * 0.2}px ${s * 0.55}px`, fontSize: s * 0.8, color: alpha(ink, 0.75) };
  return (
    <div
      style={{
        position: "absolute",
        left: layer.x,
        top: layer.y,
        width: layer.w,
        transform: `translate(-50%, -50%) translateY(${(1 - appear) * s}px)`,
        opacity: appear,
        background: dark ? alpha(fg, 0.82) : bg,
        border: `1px solid ${alpha(ink, dark ? 0.14 : 0.1)}`,
        borderRadius: s * 0.9,
        boxShadow: `0 ${s * 0.4}px ${s * 2}px ${alpha(fg, dark ? 0.4 : 0.08)}`,
        padding: `${s * 1.1}px ${s * 1.1}px ${s * 0.8}px`,
        fontFamily: fonts.display,
        color: ink,
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: s, lineHeight: 1.45, minHeight: s * 1.45, whiteSpace: "pre-wrap" }}>
        {layer.text.slice(0, shown)}
        {(typing || Math.floor(local / 15) % 2 === 0) && <span style={{ borderLeft: `1.5px solid ${accent}`, marginLeft: 1 }} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: s * 0.45, marginTop: s * 1.2 }}>
        <span style={chip}>+</span>
        {layer.chips.map((c) => (
          <span key={c} style={chip}>
            {c}
          </span>
        ))}
        <span style={{ marginLeft: "auto", width: s * 1.7, height: s * 1.7, borderRadius: s * 0.4, background: accent, color: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: s * 1.1, fontWeight: 700 }}>↑</span>
      </div>
    </div>
  );
};
