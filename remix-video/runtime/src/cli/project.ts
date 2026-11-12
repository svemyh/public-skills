// Project layout. Everything a render references lives under media/, which is
// the Remotion public dir, so asset `src` values are paths relative to media/.
//
// By default projects live under `<caller cwd>/projects/<slug>/` (override with
// `VREA_PROJECTS_DIR` or pass a path containing `/` as `<slug>`). Meanwhile
// `RUNTIME_ROOT` always points at the skill's bundled Remotion runtime.
//
//   projects/<slug>/
//     project.json          probe of the source (fps, size, frames, url)
//     source/source.mp4     the original, untouched
//     analysis/             shots.json, scores.json, audio.json, sheets/, shots/
//     media/                source cuts, crops, generated and brand files
//     spec.json             the clone's edit spec
//     variants/<name>/      plan.json, brand.json, spec.json for derived edits
//     renders/              rendered mp4s and comparison output
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { $ } from "bun";
import { parseSpec, type EditSpec } from "../spec/schema";

export const RUNTIME_ROOT = resolve(import.meta.dir, "../..");
export const WORK_ROOT = resolve(process.env.VREA_WORKDIR ?? process.cwd());
export const REMOTION_BIN = join(RUNTIME_ROOT, "node_modules", ".bin", "remotion");
// Alias kept for compatibility with callers importing ROOT for runtime cwd.
export const ROOT = RUNTIME_ROOT;

export function projectsRoot() {
  return resolve(WORK_ROOT, process.env.VREA_PROJECTS_DIR ?? "projects");
}

export function resolveBrandKit(kitArg: string): string {
  const inWork = resolve(WORK_ROOT, kitArg);
  if (existsSync(inWork)) return inWork;
  const inRuntime = resolve(RUNTIME_ROOT, kitArg);
  if (existsSync(inRuntime)) return inRuntime;
  return inWork;
}

export type ProjectInfo = {
  slug: string;
  sourceUrl?: string;
  fps: number;
  width: number;
  height: number;
  frames: number;
  duration: number;
  hasAudio: boolean;
};

export class Project {
  readonly slug: string;
  readonly dir: string;
  readonly rawArg: string;
  constructor(slugOrPath: string) {
    if (!slugOrPath.trim()) fail("missing <slug>");
    this.rawArg = slugOrPath;
    if (isAbsolute(slugOrPath) || slugOrPath.includes("/") || slugOrPath.startsWith(".")) {
      this.dir = resolve(WORK_ROOT, slugOrPath);
      this.slug = basename(this.dir);
    } else {
      this.slug = slugOrPath;
      this.dir = join(projectsRoot(), slugOrPath);
    }
  }
  path(...parts: string[]) {
    return join(this.dir, ...parts);
  }
  get source() {
    return this.path("source", "source.mp4");
  }
  get media() {
    return this.path("media");
  }
  get analysis() {
    return this.path("analysis");
  }
  specPath(variant?: string) {
    return variant ? this.path("variants", variant, "spec.json") : this.path("spec.json");
  }
  async info(): Promise<ProjectInfo> {
    const file = this.path("project.json");
    if (!existsSync(file)) fail(`No project "${this.slug}" at ${rel(this.dir)}. Run: vrea ingest <url|file> --project ${this.rawArg}`);
    return Bun.file(file).json();
  }
  async spec(variant?: string): Promise<EditSpec> {
    const file = this.specPath(variant);
    if (!existsSync(file)) fail(`Missing ${rel(file)}`);
    return parseSpec(await Bun.file(file).json());
  }
  async writeSpec(spec: EditSpec, variant?: string) {
    const file = this.specPath(variant);
    parseSpec(spec);
    await writeJson(file, spec);
    return file;
  }
}

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function writeJson(file: string, value: unknown) {
  ensureDir(dirname(file));
  await Bun.write(file, JSON.stringify(value, null, 2) + "\n");
}

export function rel(file: string) {
  if (file.startsWith(WORK_ROOT + "/")) return file.slice(WORK_ROOT.length + 1);
  if (file.startsWith(RUNTIME_ROOT + "/")) return file.slice(RUNTIME_ROOT.length + 1);
  return file;
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

export async function probe(file: string) {
  const out = await $`ffprobe -v error -print_format json -show_streams -show_format ${file}`.quiet().json();
  const video = out.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  if (!video) fail(`${file} has no video stream`);
  const [num = 0, den = 1] = String(video.avg_frame_rate || video.r_frame_rate).split("/").map(Number);
  const fps = den ? num / den : num;
  const duration = Number(video.duration ?? out.format.duration);
  const frames = Number(video.nb_frames) || Math.round(duration * fps);
  return {
    fps,
    width: Number(video.width),
    height: Number(video.height),
    frames,
    duration,
    hasAudio: out.streams.some((s: { codec_type: string }) => s.codec_type === "audio"),
  };
}

// Small argv parser: positional args plus --flag value / --flag (boolean).
export function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
    const next = argv[i + 1];
    if (inline !== undefined) flags[name] = inline;
    else if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      i++;
    } else flags[name] = true;
  }
  return {
    positional,
    flags,
    str(name: string, fallback?: string) {
      const v = flags[name];
      return typeof v === "string" ? v : fallback;
    },
    num(name: string, fallback: number) {
      const v = flags[name];
      return typeof v === "string" ? Number(v) : fallback;
    },
    bool(name: string) {
      return flags[name] === true || flags[name] === "true";
    },
  };
}
export type Args = ReturnType<typeof parseArgs>;
