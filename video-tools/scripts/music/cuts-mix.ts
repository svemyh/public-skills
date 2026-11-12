#!/usr/bin/env bun
// Mix faint, band-matched per-cut sound effects onto a rapid-fire montage bed.
// Synthesizes crisp takes natively (`ticks`, `pops`, `glitch`, `glock`,
// `celesta`, `marimba`, `ping`, `detent`, `chirp`) or loads custom WAVs from
// `--sfx-dir`. Default level is -7 dB relative to the music in the effect's own
// frequency band over the 30 ms following each cut.
//
// Usage:
//   bun cuts-mix.ts <music.wav|mp3|m4a> <variant> <out.wav> --spec <spec.json> [--changes changes.json] [--over-db -7]
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bandpass, decodePcm, mulberry32, rms, writeWav16 } from "./dsp";

const NOTES: Record<string, number> = {
  F4: 349.23, G4: 392.0, Ab4: 415.3, Bb4: 466.16,
  C5: 523.25, Db5: 554.37, Eb5: 622.25, F5: 698.46,
  G5: 783.99, Ab5: 830.61, Bb5: 932.33, C6: 1046.5,
  Db6: 1108.73, Eb6: 1244.51, F6: 1396.91,
};
const SCALE = ["F5", "G5", "Ab5", "Bb5", "C6", "Db6", "Eb6", "F6"];
const LOW_SCALE = ["F4", "G4", "Ab4", "Bb4", "C5", "Db5", "Eb5", "F5"];
const ARP = ["F5", "Ab5", "C6", "Eb6"];
const BANDS: Record<string, [number, number]> = {
  ticks: [3200, 12800],
  pops: [730, 2900],
  glitch: [980, 3900],
  glock: [860, 3400],
  celesta: [900, 3600],
  marimba: [400, 2000],
  ping: [1200, 4200],
  detent: [1600, 5600],
  chirp: [900, 4800],
};

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const [musicFile, variant, outFile] = process.argv.slice(2);
if (!musicFile || !variant || !outFile || !BANDS[variant]) {
  console.error("usage: bun cuts-mix.ts <music> <ticks|pops|glitch|glock|celesta|marimba|ping|detent|chirp> <out.wav> --spec <spec.json>");
  process.exit(1);
}

const sr = 48000;
const musicInterleaved = await decodePcm(musicFile, 2, sr);
const nSamples = Math.floor(musicInterleaved.length / 2);
const musicMono = new Float32Array(nSamples);
for (let i = 0; i < nSamples; i++) musicMono[i] = 0.5 * (musicInterleaved[i * 2]! + musicInterleaved[i * 2 + 1]!);

let fps = Number(flag("--fps") ?? 30);
let totalFrames = Number(flag("--frames") ?? 0);
const cutSet = new Set<number>();

if (flag("--spec")) {
  const spec = await Bun.file(flag("--spec")!).json();
  fps = Number(spec.meta.fps);
  totalFrames = Number(spec.meta.durationInFrames);
  for (const s of spec.scenes ?? []) if (Number(s.from) > 0) cutSet.add(Number(s.from));
}
if (flag("--cuts")) {
  for (const c of await Bun.file(flag("--cuts")!).json()) cutSet.add(Number(c));
}
if (flag("--changes")) {
  for (const c of await Bun.file(flag("--changes")!).json()) cutSet.add(Number(c));
}
if (!totalFrames) totalFrames = Math.max(1, Math.round((nSamples / sr) * fps));
const cuts = [...cutSet].filter((c) => c >= 0 && c < totalFrames).sort((a, b) => a - b);
if (!cuts.length) {
  console.error("no cuts found; pass --spec <spec.json> or --cuts <cuts.json>");
  process.exit(1);
}

function synthMonoTake(kind: string, note: string, seed: number): Float32Array {
  const rand = mulberry32(1000 + seed * 37);
  const dur = kind === "glock" || kind === "celesta" || kind === "marimba" ? 0.085 : 0.055;
  const len = Math.floor(sr * dur);
  let y: Float32Array = new Float32Array(len);
  const f0 = NOTES[note] ?? 880;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const g = rand() * 2 - 1;
    if (kind === "ticks") {
      y[i] = g * Math.exp(-t / 0.0035);
    } else if (kind === "detent") {
      y[i] = Math.sin(2 * Math.PI * (2400 + 180 * seed) * t) * Math.exp(-t / 0.004);
    } else if (kind === "ping") {
      y[i] = Math.sin(2 * Math.PI * (1760 + 90 * seed) * t) * Math.exp(-t / 0.014);
    } else if (kind === "chirp") {
      const sweep = 900 + 2600 * (t / dur);
      y[i] = (Math.round(Math.sin(2 * Math.PI * sweep * t) * 4) / 4) * Math.exp(-t / 0.012);
    } else if (kind === "glitch") {
      y[i] = (g >= 0 ? 1 : -1) * Math.exp(-t / 0.008);
    } else if (kind === "pops") {
      phase += (2 * Math.PI * f0 * (1 + 1.4 * Math.exp(-t / 0.006))) / sr;
      y[i] = Math.sin(phase) * Math.exp(-t / 0.015);
    } else if (kind === "marimba") {
      y[i] = (Math.sin(2 * Math.PI * f0 * t) + 0.25 * Math.sin(2 * Math.PI * 4 * f0 * t) * Math.exp(-t / 0.008)) * Math.exp(-t / 0.032);
    } else {
      const harm = kind === "glock" ? 2.756 : 2.0;
      y[i] = (Math.sin(2 * Math.PI * f0 * t) + 0.35 * Math.sin(2 * Math.PI * harm * f0 * t) * Math.exp(-t / 0.02)) * Math.exp(-t / 0.045);
    }
  }
  if (kind === "ticks") y = bandpass(y, 3400, 12500, sr);
  if (kind === "glitch") y = bandpass(y, 950, 4200, sr);
  let peak = 1e-9;
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]!));
  for (let i = 0; i < y.length; i++) y[i] = y[i]! / peak;
  return y;
}

const sfxDir = flag("--sfx-dir");
const overDb = Number(flag("--over-db") ?? -7.0);
const [loHz, hiHz] = BANDS[variant]!;
const musicBand = bandpass(musicMono, loHz, hiHz, sr);
const rng = mulberry32(164);

const fxL = new Float32Array(nSamples);
const fxR = new Float32Array(nSamples);
const lens = cuts.map((c, i) => (cuts[i + 1] ?? totalFrames) - c);
const prev = [cuts[0]!, ...lens.slice(0, -1)];
let step = 0;

for (let i = 0; i < cuts.length; i++) {
  const f = cuts[i]!;
  if (prev[i]! >= 4) step = 0;
  const note = variant === "pops" ? ARP[i % 4]! : variant === "marimba" ? LOW_SCALE[step % 8]! : SCALE[step % 8]!;
  const seed = (i % 6) + 1;
  const takeName =
    variant === "pops" ? `pop-${note}` : variant === "glock" || variant === "celesta" || variant === "marimba" ? `${variant}-${note}` : variant === "ticks" ? `tick-${seed}` : `${variant}-${seed}`;
  step++;

  let monoTake: Float32Array;
  let onset = 0;
  if (sfxDir && existsSync(join(sfxDir, `${takeName}.wav`))) {
    monoTake = await decodePcm(join(sfxDir, `${takeName}.wav`), 1, sr);
    let peak = 1e-9;
    for (let k = 0; k < monoTake.length; k++) peak = Math.max(peak, Math.abs(monoTake[k]!));
    const thr = peak * Math.pow(10, -30 / 20);
    for (let k = 0; k < monoTake.length; k++) {
      if (Math.abs(monoTake[k]!) > thr) {
        onset = k;
        break;
      }
      monoTake[k] = monoTake[k]! / peak;
    }
    for (let k = onset; k < monoTake.length; k++) monoTake[k] = monoTake[k]! / peak;
  } else {
    monoTake = synthMonoTake(variant, note, seed);
  }

  const t = f / fps;
  const s0 = Math.round(t * sr) - onset;
  const nxt = (i + 1 < cuts.length ? cuts[i + 1]! / fps : 999) + 0.02;
  const n = Math.min(monoTake.length, Math.max(1, Math.round((nxt - t) * sr) + onset));
  const clipped = monoTake.slice(0, n);
  const fadeLen = Math.min(Math.round(0.005 * sr), n);
  for (let k = 0; k < fadeLen; k++) clipped[n - fadeLen + k] = clipped[n - fadeLen + k]! * (1 - k / fadeLen);

  const w = Math.round(0.03 * sr);
  const bed = rms(musicBand, Math.round(t * sr), Math.round(t * sr) + w);
  const ownBand = bandpass(clipped, loHz, hiHz, sr);
  const own = rms(ownBand, onset, onset + w);
  const db = overDb + (rng() * 2 - 1) + (prev[i]! >= 4 || lens[i]! >= 4 ? 2 : 0) + (prev[i]! >= 4 ? 3 : 0);
  const gain = Math.min((bed / own) * Math.pow(10, db / 20), Math.pow(10, -3 / 20));

  const a0 = Math.max(s0, 0);
  const a1 = Math.min(s0 + n, nSamples);
  for (let idx = a0; idx < a1; idx++) {
    const v = clipped[idx - s0]! * gain;
    fxL[idx] = fxL[idx]! + v;
    fxR[idx] = fxR[idx]! + v;
  }
}

const mixed = new Float32Array(nSamples * 2);
let fxPeak = 1e-9;
for (let i = 0; i < nSamples; i++) {
  fxPeak = Math.max(fxPeak, Math.abs(fxL[i]!), Math.abs(fxR[i]!));
  mixed[i * 2] = musicInterleaved[i * 2]! + fxL[i]!;
  mixed[i * 2 + 1] = musicInterleaved[i * 2 + 1]! + fxR[i]!;
}
const written = writeWav16(outFile, mixed, 2, sr);
console.log(JSON.stringify({ variant, cuts: cuts.length, fx_peak_db: Math.round(20 * Math.log10(fxPeak) * 10) / 10, out: written }));
