import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { startOfMonth, format, isSameDay, parseISO } from "date-fns";
import { MapPin, Plus, GripVertical, AlertCircle } from "lucide-react";
import {
  type Schedule,
  type Entry,
  type Preferences,
  type View,
  type Sticker,
  type TextBox,
  dayNames,
  formatTime,
  entryLanes,
  getTheme,
} from "../model";
import { Flower, Mochi } from "./Artwork";
import { StickerArt } from "./StickerArt";
import { illustrationFor } from "../illustrations";
import { readableColor } from "../contrast";
import { DecorativeText } from "./DecorativeText";
import { PlannerBackgroundPhoto } from "./PlannerBackgroundPhoto";
import { plannerLayout } from "../plannerSize";
import {
  dateKey,
  dateForWeekday,
  entriesOnDate,
  cancelledOnDate,
  rescheduledOnDate,
  holidaysOnDate,
  outsideTerm,
  conflictsOnDate,
  viewDates,
  shiftDate,
  weekdayForDate,
} from "../calendar";
export const HOUR_HEIGHT = 48;
type Props = {
  schedule: Schedule;
  preferences: Preferences;
  week: Date;
  view: View;
  day: number;
  onDay: (d: number, date?: string) => void;
  onEdit: (e: Entry, date?: string) => void;
  onAdd: (day: number, start?: number, date?: string) => void;
  onResize: (id: string, end: number, date?: string) => void;
  onSticker: (id: string, patch: Partial<Sticker>) => void;
  selectedSticker: string | null;
  onSelectSticker: (id: string) => void;
  interactive?: boolean;
  displayScale?: number;
  hourHeight?: number;
  onChromeChange?: (height: number) => void;
  onHourHeightChange?: (height: number) => void;
  onSizeOverflowChange?: (overflow: boolean) => void;
  selectedTextBox?: string | null;
  onTextBox?: (id: string, patch: Partial<TextBox>) => void;
  onSelectTextBox?: (id: string | null) => void;
  onEditTextBox?: (id: string) => void;
  onDeleteTextBox?: (id: string) => void;
};
function Block({
  entry,
  startHour,
  lanes,
  preferences,
  radius,
  fontSize,
  onEdit,
  onResize,
  interactive,
  conflict,
  displayScale,
  hourHeight,
}: {
  entry: Entry;
  startHour: number;
  lanes: { lane: number; count: number };
  preferences: Preferences;
  radius: number;
  fontSize: number;
  onEdit: () => void;
  onResize: (end: number) => void;
  interactive: boolean;
  conflict: boolean;
  displayScale: number;
  hourHeight: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.id, data: { entry }, disabled: !interactive });
  const resize = useRef<{ y: number; end: number } | null>(null);
  const block = useRef<HTMLDivElement | null>(null);
  const height = ((entry.end - entry.start) / 60) * hourHeight;
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        block.current = node;
      }}
      className={`schedule-block ${height < 58 ? "compact-block" : ""} ${height < 32 ? "tiny-block" : ""} ${isDragging ? "dragging" : ""} ${conflict ? "has-conflict" : ""}`}
      style={
        {
          background: entry.color,
          color: readableColor(entry.color),
          "--block-muted": readableColor(entry.color, "#6e605a"),
          top: ((entry.start - startHour * 60) / 60) * hourHeight,
          height,
          left: `calc(${(lanes.lane / lanes.count) * 100}% + 5px)`,
          width: `calc(${100 / lanes.count}% - 10px)`,
          borderRadius: radius,
          fontSize,
          transform: transform
            ? `translate3d(${transform.x / displayScale}px,${transform.y / displayScale}px,0)`
            : undefined,
          zIndex: isDragging ? 50 : 2,
        } as CSSProperties
      }
      {...(interactive ? attributes : {})}
      {...(interactive ? listeners : {})}
      onClick={interactive ? onEdit : undefined}
      title={`${entry.title}\n${formatTime(entry.start, preferences.time24)} – ${formatTime(entry.end, preferences.time24)}${entry.location ? "\n" + entry.location : ""}`}
      aria-label={`${entry.title}, ${dayNames[entry.day]}, ${formatTime(entry.start, preferences.time24)} to ${formatTime(entry.end, preferences.time24)}${conflict ? ", overlapping activity" : ""}`}
    >
      <div className="block-title">
        <span>{entry.title}</span>
        {conflict && <AlertCircle size={12} />}
      </div>
      {height >= 32 && (
        <div className="block-time">
          {formatTime(entry.start, preferences.time24)} –{" "}
          {formatTime(entry.end, preferences.time24)}
        </div>
      )}
      {height >= Math.max(62, fontSize * 3.1 + 24) && entry.location && (
        <div className="block-location">
          <MapPin size={10} />
          <span>{entry.location}</span>
        </div>
      )}
      {interactive && (
        <span
          role="slider"
          aria-label={`Resize ${entry.title}`}
          aria-valuemin={entry.start + 15}
          aria-valuemax={1440}
          aria-valuenow={entry.end}
          tabIndex={0}
          className="resize-handle"
          data-export-ignore
          onClick={(ev) => ev.stopPropagation()}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
              ev.preventDefault();
              ev.stopPropagation();
              onResize(entry.end + (ev.key === "ArrowDown" ? 15 : -15));
            }
          }}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            resize.current = { y: ev.clientY, end: entry.end };
            ev.currentTarget.setPointerCapture(ev.pointerId);
          }}
          onPointerMove={(ev) => {
            if (!resize.current) return;
            const minutes =
              Math.round(
                (((ev.clientY - resize.current.y) / displayScale / hourHeight) *
                  60) /
                  15,
              ) * 15;
            const end = Math.max(
              entry.start + 15,
              Math.min(1440, resize.current.end + minutes),
            );
            if (block.current)
              block.current.style.height = `${((end - entry.start) / 60) * hourHeight}px`;
          }}
          onPointerUp={(ev) => {
            if (!resize.current) return;
            const end =
              resize.current.end +
              Math.round(
                (((ev.clientY - resize.current.y) / displayScale / hourHeight) *
                  60) /
                  15,
              ) *
                15;
            resize.current = null;
            if (block.current) block.current.style.height = `${height}px`;
            onResize(Math.max(entry.start + 15, Math.min(1440, end)));
          }}
          onPointerCancel={() => {
            resize.current = null;
            if (block.current) block.current.style.height = `${height}px`;
          }}
        >
          <span />
        </span>
      )}
    </div>
  );
}
function Column({
  day,
  children,
  onAdd,
  interactive,
  startHour,
  endHour,
  displayScale,
  hourHeight,
  date,
  holiday,
  inactive,
}: {
  day: number;
  children: React.ReactNode;
  onAdd: (day: number, time: number, date?: string) => void;
  interactive: boolean;
  startHour: number;
  endHour: number;
  displayScale: number;
  hourHeight: number;
  date: string;
  holiday: boolean;
  inactive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day}`,
    data: { day, date },
    disabled: !interactive,
  });
  return (
    <div
      ref={setNodeRef}
      className={`day-column ${holiday ? "holiday-column" : ""} ${inactive ? "outside-term-column" : ""} ${isOver ? "drop-active" : ""}`}
      data-date={date}
      style={{
        height: (endHour - startHour) * hourHeight,
        backgroundSize: `100% ${hourHeight}px`,
      }}
      onDoubleClick={(ev) => {
        if (ev.target !== ev.currentTarget || !interactive) return;
        const rect = ev.currentTarget.getBoundingClientRect();
        onAdd(
          day,
          Math.min(
            endHour * 60 - 60,
            Math.max(
              startHour * 60,
              Math.floor(
                ((ev.clientY - rect.top) / displayScale / hourHeight) * 4,
              ) *
                15 +
                startHour * 60,
            ),
          ),
          date,
        );
      }}
    >
      {children}
    </div>
  );
}
function DecorativeSticker({
  sticker,
  interactive,
  onChange,
  selected,
  onSelect,
}: {
  sticker: Sticker;
  interactive: boolean;
  onChange: (patch: Partial<Sticker>) => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const position = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);
  return (
    <span
      className={`canvas-sticker ${selected && interactive ? "selected" : ""}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`${illustrationFor(sticker.emoji).name} sticker. Drag to move.`}
      style={{
        left: `${sticker.x}%`,
        top: `${sticker.y}%`,
        fontSize: sticker.size,
        transform: `rotate(${sticker.rotation}deg)`,
        cursor: interactive ? "grab" : "default",
      }}
      onKeyDown={(ev) => {
        if (!interactive) return;
        if (ev.key === "Enter") onSelect();
        const delta: Record<string, number[]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        if (delta[ev.key]) {
          ev.preventDefault();
          onChange({
            x: Math.max(0, Math.min(92, sticker.x + delta[ev.key][0])),
            y: Math.max(0, Math.min(92, sticker.y + delta[ev.key][1])),
          });
        }
      }}
      onPointerDown={(ev) => {
        if (!interactive) return;
        ev.stopPropagation();
        onSelect();
        const rect = ev.currentTarget.parentElement!.getBoundingClientRect();
        position.current = {
          x: ev.clientX,
          y: ev.clientY,
          width: rect.width,
          height: rect.height,
          left: sticker.x,
          top: sticker.y,
        };
        ev.currentTarget.setPointerCapture(ev.pointerId);
      }}
      onPointerMove={(ev) => {
        if (!position.current) return;
        const p = position.current;
        ev.currentTarget.style.left = `${Math.max(0, Math.min(92, p.left + ((ev.clientX - p.x) / p.width) * 100))}%`;
        ev.currentTarget.style.top = `${Math.max(0, Math.min(92, p.top + ((ev.clientY - p.y) / p.height) * 100))}%`;
      }}
      onPointerUp={(ev) => {
        if (!position.current) return;
        const p = position.current;
        position.current = null;
        onChange({
          x: Math.max(
            0,
            Math.min(92, p.left + ((ev.clientX - p.x) / p.width) * 100),
          ),
          y: Math.max(
            0,
            Math.min(92, p.top + ((ev.clientY - p.y) / p.height) * 100),
          ),
        });
      }}
      onPointerCancel={() => {
        position.current = null;
      }}
    >
      <StickerArt token={sticker.emoji} />
    </span>
  );
}
export function ScheduleCanvas({
  schedule,
  preferences,
  week,
  view,
  day,
  onDay,
  onEdit,
  onAdd,
  onResize,
  onSticker,
  selectedSticker,
  onSelectSticker,
  interactive = true,
  displayScale = 1,
  hourHeight: availableHourHeight = HOUR_HEIGHT,
  onChromeChange,
  onHourHeightChange,
  onSizeOverflowChange,
  selectedTextBox,
  onTextBox,
  onSelectTextBox,
  onEditTextBox,
  onDeleteTextBox,
}: Props) {
  const paperRef = useRef<HTMLDivElement>(null);
  const custom = plannerLayout(schedule.design.canvasSize, view);
  const [customChrome, setCustomChrome] = useState(128);
  const [sizeOverflow, setSizeOverflow] = useState(false);
  useLayoutEffect(() => {
    const paper = paperRef.current;
    const grid = paper?.querySelector<HTMLElement>(".timetable");
    if (!paper || (!custom && !onChromeChange && !onSizeOverflowChange)) return;
    let active = true;
    const measure = () => {
      if (!active || !paper.offsetWidth) return;
      const style = getComputedStyle(paper);
      if (grid) {
        const number = (value: string) => parseFloat(value) || 0;
        const chrome = custom
          ? number(style.paddingTop) +
            number(style.paddingBottom) +
            number(style.borderTopWidth) +
            number(style.borderBottomWidth) +
            Array.from(
              paper.querySelectorAll<HTMLElement>(
                ":scope > .paper-heading, :scope > .timetable-heading, :scope > .paper-footer, :scope > .daily-nav",
              ),
            ).reduce((sum, child) => {
              const css = getComputedStyle(child);
              return (
                sum +
                number(css.height) +
                number(css.marginTop) +
                number(css.marginBottom)
              );
            }, 0)
          : parseFloat(style.height) -
            parseFloat(getComputedStyle(grid).height);
        if (chrome > 0) {
          if (custom)
            setCustomChrome((previous) =>
              Math.abs(previous - chrome) > 0.2 ? chrome : previous,
            );
          onChromeChange?.(chrome);
        }
      }
      const overflow = !!custom && parseFloat(style.height) > custom.height + 2;
      setSizeOverflow((previous) =>
        previous === overflow ? previous : overflow,
      );
      onSizeOverflowChange?.(overflow);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    for (const child of Array.from(paper.children)) observer.observe(child);
    document.fonts.ready.then(measure);
    measure();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [
    view,
    onChromeChange,
    onSizeOverflowChange,
    custom?.width,
    custom?.height,
    interactive,
  ]);
  const d = schedule.design;
  const renderedDates = viewDates(week, view, day, preferences.weekStart);
  const visibleEntries = renderedDates.flatMap((date) =>
    entriesOnDate(schedule, date),
  );
  const theme =
    d.customTheme && d.theme === d.customTheme.id
      ? d.customTheme
      : getTheme(d.theme);
  const min = Math.min(
    d.startHour,
    ...visibleEntries.map((e) => Math.floor(e.start / 60)),
  );
  const max = Math.max(
    d.endHour,
    ...visibleEntries.map((e) => Math.ceil(e.end / 60)),
  );
  const hourHeight =
    custom && (view === "weekly" || view === "daily")
      ? Math.max(24, (custom.height - customChrome) / (max - min))
      : availableHourHeight;
  useLayoutEffect(() => {
    if (interactive) onHourHeightChange?.(hourHeight);
  }, [interactive, onHourHeightChange, hourHeight]);
  const ordered =
    preferences.weekStart === "sunday"
      ? [6, 0, 1, 2, 3, 4, 5]
      : [0, 1, 2, 3, 4, 5, 6];
  const keyFor = (v: number) => dateForWeekday(week, v, preferences.weekStart);
  const days =
    view === "daily"
      ? [day]
      : ordered.filter(
          (v) =>
            d.weekends ||
            v < 5 ||
            entriesOnDate(schedule, keyFor(v)).length ||
            cancelledOnDate(schedule, keyFor(v)).length ||
            rescheduledOnDate(schedule, keyFor(v)).length ||
            holidaysOnDate(schedule, keyFor(v)).length,
        );
  const conflicting = renderedDates.flatMap((date) =>
    conflictsOnDate(schedule, date).map((e) => e.id),
  );
  const today = new Date();
  const touch = useRef<number | null>(null);
  const dateFor = (n: number) => parseISO(keyFor(n));
  function dateNotes(key: string) {
    return (
      <div className="calendar-date-notes">
        {outsideTerm(schedule, key) && (
          <span className="outside-term-note">Outside semester</span>
        )}
        {holidaysOnDate(schedule, key).map((h) => (
          <span className="holiday-note" key={h.id} title={h.name}>
            {h.name}
          </span>
        ))}
        {cancelledOnDate(schedule, key).map((e) => (
          <button
            className="cancelled-note"
            key={e.id}
            aria-label={`Edit cancelled ${e.title} on ${key}`}
            title={`${e.title} cancelled on ${key}`}
            onClick={() => interactive && onEdit(e, key)}
          >
            {e.title} · cancelled
          </button>
        ))}
        {rescheduledOnDate(schedule, key).map((e) => (
          <button
            key={e.id}
            className="rescheduled-note"
            aria-label={`Edit rescheduled ${e.title} on ${e.date}`}
            title={`${e.title} moved to ${format(parseISO(e.date!), "MMM d, yyyy")}`}
            onClick={() => interactive && onEdit(e, e.date)}
          >
            {e.title} · moved to {format(parseISO(e.date!), "MMM d")}
          </button>
        ))}
      </div>
    );
  }
  const midnight = d.theme === "midnight";
  const style = {
    minHeight: custom
      ? "min-content"
      : view === "weekly" || view === "daily"
        ? 0
        : undefined,
    height: custom?.height,
    backgroundColor: d.background,
    color: readableColor(d.background),
    "--paper-ink": readableColor(d.background),
    "--paper-muted": readableColor(d.background, "#73665f"),
    "--paper-accent-ink": readableColor(d.background, "#98536d"),
    fontFamily: `'${d.font}', ${d.font === "Georgia" ? "serif" : "sans-serif"}`,
    textAlign: d.alignment,
    borderStyle: d.border === "none" ? "none" : d.border,
    borderWidth: d.border === "double" ? 5 : 1,
    borderColor: theme.accent,
    backgroundImage: d.image
      ? undefined
      : d.gradient
        ? `linear-gradient(135deg, ${d.background}, ${theme.accent}65)`
        : d.pattern === "dots"
          ? `radial-gradient(${theme.accent}50 0.7px, transparent 0.7px)`
          : d.pattern === "grid"
            ? `linear-gradient(${theme.accent}22 1px, transparent 1px),linear-gradient(90deg,${theme.accent}22 1px,transparent 1px)`
            : undefined,
    backgroundSize: d.image
      ? undefined
      : d.gradient
        ? "cover"
        : d.pattern === "dots"
          ? "12px 12px"
          : "18px 18px",
  } as CSSProperties;
  const month = startOfMonth(week);
  const monthDays = viewDates(week, "monthly", day, preferences.weekStart).map(
    (key) => parseISO(key),
  );
  return (
    <div
      ref={paperRef}
      className={`schedule-paper ${custom ? "custom-size-paper" : ""} ${midnight ? "night-paper" : ""} ${d.grid ? "show-grid" : ""} view-${view}`}
      style={style}
      data-hour-height={hourHeight}
      data-size-overflow={sizeOverflow}
      data-canvas-width={d.canvasSize?.width}
      data-canvas-height={d.canvasSize?.height}
      onTouchStart={(ev) => {
        if (view === "daily") touch.current = ev.touches[0].clientX;
      }}
      onTouchEnd={(ev) => {
        if (view !== "daily" || touch.current === null) return;
        const delta = ev.changedTouches[0].clientX - touch.current;
        if (Math.abs(delta) > 80) {
          const next = shiftDate(keyFor(day), delta < 0 ? 1 : -1);
          onDay(weekdayForDate(next), next);
        }
        touch.current = null;
      }}
    >
      {d.image && (
        <PlannerBackgroundPhoto
          image={d.image}
          adjustment={d.imageAdjustment}
        />
      )}
      <div className="paper-heading">
        <div className="paper-kicker">
          a little space for everything you love
        </div>
        <h2>{schedule.title}</h2>
        <p>{d.subtitle}</p>
        {(schedule.termStart || schedule.termEnd) && (
          <div className="paper-term">
            Semester:{" "}
            {schedule.termStart
              ? format(parseISO(schedule.termStart), "MMM d, yyyy")
              : "Open start"}{" "}
            –{" "}
            {schedule.termEnd
              ? format(parseISO(schedule.termEnd), "MMM d, yyyy")
              : "Open end"}
          </div>
        )}
        <Flower className="paper-flower" />
        <span className="paper-sparkle">✧</span>
      </div>
      {(view === "weekly" || view === "daily") && (
        <>
          <div
            className="timetable-heading"
            style={{
              gridTemplateColumns: `48px repeat(${days.length}, minmax(0,1fr))`,
            }}
          >
            <span className="time-label">time</span>
            {days.map((v) => (
              <div
                key={v}
                className={`day-heading ${isSameDay(dateFor(v), today) ? "today" : ""}`}
              >
                <span>{dayNames[v].slice(0, 3)}</span>
                <small>{format(dateFor(v), "dd")}</small>
                {view === "daily" && interactive && (
                  <button
                    className="day-add"
                    aria-label="Add activity to this day"
                    onClick={() => onAdd(v, 540, keyFor(v))}
                    data-export-ignore
                  >
                    <Plus size={13} />
                  </button>
                )}
                {dateNotes(keyFor(v))}
              </div>
            ))}
          </div>
          <div
            className="timetable"
            style={{
              gridTemplateColumns: `48px repeat(${days.length}, minmax(0,1fr))`,
            }}
          >
            <div className="hours" style={{ height: (max - min) * hourHeight }}>
              {Array.from({ length: max - min }, (_, i) => (
                <span style={{ top: i * hourHeight }} key={i}>
                  {formatTime((min + i) * 60, preferences.time24)}
                </span>
              ))}
            </div>
            {days.map((v) => {
              const entries = entriesOnDate(schedule, keyFor(v));
              const lanes = entryLanes(entries);
              return (
                <Column
                  key={v}
                  day={v}
                  interactive={interactive}
                  startHour={min}
                  endHour={max}
                  displayScale={displayScale}
                  hourHeight={hourHeight}
                  onAdd={onAdd}
                  date={keyFor(v)}
                  holiday={holidaysOnDate(schedule, keyFor(v)).length > 0}
                  inactive={outsideTerm(schedule, keyFor(v))}
                >
                  {entries.map((e) => (
                    <Block
                      key={e.id}
                      entry={e}
                      startHour={min}
                      lanes={lanes.get(e.id)!}
                      preferences={preferences}
                      radius={d.radius}
                      fontSize={d.fontSize}
                      onEdit={() => interactive && onEdit(e, keyFor(v))}
                      onResize={(end) => onResize(e.id, end, keyFor(v))}
                      interactive={interactive}
                      conflict={conflicting.includes(e.id)}
                      displayScale={displayScale}
                      hourHeight={hourHeight}
                    />
                  ))}
                </Column>
              );
            })}
          </div>
        </>
      )}
      {view === "daily" && interactive && (
        <div className="daily-nav" data-export-ignore>
          {ordered.map((v) => (
            <button
              key={v}
              onClick={() => onDay(v)}
              className={v === day ? "active" : ""}
            >
              {dayNames[v].slice(0, 3)}
            </button>
          ))}
        </div>
      )}
      {view === "list" && (
        <div
          className="schedule-list"
          style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
        >
          {!visibleEntries.length &&
            !renderedDates.some(
              (date) =>
                holidaysOnDate(schedule, date).length ||
                cancelledOnDate(schedule, date).length ||
                rescheduledOnDate(schedule, date).length,
            ) && (
              <p className="empty-day">
                {renderedDates.every((date) => outsideTerm(schedule, date))
                  ? "Weekly activities are outside the semester dates."
                  : "No activities scheduled for these dates."}
              </p>
            )}
          {ordered
            .filter(
              (v) =>
                entriesOnDate(schedule, keyFor(v)).length ||
                holidaysOnDate(schedule, keyFor(v)).length ||
                cancelledOnDate(schedule, keyFor(v)).length ||
                rescheduledOnDate(schedule, keyFor(v)).length,
            )
            .map((v) => {
              const entries = entriesOnDate(schedule, keyFor(v));
              return (
                <section key={v}>
                  <h3>
                    {dayNames[v]}
                    <small>{format(dateFor(v), "MMM d")}</small>
                  </h3>
                  {dateNotes(keyFor(v))}
                  {entries.length ? (
                    entries.map((e) => (
                      <button
                        className="list-activity"
                        style={{ borderLeftColor: e.color }}
                        key={e.id}
                        onClick={() => interactive && onEdit(e, keyFor(v))}
                      >
                        <span className="list-time">
                          {formatTime(e.start, preferences.time24)}
                          <small>{formatTime(e.end, preferences.time24)}</small>
                        </span>
                        <span>
                          <strong>{e.title}</strong>
                          <small>
                            {[e.location, e.instructor]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                          {e.notes && <small>{e.notes}</small>}
                        </span>
                        {conflicting.includes(e.id) && (
                          <AlertCircle size={15} />
                        )}
                      </button>
                    ))
                  ) : (
                    <p className="empty-day">A little room to breathe.</p>
                  )}
                </section>
              );
            })}
        </div>
      )}
      {view === "monthly" && (
        <div
          className="month-grid"
          style={
            custom
              ? {
                  gridTemplateRows: `auto repeat(${monthDays.length / 7}, minmax(min-content, 1fr))`,
                }
              : undefined
          }
        >
          {ordered.map((v) => (
            <div className="month-label" key={v}>
              {dayNames[v].slice(0, 3)}
            </div>
          ))}
          {monthDays.map((date) => {
            const v = (date.getDay() + 6) % 7;
            const key = dateKey(date);
            return (
              <div
                key={date.toISOString()}
                className={`month-cell ${date.getMonth() !== month.getMonth() ? "other-month" : ""} ${isSameDay(date, today) ? "current-date" : ""}`}
                data-date={key}
                onDoubleClick={(ev) => {
                  if (
                    interactive &&
                    !(ev.target as HTMLElement).closest("button")
                  )
                    onAdd(v, 540, key);
                }}
              >
                <span>{format(date, "d")}</span>
                {dateNotes(key)}
                {entriesOnDate(schedule, key).map((e) => (
                  <button
                    key={e.id}
                    style={{
                      background: e.color,
                      color: readableColor(e.color),
                    }}
                    onClick={() => interactive && onEdit(e, key)}
                    title={`${e.title} · ${formatTime(e.start, preferences.time24)}`}
                  >
                    <small>{formatTime(e.start, preferences.time24)}</small>
                    {e.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div className="paper-footer">
        <span>take it one little day at a time ♡</span>
        <span className="paper-brand">
          made with mochi<span>plan</span>
        </span>
      </div>
      <Mochi className="paper-mochi" />
      {(d.textBoxes || []).map((box) => (
        <DecorativeText
          key={box.id}
          box={box}
          interactive={interactive}
          selected={box.id === selectedTextBox}
          onSelect={() => onSelectTextBox?.(box.id)}
          onEdit={() => onEditTextBox?.(box.id)}
          onChange={(patch) => onTextBox?.(box.id, patch)}
          onDelete={() => onDeleteTextBox?.(box.id)}
        />
      ))}
      {d.stickers.map((s) => (
        <DecorativeSticker
          key={s.id}
          sticker={s}
          interactive={interactive}
          onChange={(patch) => onSticker(s.id, patch)}
          selected={s.id === selectedSticker}
          onSelect={() => onSelectSticker(s.id)}
        />
      ))}
    </div>
  );
}
