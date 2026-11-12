import type React from "react";
import { Img } from "remotion";
import { mediaUrl, useAsset, useEdit } from "./context";

// Open hexagon: a pointy-top outline cut by a slit on the upper-left edge and
// one low on the right side, with the bottom chevron starting just inside the
// left bar. Three strokes, so it scales crisply and recolors with the brand.
export const HexagonMark: React.FC<{ size: number; color: string; style?: React.CSSProperties }> = ({ size, color, style }) => {
  const w = size * 0.88;
  return (
    <svg width={w} height={size} viewBox="-1 0 90 100" style={style}>
      <g fill="none" stroke={color} strokeWidth={12} strokeLinejoin="miter" strokeLinecap="butt">
        <path d="M 32.6 12.6 L 44 6 L 79 26 L 79 56" />
        <path d="M 26.4 16.2 L 9 26 L 9 78" />
        <path d="M 18.5 79.4 L 44 94 L 79 74 L 79 61" />
      </g>
    </svg>
  );
};

// The brand's mark: built-in hexagon or an image asset. Given a color, an
// image mark is used as a mask and painted, so a dark mark reads on night
// footage too.
export const BrandMark: React.FC<{ size: number; color?: string; style?: React.CSSProperties }> = ({ size, color, style }) => {
  const { spec } = useEdit();
  const asset = useAsset(spec.brand.markAsset);
  if (spec.brand.mark === "asset" && asset) {
    if (color) return <MarkShape size={size} style={style}><div style={{ position: "absolute", inset: 0, background: color }} /></MarkShape>;
    return <Img src={mediaUrl(asset)} style={{ height: size, width: "auto", ...style }} />;
  }
  return <HexagonMark size={size} color={color ?? spec.brand.palette.fg} style={style} />;
};

// Anything clipped to the mark's silhouette, `size` tall: an image mark's
// alpha, or the hexagon's strokes.
export const MarkShape: React.FC<{ size: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ size, style, children }) => {
  const { spec } = useEdit();
  const asset = useAsset(spec.brand.markAsset);
  const image = spec.brand.mark === "asset" && asset;
  const hexagon = `url("data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 0 90 100"><g fill="none" stroke="black" stroke-width="12"><path d="M 32.6 12.6 L 44 6 L 79 26 L 79 56"/><path d="M 26.4 16.2 L 9 26 L 9 78"/><path d="M 18.5 79.4 L 44 94 L 79 74 L 79 61"/></g></svg>',
  )}")`;
  const mask = image ? `url("${mediaUrl(asset)}")` : hexagon;
  // An image mark keeps its own proportions inside a box a little wider
  // than tall; the hexagon is 0.88 wide.
  const width = size * (image ? 1.25 : 0.88);
  const fit = { maskSize: "contain", WebkitMaskSize: "contain", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" } as const;
  return (
    <div style={{ position: "relative", width, height: size, overflow: "hidden", maskImage: mask, WebkitMaskImage: mask, ...fit, ...style }}>
      {children}
    </div>
  );
};
