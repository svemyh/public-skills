// bun launch-video/scripts/bootstrap.ts <https://domain> --out <dir>
// Scrapes a website's HTML and primary stylesheet to bootstrap a brand folder:
// downloads its favicon/touch-icon/inline SVGs and product images, converts
// WebP images to PNG32 when ImageMagick (`magick`) is available, extracts top
// colors and copy, and writes `<dir>/brand.json` ready for agent curation.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { $ } from "bun";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const rawUrl = process.argv[2];
const outArg = arg("--out") ?? "./brand";
if (!rawUrl || rawUrl.startsWith("--")) {
  console.error("usage: bun bootstrap.ts <https://domain> [--out ./brand]");
  process.exit(1);
}

const siteUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
const u = new URL(siteUrl);
const domain = u.hostname.replace(/^www\./, "");
const brandName = domain.split(".")[0]!;
const outDir = resolve(outArg);
mkdirSync(join(outDir, "screens"), { recursive: true });
mkdirSync(join(outDir, "logos"), { recursive: true });

const headers = { "User-Agent": "Mozilla/5.0 (compatible; LaunchVideoBootstrap/1.0)" };
const html = await (await fetch(u.origin, { headers })).text();

const unescapeHtml = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const title = unescapeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? brandName).replace(/\s+/g, " "));
const desc = unescapeHtml(
  html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)/i)?.[1] ?? "",
);

// Fetch first stylesheet if present to sample brand hex colors.
const cssHref = html.match(/href=["']([^"']+\.css[^"']*)/i)?.[1];
let css = "";
if (cssHref) {
  try {
    css = await (await fetch(new URL(cssHref, u.origin).href, { headers })).text();
  } catch {}
}

const hexCounts = new Map<string, number>();
for (const m of (html + "\n" + css).matchAll(/#([0-9a-fA-F]{6})\b/g)) {
  const hex = `#${m[1]!.toUpperCase()}`;
  hexCounts.set(hex, (hexCounts.get(hex) ?? 0) + 1);
}
const topColors = [...hexCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([c]) => c)
  .filter((c) => c !== "#000000" && c !== "#FFFFFF")
  .slice(0, 10);

// Save inline SVGs for inspection so the agent can pick the exact vector mark/wordmark.
const inlineSvgs = [...html.matchAll(/<svg[^>]*>[\s\S]*?<\/svg>/gi)].map((m) => m[0]);
inlineSvgs.slice(0, 8).forEach((svg, idx) => {
  writeFileSync(join(outDir, `inline-${idx}.svg`), svg);
});

// Download candidate icons & landing images.
const imgRefs = new Set<string>(["/favicon.svg", "/apple-touch-icon.png"]);
for (const m of html.matchAll(/(?:src|href)=["']([^"']+\.(?:png|webp|svg|jpg|jpeg))["']/gi)) {
  const ref = m[1]!;
  if (!ref.startsWith("data:")) imgRefs.add(ref);
}

const hasMagick = (await $`which magick`.nothrow().quiet()).exitCode === 0;
const screens: Record<string, { file: string; description: string }> = {};
let markFile = "mark.png";
let markSaved = false;

for (const ref of [...imgRefs].slice(0, 18)) {
  try {
    const full = new URL(ref, u.origin).href;
    const res = await fetch(full, { headers });
    if (!res.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 300) continue;
    const base = basename(new URL(full).pathname);
    if (/favicon|touch-icon|logo|mark/i.test(base) && !markSaved) {
      const rawPath = join(outDir, base);
      writeFileSync(rawPath, bytes);
      if (hasMagick && !base.endsWith(".svg")) {
        await $`magick ${rawPath} PNG32:${join(outDir, "mark.png")}`.nothrow().quiet();
        markFile = "mark.png";
      } else {
        markFile = base;
      }
      markSaved = true;
      continue;
    }
    const stem = base.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    const rawDst = join(outDir, "screens", base);
    writeFileSync(rawDst, bytes);
    let finalRel = `screens/${base}`;
    if (hasMagick && /\.webp$/i.test(base)) {
      const pngDst = join(outDir, "screens", `${stem}.png`);
      const conv = await $`magick ${rawDst} PNG32:${pngDst}`.nothrow().quiet();
      if (conv.exitCode === 0) finalRel = `screens/${stem}.png`;
    }
    screens[stem] = { file: finalRel, description: `Downloaded from ${ref} — inspect visually and write a factual description.` };
  } catch {}
}

const draft = {
  name: brandName,
  wordmark: brandName,
  website: domain,
  tagline: desc.split(/\.\s+/)[0]?.slice(0, 60) || title,
  mark: markFile,
  palette: {
    bg: "#000000",
    fg: "#FFFFFF",
    accent: topColors[0] ?? "#2D74FF",
    muted: "#8A8A8A",
  },
  fonts: { display: "Inter", wordmark: "Inter" },
  mosaicColors: topColors.length >= 4 ? topColors : ["#3E63DD", "#30A46C", "#F76B15", "#12A594", "#FFB224", "#6E6E6E", "#9A9A9A"],
  mosaicStyle: "asset",
  screens,
  logos: {},
  cta: {
    big: "Free to start.",
    title: `Get ${brandName}`,
    body: desc.slice(0, 90),
    button: `Try ${brandName}`,
  },
};

const profilePath = join(outDir, "brand.json");
writeFileSync(profilePath, JSON.stringify(draft, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      wrote: profilePath,
      domain,
      title,
      inlineSvgsSaved: Math.min(8, inlineSvgs.length),
      screensDownloaded: Object.keys(screens).length,
      topColors,
      next: "Inspect the downloaded mark, inline-*.svg files, and screens/* visually; ensure mark is white/light on transparent PNG/SVG, prune non-UI images, then write launch.json and run scripts/render.ts.",
    },
    null,
    2,
  ),
);
