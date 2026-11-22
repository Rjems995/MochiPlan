import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { BackgroundImageAdjustment } from "../model";
import { defaultImageAdjustment, panBackground } from "../backgroundImage";
import { Modal } from "./Modal";
import { PlannerBackgroundPhoto } from "./PlannerBackgroundPhoto";

export function BackgroundImageDialog({
  image,
  initial,
  background,
  aspect,
  onSave,
  onClose,
}: {
  image: string;
  initial: BackgroundImageAdjustment;
  background: string;
  aspect: number;
  onSave: (adjustment: BackgroundImageAdjustment) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...initial });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    preview.current?.focus({ preventScroll: true });
    const modal = preview.current?.closest(".modal");
    if (modal) modal.scrollTop = 0;
  }, []);
  const drag = useRef<{
    x: number;
    y: number;
    adjustment: BackgroundImageAdjustment;
  } | null>(null);
  const update = (patch: Partial<BackgroundImageAdjustment>) =>
    setDraft((previous) => ({ ...previous, ...patch }));
  const nextPosition = (element: HTMLElement, x: number, y: number) => {
    const start = drag.current!;
    return panBackground(
      start.adjustment,
      natural,
      element.getBoundingClientRect(),
      { x: x - start.x, y: y - start.y },
    );
  };
  return (
    <Modal
      title="Adjust your background"
      subtitle="Drag your photo to frame it, or use the sliders. Your planner keeps the original photo."
      wide
      onClose={onClose}
    >
      <div className="background-adjustment-layout">
        <div className="background-adjustment-stage">
          <div
            ref={preview}
            className="background-framing-preview"
            role="img"
            aria-label="Background framing preview. Drag to reposition or use arrow keys."
            tabIndex={0}
            style={
              {
                backgroundColor: background,
                aspectRatio: aspect,
                "--background-preview-aspect": aspect,
              } as CSSProperties
            }
            onPointerDown={(event) => {
              if (!natural.width || error || event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus();
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                adjustment: draft,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current)
                setDraft(
                  nextPosition(
                    event.currentTarget,
                    event.clientX,
                    event.clientY,
                  ),
                );
            }}
            onPointerUp={(event) => {
              if (drag.current) {
                setDraft(
                  nextPosition(
                    event.currentTarget,
                    event.clientX,
                    event.clientY,
                  ),
                );
                drag.current = null;
              }
            }}
            onPointerCancel={() => {
              if (drag.current) setDraft(drag.current.adjustment);
              drag.current = null;
            }}
            onKeyDown={(event) => {
              const delta: Record<string, number[]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              if (delta[event.key]) {
                event.preventDefault();
                const [x, y] = delta[event.key];
                update({
                  x: Math.max(0, Math.min(100, draft.x + x)),
                  y: Math.max(0, Math.min(100, draft.y + y)),
                });
              }
            }}
          >
            <PlannerBackgroundPhoto
              image={image}
              adjustment={draft}
              onLoad={setNatural}
              onError={() => setError(true)}
            />
          </div>
          <p className="background-framing-hint">
            The preview uses your current calendar’s shape. Changes apply when
            you choose “Use background.”
          </p>
        </div>
        <div className="background-adjustment-options">
          <fieldset className="background-fit-options">
            <legend>Photo fit</legend>
            <button
              type="button"
              aria-pressed={draft.fit === "cover"}
              onClick={() => update({ fit: "cover" })}
            >
              Fill calendar
            </button>
            <button
              type="button"
              aria-pressed={draft.fit === "contain"}
              onClick={() => update({ fit: "contain" })}
            >
              Show whole photo
            </button>
          </fieldset>
          <label className="field-label">
            Zoom <span>{draft.zoom}%</span>
            <input
              type="range"
              aria-label="Background zoom"
              min="100"
              max="300"
              step="5"
              value={draft.zoom}
              onChange={(event) => update({ zoom: Number(event.target.value) })}
            />
          </label>
          <label className="field-label">
            Horizontal position <span>{Math.round(draft.x)}%</span>
            <input
              type="range"
              aria-label="Background horizontal position"
              min="0"
              max="100"
              value={draft.x}
              onChange={(event) => update({ x: Number(event.target.value) })}
            />
          </label>
          <label className="field-label">
            Vertical position <span>{Math.round(draft.y)}%</span>
            <input
              type="range"
              aria-label="Background vertical position"
              min="0"
              max="100"
              value={draft.y}
              onChange={(event) => update({ y: Number(event.target.value) })}
            />
          </label>
          <button
            className="button secondary full-width"
            onClick={() => setDraft({ ...defaultImageAdjustment })}
          >
            <RotateCcw size={15} /> Reset framing
          </button>
          {error && (
            <p className="form-error" role="alert">
              This photo could not be opened. Choose another image.
            </p>
          )}
        </div>
      </div>
      <div className="modal-actions background-adjustment-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!natural.width || error}
          onClick={() => onSave(draft)}
        >
          <Check size={16} /> Use background
        </button>
      </div>
    </Modal>
  );
}
