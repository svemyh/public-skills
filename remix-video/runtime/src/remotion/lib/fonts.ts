// Brand fonts by name. Google families listed here are bundled; a value
// ending in .ttf/.otf/.woff/.woff2 is a file under the project's media dir.
import { continueRender, delayRender, staticFile } from "remotion";
import { loadFont as archivo } from "@remotion/google-fonts/Archivo";
import { loadFont as chakraPetch } from "@remotion/google-fonts/ChakraPetch";
import { loadFont as dmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as geist } from "@remotion/google-fonts/Geist";
import { loadFont as geistMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as ibmPlexMono } from "@remotion/google-fonts/IBMPlexMono";
import { loadFont as ebGaramond } from "@remotion/google-fonts/EBGaramond";
import { loadFont as instrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as interTight } from "@remotion/google-fonts/InterTight";
import { loadFont as jetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as manrope } from "@remotion/google-fonts/Manrope";
import { loadFont as orbitron } from "@remotion/google-fonts/Orbitron";
import { loadFont as playfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as rajdhani } from "@remotion/google-fonts/Rajdhani";
import { loadFont as sora } from "@remotion/google-fonts/Sora";
import { loadFont as spaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as syne } from "@remotion/google-fonts/Syne";
import { loadFont as unbounded } from "@remotion/google-fonts/Unbounded";
import type { Brand } from "../../spec/schema";

type Loader = () => { fontFamily: string };
const opts = { subsets: ["latin" as const] };

// Weights are left to each family's defaults where the typings disagree.
export const GOOGLE_FONTS: Record<string, Loader> = {
  Archivo: () => archivo("normal", opts),
  "Chakra Petch": () => chakraPetch("normal", { ...opts, weights: ["500", "600", "700"] }),
  "DM Sans": () => dmSans("normal", opts),
  Geist: () => geist("normal", opts),
  "Geist Mono": () => geistMono("normal", opts),
  "IBM Plex Mono": () => ibmPlexMono("normal", { ...opts, weights: ["400", "500"] }),
  Inter: () => inter("normal", { ...opts, weights: ["400", "500", "600", "700"] }),
  "Inter Tight": () => interTight("normal", { ...opts, weights: ["400", "500", "600"] }),
  "JetBrains Mono": () => jetBrainsMono("normal", { ...opts, weights: ["400", "700"] }),
  Manrope: () => manrope("normal", opts),
  Orbitron: () => orbitron("normal", opts),
  Rajdhani: () => rajdhani("normal", { ...opts, weights: ["500", "600", "700"] }),
  Sora: () => sora("normal", opts),
  "Space Grotesk": () => spaceGrotesk("normal", opts),
  Syne: () => syne("normal", opts),
  Unbounded: () => unbounded("normal", opts),
};

const loaded = new Map<string, string>();

function loadLocal(path: string): string {
  const family = `local-${path.replace(/[^a-z0-9]/gi, "-")}`;
  const handle = delayRender(`font ${path}`);
  const face = new FontFace(family, `url(${staticFile(path)})`);
  face
    .load()
    .then((f) => {
      document.fonts.add(f);
      continueRender(handle);
    })
    .catch((err) => {
      console.error(`font ${path} failed to load`, err);
      continueRender(handle);
    });
  return family;
}

export function fontFamily(name: string): string {
  const cached = loaded.get(name);
  if (cached) return cached;
  let css: string;
  if (/\.(ttf|otf|woff2?)$/i.test(name)) css = `"${loadLocal(name)}", sans-serif`;
  else {
    const loader = GOOGLE_FONTS[name];
    // Unknown names fall through as plain CSS families (system fonts).
    css = loader ? `"${loader().fontFamily}", sans-serif` : `"${name}", "Helvetica Neue", Arial, sans-serif`;
  }
  loaded.set(name, css);
  return css;
}

export type Fonts = { display: string; mono: string; wordmark: string };

export function resolveFonts(fonts: Brand["fonts"]): Fonts {
  return { display: fontFamily(fonts.display), mono: fontFamily(fonts.mono), wordmark: fontFamily(fonts.wordmark) };
}

// The faces a "morph" text entrance flickers through before each letter
// settles: serif romans and italics, like type being set by hand.
export type Face = { family: string; style: "normal" | "italic" };
let morph: Face[] | undefined;
export function morphFaces(): Face[] {
  morph ??= [
    { family: instrumentSerif("normal", opts).fontFamily, style: "normal" },
    { family: instrumentSerif("italic", opts).fontFamily, style: "italic" },
    { family: playfair("italic", opts).fontFamily, style: "italic" },
    { family: ebGaramond("normal", opts).fontFamily, style: "normal" },
  ];
  return morph;
}
