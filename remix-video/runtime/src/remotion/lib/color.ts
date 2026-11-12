// `alpha("#f2f2f2", 0.3)` -> "rgba(242,242,242,0.3)". Non-hex colors pass through.
export function alpha(color: string, a: number): string {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// A palette token ("bg", "fg", "accent", "muted") as the brand's color;
// "bg/0.8" is that token at 80% opacity; anything else passes through as CSS.
export function paint(palette: Record<"bg" | "fg" | "accent" | "muted", string>, color: string): string {
  const [token, a] = color.split("/");
  if (a !== undefined && token! in palette) return alpha(palette[token as keyof typeof palette], Number(a));
  return color in palette ? palette[color as keyof typeof palette] : color;
}
