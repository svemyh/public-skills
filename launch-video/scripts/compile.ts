import { cpSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { $ } from "bun";
import { CompiledFilm, Plan, Profile, type LaunchScene } from "../template/src/schema";
import { renderSynthBed } from "./synth-bed";

const W = 1920;
const H = 1080;

export interface ScreenGeometry {
  w: number;
  h: number;
  frameless: boolean;
}

export function layoutBeat(
  aspect: number,
  frameless: boolean,
  hexCount: number,
  hexLayout: "auto" | "sides" | "left" | "top",
): { x: number; y: number; w: number; h: number; hexCoords: { x: number; y: number }[] } {
  const mode = hexCount === 0 ? "none" : hexLayout === "auto" ? (hexCount === 3 ? "left" : "sides") : hexLayout;
  const maxW = mode === "none" ? 1600 : mode === "top" ? 1480 : 1320;
  const maxH = mode === "top" ? 660 : 860;
  let w = maxW;
  let h = Math.round(w / aspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h * aspect);
  }
  const y = mode === "top" ? 340 : Math.round(112 + (880 - h) / 2);
  const x = mode === "left" ? Math.round((W - w + 150) / 2) : Math.round((W - w) / 2);

  const hexCoords = Array.from({ length: hexCount }, (_, i) => {
    if (mode === "top") {
      const step = 176;
      return { x: Math.round(W / 2 + (i - (hexCount - 1) / 2) * step), y: 212 };
    }
    if (mode === "left") {
      const step = 184;
      return { x: Math.max(92, x - 122), y: Math.round(y + h / 2 + (i - (hexCount - 1) / 2) * step) };
    }
    const left = i % 2 === 0;
    const row = Math.floor(i / 2);
    const rowsOnSide = Math.ceil((hexCount - (left ? 0 : 1)) / 2);
    return {
      x: left ? Math.max(92, x - 122) : Math.min(W - 92, x + w + 122),
      y: Math.round(y + h / 2 + (row - (rowsOnSide - 1) / 2) * 200),
    };
  });

  return { x, y, w, h, hexCoords };
}

async function inspectImage(file: string): Promise<{ w: number; h: number; minAlpha: number }> {
  if (/\.(mp4|webm|mov)$/i.test(file)) {
    const out = (await $`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 ${file}`.text())
      .trim()
      .split(",");
    return { w: Number(out[0]) || 1920, h: Number(out[1]) || 1080, minAlpha: 1 };
  }
  const out = (await $`magick identify -format "%w %h %[fx:minima.a]" ${file + "[0]"}`.text()).trim().split(/\s+/);
  return { w: Number(out[0]) || 1600, h: Number(out[1]) || 900, minAlpha: Number(out[2] ?? 1) };
}

export async function compileLaunch(planPath: string, publicDir: string): Promise<CompiledFilm> {
  const absPlan = resolve(planPath);
  const planDir = dirname(absPlan);
  const plan = Plan.parse(await Bun.file(absPlan).json());
  const absProfile = resolve(planDir, plan.brand);
  const profileDir = dirname(absProfile);
  const profile = Profile.parse(await Bun.file(absProfile).json());

  mkdirSync(publicDir, { recursive: true });
  const copy = (src: string, sub: string, name?: string) => {
    const fname = name ?? basename(src);
    const dst = join(publicDir, sub, fname);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
    return `${sub}/${fname}`;
  };

  const markFile = resolve(profileDir, profile.mark);
  if (!existsSync(markFile)) throw new Error(`missing brand mark: ${markFile}`);
  const markSrc = copy(markFile, "brand");

  const fps = plan.fps;
  const f = (s: number) => Math.round(s * fps);
  const scenes: LaunchScene[] = [];
  const beatStartsSec: number[] = [];
  let at = 0;

  const push = (sc: Omit<LaunchScene, "from">) => {
    scenes.push({ ...sc, from: at });
    at += sc.duration;
  };

  const openFrames = f(plan.open.seconds);
  const mosaicIn = Math.min(f(1.15), openFrames - 10);
  push({
    id: "open",
    name: "Open",
    duration: openFrames,
    mosaic: { mode: "in", at: 0, frames: mosaicIn, colors: profile.mosaicColors, markStyle: profile.mosaicStyle, seed: "mosaic" },
    lockup: { tagline: plan.open.tagline ?? profile.tagline, size: 120, y: 540, at: mosaicIn - 8 },
    hexes: [],
    fadeOut: 0,
  });

  for (const b of plan.beats) {
    beatStartsSec.push(at / fps);
    const screen = profile.screens[b.screen];
    const rawFile = screen ? resolve(profileDir, screen.file) : resolve(planDir, b.screen);
    if (!existsSync(rawFile)) throw new Error(`beat "${b.id}": missing screen "${b.screen}" (${rawFile})`);

    const isVideo = /\.(mp4|webm|mov)$/i.test(rawFile);
    const rawInfo = await inspectImage(rawFile);
    const frameless = !isVideo && (screen?.frameless ?? rawInfo.minAlpha < 0.98);
    let stagedFile = rawFile;
    let srcRel: string;

    mkdirSync(join(publicDir, "screens"), { recursive: true });
    if (!isVideo && screen?.crop) {
      const c = screen.crop;
      stagedFile = join(publicDir, "screens", `${b.id}.png`);
      await $`magick ${rawFile} -crop ${`${c.w}x${c.h}+${c.x}+${c.y}`} +repage ${stagedFile}`;
      srcRel = `screens/${b.id}.png`;
    } else if (!isVideo && frameless) {
      stagedFile = join(publicDir, "screens", `${b.id}.png`);
      await $`magick ${rawFile} -trim +repage ${stagedFile}`;
      srcRel = `screens/${b.id}.png`;
    } else {
      srcRel = copy(rawFile, "screens");
    }

    const dim = stagedFile === rawFile ? rawInfo : await inspectImage(stagedFile);
    const aspect = dim.w / Math.max(1, dim.h);
    const box = layoutBeat(aspect, frameless, b.hexes.length, b.hexLayout);

    const hexes: LaunchScene["hexes"] = b.hexes.map((logoId, i) => {
      const l = profile.logos[logoId];
      if (!l) throw new Error(`unknown logo "${logoId}" (available: ${Object.keys(profile.logos).join(", ")})`);
      const logoSrc = copy(resolve(profileDir, l.file), "logos");
      const pt = box.hexCoords[i]!;
      return { x: pt.x, y: pt.y, size: 136, at: 10 + i * 4, src: logoSrc, fill: l.fill, bars: false };
    });

    push({
      id: b.id,
      name: b.headline,
      duration: f(b.seconds),
      headline: { text: b.headline, size: 64, y: 54, at: 0, weight: 400 },
      window: {
        src: srcRel,
        isVideo,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        radius: 14,
        at: 6,
        push: b.push,
        border: !frameless,
        fit: frameless ? "contain" : "cover",
      },
      hexes,
      fadeOut: 0,
    });
  }

  const big = plan.cta.big ?? profile.cta.big;
  if (big) {
    push({
      id: "free",
      name: big,
      duration: f(plan.cta.bigSeconds),
      bigText: { text: big, size: 204, y: 540, at: 0, weight: 400 },
      hexes: [],
      fadeOut: 0,
    });
  }

  const card = plan.cta.card ?? { title: profile.cta.title, body: profile.cta.body, button: profile.cta.button };
  const cardFrames = f(plan.cta.cardSeconds);
  const clickAt = Math.min(cardFrames - 20, Math.round(cardFrames * 0.55));
  const clickSec = (at + clickAt) / fps;
  const ctaHeadline =
    plan.cta.headline ??
    (big ? `${big} ${/^(Download|Get|Try|Start|Trade)\b/i.test(card.title) ? `${card.title}.` : `Get ${card.title}.`}` : card.title);
  push({
    id: "download",
    name: card.title,
    duration: cardFrames,
    headline: { text: ctaHeadline, size: 64, y: 54, at: 0, weight: 400 },
    card: { ...card, w: 520, y: 590, at: 8, clickAt },
    hexes: [],
    fadeOut: 0,
  });

  const outroSec = at / fps;
  const outroFrames = f(plan.outro.seconds);
  const burst = Math.min(f(1.5), outroFrames - 30);
  push({
    id: "outro",
    name: "Outro",
    duration: outroFrames,
    mosaic: { mode: "out", at: 0, frames: burst, colors: profile.mosaicColors, markStyle: profile.mosaicStyle, seed: "mosaic" },
    wordmark: { text: plan.outro.text ?? profile.website, size: 96, at: burst - 12, typed: true, typeFrames: f(1.1) },
    hexes: [],
    fadeOut: 0,
  });

  let audio: CompiledFilm["audio"];
  if (plan.music !== "none") {
    const musicCandidate =
      plan.music === "synth" ? undefined : plan.music === "profile" ? (profile.music ? resolve(profileDir, profile.music) : undefined) : resolve(planDir, plan.music);
    if (musicCandidate && existsSync(musicCandidate)) {
      audio = { src: copy(musicCandidate, "audio"), volume: profile.musicGain, fadeOut: f(1.5) };
    } else {
      const synthOut = join(publicDir, "audio", "synth-bed.m4a");
      await renderSynthBed(synthOut, { durationSec: at / fps, beatStartsSec, clickSec, outroSec });
      audio = { src: "audio/synth-bed.m4a", volume: profile.musicGain, fadeOut: f(1.2) };
    }
  }

  return CompiledFilm.parse({
    fps,
    width: W,
    height: H,
    durationInFrames: at,
    brand: {
      name: profile.name,
      wordmark: profile.wordmark,
      markSrc,
      palette: profile.palette,
      fonts: profile.fonts,
    },
    audio,
    scenes,
  });
}
