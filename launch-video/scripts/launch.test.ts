import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLaunch, layoutBeat } from "./compile";

describe("layoutBeat", () => {
  test("centers full-width capture when no hexes are present", () => {
    const b = layoutBeat(16 / 10, false, 0, "auto");
    expect(b.w).toBe(1376);
    expect(b.h).toBe(860);
    expect(b.x).toBe(Math.round((1920 - b.w) / 2));
    expect(b.hexCoords).toHaveLength(0);
  });

  test("stacks 3 hexes in a left column and shifts window right in auto mode", () => {
    const b = layoutBeat(16 / 10, false, 3, "auto");
    expect(b.hexCoords).toHaveLength(3);
    expect(b.hexCoords[0]!.x).toBe(b.hexCoords[1]!.x);
    expect(b.hexCoords[1]!.x).toBe(b.hexCoords[2]!.x);
    // Hexes must keep clear margin from the window left edge (radius 68).
    expect(b.hexCoords[0]!.x + 68).toBeLessThan(b.x - 30);
  });

  test("places hexes in a centered horizontal row above a lower window in top mode", () => {
    const b = layoutBeat(16 / 9, false, 3, "top");
    expect(b.y).toBe(340);
    expect(b.hexCoords.map((p) => p.y)).toEqual([212, 212, 212]);
    expect(b.hexCoords[1]!.x).toBe(960);
  });
});

describe("compileLaunch", () => {
  test("compiles a complete timeline and synthesizes audio when no music file is set", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "launch-video-test-"));
    try {
      const svgMark = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="50" fill="#FFFFFF"/></svg>`;
      const svgScreen = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#18181B"/></svg>`;
      writeFileSync(join(tmp, "mark.svg"), svgMark);
      writeFileSync(join(tmp, "screen.svg"), svgScreen);
      writeFileSync(join(tmp, "logo.svg"), svgMark);
      writeFileSync(
        join(tmp, "brand.json"),
        JSON.stringify({
          name: "Acme",
          wordmark: "Acme",
          website: "acme.dev",
          tagline: "Ship faster together.",
          mark: "mark.svg",
          screens: { home: { file: "screen.svg", description: "Main workspace", frameless: false } },
          logos: { gh: { file: "logo.svg", description: "GitHub" } },
          cta: { big: "Free to start.", title: "Download Acme", body: "Ready in thirty seconds.", button: "Get Acme" },
        }),
      );
      writeFileSync(
        join(tmp, "launch.json"),
        JSON.stringify({
          brand: "./brand.json",
          open: { seconds: 2.0 },
          beats: [
            { id: "b1", headline: "Work in one place.", screen: "home", seconds: 2.0 },
            { id: "b2", headline: "Connect your tools.", screen: "home", hexes: ["gh"], seconds: 2.0 },
          ],
          cta: { bigSeconds: 1.0, cardSeconds: 1.5 },
          outro: { seconds: 2.5 },
          music: "synth",
        }),
      );

      const pub = join(tmp, "public");
      const film = await compileLaunch(join(tmp, "launch.json"), pub);
      expect(film.scenes.map((s) => s.id)).toEqual(["open", "b1", "b2", "free", "download", "outro"]);
      // Scenes must tile 0..durationInFrames without gaps.
      let cursor = 0;
      for (const sc of film.scenes) {
        expect(sc.from).toBe(cursor);
        cursor += sc.duration;
      }
      expect(cursor).toBe(film.durationInFrames);
      expect(film.durationInFrames).toBe(Math.round(11.0 * 60));
      expect(film.audio?.src).toBe("audio/synth-bed.m4a");
      expect(existsSync(join(pub, "audio", "synth-bed.m4a"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
