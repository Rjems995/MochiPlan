import { useEffect } from "react";
import {
  Calendar,
  CalendarDays,
  Download,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Palette,
  Plus,
  Redo2,
  Ruler,
  Share2,
  Undo2,
} from "lucide-react";
import { dateKey, weekdayForDate } from "../calendar";
import { useAppContext } from "../context/AppContext";
import { Modal } from "./Modal";

export function StudioToolbar() {
  const {
    active,
    data,
    studio: {
      chooseSchedule,
      setCalendarOpen,
      setSizeOpen,
      focusMode,
      setFocusMode,
      tools,
      setTools,
      setEditor,
      view,
      day,
      week,
      setExportOpen,
      moreOpen,
      setMoreOpen,
    },
    workspace: { canUndo, canRedo, performHistory },
    sharing,
  } = useAppContext();
  useEffect(() => {
    const compact = matchMedia("(max-width: 850px)");
    const resize = () => {
      if (!compact.matches) setMoreOpen(false);
    };
    compact.addEventListener("change", resize);
    return () => {
      compact.removeEventListener("change", resize);
      setMoreOpen(false);
    };
  }, [setMoreOpen]);
  const actions = [
    {
      name: "Share planner",
      title: "Share a read-only copy",
      Icon: Share2,
      className: "icon-button",
      run: () => sharing.setScheduleId(active.id),
    },
    {
      name: "Calendar dates",
      title: "Semester dates, holidays and cancellations",
      Icon: Calendar,
      className: "button secondary small calendar-dates-button",
      label: "Calendar dates",
      run: () => setCalendarOpen(true),
    },
    {
      name: focusMode ? "Exit full screen editor" : "Full screen editor",
      Icon: focusMode ? Minimize2 : Maximize2,
      className: "icon-button fullscreen-button",
      run: () => {
        setFocusMode(!focusMode);
        if (!focusMode) setTools(false);
      },
    },
    {
      name: "Planner size",
      title: active.design.canvasSize
        ? `Planner size · ${active.design.canvasSize.width} × ${active.design.canvasSize.height} px`
        : "Planner size · Automatic",
      Icon: Ruler,
      className: "button secondary small planner-size-button",
      label: "Size",
      run: () => setSizeOpen(true),
    },
    {
      name: "Undo",
      title: "Undo (Ctrl+Z)",
      Icon: Undo2,
      className: "icon-button",
      disabled: !canUndo,
      run: () => performHistory("undo"),
    },
    {
      name: "Redo",
      title: "Redo (Ctrl+Shift+Z)",
      Icon: Redo2,
      className: "icon-button",
      disabled: !canRedo,
      run: () => performHistory("redo"),
    },
  ];
  function desktopAction(action: (typeof actions)[number]) {
    return (
      <button
        key={action.name}
        className={action.className}
        aria-label={action.name}
        title={action.title}
        disabled={action.disabled}
        onClick={action.run}
      >
        <action.Icon size={17} />
        {action.label && <span className="calendar-label">{action.label}</span>}
      </button>
    );
  }
  const options = data.schedules.map((schedule) => (
    <option key={schedule.id} value={schedule.id}>
      {schedule.name}
    </option>
  ));
  return (
    <>
      <div className="studio-toolbar">
        <div className="planner-select">
          <CalendarDays size={16} />
          <select
            aria-label="Active planner"
            value={active.id}
            onChange={(event) => chooseSchedule(event.target.value)}
          >
            {options}
          </select>
          <span className="planner-type">{active.type}</span>
        </div>
        <div className="toolbar-actions">
          <div className="toolbar-secondary-actions">
            {actions.slice(0, 4).map(desktopAction)}
            <div className="undo-controls">
              {actions.slice(4).map(desktopAction)}
            </div>
          </div>
          <button
            className="button secondary small add-activity-button"
            aria-label="Add activity"
            onClick={() =>
              setEditor({
                entry: null,
                day: view === "daily" ? day : weekdayForDate(dateKey(week)),
                start: 540,
              })
            }
          >
            <Plus size={18} />
            <span className="activity-label">Add activity</span>
          </button>
          <button
            className="button secondary mobile-toolbar-action"
            aria-label={tools ? "Hide design tools" : "Show design tools"}
            aria-expanded={tools}
            aria-controls="planner-design-tools"
            onClick={() => setTools(!tools)}
          >
            <Palette size={18} />
            <span>Design</span>
          </button>
          <button
            className="button primary export-button"
            aria-label="Export planner"
            title="Export planner"
            onClick={() => setExportOpen(true)}
          >
            <Download size={18} />
            <span className="export-label">Export planner</span>
            <span className="mobile-toolbar-label">Export</span>
          </button>
          <button
            className="button secondary mobile-toolbar-action"
            aria-label="More planner actions"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal size={18} />
            <span>More</span>
          </button>
        </div>
      </div>
      {moreOpen && (
        <Modal title="Planner actions" onClose={() => setMoreOpen(false)}>
          <div className="mobile-planner-actions">
            <label className="field-label">
              Current planner
              <select
                aria-label="Active planner"
                value={active.id}
                onChange={(event) => {
                  setMoreOpen(false);
                  chooseSchedule(event.target.value);
                }}
              >
                {options}
              </select>
            </label>
            <div className="planner-action-grid">
              {actions.map((action) => (
                <button
                  key={action.name}
                  className="button secondary"
                  aria-label={action.name}
                  disabled={action.disabled}
                  onClick={() => {
                    setMoreOpen(false);
                    action.run();
                  }}
                >
                  <action.Icon size={20} />
                  <span>
                    {action.name === "Full screen editor"
                      ? "Full screen"
                      : action.name === "Exit full screen editor"
                        ? "Exit full screen"
                        : action.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
