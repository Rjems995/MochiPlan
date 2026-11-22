export function validTextBoxes(value) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 100) return false;
  const ids = new Set();
  const number = (v, min, max) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  return value.every((box) => {
    if (
      !box ||
      typeof box !== "object" ||
      typeof box.id !== "string" ||
      !box.id ||
      box.id.length > 200 ||
      ids.has(box.id)
    )
      return false;
    ids.add(box.id);
    return (
      typeof box.text === "string" &&
      box.text.length <= 300 &&
      ["Caveat", "Nunito", "Georgia", "DM Sans"].includes(box.font) &&
      number(box.fontSize, 14, 96) &&
      typeof box.color === "string" &&
      /^#[a-f\d]{6}$/i.test(box.color) &&
      typeof box.bold === "boolean" &&
      typeof box.italic === "boolean" &&
      ["left", "center", "right"].includes(box.alignment) &&
      number(box.x, 0, 100) &&
      number(box.y, 0, 100) &&
      number(box.width, 12, 90) &&
      number(box.rotation, -180, 180)
    );
  });
}
