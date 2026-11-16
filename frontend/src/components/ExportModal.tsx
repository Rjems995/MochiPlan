import { useEffect, useState, useRef } from "react";
import { Download, LoaderCircle, Printer, Image, Check } from "lucide-react";
import { Modal } from "./Modal";
import { ScheduleCanvas } from "./ScheduleCanvas";
import type { Schedule, Preferences, View } from "../model";
import { download } from "../storage";
const sizes = [
  { name: "Desktop wallpaper", w: 1920, h: 1080 },
  { name: "Phone wallpaper", w: 1080, h: 1920 },
  { name: "Square", w: 1080, h: 1080 },
  { name: "A4 landscape", w: 3508, h: 2480 },
  { name: "A4 portrait", w: 2480, h: 3508 },
  { name: "Custom size", w: 1600, h: 1000 },
];
export function ExportModal({
  schedule,
  preferences,
  week,
  view,
  day,
  canvasWidth,
  hourHeight,
  onClose,
  notify,
}: {
  schedule: Schedule;
  preferences: Preferences;
  week: Date;
  view: View;
  day: number;
  canvasWidth: number;
  hourHeight: number;
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const [size, setSize] = useState(0);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [format, setFormat] = useState("png");
  const [preview, setPreview] = useState("");
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
        const source = content.current;
        const canvas = await toCanvas(source, {
          pixelRatio: Math.min(2, width / Math.max(source.offsetWidth, 1)),
          cacheBust: false,
          skipAutoScale: true,
          filter: (node) =>
            !(
              node instanceof HTMLElement &&
              node.hasAttribute("data-export-ignore")
            ),
        });
        if (cancelled || current !== generation.current) return;
        const output = document.createElement("canvas");
        output.width = width;
        output.height = height;
        const ctx = output.getContext("2d")!;
        ctx.fillStyle = schedule.design.background;
        ctx.fillRect(0, 0, width, height);
        const padding = Math.min(width, height) * 0.045;
        const scale = Math.min(
          (width - padding * 2) / canvas.width,
          (height - padding * 2) / canvas.height,
        );
        ctx.drawImage(
          canvas,
          (width - canvas.width * scale) / 2,
          (height - canvas.height * scale) / 2,
          canvas.width * scale,
          canvas.height * scale,
        );
        setPreview(
          output.toDataURL(format === "jpg" ? "image/jpeg" : "image/png", 0.97),
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
  }, [width, height, format, schedule, week, view, day, preferences]);
  async function exportFile() {
    if (!preview || !ready) return;
    setBusy(true);
    try {
      const filename = schedule.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({
          orientation: width > height ? "landscape" : "portrait",
          unit: "px",
          format: [width, height],
          hotfixes: ["px_scaling"],
        });
        pdf.addImage(preview, "PNG", 0, 0, width, height);
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
      subtitle="Your planner, just as you made it."
      onClose={onClose}
      wide
    >
      <div className="export-layout">
        <div
          className="export-preview"
          style={{ background: schedule.design.background }}
        >
          {ready && preview ? (
            <img src={preview} alt="Exact preview of your exported planner" />
          ) : (
            <div className="loading-preview">
              <LoaderCircle className="spin" size={24} />
              <span>Making it picture perfect…</span>
            </div>
          )}
          <span className="preview-label">
            {width} × {height} px
          </span>
        </div>
        <div className="export-options">
          <label className="field-label">
            Make it a
            <select
              value={size}
              onChange={(ev) => {
                const i = Number(ev.target.value);
                setSize(i);
                setWidth(sizes[i].w);
                setHeight(sizes[i].h);
              }}
            >
              {sizes.map((s, i) => (
                <option value={i} key={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {size === 5 && (
            <div className="two-fields">
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
              <label className="field-label">
                Height
                <input
                  aria-label="Export height"
                  type="number"
                  min="320"
                  max="4096"
                  value={height}
                  onChange={(ev) =>
                    setHeight(
                      Math.max(
                        320,
                        Math.min(4096, Number(ev.target.value) || 320),
                      ),
                    )
                  }
                />
              </label>
            </div>
          )}
          <fieldset className="field-label">
            <legend>File format</legend>
            <div className="format-picker">
              {["png", "jpg", "pdf"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={format === f ? "selected" : ""}
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
            High resolution, made on your device
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
        <div ref={content} style={{ width: canvasWidth }}>
          <ScheduleCanvas
            hourHeight={hourHeight}
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
