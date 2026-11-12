import { existsSync, statSync } from "node:fs";
import { $ } from "bun";
import { join } from "node:path";
import { z } from "zod";
import type { EditSpec, Sound } from "../spec/schema";
import { sectionsOf } from "../spec/schema";
import { compose, durationFrames, searchVoices, soundEffect, speak, type MusicChunk } from "./eleven";
import { writeVariant } from "./assets";
import { ensureDir, fail, Project, rel, type Args } from "./project";

// A variant's sound design, in variants/<name>/sound.json.
export const SoundPlan = z.object({
  // keep: the original bed; replace: new music aligned to the sections;
  // none: no bed. `keep` is refused when the original speech names the old
  // brand or says words this variant changed.
  audio: z.enum(["keep", "replace", "none"]),
  music: z
    .object({
      // Styles for the whole piece, then per section id.
      styles: z.array(z.string()),
      negative: z.array(z.string()).default([]),
      sections: z.record(z.string(), z.array(z.string())).default({}),
      volume: z.number().default(0.8),
    })
    .optional(),
  // How far the bed drops under voice-over (1 = no ducking).
  duck: z.number().min(0).max(1).default(0.45),
  voice: z.object({ id: z.string(), owner: z.string().optional(), name: z.string().optional(), model: z.string().optional(), settings: z.record(z.string(), z.unknown()).optional() }).optional(),
  // Lines at absolute frames; `slot: n` puts a line where the original's
  // n-th spoken phrase started (see analysis/transcript.json).
  vo: z.array(z.object({ text: z.string(), at: z.number().int().optional(), slot: z.number().int().optional(), volume: z.number().default(1) })).default([]),
  sfx: z.array(z.object({ text: z.string(), at: z.number().int(), seconds: z.number().optional(), volume: z.number().default(0.7) })).default([]),
});
export type SoundPlan = z.infer<typeof SoundPlan>;

type Transcript = { text: string; words?: { text: string; from: number; to: number }[] };

// vrea sound <slug> --variant <name> [--dry-run]
// vrea sound voices <query> [--gender female]
export async function sound(args: Args) {
  if (args.positional[0] === "voices") {
    const voices = await searchVoices(args.positional.slice(1).join(" "), args.str("gender") ? { gender: args.str("gender")! } : {});
    for (const v of voices) console.log(`${v.voice_id}  owner ${v.public_owner_id.slice(0, 12)}…  ${v.name} (${v.gender}/${v.age}/${v.accent}, used ${v.cloned_by_count})\n    ${v.description.slice(0, 110)}`);
    return;
  }
  const project = new Project(args.positional[0] ?? "");
  const name = args.str("variant") ?? fail("--variant <name> is required");
  const planPath = project.path("variants", name, "sound.json");
  if (!existsSync(planPath)) fail(`no sound plan at ${rel(planPath)}`);
  const plan = SoundPlan.parse(await Bun.file(planPath).json());
  const original = await project.spec();
  const spec = await project.spec(name);
  const transcript = await readTranscript(project);
  const fps = spec.meta.fps;

  const problems = audioConflicts(original, spec, transcript);
  if (plan.audio === "keep" && problems.length) {
    fail(`the original soundtrack can't stay: ${problems.join("; ")}. Set "audio": "replace" (or "none") in ${rel(planPath)}.`);
  }
  const phrases = phraseStarts(transcript);
  const lines = plan.vo.map((l) => {
    const at = l.at ?? (l.slot !== undefined ? phrases[l.slot] : undefined);
    if (at === undefined) fail(`vo "${l.text}": give "at" (frame) or a "slot" between 0 and ${phrases.length - 1}`);
    return { ...l, at };
  });
  const chunks = plan.audio === "replace" ? musicChunks(spec, plan) : [];
  if (args.bool("dry-run")) {
    console.log(JSON.stringify({ audio: plan.audio, conflicts: problems, phrases, chunks: chunks.map((c) => ({ ms: c.duration_ms, styles: c.positive_styles })), vo: lines.map((l) => [l.at, l.text]), sfx: plan.sfx.map((s) => [s.at, s.text]) }, null, 2));
    return;
  }

  const dir = `sound/${name}`;
  const abs = ensureDir(join(project.media, dir));
  const sounds: Sound[] = [];
  if (plan.audio === "replace") {
    if (!plan.music) fail(`"audio": "replace" needs "music"`);
    await compose(chunks, join(abs, "music.mp3"));
    // Level the score to the original's loudness, so compose can cut between
    // variants (and the kept original) without jumps in volume.
    const original = join(project.media, "audio", "source.m4a");
    const target = existsSync(original) ? await loudness(original) : -14;
    await leveled(join(abs, "music.mp3"), join(abs, "music.leveled.mp3"), target);
    spec.audio = { src: `${dir}/music.leveled.mp3`, volume: plan.music.volume, trimBefore: 0, duck: plan.duck };
    console.log(`music: ${chunks.length} chunks, edges at frames ${edges(spec, chunks).join(", ")}`);
  } else if (plan.audio === "none") {
    spec.audio = undefined;
  } else if (spec.audio) {
    spec.audio = { ...spec.audio, duck: plan.duck };
  }

  if (lines.length && !plan.voice) fail(`"vo" lines need a "voice"`);
  await Promise.all(
    lines.map(async (l, i) => {
      const file = await speak(plan.voice!, l.text, join(abs, `vo-${i + 1}.mp3`));
      sounds.push({ kind: "vo", src: `${dir}/vo-${i + 1}.mp3`, from: l.at, duration: await durationFrames(file, fps), trimBefore: 0, volume: l.volume, text: l.text });
    }),
  );
  await Promise.all(
    plan.sfx.map(async (s, i) => {
      const file = await soundEffect(s.text, s.seconds, join(abs, `sfx-${i + 1}.mp3`));
      sounds.push({ kind: "sfx", src: `${dir}/sfx-${i + 1}.mp3`, from: s.at, duration: await durationFrames(file, fps), trimBefore: 0, volume: s.volume, text: s.text });
    }),
  );
  sounds.sort((a, b) => a.from - b.from);
  const end = spec.meta.durationInFrames;
  for (const s of sounds) if (s.from + (s.duration ?? 0) > end) s.duration = Math.max(1, end - s.from);
  const vos = sounds.filter((s) => s.kind === "vo");
  vos.forEach((v, i) => {
    const next = vos[i + 1];
    if (next && v.from + (v.duration ?? 0) > next.from) console.log(`warning: vo "${v.text}" runs ${v.from + v.duration! - next.from} frames into "${next.text}"`);
  });
  spec.sounds = sounds;
  const file = await writeVariant(project, name, spec);
  console.log(`wrote ${rel(file)}: bed ${spec.audio ? rel(join(project.media, spec.audio.src)) : "none"}, ${vos.length} vo, ${sounds.length - vos.length} sfx`);
}

async function readTranscript(project: Project): Promise<Transcript | undefined> {
  const file = project.path("analysis", "transcript.json");
  return existsSync(file) ? ((await Bun.file(file).json()) as Transcript) : undefined;
}

// Why the original bed can't play under this variant: its speech names the
// old brand, or says on-screen words the variant replaced.
export function audioConflicts(original: EditSpec, variant: EditSpec, transcript: Transcript | undefined): string[] {
  if (!transcript?.text.trim()) return [];
  const said = norm(transcript.text);
  const out: string[] = [];
  if (norm(original.brand.name) !== norm(variant.brand.name)) {
    for (const n of [original.brand.name, original.brand.wordmark]) {
      const word = norm(n).split(" ")[0]!;
      // Whole words only: "le" (Le Chat) is not said by "[outro jingle]".
      if (word && ` ${said} `.includes(` ${word} `)) out.push(`it says "${n}"`);
    }
  }
  const before = new Set(texts(original).map(norm));
  const after = new Set(texts(variant).map(norm));
  for (const t of before) if (t.length > 3 && !after.has(t) && said.includes(t)) out.push(`it says "${t}", which this variant changed`);
  return [...new Set(out)];
}

function texts(spec: EditSpec): string[] {
  return [...spec.scenes.flatMap((s) => s.layers), ...spec.overlays.map((o) => o.layer)].flatMap((l) => (l.kind === "text" ? [l.text] : []));
}

function norm(s: string) {
  return s.toLowerCase().replace(/\.ai\b/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Frames where each spoken phrase starts: a word after a pause of 8+ frames
// or after a full stop opens a new phrase.
export function phraseStarts(transcript: Transcript | undefined): number[] {
  const words = transcript?.words ?? [];
  const out: number[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (!prev || w.from - prev.to >= 8 || /[.!?]$/.test(prev.text)) out.push(w.from);
  });
  return out;
}

// One music chunk per section, merging neighbors until each lasts at least
// 3 s (the API minimum). Chunk edges are frame-exact section boundaries, so
// the music turns where the edit cuts.
export function musicChunks(spec: EditSpec, plan: SoundPlan): MusicChunk[] {
  const fps = spec.meta.fps;
  const ms = (f: number) => Math.round((f * 1000) / fps);
  const groups: { ids: string[]; from: number; to: number }[] = [];
  for (const s of sectionsOf(spec)) {
    const last = groups[groups.length - 1];
    if (last && ms(last.to) - ms(last.from) < 3000) {
      last.ids.push(s.id);
      last.to = s.from + s.duration;
    } else groups.push({ ids: [s.id], from: s.from, to: s.from + s.duration });
  }
  const tail = groups[groups.length - 1]!;
  if (groups.length > 1 && ms(tail.to) - ms(tail.from) < 3000) {
    const prev = groups[groups.length - 2]!;
    prev.ids.push(...tail.ids);
    prev.to = tail.to;
    groups.pop();
  }
  const music = plan.music!;
  return groups.map((g, i) => ({
    duration_ms: ms(g.to) - ms(g.from),
    positive_styles: [...(i === 0 ? music.styles : music.styles.slice(0, 2)), ...g.ids.flatMap((id) => music.sections[id] ?? [])],
    negative_styles: ["vocals", "singing", "lyrics", ...music.negative],
  }));
}

function edges(spec: EditSpec, chunks: MusicChunk[]) {
  let t = 0;
  return chunks.map((c) => {
    t += c.duration_ms;
    return Math.round((t * spec.meta.fps) / 1000);
  });
}

// Integrated loudness in LUFS.
async function loudness(file: string): Promise<number> {
  const run = await $`ffmpeg -hide_banner -nostats -i ${file} -af ebur128 -f null -`.quiet().nothrow();
  const m = [...run.stderr.toString().matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return m ? Number(m[1]) : -14;
}

// A copy of `src` at `lufs`, remade only when the source is newer.
async function leveled(src: string, out: string, lufs: number) {
  if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) return;
  await $`ffmpeg -hide_banner -loglevel error -y -i ${src} -af ${`loudnorm=I=${lufs.toFixed(1)}:TP=-1.5:LRA=11`} -ar 44100 -b:a 192k ${out}`.quiet();
}
