import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  Italic,
  Plus,
  Trash2,
} from "lucide-react";
import type { Design, TextBox } from "../model";
import { uid } from "../model";
import { newTextBox, textFontFamily, textFonts } from "../textDecorations";
import { TextColorPicker } from "./TextColorPicker";

export function TextDesignPanel({
  design,
  selectedId,
  onDesign,
  onSelect,
}: {
  design: Design;
  selectedId: string | null;
  onDesign: (patch: Partial<Design>) => void;
  onSelect: (id: string | null) => void;
}) {
  const boxes = design.textBoxes || [],
    selected = boxes.find((box) => box.id === selectedId);
  const update = (patch: Partial<TextBox>) =>
    onDesign({
      textBoxes: boxes.map((box) =>
        box.id === selectedId ? { ...box, ...patch } : box,
      ),
    });
  return (
    <div className="panel-content text-design-panel">
      <button
        className="button secondary full-width"
        disabled={boxes.length >= 100}
        onClick={() => {
          const box = newTextBox(uid());
          onDesign({ textBoxes: [...boxes, box] });
          onSelect(box.id);
        }}
      >
        <Plus size={16} /> Add text
      </button>
      <p className="text-design-hint">
        Drag your words into place. Double-tap text to style it, or use arrow
        keys to move it.
      </p>
      {boxes.length > 0 && (
        <label className="field-label">
          Text layer
          <select
            aria-label="Text layer"
            value={selected?.id || ""}
            onChange={(event) => onSelect(event.target.value || null)}
          >
            <option value="">Choose a text layer</option>
            {boxes.map((box, index) => (
              <option key={box.id} value={box.id}>
                {index + 1}. {box.text.slice(0, 35) || "Empty text"}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <div className="text-decoration-controls" key={selected.id}>
          <label className="field-label">
            Your words
            <textarea
              aria-label="Your words"
              rows={2}
              maxLength={300}
              value={selected.text}
              placeholder="a little note ♡"
              onChange={(event) => update({ text: event.target.value })}
            />
          </label>
          <TextColorPicker
            color={selected.color}
            onChange={(color) => update({ color })}
          />
          <fieldset className="text-fonts">
            <legend>Pretty fonts</legend>
            <div>
              {textFonts.map((option) => (
                <button
                  key={option.font}
                  aria-label={`Use ${option.font} font`}
                  aria-pressed={selected.font === option.font}
                  className={selected.font === option.font ? "selected" : ""}
                  onClick={() => update({ font: option.font })}
                >
                  <span style={{ fontFamily: textFontFamily(option.font) }}>
                    Lovely
                  </span>
                  <small>{option.label}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="text-style-row" role="group" aria-label="Text style">
            <button
              aria-label="Bold text"
              aria-pressed={selected.bold}
              onClick={() => update({ bold: !selected.bold })}
            >
              <Bold size={17} />
            </button>
            <button
              aria-label="Italic text"
              aria-pressed={selected.italic}
              onClick={() => update({ italic: !selected.italic })}
            >
              <Italic size={17} />
            </button>
            {(
              [
                { alignment: "left", icon: AlignLeft },
                { alignment: "center", icon: AlignCenter },
                { alignment: "right", icon: AlignRight },
              ] as const
            ).map((option) => (
              <button
                key={option.alignment}
                aria-label={`Align text ${option.alignment}`}
                aria-pressed={selected.alignment === option.alignment}
                onClick={() => update({ alignment: option.alignment })}
              >
                <option.icon size={17} />
              </button>
            ))}
          </div>
          <label className="field-label">
            Text size <span>{selected.fontSize}px</span>
            <input
              type="range"
              aria-label="Text size"
              min="14"
              max="96"
              value={selected.fontSize}
              onChange={(event) =>
                update({ fontSize: Number(event.target.value) })
              }
            />
          </label>
          <label className="field-label">
            Text width <span>{selected.width}%</span>
            <input
              type="range"
              aria-label="Text width"
              min="12"
              max="90"
              value={selected.width}
              onChange={(event) =>
                update({
                  width: Number(event.target.value),
                  x: Math.min(selected.x, 100 - Number(event.target.value)),
                })
              }
            />
          </label>
          <label className="field-label">
            Text rotation <span>{selected.rotation}°</span>
            <input
              type="range"
              aria-label="Text rotation"
              min="-180"
              max="180"
              value={selected.rotation}
              onChange={(event) =>
                update({ rotation: Number(event.target.value) })
              }
            />
          </label>
          <div className="text-layer-actions">
            <button
              className="button secondary"
              disabled={boxes.length >= 100}
              onClick={() => {
                const copy = {
                  ...selected,
                  id: uid(),
                  x: Math.min(100 - selected.width, selected.x + 3),
                  y: Math.min(90, selected.y + 3),
                };
                onDesign({ textBoxes: [...boxes, copy] });
                onSelect(copy.id);
              }}
            >
              <Copy size={15} /> Duplicate text
            </button>
            <button
              className="button secondary"
              aria-label="Remove text"
              onClick={() => {
                onDesign({
                  textBoxes: boxes.filter((box) => box.id !== selected.id),
                });
                onSelect(null);
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
