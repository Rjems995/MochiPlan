import { readableColor } from "../contrast";
import { getTheme } from "../model";
import { type Template } from "../seed";
import { StickerArt } from "./StickerArt";

export function TemplatePreview({
  template,
  large = false,
}: {
  template: Template;
  large?: boolean;
}) {
  const theme = getTheme(template.theme);
  return (
    <div
      className={`template-art ${large ? "large" : ""} ${template.pattern === "grid" ? "template-grid-bg" : ""}`}
      style={{
        background: theme.bg,
        color: readableColor(theme.bg, theme.color),
        fontFamily: template.font,
        backgroundImage:
          template.pattern === "dots"
            ? `radial-gradient(${theme.accent}70 1px,transparent 1px)`
            : undefined,
      }}
    >
      <span className="template-emoji">
        <StickerArt token={template.emoji} />
      </span>
      <h4>{template.name}</h4>
      <p>{template.subtitle}</p>
      <div className="mini-calendar">
        <div className="mini-days">
          {["m", "t", "w", "t", "f"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="mini-columns">
          {[0, 1, 2, 3, 4].map((c) => (
            <div key={c}>
              {[0, 1, 2].map((r) => (
                <i
                  key={r}
                  style={{
                    background: theme.palette[(c + r) % 5],
                    height: `${18 + ((c + r) % 3) * 9}px`,
                    marginTop: `${5 + ((c * r) % 3) * 9}px`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <small>made with a little love ♡</small>
    </div>
  );
}
