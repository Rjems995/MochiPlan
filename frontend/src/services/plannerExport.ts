import type { View } from "../model";

// Export layout is independent of the editor's available screen space.
export const exportHourHeight = 72;
export function exportLayoutWidth(view: View) {
  return view === "daily" ? 640 : view === "list" ? 1100 : 1280;
}

export function plannerImageSize(
  sourceWidth: number,
  sourceHeight: number,
  requestedWidth: number,
) {
  if (
    ![sourceWidth, sourceHeight, requestedWidth].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw Error("The planner is not ready to export.");
  const scale = Math.min(
    Math.min(4096, Math.max(320, requestedWidth)) / sourceWidth,
    8192 / sourceHeight,
    Math.sqrt(16000000 / (sourceWidth * sourceHeight)),
  );
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}
