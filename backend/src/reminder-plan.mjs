import { createHash, ECDH } from "node:crypto";
import { DateTime } from "luxon";
import { HttpError } from "./errors.mjs";
import { validSeriesMetadata } from "./series-validation.mjs";
import { dueTaskReminders, validateReminderTasks } from "./task-reminders.mjs";

const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, max = 10000) => typeof v === "string" && v.length <= max;
const identifier = (v) => text(v, 200) && !!v.trim();
const integer = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const date = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !v.startsWith("0000") &&
  DateTime.fromISO(v, { zone: "UTC" }).isValid;
const weekday = (v) => (new Date(v + "T12:00:00Z").getUTCDay() + 6) % 7;
const ensure = (condition, message) => {
  if (!condition) throw new HttpError(400, message);
};
export const validDeviceId = (id) =>
  typeof id === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    id,
  );
export const planHash = (plan) =>
  createHash("sha256").update(JSON.stringify(plan)).digest("hex");

export function validateSubscription(value) {
  ensure(
    object(value) && text(value.endpoint, 4096) && object(value.keys),
    "Choose a valid push subscription.",
  );
  let endpoint;
  try {
    endpoint = new URL(value.endpoint);
  } catch {
    throw new HttpError(400, "Choose a valid push endpoint.");
  }
  const host = endpoint.hostname;
  const allowed =
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host === "web.push.apple.com" ||
    host.endsWith(".notify.windows.com");
  ensure(
    endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.hash &&
      (!endpoint.port || endpoint.port === "443") &&
      allowed,
    "Choose a supported browser push endpoint.",
  );
  for (const [name, length] of [
    ["p256dh", 65],
    ["auth", 16],
  ]) {
    const valueKey = value.keys[name];
    ensure(
      typeof valueKey === "string" &&
        /^[A-Za-z0-9_-]+$/.test(valueKey) &&
        Buffer.from(valueKey, "base64url").length === length,
      "The push subscription keys are invalid.",
    );
  }
  try {
    ECDH.convertKey(Buffer.from(value.keys.p256dh, "base64url"), "prime256v1");
  } catch {
    throw new HttpError(400, "The push subscription keys are invalid.");
  }
  ensure(
    value.expirationTime == null ||
      (Number.isFinite(value.expirationTime) &&
        value.expirationTime > Date.now()),
    "The push subscription has expired.",
  );
  return {
    endpoint: endpoint.href,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
  };
}
export function validateReminderPlan(value) {
  ensure(
    object(value) && value.version === 1 && text(value.timezone, 100),
    "Choose a valid reminder plan.",
  );
  ensure(
    DateTime.now().setZone(value.timezone).isValid,
    "Choose a valid device time zone.",
  );
  ensure(
    [0, 5, 10, 15, 30].includes(value.minutes) &&
      typeof value.time24 === "boolean",
    "Choose a supported reminder time.",
  );
  ensure(
    Array.isArray(value.schedules) && value.schedules.length <= 1000,
    "The reminder schedules are invalid.",
  );
  const ids = new Set();
  let entries = 0;
  const schedules = value.schedules.map((s) => {
    ensure(
      object(s) &&
        identifier(s.id) &&
        !ids.has(s.id) &&
        text(s.name) &&
        Array.isArray(s.entries) &&
        s.entries.length <= 10000,
      "A reminder planner is invalid.",
    );
    ids.add(s.id);
    entries += s.entries.length;
    ensure(
      entries <= 20000,
      "Background reminders support up to 20,000 activities per device.",
    );
    ensure(
      (s.termStart === undefined || date(s.termStart)) &&
        (s.termEnd === undefined || date(s.termEnd)) &&
        (!s.termStart || !s.termEnd || s.termStart <= s.termEnd),
      "The reminder semester dates are invalid.",
    );
    ensure(
      s.holidays === undefined ||
        (Array.isArray(s.holidays) &&
          s.holidays.length <= 1000 &&
          s.holidays.every(
            (h) =>
              object(h) &&
              date(h.startDate) &&
              date(h.endDate) &&
              h.startDate <= h.endDate,
          )),
      "The reminder holidays are invalid.",
    );
    const entryIds = new Set();
    const items = s.entries.map((e) => {
      ensure(
        object(e) &&
          identifier(e.id) &&
          !entryIds.has(e.id) &&
          text(e.title) &&
          text(e.location) &&
          integer(e.day, 0, 6) &&
          integer(e.start, 0, 1439) &&
          integer(e.end, 1, 1440) &&
          e.end > e.start,
        "A reminder activity is invalid.",
      );
      entryIds.add(e.id);
      ensure(
        e.date === undefined || (date(e.date) && weekday(e.date) === e.day),
        "A reminder event date is invalid.",
      );
      ensure(
        e.cancelledDates === undefined ||
          (Array.isArray(e.cancelledDates) &&
            e.cancelledDates.length <= 10000 &&
            new Set(e.cancelledDates).size === e.cancelledDates.length &&
            e.cancelledDates.every(
              (d) => date(d) && (e.date ? d === e.date : weekday(d) === e.day),
            )),
        "A reminder cancellation is invalid.",
      );
      return {
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
      };
    });
    ensure(
      validSeriesMetadata(items, date, weekday),
      "The reminder series is invalid.",
    );
    return {
      id: s.id,
      name: s.name,
      termStart: s.termStart,
      termEnd: s.termEnd,
      holidays: s.holidays?.map((h) => ({
        startDate: h.startDate,
        endDate: h.endDate,
      })),
      entries: items,
    };
  });
  const tasks = validateReminderTasks(value.tasks);
  ensure(
    value.profileId === undefined || identifier(value.profileId),
    "The reminder workspace is invalid.",
  );
  return JSON.parse(
    JSON.stringify({
      version: 1,
      timezone: value.timezone,
      minutes: value.minutes,
      time24: value.time24,
      schedules,
      ...(tasks.length
        ? { tasks, ...(value.profileId ? { profileId: value.profileId } : {}) }
        : {}),
    }),
  );
}
export function occursOn(schedule, entry, day) {
  if (entry.date ? entry.date !== day : entry.day !== weekday(day))
    return false;
  if (entry.cancelledDates?.includes(day)) return false;
  return (
    !!entry.date ||
    !(
      (schedule.termStart && day < schedule.termStart) ||
      (schedule.termEnd && day > schedule.termEnd) ||
      (entry.startsOn && day < entry.startsOn) ||
      (entry.endsOn && day > entry.endsOn) ||
      schedule.holidays?.some((h) => h.startDate <= day && day <= h.endDate)
    )
  );
}
export function dueReminders(plan, now, since = now - 300000) {
  const local = DateTime.fromMillis(now, { zone: plan.timezone });
  // Yesterday catches midnight reminders; tomorrow catches advance reminders across midnight.
  const dates = [-1, 0, 1].map((offset) =>
    local.plus({ days: offset }).toISODate(),
  );
  const jobs = [];
  for (const schedule of plan.schedules)
    for (const day of dates)
      for (const entry of schedule.entries) {
        if (!occursOn(schedule, entry, day)) continue;
        const dateTime = DateTime.fromISO(
          `${day}T${String(Math.floor(entry.start / 60)).padStart(2, "0")}:${String(entry.start % 60).padStart(2, "0")}`,
          { zone: plan.timezone },
        );
        // Pick the earlier instant in an autumn clock overlap; spring gaps move forward.
        const startsAt = Math.min(
          ...dateTime.getPossibleOffsets().map((d) => d.toMillis()),
        );
        const dueAt = startsAt - plan.minutes * 60000;
        if (dueAt < since || dueAt > now || now >= startsAt + 60000) continue;
        const id = createHash("sha256")
          .update(
            JSON.stringify([
              schedule.id,
              entry.seriesId || entry.id,
              entry.originalDate || day,
            ]),
          )
          .digest("hex");
        const url = `/?planner=${encodeURIComponent(schedule.id)}&date=${day}`;
        jobs.push({
          id,
          dueAt,
          expiresAt: Math.min(startsAt + 60000, dueAt + 300000),
          payload: {
            type: "mochi-reminder",
            id,
            title: `Coming up: ${entry.title.slice(0, 100)}`,
            body: `${dateTime.setLocale("en").toFormat(plan.time24 ? "HH:mm" : "h:mm a")} · ${schedule.name.slice(0, 80)}${entry.location ? ` · ${entry.location.slice(0, 100)}` : ""}`,
            url,
            expiresAt: Math.min(startsAt + 60000, dueAt + 300000),
          },
        });
      }
  return [...jobs, ...dueTaskReminders(plan, now, since)];
}
