// Opaque sRGB colors are used by the color pickers and built-in palettes.
export function luminance(hex: string): number {
  const color = /^#[\da-f]{6}$/i.test(hex) ? hex : "#fffdfa";
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function readableColor(
  background: string,
  preferred = "#514b49",
): string {
  if (contrastRatio(background, preferred) >= 4.5) return preferred;
  for (const color of ["#403438", "#fffaf6"])
    if (contrastRatio(background, color) >= 4.5) return color;
  // Black or white always provides at least 4.5:1 against an opaque sRGB color.
  return contrastRatio(background, "#000000") >=
    contrastRatio(background, "#ffffff")
    ? "#000000"
    : "#ffffff";
}
