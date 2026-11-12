import { z } from "zod";

const Color = z.string();
const Frame = z.number().int().nonnegative();

export const Profile = z.object({
  name: z.string(),
  wordmark: z.string(),
  website: z.string(),
  tagline: z.string().default(""),
  mark: z.string(),
  palette: z
    .object({
      bg: Color.default("#000000"),
      fg: Color.default("#FFFFFF"),
      accent: Color.default("#2D74FF"),
      muted: Color.default("#8A8A8A"),
    })
    .prefault({}),
  fonts: z
    .object({
      display: z.string().default("Inter"),
      wordmark: z.string().default("Inter"),
    })
    .prefault({}),
  mosaicColors: z
    .array(Color)
    .default(["#F76B15", "#3E63DD", "#30A46C", "#8E4EC6", "#D6409F", "#12A594", "#FFB224", "#6E6E6E", "#9A9A9A"]),
  mosaicStyle: z.enum(["asset", "bars", "none"]).default("asset"),
  screens: z
    .record(
      z.string(),
      z.object({
        file: z.string(),
        description: z.string().default(""),
        crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
        frameless: z.boolean().optional(),
      }),
    )
    .prefault({}),
  logos: z
    .record(
      z.string(),
      z.object({
        file: z.string(),
        description: z.string().default(""),
        fill: Color.default("#1A1A1A"),
      }),
    )
    .prefault({}),
  cta: z.object({
    big: z.string().default("Free to start."),
    title: z.string(),
    body: z.string().default(""),
    button: z.string(),
  }),
  music: z.string().optional(),
  musicGain: z.number().default(1),
});
export type Profile = z.infer<typeof Profile>;

export const Plan = z.object({
  brand: z.string(),
  fps: z.number().int().default(60),
  open: z.object({ tagline: z.string().optional(), seconds: z.number().default(3.5) }).prefault({}),
  beats: z
    .array(
      z.object({
        id: z.string(),
        headline: z.string(),
        screen: z.string(),
        hexes: z.array(z.string()).default([]),
        hexLayout: z.enum(["auto", "sides", "left", "top"]).default("auto"),
        seconds: z.number().default(3.5),
        push: z.number().default(1.02),
      }),
    )
    .min(1),
  cta: z
    .object({
      big: z.string().optional(),
      bigSeconds: z.number().default(1.5),
      card: z.object({ title: z.string(), body: z.string().default(""), button: z.string() }).optional(),
      headline: z.string().optional(),
      cardSeconds: z.number().default(2.5),
    })
    .prefault({}),
  outro: z.object({ seconds: z.number().default(6.5), text: z.string().optional() }).prefault({}),
  music: z.string().default("profile"),
});
export type Plan = z.infer<typeof Plan>;

export const LaunchScene = z.object({
  id: z.string(),
  name: z.string(),
  from: Frame,
  duration: Frame.min(1),
  headline: z.object({ text: z.string(), size: z.number(), y: z.number(), at: Frame, weight: z.number() }).optional(),
  lockup: z.object({ tagline: z.string(), size: z.number(), y: z.number(), at: Frame }).optional(),
  window: z
    .object({
      src: z.string(),
      isVideo: z.boolean().default(false),
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
      radius: z.number(),
      at: Frame,
      push: z.number(),
      border: z.boolean(),
      fit: z.enum(["cover", "contain"]),
    })
    .optional(),
  bigText: z.object({ text: z.string(), size: z.number(), y: z.number(), at: Frame, weight: z.number() }).optional(),
  card: z.object({ title: z.string(), body: z.string(), button: z.string(), w: z.number(), y: z.number(), at: Frame, clickAt: Frame.optional() }).optional(),
  hexes: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        size: z.number(),
        at: Frame,
        src: z.string().optional(),
        fill: Color,
        bars: z.boolean(),
      }),
    )
    .default([]),
  mosaic: z
    .object({
      mode: z.enum(["in", "out"]),
      at: Frame,
      frames: Frame.min(1),
      colors: z.array(Color),
      markStyle: z.enum(["asset", "bars", "none"]),
      seed: z.string().default("mosaic"),
    })
    .optional(),
  wordmark: z.object({ text: z.string(), size: z.number(), at: Frame, typed: z.boolean(), typeFrames: Frame.min(1) }).optional(),
  fadeOut: Frame.default(0),
});
export type LaunchScene = z.infer<typeof LaunchScene>;

export const CompiledFilm = z.object({
  fps: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  durationInFrames: Frame.min(1),
  brand: z.object({
    name: z.string(),
    wordmark: z.string(),
    markSrc: z.string(),
    palette: z.object({ bg: Color, fg: Color, accent: Color, muted: Color }),
    fonts: z.object({ display: z.string(), wordmark: z.string() }),
  }),
  audio: z.object({ src: z.string(), volume: z.number(), fadeOut: Frame }).optional(),
  scenes: z.array(LaunchScene),
});
export type CompiledFilm = z.infer<typeof CompiledFilm>;
