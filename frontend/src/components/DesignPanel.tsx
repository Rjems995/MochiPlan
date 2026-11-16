import { useState, useRef } from "react";
import {
  Palette,
  Sparkles,
  SlidersHorizontal,
  Check,
  ChevronDown,
  Upload,
  X,
  Heart,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  ImagePlus,
} from "lucide-react";
import {
  type Schedule,
  type Design,
  type Sticker,
  type Preferences,
  themes,
  uid,
} from "../model";
import { Mochi } from "./Artwork";
import { Modal } from "./Modal";
type Props = {
  schedule: Schedule;
  onDesign: (patch: Partial<Design>) => void;
  onTheme: (id: string) => void;
  selectedSticker: string | null;
  onSelectSticker: (id: string | null) => void;
  preferences: Preferences;
  onPreferences: (patch: Partial<Preferences>) => void;
  notify: (text: string) => void;
};
const stickers = [
  "🍓",
  "🍵",
  "🌷",
  "🌼",
  "🌸",
  "🍒",
  "🐱",
  "🐻",
  "🐰",
  "🧸",
  "⭐",
  "✨",
  "🤍",
  "💗",
  "☁️",
  "🌈",
  "☕",
  "📚",
  "✏️",
  "🥐",
  "🍰",
  "🎀",
  "🦋",
  "🌿",
  "🌙",
  "🧋",
  "🍄",
  "🐾",
  "🕯️",
  "🌻",
];
export function DesignPanel({
  schedule,
  onDesign,
  onTheme,
  selectedSticker,
  onSelectSticker,
  preferences,
  onPreferences,
  notify,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("My little palette");
  const [customBackground, setCustomBackground] = useState(
    schedule.design.background,
  );
  const [customAccent, setCustomAccent] = useState("#b5839e");
  const [customColors, setCustomColors] = useState([...themes[0].palette]);
  const [tab, setTab] = useState<"themes" | "stickers" | "layout">("themes");
  const [all, setAll] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const d = schedule.design;
  const selected = d.stickers.find((s) => s.id === selectedSticker);
  const updateSticker = (patch: Partial<Sticker>) =>
    onDesign({
      stickers: d.stickers.map((s) =>
        s.id === selectedSticker ? { ...s, ...patch } : s,
      ),
    });
  return (
    <aside className="design-panel">
      <div className="design-panel-top">
        <h3>
          Make it yours<span>✧</span>
        </h3>
        <p>A little touch of you.</p>
      </div>
      <div className="design-tabs">
        {(
          [
            { id: "themes", icon: Palette, label: "Themes" },
            { id: "stickers", icon: Sparkles, label: "Stickers" },
            { id: "layout", icon: SlidersHorizontal, label: "Layout" },
          ] as const
        ).map((t) => (
          <button
            className={tab === t.id ? "active" : ""}
            key={t.id}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {tab === "themes" && (
        <div className="panel-content">
          <div className="section-label">
            A PALETTE FOR YOUR MOOD
            <Heart size={12} />
          </div>
          <div className="theme-list">
            {[...themes, ...(preferences.customThemes || [])]
              .slice(0, all ? 100 : 4)
              .map((t) => (
                <div
                  className={`theme-choice ${d.theme === t.id ? "selected" : ""}`}
                  key={t.id}
                >
                  <button onClick={() => onTheme(t.id)}>
                    <span className="theme-emoji" style={{ background: t.bg }}>
                      {t.emoji}
                    </span>
                    <span>
                      <strong>{t.name}</strong>
                      <span className="tiny-palette">
                        {t.palette.slice(0, 4).map((c) => (
                          <i key={c} style={{ background: c }} />
                        ))}
                      </span>
                    </span>
                    {d.theme === t.id && <Check size={14} />}
                  </button>
                  <button
                    className="favorite-theme"
                    aria-label={`Favorite ${t.name}`}
                    onClick={() =>
                      onPreferences({
                        favoriteThemes: preferences.favoriteThemes.includes(
                          t.id,
                        )
                          ? preferences.favoriteThemes.filter((v) => v !== t.id)
                          : [...preferences.favoriteThemes, t.id],
                      })
                    }
                  >
                    <Heart
                      size={11}
                      fill={
                        preferences.favoriteThemes.includes(t.id)
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </div>
              ))}
          </div>
          <button
            className="text-button see-themes"
            onClick={() => setAll(!all)}
          >
            {all ? "Show less" : "Explore all 8 themes"}
            <ChevronDown
              size={13}
              style={{ transform: all ? "rotate(180deg)" : undefined }}
            />
          </button>
          <button
            className="text-button custom-theme-button"
            onClick={() => setCustomOpen(true)}
          >
            <Palette size={12} />
            Create a custom palette
          </button>
          <div className="panel-divider" />
          <span className="field-label">Your little canvas</span>
          <p className="panel-tip">
            Use the pencil above your planner to edit its title.
          </p>
          <label className="field-label">
            Background
            <span className="background-row">
              <input
                aria-label="Custom background color"
                type="color"
                value={d.background}
                onChange={(ev) =>
                  onDesign({ background: ev.target.value, theme: "custom" })
                }
              />
              <span>{d.background.toUpperCase()}</span>
              <label className="small-toggle">
                <input
                  type="checkbox"
                  checked={d.gradient}
                  onChange={(ev) => onDesign({ gradient: ev.target.checked })}
                />
                Gradient
              </label>
            </span>
          </label>
          <fieldset className="field-label">
            <legend>A little texture</legend>
            <div className="pattern-choices">
              {["none", "dots", "grid"].map((p) => (
                <button
                  key={p}
                  onClick={() => onDesign({ pattern: p })}
                  className={`${p}-sample ${d.pattern === p ? "selected" : ""}`}
                  aria-label={`${p} background pattern`}
                >
                  <span>
                    {p === "none" ? "Aa" : p === "dots" ? "· · ·" : "▦"}
                  </span>
                  <small>
                    {p === "none" ? "Plain" : p === "dots" ? "Dots" : "Grid"}
                  </small>
                </button>
              ))}
            </div>
          </fieldset>
          <button
            className="upload-background"
            onClick={() => upload.current?.click()}
          >
            <ImagePlus size={15} />
            {d.image ? "Replace background" : "Upload a background"}
          </button>
          {d.image && (
            <button
              className="text-button"
              onClick={() => onDesign({ image: "" })}
            >
              Remove image
              <X size={12} />
            </button>
          )}
          <input
            ref={upload}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                notify("Choose an image smaller than 5 MB.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => onDesign({ image: String(reader.result) });
              reader.onerror = () =>
                notify("That image could not be opened. Please try another.");
              reader.readAsDataURL(file);
              ev.target.value = "";
            }}
          />
        </div>
      )}
      {tab === "stickers" && (
        <div className="panel-content">
          <div className="section-label">A LITTLE EXTRA HAPPY</div>
          <p className="panel-tip">
            Tap to add. Drag on your planner to find its happy place.
          </p>
          <div className="sticker-collection">
            {stickers.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  const s: Sticker = {
                    id: uid(),
                    emoji,
                    x: 74 + Math.random() * 10,
                    y: 4 + Math.random() * 10,
                    size: 36,
                    rotation: -12 + Math.random() * 24,
                  };
                  onDesign({ stickers: [...d.stickers, s] });
                  onSelectSticker(s.id);
                }}
                aria-label={`Add ${emoji} sticker`}
              >
                {emoji}
              </button>
            ))}
          </div>
          {selected && (
            <div className="sticker-tools">
              <h4>{selected.emoji} Selected sticker</h4>
              <label className="field-label">
                Size <span>{selected.size}px</span>
                <input
                  type="range"
                  min="18"
                  max="100"
                  value={selected.size}
                  onChange={(ev) =>
                    updateSticker({ size: Number(ev.target.value) })
                  }
                />
              </label>
              <label className="field-label">
                Rotation <span>{Math.round(selected.rotation)}°</span>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={selected.rotation}
                  onChange={(ev) =>
                    updateSticker({ rotation: Number(ev.target.value) })
                  }
                />
              </label>
              <button
                className="danger-button"
                onClick={() => {
                  onDesign({
                    stickers: d.stickers.filter((s) => s.id !== selected.id),
                  });
                  onSelectSticker(null);
                }}
              >
                Remove sticker
              </button>
            </div>
          )}
        </div>
      )}
      {tab === "layout" && (
        <div className="panel-content">
          <div className="section-label">THE LOVELY LITTLE DETAILS</div>
          <label className="field-label">
            Font family
            <select
              value={d.font}
              onChange={(ev) => onDesign({ font: ev.target.value })}
            >
              {["Nunito", "DM Sans", "Caveat", "Georgia"].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Activity text size <span>{d.fontSize}px</span>
            <input
              type="range"
              min="10"
              max="18"
              value={d.fontSize}
              onChange={(ev) => onDesign({ fontSize: Number(ev.target.value) })}
            />
          </label>
          <label className="field-label">
            Card corners <span>{d.radius}px</span>
            <input
              type="range"
              min="0"
              max="22"
              value={d.radius}
              onChange={(ev) => onDesign({ radius: Number(ev.target.value) })}
            />
          </label>
          <fieldset className="field-label">
            <legend>Title alignment</legend>
            <div className="alignment-options">
              {(
                [
                  { v: "left", icon: AlignLeft },
                  { v: "center", icon: AlignCenter },
                  { v: "right", icon: AlignRight },
                ] as const
              ).map((a) => (
                <button
                  aria-label={`Align ${a.v}`}
                  className={d.alignment === a.v ? "selected" : ""}
                  key={a.v}
                  onClick={() => onDesign({ alignment: a.v })}
                >
                  <a.icon size={17} />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field-label">
            Decorative border
            <select
              value={d.border}
              onChange={(ev) => onDesign({ border: ev.target.value })}
            >
              <option value="solid">A fine little line</option>
              <option value="dashed">Stitched with love</option>
              <option value="double">Double frame</option>
              <option value="none">Borderless</option>
            </select>
          </label>
          <label className="field-label">
            A little subtitle
            <input
              value={d.subtitle}
              onChange={(ev) => onDesign({ subtitle: ev.target.value })}
            />
          </label>
          <div className="two-fields">
            <label className="field-label">
              From
              <select
                value={d.startHour}
                onChange={(ev) =>
                  onDesign({ startHour: Number(ev.target.value) })
                }
              >
                {Array.from({ length: d.endHour }, (_, i) => (
                  <option value={i} key={i}>
                    {String(i).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Until
              <select
                value={d.endHour}
                onChange={(ev) =>
                  onDesign({ endHour: Number(ev.target.value) })
                }
              >
                {Array.from(
                  { length: 24 - d.startHour },
                  (_, i) => i + d.startHour + 1,
                ).map((i) => (
                  <option value={i} key={i}>
                    {String(i).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="toggle-row">
            Show grid lines
            <input
              type="checkbox"
              checked={d.grid}
              onChange={(ev) => onDesign({ grid: ev.target.checked })}
            />
          </label>
          <label className="toggle-row">
            Include weekends
            <input
              type="checkbox"
              checked={d.weekends}
              onChange={(ev) => onDesign({ weekends: ev.target.checked })}
            />
          </label>
        </div>
      )}
      <div className="panel-note">
        <Mochi flower />
        <span>
          Plans can change.
          <br />
          You’re doing just fine. ♡
        </span>
      </div>
      {customOpen && (
        <Modal
          title="A palette that’s all you"
          subtitle="Save a little combination you can come back to."
          onClose={() => setCustomOpen(false)}
        >
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const theme = {
                id: "custom-" + uid(),
                name: customName.trim(),
                color: customAccent,
                bg: customBackground,
                accent: customAccent,
                emoji: "🎨",
                palette: customColors,
              };
              if (!theme.name) return;
              onPreferences({
                customThemes: [...(preferences.customThemes || []), theme],
              });
              onDesign({
                theme: theme.id,
                background: theme.bg,
                customTheme: theme,
              });
              setAll(true);
              setCustomOpen(false);
              notify("Your own little palette, saved for another lovely day.");
            }}
          >
            <label className="field-label">
              Palette name
              <input
                required
                maxLength={40}
                value={customName}
                onChange={(ev) => setCustomName(ev.target.value)}
              />
            </label>
            <div className="two-fields">
              <label className="field-label">
                Background
                <input
                  aria-label="Palette background"
                  type="color"
                  value={customBackground}
                  onChange={(ev) => setCustomBackground(ev.target.value)}
                />
              </label>
              <label className="field-label">
                Accent
                <input
                  aria-label="Palette accent"
                  type="color"
                  value={customAccent}
                  onChange={(ev) => setCustomAccent(ev.target.value)}
                />
              </label>
            </div>
            <fieldset className="field-label">
              <legend>Five little activity colors</legend>
              <div className="custom-colors">
                {customColors.map((color, i) => (
                  <input
                    key={i}
                    type="color"
                    aria-label={"Activity palette color " + (i + 1)}
                    value={color}
                    onChange={(ev) =>
                      setCustomColors(
                        customColors.map((c, index) =>
                          index === i ? ev.target.value : c,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCustomOpen(false)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                <Check size={15} />
                Save my palette
              </button>
            </div>
          </form>
        </Modal>
      )}
    </aside>
  );
}
