import { useRef, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  startOfMonth,
  startOfWeek,
  getDaysInMonth,
  format,
  isSameDay,
} from "date-fns";
import { MapPin, Plus, GripVertical, AlertCircle } from "lucide-react";
import {
  type Schedule,
  type Entry,
  type Preferences,
  type View,
  type Sticker,
  dayNames,
  formatTime,
  entryLanes,
  conflicts,
  getTheme,
} from "../model";
import { Flower, Mochi } from "./Artwork";
export const HOUR_HEIGHT = 48;
type Props = {
  schedule: Schedule;
  preferences: Preferences;
  week: Date;
  view: View;
  day: number;
  onDay: (d: number) => void;
  onEdit: (e: Entry) => void;
  onAdd: (day: number, start?: number) => void;
  onResize: (id: string, end: number) => void;
  onSticker: (id: string, patch: Partial<Sticker>) => void;
  selectedSticker: string | null;
  onSelectSticker: (id: string) => void;
  interactive?: boolean;
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
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.id, data: { entry }, disabled: !interactive });
  const resize = useRef<{ y: number; end: number } | null>(null);
  const block = useRef<HTMLDivElement | null>(null);
  const height = ((entry.end - entry.start) / 60) * HOUR_HEIGHT;
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        block.current = node;
      }}
      className={`schedule-block ${isDragging ? "dragging" : ""} ${conflict ? "has-conflict" : ""}`}
      style={
        {
          background: entry.color,
          top: ((entry.start - startHour * 60) / 60) * HOUR_HEIGHT,
          height,
          left: `calc(${(lanes.lane / lanes.count) * 100}% + 5px)`,
          width: `calc(${100 / lanes.count}% - 10px)`,
          borderRadius: radius,
          fontSize,
          transform: transform
            ? `translate3d(${transform.x}px,${transform.y}px,0)`
            : undefined,
          zIndex: isDragging ? 50 : 2,
        } as CSSProperties
      }
      {...attributes}
      {...listeners}
      onClick={onEdit}
      aria-label={`${entry.title}, ${dayNames[entry.day]}, ${formatTime(entry.start, preferences.time24)} to ${formatTime(entry.end, preferences.time24)}${conflict ? ", overlapping activity" : ""}`}
    >
      <div className="block-title">
        {entry.title}
        {conflict && <AlertCircle size={12} />}
      </div>
      <div className="block-time">
        {formatTime(entry.start, preferences.time24)} –{" "}
        {formatTime(entry.end, preferences.time24)}
      </div>
      {height >= 62 && entry.location && (
        <div className="block-location">
          <MapPin size={10} />
          {entry.location}
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
                (((ev.clientY - resize.current.y) / HOUR_HEIGHT) * 60) / 15,
              ) * 15;
            const end = Math.max(
              entry.start + 15,
              Math.min(1440, resize.current.end + minutes),
            );
            if (block.current)
              block.current.style.height = `${((end - entry.start) / 60) * HOUR_HEIGHT}px`;
          }}
          onPointerUp={(ev) => {
            if (!resize.current) return;
            const end =
              resize.current.end +
              Math.round(
                (((ev.clientY - resize.current.y) / HOUR_HEIGHT) * 60) / 15,
              ) *
                15;
            resize.current = null;
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
}: {
  day: number;
  children: React.ReactNode;
  onAdd: (day: number, time: number) => void;
  interactive: boolean;
  startHour: number;
  endHour: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day}`,
    data: { day },
    disabled: !interactive,
  });
  return (
    <div
      ref={setNodeRef}
      className={`day-column ${isOver ? "drop-active" : ""}`}
      style={{ height: (endHour - startHour) * HOUR_HEIGHT }}
      onDoubleClick={(ev) => {
        if (ev.target !== ev.currentTarget || !interactive) return;
        const rect = ev.currentTarget.getBoundingClientRect();
        onAdd(
          day,
          Math.min(
            endHour * 60 - 60,
            Math.max(
              startHour * 60,
              Math.floor(((ev.clientY - rect.top) / HOUR_HEIGHT) * 4) * 15 +
                startHour * 60,
            ),
          ),
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
      aria-label={`Decorative ${sticker.emoji} sticker. Drag to move.`}
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
      {sticker.emoji}
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
}: Props) {
  const d = schedule.design;
  const theme =
    d.customTheme && d.theme === d.customTheme.id
      ? d.customTheme
      : getTheme(d.theme);
  const min = Math.min(
    d.startHour,
    ...schedule.entries.map((e) => Math.floor(e.start / 60)),
  );
  const max = Math.max(
    d.endHour,
    ...schedule.entries.map((e) => Math.ceil(e.end / 60)),
  );
  const ordered =
    preferences.weekStart === "sunday"
      ? [6, 0, 1, 2, 3, 4, 5]
      : [0, 1, 2, 3, 4, 5, 6];
  const days =
    view === "daily" ? [day] : ordered.filter((v) => d.weekends || v < 5);
  const conflicting = conflicts(schedule.entries).map((e) => e.id);
  const today = new Date();
  const touch = useRef<number | null>(null);
  const monday = startOfWeek(week, { weekStartsOn: 1 });
  const dateFor = (n: number) => addDays(monday, n);
  const midnight = d.theme === "midnight";
  const style: CSSProperties = {
    backgroundColor: d.background,
    color: midnight ? "#eee2f5" : "#5c524f",
    fontFamily: `'${d.font}', ${d.font === "Georgia" ? "serif" : "sans-serif"}`,
    textAlign: d.alignment,
    borderStyle: d.border === "none" ? "none" : d.border,
    borderWidth: d.border === "double" ? 5 : 1,
    borderColor: theme.accent,
    backgroundImage: d.image
      ? `linear-gradient(#ffffff22,#ffffff22),url(${d.image})`
      : d.gradient
        ? `linear-gradient(135deg, ${d.background}, ${theme.accent}65)`
        : d.pattern === "dots"
          ? `radial-gradient(${theme.accent}50 0.7px, transparent 0.7px)`
          : d.pattern === "grid"
            ? `linear-gradient(${theme.accent}22 1px, transparent 1px),linear-gradient(90deg,${theme.accent}22 1px,transparent 1px)`
            : undefined,
    backgroundSize: d.image
      ? "cover"
      : d.gradient
        ? "cover"
        : d.pattern === "dots"
          ? "12px 12px"
          : "18px 18px",
  };
  const month = startOfMonth(week);
  const monthFirst = startOfWeek(month, {
    weekStartsOn: preferences.weekStart === "monday" ? 1 : 0,
  });
  const monthDays = Array.from(
    {
      length:
        Math.ceil(
          ((month.getTime() - monthFirst.getTime()) / 86400000 +
            getDaysInMonth(month)) /
            7,
        ) * 7,
    },
    (_, i) => addDays(monthFirst, i),
  );
  return (
    <div
      className={`schedule-paper ${midnight ? "night-paper" : ""} ${d.grid ? "show-grid" : ""} view-${view}`}
      style={style}
      onTouchStart={(ev) => {
        if (view === "daily") touch.current = ev.touches[0].clientX;
      }}
      onTouchEnd={(ev) => {
        if (view !== "daily" || touch.current === null) return;
        const delta = ev.changedTouches[0].clientX - touch.current;
        if (Math.abs(delta) > 80) onDay((day + (delta < 0 ? 1 : 6)) % 7);
        touch.current = null;
      }}
    >
      <div className="paper-heading">
        <div className="paper-kicker">
          a little space for everything you love
        </div>
        <h2>{schedule.title}</h2>
        <p>{d.subtitle}</p>
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
                    onClick={() => onAdd(v)}
                    data-export-ignore
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div
            className="timetable"
            style={{
              gridTemplateColumns: `48px repeat(${days.length}, minmax(0,1fr))`,
            }}
          >
            <div
              className="hours"
              style={{ height: (max - min) * HOUR_HEIGHT }}
            >
              {Array.from({ length: max - min }, (_, i) => (
                <span style={{ top: i * HOUR_HEIGHT }} key={i}>
                  {formatTime((min + i) * 60, preferences.time24)}
                </span>
              ))}
            </div>
            {days.map((v) => {
              const entries = schedule.entries.filter((e) => e.day === v);
              const lanes = entryLanes(entries);
              return (
                <Column
                  key={v}
                  day={v}
                  interactive={interactive}
                  startHour={min}
                  endHour={max}
                  onAdd={onAdd}
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
                      onEdit={() => interactive && onEdit(e)}
                      onResize={(end) => onResize(e.id, end)}
                      interactive={interactive}
                      conflict={conflicting.includes(e.id)}
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
        <div className="schedule-list">
          {ordered.map((v) => {
            const entries = schedule.entries
              .filter((e) => e.day === v)
              .sort((a, b) => a.start - b.start);
            return (
              <section key={v}>
                <h3>
                  {dayNames[v]}
                  <small>{format(dateFor(v), "MMM d")}</small>
                </h3>
                {entries.length ? (
                  entries.map((e) => (
                    <button
                      className="list-activity"
                      style={{ borderLeftColor: e.color }}
                      key={e.id}
                      onClick={() => interactive && onEdit(e)}
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
                      {conflicting.includes(e.id) && <AlertCircle size={15} />}
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
        <div className="month-grid">
          {ordered.map((v) => (
            <div className="month-label" key={v}>
              {dayNames[v].slice(0, 3)}
            </div>
          ))}
          {monthDays.map((date) => {
            const v = (date.getDay() + 6) % 7;
            return (
              <div
                key={date.toISOString()}
                className={`month-cell ${date.getMonth() !== month.getMonth() ? "other-month" : ""} ${isSameDay(date, today) ? "current-date" : ""}`}
              >
                <span>{format(date, "d")}</span>
                {schedule.entries
                  .filter((e) => e.day === v)
                  .sort((a, b) => a.start - b.start)
                  .map((e) => (
                    <button
                      key={e.id}
                      style={{ background: e.color }}
                      onClick={() => interactive && onEdit(e)}
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
