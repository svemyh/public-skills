import { existsSync, readdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { $ } from "bun";
import { ensureDir, fail, probe, Project, rel, WORK_ROOT, writeJson, type Args, type ProjectInfo } from "./project";

// vrea ingest <url|file> --project <slug>
// Downloads (yt-dlp) or copies the source, probes it, and extracts the audio
// track into media/ so the clone can play the original soundtrack.
export async function ingest(args: Args) {
  const input = args.positional[0] ?? fail("usage: vrea ingest <url|file> --project <slug>");
  const slug = args.str("project") ?? fail("--project <slug> is required");
  const project = new Project(slug);
  const sourceDir = ensureDir(project.path("source"));

  if (existsSync(project.source) && !args.bool("force")) {
    console.log(`source exists: ${rel(project.source)} (use --force to replace)`);
  } else if (/^https?:\/\//.test(input)) {
    console.log(`downloading ${input}`);
    await $`yt-dlp -f ${"bv*+ba/b"} --merge-output-format mp4 -o ${sourceDir + "/download.%(ext)s"} ${input}`;
    const downloaded = readdirSync(sourceDir).find((f) => f.startsWith("download."));
    if (!downloaded) fail("yt-dlp produced no file");
    renameSync(`${sourceDir}/${downloaded}`, project.source);
  } else {
    const file = resolve(WORK_ROOT, input);
    if (!existsSync(file)) fail(`no such file: ${input}`);
    await $`cp ${file} ${project.source}`;
  }

  const p = await probe(project.source);
  const info: ProjectInfo = {
    slug: project.slug,
    sourceUrl: /^https?:\/\//.test(input) ? input : undefined,
    fps: Math.round(p.fps * 1000) / 1000,
    width: p.width,
    height: p.height,
    frames: p.frames,
    duration: p.duration,
    hasAudio: p.hasAudio,
  };
  if (!Number.isInteger(info.fps)) {
    console.warn(`warning: non-integer fps ${info.fps}; specs use ${Math.round(info.fps)}`);
  }
  await writeJson(project.path("project.json"), info);

  if (p.hasAudio) {
    const audio = ensureDir(project.path("media", "audio")) + "/source.m4a";
    await $`ffmpeg -hide_banner -loglevel error -y -i ${project.source} -vn -c:a aac -b:a 256k ${audio}`;
  }
  console.log(
    `ingested ${slug}: ${p.width}x${p.height} @ ${info.fps}fps, ${p.frames} frames (${p.duration.toFixed(2)}s), audio ${p.hasAudio ? "yes" : "no"}`,
  );
  console.log(`next: vrea analyze ${slug}`);
}
