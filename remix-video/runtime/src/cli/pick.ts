import { existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { $ } from "bun";
import { codes, loadMix, mixSections, saveMix, Mix } from "./compose";
import { ensureDir, fail, Project, rel, RUNTIME_ROOT, WORK_ROOT, type Args } from "./project";

// vrea pick <slug> [--variants a=x,b=y,c=z] [--port 3160]
// A local page for choosing a version of each section with the keyboard and
// leaving remarks. Picks save to mix.json as you go; Enter runs compose.
export async function pick(args: Args) {
  const project = new Project(args.positional[0] ?? "");
  const mix = await loadMix(project, args);
  await saveMix(project, mix);
  const sections = await mixSections(project, mix);
  const fps = (await project.spec(Object.values(mix.variants)[0])).meta.fps;
  await cutClips(project, mix, sections, fps);

  let composing: Promise<void> | undefined;
  let log = "";
  const port = Number(args.str("port") ?? 3160);
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.pathname === "/api/state") {
        const current = await loadMix(project);
        const variants = Object.entries(current.variants).map(([key, name]) => ({ key, name }));
        const out = project.path("renders", `${current.name}.mp4`);
        return Response.json({ slug: project.slug, fps, mix: current, sections, variants, composing: !!composing, log, render: existsSync(out) ? `/media/renders/${current.name}.mp4?t=${statSync(out).mtimeMs}` : null });
      }
      if (url.pathname === "/api/mix" && req.method === "POST") {
        const next = Mix.parse(await req.json());
        await saveMix(project, next);
        return Response.json({ ok: true, codes: codes(sections, next, Object.keys(next.variants)[0]!) });
      }
      if (url.pathname === "/api/compose" && req.method === "POST") {
        if (!composing) {
          log = "composing…";
          composing = (async () => {
            const res = await $`bun ${join(RUNTIME_ROOT, "src/cli/index.ts")} compose ${project.rawArg}`.cwd(WORK_ROOT).nothrow().quiet();
            log = (res.stdout.toString() + res.stderr.toString()).trim().split("\n").slice(-12).join("\n");
            composing = undefined;
          })();
        }
        return Response.json({ ok: true });
      }
      if (url.pathname.startsWith("/media/")) return serveFile(project.path(), decodeURIComponent(url.pathname.slice(7)), req);
      return new Response("not found", { status: 404 });
    },
  });
  console.log(`picker: http://127.0.0.1:${server.port}/  (${project.slug}; picks save to ${rel(project.path("mix.json"))})`);
  await new Promise(() => {});
}

// One clip per variant and section, cut frame-exact from the variant render
// (with its sound), recut when the render is newer.
async function cutClips(project: Project, mix: Mix, sections: { id: string; from: number; duration: number }[], fps: number) {
  for (const name of Object.values(mix.variants)) {
    const src = project.path("renders", `${name}.mp4`);
    if (!existsSync(src)) fail(`no render for ${name}; run vrea render ${project.slug} --variant ${name}`);
    const dir = ensureDir(project.path("renders", "sections", name));
    for (const s of sections) {
      const out = join(dir, `${s.id}.mp4`);
      if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) continue;
      await $`ffmpeg -hide_banner -loglevel error -y -i ${src} -vf ${`trim=start_frame=${s.from}:end_frame=${s.from + s.duration},setpts=PTS-STARTPTS,scale=960:-2`} -af ${`atrim=start=${s.from / fps}:end=${(s.from + s.duration) / fps},asetpts=PTS-STARTPTS`} -c:v libx264 -crf 22 -pix_fmt yuv420p -c:a aac -movflags +faststart ${out}`;
    }
  }
}

// Files under the project dir, with byte ranges so video can seek.
function serveFile(root: string, path: string, req: Request): Response {
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file)) return new Response("not found", { status: 404 });
  const blob = Bun.file(file);
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (!range) return new Response(blob, { headers: { "accept-ranges": "bytes" } });
  const size = blob.size;
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: { "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": String(end - start + 1), "content-type": blob.type },
  });
}

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Section picker</title>
<style>
:root{--bg:#0b0b0c;--panel:#151517;--ink:#f2f2ee;--dim:#8b8b86;--hi:#ffd23f;--line:#2a2a2d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,Helvetica,Arial,sans-serif}
header{position:sticky;top:0;z-index:5;background:rgba(11,11,12,.96);border-bottom:1px solid var(--line);padding:12px 20px}
h1{margin:0;font-size:17px}.codes{font:600 20px ui-monospace,Menlo,monospace;color:var(--hi);margin:6px 0 4px;letter-spacing:.02em}
.legend,.status{color:var(--dim)}.keys{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;color:var(--dim)}
kbd{font:600 12px ui-monospace,Menlo,monospace;background:#26262a;border:1px solid #3a3a3f;border-bottom-width:2px;border-radius:4px;padding:1px 6px;color:var(--ink)}
main{padding:14px 20px 80px}.row{display:grid;grid-template-columns:190px repeat(var(--n),1fr);gap:10px;padding:10px;border:2px solid transparent;border-radius:10px;margin-bottom:8px;background:var(--panel)}
.row.cur{border-color:#55555c}.meta b{font-size:22px;color:var(--hi)}.meta .name{font-size:15px;font-weight:600}.meta small{color:var(--dim);display:block}
.remark{margin-top:6px;color:#9fd3ff;font-size:13px;white-space:pre-wrap}
.cell{position:relative;border-radius:8px;overflow:hidden;border:3px solid transparent;cursor:pointer;background:#000}
.cell.on{border-color:var(--hi)}.cell video{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.tag{position:absolute;left:8px;top:6px;background:rgba(0,0,0,.72);padding:2px 8px;border-radius:6px;font-weight:700}
.tag span{font-weight:400;color:#ccc;margin-left:6px}.cell.on .tag{background:var(--hi);color:#000}.cell.on .tag span{color:#222}
#player{display:none;margin:0 20px 10px}#player.show{display:block}#player video{width:100%;max-height:52vh;background:#000;border-radius:8px}
#player .cap{color:var(--dim);margin:4px 0}
dialog{background:var(--panel);color:var(--ink);border:1px solid #444;border-radius:12px;width:min(640px,92vw)}
textarea{width:100%;height:120px;background:#0e0e10;color:var(--ink);border:1px solid #444;border-radius:8px;padding:8px;font:14px inherit}
pre{white-space:pre-wrap;color:var(--dim);margin:6px 0 0}
@media (max-width:800px){.row{grid-template-columns:1fr}}
</style></head><body>
<header>
  <h1 id="title">Section picker</h1>
  <div class="codes" id="codes"></div>
  <div class="legend" id="legend"></div>
  <div class="keys">
    <span><kbd>↑</kbd><kbd>↓</kbd> or <kbd>j</kbd><kbd>k</kbd> section</span>
    <span><kbd>a</kbd><kbd>b</kbd><kbd>c</kbd> or <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick</span>
    <span><kbd>←</kbd><kbd>→</kbd> cycle pick</span>
    <span><kbd>space</kbd> play row (picked one is heard)</span>
    <span><kbd>p</kbd> play whole combination</span>
    <span><kbd>r</kbd> remark on section</span>
    <span><kbd>m</kbd> music: majority / follow / a / b / c</span>
    <span><kbd>enter</kbd> compose + render</span>
    <span><kbd>esc</kbd> stop</span>
  </div>
  <div class="status" id="status"></div>
</header>
<div id="player"><div class="cap" id="cap"></div><video id="pv" controls playsinline></video></div>
<main id="rows"></main>
<dialog id="dlg"><form method="dialog"><div id="dlgTitle" style="font-weight:700;margin-bottom:8px"></div>
<textarea id="remark" placeholder="What should change here? e.g. redo all of this section, warmer light, slower voice"></textarea>
<div style="margin-top:8px;color:var(--dim)">Saved with your picks. <kbd>⌘</kbd><kbd>enter</kbd> saves, <kbd>esc</kbd> cancels.</div></form></dialog>
<script>
let S, cur = 0;
const $ = (id) => document.getElementById(id);
const letters = () => S.variants.map((v) => v.key);
const pickOf = (id) => S.mix.picks[id] || letters()[0];
const clip = (name, sid) => '/media/renders/sections/' + name + '/' + sid + '.mp4';
async function load() { S = await (await fetch('/api/state')).json(); render(); }
function codes() { return S.sections.map((s) => s.id + pickOf(s.id)).join(' '); }
async function save() { await fetch('/api/mix', { method: 'POST', body: JSON.stringify(S.mix) }); $('codes').textContent = codes(); }
function render() {
  $('title').textContent = S.slug + ': pick a version of each section';
  $('legend').textContent = S.variants.map((v) => v.key + ' = ' + v.name).join('   ·   ') + '   ·   music: ' + S.mix.music + '   ·   output: variants/' + S.mix.name;
  $('codes').textContent = codes();
  const rows = $('rows'); rows.innerHTML = ''; rows.style.setProperty('--n', S.variants.length);
  S.sections.forEach((s, i) => {
    const row = document.createElement('div'); row.className = 'row' + (i === cur ? ' cur' : ''); row.id = 'row-' + i;
    const secs = (s.duration / S.fps).toFixed(2);
    row.innerHTML = '<div class="meta"><b>' + s.id + '</b> <span class="name">' + s.name + '</span><small>f' + s.from + '–' + (s.from + s.duration - 1) + ' · ' + secs + 's</small><div class="remark">' + (S.mix.remarks[s.id] ? '✎ ' + esc(S.mix.remarks[s.id]) : '') + '</div></div>';
    S.variants.forEach((v) => {
      const cell = document.createElement('div'); cell.className = 'cell' + (pickOf(s.id) === v.key ? ' on' : '');
      cell.innerHTML = '<video muted playsinline preload="auto" src="' + clip(v.name, s.id) + '#t=0.01"></video><div class="tag">' + s.id + v.key + '<span>' + v.name + '</span></div>';
      cell.onclick = () => { cur = i; setPick(v.key); };
      row.appendChild(cell);
    });
    row.onmouseenter = () => {};
    rows.appendChild(row);
  });
  status();
}
function esc(t) { return t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); }
function status(extra) {
  const r = S.render ? ' · last render ready below' : '';
  $('status').textContent = (S.composing ? 'composing and rendering…' : 'picks save automatically') + r + (extra ? ' · ' + extra : '');
}
function focusRow() { document.querySelectorAll('.row').forEach((r, i) => r.classList.toggle('cur', i === cur)); $('row-' + cur).scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
async function setPick(k) {
  S.mix.picks[S.sections[cur].id] = k;
  const row = $('row-' + cur);
  row.querySelectorAll('.cell').forEach((c, j) => c.classList.toggle('on', letters()[j] === k));
  focusRow(); await save(); playRow();
}
function stopAll() { document.querySelectorAll('video').forEach((v) => { v.pause(); }); }
function playRow() {
  stopAll();
  const row = $('row-' + cur); const k = pickOf(S.sections[cur].id);
  row.querySelectorAll('.cell video').forEach((v, j) => { v.currentTime = 0; v.muted = letters()[j] !== k; v.play(); });
}
function playAll() {
  stopAll(); const pv = $('pv'); $('player').classList.add('show'); let i = 0;
  const next = () => {
    if (i >= S.sections.length) { $('cap').textContent = 'combination: ' + codes(); return; }
    const s = S.sections[i]; const v = S.variants.find((x) => x.key === pickOf(s.id));
    $('cap').textContent = 'playing ' + s.id + pickOf(s.id) + ' · ' + s.name + ' · ' + v.name + '  (cut-by-cut preview; enter renders the real mix)';
    pv.src = clip(v.name, s.id); pv.play(); i++;
  };
  pv.onended = next; next();
}
function remark() {
  const s = S.sections[cur]; $('dlgTitle').textContent = 'Remark on ' + s.id + ' · ' + s.name;
  $('remark').value = S.mix.remarks[s.id] || ''; $('dlg').showModal(); $('remark').focus();
}
$('remark').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); S.mix.remarks[S.sections[cur].id] = $('remark').value.trim(); $('dlg').close(); await save(); render(); focusRow(); }
});
async function compose() {
  await save(); await fetch('/api/compose', { method: 'POST' }); S.composing = true; status();
  const poll = setInterval(async () => {
    const st = await (await fetch('/api/state')).json();
    if (!st.composing) {
      clearInterval(poll); S = st; render(); focusRow(); status('done');
      if (S.render) { $('player').classList.add('show'); $('pv').onended = null; $('pv').src = S.render; $('cap').innerHTML = 'rendered variants/' + S.mix.name + ' · ' + codes() + '<pre>' + esc(S.log) + '</pre>'; }
    }
  }, 1500);
}
const MUSIC = () => ['majority', 'follow', ...letters()];
document.addEventListener('keydown', async (e) => {
  if ($('dlg').open || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'ArrowDown' || k === 'j') { cur = Math.min(S.sections.length - 1, cur + 1); focusRow(); playRow(); }
  else if (k === 'ArrowUp' || k === 'k') { cur = Math.max(0, cur - 1); focusRow(); playRow(); }
  else if (letters().includes(k)) setPick(k);
  else if (/^[1-9]$/.test(k) && letters()[Number(k) - 1]) setPick(letters()[Number(k) - 1]);
  else if (k === 'ArrowRight' || k === 'ArrowLeft') { const L = letters(); const i = L.indexOf(pickOf(S.sections[cur].id)); setPick(L[(i + (k === 'ArrowRight' ? 1 : L.length - 1)) % L.length]); }
  else if (k === ' ') playRow();
  else if (k === 'p') playAll();
  else if (k === 'r') remark();
  else if (k === 'm') { const M = MUSIC(); S.mix.music = M[(M.indexOf(S.mix.music) + 1) % M.length]; await save(); render(); focusRow(); }
  else if (k === 'Enter') compose();
  else if (k === 'Escape') { stopAll(); $('pv').pause(); }
  else return;
  e.preventDefault();
});
load();
</script></body></html>`;
