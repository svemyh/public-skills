import type React from "react";
import { useMemo } from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { EditSpec, Overlay, Scene } from "../spec/schema";
import { assetOf, bakedAt, bakingAssets } from "../spec/schema";
import { isBaked, SpecContext, useEdit } from "./lib/context";
import { resolveFonts } from "./lib/fonts";
import { Glitch, gradeFilter, LayerView } from "./layers/Layers";
import { EndCard, LogoFlash, LogoGlow, Media, Solid } from "./scenes/Basic";
import { CodeScroll } from "./scenes/CodeScroll";
import { CardCollage, PanelCollage } from "./scenes/Collages";
import { HalftoneRing } from "./scenes/HalftoneRing";
import { IconSwarm } from "./scenes/IconSwarm";
import { Laptop, MarkFillScene } from "./scenes/Laptop";
import { MarkMorph } from "./scenes/MarkMorph";
import { PixelWipe } from "./scenes/PixelWipe";
import { Screen } from "./scenes/Screen";
import { Promo } from "./scenes/Promo";
import { Stage } from "./scenes/Stage";
import { TaskFeed } from "./scenes/TaskFeed";

// Renders an edit spec: scenes in sequence, each with its own layers, then
// timeline-wide overlays, then the soundtrack bed and timed sounds.
export const Edit: React.FC<EditSpec> = (spec) => {
  const fonts = useMemo(() => resolveFonts(spec.brand.fonts), [spec.brand.fonts]);
  return (
    <SpecContext.Provider value={{ spec, fonts }}>
      <AbsoluteFill style={{ background: spec.brand.palette.bg }}>
        {spec.scenes.map((scene) => (
          <Sequence key={scene.id} name={`${scene.id} · ${scene.kind}`} from={scene.from} durationInFrames={scene.duration} premountFor={12}>
            <SceneView scene={scene} />
          </Sequence>
        ))}
        {spec.overlays.map((overlay, i) => (
          <Sequence key={i} name={`overlay · ${overlay.layer.kind}${overlay.layer.key ? ` (${overlay.layer.key})` : ""}`} from={overlay.from} durationInFrames={overlay.duration}>
            <OverlayView overlay={overlay} />
          </Sequence>
        ))}
        {spec.audio && <Bed spec={spec} />}
        {spec.sounds.map((sound, i) => (
          <Sequence key={`sound${i}`} name={`${sound.kind} · ${sound.text || sound.src}`} from={sound.from} durationInFrames={sound.duration} layout="none">
            <Audio src={staticFile(sound.src)} volume={sound.volume} trimBefore={sound.trimBefore || undefined} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </SpecContext.Provider>
  );
};

function sceneBaked(spec: EditSpec, scene: Scene): Set<string> {
  return new Set(bakingAssets(scene).flatMap((id) => assetOf(spec, id)?.baked ?? []));
}

const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const { spec } = useEdit();
  const baked = sceneBaked(spec, scene);
  const layers = scene.layers.filter((l) => !isBaked(l.key, baked));
  const filter = gradeFilter(layers);
  const glitch = layers.find((l) => l.kind === "glitch");
  let content = (
    <AbsoluteFill style={{ filter }}>
      <SceneContent scene={scene} />
    </AbsoluteFill>
  );
  if (glitch?.kind === "glitch") content = <Glitch layer={glitch}>{content}</Glitch>;
  return (
    <AbsoluteFill>
      {content}
      {layers
        .filter((l) => l.kind !== "grade" && l.kind !== "glitch")
        .map((l, i) => (
          <LayerView key={i} layer={l} />
        ))}
    </AbsoluteFill>
  );
};

const SceneContent: React.FC<{ scene: Scene }> = ({ scene }) => {
  switch (scene.kind) {
    case "solid":
      return <Solid scene={scene} />;
    case "pixelWipe":
      return <PixelWipe scene={scene} />;
    case "media":
      return <Media scene={scene} />;
    case "logoFlash":
      return <LogoFlash scene={scene} />;
    case "panelCollage":
      return <PanelCollage scene={scene} />;
    case "codeScroll":
      return <CodeScroll scene={scene} />;
    case "halftoneRing":
      return <HalftoneRing scene={scene} />;
    case "iconSwarm":
      return <IconSwarm scene={scene} />;
    case "logoGlow":
      return <LogoGlow scene={scene} />;
    case "cardCollage":
      return <CardCollage scene={scene} />;
    case "endCard":
      return <EndCard scene={scene} />;
    case "screen":
      return <Screen scene={scene} />;
    case "laptop":
      return <Laptop scene={scene} />;
    case "markFill":
      return <MarkFillScene scene={scene} />;
    case "markMorph":
      return <MarkMorph scene={scene} />;
    case "taskFeed":
      return <TaskFeed scene={scene} />;
    case "stage":
      return <Stage scene={scene} />;
    case "promo":
      return <Promo scene={scene} />;
  }
};

// An overlay hides itself on frames whose scene already bakes its key.
const OverlayView: React.FC<{ overlay: Overlay }> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { spec } = useEdit();
  if (isBaked(overlay.layer.key, bakedAt(spec, overlay.from + frame))) return null;
  return <LayerView layer={overlay.layer} />;
};

// The bed, ducked under voice-over: volume eases to `duck` over 4 frames
// around every vo cue.
const Bed: React.FC<{ spec: EditSpec }> = ({ spec }) => {
  const audio = spec.audio!;
  const fps = spec.meta.fps;
  const cues = spec.sounds.filter((s) => s.kind === "vo").map((s) => [s.from, s.from + (s.duration ?? 3 * fps)] as const);
  const volume = (f: number) => {
    if (audio.duck >= 1 || !cues.length) return audio.volume;
    const near = Math.min(...cues.map(([a, b]) => (f < a ? a - f : f > b ? f - b : 0)));
    const k = Math.min(1, near / 4);
    return audio.volume * (audio.duck + (1 - audio.duck) * k);
  };
  return <Audio src={staticFile(audio.src)} volume={volume} trimBefore={audio.trimBefore || undefined} />;
};
