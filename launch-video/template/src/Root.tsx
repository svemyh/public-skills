import type React from "react";
import { Composition } from "remotion";
import { LaunchFilm } from "./LaunchFilm";
import { CompiledFilm } from "./schema";

const defaultFilm: CompiledFilm = {
  fps: 60,
  width: 1920,
  height: 1080,
  durationInFrames: 60,
  brand: {
    name: "Acme",
    wordmark: "Acme",
    markSrc: "brand/mark.png",
    palette: { bg: "#000000", fg: "#FFFFFF", accent: "#2D74FF", muted: "#8A8A8A" },
    fonts: { display: "Inter", wordmark: "Inter" },
  },
  scenes: [],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="LaunchFilm"
    component={LaunchFilm}
    durationInFrames={defaultFilm.durationInFrames}
    fps={defaultFilm.fps}
    width={defaultFilm.width}
    height={defaultFilm.height}
    defaultProps={{ film: defaultFilm }}
    calculateMetadata={({ props }) => {
      const parsed = CompiledFilm.parse(props.film);
      return {
        fps: parsed.fps,
        width: parsed.width,
        height: parsed.height,
        durationInFrames: parsed.durationInFrames,
      };
    }}
  />
);
