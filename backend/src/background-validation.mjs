export function validImageAdjustment(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const bounded = (value, min, max) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;
  return (
    ["cover", "contain"].includes(value.fit) &&
    bounded(value.zoom, 100, 300) &&
    bounded(value.x, 0, 100) &&
    bounded(value.y, 0, 100)
  );
}
