// bun .agents/skills/launch-video/scripts/post.ts <x.com status url>
// Prints the post's text, author, date, stats and media as JSON, through the
// public fxtwitter API (no login). Paste the text into launch.json's notes
// or use it as the brief for the beats.
const url = process.argv[2];
const m = url?.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/);
if (!m) {
  console.error("usage: bun .agents/skills/launch-video/scripts/post.ts https://x.com/<user>/status/<id>");
  process.exit(1);
}
const res = await fetch(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`);
const data = (await res.json()) as { code: number; message?: string; tweet?: Record<string, unknown> };
if (data.code !== 200 || !data.tweet) {
  console.error(`fxtwitter: ${data.code} ${data.message ?? ""}`);
  process.exit(1);
}
const t = data.tweet as { text: string; created_at: string; views?: number; likes?: number; author: { screen_name: string; name: string }; media?: { all?: { type: string; url: string; duration?: number }[] } };
console.log(
  JSON.stringify(
    {
      url,
      author: `@${t.author.screen_name} (${t.author.name})`,
      created_at: t.created_at,
      views: t.views,
      likes: t.likes,
      text: t.text,
      media: (t.media?.all ?? []).map((x) => ({ type: x.type, url: x.url, duration: x.duration })),
    },
    null,
    2,
  ),
);

export {};
