#!/usr/bin/env bun
// Cut a generated music take onto the picture's beat grid at bar lines.
// Finds beat & downbeat phase from low-band kick onsets, aligns a bar downbeat
// onto `--hit-frame` (with a low-pass filter sweep opening into the hit), dips
// slightly under `--end-card-frame`, lands a final downbeat with a decaying
// stereo reverb tail, and masters to -14 LUFS / -1.5 dBTP via `ffmpeg`.
//
// Usage:
//   bun edit.ts <take.wav|mp3|m4a> <out.m4a|wav> --bpm 164 --frames 642 [--fps 30] [--hit-frame 25] [--end-card-frame 488] [--bars 12] [--bar N]
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { $ } from "bun";
import { decodePcm, fft, lowpass, mulberry32, nextPow2, writeWav16 } from "./dsp";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const [srcFile, outFile] = process.argv.slice(2);
const bpm = Number(flag("--bpm") ?? 0);
const frames = Number(flag("--frames") ?? 0);
if (!srcFile || !outFile || !bpm || !frames) {
  console.error("usage: bun edit.ts <take> <out> --bpm <bpm> --frames <frames> [--fps 30] [--hit-frame 25] [--end-card-frame 488] [--bars N] [--bar N]");
  process.exit(1);
}

const fps = Number(flag("--fps") ?? 30);
const hitFrame = Number(flag("--hit-frame") ?? 25);
const endCardFrame = Number(flag("--end-card-frame") ?? 0);
const barsArg = Number(flag("--bars") ?? 0);
const explicitBar = flag("--bar") !== undefined ? Number(flag("--bar")) : undefined;

const sr = 48000;
const interleaved = await decodePcm(srcFile, 2, sr);
const nIn = Math.floor(interleaved.length / 2);
const inL = new Float32Array(nIn);
const inR = new Float32Array(nIn);
const mono = new Float32Array(nIn);
for (let i = 0; i < nIn; i++) {
  inL[i] = interleaved[i * 2]!;
  inR[i] = interleaved[i * 2 + 1]!;
  mono[i] = 0.5 * (inL[i]! + inR[i]!);
}

const beat = 60 / bpm;
const bar = 4 * beat;
const length = frames / fps;
const hitT = hitFrame / fps;
const endCardT = endCardFrame > 0 ? endCardFrame / fps : length * 0.76;
const barsCount = barsArg > 0 ? barsArg : Math.max(2, Math.floor((length - hitT - 2.0) / bar));
const finalT = Math.min(length - 0.4, hitT + barsCount * bar);

// Envelope flux at hop = 256 samples (~5.3 ms) on both full band and 150 Hz kick band.
const hop = 256;
const kickMono = lowpass(mono, 150, sr);
const nHops = Math.max(1, Math.floor(nIn / hop));
const fullEnv = new Float32Array(nHops);
const kickEnv = new Float32Array(nHops);
let prevFull = 0;
let prevKick = 0;
for (let h = 0; h < nHops; h++) {
  let sf = 0, sk = 0;
  const base = h * hop;
  for (let i = 0; i < hop; i++) {
    sf += mono[base + i]! * mono[base + i]!;
    sk += kickMono[base + i]! * kickMono[base + i]!;
  }
  const ef = Math.log1p(Math.sqrt(sf / hop) * 20);
  const ek = Math.sqrt(sk / hop);
  fullEnv[h] = Math.max(0, ef - prevFull);
  kickEnv[h] = Math.max(0, ek - prevKick);
  prevFull = ef;
  prevKick = ek;
}

const maxSec = (nHops * hop) / sr;
function gridEnergy(ph: number, env: Float32Array, step: number): number {
  let sum = 0;
  for (let t = ph; t < maxSec; t += step) {
    const idx = Math.min(env.length - 1, Math.max(0, Math.round((t * sr) / hop)));
    sum += env[idx]!;
  }
  return sum;
}

let bestPhase = 0;
let bestPhaseE = -Infinity;
for (let k = 0; k < 120; k++) {
  const ph = (k / 120) * beat;
  const e = gridEnergy(ph, fullEnv, beat);
  if (e > bestPhaseE) {
    bestPhaseE = e;
    bestPhase = ph;
  }
}

let downBeatIdx = 0;
let bestDownE = -Infinity;
for (let b = 0; b < 4; b++) {
  const e = gridEnergy(bestPhase + b * beat, kickEnv, bar);
  if (e > bestDownE) {
    bestDownE = e;
    downBeatIdx = b;
  }
}
const down = bestPhase + downBeatIdx * beat;
const barTimes: number[] = [];
for (let k = 0; down + k * bar < maxSec; k++) barTimes.push(down + k * bar);
if (!barTimes.length) barTimes.push(0);

const d =
  explicitBar !== undefined
    ? barTimes[Math.min(explicitBar, barTimes.length - 1)]!
    : barTimes.reduce((best, b) => {
        const target = Math.max(hitT + 0.5, 4.0);
        const score = b >= hitT + 0.2 ? Math.abs(b - target) : 999;
        const bestScore = best >= hitT + 0.2 ? Math.abs(best - target) : 999;
        return score < bestScore ? b : best;
      }, barTimes[0]!);

function sliceChannel(ch: Float32Array, startS: number, durS: number): Float32Array {
  const a0 = Math.round(startS * sr);
  const n = Math.round(durS * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const srcIdx = a0 + i;
    if (srcIdx >= 0 && srcIdx < ch.length) out[i] = ch[srcIdx]!;
  }
  return out;
}

const nOut = Math.round(length * sr);
const outL = new Float32Array(nOut);
const outR = new Float32Array(nOut);

const bodyL = sliceChannel(inL, d - hitT, finalT);
const bodyR = sliceChannel(inR, d - hitT, finalT);
const lowL = lowpass(bodyL, 380, sr);
const lowR = lowpass(bodyR, 380, sr);

function interp(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]!) return ys[0]!;
  for (let i = 0; i < xs.length - 1; i++) {
    if (x <= xs[i + 1]!) {
      const t = (x - xs[i]!) / Math.max(1e-6, xs[i + 1]! - xs[i]!);
      return ys[i]! + t * (ys[i + 1]! - ys[i]!);
    }
  }
  return ys[ys.length - 1]!;
}

const bodyLen = Math.min(nOut, bodyL.length);
for (let i = 0; i < bodyLen; i++) {
  const tt = i / sr;
  let mix = Math.max(0, Math.min(1, (tt - Math.max(0, hitT - 0.35)) / 0.35));
  let gainDb = interp(tt, [0, Math.max(0.01, hitT - 0.35), Math.max(0.02, hitT)], [-14, -8, 0]);
  if (endCardT < finalT - 0.3 && tt >= endCardT) {
    mix = interp(tt, [endCardT, endCardT + 0.25, Math.max(endCardT + 0.26, finalT - bar), finalT], [1, 0, 0, 1]);
    gainDb = interp(tt, [endCardT, endCardT + 0.25, Math.max(endCardT + 0.26, finalT - bar), finalT], [0, -5, -5, 0]);
  }
  const g = Math.pow(10, gainDb / 20);
  outL[i] = (bodyL[i]! * mix + lowL[i]! * (1 - mix)) * g;
  outR[i] = (bodyR[i]! * mix + lowR[i]! * (1 - mix)) * g;
}

// Final downbeat + decaying stereo reverb tail.
const hitL = sliceChannel(inL, d + barsCount * bar, beat);
const hitR = sliceChannel(inR, d + barsCount * bar, beat);
const fadeN = Math.min(hitL.length, Math.round(0.04 * sr));
for (let i = 0; i < fadeN; i++) {
  const f = 1 - i / fadeN;
  hitL[hitL.length - fadeN + i] = hitL[hitL.length - fadeN + i]! * f;
  hitR[hitR.length - fadeN + i] = hitR[hitR.length - fadeN + i]! * f;
}

const rng = mulberry32(7);
const irLen = Math.round(2.6 * sr);
let irL: Float32Array = new Float32Array(irLen);
let irR: Float32Array = new Float32Array(irLen);
for (let i = 0; i < irLen; i++) {
  const dec = Math.exp(-i / sr / 0.85);
  irL[i] = (rng() * 2 - 1) * dec;
  irR[i] = (rng() * 2 - 1) * dec;
}
irL = lowpass(irL, 6000, sr);
irR = lowpass(irR, 6000, sr);

function convolve(a: Float32Array, b: Float32Array): Float32Array {
  const len = a.length + b.length - 1;
  const n = nextPow2(len);
  const ar = new Float64Array(n), ai = new Float64Array(n);
  const br = new Float64Array(n), bi = new Float64Array(n);
  for (let i = 0; i < a.length; i++) ar[i] = a[i]!;
  for (let i = 0; i < b.length; i++) br[i] = b[i]!;
  fft(ar, ai, false);
  fft(br, bi, false);
  for (let i = 0; i < n; i++) {
    const r = ar[i]! * br[i]! - ai[i]! * bi[i]!;
    const im = ar[i]! * bi[i]! + ai[i]! * br[i]!;
    ar[i] = r;
    ai[i] = im;
  }
  fft(ar, ai, true);
  const res = new Float32Array(len);
  for (let i = 0; i < len; i++) res[i] = ar[i]!;
  return res;
}

const wetL = convolve(hitL, irL);
const wetR = convolve(hitR, irR);
let hitE = 1e-9, wetE = 1e-9;
for (let i = 0; i < hitL.length; i++) hitE += hitL[i]! * hitL[i]! + hitR[i]! * hitR[i]!;
for (let i = 0; i < wetL.length; i++) wetE += wetL[i]! * wetL[i]! + wetR[i]! * wetR[i]!;
const wetGain = Math.sqrt(hitE / wetE) * 1.4;
const i0 = Math.round(finalT * sr);
for (let i = 0; i < wetL.length && i0 + i < nOut; i++) {
  outL[i0 + i] = outL[i0 + i]! + wetL[i]! * wetGain + (i < hitL.length ? hitL[i]! : 0);
  outR[i0 + i] = outR[i0 + i]! + wetR[i]! * wetGain + (i < hitR.length ? hitR[i]! : 0);
}

let peak = 1e-9;
for (let i = 0; i < nOut; i++) peak = Math.max(peak, Math.abs(outL[i]!), Math.abs(outR[i]!));
const norm = Math.max(1, peak * 1.05);
const outInterleaved = new Float32Array(nOut * 2);
for (let i = 0; i < nOut; i++) {
  outInterleaved[i * 2] = outL[i]! / norm;
  outInterleaved[i * 2 + 1] = outR[i]! / norm;
}

const tmpWav = join(tmpdir(), `vrea-music-edit-${process.pid}-${Date.now()}.wav`);
writeWav16(tmpWav, outInterleaved, 2, sr);
const absOut = resolve(outFile);
mkdirSync(dirname(absOut), { recursive: true });
try {
  await $`ffmpeg -v error -y -i ${tmpWav} -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 ${absOut}`.quiet();
} finally {
  rmSync(tmpWav, { force: true });
}

console.log(JSON.stringify({ bpm, downbeat_s: +d.toFixed(3), hit_s: +hitT.toFixed(3), final_hit_s: +finalT.toFixed(3), bars: barsCount, out: absOut }));
