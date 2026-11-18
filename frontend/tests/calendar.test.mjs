import test from "node:test";
import assert from "node:assert/strict";
import { defaultDesign, overlaps } from "../src/model.ts";
import { validateBackup } from "../src/storage.ts";
import {
  isCalendarDate,
  dateKey,
  weekdayForDate,
  shiftDate,
  dateForWeekday,
  occurrenceStatus,
  entriesOnDate,
  cancelledOnDate,
  conflictsOnDate,
  candidateConflicts,
  nextOccurrence,
  viewDates,
  shiftCancellationWeekday,
  initialCalendarDate,
} from "../src/calendar.ts";
const activity = (patch = {}) => ({
  id: "class",
  title: "Design principles",
  day: 0,
  start: 540,
  end: 630,
  location: "Studio 204",
  instructor: "",
  notes: "",
  color: "#f6d9e1",
  ...patch,
});
const planner = (patch = {}) => ({
  id: "planner",
  name: "Semester",
  title: "My planner",
  type: "Class schedule",
  updatedAt: Date.now(),
  entries: [activity()],
  design: defaultDesign(),
  ...patch,
});
const backup = (s) => ({
  version: 1,
  data: {
    activeId: s.id,
    schedules: [s],
    tasks: [],
    preferences: {
      name: "Friend",
      avatar: "🌷",
      theme: "strawberry",
      dark: false,
      weekStart: "monday",
      time24: false,
      favorites: [],
      favoriteThemes: [],
      reminders: false,
      reminderMinutes: 10,
      onboarded: true,
    },
  },
});
test("date-only validation rejects rollovers and accepts leap days", () => {
  for (const value of [
    "2026-02-29",
    "2026-11-31",
    "2026-13-01",
    "2026-1-01",
    "0000-01-01",
    "2026-01-01T00:00:00Z",
  ])
    assert.equal(isCalendarDate(value), false, value);
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.equal(isCalendarDate("0001-01-01"), true);
});
test("calendar day arithmetic does not shift dates through timezone conversion", () => {
  assert.equal(dateKey(new Date(2026, 10, 18, 23, 59)), "2026-11-18");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2028-02-28", 1), "2028-02-29");
  assert.equal(weekdayForDate("2026-11-18"), 2);
});
test("week dates honor Monday/Sunday starts across a year boundary", () => {
  assert.equal(dateForWeekday("2027-01-01", 0, "monday"), "2026-12-28");
  assert.equal(dateForWeekday("2027-01-01", 6, "sunday"), "2026-12-27");
  assert.equal(dateForWeekday("2026-11-22", 0, "sunday"), "2026-11-23");
  assert.equal(dateForWeekday("2026-11-18", 0, "sunday"), "2026-11-16");
});
test("weekly semester boundaries are inclusive and open bounds remain valid", () => {
  const s = planner({ termStart: "2026-11-16", termEnd: "2026-11-23" });
  assert.equal(entriesOnDate(s, "2026-11-09").length, 0);
  assert.equal(entriesOnDate(s, "2026-11-16").length, 1);
  assert.equal(entriesOnDate(s, "2026-11-23").length, 1);
  assert.equal(entriesOnDate(s, "2026-11-30").length, 0);
  assert.equal(entriesOnDate(planner(), "2027-11-15").length, 1);
});
test("one-off events appear only on their exact dates, including outside a semester", () => {
  const exam = activity({ id: "exam", day: 2, date: "2026-11-25" });
  const s = planner({ termEnd: "2026-11-20", entries: [activity(), exam] });
  assert.equal(entriesOnDate(s, "2026-11-18").length, 0);
  assert.deepEqual(
    entriesOnDate(s, "2026-11-25").map((e) => e.id),
    ["exam"],
  );
  assert.equal(entriesOnDate(s, "2026-12-02").length, 0);
});
test("holidays pause weekly classes throughout the inclusive range and keep explicit events", () => {
  const exam = activity({ id: "exam", date: "2026-11-16" });
  const s = planner({
    entries: [activity(), exam],
    holidays: [
      {
        id: "h",
        name: "Break",
        startDate: "2026-11-16",
        endDate: "2026-11-23",
      },
    ],
  });
  assert.equal(occurrenceStatus(s, s.entries[0], "2026-11-16"), "holiday");
  assert.deepEqual(
    entriesOnDate(s, "2026-11-16").map((e) => e.id),
    ["exam"],
  );
  assert.equal(entriesOnDate(s, "2026-11-23").length, 0);
  assert.equal(entriesOnDate(s, "2026-11-30").length, 1);
});
test("a cancellation skips just that occurrence and can be restored", () => {
  const e = activity({ cancelledDates: ["2026-11-16"] });
  const s = planner({ entries: [e] });
  assert.equal(entriesOnDate(s, "2026-11-16").length, 0);
  assert.equal(cancelledOnDate(s, "2026-11-16").length, 1);
  assert.equal(entriesOnDate(s, "2026-11-23").length, 1);
  assert.equal(
    entriesOnDate(
      { ...s, entries: [{ ...e, cancelledDates: [] }] },
      "2026-11-16",
    ).length,
    1,
  );
});
test("cancelled one-off events remain recoverable", () => {
  const e = activity({ date: "2026-11-16", cancelledDates: ["2026-11-16"] });
  const s = planner({ entries: [e] });
  assert.equal(entriesOnDate(s, "2026-11-16").length, 0);
  assert.equal(cancelledOnDate(s, "2026-11-16").length, 1);
  assert.equal(nextOccurrence(s, e, "2026-11-01"), null);
});
test("overlap checks distinguish dates and exclude cancelled or suspended occurrences", () => {
  const a = activity({ date: "2026-11-16" }),
    b = activity({ id: "other", date: "2026-11-23" });
  assert.equal(overlaps(a, b), false);
  assert.equal(
    overlaps(activity({ cancelledDates: ["2026-11-16"] }), {
      ...a,
      id: "exam",
    }),
    false,
  );
  const s = planner({ entries: [activity(), { ...a, id: "exam" }] });
  assert.equal(conflictsOnDate(s, "2026-11-16").length, 2);
  assert.equal(conflictsOnDate(s, "2026-11-23").length, 0);
  assert.equal(
    candidateConflicts(
      s,
      activity({ id: "new", date: "2026-11-23" }),
      "2026-11-23",
    ),
    true,
  );
});
test("upcoming activities skip cancellations, holidays and finished occurrences", () => {
  const e = activity({ cancelledDates: ["2026-11-23"] });
  const s = planner({
    entries: [e],
    holidays: [
      {
        id: "h",
        name: "Break",
        startDate: "2026-11-30",
        endDate: "2026-12-14",
      },
    ],
  });
  assert.equal(nextOccurrence(s, e, "2026-11-16", 630).date, "2026-12-21");
  assert.equal(
    nextOccurrence({ ...s, termEnd: "2026-12-20" }, e, "2026-11-16", 630),
    null,
  );
});
test("upcoming activities find future semesters and jump long holiday ranges", () => {
  const e = activity();
  const s = planner({ termStart: "2027-02-01", termEnd: "2027-03-01" });
  assert.equal(nextOccurrence(s, e, "2026-11-18").date, "2027-02-01");
  const long = planner({
    holidays: [
      {
        id: "h",
        name: "Long break",
        startDate: "2026-11-01",
        endDate: "2027-01-31",
      },
    ],
  });
  assert.equal(nextOccurrence(long, e, "2026-11-18").date, "2027-02-01");
});
test("monthly calendar cells use exact date arithmetic for either week start", () => {
  const reference = new Date(2026, 10, 18);
  const monday = viewDates(reference, "monthly", 2, "monday");
  assert.equal(monday.length, 42);
  assert.equal(monday[0], "2026-10-26");
  assert.equal(monday.at(-1), "2026-12-06");
  const sunday = viewDates(reference, "monthly", 2, "sunday");
  assert.equal(sunday.length, 35);
  assert.equal(sunday[0], "2026-11-01");
  assert.equal(sunday.at(-1), "2026-12-05");
});
test("moving weekly classes moves their cancelled occurrences within the chosen week", () => {
  const e = activity({ cancelledDates: ["2026-11-16"] });
  assert.deepEqual(shiftCancellationWeekday(e, 1, "monday"), ["2026-11-17"]);
  assert.deepEqual(shiftCancellationWeekday(e, 6, "sunday"), ["2026-11-15"]);
});

test("opening a planner selects its semester or a relevant one-off date", () => {
  assert.equal(initialCalendarDate(planner(), "2026-11-18"), "2026-11-18");
  const s = planner({ termStart: "2027-02-01", termEnd: "2027-06-30" });
  assert.equal(initialCalendarDate(s, "2026-11-18"), "2027-02-01");
  assert.equal(initialCalendarDate(s, "2027-07-01"), "2027-06-30");
  const exam = activity({ day: 2, date: "2027-07-07" });
  assert.equal(
    initialCalendarDate({ ...s, entries: [exam] }, "2026-11-18"),
    "2027-07-07",
  );
  assert.equal(
    initialCalendarDate(
      { ...s, entries: [{ ...exam, cancelledDates: [exam.date] }] },
      "2027-07-08",
    ),
    "2027-07-07",
  );
});
test("old backups and backups with dated calendars both round-trip", () => {
  const old = backup(planner());
  assert.deepEqual(validateBackup(old), old.data);
  const dated = backup(
    planner({
      termStart: "2026-11-01",
      termEnd: "2026-12-31",
      holidays: [
        {
          id: "h",
          name: "Holiday",
          startDate: "2026-11-20",
          endDate: "2026-11-20",
        },
      ],
      entries: [
        activity({ cancelledDates: ["2026-11-16"] }),
        activity({ id: "exam", day: 2, date: "2026-11-18" }),
      ],
    }),
  );
  assert.deepEqual(validateBackup(dated), dated.data);
});
test("malformed dated calendars are rejected by backup validation", () => {
  for (const mutate of [
    (s) => (s.termStart = "2026-02-30"),
    (s) => {
      s.termStart = "2026-12-31";
      s.termEnd = "2026-11-01";
    },
    (s) =>
      (s.holidays = [
        {
          id: "h",
          name: "Break",
          startDate: "2026-11-20",
          endDate: "2026-11-19",
        },
      ]),
    (s) => (s.entries[0].date = "2026-11-18"),
    (s) => (s.entries[0].cancelledDates = ["2026-11-18"]),
    (s) => (s.entries[0].cancelledDates = ["2026-11-16", "2026-11-16"]),
  ]) {
    const s = planner();
    mutate(s);
    assert.throws(() => validateBackup(backup(s)), /invalid/);
  }
});
