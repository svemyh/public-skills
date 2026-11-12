import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const REPO_ROOT = resolve(import.meta.dir, "../../../..");
const VREA_LAUNCHER = join(REPO_ROOT, "clone-video", "scripts", "vrea.ts");
const MUSIC_SCRIPTS = join(REPO_ROOT, "video-tools", "scripts", "music");

describe("self-contained vrea CLI & video-tools scripts", () => {
  test(
    "runs ingest -> analyze -> scaffold -> extract -> check -> rebrand -> vary --draft -> compose in an isolated workdir",
    async () => {
      const work = mkdtempSync(join(tmpdir(), "vrea-e2e-"));
      try {
        const srcMp4 = join(work, "sample.mp4");
        // 2-second 30fps video with a clean hard cut at 1.0s (frame 30) + 220Hz sine audio.
        await $`ffmpeg -hide_banner -loglevel error -y \
          -f lavfi -i color=c=0x101828:s=640x360:r=30:d=1 \
          -f lavfi -i color=c=0xF6F7F3:s=640x360:r=30:d=1 \
          -f lavfi -i sine=frequency=220:sample_rate=44100:duration=2 \
          -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" \
          -map "[v]" -map 2:a -c:v libx264 -pix_fmt yuv420p -c:a aac ${srcMp4}`;

        const run = async (...argv: string[]) => {
          const proc = Bun.spawn(["bun", VREA_LAUNCHER, ...argv], {
            cwd: work,
            stdout: "pipe",
            stderr: "pipe",
          });
          const [out, err, code] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
          ]);
          if (code !== 0) throw new Error(`vrea ${argv.join(" ")} failed (${code}):\n${out}\n${err}`);
          return out;
        };

        await run("ingest", srcMp4, "--project", "demo");
        expect(existsSync(join(work, "projects", "demo", "project.json"))).toBe(true);
        // Must never pollute the skill repository itself.
        expect(existsSync(join(REPO_ROOT, "remix-video", "runtime", "projects", "demo"))).toBe(false);

        await run("analyze", "demo");
        expect(existsSync(join(work, "projects", "demo", "analysis", "shots.png"))).toBe(true);
        expect(existsSync(join(work, "projects", "demo", "analysis", "beats.json"))).toBe(true);

        await run("scaffold", "demo");
        await run("extract", "demo");
        await run("check", "demo");

        // Rebrand using the bundled example brand kit inside remix-video/runtime.
        await run("rebrand", "demo", "--brand", "examples/brands/acme/brand.json");
        const acmeSpec = await Bun.file(join(work, "projects", "demo", "variants", "acme", "spec.json")).json();
        expect(acmeSpec.brand.name).toBe("Acme");
        expect(acmeSpec.brand.palette.bg).toBe("#F6F7F3");

        // Draft two variants off acme and compose them (--no-render keeps unit suite fast).
        await run("vary", "demo", "--name", "acme-a", "--draft", "--base", "acme");
        await run("vary", "demo", "--name", "acme-b", "--draft", "--base", "acme");
        // Turn drafts into zero-cost swapless plans to exercise vary + compose offline.
        for (const v of ["acme-a", "acme-b"]) {
          const p = join(work, "projects", "demo", "variants", v, "plan.json");
          const plan = await Bun.file(p).json();
          plan.swaps = [];
          await Bun.write(p, JSON.stringify(plan, null, 2));
          await run("vary", "demo", "--name", v);
        }
        await run("compose", "demo", "--variants", "a=acme-a,b=acme-b", "--picks", "s1b", "--no-render");
        expect(existsSync(join(work, "projects", "demo", "variants", "mix", "spec.json"))).toBe(true);

        // Verify standalone Bun audio scripts (edit.ts, cuts-mix.ts, check-sync.ts).
        const specFile = join(work, "projects", "demo", "spec.json");
        const audioSrc = join(work, "projects", "demo", "media", "audio", "source.m4a");
        const editedWav = join(work, "edited.wav");
        await $`bun ${join(MUSIC_SCRIPTS, "edit.ts")} ${audioSrc} ${editedWav} --bpm 120 --fps 30 --frames 60 --hit-frame 10`.quiet();
        expect(existsSync(editedWav)).toBe(true);

        const mixedWav = join(work, "cuts.wav");
        await $`bun ${join(MUSIC_SCRIPTS, "cuts-mix.ts")} ${editedWav} ticks ${mixedWav} --spec ${specFile}`.quiet();
        expect(existsSync(mixedWav)).toBe(true);

        const muxedMp4 = join(work, "muxed.mp4");
        await $`ffmpeg -v error -y -i ${srcMp4} -i ${mixedWav} -map 0:v -map 1:a -c:v copy -c:a aac ${muxedMp4}`.quiet();
        const syncJson = await $`bun ${join(MUSIC_SCRIPTS, "check-sync.ts")} ${srcMp4} --spec ${specFile} --mix ${mixedWav} --muxed ${muxedMp4}`.quiet().json();
        expect(syncJson.frames).toBe(60);
        expect(typeof syncJson.mux_offset_ms).toBe("number");
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
