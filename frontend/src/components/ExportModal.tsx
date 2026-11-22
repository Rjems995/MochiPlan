import { useEffect, useState, useRef } from "react";
import { Download, LoaderCircle, Printer, Check } from "lucide-react";
import { Modal } from "./Modal";
import { ScheduleCanvas } from "./ScheduleCanvas";
import type { Schedule, Preferences, View } from "../model";
import { download } from "../storage";
import {
  exportHourHeight,
  exportLayoutWidth,
  plannerImageSize,
} from "../services/plannerExport";
const sizes = [
  { name: "Desktop · 1920 px wide", w: 1920 },
  { name: "Tablet · 1536 px wide", w: 1536 },
  { name: "Mobile · 1080 px wide", w: 1080 },
  { name: "Print · 3508 px wide", w: 3508 },
  { name: "Custom width", w: 1600 },
];
export function ExportModal({
  schedule,
  preferences,
  week,
  view,
  day,
  onClose,
  notify,
}: {
  schedule: Schedule;
  preferences: Preferences;
  week: Date;
  view: View;
  day: number;
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const [size, setSize] = useState(0);
  const [width, setWidth] = useState(1920);
  const [format, setFormat] = useState("png");
  const [preview, setPreview] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    const current = ++generation.current;
    const timer = setTimeout(async () => {
      try {
        if (!content.current) return;
        const { toCanvas } = await import("html-to-image");
        await document.fonts.ready;
        const source =
          content.current?.querySelector<HTMLElement>(".schedule-paper");
        if (!source || cancelled) return;
        const outputSize = plannerImageSize(
          source.offsetWidth,
          source.offsetHeight,
          width,
        );
        const canvas = await toCanvas(source, {
          canvasWidth: outputSize.width,
          canvasHeight: outputSize.height,
          pixelRatio: 1,
          backgroundColor: schedule.design.background,
          cacheBust: false,
          skipAutoScale: true,
          filter: (node) =>
            !(
              node instanceof HTMLElement &&
              node.hasAttribute("data-export-ignore")
            ),
        });
        if (cancelled || current !== generation.current) return;
        setDimensions(outputSize);
        setPreview(
          canvas.toDataURL(format === "jpg" ? "image/jpeg" : "image/png", 0.97),
        );
        setReady(true);
      } catch (e) {
        if (!cancelled)
          setError(
            "The preview could not render. Try a smaller export size or remove the background image.",
          );
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [width, format, schedule, week, view, day, preferences]);
  async function exportFile() {
    if (!preview || !ready) return;
    setBusy(true);
    try {
      const filename = schedule.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({
          orientation:
            dimensions.width > dimensions.height ? "landscape" : "portrait",
          unit: "px",
          format: [dimensions.width, dimensions.height],
          hotfixes: ["px_scaling"],
        });
        pdf.addImage(preview, "PNG", 0, 0, dimensions.width, dimensions.height);
        pdf.save(`${filename}.pdf`);
      } else download(preview, `${filename}.${format}`);
      notify("A lovely little plan, ready to keep.");
    } catch {
      setError("The download could not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Take a little lovely with you"
      subtitle="Just your designed planner, without the extra frame."
      onClose={onClose}
      wide
    >
      <div className="export-layout">
        <div className="export-preview">
          {ready && preview ? (
            <img src={preview} alt="Exact preview of your exported planner" />
          ) : (
            <div className="loading-preview">
              <LoaderCircle className="spin" size={24} />
              <span>Making it picture perfect…</span>
            </div>
          )}
        </div>
        <div className="export-options">
          <label className="field-label">
            Image size
            <select
              value={size}
              onChange={(ev) => {
                const i = Number(ev.target.value);
                setSize(i);
                if (sizes[i].w !== width) setReady(false);
                setWidth(sizes[i].w);
              }}
            >
              {sizes.map((s, i) => (
                <option value={i} key={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {size === sizes.length - 1 && (
            <label className="field-label">
              Width
              <input
                aria-label="Export width"
                type="number"
                min="320"
                max="4096"
                value={width}
                onChange={(ev) =>
                  setWidth(
                    Math.max(
                      320,
                      Math.min(4096, Number(ev.target.value) || 320),
                    ),
                  )
                }
              />
            </label>
          )}
          <p className="export-dimensions" aria-live="polite">
            {ready
              ? `${dimensions.width} × ${dimensions.height} px`
              : "Preparing your image…"}
            <span>Height follows your planner’s proportions.</span>
          </p>
          <fieldset className="field-label">
            <legend>File format</legend>
            <div className="format-picker">
              {["png", "jpg", "pdf"].map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    if (f !== format) setReady(false);
                    setFormat(f);
                  }}
                  className={format === f ? "selected" : ""}
                  aria-pressed={format === f}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="export-note">
            <Check size={15} />
            Fonts, colors & stickers included
            <br />
            <Check size={15} />
            No added borders or empty margins
            <br />
            <Check size={15} />
            Works offline, too
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="button primary full-width"
            disabled={!ready || busy}
            onClick={exportFile}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}
            Download {format.toUpperCase()}
          </button>
          <button
            className="button secondary full-width"
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Print A4 / Save as PDF
          </button>
        </div>
      </div>
      <div className="export-render" aria-hidden="true">
        <div ref={content} style={{ width: exportLayoutWidth(view) }}>
          <ScheduleCanvas
            hourHeight={exportHourHeight}
            schedule={schedule}
            preferences={preferences}
            week={week}
            view={view}
            day={day}
            interactive={false}
            onDay={() => {}}
            onEdit={() => {}}
            onAdd={() => {}}
            onResize={() => {}}
            onSticker={() => {}}
            selectedSticker={null}
            onSelectSticker={() => {}}
          />
        </div>
      </div>
    </Modal>
  );
}
