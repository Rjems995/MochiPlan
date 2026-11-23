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
  shiftDate,
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
  type TextBox,
  type View,
} from "../model";
import type { NavigationController } from "./useNavigation";
import type { WorkspaceController } from "./useWorkspace";
import {
  editOccurrence,
  deleteActivity as removeActivity,
  type EditSelection,
  type EditScope,
} from "../series";
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
  const [sizeOpen, setSizeOpen] = useState(false);
  const [sizeOverflow, setSizeOverflow] = useState(false);
  const [customHourHeight, setCustomHourHeight] = useState(HOUR_HEIGHT);
  const [pendingEdit, setPendingEdit] = useState<{
    entry: Entry;
    edited: Entry;
    date: string;
  } | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const [selectedTextBox, setSelectedTextBox] = useState<string | null>(null);
  const [textEditRequest, setTextEditRequest] = useState(0);
  function selectTextBox(id: string | null) {
    setSelectedTextBox(id);
    if (id) {
      setSelectedSticker(null);
      setTextEditRequest((value) => value + 1);
    }
  }
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
    setSelectedTextBox(null);
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
    const date = entry.date || dateForWeekday(week, entry.day, p!.weekStart);
    const moved = {
      ...moveEntry(
        entry,
        target,
        (event.delta.y / canvasScale / canvasHourHeight) * 60,
        0,
        1440,
      ),
      date: dateForWeekday(week, target, p!.weekStart),
      cancelledDates: [],
    };
    requestChange(entry, moved, date);
  }
  function requestChange(entry: Entry, edited: Entry, date: string) {
    if (
      entry.day === edited.day &&
      entry.start === edited.start &&
      entry.end === edited.end &&
      (!entry.date || entry.date === edited.date)
    )
      return;
    if (!entry.date) setPendingEdit({ entry, edited, date });
    else
      updateSchedule((s) => ({
        ...s,
        entries: editOccurrence(
          s,
          entry.id,
          edited,
          { scope: "date", occurrenceDate: date },
          p!.weekStart,
          uid,
        ),
      }));
  }
  function applyPendingEdit(scope: EditScope) {
    if (!pendingEdit) return;
    updateSchedule((s) => ({
      ...s,
      entries: editOccurrence(
        s,
        pendingEdit.entry.id,
        pendingEdit.edited,
        { scope, occurrenceDate: pendingEdit.date },
        p!.weekStart,
        uid,
      ),
    }));
    setPendingEdit(null);
    if (scope === "future") {
      let date =
        pendingEdit.edited.date ||
        dateForWeekday(pendingEdit.date, pendingEdit.edited.day, p!.weekStart);
      if (date < pendingEdit.date) date = shiftDate(date, 7);
      setWeek(parseISO(date));
      setDay(pendingEdit.edited.day);
    }
    notify(
      scope === "date"
        ? "Only this date has changed."
        : scope === "future"
          ? "This and future dates have changed."
          : "Your entire series has been updated.",
    );
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
  const canvasHourHeight = active?.design.canvasSize
    ? customHourHeight
    : (view === "weekly" || view === "daily") && canvasFrame.height > 0
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
          onResize: (id: string, end: number, date?: string) => {
            ignoreClick.current = Date.now() + 300;
            const entry = active.entries.find((e) => e.id === id);
            const bounded = entry
              ? Math.max(entry.start + 15, Math.min(1440, end))
              : end;
            if (entry && bounded !== entry.end)
              requestChange(
                entry,
                { ...entry, end: bounded, date: entry.date || date },
                date ||
                  entry.date ||
                  dateForWeekday(week, entry.day, p.weekStart),
              );
          },
          onSticker: (id: string, patch: Partial<Sticker>) =>
            design({
              stickers: active.design.stickers.map((s) =>
                s.id === id ? { ...s, ...patch } : s,
              ),
            }),
          selectedSticker,
          onSelectSticker: (id: string | null) => {
            setSelectedSticker(id);
            setSelectedTextBox(null);
          },
          onHourHeightChange: setCustomHourHeight,
          onSizeOverflowChange: setSizeOverflow,
          selectedTextBox,
          onSelectTextBox: selectTextBox,
          onTextBox: (id: string, patch: Partial<TextBox>) =>
            design({
              textBoxes: (active.design.textBoxes || []).map((box) =>
                box.id === id ? { ...box, ...patch } : box,
              ),
            }),
          onEditTextBox: (id: string) => {
            selectTextBox(id);
            setTools(true);
          },
          onDeleteTextBox: (id: string) => {
            design({
              textBoxes: (active.design.textBoxes || []).filter(
                (box) => box.id !== id,
              ),
            });
            setSelectedTextBox(null);
          },
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
  function saveEntries(entries: Entry[], selection?: EditSelection) {
    if (!editor) return;

    updateSchedule((s) => ({
      ...s,
      entries: editor.entry
        ? editOccurrence(
            s,
            editor.entry.id,
            entries[0],
            selection || {
              scope: "series",
              occurrenceDate:
                editor.date ||
                entries[0].date ||
                dateForWeekday(week, editor.day, p!.weekStart),
            },
            p!.weekStart,
            uid,
          )
        : [...s.entries, ...entries],
    }));
    if (entries[0]?.date) {
      setWeek(parseISO(entries[0].date));
      setDay(entries[0].day);
    } else if (selection?.scope === "future") {
      let date = dateForWeekday(
        selection.occurrenceDate,
        entries[0].day,
        p!.weekStart,
      );
      if (date < selection.occurrenceDate) date = shiftDate(date, 7);
      setWeek(parseISO(date));
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
          seriesId: undefined,
          sourceId: undefined,
          originalDate: undefined,
        },
      ],
    }));
    setEditor(null);
    notify("Activity duplicated. Adjust its day or time to make it yours.");
  }
  function deleteActivity() {
    updateSchedule((s) => ({
      ...s,
      entries: removeActivity(s.entries, deleteEntry!),
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
    sizeOpen,
    setSizeOpen,
    sizeOverflow,
    selectedSticker,
    setSelectedSticker,
    selectedTextBox,
    setSelectedTextBox,
    selectTextBox,
    textEditRequest,
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
    pendingEdit,
    setPendingEdit,
    applyPendingEdit,
  };
}
export type ScheduleEditorController = ReturnType<typeof useScheduleEditor>;
