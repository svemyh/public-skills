// Shared zero-dependency DSP helpers for the video-tools audio scripts:
// radix-2 Cooley-Tukey FFT, zero-phase Butterworth biquad filtering, WAV writer,
// and ffmpeg PCM decode. Runs natively in Bun with no external npm packages.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { $ } from "bun";

export async function decodePcm(file: string, channels: 1 | 2, sr = 48000): Promise<Float32Array> {
  const buf = await $`ffmpeg -v error -i ${file} -map 0:a -ac ${channels} -ar ${sr} -f f32le -`.quiet().arrayBuffer();
  return new Float32Array(buf);
}

export function writeWav16(path: string, interleaved: Float32Array, channels: 1 | 2, sr = 48000) {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  const dataBytes = interleaved.length * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < interleaved.length; i++) {
    const v = Math.max(-0.999, Math.min(0.999, interleaved[i]!));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  writeFileSync(abs, new Uint8Array(out));
  return abs;
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// In-place radix-2 complex FFT (re, im of length N = 2^k). `inverse = true` computes IFFT.
export function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wlenR = Math.cos(ang);
    const wlenI = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wR = 1;
      let wI = 0;
      for (let j = 0; j < half; j++) {
        const uR = re[i + j]!;
        const uI = im[i + j]!;
        const vR = re[i + j + half]! * wR - im[i + j + half]! * wI;
        const vI = re[i + j + half]! * wI + im[i + j + half]! * wR;
        re[i + j] = uR + vR;
        im[i + j] = uI + vI;
        re[i + j + half] = uR - vR;
        im[i + j + half] = uI - vI;
        const nextWR = wR * wlenR - wI * wlenI;
        wI = wR * wlenI + wI * wlenR;
        wR = nextWR;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

function lowpassCoeffs(fc: number, sr: number): Biquad {
  const w0 = (2 * Math.PI * Math.min(fc, sr * 0.48)) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const a0 = 1 + alpha;
  return { b0: (1 - cos) / 2 / a0, b1: (1 - cos) / a0, b2: (1 - cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function highpassCoeffs(fc: number, sr: number): Biquad {
  const w0 = (2 * Math.PI * Math.max(10, fc)) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const a0 = 1 + alpha;
  return { b0: (1 + cos) / 2 / a0, b1: -(1 + cos) / a0, b2: (1 + cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function runBiquad(x: Float32Array, c: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]!;
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return y;
}

// Zero-phase forward-backward filter (matches scipy sosfiltfilt phase = 0).
function filtfilt(x: Float32Array, c: Biquad): Float32Array {
  const fwd = runBiquad(x, c);
  fwd.reverse();
  const rev = runBiquad(fwd, c);
  rev.reverse();
  return rev;
}

export function lowpass(x: Float32Array, fc: number, sr = 48000): Float32Array {
  return filtfilt(x, lowpassCoeffs(fc, sr));
}

export function bandpass(x: Float32Array, loHz: number, hiHz: number, sr = 48000): Float32Array {
  return filtfilt(filtfilt(x, highpassCoeffs(loHz, sr)), lowpassCoeffs(hiHz, sr));
}

export function rms(x: Float32Array, start = 0, end = x.length): number {
  const a = Math.max(0, start);
  const b = Math.min(x.length, end);
  if (b <= a) return 1e-9;
  let sum = 0;
  for (let i = a; i < b; i++) sum += x[i]! * x[i]!;
  return Math.sqrt(sum / (b - a)) + 1e-9;
}

// Deterministic xorshift32 PRNG for reproducible gain jitter and noise synthesis.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
