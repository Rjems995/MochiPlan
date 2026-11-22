import type { BackgroundImageAdjustment } from "./model";

export const defaultImageAdjustment: BackgroundImageAdjustment = {
  fit: "cover",
  zoom: 100,
  x: 50,
  y: 50,
};
// Existing images used CSS's default top-left alignment.
export const legacyImageAdjustment: BackgroundImageAdjustment = {
  fit: "cover",
  zoom: 100,
  x: 0,
  y: 0,
};
export function validImageAdjustment(
  value: unknown,
): value is BackgroundImageAdjustment | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const adjustment = value as Record<string, unknown>;
  const bounded = (value: unknown, min: number, max: number) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;
  return (
    ["cover", "contain"].includes(adjustment.fit as string) &&
    bounded(adjustment.zoom, 100, 300) &&
    bounded(adjustment.x, 0, 100) &&
    bounded(adjustment.y, 0, 100)
  );
}

export function panBackground(
  adjustment: BackgroundImageAdjustment,
  natural: { width: number; height: number },
  frame: { width: number; height: number },
  delta: { x: number; y: number },
): BackgroundImageAdjustment {
  const fit = adjustment.fit === "cover" ? Math.max : Math.min;
  const scale =
    (fit(frame.width / natural.width, frame.height / natural.height) *
      adjustment.zoom) /
    100;
  const move = (position: number, distance: number, overflow: number) =>
    Math.abs(overflow) < 1
      ? position
      : Math.round(
          Math.max(0, Math.min(100, position - (distance / overflow) * 100)) *
            10,
        ) / 10;
  return {
    ...adjustment,
    x: move(adjustment.x, delta.x, natural.width * scale - frame.width),
    y: move(adjustment.y, delta.y, natural.height * scale - frame.height),
  };
}
