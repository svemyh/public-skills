// Real stock footage and photos from Pexels (free to use and modify, no
// attribution required; see https://www.pexels.com/license/). The key comes
// from $PEXELS_API_KEY or the 1Password reference in $VREA_PEXELS_OP_REF.
// Each pick is saved with a `.stock.json` naming its query and Pexels id, so
// a rerun with the same query reuses the file.
import { existsSync } from "node:fs";
import { $ } from "bun";
import { fail } from "./project";

let key: string | undefined;

async function pexelsKey() {
  if (key) return key;
  key = process.env.PEXELS_API_KEY?.trim();
  const ref = process.env.VREA_PEXELS_OP_REF?.trim();
  if (!key && ref) key = (await $`op read ${ref}`.quiet().nothrow().text()).trim();
  if (!key) fail("No Pexels key: set PEXELS_API_KEY, or VREA_PEXELS_OP_REF to a 1Password reference (see .env.example)");
  return key;
}

// Searches are cached per run: shots that share a query cost one request
// (Pexels allows 200 an hour) and still get different clips via `exclude`.
const searches = new Map<string, Promise<unknown>>();

function get<T>(path: string): Promise<T> {
  if (!searches.has(path)) {
    searches.set(path, (async () => {
      // The hourly quota is shared by every run on this key: on 429, wait
      // until the reset Pexels reports, 1 to 2 minutes a try, up to an hour.
      for (let tries = 0; ; tries++) {
        const res = await fetch(`https://api.pexels.com${path}`, { headers: { Authorization: await pexelsKey() } });
        if (res.ok) return res.json();
        if (res.status !== 429 || tries >= 45) fail(`Pexels ${path}: HTTP ${res.status}`);
        const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000 - Date.now();
        const wait = Math.min(120_000, Math.max(60_000, Number.isFinite(reset) ? reset : 120_000));
        console.log(`  pexels: rate limited, retrying in ${Math.round(wait / 1000)}s`);
        await Bun.sleep(wait);
      }
    })());
  }
  return searches.get(path) as Promise<T>;
}

type VideoFile = { link: string; width: number; height: number; quality: string; file_type: string };
type Video = { id: number; url: string; duration: number; width: number; height: number; user: { name: string }; video_files: VideoFile[] };
type Photo = { id: number; url: string; width: number; height: number; photographer: string; alt: string; src: Record<string, string> };

export type StockPick = { id: number; url: string; author: string; file: string; type: "video" | "image"; duration?: number };

// The best landscape result for the query that lasts at least `seconds`
// (videos) and is not in `exclude`. `nth` skips that many good results.
export async function stock(opts: { query: string; type: "video" | "image"; seconds?: number; exclude: Set<number>; nth?: number; aspect?: number; out: string }): Promise<StockPick> {
  const meta = `${opts.out}.stock.json`;
  if (existsSync(meta)) {
    const saved = (await Bun.file(meta).json()) as StockPick & { query: string; nth?: number };
    if (saved.query === opts.query && (saved.nth ?? 0) === (opts.nth ?? 0) && existsSync(saved.file)) return saved;
  }
  const q = encodeURIComponent(opts.query);
  let pick: StockPick | undefined;
  let skip = opts.nth ?? 0;
  if (opts.type === "video") {
    const body = await get<{ videos: Video[] }>(`/videos/search?query=${q}&per_page=30&orientation=landscape&size=medium`);
    for (const v of body.videos) {
      if (opts.exclude.has(v.id) || v.duration < (opts.seconds ?? 0) + 1.5) continue;
      const files = v.video_files.filter((f) => f.file_type === "video/mp4" && f.width >= 1280 && f.width <= 2048 && f.width > f.height);
      const file = files.sort((a, b) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920))[0];
      if (!file) continue;
      if (skip-- > 0) continue;
      pick = { id: v.id, url: v.url, author: v.user.name, file: `${opts.out}.mp4`, type: "video", duration: v.duration };
      await download(file.link, pick.file);
      break;
    }
  } else {
    const orientation = (opts.aspect ?? 1.5) >= 1.15 ? "landscape" : (opts.aspect ?? 1) <= 0.87 ? "portrait" : "square";
    const body = await get<{ photos: Photo[] }>(`/v1/search?query=${q}&per_page=30&orientation=${orientation}`);
    for (const p of body.photos) {
      if (opts.exclude.has(p.id)) continue;
      if (skip-- > 0) continue;
      pick = { id: p.id, url: p.url, author: p.photographer, file: `${opts.out}.jpg`, type: "image" };
      await download(p.src.large2x ?? p.src.original!, pick.file);
      break;
    }
  }
  if (!pick) fail(`Pexels: nothing usable for "${opts.query}" (${opts.type}); try another query`);
  await Bun.write(meta, JSON.stringify({ ...pick, query: opts.query, nth: opts.nth ?? 0 }, null, 2));
  return pick;
}

async function download(url: string, file: string) {
  const res = await fetch(url);
  if (!res.ok) fail(`download ${url}: HTTP ${res.status}`);
  await Bun.write(file, await res.arrayBuffer());
}
