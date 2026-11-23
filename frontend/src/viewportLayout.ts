export type ViewportPoint = { x: number; y: number };

export function viewportLayout({
  width,
  height,
  frameWidth,
  frameHeight,
  zoom = 1,
  pan = { x: 0, y: 0 },
  align = "center",
}: {
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  zoom?: number;
  pan?: ViewportPoint;
  align?: "start" | "center";
}) {
  const fitScale = Math.min(
    1,
    frameWidth / Math.max(1, width),
    frameHeight / Math.max(1, height),
  );
  const scale = fitScale * Math.max(1, Math.min(4, zoom));
  const overflowX = Math.max(0, width * scale - frameWidth);
  const overflowY = Math.max(0, height * scale - frameHeight);
  const clamp = (value: number, overflow: number) =>
    Math.max(-overflow / 2, Math.min(overflow / 2, value));
  const position = { x: clamp(pan.x, overflowX), y: clamp(pan.y, overflowY) };
  return {
    fitScale,
    scale,
    pan: position,
    x: (frameWidth - width * scale) / 2 + position.x,
    y:
      align === "start" && !overflowY
        ? 0
        : (frameHeight - height * scale) / 2 + position.y,
  };
}
