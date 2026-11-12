import type React from "react";
import { icons, type LucideIcon } from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";
import type { z } from "zod";
import type { PanelUi } from "../../spec/schema";
import { alpha } from "../lib/color";
import { useEdit } from "../lib/context";
import { BrandMark } from "../lib/mark";

type Ui = z.infer<typeof PanelUi>;

// A Lucide icon by name ("git-pull-request" or "GitPullRequest").
export function glyphOf(name: string): LucideIcon | undefined {
  const pascal = name.replace(/(^|[-_ ])(\w)/g, (_, __, c: string) => c.toUpperCase());
  return (icons as Record<string, LucideIcon>)[pascal];
}

// A product page section drawn in code: brand mark, headline in the display
// font, optional body, and one widget, sized to the panel box. Widgets animate
// in over the first frames the panel is on screen.
export const UiPanel: React.FC<{ ui: Ui; w: number; h: number; local: number }> = ({ ui, w, h, local }) => {
  const { spec, fonts } = useEdit();
  const { bg, fg, muted } = spec.brand.palette;
  const s = Math.min(w, h * 1.6) / 1000;
  const grow = interpolate(local, [0, 4], [0.35, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ width: w, height: h, background: bg, border: `1px solid ${alpha(fg, 0.12)}`, padding: 56 * s, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 28 * s, fontFamily: fonts.display, color: fg, overflow: "hidden" }}>
      <div style={{ alignSelf: "flex-start", display: "flex" }}>
        <BrandMark size={34 * s} />
      </div>
      <div style={{ fontSize: 64 * s, fontWeight: 600, lineHeight: 1.04, letterSpacing: "-0.025em", maxWidth: "92%" }}>{ui.headline}</div>
      {ui.body && <div style={{ fontSize: 24 * s, color: muted, maxWidth: "80%", lineHeight: 1.35 }}>{ui.body}</div>}
      <Widget ui={ui} s={s} grow={grow} />
    </div>
  );
};

const Widget: React.FC<{ ui: Ui; s: number; grow: number }> = ({ ui, s, grow }) => {
  const { spec, fonts } = useEdit();
  const { fg, muted } = spec.brand.palette;
  const line = alpha(fg, 0.14);
  const mono: React.CSSProperties = { fontFamily: fonts.mono, fontSize: 18 * s };
  switch (ui.widget) {
    case "bars": {
      const rows = ui.items.map((it) => {
        const [label, v] = it.split("=");
        return { label: label!, value: Number(v) };
      });
      const max = Math.max(...rows.map((r) => r.value), 1);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 * s, marginTop: 12 * s }}>
          {rows.map((r, i) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 16 * s, ...mono }}>
              <span style={{ width: 160 * s }}>{r.label}</span>
              <div style={{ flex: 1, height: 34 * s, background: alpha(fg, 0.06) }}>
                <div style={{ width: `${(r.value / max) * 100 * grow}%`, height: "100%", background: i === 0 ? fg : alpha(fg, 0.45) }} />
              </div>
              <span style={{ width: 110 * s, textAlign: "right" }}>{r.value}</span>
            </div>
          ))}
        </div>
      );
    }
    case "chips":
    case "toggles":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 * s, marginTop: 8 * s, flexDirection: ui.widget === "toggles" ? "column" : "row" }}>
          {ui.items.map((it, i) => (
            <div key={it} style={{ display: "flex", alignItems: "center", gap: 14 * s, border: `1px solid ${line}`, borderRadius: 999, padding: `${10 * s}px ${22 * s}px`, fontSize: 22 * s, opacity: interpolate(grow, [i / ui.items.length, Math.min(1, (i + 1) / ui.items.length)], [0, 1]) }}>
              {ui.widget === "toggles" && (
                <span style={{ width: 46 * s, height: 26 * s, borderRadius: 99, background: i === 0 ? fg : alpha(fg, 0.15), position: "relative" }}>
                  <span style={{ position: "absolute", top: 3 * s, left: i === 0 ? 23 * s : 3 * s, width: 20 * s, height: 20 * s, borderRadius: 99, background: spec.brand.palette.bg }} />
                </span>
              )}
              {it}
            </div>
          ))}
        </div>
      );
    case "diff": {
      const lines = ui.items.length ? ui.items : ["+ def solve(issue):", "+     plan = agent.plan(issue)", "+     return agent.open_pr(plan)", "- # TODO"];
      return (
        <div style={{ border: `1px solid ${line}`, borderRadius: 10 * s, overflow: "hidden", ...mono }}>
          {lines.map((l, i) => (
            <div key={i} style={{ padding: `${6 * s}px ${16 * s}px`, background: l.startsWith("+") ? "rgba(46,160,67,0.14)" : l.startsWith("-") ? "rgba(218,54,51,0.12)" : "transparent", opacity: grow > i / lines.length ? 1 : 0 }}>
              {l}
            </div>
          ))}
        </div>
      );
    }
    case "grid":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 * s }}>
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} style={{ border: `1px solid ${line}`, borderRadius: 8 * s, padding: 12 * s, ...mono, fontSize: 15 * s, display: "flex", alignItems: "center", gap: 8 * s, opacity: grow > i / 9 ? 1 : 0.15 }}>
              <span style={{ width: 9 * s, height: 9 * s, borderRadius: 9, background: "#2ea043" }} />
              {ui.items[i] ?? `session ${i + 1}`}
            </div>
          ))}
        </div>
      );
    case "timeline":
    case "flow": {
      const steps = ui.items.length ? ui.items : ["Issue", "Reason", "Pull request"];
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 14 * s, marginTop: 10 * s }}>
          {steps.map((st, i) => (
            <div key={st} style={{ display: "flex", alignItems: "center", gap: 14 * s, opacity: grow > i / steps.length ? 1 : 0.15 }}>
              <div style={{ border: `1px solid ${alpha(fg, 0.5)}`, borderRadius: ui.widget === "timeline" ? 99 : 8 * s, padding: `${10 * s}px ${20 * s}px`, ...mono, fontSize: 20 * s }}>{st}</div>
              {i < steps.length - 1 && <span style={{ fontSize: 26 * s, color: muted }}>→</span>}
            </div>
          ))}
        </div>
      );
    }
    case "chart": {
      const pts = Array.from({ length: 12 }, (_, i) => [i / 11, 0.15 + (i / 11) ** 1.6 * 0.75 + Math.sin(i * 1.7) * 0.03] as const);
      const W = 700;
      const H = 220;
      const d = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x * W} ${H - y * H}`).join(" ");
      return (
        <svg width={W * s} height={H * s} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
          <line x1={0} y1={H} x2={W} y2={H} stroke={line} strokeWidth={2} />
          <path d={d} fill="none" stroke={fg} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - grow} />
        </svg>
      );
    }
    case "invite":
      return (
        <div style={{ display: "flex", gap: 12 * s, marginTop: 10 * s }}>
          <div style={{ flex: 1, border: `1px solid ${line}`, borderRadius: 999, padding: `${14 * s}px ${22 * s}px`, color: muted, fontSize: 20 * s }}>{ui.items[0] ?? "teammate@company.com"}</div>
          <div style={{ background: fg, color: spec.brand.palette.bg, borderRadius: 999, padding: `${14 * s}px ${28 * s}px`, fontSize: 20 * s, fontWeight: 600 }}>{ui.items[1] ?? "Invite"}</div>
        </div>
      );
    case "none":
      return null;
  }
};
