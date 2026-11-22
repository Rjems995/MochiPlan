import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { readableColor } from "../contrast";

const colors = [
  { name: "Rose", color: "#98516b" },
  { name: "Berry", color: "#b24479" },
  { name: "Peach", color: "#bd634a" },
  { name: "Honey", color: "#99702c" },
  { name: "Sage", color: "#50765b" },
  { name: "Teal", color: "#39787a" },
  { name: "Blue", color: "#506fba" },
  { name: "Lavender", color: "#8a62b0" },
  { name: "Plum", color: "#694871" },
  { name: "Ink", color: "#433d45" },
  { name: "Slate", color: "#746d70" },
  { name: "White", color: "#ffffff" },
];

function hexColor(value: string) {
  const text = value.trim().replace(/^#/, "");
  if (/^[a-f\d]{6}$/i.test(text)) return `#${text.toLowerCase()}`;
  if (/^[a-f\d]{3}$/i.test(text))
    return `#${[...text]
      .map((character) => character + character)
      .join("")
      .toLowerCase()}`;
  return null;
}

export function TextColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(color.toUpperCase());
  const [error, setError] = useState(false);
  const errorId = useId();
  useEffect(() => {
    setDraft(color.toUpperCase());
    setError(false);
  }, [color]);
  const selected = colors.find(
    (option) => option.color === color.toLowerCase(),
  );
  function apply() {
    const next = hexColor(draft);
    setError(!next);
    if (next) {
      setDraft(next.toUpperCase());
      if (next !== color.toLowerCase()) onChange(next);
    }
  }
  return (
    <fieldset className="text-color-picker" aria-label="Text color">
      <legend>Text color</legend>
      <span className="text-color-name" aria-live="polite">
        {selected?.name || "Custom"}
      </span>
      <div className="text-color-swatches">
        {colors.map((option) => (
          <button
            key={option.color}
            type="button"
            aria-label={`${option.name} text color`}
            title={`${option.name} · ${option.color.toUpperCase()}`}
            aria-pressed={color.toLowerCase() === option.color}
            style={{
              background: option.color,
              color: readableColor(option.color),
            }}
            onClick={() => {
              setDraft(option.color.toUpperCase());
              setError(false);
              if (option.color !== color.toLowerCase()) onChange(option.color);
            }}
          >
            {color.toLowerCase() === option.color && (
              <Check size={19} strokeWidth={2.5} />
            )}
          </button>
        ))}
      </div>
      <div className="text-custom-color">
        <label className="text-custom-color-button">
          <input
            type="color"
            aria-label="Custom text color"
            value={color}
            onChange={(event) => onChange(event.target.value)}
          />
          <span>More colors</span>
        </label>
        <label className="text-hex-label">
          Hex color
          <input
            aria-label="Hex text color"
            type="text"
            maxLength={7}
            value={draft}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            aria-invalid={error}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              setError(false);
              if (/^#?[a-f\d]{6}$/i.test(value.trim())) {
                const next = hexColor(value)!;
                if (next !== color.toLowerCase()) onChange(next);
              }
            }}
            onBlur={apply}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setDraft(color.toUpperCase());
                setError(false);
              }
            }}
          />
        </label>
      </div>
      {error && (
        <p className="text-color-error" id={errorId} role="alert">
          Use a hex color, like #B75776.
        </p>
      )}
    </fieldset>
  );
}
