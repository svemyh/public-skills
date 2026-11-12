#!/usr/bin/env bun
// Verify that per-cut sound effects line up with visible picture changes, and
// measure any audio/video mux offset via FFT cross-correlation.
//
// Usage:
//   bun check-sync.ts <picture.mp4> --spec <spec.json> [--changes changes.json] [--mix mix.wav --muxed muxed.mp4]
//   bun check-sync.ts <picture.mp4> --cuts cuts.json [--threshold 6.0]
import { $ } from "bun";
import { decodePcm, fft, nextPow2 } from "./dsp";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const picture = process.argv[2];
if (!picture || picture.startsWith("--")) {
  console.error("usage: bun check-sync.ts <picture.mp4> [--spec spec.json | --cuts cuts.json] [--changes changes.json] [--mix mix.wav --muxed muxed.mp4]");
  process.exit(1);
}

const sounded = new Set<number>();
if (flag("--spec")) {
  const spec = await Bun.file(flag("--spec")!).json();
  for (const s of spec.scenes ?? []) if (Number(s.from) > 0) sounded.add(Number(s.from));
}
if (flag("--cuts")) {
  for (const c of await Bun.file(flag("--cuts")!).json()) sounded.add(Number(c));
}
if (flag("--changes")) {
  for (const c of await Bun.file(flag("--changes")!).json()) sounded.add(Number(c));
}

const threshold = Number(flag("--threshold") ?? 6.0);
const w = 160;
const h = 90;
const raw = new Uint8Array(await $`ffmpeg -v error -i ${picture} -vf ${`scale=${w}:${h},format=gray`} -f rawvideo -`.quiet().arrayBuffer());
const frameBytes = w * h;
const frames = Math.floor(raw.length / frameBytes);
const diffs: number[] = [];
const changes: number[] = [];

for (let f = 1; f < frames; f++) {
  let sum = 0;
  const curOff = f * frameBytes;
  const prevOff = (f - 1) * frameBytes;
  for (let i = 0; i < frameBytes; i++) sum += Math.abs(raw[curOff + i]! - raw[prevOff + i]!);
  const diff = sum / frameBytes;
  diffs.push(diff);
  if (diff > threshold) changes.push(f);
}

const report: Record<string, unknown> = {
  frames,
  sounds: sounded.size,
  changes: changes.length,
  unsounded_changes: changes.filter((c) => !sounded.has(c)).map((c) => [c, Math.round(diffs[c - 1]! * 10) / 10]),
  sounds_on_still_frames: [...sounded]
    .sort((a, b) => a - b)
    .filter((c) => c > 0 && c < frames && diffs[c - 1]! < threshold)
    .map((c) => [c, Math.round(diffs[c - 1]! * 10) / 10]),
};

const mixPath = flag("--mix");
const muxedPath = flag("--muxed");
if (mixPath && muxedPath) {
  const sr = 48000;
  const muxA = await decodePcm(muxedPath, 1, sr);
  const mixA = await decodePcm(mixPath, 1, sr);
  const n = Math.min(muxA.length, mixA.length, sr * 12);
  const fftLen = nextPow2(2 * n);
  const reA = new Float64Array(fftLen);
  const imA = new Float64Array(fftLen);
  const reB = new Float64Array(fftLen);
  const imB = new Float64Array(fftLen);
  for (let i = 0; i < n; i++) {
    reA[i] = muxA[i]!;
    reB[i] = mixA[i]!;
  }
  fft(reA, imA, false);
  fft(reB, imB, false);
  for (let i = 0; i < fftLen; i++) {
    const ar = reA[i]!, ai = imA[i]!, br = reB[i]!, bi = imB[i]!;
    reA[i] = ar * br + ai * bi;
    imA[i] = ai * br - ar * bi;
  }
  fft(reA, imA, true);
  let bestIdx = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < fftLen; i++) {
    if (reA[i]! > bestVal) {
      bestVal = reA[i]!;
      bestIdx = i;
    }
  }
  const lag = bestIdx < n ? bestIdx : bestIdx - fftLen;
  report.mux_offset_ms = Math.round((lag * 1000 * 10) / sr) / 10;
}

console.log(JSON.stringify(report, null, 2));
