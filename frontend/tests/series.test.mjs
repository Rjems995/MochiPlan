import test from "node:test";
import assert from "node:assert/strict";
import { workspace } from "../../backend/tests/fixture.mjs";
import { validateWorkspace } from "../../backend/src/validation.mjs";
import { validateBackup } from "../src/storage.ts";
import {
  entriesOnDate,
  cancelledOnDate,
  rescheduledOnDate,
  nextOccurrence,
} from "../src/calendar.ts";
import {
  editOccurrence,
  validSeriesMetadata,
  duplicateEntries,
  deleteActivity,
  logicalActivityCount,
} from "../src/series.ts";
let sequence = 0;
const id = () => `generated-${++sequence}`;
const planner = () => workspace().schedules[0];
const at = (s, date) => entriesOnDate(s, date);
function check(s) {
  assert.equal(validSeriesMetadata(s.entries), true);
  const data = workspace();
  data.schedules = [s];
  assert.doesNotThrow(() => validateBackup({ version: 1, data }));
  assert.doesNotThrow(() =>
    validateWorkspace({ version: 1, revision: 0, data }),
  );
  return s;
}
function edit(s, entryId, patch, scope, date, weekStart = "monday") {
  const original = s.entries.find((e) => e.id === entryId);
  return check({
    ...s,
    entries: editOccurrence(
      s,
      entryId,
      { ...original, ...patch },
      { scope, occurrenceDate: date },
      weekStart,
      id,
    ),
  });
}

test("this-date edits replace one occurrence and leave earlier and later weeks unchanged", () => {
  const original = planner(),
    snapshot = structuredClone(original);
  const s = edit(
    original,
    "entry",
    { title: "Guest lecture", start: 660, end: 720, date: "2026-11-16" },
    "date",
    "2026-11-16",
  );
  assert.deepEqual(original, snapshot);
  assert.equal(at(s, "2026-11-09")[0].start, 540);
  assert.equal(at(s, "2026-11-16").length, 1);
  assert.equal(at(s, "2026-11-16")[0].title, "Guest lecture");
  assert.equal(at(s, "2026-11-23")[0].start, 540);
  assert.equal(cancelledOnDate(s, "2026-11-16").length, 0);
  assert.equal(logicalActivityCount(s.entries), 1);
});

test("rescheduling to another date suppresses the original and never repeats the replacement", () => {
  const s = edit(
    planner(),
    "entry",
    { date: "2026-11-18", day: 2 },
    "date",
    "2026-11-16",
  );
  assert.equal(at(s, "2026-11-16").length, 0);
  assert.equal(at(s, "2026-11-18").length, 1);
  assert.equal(at(s, "2026-11-23").length, 1);
  assert.equal(at(s, "2026-11-25").length, 0);
  assert.equal(rescheduledOnDate(s, "2026-11-16").length, 1);
});

test("editing a moved occurrence reuses its exception and original reference", () => {
  let s = edit(
    planner(),
    "entry",
    { date: "2026-11-18", day: 2 },
    "date",
    "2026-11-16",
  );
  const override = s.entries.find((e) => e.sourceId);
  s = edit(
    s,
    override.id,
    { date: "2026-11-20", day: 4, location: "New studio" },
    "date",
    "2026-11-18",
  );
  assert.equal(s.entries.length, 2);
  assert.equal(at(s, "2026-11-18").length, 0);
  assert.equal(at(s, "2026-11-20")[0].originalDate, "2026-11-16");
  assert.equal(at(s, "2026-11-20")[0].id, override.id);
});

test("future edits include the chosen occurrence and preserve past dates", () => {
  const s = edit(
    planner(),
    "entry",
    { start: 780, end: 840 },
    "future",
    "2026-11-23",
  );
  assert.equal(at(s, "2026-11-16")[0].start, 540);
  assert.equal(at(s, "2026-11-23")[0].start, 780);
  assert.equal(at(s, "2026-11-30")[0].start, 780);
  assert.equal(at(s, "2026-11-16").length, 1);
  assert.equal(at(s, "2026-11-23").length, 1);
  assert.equal(nextOccurrence(s, s.entries[0], "2026-11-23"), null);
});

test("multiple future changes stay distinct and whole-series edits update every phase", () => {
  let s = edit(
    planner(),
    "entry",
    { start: 660, end: 720 },
    "future",
    "2026-11-23",
  );
  s = edit(
    s,
    at(s, "2026-12-07")[0].id,
    { title: "Advanced design" },
    "future",
    "2026-12-07",
  );
  s = edit(s, "entry", { location: "Room 42" }, "series", "2026-11-16");
  assert.equal(at(s, "2026-11-16")[0].start, 540);
  assert.equal(at(s, "2026-11-30")[0].start, 660);
  assert.equal(at(s, "2026-11-30")[0].title, "Design principles");
  assert.equal(at(s, "2026-12-07")[0].title, "Advanced design");
  for (const date of ["2026-11-16", "2026-11-30", "2026-12-07"])
    assert.equal(at(s, date)[0].location, "Room 42");
  assert.equal(logicalActivityCount(s.entries), 1);
});

test("changing a time interval across phases never produces an inverted interval", () => {
  let s = edit(
    planner(),
    "entry",
    { start: 840, end: 900 },
    "future",
    "2026-11-23",
  );
  s = edit(s, "entry", { end: 660 }, "series", "2026-11-16");
  assert.equal(at(s, "2026-11-23")[0].start, 540);
  assert.equal(at(s, "2026-11-23")[0].end, 660);
});

test("future splits retain past and future exceptions without orphaning them", () => {
  let s = edit(
    planner(),
    "entry",
    { date: "2026-11-18", day: 2 },
    "date",
    "2026-11-16",
  );
  s = edit(s, "entry", { date: "2026-12-02", day: 2 }, "date", "2026-11-30");
  s = edit(s, "entry", { title: "Design studio" }, "future", "2026-11-23");
  assert.equal(at(s, "2026-11-18")[0].title, "Design principles");
  assert.equal(at(s, "2026-12-02")[0].title, "Design studio");
  assert.equal(at(s, "2026-11-30").length, 0);
  assert.equal(at(s, "2026-11-16").length, 0);
});

test("editing future dates from a moved occurrence uses its original class date", () => {
  let s = edit(
    planner(),
    "entry",
    { date: "2026-12-03", day: 3 },
    "date",
    "2026-11-16",
  );
  const override = s.entries.find((e) => e.sourceId);
  s = edit(
    s,
    override.id,
    {
      ...s.entries.find((e) => e.id === "entry"),
      instructor: "Guest instructor",
    },
    "future",
    "2026-12-03",
  );
  assert.equal(at(s, "2026-11-09")[0].instructor, "");
  assert.equal(at(s, "2026-11-23")[0].instructor, "Guest instructor");
  assert.equal(at(s, "2026-12-03")[0].date, "2026-12-03");
});

test("weekday changes move exclusions with the source while preserving explicit event dates", () => {
  let s = edit(
    planner(),
    "entry",
    { date: "2026-11-18", day: 2 },
    "date",
    "2026-11-16",
  );
  s = edit(s, "entry", { day: 6 }, "series", "2026-11-16", "sunday");
  assert.equal(at(s, "2026-11-15").length, 0);
  assert.equal(at(s, "2026-11-18").length, 1);
  assert.equal(at(s, "2026-11-22").length, 1);
  assert.equal(s.entries.find((e) => e.sourceId).originalDate, "2026-11-15");
});

test("a one-off exception keeps its cancellation and stays explicit during holidays and after term", () => {
  const original = planner();
  original.entries[0].cancelledDates = ["2026-11-16"];
  let s = edit(
    original,
    "entry",
    { date: "2026-11-25", day: 2 },
    "date",
    "2026-11-16",
  );
  assert.equal(at(s, "2026-11-25").length, 0);
  assert.equal(cancelledOnDate(s, "2026-11-25").length, 1);
  assert.equal(cancelledOnDate(s, "2026-11-16").length, 0);
  s = {
    ...s,
    termEnd: "2026-11-20",
    holidays: [
      {
        id: "h",
        name: "Break",
        startDate: "2026-11-25",
        endDate: "2026-11-25",
      },
    ],
    entries: s.entries.map((e) => (e.date ? { ...e, cancelledDates: [] } : e)),
  };
  assert.equal(at(s, "2026-11-25").length, 1);
});

test("planner duplication remaps all series links and deletion leaves no orphaned exceptions", () => {
  let s = edit(
    planner(),
    "entry",
    { date: "2026-11-18", day: 2 },
    "date",
    "2026-11-16",
  );
  s = edit(s, "entry", { title: "New semester" }, "future", "2026-11-23");
  const copy = check({ ...s, entries: duplicateEntries(s.entries, id) });
  for (const e of copy.entries)
    assert.equal(
      s.entries.some((old) => old.id === e.id),
      false,
    );
  const override = copy.entries.find((e) => e.sourceId);
  assert.ok(copy.entries.some((e) => e.id === override.sourceId));
  const withoutOverride = check({
    ...copy,
    entries: deleteActivity(copy.entries, override.id),
  });
  assert.equal(cancelledOnDate(withoutOverride, "2026-11-16").length, 1);
  assert.equal(
    deleteActivity(copy.entries, copy.entries.find((e) => !e.date).id).length,
    0,
  );
});

test("frontend and backend reject malformed bounds, overlapping phases and orphaned replacements", () => {
  const good = edit(
    planner(),
    "entry",
    { date: "2026-11-18", day: 2 },
    "date",
    "2026-11-16",
  );
  for (const mutate of [
    (s) => (s.entries[0].startsOn = "2026-02-30"),
    (s) => {
      s.entries[0].startsOn = "2026-12-01";
      s.entries[0].endsOn = "2026-11-01";
    },
    (s) => (s.entries[1].sourceId = "missing"),
    (s) => (s.entries[1].originalDate = "2026-11-17"),
    (s) => (s.entries[0].cancelledDates = []),
    (s) => s.entries.push({ ...s.entries[0], id: "overlapping-phase" }),
    (s) => s.entries.push({ ...s.entries[1], id: "duplicate-override" }),
  ]) {
    const s = structuredClone(good);
    mutate(s);
    const data = workspace();
    data.schedules = [s];
    assert.throws(() => validateBackup({ version: 1, data }), /invalid/);
    assert.throws(
      () => validateWorkspace({ version: 1, revision: 0, data }),
      /invalid/,
    );
  }
});
