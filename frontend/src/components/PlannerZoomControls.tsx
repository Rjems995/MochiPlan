import { Hand, Minus, Plus } from "lucide-react";
const levels = [1, 1.25, 1.5, 2, 3, 4];
export function PlannerZoomControls({
  zoom,
  panMode,
  onZoom,
  onPanMode,
}: {
  zoom: number;
  panMode: boolean;
  onZoom: (value: number) => void;
  onPanMode: (value: boolean) => void;
}) {
  return (
    <div
      className="planner-zoom-controls"
      role="group"
      aria-label="Planner zoom and pan"
    >
      <button
        className="icon-button"
        aria-label="Zoom out"
        disabled={zoom <= 1}
        onClick={() =>
          onZoom([...levels].reverse().find((value) => value < zoom) || 1)
        }
      >
        <Minus size={18} />
      </button>
      <select
        aria-label="Planner zoom"
        title="Zoom relative to Fit to screen"
        value={zoom}
        onChange={(event) => onZoom(Number(event.target.value))}
      >
        {levels.map((value) => (
          <option key={value} value={value}>
            {value === 1 ? "Fit to screen" : `${Math.round(value * 100)}%`}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        aria-label="Zoom in"
        disabled={zoom >= 4}
        onClick={() => onZoom(levels.find((value) => value > zoom) || 4)}
      >
        <Plus size={18} />
      </button>
      <button
        className="button secondary planner-pan-button"
        aria-label="Pan canvas"
        aria-pressed={panMode}
        disabled={zoom <= 1}
        title="Drag to pan. You can also hold Space and drag, use the arrow keys on the canvas, or scroll when zoomed."
        onClick={() => onPanMode(!panMode)}
      >
        <Hand size={18} />
        <span>Pan</span>
      </button>
    </div>
  );
}
