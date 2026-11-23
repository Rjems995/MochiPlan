import type { CanvasSize, View } from "./model";
import { exportLayoutWidth } from "./services/plannerExport.ts";

export const plannerSizes = [
  { id: "desktop", name: "Desktop", width: 1920, height: 1080 },
  { id: "tablet", name: "Tablet", width: 2048, height: 1536 },
  { id: "phone", name: "Phone", width: 1080, height: 1920 },
  { id: "square", name: "Square", width: 1080, height: 1080 },
  { id: "a4-landscape", name: "A4 landscape", width: 3508, height: 2480 },
  { id: "a4-portrait", name: "A4 portrait", width: 2480, height: 3508 },
] as const;

export function validCanvasSize(
  value: unknown,
): value is CanvasSize | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const size = value as Record<string, unknown>;
  return (
    typeof size.width === "number" &&
    typeof size.height === "number" &&
    Number.isInteger(size.width) &&
    Number.isInteger(size.height) &&
    size.width >= 320 &&
    size.width <= 4096 &&
    size.height >= 320 &&
    size.height <= 4096 &&
    size.width * size.height <= 16000000
  );
}

export function plannerLayout(size: CanvasSize | undefined, view: View) {
  if (!size) return undefined;
  const width = Math.min(size.width, exportLayoutWidth(view));
  return { width, height: (width * size.height) / size.width };
}
