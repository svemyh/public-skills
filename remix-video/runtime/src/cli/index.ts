#!/usr/bin/env bun
import { analyze } from "./analyze";
import { board, composeCommand } from "./compose";
import { pick } from "./pick";
import { pipeline } from "./pipeline";
import { check, extract, scaffold } from "./assets";
import { falCommand } from "./fal";
import { ingest } from "./ingest";
import { parseArgs } from "./project";
import { rebrand } from "./rebrand";
import { sound } from "./sound";
import { compare, frame, grid, render, studio } from "./render";
import { vary } from "./vary";

const HELP = `vrea: reverse engineer a video into Remotion, then vary or rebrand it

Projects live under ./projects/<slug> in your current working directory (override
with VREA_PROJECTS_DIR, or pass a path like ./work/my-reel anywhere <slug> is accepted).

End to end
  pipeline <slug> [--url <video>] [--brand kit.json | --no-rebrand] [--variants a=x,b=y,c=z] [--compose]
                                         one video in, branded variants and a review board out;
                                         runs every ready stage, then says what to write next

Clone
  ingest <url|file> --project <slug>     download/copy, probe, extract audio
  analyze <slug> [--threshold 0.3] [--transcribe]
                                         cuts, keyframes, contact sheets, audio onsets
  scaffold <slug>                        verbatim spec.json: one source cut per shot
  extract <slug> [--variant v]           cut/crop every source asset into media/
  check <slug> [--variant v]             validate spec and media; code vs footage breakdown
  frame <slug> <n...> [--variant v]      source | render side by side for frames
  render <slug> [--variant v] [--out file] [--frames a-b] [--scale 0.5] [--port n]
  compare <slug> [--variant v] [--render]
                                         per-scene SSIM vs source + side-by-side mp4
  studio <slug> [--variant v] [--port n]  Remotion Studio on a spec (prints URL, opens nothing)
  grid <slug> --variants a,b,...         tile renders (and "source") into one labeled video

Vary
  vary <slug> --name <v> --draft [--base <v>]
                                         draft variants/<v>/plan.json
  vary <slug> --name <v> [--dry-run]     generate swaps, write variants/<v>/spec.json

Rebrand
  rebrand <slug> --brand <kit.json> [--name <v>] [--base <v>] [--dry-run]

Sound
  sound <slug> --variant <v> [--dry-run] voice-over, effects and music from variants/<v>/sound.json
  sound voices <query> [--gender g]      search the ElevenLabs voice library

Compose (pick a version of each section across variants)
  board <slug> --variants a=<v>,b=<v>,c=<v> [--audio a]
                                         labeled review video of the variants, per section
  pick <slug> [--port n]                 picker page: keyboard picks and remarks per section
  compose <slug> [--picks "s1b s2a ..."] [--music majority|follow|<letter>] [--name mix]
                                         build and render the picked combination

fal
  fal search <query>                     live model catalog
  fal run <endpoint> --input in.json --out DIR --name STEM [--file field=path]
`;

const commands: Record<string, (args: ReturnType<typeof parseArgs>) => Promise<unknown>> = {
  pipeline,
  ingest,
  analyze,
  scaffold,
  extract,
  check,
  frame,
  render,
  compare,
  studio,
  grid,
  vary,
  rebrand,
  sound,
  board,
  pick,
  compose: composeCommand,
  fal: falCommand,
};

const [name, ...rest] = process.argv.slice(2);
const command = name ? commands[name] : undefined;
if (!command) {
  console.log(HELP);
  process.exit(name && name !== "help" && name !== "--help" ? 1 : 0);
}
await command(parseArgs(rest));
