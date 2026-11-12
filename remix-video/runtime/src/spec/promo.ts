// Promo: the explainer graphics of an infomercial-style launch film. Kinetic
// two-weight titles, a prompt composer with dropdown chips, rows of labeled
// cards, name badges, a 3D card flip, a tunnel transition and a logo reveal,
// each timed on a 1920x1080 stage with its own camera. Times are scene
// frames; positions are composition pixels.
import { z } from "zod";

const Frame = z.number().int().nonnegative();
const Track = z.array(z.tuple([Frame, z.number()])).min(1);

const Camera = z.object({
  zoom: Track.default([[0, 1]]),
  x: Track.default([[0, 0]]),
  y: Track.default([[0, 0]]),
  rotY: Track.default([[0, 0]]),
});

const Base = {
  from: Frame.default(0),
  to: Frame.optional(),
  fadeIn: Frame.default(6),
  fadeOut: Frame.default(6),
  camera: Camera.optional(),
};

// A card: an image asset, or a small UI drawn in code (title, lines, footer).
// `kind` picks the drawn look: plain lines, a diff ("+"/"-" lines), a chat
// (lines "Name: text"), or an agent terminal.
export const PromoCard = z.object({
  asset: z.string().optional(),
  // Crop of the image in 0..1 (x, y, w, h); default the whole image.
  crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  ui: z
    .object({
      kind: z.enum(["lines", "diff", "chat", "agent", "pr"]).default("lines"),
      title: z.string().default(""),
      lines: z.array(z.string()).default([]),
      footer: z.string().default(""),
    })
    .optional(),
  label: z.string().default(""),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  tilt: z.number().default(0),
  at: Frame.default(0),
  // Frame from which this card wears a highlight ring.
  highlightAt: Frame.optional(),
  highlightOut: Frame.optional(),
  play: z.boolean().default(false),
});
export type PromoCard = z.infer<typeof PromoCard>;

export const PromoElement = z.discriminatedUnion("kind", [
  // Two lines of type: a lighter `small` word run and a heavy `big` one,
  // sliding in with a blur; an ink stroke sweeps under it.
  z.object({
    ...Base,
    kind: z.literal("title"),
    lines: z.array(z.object({ small: z.string().default(""), big: z.string().default("") })).min(1),
    x: z.number().default(960),
    y: z.number().default(540),
    size: z.number().default(110),
    align: z.enum(["left", "center", "right"]).default("center"),
    stroke: z.boolean().default(true),
    // Letters build in one by one over this many frames.
    build: Frame.default(10),
  }),
  // A prompt box: text types in, chips sit under it, a dropdown can open
  // from a chip and pick an option, and a button is pressed.
  z.object({
    ...Base,
    kind: z.literal("composer"),
    box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).default({ x: 360, y: 430, w: 1200, h: 230 }),
    typed: z.string().default(""),
    typeAt: Frame.default(0),
    typeEvery: z.number().positive().default(1.2),
    // Words starting with "@" are drawn as mentions.
    chips: z.array(z.object({ label: z.string(), value: z.string(), options: z.array(z.string()).default([]), openAt: Frame.optional(), pickAt: Frame.optional(), pick: z.string().optional(), closeAt: Frame.optional() })).default([]),
    button: z.string().default(""),
    pressAt: Frame.optional(),
    size: z.number().default(42),
  }),
  // Cards entering one by one, with labels and optional connecting arrows.
  z.object({
    ...Base,
    kind: z.literal("cards"),
    cards: z.array(PromoCard),
    arrows: z.boolean().default(false),
    // How cards arrive: rise from below, or swing in from depth.
    enter: z.enum(["rise", "swing", "pop"]).default("swing"),
  }),
  // Name pills popping in around a point.
  z.object({
    ...Base,
    kind: z.literal("badges"),
    badges: z.array(z.object({ text: z.string(), x: z.number(), y: z.number(), at: Frame.default(0), glyph: z.string().optional() })),
    size: z.number().default(40),
  }),
  // Concentric hexagon outlines rushing toward the camera.
  z.object({ ...Base, kind: z.literal("tunnel"), x: z.number().default(960), y: z.number().default(540), rings: z.number().int().default(9) }),
  // A card that flips in on its Y axis, back (mark) then front (ui).
  z.object({
    ...Base,
    kind: z.literal("flip"),
    card: PromoCard,
    flipAt: Frame.default(0),
    flipFrames: Frame.default(24),
    spin: z.number().default(180),
  }),
  // Mark and wordmark, scaling up with a soft halo.
  z.object({ ...Base, kind: z.literal("logo"), x: z.number().default(960), y: z.number().default(520), size: z.number().default(170), color: z.string().default("bg"), halo: z.string().default("fg/0.45") }),
  // A pointer that travels a path of [frame, x, y] points and clicks.
  z.object({ ...Base, kind: z.literal("cursor"), path: z.array(z.tuple([Frame, z.number(), z.number()])).min(1), clickAt: z.array(Frame).default([]) }),
]);
export type PromoElement = z.infer<typeof PromoElement>;

export const PromoField = z.object({
  // Honeycomb line field drifting under everything.
  grid: z.number().default(0.07),
  // A video or image asset behind the field (footage under a logo reveal).
  backdrop: z.string().optional(),
  backdropStart: Frame.default(0),
  dim: z.number().default(0),
});

export function promoAssets(elements: PromoElement[], field?: z.infer<typeof PromoField>): string[] {
  const ids: (string | undefined)[] = [field?.backdrop];
  for (const e of elements) {
    if (e.kind === "cards") e.cards.forEach((c) => ids.push(c.asset));
    if (e.kind === "flip") ids.push(e.card.asset);
  }
  return [...new Set(ids.filter((x): x is string => !!x))];
}
