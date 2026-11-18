// Keep the existing emoji tokens as storage keys so older planners and backups
// use the same illustrations without changing their saved data.
export const stickerCatalog = [
  { key: "strawberry", emoji: "🍓", name: "Strawberry" },
  { key: "matcha", emoji: "🍵", name: "Matcha" },
  { key: "tulip", emoji: "🌷", name: "Tulip" },
  { key: "daisy", emoji: "🌼", name: "Daisy" },
  { key: "blossom", emoji: "🌸", name: "Blossom" },
  { key: "cherries", emoji: "🍒", name: "Cherries" },
  { key: "cat", emoji: "🐱", name: "Cat" },
  { key: "bear", emoji: "🐻", name: "Bear" },
  { key: "bunny", emoji: "🐰", name: "Bunny" },
  { key: "teddy", emoji: "🧸", name: "Teddy bear" },
  { key: "star", emoji: "⭐", name: "Star" },
  { key: "sparkles", emoji: "✨", name: "Sparkles" },
  { key: "white-heart", emoji: "🤍", name: "Cream heart" },
  { key: "pink-heart", emoji: "💗", name: "Pink heart" },
  { key: "cloud", emoji: "☁️", name: "Cloud" },
  { key: "rainbow", emoji: "🌈", name: "Rainbow" },
  { key: "coffee", emoji: "☕", name: "Coffee" },
  { key: "books", emoji: "📚", name: "Books" },
  { key: "pencil", emoji: "✏️", name: "Pencil" },
  { key: "croissant", emoji: "🥐", name: "Croissant" },
  { key: "cake", emoji: "🍰", name: "Cake" },
  { key: "bow", emoji: "🎀", name: "Bow" },
  { key: "butterfly", emoji: "🦋", name: "Butterfly" },
  { key: "leaves", emoji: "🌿", name: "Leaves" },
  { key: "moon", emoji: "🌙", name: "Moon" },
  { key: "boba", emoji: "🧋", name: "Bubble tea" },
  { key: "mushroom", emoji: "🍄", name: "Mushroom" },
  { key: "paw", emoji: "🐾", name: "Paw prints" },
  { key: "candle", emoji: "🕯️", name: "Candle" },
  { key: "sunflower", emoji: "🌻", name: "Sunflower" },
] as const;
const extraArt = [
  { key: "blueberries", emoji: "🫐", name: "Blueberries" },
  { key: "peach", emoji: "🍑", name: "Peach" },
  { key: "scroll", emoji: "📜", name: "Parchment" },
  { key: "lavender", emoji: "🪻", name: "Lavender" },
  { key: "palette", emoji: "🎨", name: "Artist palette" },
] as const;
const normalize = (token: string) => token.replace(/\ufe0f/g, "");
export function illustrationFor(token: string) {
  const value = normalize(token === "✎" ? "✏" : token);
  return (
    [...stickerCatalog, ...extraArt].find(
      (s) => normalize(s.emoji) === value,
    ) || { key: "keepsake", emoji: token, name: "Keepsake" }
  );
}
