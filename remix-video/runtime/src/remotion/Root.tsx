import type React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { EditSpec as EditSpecSchema, parseSpec, type EditSpec } from "../spec/schema";
import { Board, type BoardProps } from "./Board";
import { Edit } from "./Edit";

// Shown when Studio opens without --props: a two-scene placeholder.
const placeholder: EditSpec = EditSpecSchema.parse({
  version: 1,
  meta: { title: "placeholder", fps: 24, width: 1920, height: 1080, durationInFrames: 72 },
  brand: { name: "video-rea", wordmark: "VIDEO-REA", palette: {}, fonts: {} },
  assets: [],
  scenes: [
    { id: "glow", kind: "logoGlow", from: 0, duration: 36 },
    { id: "end", kind: "endCard", from: 36, duration: 36 },
  ],
});

// The spec arrives as input props (--props=spec.json); validate it once and
// take size, fps and length from it.
const calculateMetadata: CalculateMetadataFunction<EditSpec> = ({ props }) => {
  const spec = parseSpec(props);
  return {
    props: spec,
    fps: spec.meta.fps,
    width: spec.meta.width,
    height: spec.meta.height,
    durationInFrames: spec.meta.durationInFrames,
  };
};

const boardPlaceholder: BoardProps = { title: "board", fps: 24, width: 1920, height: 1080, durationInFrames: 24, sections: [{ id: "s1", name: "all", from: 0, duration: 24 }], tiles: [], audio: "a" };

export const Root: React.FC = () => (
  <>
  <Composition
    id="Edit"
    component={Edit as React.FC<EditSpec & Record<string, unknown>>}
    defaultProps={placeholder as EditSpec & Record<string, unknown>}
    calculateMetadata={calculateMetadata as CalculateMetadataFunction<EditSpec & Record<string, unknown>>}
    fps={placeholder.meta.fps}
    width={placeholder.meta.width}
    height={placeholder.meta.height}
    durationInFrames={placeholder.meta.durationInFrames}
  />
  <Composition
    id="Board"
    component={Board as unknown as React.FC<Record<string, unknown>>}
    defaultProps={boardPlaceholder as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const p = props as unknown as BoardProps;
      return { fps: p.fps, width: p.width, height: p.height, durationInFrames: p.durationInFrames };
    }}
    fps={24}
    width={1920}
    height={1080}
    durationInFrames={24}
  />
  </>
);
