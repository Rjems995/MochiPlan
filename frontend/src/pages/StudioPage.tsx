import { DndContext, closestCenter } from "@dnd-kit/core";
import { useLayoutEffect, useState } from "react";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Heart,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  X,
} from "lucide-react";
import { DesignPanel } from "../components/DesignPanel";
import { FitContent } from "../components/FitContent";
import { ScheduleCanvas } from "../components/ScheduleCanvas";
import { StudioToolbar } from "../components/StudioToolbar";
import { PlannerZoomControls } from "../components/PlannerZoomControls";
import { useAppContext } from "../context/AppContext";
import { plannerLayout } from "../plannerSize";
import { type View } from "../model";
export function StudioPage() {
  const {
    active,
    p,
    studio: {
      setSizeOpen,
      sizeOverflow,
      setTools,
      view,
      week,
      tools,
      selectedSticker,
      setSelectedSticker,
      selectedTextBox,
      setSelectedTextBox,
      selectTextBox,
      textEditRequest,
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
    workspace: { design, applyTheme, pref, updateSchedule },
    feedback: { notify },
    navigation: { navigate },
  } = useAppContext();
  const [zoom, setZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const cameraKey = `${active.id}:${view}:${active.design.canvasSize?.width}:${active.design.canvasSize?.height}`;
  useLayoutEffect(() => {
    setZoom(1);
    setPanMode(false);
  }, [cameraKey]);

  return (
    <>
      <h1 className="sr-only">Design studio</h1>
      <StudioToolbar />
      <div className={`studio-layout ${tools ? "" : "tools-hidden"}`}>
        {tools && (
          <div className="design-inspector" id="planner-design-tools">
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
                onSelectSticker={(id) => {
                  setSelectedSticker(id);
                  setSelectedTextBox(null);
                }}
                selectedTextBox={selectedTextBox}
                onSelectTextBox={selectTextBox}
                textEditRequest={textEditRequest}
                preferences={p}
                onPreferences={pref}
                notify={notify}
                previewAspect={
                  canvasRef.current?.offsetHeight
                    ? canvasRef.current.offsetWidth /
                      canvasRef.current.offsetHeight
                    : 1.5
                }
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
            {active.design.canvasSize && sizeOverflow && (
              <p className="planner-size-warning" role="status">
                This view needs a taller planner.{" "}
                <button onClick={() => setSizeOpen(true)}>Adjust size</button>
              </p>
            )}
            <FitContent
              key={cameraKey}
              minWidth={view === "daily" ? 320 : view === "list" ? 640 : 720}
              maxWidth={view === "daily" ? 760 : 1600}
              onScaleChange={setCanvasScale}
              onSizeChange={handleCanvasSize}
              fixedWidth={plannerLayout(active.design.canvasSize, view)?.width}
              zoom={zoom}
              panMode={panMode}
              interactiveViewport
            >
              <div
                className={`canvas-inner ${active.design.canvasSize ? "custom-planner-size" : ""}`}
                ref={canvasRef}
              >
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
            <PlannerZoomControls
              zoom={zoom}
              panMode={panMode}
              onZoom={(value) => {
                setZoom(value);
                if (value === 1) setPanMode(false);
              }}
              onPanMode={setPanMode}
            />
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
