// Synthesizes a clean minimal-electronic launch soundtrack timed to the exact
// sections of a launch film (mosaic shimmer in, 92 bpm warm sub-pulse + soft
// percussion under feature beats, click chime on the CTA button, arpeggio
// burst on the outro mosaic, warm chord ring-out over the website). Zero API
// keys needed; mastered with ffmpeg to -15 LUFS / -1.5 dBTP.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { $ } from "bun";

export interface CueTimeline {
  durationSec: number;
  beatStartsSec: number[];
  clickSec?: number;
  outroSec: number;
}

export async function renderSynthBed(outM4a: string, cues: CueTimeline): Promise<void> {
  mkdirSync(dirname(outM4a), { recursive: true });
  const sr = 44100;
  const totalSamples = Math.ceil(cues.durationSec * sr);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bpm = 92;
  const spb = 60 / bpm;

  // Warm D-minor9 / Bb-maj7 / F-add9 / C6 progression across 4-beat bars.
  const chords = [
    [146.83, 220.0, 261.63, 329.63, 440.0], // Dm9
    [116.54, 174.61, 220.0, 293.66, 392.0], // Bbmaj7
    [87.31, 174.61, 220.0, 261.63, 392.0],  // Fadd9
    [130.81, 196.0, 246.94, 329.63, 440.0], // Cmaj9
  ];

  // Deterministic PRNG for hi-hat/air noise.
  let seed = 0x51f15eed;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  // 1. Warm stereo pad + gentle rhythmic pulse throughout.
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sr;
    const bar = Math.floor(t / (spb * 4));
    const chord = chords[bar % chords.length]!;
    const barPos = (t % (spb * 4)) / (spb * 4);
    const env = Math.min(1, t / 0.8) * Math.min(1, Math.max(0, (cues.durationSec - t) / 1.6));
    const sidechain = 0.72 + 0.28 * Math.sin(Math.PI * ((t % spb) / spb));
    let l = 0;
    let r = 0;
    for (let k = 0; k < chord.length; k++) {
      const f = chord[k]!;
      const detune = k % 2 === 0 ? 1.0018 : 0.9982;
      const amp = k === 0 ? 0.14 : 0.045 / Math.sqrt(k);
      l += amp * Math.sin(2 * Math.PI * f * t);
      r += amp * Math.sin(2 * Math.PI * f * detune * t + 0.4 * k);
    }
    // Subtle filter-like brightness lift during feature beats, calmer on outro tail.
    const active = t >= (cues.beatStartsSec[0] ?? 3) && t < cues.outroSec + 1.4 ? 1.0 : 0.68;
    const swell = 0.88 + 0.12 * Math.sin(2 * Math.PI * barPos);
    left[i] = (left[i] ?? 0) + (l * env * sidechain * active * swell);
    right[i] = (right[i] ?? 0) + (r * env * sidechain * active * swell);
  }

  // Helper to mix a soft percussive or tonal hit at `atSec`.
  const addNote = (atSec: number, freq: number, dur: number, amp: number, pan = 0) => {
    const i0 = Math.max(0, Math.floor(atSec * sr));
    const n = Math.min(totalSamples - i0, Math.floor(dur * sr));
    const gl = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let j = 0; j < n; j++) {
      const dt = j / sr;
      const e = Math.min(1, dt / 0.006) * Math.exp(-dt / (dur * 0.28));
      const s = (Math.sin(2 * Math.PI * freq * dt) + 0.25 * Math.sin(4 * Math.PI * freq * dt)) * e;
      left[i0 + j] = (left[i0 + j] ?? 0) + (s * gl);
      right[i0 + j] = (right[i0 + j] ?? 0) + (s * gr);
    }
  };

  const addKick = (atSec: number, amp = 0.26) => {
    const i0 = Math.max(0, Math.floor(atSec * sr));
    const n = Math.min(totalSamples - i0, Math.floor(0.22 * sr));
    for (let j = 0; j < n; j++) {
      const dt = j / sr;
      const f = 48 + 95 * Math.exp(-dt * 34);
      const s = Math.sin(2 * Math.PI * f * dt) * Math.exp(-dt * 14) * amp;
      left[i0 + j] = (left[i0 + j] ?? 0) + (s);
      right[i0 + j] = (right[i0 + j] ?? 0) + (s);
    }
  };

  const addTick = (atSec: number, amp = 0.04, decay = 48) => {
    const i0 = Math.max(0, Math.floor(atSec * sr));
    const n = Math.min(totalSamples - i0, Math.floor(0.06 * sr));
    let prev = 0;
    for (let j = 0; j < n; j++) {
      const dt = j / sr;
      const raw = noise();
      const hp = raw - prev;
      prev = raw;
      const s = hp * Math.exp(-dt * decay) * amp;
      left[i0 + j] = (left[i0 + j] ?? 0) + (s * 0.9);
      right[i0 + j] = (right[i0 + j] ?? 0) + (s * 1.1);
    }
  };

  const addWhoosh = (atSec: number, dur = 0.38, amp = 0.055) => {
    const i0 = Math.max(0, Math.floor((atSec - dur * 0.45) * sr));
    const n = Math.min(totalSamples - i0, Math.floor(dur * sr));
    let lp = 0;
    for (let j = 0; j < n; j++) {
      const u = j / Math.max(1, n);
      const env = Math.sin(Math.PI * u) ** 1.8 * amp;
      const alpha = 0.04 + 0.22 * Math.sin(Math.PI * u);
      lp += alpha * (noise() - lp);
      const pan = -0.35 + 0.7 * u;
      left[i0 + j] = (left[i0 + j] ?? 0) + (lp * env * (1 - pan * 0.4));
      right[i0 + j] = (right[i0 + j] ?? 0) + (lp * env * (1 + pan * 0.4));
    }
  };

  // 2. Beat grid from open lockup through outro burst.
  const grooveStart = Math.min(1.0, cues.durationSec * 0.1);
  const grooveEnd = Math.max(grooveStart, cues.outroSec + 0.8);
  for (let beat = 0; beat * spb < grooveEnd; beat++) {
    const bt = grooveStart + beat * spb;
    if (bt >= grooveEnd) break;
    addKick(bt, beat % 2 === 0 ? 0.25 : 0.19);
    addTick(bt + spb * 0.5, 0.038, 52);
    if (beat % 2 === 1) addTick(bt + spb * 0.75, 0.024, 65);
    // Gentle plucked 8th-note arp on feature beats.
    const arpNotes = [587.33, 659.25, 880.0, 659.25];
    if (bt >= (cues.beatStartsSec[0] ?? 3.0) && bt < cues.outroSec) {
      addNote(bt, arpNotes[beat % 4]!, 0.28, 0.042, beat % 2 === 0 ? -0.25 : 0.25);
      addNote(bt + spb * 0.5, arpNotes[(beat + 2) % 4]! * 0.5, 0.22, 0.028, 0.15);
    }
  }

  // 3. Mosaic open shimmer + subtle scene-cut whooshes + CTA click chime + outro burst.
  const openArp = [293.66, 440.0, 523.25, 659.25, 880.0, 1174.66];
  openArp.forEach((f, idx) => addNote(0.05 + idx * 0.12, f, 0.9, 0.055, -0.4 + idx * 0.16));
  for (const s of cues.beatStartsSec) addWhoosh(s, 0.34, 0.05);
  if (cues.clickSec !== undefined) {
    addNote(cues.clickSec, 1046.5, 0.35, 0.075, 0.1);
    addNote(cues.clickSec + 0.05, 1318.5, 0.45, 0.065, -0.1);
  }
  addWhoosh(cues.outroSec + 0.2, 0.7, 0.075);
  openArp.forEach((f, idx) => addNote(cues.outroSec + 0.18 + idx * 0.1, f, 1.4, 0.06, 0.4 - idx * 0.15));

  // Write 16-bit PCM WAV then encode + loudnorm to AAC m4a.
  const wav = outM4a.replace(/\.m4a$/, ".tmp.wav");
  const dataBytes = totalSamples * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  let off = 44;
  for (let i = 0; i < totalSamples; i++) {
    const cl = Math.max(-0.98, Math.min(0.98, left[i]!));
    const cr = Math.max(-0.98, Math.min(0.98, right[i]!));
    buf.writeInt16LE(Math.round(cl * 32767), off);
    buf.writeInt16LE(Math.round(cr * 32767), off + 2);
    off += 4;
  }
  writeFileSync(wav, buf);
  await $`ffmpeg -hide_banner -loglevel error -y -i ${wav} -af "loudnorm=I=-15:TP=-1.5:LRA=9" -c:a aac -b:a 256k ${outM4a}`;
  rmSync(wav, { force: true });
}
