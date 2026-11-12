#!/usr/bin/env bun
// Collect user feedback messages across local video agent sessions.
// Scans ~/.claude/projects/<filter>/*.jsonl, drops tool results, skill bodies,
// system reminders and compaction summaries, and writes one markdown file
// grouped by session so recurring creative or pacing corrections can be folded
// into your standing direction.
//
//   bun <SKILL_DIR>/scripts/mine-feedback.ts [--filter video] [--since 2026-11-01] [--out /tmp/vrea-feedback.md]
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const filter = arg("--filter", "video").toLowerCase();
const since = arg("--since", "");
const outPath = arg("--out", "/tmp/vrea-feedback.md");
const SKIP = [
  "This session is being continued",
  "<command-",
  "<local-command",
  "Caveat:",
  "[Request interrupted",
  "<task-notification",
  "Another Claude session",
];

const root = join(homedir(), ".claude", "projects");
const out: string[] = [];
let total = 0;

if (existsSync(root)) {
  const dirs = readdirSync(root)
    .filter((d) => d.toLowerCase().includes(filter))
    .sort()
    .map((d) => join(root, d));
  for (const d of dirs) {
    let files: string[] = [];
    try {
      files = readdirSync(d)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => join(d, f))
        .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
    } catch {
      continue;
    }
    for (const f of files) {
      const text = await Bun.file(f).text();
      const msgs: string[] = [];
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        let j: Record<string, unknown>;
        try {
          j = JSON.parse(line);
        } catch {
          continue;
        }
        if (j.type !== "user" || j.isMeta || j.isSidechain) continue;
        const raw = (j.message as { content?: unknown } | undefined)?.content;
        let c = "";
        if (typeof raw === "string") c = raw;
        else if (Array.isArray(raw)) {
          c = raw
            .filter((x): x is { type?: string; text?: string } => !!x && typeof x === "object" && (x as { type?: string }).type === "text")
            .map((x) => x.text ?? "")
            .join(" ");
        }
        c = c.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
        const t = String(j.timestamp ?? "").slice(0, 16);
        if (!c || (since && t < since) || SKIP.some((p) => c.startsWith(p)) || c.includes("Base directory for this skill") || c.includes("teammate-message")) {
          continue;
        }
        msgs.push(`- [${t}] ${c.slice(0, 1500)}`);
      }
      if (msgs.length) {
        const dirLabel = d.split("/").pop()!.slice(-36);
        const fileLabel = f.split("/").pop()!.slice(0, 8);
        out.push(`\n## ${dirLabel} / ${fileLabel}`, ...msgs);
        total += msgs.length;
      }
    }
  }
}

writeFileSync(outPath, out.join("\n") + "\n");
console.log(`wrote ${total} user messages to ${outPath}`);
