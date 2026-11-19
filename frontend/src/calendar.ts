import { overlaps, type Entry, type Schedule, type View } from "./model.ts";

export function isCalendarDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function dateKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function weekdayForDate(date: string): number {
  return (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
}
export function shiftDate(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.getUTCFullYear() >= 1 && value.getUTCFullYear() <= 9999
    ? value.toISOString().slice(0, 10)
    : "";
}
export function dateForWeekday(
  reference: Date | string,
  day: number,
  weekStart: "monday" | "sunday" = "monday",
): string {
  const key = typeof reference === "string" ? reference : dateKey(reference);
  const first = weekStart === "monday" ? 0 : 6;
  return shiftDate(
    key,
    -((weekdayForDate(key) - first + 7) % 7) + ((day - first + 7) % 7),
  );
}
export function holidaysOnDate(schedule: Schedule, date: string) {
  return (schedule.holidays || []).filter(
    (h) => h.startDate <= date && date <= h.endDate,
  );
}
export function outsideTerm(schedule: Schedule, date: string) {
  return !!(
    (schedule.termStart && date < schedule.termStart) ||
    (schedule.termEnd && date > schedule.termEnd)
  );
}
export type OccurrenceStatus =
  "scheduled" | "cancelled" | "holiday" | "outside-term" | "none";
export function occurrenceStatus(
  schedule: Schedule,
  entry: Entry,
  date: string,
): OccurrenceStatus {
  if (entry.date ? entry.date !== date : entry.day !== weekdayForDate(date))
    return "none";
  if (
    !entry.date &&
    ((entry.startsOn && date < entry.startsOn) ||
      (entry.endsOn && date > entry.endsOn))
  )
    return "none";
  if (!entry.date && outsideTerm(schedule, date)) return "outside-term";
  if (entry.cancelledDates?.includes(date)) return "cancelled";
  if (!entry.date && holidaysOnDate(schedule, date).length) return "holiday";
  return "scheduled";
}
export function entriesOnDate(schedule: Schedule, date: string): Entry[] {
  return schedule.entries
    .filter((e) => occurrenceStatus(schedule, e, date) === "scheduled")
    .sort((a, b) => a.start - b.start);
}
export function cancelledOnDate(schedule: Schedule, date: string): Entry[] {
  return schedule.entries.filter(
    (e) =>
      occurrenceStatus(schedule, e, date) === "cancelled" &&
      !schedule.entries.some(
        (other) => other.sourceId === e.id && other.originalDate === date,
      ),
  );
}
export function rescheduledOnDate(schedule: Schedule, date: string): Entry[] {
  return schedule.entries.filter(
    (e) => e.originalDate === date && e.date && e.date !== date,
  );
}
export function conflictsOnDate(schedule: Schedule, date: string): Entry[] {
  const entries = entriesOnDate(schedule, date);
  return entries.filter((a) => entries.some((b) => overlaps(a, b)));
}
export function candidateConflicts(
  schedule: Schedule,
  entry: Entry,
  date: string,
): boolean {
  return (
    occurrenceStatus(schedule, entry, date) === "scheduled" &&
    entriesOnDate(schedule, date).some((other) => overlaps(entry, other))
  );
}
export function weekOccurrences(
  schedule: Schedule,
  reference: Date,
  weekStart: "monday" | "sunday",
) {
  return Array.from({ length: 7 }, (_, day) => {
    const date = dateForWeekday(reference, day, weekStart);
    return entriesOnDate(schedule, date).map((entry) => ({ entry, date }));
  }).flat();
}
export function viewDates(
  reference: Date,
  view: View,
  day: number,
  weekStart: "monday" | "sunday",
): string[] {
  if (view === "daily") return [dateForWeekday(reference, day, weekStart)];
  if (view !== "monthly")
    return (
      weekStart === "monday" ? [0, 1, 2, 3, 4, 5, 6] : [6, 0, 1, 2, 3, 4, 5]
    ).map((d) => dateForWeekday(reference, d, weekStart));
  const monthStart = dateKey(reference).slice(0, 7) + "-01";
  const first = weekStart === "monday" ? 0 : 6;
  const start = dateForWeekday(monthStart, first, weekStart);
  const date = new Date(monthStart + "T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  const cells =
    Math.ceil(
      (((weekdayForDate(monthStart) - first + 7) % 7) + date.getUTCDate()) / 7,
    ) * 7;
  return Array.from({ length: cells }, (_, i) => shiftDate(start, i));
}
export function weekConflicts(
  schedule: Schedule,
  reference: Date,
  weekStart: "monday" | "sunday",
): Entry[] {
  return Array.from({ length: 7 }, (_, day) =>
    conflictsOnDate(schedule, dateForWeekday(reference, day, weekStart)),
  ).flat();
}
export function nextOccurrence(
  schedule: Schedule,
  entry: Entry,
  from: string,
  minutes = 0,
): { entry: Entry; date: string } | null {
  if (entry.date)
    return entry.date >= from &&
      (entry.date !== from || entry.end > minutes) &&
      occurrenceStatus(schedule, entry, entry.date) === "scheduled"
      ? { entry, date: entry.date }
      : null;
  let cursor = [from, schedule.termStart || from, entry.startsOn || from]
    .sort()
    .at(-1)!;
  const end = [
    schedule.termEnd || "9999-12-31",
    entry.endsOn || "9999-12-31",
  ].sort()[0];
  cursor = shiftDate(cursor, (entry.day - weekdayForDate(cursor) + 7) % 7);
  while (cursor && cursor <= end) {
    const status = occurrenceStatus(schedule, entry, cursor);
    if (status === "scheduled" && (cursor !== from || entry.end > minutes))
      return { entry, date: cursor };
    if (status === "holiday") {
      const end = holidaysOnDate(schedule, cursor)
        .map((h) => h.endDate)
        .sort()
        .at(-1)!;
      cursor = shiftDate(end, 1);
      if (cursor)
        cursor = shiftDate(
          cursor,
          (entry.day - weekdayForDate(cursor) + 7) % 7,
        );
    } else cursor = shiftDate(cursor, 7);
  }
  return null;
}
export function shiftCancellationWeekday(
  entry: Entry,
  day: number,
  weekStart: "monday" | "sunday",
): string[] | undefined {
  return entry.cancelledDates?.map((date) =>
    dateForWeekday(date, day, weekStart),
  );
}
export function initialCalendarDate(schedule: Schedule, today: string): string {
  if (schedule.entries.length && schedule.entries.every((e) => e.date)) {
    const next = schedule.entries
      .map((e) => nextOccurrence(schedule, e, today))
      .filter((o): o is { entry: Entry; date: string } => o !== null)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) return next.date;
    return schedule.entries
      .map((e) => e.date!)
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a) - Date.parse(today)) -
          Math.abs(Date.parse(b) - Date.parse(today)),
      )[0];
  }
  if (schedule.termStart && today < schedule.termStart)
    return schedule.termStart;
  if (schedule.termEnd && today > schedule.termEnd) return schedule.termEnd;
  return today;
}
