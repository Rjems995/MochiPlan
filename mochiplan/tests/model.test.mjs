import test from "node:test";
import assert from "node:assert/strict";
import {
  overlaps,
  conflicts,
  moveEntry,
  entryLanes,
  formatTime,
  parseTime,
} from "../src/model.ts";
import { validateBackup } from "../src/storage.ts";
import { defaultDesign } from "../src/model.ts";
const entry = (id, day, start, end) => ({
  id,
  day,
  start,
  end,
  title: id,
  color: "#f6d9e1",
  location: "",
  notes: "",
  instructor: "",
});
test("adjacent activities are allowed, overlaps are flagged only on the same day", () => {
  const a = entry("a", 0, 540, 600),
    b = entry("b", 0, 600, 660),
    c = entry("c", 0, 570, 630),
    d = entry("d", 1, 540, 600);
  assert.equal(overlaps(a, b), false);
  assert.equal(overlaps(a, c), true);
  assert.equal(overlaps(a, d), false);
  assert.equal(overlaps(a, a), false);
  assert.deepEqual(
    conflicts([a, b, c, d]).map((e) => e.id),
    ["a", "b", "c"],
  );
});
test("dragging snaps to 15 minutes, preserves duration, and stays inside the day", () => {
  const original = entry("a", 0, 540, 630);
  assert.deepEqual(moveEntry(original, 3, 19, 0, 1440), {
    ...original,
    day: 3,
    start: 555,
    end: 645,
  });
  assert.equal(moveEntry(original, 0, -900, 0, 1440).start, 0);
  const late = moveEntry(original, 5, 1400, 0, 1440);
  assert.equal(late.start, 1350);
  assert.equal(late.end, 1440);
  assert.equal(original.start, 540);
});
test("overlapping blocks receive distinct lanes including chained overlaps", () => {
  const a = entry("a", 0, 540, 630),
    b = entry("b", 0, 600, 660),
    c = entry("c", 0, 645, 690),
    d = entry("d", 0, 720, 750);
  const lanes = entryLanes([d, c, b, a]);
  assert.equal(lanes.get("a").count, 2);
  assert.equal(lanes.get("b").lane, 1);
  assert.equal(lanes.get("c").lane, 0);
  assert.equal(lanes.get("c").count, 2);
  assert.equal(lanes.get("d").count, 1);
});
test("three simultaneous activities share three lanes", () => {
  const lanes = entryLanes([
    entry("a", 0, 500, 700),
    entry("b", 0, 510, 650),
    entry("c", 0, 520, 600),
  ]);
  assert.deepEqual(
    [...lanes.values()].map((x) => x.count),
    [3, 3, 3],
  );
  assert.equal(new Set([...lanes.values()].map((x) => x.lane)).size, 3);
});
test("12-hour and 24-hour time formats handle noon and midnight", () => {
  assert.equal(formatTime(0), "12 am");
  assert.equal(formatTime(720), "12 pm");
  assert.equal(formatTime(795), "1:15 pm");
  assert.equal(formatTime(75, true), "01:15");
  assert.equal(parseTime("13:15"), 795);
});
function backup() {
  return {
    version: 1,
    data: {
      activeId: "planner",
      schedules: [
        {
          id: "planner",
          name: "My planner",
          title: "My planner",
          type: "Weekly planner",
          updatedAt: Date.now(),
          entries: [entry("a", 0, 540, 600)],
          design: defaultDesign(),
        },
      ],
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
  };
}
test("backup restoration validates a complete workspace and returns a separate copy", () => {
  const source = backup();
  const restored = validateBackup(source);
  assert.deepEqual(restored, source.data);
  restored.schedules[0].name = "Changed";
  assert.equal(source.data.schedules[0].name, "My planner");
});
test("backup rejects invalid activity intervals, days, and duplicate IDs", () => {
  for (const mutate of [
    (b) => (b.data.schedules[0].entries[0].end = 500),
    (b) => (b.data.schedules[0].entries[0].day = 1.5),
    (b) =>
      b.data.schedules[0].entries.push({ ...b.data.schedules[0].entries[0] }),
  ]) {
    const b = backup();
    mutate(b);
    assert.throws(() => validateBackup(b), /invalid/);
  }
});
test("backup rejects a missing active planner, incomplete preferences and malformed stickers", () => {
  for (const mutate of [
    (b) => (b.data.activeId = "missing"),
    (b) => delete b.data.preferences.favoriteThemes,
    (b) =>
      (b.data.schedules[0].design.stickers = [
        { id: "bad", emoji: "🌷", x: 900, y: 0, size: 40, rotation: 0 },
      ]),
  ]) {
    const b = backup();
    mutate(b);
    assert.throws(() => validateBackup(b));
  }
});
test("backup rejects non-image background URLs and malformed custom palettes", () => {
  const b = backup();
  b.data.schedules[0].design.image = "https://example.com/picture.png";
  assert.throws(() => validateBackup(b), /design/);
  b.data.schedules[0].design.image = "";
  b.data.preferences.customThemes = [{ id: "custom", name: "Broken" }];
  assert.throws(() => validateBackup(b), /palette/);
});
