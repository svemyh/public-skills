import { existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { analyze } from "./analyze";
import { check, extract, scaffold } from "./assets";
import { board, composeCommand, Mix, saveMix } from "./compose";
import { ingest } from "./ingest";
import { parseArgs, Project, rel, resolveBrandKit, RUNTIME_ROOT, WORK_ROOT, type Args } from "./project";
import { rebrand } from "./rebrand";
import { render } from "./render";
import { sound } from "./sound";
import { vary } from "./vary";

// vrea pipeline <slug> [--url <video>] [--brand kit.json | --no-rebrand] [--variants a=x,b=y,c=z] [--compose]
//
// One video in, branded variants out. Runs every stage whose inputs exist and
// stops at the first one that needs an agent's judgment, saying what to write:
//   1. ingest + analyze (with word timings)        source/, analysis/
//   2. spec: build-spec.ts if present, else a verbatim scaffold to decompile
//   3. extract + check                             media/
//   4. rebrand with --brand <kit.json>             variants/<brand>/  (or skip with --no-rebrand)
//   5. each variant: plan.json -> vary, sound.json -> sound, render
//   6. board (labeled review video), then pick and compose
// Every stage is cached, so rerunning after an edit only redoes what changed.
export async function pipeline(args: Args) {
  const target = args.positional[0] ?? args.str("project") ?? "";
  const project = new Project(target);
  const run = (argv: string[]) => parseArgs(argv);
  const step = (n: number, what: string) => console.log(`\n== ${n}. ${what}`);

  step(1, "source and analysis");
  if (!existsSync(project.source)) {
    const url = args.str("url");
    if (!url) return todo(`no source video for ${project.slug}; pass --url <video url or file>`);
    await ingest(run([url, "--project", target]));
  }
  if (!existsSync(project.path("analysis", "shots.json"))) {
    await analyze(run(args.bool("no-transcribe") ? [target] : [target, "--transcribe"]));
  } else {
    console.log("analysis present");
  }

  step(2, "edit spec");
  const builder = project.path("build-spec.ts");
  if (existsSync(builder)) {
    await $`bun ${builder}`.cwd(WORK_ROOT).env({ ...process.env, NODE_PATH: join(RUNTIME_ROOT, "node_modules") });
  }
  if (!existsSync(project.specPath())) {
    await scaffold(run([target]));
    return todo(`spec.json is a verbatim scaffold. Decompile it (clone-video skill): rebuild graphics as scenes, give footage descriptions and baked keys, add sections. Then rerun this pipeline.`);
  }
  const spec = await project.spec();
  if (!spec.sections.length) console.log("note: no sections in spec.json; derived ones will be used (name them for better picking)");

  step(3, "extract and check");
  await extract(run([target]));
  await check(run([target]));

  step(4, "rebrand");
  let baseVariant: string | undefined;
  let variantPrefix = project.slug;
  if (args.bool("no-rebrand")) {
    console.log("skipping rebrand (--no-rebrand)");
  } else {
    const projectKit = project.path("brand.json");
    const kitArg = args.str("brand") ?? (existsSync(projectKit) ? projectKit : undefined);
    if (!kitArg) {
      return todo(
        `create ${rel(projectKit)} or pass --brand <kit.json> (see examples/brands/acme/brand.json in the skill runtime, or pass --no-rebrand to keep the original brand)`,
      );
    }
    const kitPath = resolveBrandKit(kitArg);
    if (!existsSync(kitPath)) return todo(`brand kit not found at ${kitArg}`);
    const kitJson = (await Bun.file(kitPath).json()) as { name: string };
    baseVariant = kitJson.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    variantPrefix = baseVariant;
    await rebrand(run([target, "--brand", kitPath]));
  }

  step(5, "variants");
  const mixFile = project.path("mix.json");
  if (!existsSync(mixFile) && !args.str("variants")) {
    return todo(`name the variants: --variants a=${variantPrefix}-one,b=${variantPrefix}-two,c=${variantPrefix}-three (each gets its own world, words, scene designs and sound)`);
  }
  // Variants named here may not exist yet: they are drafted below.
  const mix = existsSync(mixFile) ? Mix.parse(await Bun.file(mixFile).json()) : Mix.parse({ variants: {} });
  if (args.str("variants")) mix.variants = Object.fromEntries((args.str("variants") ?? "").split(",").map((p) => p.split("=") as [string, string]));
  await saveMix(project, mix);
  const missing: string[] = [];
  for (const name of Object.values(mix.variants)) {
    const plan = project.path("variants", name, "plan.json");
    if (!existsSync(plan)) {
      const draftArgs = baseVariant ? [target, "--name", name, "--draft", "--base", baseVariant] : [target, "--name", name, "--draft"];
      await vary(run(draftArgs));
      missing.push(`${rel(plan)}: give it a world, stock queries (as: "stock") for photographic shots, drawn panels and glyph icons in remix, new key words (vary-video skill)`);
      continue;
    }
    await vary(run([target, "--name", name]));
    const soundPlan = project.path("variants", name, "sound.json");
    if (existsSync(soundPlan)) await sound(run([target, "--variant", name]));
    else missing.push(`${rel(soundPlan)}: music, voice and lines, effects (compose-video skill, step 3)`);
    await render(run([target, "--variant", name]));
  }
  if (missing.length) return todo(`write these, then rerun:\n  ${missing.join("\n  ")}`);

  step(6, "board, pick, compose");
  await board(run([target]));
  if (args.bool("compose") || Object.keys(mix.picks).length) await composeCommand(run([target]));
  console.log(`\ndone. Review ${rel(project.path("renders", "board.mp4"))}, then pick: vrea pick ${target}  (http://127.0.0.1:3160/)`);
}

function todo(message: string) {
  console.log(`\nNEXT (needs a person or agent): ${message}`);
}
