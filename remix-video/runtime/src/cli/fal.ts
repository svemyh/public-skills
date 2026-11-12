// fal.ai access. The key comes from $FAL_KEY or, when unset, from the
// 1Password reference in $VREA_FAL_OP_REF (read with `op read`). It is held in
// memory only. Every submission writes a receipt with its request id before
// polling, so an interrupted run resumes instead of paying twice.
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { $ } from "bun";
import { fal } from "@fal-ai/client";
import { ensureDir, fail, rel, writeJson, type Args } from "./project";

let configured = false;

async function configure() {
  if (configured) return;
  let key = process.env.FAL_KEY?.trim();
  const ref = process.env.VREA_FAL_OP_REF?.trim();
  if (!key && ref) key = (await $`op read ${ref}`.quiet().nothrow().text()).trim();
  if (!key) fail("No fal key: set FAL_KEY, or VREA_FAL_OP_REF to a 1Password reference (see .env.example)");
  fal.config({ credentials: key });
  configured = true;
}

export type ModelInfo = { endpoint: string; name: string; category: string; status: string; description: string };

// Model search is public; no key needed.
export async function searchModels(query: string, limit = 12): Promise<ModelInfo[]> {
  const url = `https://api.fal.ai/v1/models?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) fail(`fal model search failed: HTTP ${res.status}`);
  const body = (await res.json()) as { models: { endpoint_id: string; metadata?: Record<string, string> }[] };
  return body.models.map((m) => ({
    endpoint: m.endpoint_id,
    name: m.metadata?.display_name ?? "",
    category: m.metadata?.category ?? "",
    status: m.metadata?.status ?? "",
    description: (m.metadata?.description ?? "").trim(),
  }));
}

const uploads = new Map<string, string>();

// Local paths become fal storage URLs; URLs pass through.
export async function toUrl(pathOrUrl: string): Promise<string> {
  if (/^(https?|data):/.test(pathOrUrl)) return pathOrUrl;
  const cached = uploads.get(pathOrUrl);
  if (cached) return cached;
  await configure();
  if (!existsSync(pathOrUrl)) fail(`no such file to upload: ${pathOrUrl}`);
  const file = Bun.file(pathOrUrl);
  const url = await fal.storage.upload(new File([await file.arrayBuffer()], basename(pathOrUrl), { type: file.type }));
  uploads.set(pathOrUrl, url);
  return url;
}

export type RunResult = { requestId: string; data: unknown; files: string[] };

// Submit, write a receipt, wait, save the JSON result and download its media.
//
// `key` is the request's stable identity (endpoint, prompt, local file paths;
// never upload URLs, which change on every upload). A receipt with the same
// key resumes that request, and a saved result is reused without any network
// call, so reruns never pay twice. `input` is built lazily so uploads only
// happen for new submissions.
export async function runModel(opts: {
  endpoint: string;
  key: unknown;
  input: Record<string, unknown> | (() => Promise<Record<string, unknown>>);
  outDir: string;
  name: string;
  timeoutMs?: number;
}): Promise<RunResult> {
  await configure();
  ensureDir(opts.outDir);
  const key = JSON.stringify({ endpoint: opts.endpoint, key: opts.key });
  const receiptPath = join(opts.outDir, `${opts.name}.receipt.json`);
  const resultPath = join(opts.outDir, `${opts.name}.result.json`);
  let requestId: string | undefined;
  if (existsSync(receiptPath)) {
    const receipt = await Bun.file(receiptPath).json();
    if (receipt.key === key) requestId = receipt.requestId;
  }
  let data: unknown;
  // A result fetched in this run replaces older files of the same name (a
  // changed prompt reuses the name); a saved result only fills in missing ones.
  let fresh = false;
  if (requestId && existsSync(resultPath)) {
    data = await Bun.file(resultPath).json();
  } else {
    if (requestId) console.log(`  ${opts.name}: resuming ${requestId}`);
    else {
      const input = typeof opts.input === "function" ? await opts.input() : opts.input;
      const submitted = await fal.queue.submit(opts.endpoint, { input });
      requestId = submitted.request_id;
      await writeJson(receiptPath, { endpoint: opts.endpoint, key, requestId, input, submittedAt: new Date().toISOString() });
      console.log(`  ${opts.name}: submitted ${opts.endpoint} ${requestId}`);
    }
    await fal.queue.subscribeToStatus(opts.endpoint, { requestId, logs: false, timeout: opts.timeoutMs ?? 15 * 60_000 });
    data = (await fal.queue.result(opts.endpoint, { requestId })).data;
    await writeJson(resultPath, data);
    fresh = true;
  }
  const urls = mediaUrls(data);
  const files: string[] = [];
  for (const [i, url] of urls.entries()) {
    const file = join(opts.outDir, urls.length === 1 ? `${opts.name}${extFromUrl(url)}` : `${opts.name}_${i + 1}${extFromUrl(url)}`);
    if (fresh || !existsSync(file) || Bun.file(file).size === 0) {
      const res = await fetch(url);
      if (!res.ok) fail(`download failed for ${opts.name}: HTTP ${res.status}`);
      // Buffer first: streaming a Response into Bun.write can stall on large files.
      await Bun.write(file, await res.arrayBuffer());
    }
    files.push(file);
  }
  console.log(`  ${opts.name}: ${files.map(rel).join(", ") || "no media in result"}`);
  return { requestId, data, files };
}

// Media URLs in result order: images[], image, video, audio, then any *url.
function mediaUrls(data: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string" && /^https?:/.test(o.url)) out.push(o.url);
    for (const [k, child] of Object.entries(o)) if (k !== "url") visit(child);
  };
  visit(data);
  return [...new Set(out)];
}

function extFromUrl(url: string) {
  const ext = extname(new URL(url).pathname).toLowerCase();
  return ext && ext.length <= 5 ? ext : ".bin";
}

export async function transcribe(audioPath: string) {
  const outDir = join(audioPath, "..", "..", "..", "analysis");
  const { data } = await runModel({
    endpoint: "fal-ai/wizper",
    key: { audio: audioPath },
    input: async () => ({ audio_url: await toUrl(audioPath), task: "transcribe", chunk_level: "segment" }),
    outDir,
    name: "transcript.fal",
  });
  return data;
}

// Run up to `limit` jobs at once.
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

// vrea fal search <query> | vrea fal run <endpoint> --input in.json --out DIR --name STEM [--file field=path ...]
export async function falCommand(args: Args) {
  const [sub, target] = args.positional;
  if (sub === "search") {
    const models = await searchModels(target ?? fail("usage: vrea fal search <query>"), args.num("limit", 12));
    for (const m of models.filter((m) => m.status !== "deprecated")) {
      console.log(`${m.endpoint.padEnd(52)} ${m.category.padEnd(16)} ${m.name}`);
    }
    console.log(`\nSchema, limits and price: https://fal.ai/models/<endpoint>/llms.txt`);
    return;
  }
  if (sub === "run") {
    const endpoint = target ?? fail("usage: vrea fal run <endpoint> --input in.json --out DIR --name STEM");
    const input = (await Bun.file(args.str("input") ?? fail("--input is required")).json()) as Record<string, unknown>;
    const file = args.str("file");
    await runModel({
      endpoint,
      key: { input, file },
      input: async () => {
        if (!file) return input;
        const [field, path] = file.split("=", 2) as [string, string];
        return { ...input, [field]: await toUrl(path) };
      },
      outDir: args.str("out") ?? "fal-out",
      name: args.str("name") ?? "result",
    });
    return;
  }
  fail("usage: vrea fal search <query> | vrea fal run <endpoint> ...");
}
