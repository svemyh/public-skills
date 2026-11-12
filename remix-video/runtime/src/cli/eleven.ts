// ElevenLabs access: voices, voice-over, sound effects, music and
// transcription. The key comes from $ELEVENLABS_API_KEY or, when unset, from
// the 1Password reference in $VREA_ELEVENLABS_OP_REF, held in memory only.
// Every generation is saved next to a `.key.json` naming its inputs, and a
// rerun with the same inputs reuses the file instead of paying again.
import { existsSync } from "node:fs";
import { $ } from "bun";
import { fail } from "./project";

const API = "https://api.elevenlabs.io";
let cachedKey: string | undefined;

export async function elevenKey(optional = false): Promise<string | undefined> {
  if (cachedKey) return cachedKey;
  let key = process.env.ELEVENLABS_API_KEY?.trim();
  const ref = process.env.VREA_ELEVENLABS_OP_REF?.trim();
  if (!key && ref) key = (await $`op read ${ref}`.quiet().nothrow().text()).trim();
  if (!key && !optional) fail("No ElevenLabs key: set ELEVENLABS_API_KEY, or VREA_ELEVENLABS_OP_REF to a 1Password reference (see .env.example)");
  cachedKey = key || undefined;
  return cachedKey;
}

// At most four requests in flight from this process.
const slots = (() => {
  let free = 4;
  const waiting: (() => void)[] = [];
  return {
    acquire: () => (free > 0 ? (free--, Promise.resolve()) : new Promise<void>((r) => waiting.push(r))),
    release: () => {
      const next = waiting.shift();
      if (next) next();
      else free++;
    },
  };
})();

async function call(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const key = (await elevenKey())!;
  const headers: Record<string, string> = { "xi-api-key": key };
  let body = init.body;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  // The account allows a fixed number of concurrent requests, shared by every
  // process using the key: wait for a slot and retry a 429 with backoff.
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    await slots.acquire();
    try {
      res = await fetch(`${API}${path}`, { ...init, headers, body });
    } finally {
      slots.release();
    }
    if (res.status !== 429 || attempt >= 8) break;
    await res.body?.cancel();
    await Bun.sleep(Math.min(30_000, 1500 * 2 ** attempt) * (0.5 + Math.random()));
  }
  if (!res.ok) fail(`ElevenLabs ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

// Saves the response body to `file` unless a previous run with the same
// inputs already did.
async function cached(file: string, inputs: unknown, make: () => Promise<Response>): Promise<string> {
  const keyFile = `${file}.key.json`;
  const key = JSON.stringify(inputs);
  if (existsSync(file) && existsSync(keyFile) && (await Bun.file(keyFile).text()) === key) return file;
  const res = await make();
  await Bun.write(file, await res.arrayBuffer());
  await Bun.write(keyFile, key);
  return file;
}

export type Voice = { id: string; owner?: string; name?: string; model?: string; settings?: Record<string, unknown> };

export type LibraryVoice = { voice_id: string; public_owner_id: string; name: string; gender: string; age: string; accent: string; use_case: string; cloned_by_count: number; description: string; preview_url: string };

// The public voice library.
export async function searchVoices(query: string, filters: Record<string, string> = {}): Promise<LibraryVoice[]> {
  const params = new URLSearchParams({ search: query, page_size: "12", language: "en", ...filters });
  const body = (await (await call(`/v1/shared-voices?${params}`)).json()) as { voices: LibraryVoice[] };
  return body.voices;
}

// Library voices must be in the account before text-to-speech can use them.
// One addition per voice, shared by every line that waits on it.
const added = new Map<string, Promise<void>>();
function ensureVoice(voice: Voice): Promise<void> {
  if (!voice.owner) return Promise.resolve();
  let pending = added.get(voice.id);
  if (!pending) {
    pending = (async () => {
      const mine = (await (await call(`/v2/voices?search=${encodeURIComponent(voice.name ?? voice.id)}&page_size=100`)).json()) as { voices: { voice_id: string }[] };
      if (!mine.voices.some((v) => v.voice_id === voice.id)) {
        await call(`/v1/voices/add/${voice.owner}/${voice.id}`, { method: "POST", json: { new_name: voice.name ?? voice.id } });
      }
    })();
    added.set(voice.id, pending);
  }
  return pending;
}

export async function speak(voice: Voice, text: string, file: string): Promise<string> {
  const model = voice.model ?? "eleven_v3";
  const inputs = { voice: voice.id, model, text, settings: voice.settings ?? null };
  return cached(file, inputs, async () => {
    await ensureVoice(voice);
    return call(`/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
      method: "POST",
      json: { text, model_id: model, ...(voice.settings ? { voice_settings: voice.settings } : {}) },
    });
  });
}

export async function soundEffect(text: string, seconds: number | undefined, file: string, influence = 0.4): Promise<string> {
  const inputs = { text, seconds: seconds ?? null, influence };
  return cached(file, inputs, () =>
    call(`/v1/sound-generation?output_format=mp3_44100_128`, { method: "POST", json: { text, duration_seconds: seconds, prompt_influence: influence } }),
  );
}

export type MusicChunk = { text?: string; duration_ms: number; positive_styles: string[]; negative_styles: string[]; context_adherence?: "low" | "medium" | "high" };

// Chunk durations are enforced by music_v2*, so chunk edges land exactly on
// the frames the plan puts them at.
export async function compose(chunks: MusicChunk[], file: string, model = "music_v2_5"): Promise<string> {
  const plan = { chunks: chunks.map((c) => ({ text: c.text ?? "", context_adherence: "high", ...c })) };
  return cached(file, { model, plan }, () => call(`/v1/music`, { method: "POST", json: { model_id: model, composition_plan: plan } }));
}

export type Word = { text: string; from: number; to: number };

// Word-level transcript, in frames.
export async function transcribeWords(audioFile: string, fps: number): Promise<{ text: string; words: Word[] }> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("timestamps_granularity", "word");
  form.append("file", Bun.file(audioFile));
  const body = (await (await call(`/v1/speech-to-text`, { method: "POST", body: form })).json()) as { text: string; words: { text: string; type: string; start: number; end: number }[] };
  const words = body.words.filter((w) => w.type === "word").map((w) => ({ text: w.text, from: Math.floor(w.start * fps), to: Math.ceil(w.end * fps) }));
  return { text: body.text, words };
}

export async function durationFrames(file: string, fps: number): Promise<number> {
  const out = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${file}`.quiet().text();
  return Math.ceil(Number(out.trim()) * fps);
}

