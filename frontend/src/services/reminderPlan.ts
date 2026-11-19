import type { AppData, Entry } from "../model";

export function reminderPlan(data: AppData, timezone: string) {
  return {
    version: 1,
    timezone,
    minutes: data.preferences.reminderMinutes,
    time24: data.preferences.time24,
    schedules: data.schedules.map((s) => ({
      id: s.id,
      name: s.name,
      termStart: s.termStart,
      termEnd: s.termEnd,
      holidays: s.holidays?.map((h) => ({
        startDate: h.startDate,
        endDate: h.endDate,
      })),
      entries: s.entries.map((e) => ({
        id: e.id,
        title: e.title,
        location: e.location,
        day: e.day,
        start: e.start,
        end: e.end,
        date: e.date,
        cancelledDates: e.cancelledDates,
        seriesId: e.seriesId,
        startsOn: e.startsOn,
        endsOn: e.endsOn,
        sourceId: e.sourceId,
        originalDate: e.originalDate,
      })),
    })),
  };
}
export type ReminderPlan = ReturnType<typeof reminderPlan>;
export async function reminderId(
  scheduleId: string,
  entry: Entry,
  date: string,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([
        scheduleId,
        entry.seriesId || entry.id,
        entry.originalDate || date,
      ]),
    ),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
