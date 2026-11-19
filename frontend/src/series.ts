import type { Entry, Schedule } from "./model.ts";
import {
  dateForWeekday,
  shiftDate,
  weekdayForDate,
  isCalendarDate,
} from "./calendar.ts";

export type EditScope = "date" | "future" | "series";
export type EditSelection = { scope: EditScope; occurrenceDate: string };
export const editScopes: { value: EditScope; label: string }[] = [
  { value: "date", label: "This date" },
  { value: "future", label: "Future dates" },
  { value: "series", label: "Entire series" },
];
const fields = [
  "title",
  "day",
  "start",
  "end",
  "location",
  "instructor",
  "notes",
  "color",
] as const;
export const seriesKey = (entry: Entry) => entry.seriesId || entry.id;
export const isRecurring = (entry: Entry) => !entry.date || !!entry.sourceId;

export function sourceEntry(schedule: Schedule, entry: Entry): Entry {
  return schedule.entries.find((e) => e.id === entry.sourceId) || entry;
}
export function originalOccurrence(
  schedule: Schedule,
  entry: Entry,
  date: string,
): string {
  const source = sourceEntry(schedule, entry);
  const key = entry.originalDate || date;
  return source.startsOn && key < source.startsOn
    ? source.startsOn
    : source.endsOn && key > source.endsOn
      ? source.endsOn
      : key;
}
export function replacementFor(
  entries: Entry[],
  sourceId: string,
  date: string,
) {
  return entries.find(
    (entry) => entry.sourceId === sourceId && entry.originalDate === date,
  );
}
export function logicalActivityCount(entries: Entry[]) {
  return new Set(
    entries
      .filter((e) => !e.sourceId)
      .map((e) => `${e.date ? "event" : "series"}:${seriesKey(e)}`),
  ).size;
}

export function validSeriesMetadata(entries: Entry[]): boolean {
  const ids = new Map(entries.map((e) => [e.id, e]));
  const origins = new Set<string>();
  const groups = new Map<string, Entry[]>();
  const identifier = (value: unknown) =>
    typeof value === "string" && !!value.trim() && value.length <= 200;
  for (const e of entries) {
    if (
      (e.seriesId !== undefined && !identifier(e.seriesId)) ||
      (e.startsOn !== undefined && !isCalendarDate(e.startsOn)) ||
      (e.endsOn !== undefined && !isCalendarDate(e.endsOn)) ||
      (e.startsOn && e.endsOn && e.startsOn > e.endsOn) ||
      (e.date && (e.startsOn !== undefined || e.endsOn !== undefined))
    )
      return false;
    if (e.sourceId !== undefined || e.originalDate !== undefined) {
      if (
        !e.date ||
        !identifier(e.sourceId) ||
        !identifier(e.seriesId) ||
        !isCalendarDate(e.originalDate)
      )
        return false;
      const source = ids.get(e.sourceId!);
      const key = JSON.stringify([e.sourceId, e.originalDate]);
      if (
        !source ||
        source.date ||
        seriesKey(source) !== e.seriesId ||
        weekdayForDate(e.originalDate!) !== source.day ||
        !source.cancelledDates?.includes(e.originalDate!) ||
        origins.has(key)
      )
        return false;
      origins.add(key);
    } else if (e.date && e.seriesId !== undefined) return false;
    if (!e.date) {
      const group = groups.get(seriesKey(e)) || [];
      group.push(e);
      groups.set(seriesKey(e), group);
    }
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) =>
      (a.startsOn || "0001-01-01").localeCompare(b.startsOn || "0001-01-01"),
    );
    for (let i = 1; i < sorted.length; i++)
      if (
        (sorted[i - 1].endsOn || "9999-12-31") >=
        (sorted[i].startsOn || "0001-01-01")
      )
        return false;
  }
  return true;
}

/** One immutable transaction, so every scope is a single undoable operation. */
export function editOccurrence(
  schedule: Schedule,
  originalId: string,
  edited: Entry,
  selection: EditSelection,
  weekStart: "monday" | "sunday",
  makeId: () => string,
): Entry[] {
  const original = schedule.entries.find((e) => e.id === originalId);
  if (!original) return schedule.entries;
  if (!isRecurring(original)) {
    return schedule.entries.map((e) =>
      e.id === originalId ? { ...edited, id: e.id } : e,
    );
  }
  const source = sourceEntry(schedule, original);
  const key = seriesKey(source);
  const cutoff = originalOccurrence(
    schedule,
    original,
    selection.occurrenceDate,
  );
  if (selection.scope === "date") {
    const date =
      edited.date ||
      dateForWeekday(selection.occurrenceDate, edited.day, weekStart);
    const existing = original.sourceId
      ? original
      : replacementFor(schedule.entries, source.id, cutoff);
    const cancelled = existing
      ? existing.cancelledDates?.includes(existing.date!)
      : source.cancelledDates?.includes(cutoff);
    const override: Entry = {
      ...edited,
      id: existing?.id || makeId(),
      date,
      day: weekdayForDate(date),
      seriesId: key,
      sourceId: source.id,
      originalDate: existing?.originalDate || cutoff,
      startsOn: undefined,
      endsOn: undefined,
      cancelledDates: cancelled ? [date] : [],
    };
    const entries = schedule.entries.map((e) =>
      e.id === source.id
        ? {
            ...e,
            seriesId: key,
            cancelledDates: [
              ...new Set([...(e.cancelledDates || []), override.originalDate!]),
            ].sort(),
          }
        : e.id === existing?.id
          ? override
          : e,
    );
    return existing ? entries : [...entries, override];
  }

  // Only edited fields propagate. Unchanged fields retain later scheduled changes.
  const patch: Partial<Entry> = {};
  for (const field of fields)
    if (edited[field] !== source[field])
      Object.assign(patch, { [field]: edited[field] });
  if (edited.start !== source.start || edited.end !== source.end) {
    patch.start = edited.start;
    patch.end = edited.end;
  }
  if (!Object.keys(patch).length) return schedule.entries;
  type Mapping = { source: Entry; target: Entry; from?: string };
  const mappings: Mapping[] = [];
  const result: Entry[] = [];
  for (const entry of schedule.entries) {
    if (
      entry.date ||
      seriesKey(entry) !== key ||
      (selection.scope === "future" && entry.endsOn && entry.endsOn < cutoff)
    ) {
      result.push(entry);
      continue;
    }
    let next = { ...entry, seriesId: key };
    const future = selection.scope === "future";
    if (
      future &&
      (!entry.startsOn || entry.startsOn < cutoff) &&
      shiftDate(cutoff, -1)
    ) {
      result.push({
        ...entry,
        seriesId: key,
        endsOn: shiftDate(cutoff, -1),
        cancelledDates: entry.cancelledDates?.filter((d) => d < cutoff),
      });
      next = {
        ...next,
        id: makeId(),
        startsOn: cutoff,
        cancelledDates: entry.cancelledDates?.filter((d) => d >= cutoff),
      };
    }
    next = { ...next, ...patch, date: undefined };
    if (next.day !== entry.day)
      next.cancelledDates = next.cancelledDates?.map((date) =>
        dateForWeekday(date, next.day, weekStart),
      );
    result.push(next);
    mappings.push({
      source: entry,
      target: next,
      from: future ? cutoff : undefined,
    });
  }
  return result.map((entry) => {
    if (!entry.sourceId || !entry.originalDate) return entry;
    const mapping = mappings.find(
      (m) =>
        m.source.id === entry.sourceId &&
        (m.source.id === m.target.id ||
          !m.from ||
          entry.originalDate! >= m.from),
    );
    if (!mapping) return entry;
    const { day: _day, ...eventPatch } = patch;
    return {
      ...entry,
      ...eventPatch,
      sourceId: mapping.target.id,
      originalDate:
        mapping.source.day === mapping.target.day
          ? entry.originalDate
          : dateForWeekday(entry.originalDate, mapping.target.day, weekStart),
    };
  });
}

export function duplicateEntries(
  entries: Entry[],
  makeId: () => string,
): Entry[] {
  const ids = new Map(entries.map((e) => [e.id, makeId()]));
  const families = new Map<string, string>();
  for (const e of entries)
    if (e.seriesId && !families.has(e.seriesId))
      families.set(e.seriesId, ids.get(e.seriesId) || makeId());
  return entries.map((e) => ({
    ...structuredClone(e),
    id: ids.get(e.id)!,
    seriesId: e.seriesId ? families.get(e.seriesId) : undefined,
    sourceId: e.sourceId ? ids.get(e.sourceId) : undefined,
  }));
}
export function deleteActivity(entries: Entry[], id: string): Entry[] {
  const original = entries.find((e) => e.id === id);
  return !original || original.date
    ? entries.filter((e) => e.id !== id)
    : entries.filter((e) => seriesKey(e) !== seriesKey(original));
}
