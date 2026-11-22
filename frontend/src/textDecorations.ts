import type { TextBox } from "./model";

export const textFonts = [
  { font: "Caveat", label: "Handwritten" },
  { font: "Nunito", label: "Soft & round" },
  { font: "Georgia", label: "Storybook" },
  { font: "DM Sans", label: "Simple & sweet" },
] as const;
export const textFontFamily = (font: string) =>
  `'${font}', ${font === "Caveat" ? "cursive" : font === "Georgia" ? "serif" : "sans-serif"}`;
export function newTextBox(id: string): TextBox {
  return {
    id,
    text: "a little note ♡",
    font: "Caveat",
    fontSize: 32,
    color: "#98516b",
    bold: false,
    italic: false,
    alignment: "center",
    x: 35,
    y: 7,
    width: 30,
    rotation: 0,
  };
}
export function validTextBoxes(value: unknown): value is TextBox[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 100) return false;
  const ids = new Set();
  const number = (v: unknown, min: number, max: number) =>
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
      textFonts.some((option) => option.font === box.font) &&
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
