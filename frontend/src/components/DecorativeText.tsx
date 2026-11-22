import { useRef } from "react";
import type { TextBox } from "../model";
import { textFontFamily } from "../textDecorations";

export function DecorativeText({
  box,
  interactive,
  selected,
  onSelect,
  onEdit,
  onChange,
  onDelete,
}: {
  box: TextBox;
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onChange: (patch: Partial<TextBox>) => void;
  onDelete: () => void;
}) {
  const position = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const move = (element: HTMLElement, x: number, y: number) => {
    const paper = element.parentElement!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100 - box.width, x)),
      y: Math.max(
        0,
        Math.min(
          Math.max(
            0,
            100 - (element.getBoundingClientRect().height / paper.height) * 100,
          ),
          y,
        ),
      ),
    };
  };
  return (
    <div
      className={`canvas-text ${selected && interactive ? "selected" : ""}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={
        interactive
          ? `Text: ${box.text || "Empty text"}. Drag to move, Enter to style.`
          : undefined
      }
      style={{
        left: `${Math.min(box.x, 100 - box.width)}%`,
        top: `${box.y}%`,
        width: `${box.width}%`,
        fontFamily: textFontFamily(box.font),
        fontSize: box.fontSize,
        color: box.color,
        fontWeight: box.bold ? (box.font === "Caveat" ? 600 : 700) : 400,
        fontStyle: box.italic ? "italic" : "normal",
        textAlign: box.alignment,
        transform: `rotate(${box.rotation}deg)`,
        cursor: interactive ? "grab" : "default",
      }}
      onDoubleClick={(event) => {
        if (interactive) {
          event.stopPropagation();
          onEdit();
        }
      }}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onEdit();
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }
        const delta: Record<string, number[]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        if (delta[event.key]) {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
          const [dx, dy] = delta[event.key];
          onChange(
            move(
              event.currentTarget,
              box.x + dx * (event.shiftKey ? 5 : 1),
              box.y + dy * (event.shiftKey ? 5 : 1),
            ),
          );
        }
      }}
      onPointerDown={(event) => {
        if (!interactive || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        onSelect();
        position.current = {
          x: event.clientX,
          y: event.clientY,
          left: box.x,
          top: box.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!position.current) return;
        const start = position.current,
          paper = event.currentTarget.parentElement!.getBoundingClientRect();
        const next = move(
          event.currentTarget,
          start.left + ((event.clientX - start.x) / paper.width) * 100,
          start.top + ((event.clientY - start.y) / paper.height) * 100,
        );
        event.currentTarget.style.left = `${next.x}%`;
        event.currentTarget.style.top = `${next.y}%`;
      }}
      onPointerUp={(event) => {
        if (!position.current) return;
        const start = position.current,
          paper = event.currentTarget.parentElement!.getBoundingClientRect();
        position.current = null;
        const next = move(
          event.currentTarget,
          start.left + ((event.clientX - start.x) / paper.width) * 100,
          start.top + ((event.clientY - start.y) / paper.height) * 100,
        );
        if (next.x !== box.x || next.y !== box.y) onChange(next);
      }}
      onPointerCancel={(event) => {
        position.current = null;
        event.currentTarget.style.left = `${Math.min(box.x, 100 - box.width)}%`;
        event.currentTarget.style.top = `${box.y}%`;
      }}
    >
      {box.text || (interactive ? "Your words…" : "")}
    </div>
  );
}
