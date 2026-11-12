import { createContext, useContext } from "react";
import { staticFile } from "remotion";
import type { Asset, EditSpec } from "../../spec/schema";
import { assetOf } from "../../spec/schema";
import type { Fonts } from "./fonts";

export type EditContext = { spec: EditSpec; fonts: Fonts };

export const SpecContext = createContext<EditContext | null>(null);

export function useEdit(): EditContext {
  const ctx = useContext(SpecContext);
  if (!ctx) throw new Error("useEdit outside <Edit>");
  return ctx;
}

export function useAsset(id: string | undefined): Asset | undefined {
  const { spec } = useEdit();
  return assetOf(spec, id);
}

export function mediaUrl(asset: Asset) {
  return /^https?:/.test(asset.src) ? asset.src : staticFile(asset.src);
}

// A layer is skipped when its key is burned into the pixels underneath.
export function isBaked(key: string | undefined, baked: Set<string>) {
  return key !== undefined && (baked.has(key) || baked.has("*"));
}
