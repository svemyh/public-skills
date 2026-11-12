// Default fal endpoints for swaps. They are starting points, not truth: the
// catalog changes monthly, so check `vrea fal search` and the model's
// https://fal.ai/models/<endpoint>/llms.txt before relying on one, and pin
// the endpoint and input per swap in plan.json when it matters.
//
// Each builder maps a swap to the endpoint's input schema.
export type SwapModel = {
  endpoint: string;
  build: (o: { prompt: string; reference?: string; image?: string; aspect: string; seconds: number }) => Record<string, unknown>;
};

export const MODELS: Record<string, SwapModel> = {
  // Reference-guided still: a new shot in the style of the source keyframe.
  "image-ref": {
    endpoint: "fal-ai/nano-banana-pro/edit",
    build: ({ prompt, reference, aspect }) => ({
      prompt,
      image_urls: reference ? [reference] : [],
      aspect_ratio: aspect,
      resolution: "2K",
      num_images: 1,
    }),
  },
  // Text-only still, when no reference should steer it.
  image: {
    endpoint: "fal-ai/nano-banana-pro",
    build: ({ prompt, aspect }) => ({ prompt, aspect_ratio: aspect, resolution: "2K", num_images: 1 }),
  },
  // Animate a generated still into a clip.
  video: {
    endpoint: "kling/v4/image-to-video",
    build: ({ prompt, image, seconds }) => ({
      prompt,
      start_image_url: image,
      duration: Math.max(3, Math.ceil(seconds)),
      resolution: "720p",
    }),
  },
};

export function aspectFor(width: number, height: number) {
  const r = width / height;
  const options: [string, number][] = [
    ["21:9", 21 / 9], ["16:9", 16 / 9], ["3:2", 3 / 2], ["4:3", 4 / 3], ["5:4", 5 / 4],
    ["1:1", 1], ["4:5", 4 / 5], ["3:4", 3 / 4], ["2:3", 2 / 3], ["9:16", 9 / 16],
  ];
  return options.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}
