// The edit spec is the single source of truth for a video: the clone workflow
// writes it, the vary and rebrand workflows rewrite it, and Remotion renders it.
// All times are integer frames at `meta.fps`. Asset `src` paths are relative to
// the project directory, which is the Remotion public dir at render time.
import { z } from "zod";
import { PromoElement, PromoField, promoAssets } from "./promo";

const Frame = z.number().int().nonnegative();
// A CSS color, or a palette token ("bg", "fg", "accent", "muted") that follows
// the brand through rebrands.
const Color = z.string();

export const Rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

// Keyframes as [frame, value] pairs, frames ascending.
const Track = z.array(z.tuple([Frame, z.number()])).min(1);

export const Generation = z.object({
  endpoint: z.string(),
  prompt: z.string().optional(),
  requestId: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});

export const Asset = z.object({
  id: z.string(),
  type: z.enum(["image", "video"]),
  src: z.string(),
  // source: cut from the original; source-crop: still cropped from a source frame;
  // fal: generated; stock: licensed stock (Pexels); user: supplied by a
  // person; brand: from a brand kit.
  origin: z.enum(["source", "source-crop", "fal", "stock", "user", "brand"]),
  // What the shot shows, written during cloning. Variation prompts start here.
  description: z.string().default(""),
  // Free-form roles used by vary/rebrand selectors, e.g. "montage", "brand:photo".
  tags: z.array(z.string()).default([]),
  // Layer keys already burned into these pixels. The renderer skips layers and
  // overlays whose `key` is listed, so a source cut never gets double captions,
  // while a clean replacement gets every layer drawn in code.
  baked: z.array(z.string()).default([]),
  source: z.object({ start: Frame, end: Frame, crop: Rect.optional() }).optional(),
  generation: Generation.optional(),
  // Offset into the media in frames, and speed, when the scene plays it.
  trimBefore: Frame.default(0),
  playbackRate: z.number().positive().default(1),
});
export type Asset = z.infer<typeof Asset>;

// ---- Layers: code-drawn effects and overlays stacked on a scene ----------

const LayerBase = { key: z.string().optional() };

export const Layer = z.discriminatedUnion("kind", [
  z.object({
    ...LayerBase,
    kind: z.literal("grade"),
    invert: z.boolean().default(false),
    grayscale: z.number().min(0).max(1).default(0),
    contrast: z.number().default(1),
    brightness: z.number().default(1),
    blur: z.number().default(0),
  }),
  z.object({ ...LayerBase, kind: z.literal("letterbox"), ratio: z.number().default(2.76), color: Color.optional() }),
  z.object({
    ...LayerBase,
    kind: z.literal("trackingBoxes"),
    seed: z.string().default("boxes"),
    count: z.number().int().default(5),
    color: Color.optional(),
    // Optional fixed boxes in 0..1 coordinates; otherwise seeded random ones.
    boxes: z.array(Rect).optional(),
  }),
  z.object({
    ...LayerBase,
    kind: z.literal("text"),
    text: z.string(),
    x: z.number(),
    y: z.number(),
    size: z.number().default(36),
    align: z.enum(["left", "center", "right"]).default("left"),
    font: z.enum(["display", "mono", "wordmark"]).default("display"),
    color: Color.optional(),
    weight: z.number().default(400),
    mirror: z.boolean().default(false),
    glow: z.number().default(0),
    // A soft dark halo, in pixels, so light type reads over bright footage.
    shadow: z.number().default(0),
    // "difference" keeps type readable over footage of any brightness.
    blend: z.enum(["normal", "difference"]).default("normal"),
    // Letter spacing in em; unset keeps the font's default (-0.01em for display).
    tracking: z.number().optional(),
    from: Frame.default(0),
    duration: Frame.optional(),
    // Character-by-character typing over this many frames (0 = cut on).
    typeFrames: Frame.default(0),
    // How the words arrive: cut on, rise from below, focus in from a blur,
    // or letters closing in from wide tracking. Runs over the first 6 frames.
    // morph: letters appear left to right over `typeFrames`, each fading up
    // from grey and flickering through serif and italic faces before it
    // settles, like the type is being set by hand.
    enter: z.enum(["cut", "rise", "blur", "track", "morph"]).default("cut"),
    seed: z.string().default("text"),
    // Pixels it travels vertically over its time on screen, easing in (a camera tilt).
    driftY: z.number().default(0),
    // A rounded box behind the type: a label chip, an input field, a button.
    // With empty text it is a plain box of at least minWidth x minHeight.
    plate: z
      .object({
        color: Color.default("bg"),
        border: Color.optional(),
        radius: z.number().default(12),
        padX: z.number().default(24),
        padY: z.number().default(12),
        minWidth: z.number().default(0),
        minHeight: z.number().default(0),
      })
      .optional(),
  }),
  z.object({ ...LayerBase, kind: z.literal("flash"), color: Color.default("#fff"), at: Frame.default(0), length: Frame.default(4), peak: z.number().default(0.8) }),
  z.object({
    ...LayerBase,
    kind: z.literal("glitch"),
    seed: z.string().default("glitch"),
    intensity: z.number().default(1),
    slices: z.number().int().default(12),
    // bands: horizontal tears with an RGB split; blocks: the picture breaks
    // into shifted rectangular cells, a datamosh dissolve.
    style: z.enum(["bands", "blocks"]).default("bands"),
    // Scene frame where it starts; intensity ramps up from here when `ramp`.
    from: Frame.default(0),
    ramp: z.boolean().default(false),
  }),
  z.object({ ...LayerBase, kind: z.literal("vignette"), strength: z.number().default(0.6) }),
  // A mark built from pixels: each stage is a grid of filled cells (from
  // the mark's silhouette, coarse to fine), shown in turn, then the image
  // itself cross-fades in. Coarse stages can carry code glyphs, like tiles.
  z.object({
    ...LayerBase,
    kind: z.literal("pixelMark"),
    asset: z.string(),
    // Centre and size of the mark's box in composition pixels.
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    from: Frame.default(0),
    stages: z.array(z.object({ cols: z.number().int(), rows: z.number().int(), cells: z.array(z.tuple([z.number().int(), z.number().int()])), frames: Frame, glyphs: z.boolean().default(false) })),
    // Frames the image takes to cross-fade in after the last stage.
    crisp: Frame.default(4),
    color: Color.default("#141210"),
    seed: z.string().default("pixels"),
  }),
  // Small monospace annotations in tinted boxes scattered over the frame,
  // reshuffled every `every` frames, like a debugger reading the picture.
  z.object({ ...LayerBase, kind: z.literal("codeOverlay"), seed: z.string().default("code"), count: z.number().int().default(8), every: z.number().int().min(1).default(2), lines: z.array(z.string()).default([]) }),
  z.object({ ...LayerBase, kind: z.literal("grain"), amount: z.number().default(0.08), seed: z.string().default("grain") }),
  // A chat input box drawn in code, centered on x/y: the request typing in,
  // small tool chips and a send button in the accent color.
  z.object({
    ...LayerBase,
    kind: z.literal("prompt"),
    text: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number().default(420),
    size: z.number().default(14),
    tone: z.enum(["light", "dark"]).default("light"),
    chips: z.array(z.string()).default([]),
    from: Frame.default(0),
    duration: Frame.optional(),
    typeFrames: Frame.default(0),
  }),
  // A curved horizon: everything above an arc is sky in `color`, so the
  // picture below reads as the edge of a planet. `y` is the arc's apex at
  // `x` (default the center), `sag` how far it falls by the frame edges,
  // `tilt` degrees, `rim` a glowing edge line, `rise` pixels it climbs over
  // the scene.
  z.object({
    ...LayerBase,
    kind: z.literal("horizon"),
    y: z.number(),
    sag: z.number().positive().default(120),
    x: z.number().optional(),
    tilt: z.number().default(0),
    color: Color.default("bg"),
    rim: Color.optional(),
    rimWidth: z.number().default(0),
    glow: z.number().default(0),
    rise: z.number().default(0),
  }),
  // The brand mark as a solid shape, centered on x/y, arriving like text.
  z.object({
    ...LayerBase,
    kind: z.literal("mark"),
    x: z.number(),
    y: z.number(),
    size: z.number().default(80),
    color: Color.optional(),
    from: Frame.default(0),
    duration: Frame.optional(),
    enter: z.enum(["cut", "rise", "blur", "track"]).default("cut"),
    // Pixels it travels vertically over its time on screen, easing in (a camera tilt).
    driftY: z.number().default(0),
  }),
]);
export type Layer = z.infer<typeof Layer>;

// ---- Scenes ---------------------------------------------------------------

// The brand mark cut out of a run of images: each fill shows for `every`
// frames inside the mark's shape. The mark spins in, and from `shrinkAt`
// shrinks to `shrinkTo` and turns solid `tint`.
export const MarkFillSpec = z.object({
  fills: z.array(z.string()).default([]),
  every: Frame.min(1).default(5),
  size: z.number().default(260),
  // Center in 0..1 of the box it is drawn in.
  x: z.number().default(0.5),
  y: z.number().default(0.5),
  spinFrom: z.number().default(-90),
  spinFrames: Frame.default(14),
  shrinkAt: Frame.optional(),
  shrinkTo: z.number().default(40),
  tint: Color.default("fg"),
});

const SceneBase = {
  id: z.string(),
  from: Frame,
  duration: Frame.min(1),
  layers: z.array(Layer).default([]),
  note: z.string().optional(),
};

// A product panel drawn in code instead of shown as an image: real type in
// the brand fonts, plus one simple widget.
export const PanelUi = z.object({
  headline: z.string(),
  body: z.string().optional(),
  widget: z.enum(["diff", "bars", "chips", "toggles", "grid", "timeline", "chart", "invite", "flow", "none"]).default("none"),
  // Widget content: chip/toggle/bar labels, bar values as "Label=73.0".
  items: z.array(z.string()).default([]),
});

const Card = z.object({
  // An image, or `ui` for a panel drawn in code.
  asset: z.string().optional(),
  ui: PanelUi.optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number().optional(),
  // Width / height of the image; when set, layouts size the card to it so a
  // screenshot is never cropped.
  aspect: z.number().positive().optional(),
  z: z.number().default(0),
  enterAt: Frame.default(0),
  headline: z.string().optional(),
  body: z.string().optional(),
});

// ---- Stage: product-UI launch films ---------------------------------------
// Stage coordinates are composition pixels; element times are scene frames.

// Blurred blobs of `color` drifting slowly on the page.
// `marks` scatters that many tiny brand marks drifting upward over the page.
const StageField = z.object({ color: Color.default("accent"), strength: z.number().default(0.35), seed: z.string().default("field"), marks: z.number().int().default(0) });

// What the camera frames: `x`/`y` is the stage point at the frame center,
// `tiltX`/`tiltY` turn the stage in degrees (perspective).
const StageCamera = z.object({
  zoom: Track.default([[0, 1]]),
  x: Track.default([[0, 960]]),
  y: Track.default([[0, 540]]),
  tiltX: Track.default([[0, 0]]),
  tiltY: Track.default([[0, 0]]),
});

// A thumbnail: an image, or a pull-request card drawn in code (title, diff
// lines starting "+"/"-", and a footer such as "8 checks passed").
// A technical card drawn in code (a dependency campaign, a CVE fix, an A/B
// test, a deploy, a Slack thread, a fleet of Reasons, a dark-mode flip).
export const StageWidget = z.object({
  kind: z.enum(["campaign", "security", "experiment", "pipeline", "slack", "fleet", "darkmode"]),
  title: z.string().default(""),
  sub: z.string().default(""),
  // campaign: "package from → to"; pipeline: "stage|time"; slack: "Name: text"; others: log lines.
  rows: z.array(z.string()).default([]),
  // The number the card counts up to, and its label.
  count: z.number().default(0),
  countLabel: z.string().default(""),
  // The end-state label, shown once the run finishes.
  done: z.string().default(""),
  // Image asset for the header icon (a real app logo), and per-name avatar assets (slack).
  icon: z.string().optional(),
  avatars: z.record(z.string(), z.string()).default({}),
});
export type StageWidget = z.infer<typeof StageWidget>;
export type StageWidgetInput = z.input<typeof StageWidget>;

export const StageTile = z.object({
  asset: z.string().optional(),
  widget: StageWidget.optional(),
  title: z.string().default(""),
  lines: z.array(z.string()).default([]),
  meta: z.string().default(""),
  // The small label beside the mark; defaults to "pull request" when there is a footer.
  kicker: z.string().optional(),
  // A small brand-mark chip in the image's corner.
  badge: z.boolean().default(false),
});

const ElementBase = {
  from: Frame.default(0),
  to: Frame.optional(),
  // Frames to fade (with a blur) in at `from` and out before `to`.
  fadeIn: Frame.default(8),
  fadeOut: Frame.default(8),
  camera: StageCamera.optional(),
};

// An icon reference: an image asset, a Lucide glyph, or the brand mark.
const StageIcon = z.object({ asset: z.string().optional(), glyph: z.string().optional(), bg: Color.optional(), ink: Color.optional() });

export const StageElement = z.discriminatedUnion("kind", [
  // App icon tile pops in at the center, slides left, and the line slides out from under it.
  z.object({
    ...ElementBase,
    kind: z.literal("introLine"),
    icon: StageIcon.default({}),
    text: z.string(),
    tile: z.number().default(195),
    x: z.number().default(232),
    y: z.number().default(540),
    textX: z.number().default(372),
    size: z.number().default(92),
    slideAt: Frame.default(40),
    slideFrames: Frame.default(26),
  }),
  // A headline over a prompt box: text types in, the send button is pressed.
  z.object({
    ...ElementBase,
    kind: z.literal("composer"),
    headline: z.string().default(""),
    headlineY: z.number().default(290),
    headlineSize: z.number().default(68),
    headlineOutAt: Frame.optional(),
    box: Rect.default({ x: 510, y: 460, w: 900, h: 250 }),
    placeholder: z.string().default(""),
    typed: z.string().default(""),
    typeAt: Frame.default(0),
    typeEvery: z.number().positive().default(4),
    hint: z.string().default(""),
    hintGlyph: z.string().default("globe"),
    pressAt: Frame.optional(),
    // Draw the sparkles above the box as brand marks.
    markSparkles: z.boolean().default(false),
    // The send button and the glow behind the box.
    button: Color.default("accent"),
    glow: Color.default("accent"),
  }),
  // "<mark> Brand is... <phrase>": phrases blur in and out, each with a prop
  // (an icon tile, a fan of tiles, a stack of chips, or a glyph).
  z.object({
    ...ElementBase,
    kind: z.literal("status"),
    mark: StageIcon.default({}),
    markSize: z.number().default(60),
    prefix: z.string(),
    x: z.number().default(440),
    textX: z.number().default(565),
    y: z.number().default(540),
    size: z.number().default(66),
    // Pixels the line drops while it fades out at the end.
    exitDrop: z.number().default(0),
    phrases: z.array(
      z.object({
        text: z.string(),
        at: Frame,
        out: Frame,
        prop: z
          .object({
            kind: z.enum(["icon", "tiles", "chips", "glyph"]),
            at: Frame.optional(),
            icon: StageIcon.optional(),
            tiles: z.array(StageTile).default([]),
            chips: z.array(z.string()).default([]),
            x: z.number().optional(),
            y: z.number().optional(),
          })
          .optional(),
      }),
    ),
  }),
  // A content calendar panel. week: seven day cells that expand and fill
  // with tiles, a toggle switched on at `toggleAt`; month: tiles with date
  // numbers, rows added from `rowsAt`.
  z.object({
    ...ElementBase,
    kind: z.literal("calendar"),
    layout: z.enum(["week", "month"]).default("week"),
    title: z.string(),
    toggle: z.string().default(""),
    toggleAt: Frame.optional(),
    weekdays: z.array(z.string()).default(["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]),
    tiles: z.array(StageTile).default([]),
    // Glyphs over each week cell's tile (channels).
    icons: z.array(StageIcon).default([]),
    cellsAt: Frame.default(0),
    expandAt: Frame.optional(),
    fillAt: Frame.optional(),
    fillEvery: Frame.default(3),
    rows: z.number().int().default(5),
    rowsAt: Frame.optional(),
    rowEvery: Frame.default(4),
    highlight: Color.default("accent"),
    ok: Color.default("#38c766"),
  }),
  // One item's detail card: a date arc on top, media on the left, three
  // labeled boxes on the right; `posts` switch over time and the arc rolls.
  z.object({
    ...ElementBase,
    kind: z.literal("detail"),
    box: Rect.default({ x: 440, y: 90, w: 1040, h: 898 }),
    dates: z.array(z.string()),
    weekdays: z.array(z.string()),
    labels: z.tuple([z.string(), z.string(), z.string()]).default(["caption", "song", "scheduled to post"]),
    posts: z.array(
      z.object({
        at: Frame,
        date: z.number().int(),
        badge: z.string().default(""),
        media: z.array(z.object({ at: Frame.default(0), tile: StageTile })).min(1),
        // Media height (a carousel is shorter than a 9:16 video), centered in the column.
        mediaH: z.number().default(660),
        text: z.string(),
        tags: z.string().default(""),
        art: StageTile.optional(),
        // The art's width at 144 px tall (a 16:9 video still is 256).
        artW: z.number().default(144),
        icons: z.array(StageIcon).default([]),
        time: z.string().default(""),
      }),
    ),
    backdrop: z.array(StageTile).default([]),
    highlight: Color.default("accent"),
    ok: Color.default("#38c766"),
  }),
  // A year of month cards; dots mark scheduled days from `dotsFrom` (month index).
  z.object({
    ...ElementBase,
    kind: z.literal("yearGrid"),
    title: z.string(),
    year: z.number().int(),
    highlight: z.number().int().default(-1),
    dotsFrom: z.number().int().default(12),
    dotsAt: Frame.default(0),
    dotsEvery: Frame.default(4),
    color: Color.default("accent"),
  }),
  // Contribution heatmaps under captions (`**bold**` spans), sweeping in column by column.
  z.object({
    ...ElementBase,
    kind: z.literal("heatmap"),
    logo: StageIcon.optional(),
    logoAt: Frame.default(0),
    rows: z.array(z.object({ text: z.string(), y: z.number(), color: Color, at: Frame, sweep: Frame.default(32), density: z.number().default(0.6), empty: z.number().optional(), seed: z.string().default("heat") })),
  }),
  // A number counting up, then sliding left and shrinking (`moveAt`).
  z.object({
    ...ElementBase,
    kind: z.literal("counter"),
    start: z.number().default(1),
    end: z.number().default(100),
    suffix: z.string().default("x"),
    countAt: Frame.default(0),
    countFrames: Frame.default(72),
    size: z.number().default(305),
    sub: z.string().default(""),
    subAt: Frame.default(0),
    moveAt: Frame.optional(),
    moveTo: z.object({ x: z.number(), y: z.number(), scale: z.number() }).default({ x: 430, y: 520, scale: 0.73 }),
  }),
  // A phone sliding in with a lock screen whose notifications drop in.
  // Night-shift elements. A sky whose gradient follows keyframed colors, with
  // twinkling stars and a moon.
  z.object({
    ...ElementBase,
    kind: z.literal("sky"),
    top: z.array(z.tuple([Frame, Color])).min(1),
    bottom: z.array(z.tuple([Frame, Color])).min(1),
    stars: z.number().int().default(0),
    starsIn: z.array(z.tuple([Frame, z.number()])).default([[0, 1]]),
    moon: z.object({ x: z.number(), y: z.number(), size: z.number().default(90), color: Color.default("#f4efe1") }).optional(),
    seed: z.string().default("sky"),
  }),
  // A digital clock whose minutes run along keyframes (minutes since midnight).
  z.object({
    ...ElementBase,
    kind: z.literal("clock"),
    times: z.array(z.tuple([Frame, z.number()])).min(1),
    x: z.number().default(120),
    y: z.number().default(110),
    size: z.number().default(46),
    label: z.string().default(""),
    color: Color.default("bg"),
  }),
  // A laptop on a desk whose lid closes at `closeAt`; then the mark on the lid lights.
  z.object({
    ...ElementBase,
    kind: z.literal("laptop"),
    x: z.number().default(960),
    y: z.number().default(640),
    w: z.number().default(720),
    closeAt: Frame.default(90),
    closeFrames: Frame.default(26),
    markAt: Frame.default(130),
    screen: z.string().default(""),
    glow: Color.default("#ffd27a"),
  }),
  // A night skyline; `count` windows light up one by one from `litAt`, with
  // labels rising off some of them.
  z.object({
    ...ElementBase,
    kind: z.literal("skyline"),
    seed: z.string().default("city"),
    litAt: Frame.default(20),
    litFrames: Frame.default(200),
    count: z.number().int().default(400),
    light: Color.default("#ffcf73"),
    tags: z.array(z.string()).default([]),
    total: z.string().default(""),
    pan: z.number().default(160),
  }),
  // A wall of services with glowing red cracks that seal from `sealAt`.
  z.object({
    ...ElementBase,
    kind: z.literal("cracks"),
    seed: z.string().default("wall"),
    labels: z.array(z.string()).default([]),
    cracked: z.number().int().default(12),
    crackAt: Frame.default(10),
    sealAt: Frame.default(110),
    sealFrames: Frame.default(120),
    bad: Color.default("#ff4d3d"),
    seal: Color.default("#ffcf73"),
    total: z.string().default(""),
  }),
  // A stream of users forking into two experiment lanes; from `shipAt` every
  // user takes lane B.
  z.object({
    ...ElementBase,
    kind: z.literal("flow"),
    seed: z.string().default("flow"),
    lanes: z.tuple([z.string(), z.string()]).default(["Control", "Variant B"]),
    rates: z.tuple([z.number(), z.number()]).default([0.124, 0.179]),
    shipAt: Frame.default(200),
    shipped: z.string().default(""),
    icon: z.string().optional(),
    dot: Color.default("#e8e6df"),
    win: Color.default("#ffcf73"),
  }),
  z.object({
    ...ElementBase,
    kind: z.literal("phone"),
    x: z.number().default(1452),
    y: z.number().default(541),
    w: z.number().default(520),
    enterAt: Frame.default(0),
    turn: z.number().default(-8),
    wallpaper: z.string().optional(),
    time: z.string().default("9:41"),
    date: z.string().default(""),
    notes: z.array(z.object({ at: Frame, app: z.string(), body: z.string(), ago: z.string().default("now"), icon: StageIcon.default({}) })).default([]),
    tint: Color.default("#ffffff"),
    // Tip the phone back (degrees), as if lying on a nightstand, and light the room as notes arrive.
    tilt: z.number().default(0),
    glow: Color.optional(),
  }),
  z.object({
    ...ElementBase,
    kind: z.literal("cursor"),
    path: z.array(z.tuple([Frame, z.number(), z.number()])).min(1),
    clicks: z.array(Frame).default([]),
    size: z.number().default(64),
  }),
  z.object({
    ...ElementBase,
    kind: z.literal("text"),
    text: z.string(),
    x: z.number().default(960),
    y: z.number().default(540),
    size: z.number().default(56),
    weight: z.number().default(500),
    color: Color.default("fg"),
  }),
]);

export const Scene = z.discriminatedUnion("kind", [
  z.object({ ...SceneBase, kind: z.literal("solid"), color: Color.optional() }),
  // A pixel transition: square cells in a ramp of brand colors sweep across
  // the frame, covering `fromColor` and revealing `toColor` (the field
  // switches at `cutAt`, 0..1 of the scene). Empty `colors` derives the ramp
  // from the accent (lighter toward bg, darker toward fg).
  z.object({
    ...SceneBase,
    kind: z.literal("pixelWipe"),
    style: z.enum(["burst", "stripes", "steps", "streak"]).default("burst"),
    colors: z.array(Color).default([]),
    fromColor: Color.default("bg"),
    toColor: Color.default("bg"),
    cutAt: z.number().min(0).max(1).default(0.5),
    cell: z.number().default(64),
    seed: z.string().default("pixels"),
  }),
  // Full frame: the mark filled with imagery on a plain field. `asset`, when
  // set, is a verbatim source cut that stands in for the whole drawing.
  z.object({ ...SceneBase, kind: z.literal("markFill"), asset: z.string().optional(), color: Color.optional(), mark: MarkFillSpec }),
  // Footage behind a laptop drawn in code whose screen plays app screenshots
  // (each pushing in slowly from `at`) or the filled mark. When the
  // background bakes "*" (a verbatim cut) only the footage shows.
  z.object({
    ...SceneBase,
    kind: z.literal("laptop"),
    asset: z.string(),
    // Depth of field and exposure on the footage.
    blur: z.number().default(0),
    dim: z.number().min(0).max(1).default(0),
    // The screen's center in 0..1 of the frame, its width in 0..1 of the
    // frame width, and the lid's turn in degrees (negative faces left).
    device: z
      .object({ x: z.number().default(0.68), y: z.number().default(0.56), w: z.number().default(0.6), turn: z.number().default(-14), tone: z.enum(["silver", "graphite"]).default("silver") })
      .default({ x: 0.68, y: 0.56, w: 0.6, turn: -14, tone: "silver" }),
    // Each shot fills the screen width and pushes in by `push` from the top.
    shots: z.array(z.object({ asset: z.string(), at: Frame.default(0), push: z.number().default(0.06) })).default([]),
    mark: MarkFillSpec.optional(),
    // Scene frame where the screen goes dark (before a mark appears on it).
    darkAt: Frame.optional(),
    screenColor: Color.default("#0b0b0c"),
    // A tabletop the laptop stands on, in this color, lit by the screen.
    surface: Color.optional(),
    // Mirror the footage, to bring a subject out from behind the laptop.
    flip: z.boolean().default(false),
    // Darkens the lower left so captions read over bright footage (0..1).
    scrim: z.number().min(0).max(1).default(0),
    zoomFrom: z.number().default(1),
    zoomTo: z.number().default(1.04),
    // Whole-frame drift in pixels over the scene, like a slow dolly.
    driftX: z.number().default(0),
  }),
  z.object({
    ...SceneBase,
    kind: z.literal("media"),
    asset: z.string(),
    // Frames into the asset where this scene starts (videos), so one clip can
    // run on across several scenes.
    trimBefore: Frame.default(0),
    fit: z.enum(["cover", "contain"]).default("cover"),
    zoomFrom: z.number().default(1),
    zoomTo: z.number().default(1),
    panX: z.number().default(0),
    panY: z.number().default(0),
  }),
  z.object({ ...SceneBase, kind: z.literal("logoFlash"), streakAt: Frame.default(4), size: z.number().default(70),
    // streak: light streak and lens ghosts; iris: an aperture of rings opens on the mark.
    style: z.enum(["streak", "iris"]).default("streak") }),
  z.object({
    ...SceneBase,
    kind: z.literal("panelCollage"),
    background: z.string().optional(),
    panels: z.array(Card),
    drift: z.object({ x: z.number(), y: z.number(), scale: z.number() }).default({ x: -80, y: -30, scale: 1.08 }),
    // drift: panels at their own x/y; stack: centered cards piling up with a tilt;
    // carousel: a perspective row sliding past the camera.
    layout: z.enum(["drift", "stack", "carousel"]).default("drift"),
  }),
  z.object({
    ...SceneBase,
    kind: z.literal("codeScroll"),
    lines: z.array(z.string()),
    sidebar: z.array(z.string()).default([]),
    speed: z.number().default(14),
    tilt: z.number().default(8),
    invertAt: Frame.optional(),
  }),
  z.object({
    ...SceneBase,
    kind: z.literal("halftoneRing"),
    seed: z.string().default("ring"),
    radius: z.number().default(0.15),
    thickness: z.number().default(0.04),
    cell: z.number().default(12),
    fadeOut: Frame.default(3),
    // ring: dithered annulus in a dot field; sphere: a rotating dotted globe;
    // tunnel: dot rings rushing toward the camera.
    motif: z.enum(["ring", "sphere", "tunnel"]).default("ring"),
  }),
  z.object({
    ...SceneBase,
    kind: z.literal("iconSwarm"),
    seed: z.string().default("swarm"),
    // Tile centers in composition pixels.
    // Each tile shows an image asset or a Lucide icon drawn in code (`glyph`,
    // a Lucide icon name such as "compass").
    icons: z.array(z.object({ asset: z.string().optional(), glyph: z.string().optional(), x: z.number(), y: z.number() })),
    convergeAt: Frame,
    tile: z.number().default(100),
    // swirl: tumble into the center; orbit: an elliptical ring that tightens;
    // grid: tiles snap into a grid, then fold into the center.
    pattern: z.enum(["swirl", "orbit", "grid"]).default("swirl"),
  }),
  z.object({ ...SceneBase, kind: z.literal("logoGlow"), size: z.number().default(70), growFrames: Frame.default(6),
    // glow: spring in a bloom; pulse: rings ripple out from the mark.
    style: z.enum(["glow", "pulse"]).default("glow") }),
  z.object({
    ...SceneBase,
    kind: z.literal("cardCollage"),
    seed: z.string().default("grid"),
    cards: z.array(Card),
    camera: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).default({ x: 0, y: 0, zoom: 1.06 }),
    timecodes: z.boolean().default(true),
    centerLogo: z.boolean().default(false),
    ditherOutAt: Frame.optional(),
    // cluster: cards at their own x/y; grid: a contact sheet that fills in;
    // fan: a hand of cards spreading from the center.
    layout: z.enum(["cluster", "grid", "fan"]).default("cluster"),
    // The field behind the cards.
    backdrop: z.enum(["schematic", "honeycomb", "rules"]).default("schematic"),
  }),
  // The mark on a field, driven by keyframe tracks ([scene frame, value],
  // eased between keys): it grows from a dot, the wordmark's letters arrive
  // beside it and fade, it slides, scales and spins, and hands off to a
  // partner mark. `flatten` crossfades the field to one color.
  z.object({
    ...SceneBase,
    kind: z.literal("markMorph"),
    field: z.enum(["sky", "flat", "grid", "rings"]).default("sky"),
    colors: z.object({ top: Color.default("accent"), bottom: Color.default("bg"), glow: Color.default("muted") }).default({ top: "accent", bottom: "bg", glow: "muted" }),
    // The glow's center and radius in 0..1 of the frame, moving over the scene.
    glow: z
      .object({ from: z.object({ x: z.number(), y: z.number(), r: z.number() }), to: z.object({ x: z.number(), y: z.number(), r: z.number() }) })
      .default({ from: { x: 0.1, y: 0, r: 0.6 }, to: { x: 0.3, y: 0, r: 0.6 } }),
    flatten: z.object({ at: Frame, frames: Frame.default(20), color: Color.default("fg") }).optional(),
    ink: Color.default("fg"),
    size: Track.default([[0, 200]]),
    x: Track.default([[0, 960]]),
    y: Track.default([[0, 540]]),
    spin: Track.default([[0, 0]]),
    opacity: Track.default([[0, 1]]),
    wordmark: z
      .object({
        text: z.string(),
        size: z.number().default(200),
        gap: z.number().default(10),
        enterAt: Frame.default(0),
        // Frames from the first letter's entrance to the last one's.
        spread: Frame.default(6),
        settle: Frame.default(8),
        enter: z.enum(["rise", "drop", "blur", "track"]).default("rise"),
        outAt: Frame.default(9999),
        outFrames: Frame.default(8),
      })
      .optional(),
    // An image (`asset`, a silhouette painted in `ink` when `tint`) or a
    // Lucide `glyph`, centered on the frame.
    partner: z
      .object({ asset: z.string().optional(), glyph: z.string().optional(), tint: z.boolean().default(true), size: Track, spin: Track.default([[0, 0]]), opacity: Track.default([[0, 1]]) })
      .optional(),
  }),
  z.object({
    ...SceneBase,
    kind: z.literal("endCard"),
    lockupHeight: z.number().default(64),
    // Wordmark only, without the mark.
    markless: z.boolean().default(false),
    // Frames to fade in (0 = cut on).
    fadeIn: Frame.default(2),
  }),
  // An agent product's task flow: a prompt composer fades in at `openAt`,
  // tasks[0].title types in word by word from `typeAt`, the composer folds
  // into a task row at `submitAt`, rises to the list top at `riseAt`, and the
  // other tasks join at `joinAt`. Times are flow frames; `clock` is the flow
  // frame at the scene start, so one flow can span several scenes.
  z.object({
    ...SceneBase,
    kind: z.literal("taskFeed"),
    clock: Frame.default(0),
    tasks: z.array(z.object({ title: z.string(), meta: z.string().default(""), tone: Color.default("accent"), done: z.boolean().default(false), glyph: z.string().optional() })).min(1),
    // The composer's context picker label (a repo or workspace).
    picker: z.string().default(""),
    openAt: Frame.default(3),
    typeAt: Frame.default(37),
    wordEvery: z.number().positive().default(7.67),
    submitAt: Frame.default(102),
    riseAt: Frame.default(156),
    joinAt: Frame.default(201),
    composer: Rect.default({ x: 129, y: 383, w: 822, h: 315 }),
    rows: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), gap: z.number() }).default({ x: 175, y: 288, w: 730, h: 148, gap: 12 }),
    promptSize: z.number().default(42),
    titleSize: z.number().default(25),
    // Card fill; default one step lighter than the page.
    surface: Color.optional(),
    // card: filled cards; outline: bordered, no fill; ink: fg-filled cards.
    look: z.enum(["card", "outline", "ink"]).default("card"),
    status: z.enum(["dot", "ring", "glyph"]).default("dot"),
    // rows: stacked cards; timeline: stacked cards on a connecting line.
    layout: z.enum(["rows", "timeline"]).default("rows"),
    // How the composer and the joining tasks arrive.
    enter: z.enum(["rise", "slide", "pop"]).default("rise"),
  }),
  // A computer screen in a photo with a live terminal drawn on it: the image
  // and the screen push in together while the script types, and glitch
  // blocks build up from `glitchFrom` to the end.
  z.object({
    ...SceneBase,
    kind: z.literal("screen"),
    asset: z.string(),
    // The screen's box in the image, in 0..1 of the frame.
    screen: Rect,
    // The terminal transcript: each line appears at `at` (scene frame) and
    // types over `type` frames.
    script: z.array(z.object({ at: Frame, text: z.string(), type: Frame.default(4), tone: z.enum(["fg", "dim", "accent", "code", "box"]).default("fg") })),
    zoomFrom: z.number().default(1),
    zoomTo: z.number().default(1),
    // Zoom origin in 0..1 of the frame (usually the screen's center).
    focus: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.4 }),
    glitchFrom: Frame.optional(),
    screenColor: Color.default("#2b3130"),
    textColor: Color.default("#d9ded6"),
  }),
  // A product-UI launch film on a soft field: timed elements (intro line,
  // composer, status ticker, calendars, detail card, heatmap, counter, phone,
  // cursor, text) on a 1920x1080 stage, each with its own camera, so elements
  // can crossfade and push in independently.
  z.object({
    ...SceneBase,
    kind: z.literal("stage"),
    // The page under the field; default the palette's bg.
    bg: Color.optional(),
    field: StageField.default({ color: "accent", strength: 0.35, seed: "field", marks: 0 }),
    elements: z.array(StageElement).default([]),
  }),
  // Infomercial explainer graphics: kinetic titles, a composer with
  // dropdown chips, labeled cards, badges, a card flip, a hexagon tunnel and
  // a logo reveal (see src/spec/promo.ts).
  z.object({
    ...SceneBase,
    kind: z.literal("promo"),
    field: PromoField.default({ grid: 0.07, backdropStart: 0, dim: 0 }),
    elements: z.array(PromoElement).default([]),
  }),
]);
export type Scene = z.infer<typeof Scene>;
export type StageElement = z.infer<typeof StageElement>;
export type StageTile = z.infer<typeof StageTile>;

// Overlays are layers that span several scenes on the absolute timeline.
export const Overlay = z.object({ from: Frame, duration: Frame.min(1), layer: Layer });
export type Overlay = z.infer<typeof Overlay>;

export const Section = z.object({ id: z.string(), name: z.string(), from: Frame, duration: Frame.min(1) });
export type Section = z.infer<typeof Section>;

export const Sound = z.object({
  kind: z.enum(["vo", "sfx", "music"]),
  src: z.string(),
  from: Frame,
  // Frames to play; default the whole file.
  duration: Frame.min(1).optional(),
  trimBefore: Frame.default(0),
  volume: z.number().default(1),
  // What it says or sounds like, for people and for re-generation.
  text: z.string().default(""),
});
export type Sound = z.infer<typeof Sound>;

export const BrandPalette = z.object({
  bg: Color.default("#000000"),
  fg: Color.default("#ffffff"),
  accent: Color.default("#e2622f"),
  muted: Color.default("#8a8a8a"),
});

export const BrandFonts = z.object({
  display: z.string().default("Inter"),
  mono: z.string().default("JetBrains Mono"),
  wordmark: z.string().default("Chakra Petch"),
});

export const Brand = z.object({
  name: z.string(),
  wordmark: z.string(),
  wordmarkWeight: z.number().default(600),
  // Asset ids. `lockup` is the logo + wordmark image used on the end card when
  // present; otherwise the end card draws the mark plus `wordmark` in code.
  lockup: z.string().optional(),
  mark: z.enum(["hexagon", "asset"]).default("hexagon"),
  markAsset: z.string().optional(),
  palette: BrandPalette.default({ bg: "#000000", fg: "#ffffff", accent: "#e2622f", muted: "#8a8a8a" }),
  fonts: BrandFonts.default({ display: "Inter", mono: "JetBrains Mono", wordmark: "Chakra Petch" }),
});
export type Brand = z.infer<typeof Brand>;

export const EditSpec = z.object({
  version: z.literal(1),
  meta: z.object({
    title: z.string(),
    sourceUrl: z.string().optional(),
    fps: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationInFrames: z.number().int().positive(),
    // Set by vary/rebrand: which spec this one was derived from and how.
    derivedFrom: z.string().optional(),
    derivation: z.string().optional(),
  }),
  brand: Brand,
  // The bed: the original soundtrack or a replacement. `duck` scales it while
  // a voice-over cue plays.
  audio: z.object({ src: z.string(), volume: z.number().default(1), trimBefore: Frame.default(0), duck: z.number().min(0).max(1).default(1) }).optional(),
  assets: z.array(Asset),
  scenes: z.array(Scene),
  overlays: z.array(Overlay).default([]),
  // The edit's parts, for picking a version of each part across variants.
  // They tile the timeline and fall on scene boundaries; empty means
  // `sectionsOf` derives them from the scenes.
  sections: z.array(Section).default([]),
  // Timed sound on top of the bed: voice-over lines, effects, and music
  // pieces. `src` is relative to the media dir like asset sources.
  sounds: z.array(Sound).default([]),
});
export type EditSpec = z.infer<typeof EditSpec>;
export type EditSpecInput = z.input<typeof EditSpec>;

export type Issue = { path: string; message: string };

// Structural checks zod cannot express: references resolve, scenes tile the
// timeline without gaps or overlaps, and layers stay inside their scene.
export function checkSpec(spec: EditSpec): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set(spec.assets.map((a) => a.id));
  if (ids.size !== spec.assets.length) issues.push({ path: "assets", message: "duplicate asset id" });
  const ref = (path: string, id: string | undefined) => {
    if (id !== undefined && !ids.has(id)) issues.push({ path, message: `unknown asset "${id}"` });
  };
  ref("brand.lockup", spec.brand.lockup);
  ref("brand.markAsset", spec.brand.markAsset);
  let cursor = 0;
  const sceneIds = new Set<string>();
  spec.scenes.forEach((scene, i) => {
    const path = `scenes[${i}](${scene.id})`;
    if (sceneIds.has(scene.id)) issues.push({ path, message: "duplicate scene id" });
    sceneIds.add(scene.id);
    if (scene.from !== cursor) issues.push({ path, message: `starts at ${scene.from}, expected ${cursor} (gap or overlap)` });
    cursor = scene.from + scene.duration;
    if (scene.kind === "media" || scene.kind === "screen" || scene.kind === "laptop" || scene.kind === "markFill") ref(`${path}.asset`, scene.asset);
    if (scene.kind === "laptop") scene.shots.forEach((sh, j) => ref(`${path}.shots[${j}]`, sh.asset));
    const mark = scene.kind === "laptop" ? scene.mark : scene.kind === "markFill" ? scene.mark : undefined;
    mark?.fills.forEach((f, j) => ref(`${path}.mark.fills[${j}]`, f));
    if (scene.kind === "panelCollage") {
      ref(`${path}.background`, scene.background);
      scene.panels.forEach((p, j) => (p.asset || !p.ui ? ref(`${path}.panels[${j}]`, p.asset ?? "(none)") : undefined));
    }
    if (scene.kind === "cardCollage") scene.cards.forEach((c, j) => ref(`${path}.cards[${j}]`, c.asset ?? "(none)"));
    if (scene.kind === "iconSwarm") scene.icons.forEach((icon, j) => (icon.asset || !icon.glyph ? ref(`${path}.icons[${j}]`, icon.asset ?? "(none)") : undefined));
    if (scene.kind === "markMorph" && scene.partner && (scene.partner.asset || !scene.partner.glyph)) ref(`${path}.partner`, scene.partner.asset ?? "(none)");
    if (scene.kind === "stage") stageAssets(scene).forEach((id) => ref(`${path}.elements`, id));
    if (scene.kind === "promo") promoAssets(scene.elements, scene.field).forEach((id) => ref(`${path}.elements`, id));
  });
  if (cursor !== spec.meta.durationInFrames) {
    issues.push({ path: "scenes", message: `cover ${cursor} frames, meta.durationInFrames is ${spec.meta.durationInFrames}` });
  }
  spec.overlays.forEach((o, i) => {
    if (o.from + o.duration > spec.meta.durationInFrames) issues.push({ path: `overlays[${i}]`, message: "runs past the end" });
  });
  if (spec.sections.length) {
    const cuts = new Set(spec.scenes.map((s) => s.from));
    let at = 0;
    spec.sections.forEach((sec, i) => {
      const path = `sections[${i}](${sec.id})`;
      if (sec.from !== at) issues.push({ path, message: `starts at ${sec.from}, expected ${at}` });
      if (!cuts.has(sec.from)) issues.push({ path, message: `starts at ${sec.from}, which is not a scene boundary` });
      at = sec.from + sec.duration;
    });
    if (at !== spec.meta.durationInFrames) issues.push({ path: "sections", message: `cover ${at} frames, expected ${spec.meta.durationInFrames}` });
  }
  spec.sounds.forEach((s, i) => {
    if (s.from >= spec.meta.durationInFrames) issues.push({ path: `sounds[${i}]`, message: "starts after the end" });
  });
  return issues;
}

// The spec's sections, or derived ones: each run of media scenes is one
// section and so is each run of same-kind graphic scenes, named after its
// first scene.
export function sectionsOf(spec: EditSpec): Section[] {
  if (spec.sections.length) return spec.sections;
  const out: Section[] = [];
  let prev: string | undefined;
  for (const scene of spec.scenes) {
    const last = out[out.length - 1];
    if (last && scene.kind === prev) last.duration += scene.duration;
    else out.push({ id: `s${out.length + 1}`, name: scene.id, from: scene.from, duration: scene.duration });
    prev = scene.kind;
  }
  return out;
}

export function parseSpec(json: unknown): EditSpec {
  const spec = EditSpec.parse(json);
  const issues = checkSpec(spec);
  if (issues.length) {
    throw new Error("Invalid edit spec:\n" + issues.map((i) => `  ${i.path}: ${i.message}`).join("\n"));
  }
  return spec;
}

// The scene that is on screen at an absolute frame.
export function sceneAt(spec: EditSpec, frame: number): Scene | undefined {
  return spec.scenes.find((s) => frame >= s.from && frame < s.from + s.duration);
}

// The assets whose pixels stand under a scene's layers: what decides which
// layer keys are already baked in.
export function bakingAssets(s: Scene): string[] {
  if (s.kind === "media" || s.kind === "screen" || s.kind === "laptop") return [s.asset];
  if (s.kind === "markFill") return s.asset ? [s.asset] : [];
  if (s.kind === "panelCollage" && s.background) return [s.background];
  return [];
}

// Asset ids a scene shows.
export function sceneAssetIds(s: Scene): string[] {
  if (s.kind === "media" || s.kind === "screen") return [s.asset];
  if (s.kind === "laptop") return [s.asset, ...s.shots.map((sh) => sh.asset), ...(s.mark?.fills ?? [])];
  if (s.kind === "markFill") return [...(s.asset ? [s.asset] : []), ...s.mark.fills];
  const ids = (xs: { asset?: string }[]) => xs.flatMap((x) => (x.asset ? [x.asset] : []));
  if (s.kind === "cardCollage") return ids(s.cards);
  if (s.kind === "panelCollage") return [...ids(s.panels), ...(s.background ? [s.background] : [])];
  if (s.kind === "iconSwarm") return ids(s.icons);
  if (s.kind === "markMorph") return s.partner?.asset ? [s.partner.asset] : [];
  if (s.kind === "stage") return stageAssets(s);
  if (s.kind === "promo") return promoAssets(s.elements, s.field);
  return [];
}

// Every asset a stage scene's elements reference (tiles, icons, wallpapers).
function stageAssets(s: Extract<Scene, { kind: "stage" }>): string[] {
  const ids: (string | undefined)[] = [];
  const tiles = (ts: StageTile[]) => ts.forEach((t) => ids.push(t.asset, t.widget?.icon, ...Object.values(t.widget?.avatars ?? {})));
  const icon = (i?: { asset?: string }) => ids.push(i?.asset);
  for (const e of s.elements) {
    if (e.kind === "introLine") icon(e.icon);
    if (e.kind === "status") {
      icon(e.mark);
      e.phrases.forEach((p) => (icon(p.prop?.icon), tiles(p.prop?.tiles ?? [])));
    }
    if (e.kind === "calendar") (tiles(e.tiles), e.icons.forEach(icon));
    if (e.kind === "detail") {
      tiles(e.backdrop);
      e.posts.forEach((p) => (p.media.forEach((m) => tiles([m.tile])), p.art && tiles([p.art]), p.icons.forEach(icon)));
    }
    if (e.kind === "heatmap") icon(e.logo);
    if (e.kind === "phone") (ids.push(e.wallpaper), e.notes.forEach((n) => icon(n.icon)));
    if (e.kind === "flow") ids.push(e.icon);
  }
  return [...new Set(ids.filter((id): id is string => !!id))];
}

// The same scene with every asset reference passed through `rename`.
export function renameSceneAssets(s: Scene, rename: (id: string) => string): Scene {
  const out = structuredClone(s);
  if (out.kind === "media" || out.kind === "screen") out.asset = rename(out.asset);
  if (out.kind === "laptop") {
    out.asset = rename(out.asset);
    out.shots.forEach((sh) => (sh.asset = rename(sh.asset)));
  }
  if (out.kind === "laptop" || out.kind === "markFill") {
    if (out.kind === "markFill" && out.asset) out.asset = rename(out.asset);
    if (out.mark) out.mark.fills = out.mark.fills.map(rename);
  }
  const each = (xs: { asset?: string }[]) => xs.forEach((x) => x.asset && (x.asset = rename(x.asset)));
  if (out.kind === "cardCollage") each(out.cards);
  if (out.kind === "panelCollage") {
    each(out.panels);
    if (out.background) out.background = rename(out.background);
  }
  if (out.kind === "iconSwarm") each(out.icons);
  if (out.kind === "markMorph" && out.partner?.asset) out.partner.asset = rename(out.partner.asset);
  return out;
}

export function assetOf(spec: EditSpec, id: string | undefined): Asset | undefined {
  return id === undefined ? undefined : spec.assets.find((a) => a.id === id);
}

// Layer keys burned into whatever the scene shows at this frame.
export function bakedAt(spec: EditSpec, frame: number): Set<string> {
  const scene = sceneAt(spec, frame);
  if (!scene) return new Set();
  const used: string[] = [];
  used.push(...bakingAssets(scene));
  return new Set(used.flatMap((id) => assetOf(spec, id)?.baked ?? []));
}
