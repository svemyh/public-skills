import type React from "react";
import { Easing, Img, interpolate, random } from "remotion";
import type { StageWidget as Widget } from "../../spec/schema";
import { alpha } from "../lib/color";
import { mediaUrl, useEdit } from "../lib/context";
import { BrandMark } from "../lib/mark";
import { glyphOf } from "./UiPanel";

// Status colors of the dark developer tools these cards imitate (GitHub,
// PostHog); they are signal colors, not brand colors.
const OK = "#3fb950";
const BAD = "#f85149";
const WARN = "#d29922";
const INFO = "#58a6ff";
const PH = "#f9bd2b";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ramp = (t: number, a: number, frames: number) => interpolate(t, [a, a + Math.max(1, frames)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

const KIND_GLYPH: Record<Widget["kind"], string> = {
  campaign: "package",
  security: "shield-check",
  experiment: "flask-conical",
  pipeline: "rocket",
  slack: "slack",
  fleet: "network",
  darkmode: "moon",
};

// A technical card drawn in code, animated from `lt` = frames since it
// appeared. `w` sets the scale; short tiles drop to the header plus a hero.
export const WidgetCard: React.FC<{ widget: Widget; w: number; h: number; lt: number; pad?: number }> = ({ widget, w, h, lt, pad = 0 }) => {
  const { spec, fonts } = useEdit();
  const logo = (id?: string) => {
    const a = id ? spec.assets.find((x) => x.id === id) : undefined;
    return a ? mediaUrl(a) : undefined;
  };
  const pal = spec.brand.palette;
  const s = w / 206;
  const tiny = h - pad < w * 0.9;
  // Tall tiles (fans, the detail panel) get bigger heroes to fill the card.
  const tall = (h - pad) / s > 300;
  const ink = pal.bg;
  const dim = alpha(ink, 0.55);
  const mono: React.CSSProperties = { fontFamily: fonts.mono, fontSize: 8.4 * s, lineHeight: 1.45, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const Glyph = glyphOf(KIND_GLYPH[widget.kind]);
  const prog = ramp(lt, 4, 46);
  const done = lt >= 46;
  const count = Math.round(widget.count * prog);

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 6 * s }}>
      <div style={{ width: 18 * s, height: 18 * s, borderRadius: 5 * s, background: alpha(ink, 0.1), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {logo(widget.icon) ? <Img src={logo(widget.icon)!} style={{ width: 18 * s, height: 18 * s, borderRadius: 5 * s }} /> : Glyph && <Glyph size={11 * s} color={widget.kind === "experiment" ? PH : ink} strokeWidth={2.2} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 10.5 * s, color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{widget.title}</div>
        <div style={{ ...mono, fontSize: 7.4 * s, color: dim }}>{widget.sub}</div>
      </div>
      <BrandMark size={12 * s} color={alpha(ink, 0.85)} />
    </div>
  );

  const pill = (text: string, color: string, on = 1) => (
    <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4 * s, padding: `${2 * s}px ${7 * s}px`, borderRadius: 10 * s, background: alpha(color, 0.16), border: `${s}px solid ${alpha(color, 0.45)}`, color, fontFamily: fonts.display, fontWeight: 600, fontSize: 8.4 * s, opacity: on, whiteSpace: "nowrap" }}>
      <div style={{ width: 5 * s, height: 5 * s, borderRadius: 3 * s, background: color }} />
      {text}
    </div>
  );

  const big = (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 * s }}>
      <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 30 * s, color: ink, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{count.toLocaleString("en-US")}</div>
      <div style={{ fontFamily: fonts.display, fontSize: 9 * s, color: dim }}>{widget.countLabel}</div>
    </div>
  );

  // Status of row i in a staggered run: 0 queued, 1 running, 2 done.
  const stage = (i: number, n: number) => {
    const a = 4 + (i * 42) / Math.max(1, n);
    return lt < a ? 0 : lt < a + 42 / Math.max(1, n) ? 1 : 2;
  };
  const dot = (st: number) => {
    const c = st === 2 ? OK : st === 1 ? WARN : alpha(ink, 0.25);
    return <div style={{ width: 6 * s, height: 6 * s, borderRadius: 3 * s, flexShrink: 0, background: st === 1 ? "transparent" : c, border: st === 1 ? `${1.4 * s}px solid ${c}` : undefined, boxSizing: "border-box" }} />;
  };

  // Merged / open / queued share of the run, as one segmented bar.
  const merged = prog;
  const open = Math.min(1 - merged, 0.35 * (1 - prog) + 0.05 * (prog < 1 ? 1 : 0));
  const split = (
    <div>
      <div style={{ display: "flex", height: 7 * s, borderRadius: 4 * s, overflow: "hidden", background: alpha(ink, 0.1) }}>
        <div style={{ width: `${merged * 100}%`, background: OK }} />
        <div style={{ width: `${open * 100}%`, background: INFO }} />
      </div>
      <div style={{ display: "flex", gap: 8 * s, marginTop: 4 * s, ...mono, fontSize: 7.2 * s, color: dim }}>
        <span><span style={{ color: OK }}>●</span> merged</span>
        <span><span style={{ color: INFO }}>●</span> open</span>
        <span>● queued</span>
      </div>
    </div>
  );
  // PRs merged per day this week.
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const bars = (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5 * s, height: 64 * s, paddingTop: 4 * s }}>
      {days.map((d, i) => {
        const v = (0.35 + random(`${widget.title}:d:${i}`) * 0.65) * ramp(lt, 6 + i * 4, 14);
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 * s, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ width: "100%", height: `${v * 80}%`, borderRadius: 2 * s, background: alpha(INFO, 0.85) }} />
            <span style={{ ...mono, fontSize: 6.8 * s, color: dim }}>{d}</span>
          </div>
        );
      })}
    </div>
  );
  // Services patched, as a ring that fills from red to green.
  const gauge = (d: number) => {
    const r = 15.9;
    return (
      <svg width={d * s} height={d * s} viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
        <circle cx={18} cy={18} r={r} fill="none" stroke={alpha(BAD, 0.55)} strokeWidth={3.2} />
        <circle cx={18} cy={18} r={r} fill="none" stroke={OK} strokeWidth={3.2} strokeDasharray={`${prog * 100} 100`} pathLength={100} transform="rotate(-90 18 18)" strokeLinecap="round" />
        <text x={18} y={20.5} textAnchor="middle" fontSize={7.5} fontWeight={600} fill={ink} fontFamily={fonts.display}>{Math.round(prog * 100)}%</text>
      </svg>
    );
  };

  let body: React.ReactNode = null;
  switch (widget.kind) {
    case "campaign":
      body = (
        <>
          {big}
          {split}
          {!tiny && tall && bars}
          {!tiny && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2.5 * s }}>
              {widget.rows.map((row, i) => {
                const st = stage(i, widget.rows.length);
                const [name, bump] = row.split(" ", 2).length === 2 ? [row.slice(0, row.indexOf(" ")), row.slice(row.indexOf(" ") + 1)] : [row, ""];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 * s }}>
                    {dot(st)}
                    <span style={{ ...mono, color: ink }}>{name}</span>
                    <span style={{ ...mono, color: st === 2 ? OK : dim, marginLeft: "auto" }}>{bump}</span>
                  </div>
                );
              })}
            </div>
          )}
          {!tiny && <div style={{ marginTop: "auto" }}>{pill(done ? widget.done : "opening PRs…", done ? OK : WARN)}</div>}
        </>
      );
      break;
    case "security":
      body = (
        <>
          {pill(done ? widget.done : "critical · 9.8", done ? OK : BAD)}
          {!tiny && (
            <div style={{ borderRadius: 6 * s, background: alpha("#000", 0.35), padding: `${5 * s}px ${6 * s}px`, display: "flex", flexDirection: "column" }}>
              {widget.rows.map((row, i) => {
                const show = ramp(lt, 2 + i * (44 / widget.rows.length), 3);
                const cmd = row.startsWith("$");
                return (
                  <div key={i} style={{ ...mono, opacity: show, color: cmd ? INFO : row.startsWith("✓") ? OK : row.startsWith("!") ? BAD : alpha(ink, 0.75) }}>
                    {row}
                  </div>
                );
              })}
            </div>
          )}
          {!tiny && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 * s }}>
              {gauge(tall ? 64 : 44)}
              {big}
            </div>
          )}
        </>
      );
      break;
    case "experiment": {
      const W = 178;
      const H = tall ? 140 : 92;
      const n = 24;
      const shown = Math.max(2, Math.round(n * prog));
      const line = (lift: number, seed: string) =>
        Array.from({ length: shown }, (_, i) => {
          const x = (i / (n - 1)) * W;
          const base = 0.3 + 0.1 * Math.sin(i / 3) + (random(`${seed}${i}`) - 0.5) * 0.12;
          const y = H - (base + lift * (i / (n - 1))) * H * 0.8;
          return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(" ");
      const sig = ramp(lt, 40, 6);
      body = (
        <>
          <svg width={W * s} height={H * s} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke={alpha(ink, 0.08)} strokeWidth={0.8} />
            ))}
            <path d={line(0.08, "c")} fill="none" stroke={alpha(ink, 0.45)} strokeWidth={1.6} />
            <path d={line(0.62, "v")} fill="none" stroke={PH} strokeWidth={2} />
          </svg>
          <div style={{ display: "flex", gap: 6 * s }}>
            {[
              ["control", "12.4%", alpha(ink, 0.45)],
              ["variant B", "17.9%", PH],
            ].map(([k, v, c]) => (
              <div key={k} style={{ flex: 1, borderRadius: 6 * s, background: alpha(ink, 0.07), padding: `${4 * s}px ${6 * s}px` }}>
                <div style={{ ...mono, fontSize: 7.4 * s, color: dim, display: "flex", alignItems: "center", gap: 3 * s }}>
                  <span style={{ width: 6 * s, height: 2 * s, background: c, display: "inline-block" }} />
                  {k}
                </div>
                <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 15 * s, color: ink }}>{v}</div>
              </div>
            ))}
          </div>
          {!tiny && (
            <>
              <div style={{ ...mono, color: dim }}>
                {Math.round(48210 * prog).toLocaleString("en-US")} users · p = 0.003
              </div>
              {pill("significant · +44%", OK, sig)}
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 3 * s }}>
                {widget.rows.map((row, i) => (
                  <div key={i} style={{ ...mono, color: alpha(ink, 0.75), opacity: ramp(lt, 42 + i * 4, 4) }}>
                    <span style={{ color: OK }}>✓ </span>
                    {row}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      );
      break;
    }
    case "pipeline":
      body = (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: (tiny ? 2 : tall ? 9 : 4.5) * s }}>
            {widget.rows.slice(0, tiny ? 3 : undefined).map((row, i) => {
              const st = stage(i, widget.rows.length);
              const [name, time] = row.split("|");
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 * s }}>
                  {dot(st)}
                  <span style={{ ...mono, fontSize: 9 * s, color: st ? ink : dim }}>{name}</span>
                  <div style={{ flex: 1, height: 3 * s, borderRadius: 2 * s, background: alpha(ink, 0.08), overflow: "hidden" }}>
                    <div style={{ width: `${st === 2 ? 100 : st === 1 ? 50 : 0}%`, height: "100%", background: st === 2 ? OK : WARN }} />
                  </div>
                  <span style={{ ...mono, fontSize: 7.6 * s, color: dim, width: 26 * s, textAlign: "right" }}>{st === 2 ? time : ""}</span>
                </div>
              );
            })}
          </div>
          {!tiny && big}
          {!tiny && <div style={{ marginTop: "auto" }}>{pill(done ? widget.done : "deploying…", done ? OK : WARN)}</div>}
        </>
      );
      break;
    case "slack":
      body = (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 * s }}>
          {widget.rows.slice(0, tiny ? 1 : undefined).map((row, i) => {
            const [who, text] = [row.slice(0, row.indexOf(":")), row.slice(row.indexOf(":") + 1).trim()];
            const isReason = who === "Reason";
            const a = 2 + i * (40 / widget.rows.length);
            const show = ramp(lt, a, 4);
            const typing = isReason && lt < a;
            const seen = isReason && lt >= a - 10;
            if (show <= 0 && !(typing && seen)) return null;
            return (
              <div key={i} style={{ display: "flex", gap: 6 * s, opacity: typing ? 1 : show }}>
                {logo(widget.avatars[who]) ? (
                  <Img src={logo(widget.avatars[who])!} style={{ width: 18 * s, height: 18 * s, borderRadius: 5 * s, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 18 * s, height: 18 * s, borderRadius: 5 * s, flexShrink: 0, background: isReason ? ink : alpha(ink, 0.2), display: "flex", alignItems: "center", justifyContent: "center", color: pal.fg, fontFamily: fonts.display, fontWeight: 700, fontSize: 9 * s }}>
                    {isReason ? <BrandMark size={11 * s} color={pal.fg} /> : who[0]}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 8.6 * s, color: ink }}>
                    {who} {(isReason || widget.avatars[who]) && <span style={{ fontWeight: 600, fontSize: 6.4 * s, padding: `0 ${3 * s}px`, borderRadius: 2 * s, background: alpha(ink, 0.15), color: dim }}>APP</span>}
                  </div>
                  <div style={{ fontFamily: fonts.display, fontSize: 8.8 * s, lineHeight: 1.3, color: alpha(ink, 0.85) }}>{typing ? "···" : text}</div>
                </div>
              </div>
            );
          })}
          {!tiny && widget.done && <div style={{ marginTop: 2 * s }}>{pill(widget.done, OK, ramp(lt, 44, 5))}</div>}
        </div>
      );
      break;
    case "fleet": {
      const cols = 9;
      const rows = tiny ? 2 : tall ? 10 : 8;
      body = (
        <>
          {big}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${16 * s}px)`, gap: 3 * s, marginLeft: 2 * s }}>
            {Array.from({ length: cols * rows }, (_, i) => {
              const on = random(`${widget.title}:f:${i}`) < prog * 1.05;
              const busy = on && random(`${widget.title}:f:${i}:${Math.floor(lt / 6)}`) < 0.18;
              return <BrandMark key={i} size={16 * s} color={on ? (busy ? WARN : alpha(ink, 0.92)) : alpha(ink, 0.13)} />;
            })}
          </div>
          {!tiny && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 * s }}>
              {widget.rows.map((row, i) => (
                <div key={i} style={{ ...mono, color: alpha(ink, 0.75), opacity: ramp(lt, 6 + i * 8, 4) }}>
                  <span style={{ color: OK }}>↳ </span>
                  {row}
                </div>
              ))}
            </div>
          )}
        </>
      );
      break;
    }
    case "darkmode": {
      const flip = ramp(lt, 16, 14);
      const bgc = `color-mix(in srgb, #0d1117 ${flip * 100}%, #f6f8fa)`;
      const fgc = `color-mix(in srgb, #e6edf3 ${flip * 100}%, #1f2328)`;
      const card = `color-mix(in srgb, #161b22 ${flip * 100}%, #ffffff)`;
      body = (
        <>
          <div style={{ borderRadius: 8 * s, background: bgc, padding: 7 * s, display: "flex", flexDirection: "column", gap: 5 * s, border: `${s}px solid ${alpha(ink, 0.15)}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 9 * s, color: fgc }}>Appearance</span>
              <div style={{ width: 22 * s, height: 12 * s, borderRadius: 6 * s, background: flip > 0.5 ? OK : alpha("#000", 0.2), position: "relative" }}>
                <div style={{ position: "absolute", top: 1.5 * s, left: (1.5 + flip * 10) * s, width: 9 * s, height: 9 * s, borderRadius: 5 * s, background: "#fff" }} />
              </div>
            </div>
            {Array.from({ length: tiny ? 1 : 4 }, (_, i) => (
              <div key={i} style={{ borderRadius: 5 * s, background: card, padding: 5 * s, display: "flex", gap: 5 * s, alignItems: "center" }}>
                <div style={{ width: 12 * s, height: 12 * s, borderRadius: 3 * s, background: [INFO, OK, PH, BAD][i] }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 3 * s, width: `${70 - i * 9}%`, borderRadius: 2, background: alpha("#8b949e", 0.8) }} />
                  <div style={{ height: 3 * s, width: `${45 + i * 7}%`, borderRadius: 2, marginTop: 2.5 * s, background: alpha("#8b949e", 0.4) }} />
                </div>
              </div>
            ))}
          </div>
          {!tiny && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 * s }}>
              {widget.rows.map((row, i) => (
                <div key={i} style={{ ...mono, color: alpha(ink, 0.75), opacity: ramp(lt, 24 + i * 6, 4) }}>
                  <span style={{ color: OK }}>✓ </span>
                  {row}
                </div>
              ))}
            </div>
          )}
          {!tiny && widget.done && <div style={{ marginTop: "auto" }}>{pill(widget.done, OK, ramp(lt, 44, 5))}</div>}
        </>
      );
      break;
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(165deg, ${alpha(pal.fg, 0.9)}, ${pal.fg})`, padding: 12 * s, paddingTop: 12 * s + pad, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8 * s, overflow: "hidden" }}>
      {header}
      {body}
    </div>
  );
};
