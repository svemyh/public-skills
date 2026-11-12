---
name: compose-video
description: Adds per-variant sound design (ElevenLabs voice-over, sound effects, section-aligned music, and rapid-cut sound mixes), renders a labeled side-by-side review board (`board.mp4`), serves a local keyboard section picker (`s1b s2a s3c`) with remarks, and composes the chosen sections into one finished video. Use when comparing variants section by section, adding voice-over/music/SFX, or mixing sections across variants.
metadata:
  version: "2.0.0"
---

# Compose a Video from Variants and Sound

Runs the multi-variant review and assembly loop:
**sectioned clone → rebrand → variants (`a`, `b`, `c`) → per-variant sound → labeled review board → keyboard picker → composed master → beat-aligned trims.**

`<SKILL_DIR>` below is the directory containing this `SKILL.md` (installed
beside [`remix-video`](../remix-video/SKILL.md) and [`video-tools`](../video-tools/SKILL.md)).

## 1. Ensure Clean Timeline `sections`

Give `./projects/<slug>/spec.json` explicit `sections` tiling `0..durationInFrames`
on scene boundaries (`open`, `hook`, `workflow`, `montage`, `end-card`). Run:

```bash
bun <SKILL_DIR>/scripts/vrea.ts analyze <slug> --transcribe   # word timings for VO slots + speech conflict checks
bun <SKILL_DIR>/scripts/vrea.ts check <slug>
```

## 2. Build Three Distinct Variants (`a`, `b`, `c`)

Follow [`rebrand-video`](../rebrand-video/SKILL.md) then [`vary-video`](../vary-video/SKILL.md)
with `"base": "<brand>"` so `./projects/<slug>/variants/<v>/spec.json` exists for
three genuinely distinct creative worlds (`a`, `b`, `c`).

## 3. Sound Each Variant (`sound.json`)

Write `./projects/<slug>/variants/<name>/sound.json`:

```json
{
  "audio": "replace",
  "duck": 0.45,
  "music": {
    "styles": ["minimal electronic", "96 bpm", "warm analog pulse", "clean sub bass"],
    "negative": ["harsh distortion", "stadium rock"],
    "sections": {
      "s1": ["sparse atmospheric intro"],
      "s2": ["driving rhythmic groove"],
      "s4": ["clean resonant outro resolve"]
    },
    "volume": 0.8
  },
  "voice": { "id": "<elevenlabs_voice_id>", "owner": "<optional_public_owner_id>" },
  "vo": [
    { "slot": 0, "text": "Hand the issue over." },
    { "slot": 1, "text": "Wake up to a verified pull request." }
  ],
  "sfx": [
    { "at": 0, "seconds": 1.0, "text": "subtle crisp analog shutter click" },
    { "at": 180, "seconds": 1.5, "text": "warm low sub impact transition" }
  ]
}
```

Key sound rules:
- **`audio`**: `"keep"` (keeps `audio/source.m4a` — automatically refused by
  `vrea sound` if the source transcript speaks the old brand name or changed
  on-screen words!), `"replace"` (composes section-aligned ElevenLabs `music_v2_5`
  chunks >= 3 s and loudness-matches them to the source LUFS), or `"none"`.
- **`voice` & `vo`**: search voices with `bun <SKILL_DIR>/scripts/vrea.ts sound voices "calm editorial narrator" [--gender female]`.
  `slot: n` lands each line on the exact frame where the original video's `n`-th
  spoken phrase started; `at` specifies an explicit frame.
- **Rapid-fire montage cut sounds**: when a montage cuts every 1–3 frames, mix
  subtle `-7 dB` in-band cut ticks/bells via `../video-tools/scripts/music/cuts-mix.ts`
  and verify frame sync via `../video-tools/scripts/music/check-sync.ts` (see
  [`video-tools`](../video-tools/SKILL.md)).

Apply and render each variant:

```bash
bun <SKILL_DIR>/scripts/vrea.ts sound <slug> --variant <name> --dry-run
bun <SKILL_DIR>/scripts/vrea.ts sound <slug> --variant <name>
bun <SKILL_DIR>/scripts/vrea.ts render <slug> --variant <name>
```

## 4. Render the Review Board & Launch the Keyboard Picker

```bash
bun <SKILL_DIR>/scripts/vrea.ts board <slug> --variants a=<v1>,b=<v2>,c=<v3> [--audio a]
bun <SKILL_DIR>/scripts/vrea.ts pick <slug> --port 3160
```

- `board` renders `./projects/<slug>/renders/board.mp4` showing all variants in
  sync with tile codes (`s1a`, `s2b`, `s3c`) and section banners.
- `pick` starts a local web picker at `http://127.0.0.1:3160/` (never auto-opens
  a browser; share the URL with the reviewer):
  - `↑`/`↓` or `j`/`k`: step between sections and preview row
  - `a`/`b`/`c` or `1`/`2`/`3` or `←`/`→`: choose variant for the active section
  - `Space`: replay row (audio plays from picked tile)
  - `p`: preview full cut-by-cut combination
  - `r`: attach revision remark to section (`Cmd/Ctrl+Enter` saves to `mix.json`)
  - `m`: cycle music mode (`majority` bed, `follow` per-section bed, or single variant letter)
  - `Enter`: compose and render `./projects/<slug>/renders/mix.mp4`

## 5. Compose from Codes & Act on Remarks

```bash
bun <SKILL_DIR>/scripts/vrea.ts compose <slug> --picks "s1b s2a s3c s4b" [--music majority|follow|a] [--name mix]
```

If `mix.json` contains remarks, update only the affected variant's `plan.json` /
`sound.json`, rerun `vary` + `sound` + `render`, clear handled remarks in
`mix.json`, and re-run `compose`.

## 6. Beat-Aligned Section Removal

To drop a section from a finished render without throwing later cuts off the
music beat:
1. Include any transition tail (dissolve/glitch frames carrying the removed
   section's imagery).
2. Round the removed frame span (`B - A`) to an integer multiple of
   `beatPeriodFrames` from `analysis/audio.json`, ending on an onset frame.
3. Trim video and audio together with 6 ms `afade` micro-fades across the splice
   (substitute numeric frame/second values for `A`, `B`, `A_SEC`, `B_SEC`):

```bash
ffmpeg -y -i renders/mix.mp4 -filter_complex \
  "[0:v]trim=end_frame=A,setpts=PTS-STARTPTS[v1];[0:v]trim=start_frame=B,setpts=PTS-STARTPTS[v2];[v1][v2]concat=n=2:v=1:a=0[v];[0:a]atrim=0:A_SEC,asetpts=PTS-STARTPTS,afade=t=out:st=A_FADE:d=0.006[a1];[0:a]atrim=start=B_SEC,asetpts=PTS-STARTPTS,afade=t=in:d=0.006[a2];[a1][a2]concat=n=2:v=0:a=1[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 16 -c:a aac -b:a 256k renders/mix-trimmed.mp4
```

## 7. Report with Full Real Paths

Report full absolute paths (`realpath`) for `board.mp4`, the composed render,
each variant render, the active picker URL, chosen section codes, voice/music
settings, and API credits used.
