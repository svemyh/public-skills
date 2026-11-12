import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { ensureDir, Project, rel, writeJson, type Args } from "./project";
import { elevenKey, transcribeWords } from "./eleven";
import { transcribe } from "./fal";

const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
  "C:/Windows/Fonts/arial.ttf",
];

export const LABEL_FONT = FONT_CANDIDATES.find((f) => existsSync(f));
export const labelFontArgs = () => (LABEL_FONT ? ["-font", LABEL_FONT] : []);

export type Shot = {
  id: string;
  start: number; // first frame (inclusive)
  end: number; // last frame (exclusive)
  frames: number;
  t0: number;
  t1: number;
  cutScore: number; // scene score of the cut that opens this shot
  keyframe: string; // analysis-relative path of the middle frame
};

// vrea analyze <slug> [--threshold 0.3] [--min-shot 2] [--step N] [--transcribe]
// Produces the evidence an agent needs to write the edit spec: frame-exact
// cuts, one keyframe per shot, labeled contact sheets of every Nth frame,
// audio energy/onsets/tempo, and optionally a transcript.
export async function analyze(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const info = await project.info();
  const dir = ensureDir(project.analysis);
  const fps = Math.round(info.fps);

  const scores = await sceneScores(project.source);
  await writeJson(join(dir, "scores.json"), { fps, scores: scores.map((s) => Math.round(s * 1000) / 1000) });

  const threshold = args.num("threshold", 0.3);
  const minShot = args.num("min-shot", 2);
  const cuts = detectCuts(scores, threshold, minShot);
  const shots: Shot[] = cuts.map((start, i) => {
    const end = cuts[i + 1] ?? scores.length;
    const id = `s${String(i + 1).padStart(2, "0")}`;
    return {
      id,
      start,
      end,
      frames: end - start,
      t0: +(start / fps).toFixed(3),
      t1: +(end / fps).toFixed(3),
      cutScore: Math.round((scores[start] ?? 0) * 1000) / 1000,
      keyframe: `shots/${id}.png`,
    };
  });

  await keyframes(project.source, shots, ensureDir(join(dir, "shots")));
  await shotSheet(shots, dir);
  const step = args.num("step", info.frames > 600 ? Math.ceil(info.frames / 300) : 2);
  const sheets = await contactSheets(project.source, step, ensureDir(join(dir, "sheets")));
  await writeJson(join(dir, "shots.json"), { fps, threshold, minShot, frames: scores.length, shots });
  const beats = await frameBeats(project.source, args.num("beat-threshold", 0.08));
  await writeJson(join(dir, "beats.json"), beats);

  let audioSummary = "no audio track";
  if (info.hasAudio) {
    const audio = await analyzeAudio(project.source, fps, scores.length);
    await writeJson(join(dir, "audio.json"), audio);
    audioSummary = `~${audio.bpm} bpm, ${audio.onsets.length} onsets`;
  }

  // Word timings (ElevenLabs, when a key is set) mark where speech sits, so
  // a replacement voice-over can land on the same frames.
  if (args.bool("transcribe") && info.hasAudio) {
    const audioFile = project.path("media", "audio", "source.m4a");
    const transcript = (await elevenKey(true)) ? await transcribeWords(audioFile, fps) : await transcribe(audioFile);
    await writeJson(join(dir, "transcript.json"), transcript);
  }

  await Bun.write(join(dir, "report.md"), report(info.slug, fps, shots, step, sheets, audioSummary));
  console.log(`${shots.length} shots, ${sheets.length} contact sheets, audio: ${audioSummary}`);
  console.log(`read ${rel(join(dir, "report.md"))}, then the sheets, then write spec.json (vrea scaffold ${info.slug} drafts one)`);
}

// Per-frame scene-change score (0..1) from ffmpeg's scene detector.
async function sceneScores(source: string): Promise<number[]> {
  const out = await $`ffmpeg -hide_banner -nostats -i ${source} -an -vf ${"select='gte(scene,0)',metadata=print:file=-"} -f null -`
    .quiet()
    .text();
  const scores: number[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/lavfi\.scene_score=([\d.]+)/);
    if (m) scores.push(Number(m[1]));
  }
  return scores;
}

// A cut opens a shot when the score clears the threshold and is the local
// peak, so a two-frame dissolve yields one cut rather than two.
export function detectCuts(scores: number[], threshold: number, minShot: number): number[] {
  const cuts = [0];
  for (let i = 1; i < scores.length; i++) {
    const s = scores[i]!;
    if (s < threshold) continue;
    if (s < (scores[i - 1] ?? 0) || s < (scores[i + 1] ?? 0)) continue;
    const last = cuts[cuts.length - 1]!;
    if (i - last < minShot) {
      if (s > (scores[last] ?? 0) && last !== 0) cuts[cuts.length - 1] = i;
      continue;
    }
    cuts.push(i);
  }
  return cuts;
}

async function keyframes(source: string, shots: Shot[], outDir: string) {
  const mids = shots.map((s) => Math.floor((s.start + s.end - 1) / 2));
  // In batches: fast edits have hundreds of shots, and one long select
  // expression exhausts ffmpeg's parser.
  for (let b = 0; b < mids.length; b += 30) {
    const tmp = ensureDir(join(outDir, ".tmp"));
    const select = mids.slice(b, b + 30).map((n) => `eq(n\\,${n})`).join("+");
    await $`ffmpeg -hide_banner -loglevel error -y -i ${source} -vf ${`select='${select}',scale=640:-2`} -fps_mode passthrough ${tmp + "/k_%04d.png"}`;
    const files = readdirSync(tmp).sort();
    files.forEach((f, i) => shots[b + i] && renameSync(join(tmp, f), join(outDir, `${shots[b + i]!.id}.png`)));
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function shotSheet(shots: Shot[], dir: string) {
  const font = labelFontArgs();
  const args = shots.flatMap((s) => ["-label", `${s.id}  f${s.start}-${s.end - 1}  (${s.frames}f)`, join(dir, s.keyframe)]);
  await $`magick montage ${font} -pointsize 14 -fill white -background ${"#111"} ${args} -tile 6x -geometry 320x180+3+3 ${join(dir, "shots.png")}`.quiet();
}

// Every `step`-th frame, labeled with its frame number, 36 per sheet.
async function contactSheets(source: string, step: number, outDir: string): Promise<string[]> {
  const font = labelFontArgs();
  const tmp = ensureDir(join(outDir, ".tmp"));
  await $`ffmpeg -hide_banner -loglevel error -y -i ${source} -vf ${`select='not(mod(n\\,${step}))',scale=320:-2`} -fps_mode passthrough ${tmp + "/%06d.png"}`;
  const files = readdirSync(tmp).sort();
  const sheets: string[] = [];
  for (let i = 0; i < files.length; i += 36) {
    const page = files.slice(i, i + 36);
    const args = page.flatMap((f, j) => ["-label", `f${(i + j) * step}`, join(tmp, f)]);
    const name = `sheet_${String(sheets.length + 1).padStart(2, "0")}.png`;
    await $`magick montage ${font} -pointsize 13 -fill white -background ${"#111"} ${args} -tile 6x6 -geometry +2+2 ${join(outDir, name)}`.quiet();
    sheets.push(`sheets/${name}`);
  }
  rmSync(tmp, { recursive: true, force: true });
  return sheets;
}

// Per-video-frame loudness, onset envelope, onset frames and a tempo guess.
// Cuts in edits like these usually land on onsets, so variants can re-time
// scenes to them.
async function analyzeAudio(source: string, fps: number, frames: number) {
  const rate = 22050;
  const pcm = await $`ffmpeg -hide_banner -loglevel error -i ${source} -vn -ac 1 -ar ${rate} -f s16le -`.quiet().arrayBuffer();
  const samples = new Int16Array(pcm);
  const per = rate / fps;
  const rms: number[] = [];
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const a = Math.floor(f * per);
    const b = Math.min(samples.length, Math.floor((f + 1) * per));
    for (let i = a; i < b; i++) sum += (samples[i]! / 32768) ** 2;
    rms.push(b > a ? Math.sqrt(sum / (b - a)) : 0);
  }
  const log = rms.map((r) => Math.log10(r + 1e-4));
  const flux = log.map((v, i) => Math.max(0, v - (log[i - 1] ?? v)));
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const std = Math.sqrt(flux.reduce((a, b) => a + (b - mean) ** 2, 0) / flux.length);
  const onsets: number[] = [];
  flux.forEach((v, i) => {
    if (v < mean + 1.2 * std) return;
    for (let k = -3; k <= 3; k++) if (k && (flux[i + k] ?? 0) > v) return;
    onsets.push(i);
  });
  // Tempo: autocorrelation of the onset envelope between 70 and 180 bpm.
  let best = { lag: 0, value: -Infinity };
  const minLag = Math.round((fps * 60) / 180);
  const maxLag = Math.round((fps * 60) / 70);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let v = 0;
    for (let i = lag; i < flux.length; i++) v += flux[i]! * flux[i - lag]!;
    if (v > best.value) best = { lag, value: v };
  }
  const bpm = best.lag ? Math.round((fps * 60) / best.lag) : 0;
  return {
    fps,
    bpm,
    beatPeriodFrames: best.lag,
    onsets,
    rms: rms.map((r) => Math.round(r * 1000) / 1000),
  };
}

function report(slug: string, fps: number, shots: Shot[], step: number, sheets: string[], audio: string) {
  const rows = shots
    .map((s) => `| ${s.id} | ${s.start} | ${s.end - 1} | ${s.frames} | ${s.t0.toFixed(2)}s | ${s.cutScore} | ${s.keyframe} |`)
    .join("\n");
  return `# Analysis: ${slug}

${shots.length} shots at ${fps} fps. Audio: ${audio}.

- \`shots.png\`: one labeled keyframe per shot, in order.
- \`sheets/\`: every ${step}th frame, labeled \`f<frame>\` (${sheets.length} sheets). Use these to find
  motion-graphics boundaries, which cut detection misses (dissolves, builds, text on/off).
- \`scores.json\`: per-frame scene score; low peaks between shots are soft transitions.
- \`audio.json\`: per-frame RMS, onset frames, tempo.

Cut detection is evidence, not truth: confirm every boundary on the sheets before writing scenes.

| shot | start | last | frames | time | cut score | keyframe |
|---|---|---|---|---|---|---|
${rows}
`;
}

// Frame-exact beats for fast edits: the mean absolute difference between
// consecutive frames (96x54, 0..1); every frame above `threshold` starts a
// new beat. ffmpeg's scene score smooths over 1-2 frame cuts, this does not.
// Returns [startFrame, length] pairs covering the whole video.
export async function frameBeats(source: string, threshold: number): Promise<[number, number][]> {
  const W = 96;
  const H = 54;
  const raw = new Uint8Array(await $`ffmpeg -hide_banner -loglevel error -i ${source} -vf ${`scale=${W}:${H},format=gray`} -f rawvideo -`.quiet().arrayBuffer());
  const size = W * H;
  const n = Math.floor(raw.length / size);
  const starts = [0];
  for (let f = 1; f < n; f++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Math.abs(raw[f * size + i]! - raw[(f - 1) * size + i]!);
    if (sum / size / 255 > threshold) starts.push(f);
  }
  return starts.map((f, i) => [f, (starts[i + 1] ?? n) - f]);
}
