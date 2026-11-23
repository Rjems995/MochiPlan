import { useCallback, useState } from "react";
import { Check, RotateCw } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { plannerLayout, plannerSizes, validCanvasSize } from "../plannerSize";
import { exportHourHeight, exportLayoutWidth } from "../services/plannerExport";
import { FitContent } from "./FitContent";
import { Modal } from "./Modal";
import { ScheduleCanvas } from "./ScheduleCanvas";

const noop = () => {};
export function PlannerSizeDialog({ onClose }: { onClose: () => void }) {
  const {
    active,
    p,
    studio: { week, view, day },
    workspace: { design },
    feedback: { notify },
  } = useAppContext();
  const initial = active.design.canvasSize;
  const [mode, setMode] = useState(
    initial
      ? plannerSizes.find(
          (size) =>
            size.width === initial.width && size.height === initial.height,
        )?.id || "custom"
      : "auto",
  );
  const [width, setWidth] = useState(String(initial?.width || 1600));
  const [height, setHeight] = useState(String(initial?.height || 1000));
  const candidate = { width: Number(width), height: Number(height) };
  const valid = mode === "auto" || validCanvasSize(candidate);
  const size = mode === "auto" || !valid ? undefined : candidate;
  const layout = plannerLayout(size, view);
  const key = size ? `${size.width}:${size.height}` : "auto";
  const [status, setStatus] = useState({ key: "", overflow: false });
  const onOverflow = useCallback(
    (overflow: boolean) =>
      setStatus((previous) =>
        previous.key === key && previous.overflow === overflow
          ? previous
          : { key, overflow },
      ),
    [key],
  );
  const ready = mode === "auto" || status.key === key;
  const overflow = !!size && status.key === key && status.overflow;
  const preview = { ...active, design: { ...active.design, canvasSize: size } };
  return (
    <Modal
      title="Choose your planner size"
      subtitle="Choose a preset or enter your own dimensions. The editor fits your design to the screen."
      wide
      onClose={onClose}
    >
      <div className="planner-size-layout">
        <div className="planner-size-preview" aria-hidden="true" inert>
          <FitContent
            minWidth={layout?.width || exportLayoutWidth(view)}
            fixedWidth={layout?.width || exportLayoutWidth(view)}
          >
            <ScheduleCanvas
              schedule={preview}
              preferences={p}
              week={week}
              view={view}
              day={day}
              hourHeight={exportHourHeight}
              interactive={false}
              onSizeOverflowChange={onOverflow}
              selectedSticker={null}
              onDay={noop}
              onEdit={noop}
              onAdd={noop}
              onResize={noop}
              onSticker={noop}
              onSelectSticker={noop}
            />
          </FitContent>
        </div>
        <div className="planner-size-options">
          <label className="field-label">
            Size preset
            <select
              aria-label="Planner size preset"
              value={mode}
              onChange={(event) => {
                const next = event.target.value;
                setMode(next);
                const preset = plannerSizes.find((size) => size.id === next);
                if (preset) {
                  setWidth(String(preset.width));
                  setHeight(String(preset.height));
                }
              }}
            >
              <option value="auto">Automatic</option>
              {plannerSizes.map((size) => (
                <option value={size.id} key={size.id}>
                  {size.name} · {size.width} × {size.height}
                </option>
              ))}
              <option value="custom">Custom dimensions</option>
            </select>
          </label>
          {mode !== "auto" && (
            <>
              <div className="two-fields">
                <label className="field-label">
                  Width (px)
                  <input
                    aria-label="Planner width"
                    type="number"
                    min="320"
                    max="4096"
                    step="1"
                    value={width}
                    onChange={(event) => {
                      setMode("custom");
                      setWidth(event.target.value);
                    }}
                  />
                </label>
                <label className="field-label">
                  Height (px)
                  <input
                    aria-label="Planner height"
                    type="number"
                    min="320"
                    max="4096"
                    step="1"
                    value={height}
                    onChange={(event) => {
                      setMode("custom");
                      setHeight(event.target.value);
                    }}
                  />
                </label>
              </div>
              <button
                className="button secondary full-width"
                disabled={!valid}
                onClick={() => {
                  setWidth(height);
                  setHeight(width);
                  setMode("custom");
                }}
              >
                <RotateCw size={16} /> Swap width and height
              </button>
            </>
          )}
          <p className="planner-size-help">
            {mode === "auto"
              ? "Automatic adapts to the available space. Export height follows the planner’s proportions."
              : "Your chosen size is saved with this planner and used for downloads. Choose 320–4096 px per side."}
          </p>
          {!valid && (
            <p className="form-error" role="alert">
              Enter whole numbers from 320 to 4096. For very large images,
              reduce the width or height.
            </p>
          )}
          {overflow && (
            <p className="form-error" role="alert">
              This view needs more height. Choose a taller size or Automatic to
              keep all your content.
            </p>
          )}
        </div>
      </div>
      <div className="modal-actions planner-size-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!valid || !ready || overflow}
          onClick={() => {
            design({ canvasSize: size });
            notify(
              size
                ? `Planner size saved: ${size.width} × ${size.height} px.`
                : "Automatic planner size restored.",
            );
            onClose();
          }}
        >
          <Check size={16} /> Use size
        </button>
      </div>
    </Modal>
  );
}
