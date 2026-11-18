import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { parseISO, startOfWeek } from "date-fns";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  conflictsOnDate,
  dateForWeekday,
  dateKey,
  entriesOnDate,
  initialCalendarDate,
  shiftCancellationWeekday,
  viewDates,
  weekdayForDate,
} from "../calendar";
import { HOUR_HEIGHT } from "../components/ScheduleCanvas";
import {
  moveEntry,
  uid,
  type Entry,
  type Schedule,
  type Sticker,
  type View,
} from "../model";
import type { NavigationController } from "./useNavigation";
import type { WorkspaceController } from "./useWorkspace";
export function useScheduleEditor(
  workspace: WorkspaceController,
  navigation: NavigationController,
  now: Date,
  notify: (text: string) => void,
) {
  const { data, active, p, setData, updateSchedule, design } = workspace;
  const { setPage } = navigation;
  const [view, setView] = useState<View>(() =>
    window.innerWidth <= 640 ? "daily" : "weekly",
  );
  const [week, setWeek] = useState(() => new Date());
  const [day, setDay] = useState((new Date().getDay() + 6) % 7);
  const [editor, setEditor] = useState<{
    entry: Entry | null;
    day: number;
    start: number;
    date?: string;
  } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const [tools, setTools] = useState(() => window.innerWidth > 850);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasFrame, setCanvasFrame] = useState({ width: 0, height: 0 });
  const [canvasChrome, setCanvasChrome] = useState(128);
  const handleCanvasChrome = useCallback(
    (height: number) =>
      setCanvasChrome((old) => (Math.abs(old - height) < 0.5 ? old : height)),
    [],
  );
  const handleCanvasSize = useCallback(
    (size: { width: number; height: number }) =>
      setCanvasFrame((old) =>
        old.width === size.width && old.height === size.height ? old : size,
      ),
    [],
  );
  const [focusMode, setFocusMode] = useState(false);
  const ignoreClick = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    const opened =
      data.schedules.find((s) => s.id === data.activeId) || data.schedules[0];
    const date = initialCalendarDate(opened, dateKey(new Date()));
    setWeek(parseISO(date));
    setDay(weekdayForDate(date));
  }, [data]);
  function chooseSchedule(id: string) {
    const selected = data?.schedules.find((s) => s.id === id);
    if (selected) {
      const date = initialCalendarDate(selected, dateKey(new Date()));
      setWeek(parseISO(date));
      setDay(weekdayForDate(date));
    }
    setData((old) => (old ? { ...old, activeId: id } : old));
    setPage("studio");
    setSelectedSticker(null);
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
  function dragEnd(event: DragEndEvent) {
    ignoreClick.current = Date.now() + 300;
    const entry = event.active.data.current?.entry as Entry | undefined;
    const target = event.over?.data.current?.day as number | undefined;
    if (!entry || target === undefined) return;
    updateSchedule((s) => ({
      ...s,
      entries: s.entries.map((e) => {
        if (e.id !== entry.id) return e;
        const moved = moveEntry(
          e,
          target,
          (event.delta.y / canvasScale / canvasHourHeight) * 60,
          0,
          1440,
        );
        if (e.date)
          return {
            ...moved,
            date: dateForWeekday(week, target, data!.preferences.weekStart),
            cancelledDates: [],
          };
        return {
          ...moved,
          cancelledDates: shiftCancellationWeekday(
            e,
            target,
            data!.preferences.weekStart,
          ),
        };
      }),
    }));
  }
  const todayDay = (now.getDay() + 6) % 7;
  const weekStart = startOfWeek(week, {
    weekStartsOn: (p?.weekStart || "monday") === "monday" ? 1 : 0,
  });
  const displayedDates = viewDates(week, view, day, p?.weekStart || "monday");
  const displayedEntries = displayedDates.flatMap((date) =>
    active ? entriesOnDate(active, date) : [],
  );
  const displayedConflicts = displayedDates.flatMap((date) =>
    active ? conflictsOnDate(active, date) : [],
  );
  const totalHours = displayedEntries.reduce(
    (a, e) => a + (e.end - e.start) / 60,
    0,
  );
  const timetableHours =
    Math.max(
      active?.design.endHour ?? 18,
      ...displayedEntries.map((e) => Math.ceil(e.end / 60)),
    ) -
    Math.min(
      active?.design.startHour ?? 8,
      ...displayedEntries.map((e) => Math.floor(e.start / 60)),
    );
  const canvasHourHeight =
    (view === "weekly" || view === "daily") && canvasFrame.height > 0
      ? Math.max(
          36,
          Math.min(
            88,
            (canvasFrame.height - canvasChrome - 2) / timetableHours,
          ),
        )
      : HOUR_HEIGHT;
  const canvasProps =
    active && p
      ? {
          hourHeight: canvasHourHeight,
          schedule: active,
          preferences: p,
          week,
          view,
          day,
          onDay: (selectedDay: number, date?: string) => {
            setDay(selectedDay);
            if (date) setWeek(parseISO(date));
          },
          onEdit: (e: Entry, date?: string) => {
            if (Date.now() > ignoreClick.current)
              setEditor({
                entry: e,
                day: e.day,
                start: e.start,
                date: date || dateForWeekday(week, e.day, p.weekStart),
              });
          },
          onAdd: (day: number, start = 540, date?: string) =>
            setEditor({
              entry: null,
              day,
              start,
              date: date || dateForWeekday(week, day, p.weekStart),
            }),
          onResize: (id: string, end: number) => {
            ignoreClick.current = Date.now() + 300;
            updateSchedule((s) => ({
              ...s,
              entries: s.entries.map((e) => (e.id === id ? { ...e, end } : e)),
            }));
          },
          onSticker: (id: string, patch: Partial<Sticker>) =>
            design({
              stickers: active.design.stickers.map((s) =>
                s.id === id ? { ...s, ...patch } : s,
              ),
            }),
          selectedSticker,
          onSelectSticker: setSelectedSticker,
        }
      : null;
  function saveCalendar(
    calendar: Pick<Schedule, "termStart" | "termEnd" | "holidays" | "entries">,
  ) {
    updateSchedule((s) => ({ ...s, ...calendar }));
    setCalendarOpen(false);
    notify("Calendar dates saved. Weekly activities now follow these dates.");
  }
  function toggleCancellation(id: string, date: string) {
    if (!active) return;

    const wasCancelled = active.entries
      .find((e) => e.id === id)
      ?.cancelledDates?.includes(date);
    updateSchedule((s) => ({
      ...s,
      entries: s.entries.map((e) =>
        e.id === id
          ? {
              ...e,
              cancelledDates: wasCancelled
                ? (e.cancelledDates || []).filter((d) => d !== date)
                : [...(e.cancelledDates || []), date],
            }
          : e,
      ),
    }));
    setEditor(null);
    notify(
      wasCancelled
        ? "This occurrence has been restored."
        : "Only this occurrence has been cancelled.",
    );
  }
  function saveEntries(entries: Entry[]) {
    if (!editor) return;

    updateSchedule((s) => ({
      ...s,
      entries: editor.entry
        ? s.entries.map((e) => (e.id === editor.entry!.id ? entries[0] : e))
        : [...s.entries, ...entries],
    }));
    if (entries[0]?.date) {
      setWeek(parseISO(entries[0].date));
      setDay(entries[0].day);
    }
    setEditor(null);
    notify(
      editor.entry
        ? "Your little changes are saved."
        : "A little plan added to your week.",
    );
  }
  function duplicateEntry(e: Entry) {
    updateSchedule((s) => ({
      ...s,
      entries: [
        ...s.entries,
        {
          ...e,
          id: uid(),
          title: `${e.title} (copy)`,
          cancelledDates: [],
        },
      ],
    }));
    setEditor(null);
    notify("Activity duplicated. Adjust its day or time to make it yours.");
  }
  function deleteActivity() {
    updateSchedule((s) => ({
      ...s,
      entries: s.entries.filter((e) => e.id !== deleteEntry),
    }));
    setDeleteEntry(null);
    setEditor(null);
  }
  return {
    view,
    setView,
    week,
    setWeek,
    day,
    setDay,
    editor,
    setEditor,
    calendarOpen,
    setCalendarOpen,
    deleteEntry,
    setDeleteEntry,
    exportOpen,
    setExportOpen,
    selectedSticker,
    setSelectedSticker,
    tools,
    setTools,
    focusMode,
    setFocusMode,
    canvasScale,
    setCanvasScale,
    handleCanvasChrome,
    handleCanvasSize,
    canvasRef,
    ignoreClick,
    chooseSchedule,
    sensors,
    dragEnd,
    todayDay,
    weekStart,
    displayedEntries,
    displayedConflicts,
    totalHours,
    canvasHourHeight,
    canvasProps,
    saveCalendar,
    toggleCancellation,
    saveEntries,
    duplicateEntry,
    deleteActivity,
  };
}
export type ScheduleEditorController = ReturnType<typeof useScheduleEditor>;
