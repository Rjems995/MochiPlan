import { DndContext, closestCenter } from "@dnd-kit/core";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  Heart,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Redo2,
  Share2,
  Undo2,
  X,
} from "lucide-react";
import { dateKey, weekdayForDate } from "../calendar";
import { DesignPanel } from "../components/DesignPanel";
import { FitContent } from "../components/FitContent";
import { ScheduleCanvas } from "../components/ScheduleCanvas";
import { useAppContext } from "../context/AppContext";
import { type View } from "../model";
export function StudioPage() {
  const {
    active,
    data,
    p,
    studio: {
      chooseSchedule,
      setCalendarOpen,
      focusMode,
      setFocusMode,
      setTools,
      setEditor,
      view,
      day,
      week,
      setExportOpen,
      tools,
      selectedSticker,
      setSelectedSticker,
      setWeek,
      weekStart,
      setDay,
      todayDay,
      setView,
      setCanvasScale,
      handleCanvasSize,
      canvasRef,
      sensors,
      ignoreClick,
      dragEnd,
      canvasProps,
      canvasScale,
      handleCanvasChrome,
      displayedEntries,
      totalHours,
      displayedConflicts,
    },
    workspace: {
      canUndo,
      performHistory,
      canRedo,
      design,
      applyTheme,
      pref,
      updateSchedule,
    },
    feedback: { notify },
    navigation: { navigate },
    sharing,
  } = useAppContext();

  return (
    <>
      <h1 className="sr-only">Design studio</h1>
      <div className="studio-toolbar">
        <div className="planner-select">
          <CalendarDays size={16} />
          <select
            aria-label="Active planner"
            value={active.id}
            onChange={(ev) => chooseSchedule(ev.target.value)}
          >
            {data.schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="planner-type">{active.type}</span>
        </div>
        <div className="toolbar-actions">
          <button
            className="icon-button"
            aria-label="Share planner"
            title="Share a read-only copy"
            onClick={() => sharing.setScheduleId(active.id)}
          >
            <Share2 size={17} />
          </button>
          <button
            className="button secondary small calendar-dates-button"
            aria-label="Calendar dates"
            title="Semester dates, holidays and cancellations"
            onClick={() => setCalendarOpen(true)}
          >
            <Calendar size={15} />
            <span className="calendar-label">Calendar dates</span>
          </button>
          <button
            className="icon-button fullscreen-button"
            aria-label={
              focusMode ? "Exit full screen editor" : "Full screen editor"
            }
            onClick={() => {
              setFocusMode(!focusMode);
              if (!focusMode) setTools(false);
            }}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <div className="undo-controls">
            <button
              className="icon-button"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={() => performHistory("undo")}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={() => performHistory("redo")}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <button
            className="button secondary small"
            aria-label="Add activity"
            onClick={() =>
              setEditor({
                entry: null,
                day: view === "daily" ? day : weekdayForDate(dateKey(week)),
                start: 540,
              })
            }
          >
            <Plus size={15} />
            <span className="activity-label">Add activity</span>
          </button>
          <button
            className="button primary export-button"
            aria-label="Export planner"
            title="Export planner"
            onClick={() => setExportOpen(true)}
          >
            <Download size={16} />
            <span className="export-label">Export planner</span>
          </button>
        </div>
      </div>
      <div className={`studio-layout ${tools ? "" : "tools-hidden"}`}>
        {tools && (
          <div className="design-inspector">
            <button
              className="inspector-close icon-button"
              aria-label="Close design tools"
              onClick={() => setTools(false)}
            >
              <X size={17} />
            </button>
            <FitContent minWidth={264} maxWidth={264} align="start">
              <DesignPanel
                schedule={active}
                onDesign={design}
                onTheme={applyTheme}
                selectedSticker={selectedSticker}
                onSelectSticker={setSelectedSticker}
                preferences={p}
                onPreferences={pref}
                notify={notify}
              />
            </FitContent>
          </div>
        )}
        <section className="canvas-workspace">
          <div className="canvas-toolbar">
            <div className="week-navigation">
              <button
                className="icon-button"
                aria-label={
                  view === "monthly" ? "Previous month" : "Previous week"
                }
                onClick={() =>
                  setWeek(
                    view === "monthly"
                      ? addMonths(week, -1)
                      : addWeeks(week, -1),
                  )
                }
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                {view === "monthly"
                  ? format(week, "MMMM yyyy")
                  : `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "d, yyyy")}`}
              </span>
              <button
                className="icon-button"
                aria-label={view === "monthly" ? "Next month" : "Next week"}
                onClick={() =>
                  setWeek(
                    view === "monthly" ? addMonths(week, 1) : addWeeks(week, 1),
                  )
                }
              >
                <ChevronRight size={16} />
              </button>
              <button
                className="today-button"
                onClick={() => {
                  setWeek(new Date());
                  setDay(todayDay);
                }}
              >
                Today
              </button>
            </div>

            <label className="canvas-title-field">
              <Pencil size={11} />
              <input
                aria-label="Planner title"
                value={active.title}
                onChange={(ev) =>
                  updateSchedule((s) => ({
                    ...s,
                    title: ev.target.value,
                  }))
                }
              />
            </label>
            <div className="view-controls">
              {(["weekly", "daily", "monthly", "list"] as View[]).map((v) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  onClick={() => setView(v)}
                >
                  {v === "weekly"
                    ? "Week"
                    : v === "daily"
                      ? "Day"
                      : v === "monthly"
                        ? "Month"
                        : "List"}
                </button>
              ))}
            </div>
            <button
              className="icon-button tools-toggle"
              aria-label={tools ? "Hide design tools" : "Show design tools"}
              onClick={() => setTools(!tools)}
            >
              {tools ? (
                <PanelLeftClose size={17} />
              ) : (
                <PanelLeftOpen size={17} />
              )}
            </button>
          </div>
          <div className="canvas-scroller">
            <FitContent
              minWidth={view === "daily" ? 320 : view === "list" ? 640 : 720}
              maxWidth={view === "daily" ? 760 : 1600}
              onScaleChange={setCanvasScale}
              onSizeChange={handleCanvasSize}
            >
              <div className="canvas-inner" ref={canvasRef}>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={() => {
                    ignoreClick.current = Date.now() + 60000;
                  }}
                  onDragCancel={() => {
                    ignoreClick.current = Date.now() + 100;
                  }}
                  onDragEnd={dragEnd}
                >
                  <ScheduleCanvas
                    {...canvasProps}
                    displayScale={canvasScale}
                    onChromeChange={handleCanvasChrome}
                  />
                </DndContext>
              </div>
            </FitContent>
          </div>
          <div className="canvas-status">
            <span>
              <GripVertical size={12} />
              Drag to move · pull the bottom edge to resize
            </span>
            <span>
              {displayedEntries.length} activities <i />{" "}
              {Number(totalHours.toFixed(1))} hours of possibility
            </span>
          </div>
        </section>
      </div>
      <div className="studio-bottom">
        <span>
          <Heart size={13} /> A well-planned week leaves a little room for
          magic.
        </span>
        <button onClick={() => navigate("templates")}>
          Find a fresh look <ArrowRight size={14} />
        </button>
      </div>
      {displayedConflicts.length > 0 && (
        <div className="notice warning overlap-notice">
          <AlertTriangle size={15} />
          {displayedConflicts.length} activities overlap. They appear side by
          side; click an activity to adjust its time.
        </div>
      )}
    </>
  );
}
