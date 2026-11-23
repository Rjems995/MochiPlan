export function validCanvasSize(size) {
  if (size === undefined) return true;
  return (
    !!size &&
    typeof size === "object" &&
    !Array.isArray(size) &&
    Number.isInteger(size.width) &&
    Number.isInteger(size.height) &&
    size.width >= 320 &&
    size.width <= 4096 &&
    size.height >= 320 &&
    size.height <= 4096 &&
    size.width * size.height <= 16000000
  );
}
