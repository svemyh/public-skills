import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import type { Scene } from "../../spec/schema";
import { alpha, paint } from "../lib/color";
import { useEdit } from "../lib/context";
import { glyphOf } from "./UiPanel";

type Of<K extends Scene["kind"]> = Extract<Scene, { kind: K }>;
type Palette = Record<"bg" | "fg" | "accent" | "muted", string>;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function rgb(color: string): [number, number, number] | undefined {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return undefined;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Cards sit one step off the page: lighter than a light page, lighter than a
// dark one too, so they read in either theme.
export function surfaceOf(p: Palette): string {
  const bg = rgb(p.bg);
  if (!bg) return p.bg;
  const light = (bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114) / 255 > 0.5;
  const to = light ? [255, 255, 255] : (rgb(p.fg) ?? [255, 255, 255]);
  const t = light ? 0.85 : 0.07;
  return "#" + bg.map((c, i) => Math.round(lerp(c, to[i]!, t)).toString(16).padStart(2, "0")).join("");
}

// An agent product's task flow drawn in code: a prompt composer fades in, the
// first task's title types in word by word, the composer folds into a task
// row, the row rises, and the other tasks join it. `clock` is the flow's frame
// at the scene start, so one flow can be split into several scenes.
export const TaskFeed: React.FC<{ scene: Of<"taskFeed"> }> = ({ scene }) => {
  const { spec, fonts } = useEdit();
  const pal = spec.brand.palette;
  const t = useCurrentFrame() + scene.clock;
  const ink = scene.look === "ink";
  const card = ink ? pal.fg : scene.look === "outline" ? "transparent" : (scene.surface ? paint(pal, scene.surface) : surfaceOf(pal));
  const text = ink ? pal.bg : pal.fg;
  const sub = ink ? alpha(pal.bg, 0.6) : pal.muted;
  const border = scene.look === "outline" ? `1.5px solid ${alpha(pal.fg, 0.16)}` : undefined;
  const { composer: c, rows: r } = scene;
  const ease = Easing.out(Easing.cubic);

  // Composer in, then the fold into a row and the rise to the top of the list.
  const appear = interpolate(t, [scene.openAt, scene.openAt + 40], [0, 1], { ...clamp, easing: ease });
  const fold = interpolate(t, [scene.submitAt + 6, scene.submitAt + 48], [0, 1], { ...clamp, easing: ease });
  // The rise's curve, measured from the source: a slow start, a fast middle, a long settle.
  const rise = interpolate(t - scene.riseAt, [0, 3, 6, 9, 12, 15, 18, 21, 24, 30, 39], [0.01, 0.04, 0.11, 0.29, 0.56, 0.71, 0.81, 0.87, 0.91, 0.97, 1], clamp);
  const footer = interpolate(t, [scene.submitAt, scene.submitAt + 10], [1, 0], clamp);
  const restY = c.y + c.h / 2 - r.h / 2;
  const box = {
    x: lerp(c.x, r.x, fold),
    y: lerp(lerp(c.y, restY, fold), r.y, rise),
    w: lerp(c.w, r.w, fold),
    h: lerp(c.h, r.h, fold),
  };
  const words = (scene.tasks[0]?.title ?? "").split(" ");
  const typed = words.filter((_, i) => t >= scene.typeAt + i * scene.wordEvery).join(" ");
  const titleSize = lerp(scene.promptSize, scene.titleSize, fold);
  const pop = scene.enter === "pop" ? 0.94 + 0.06 * appear : 1;

  const tasks = scene.tasks.map((task, i) => {
    const join = i === 0 ? 1 : interpolate(t, [scene.joinAt + (i - 1) * 6, scene.joinAt + (i - 1) * 6 + 48], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
    const y = i === 0 ? box.y : r.y + i * (r.h + r.gap);
    const dx = scene.enter === "slide" ? (1 - join) * 220 : 0;
    const dy = scene.enter === "rise" ? (1 - join) * 60 * i : 0;
    const s = scene.enter === "pop" ? 0.9 + 0.1 * join : 1;
    return { task, i, join, y, dx, dy, s };
  });

  return (
    <AbsoluteFill style={{ background: pal.bg, fontFamily: fonts.display }}>
      {scene.layout === "timeline" && rise > 0 && (
        // A rail left of the list: it grows down as tasks join, with a node per task.
        <>
          <div style={{ position: "absolute", left: r.x - 41, top: r.y + r.h / 2, width: 2, height: (scene.tasks.length - 1) * (r.h + r.gap) * (tasks[tasks.length - 1]?.join ?? 0), background: alpha(pal.fg, 0.16) }} />
          {tasks.map(({ task, i, join, y, dy }) => (
            <div key={i} style={{ position: "absolute", left: r.x - 48, top: y + dy + r.h / 2 - 8, width: 16, height: 16, borderRadius: "50%", background: pal.bg, border: `3px solid ${paint(pal, task.tone)}`, boxSizing: "border-box", opacity: i === 0 ? rise : join }} />
          ))}
        </>
      )}
      {tasks.map(({ task, i, join, y, dx, dy, s }) => {
        const first = i === 0;
        const w = first ? box.w : r.w;
        const h = first ? box.h : r.h;
        const x = first ? box.x : r.x;
        const tile = first ? interpolate(t, [scene.submitAt + 18, scene.submitAt + 40], [0, 1], clamp) : 1;
        const meta = first ? interpolate(t, [scene.submitAt + 26, scene.submitAt + 50], [0, 1], clamp) : 1;
        const tone = paint(pal, task.tone);
        const tileSize = r.h * 0.68;
        const titleX = first ? lerp(40, 152, fold) : 148;
        const titleTop = first ? lerp(33, 46, fold) : 46;
        if (first && appear <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x + dx,
              top: y + dy,
              width: w,
              height: h,
              borderRadius: lerp(32, 28, first ? fold : 1),
              background: card,
              border,
              boxSizing: "border-box",
              opacity: first ? appear : join,
              transform: `scale(${first ? pop : s})`,
              overflow: "hidden",
            }}
          >
            {tile > 0 && (
              <div style={{ position: "absolute", left: 24, top: (h - tileSize) / 2, opacity: tile }}>
                <Status kind={scene.status} tone={tone} size={tileSize} t={t} glyph={task.glyph} done={task.done} ink={ink} />
              </div>
            )}
            <div style={{ position: "absolute", left: titleX, top: titleTop, fontSize: first ? titleSize : scene.titleSize, lineHeight: 1, color: text, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
              {first && fold === 0 ? typed : task.title}
            </div>
            {meta > 0 && task.meta && (
              <div style={{ position: "absolute", left: titleX, top: titleTop + scene.titleSize * 1.4, fontSize: scene.titleSize * 0.96, lineHeight: 1, color: sub, opacity: meta, whiteSpace: "pre" }}>
                {task.meta}
              </div>
            )}
            {first && footer > 0 && <ComposerFooter w={w} h={h} opacity={footer} picker={scene.picker} pal={pal} text={text} sub={sub} card={card} />}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const ComposerFooter: React.FC<{ w: number; h: number; opacity: number; picker: string; pal: Palette; text: string; sub: string; card: string }> = ({ w, h, opacity, picker, pal, text, sub, card }) => {
  const Clip = glyphOf("paperclip");
  const Chevron = glyphOf("chevron-down");
  const Enter = glyphOf("corner-down-left");
  const by = h - 89;
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div style={{ position: "absolute", left: 30, top: by, width: 59, height: 59, borderRadius: 16, border: `1.5px solid ${alpha(pal.fg, 0.07)}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Clip && <Clip size={30} color={alpha(text, 0.75)} strokeWidth={1.6} style={{ transform: "rotate(-45deg)" }} />}
      </div>
      {picker && (
        <div style={{ position: "absolute", left: 113, top: by + 29.5, transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 12, fontSize: 30, color: sub }}>
          {picker}
          {Chevron && <Chevron size={18} color={sub} strokeWidth={2} />}
        </div>
      )}
      <div style={{ position: "absolute", left: w - 83, top: by + 3, width: 54, height: 54, borderRadius: 14, background: text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Enter && <Enter size={26} color={card === "transparent" ? pal.bg : card} strokeWidth={2} />}
      </div>
    </div>
  );
};

// A task's status: a tinted tile with a dot, a turning ring, or an icon.
const Status: React.FC<{ kind: "dot" | "ring" | "glyph"; tone: string; size: number; t: number; glyph?: string; done: boolean; ink: boolean }> = ({ kind, tone, size, t, glyph, done, ink }) => {
  const tile: React.CSSProperties = { width: size, height: size, borderRadius: size * 0.16, background: alpha(tone, ink ? 0.22 : 0.085), display: "flex", alignItems: "center", justifyContent: "center", position: "relative" };
  if (kind === "ring") {
    const R = size * 0.2;
    const C = 2 * Math.PI * R;
    return (
      <div style={tile}>
        <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: done ? undefined : `rotate(${t * 6}deg)` }}>
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={alpha(tone, 0.25)} strokeWidth={4} />
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={tone} strokeWidth={4} strokeLinecap="round" strokeDasharray={done ? `${C} 0` : `${C * 0.3} ${C}`} />
        </svg>
      </div>
    );
  }
  if (kind === "glyph") {
    const Icon = glyphOf(glyph ?? (done ? "check" : "loader"));
    return <div style={tile}>{Icon && <Icon size={size * 0.38} color={tone} strokeWidth={2} />}</div>;
  }
  return (
    <div style={tile}>
      <div style={{ width: size * 0.44, height: size * 0.44, borderRadius: "50%", background: alpha(tone, ink ? 0.4 : 0.18), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: size * 0.14, height: size * 0.14, borderRadius: "50%", background: tone }} />
      </div>
    </div>
  );
};
