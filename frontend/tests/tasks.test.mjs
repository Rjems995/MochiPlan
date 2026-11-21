import test from "node:test";
import assert from "node:assert/strict";
import {
  nextTaskDate,
  toggleTaskCompletion,
  taskNotificationDue,
  taskIsOverdue,
  validTaskExtensions,
} from "../src/taskRules.ts";
import { isCalendarDate } from "../src/calendar.ts";
import { validateBackup } from "../src/storage.ts";
import {
  mergeWorkspace,
  keepBothWorkspaces,
} from "../src/services/syncMerge.ts";
import { validateWorkspace } from "../../backend/src/validation.mjs";
import { validTaskExtensions as validServerTask } from "../../backend/src/task-validation.mjs";
import { workspace } from "../../backend/tests/fixture.mjs";

function task(extra = {}) {
  return {
    ...workspace().tasks[0],
    due: "2026-01-31",
    dueTime: "09:30",
    reminderMinutes: 60,
    seriesId: "reading-series",
    recurrence: { frequency: "monthly", interval: 1, anchorDate: "2026-01-31" },
    subtasks: [
      { id: "read", title: "Read chapter", done: false },
      { id: "notes", title: "Write notes", done: false },
    ],
    ...extra,
  };
}
test("monthly tasks clamp short months and return to their original day, including leap years", () => {
  const first = task();
  assert.equal(nextTaskDate(first, first.due), "2026-02-28");
  assert.equal(
    nextTaskDate({ ...first, due: "2026-02-28" }, "2026-02-28"),
    "2026-03-31",
  );
  const leap = task({
    due: "2028-01-31",
    recurrence: { frequency: "monthly", interval: 1, anchorDate: "2028-01-31" },
  });
  assert.equal(nextTaskDate(leap, leap.due), "2028-02-29");
  assert.equal(
    nextTaskDate({ ...leap, due: "2028-02-29" }, "2028-02-29"),
    "2028-03-31",
  );
});
test("repeat intervals skip missed dates, honor inclusive end dates and stop at the calendar boundary", () => {
  const weekly = task({
    due: "2026-11-16",
    recurrence: {
      frequency: "weekly",
      interval: 2,
      anchorDate: "2026-11-16",
      until: "2026-12-14",
    },
  });
  assert.equal(nextTaskDate(weekly, "2026-12-01"), "2026-12-14");
  assert.equal(nextTaskDate(weekly, "2026-12-14"), null);
  const daily = task({
    due: "2026-11-16",
    recurrence: { frequency: "daily", interval: 3, anchorDate: "2026-11-16" },
  });
  assert.equal(nextTaskDate(daily, "2026-11-24"), "2026-11-25");
  assert.equal(
    nextTaskDate(
      task({
        due: "9999-12-31",
        recurrence: {
          frequency: "monthly",
          interval: 1,
          anchorDate: "9999-12-31",
        },
      }),
      "9999-12-31",
    ),
    null,
  );
});
test("completing a repeat keeps history, finishes current subtasks, resets the next copy, and never duplicates it", () => {
  const original = task(),
    source = [original];
  const completed = toggleTaskCompletion(source, original.id, original.due);
  assert.equal(completed.length, 2);
  assert.equal(completed[0].done, true);
  assert.ok(completed[0].subtasks.every((step) => step.done));
  assert.equal(completed[1].due, "2026-02-28");
  assert.equal(completed[1].done, false);
  assert.ok(completed[1].subtasks.every((step) => !step.done));
  assert.equal(completed[1].reminderMinutes, 60);
  assert.equal(original.done, false);
  assert.equal(original.subtasks[0].done, false);
  const restored = toggleTaskCompletion(completed, original.id, original.due);
  assert.equal(restored.length, 2);
  assert.equal(restored[0].done, false);
  assert.equal(
    toggleTaskCompletion(restored, original.id, original.due).length,
    2,
  );
  assert.deepEqual(
    toggleTaskCompletion(source, original.id, original.due),
    completed,
  );
});
test("task deadlines distinguish all-day dates, explicit times, disabled alerts and five-minute catch-up windows", () => {
  const dated = task({
    due: "2026-11-16",
    dueTime: "10:00",
    reminderMinutes: 60,
  });
  const at = new Date("2026-11-16T09:00:00").getTime();
  assert.equal(taskNotificationDue(dated, at - 1), false);
  assert.equal(taskNotificationDue(dated, at), true);
  assert.equal(taskNotificationDue(dated, at + 300000), false);
  assert.equal(taskNotificationDue({ ...dated, done: true }, at), false);
  assert.equal(
    taskNotificationDue({ ...dated, reminderMinutes: undefined }, at),
    false,
  );
  assert.equal(
    taskNotificationDue(
      { ...dated, dueTime: undefined, reminderMinutes: 0 },
      at,
    ),
    true,
  );
  assert.equal(taskIsOverdue(dated, new Date("2026-11-16T10:01:00")), true);
  assert.equal(
    taskIsOverdue(
      { ...dated, dueTime: undefined },
      new Date("2026-11-16T23:59:00"),
    ),
    false,
  );
});
test("legacy and upgraded tasks round-trip while both validators reject malformed task extensions", () => {
  const data = workspace();
  validateBackup({ version: 1, data });
  validateWorkspace({ version: 1, revision: 0, data });
  data.tasks = [task()];
  assert.deepEqual(validateBackup({ version: 1, data }), data);
  assert.deepEqual(validateWorkspace({ version: 1, revision: 0, data }), data);
  const invalid = [
    { dueTime: "25:00" },
    { due: "" },
    { due: "2026-02-31" },
    { reminderMinutes: -1 },
    {
      recurrence: {
        frequency: "yearly",
        interval: 1,
        anchorDate: "2026-01-31",
      },
    },
    {
      recurrence: {
        frequency: "monthly",
        interval: 0,
        anchorDate: "2026-01-31",
      },
    },
    {
      recurrence: {
        frequency: "monthly",
        interval: 1,
        anchorDate: "2026-02-01",
      },
    },
    {
      recurrence: {
        frequency: "monthly",
        interval: 1,
        anchorDate: "2026-01-31",
        until: "2026-01-30",
      },
    },
    { seriesId: "" },
    { subtasks: [{ id: "x", title: "", done: false }] },
    {
      subtasks: [
        { id: "x", title: "Step", done: false },
        { id: "x", title: "Other", done: false },
      ],
    },
    {
      subtasks: Array.from({ length: 101 }, (_, i) => ({
        id: String(i),
        title: "Step",
        done: false,
      })),
    },
  ];
  for (const patch of invalid) {
    const malformed = task(patch);
    data.tasks = [malformed];
    assert.equal(validTaskExtensions(malformed), false);
    assert.equal(validServerTask(malformed, isCalendarDate), false);
    assert.throws(() => validateBackup({ version: 1, data }));
    assert.throws(() => validateWorkspace({ version: 1, revision: 0, data }));
  }
});
test("different subtask checkboxes merge independently without losing task fields", () => {
  const base = workspace();
  base.tasks = [task({ recurrence: undefined, seriesId: undefined })];
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.tasks[0].subtasks[0].done = true;
  remote.tasks[0].subtasks[1].done = true;
  remote.tasks[0].subject = "From computer";
  const merged = mergeWorkspace(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.ok(merged.data.tasks[0].subtasks.every((step) => step.done));
  assert.equal(merged.data.tasks[0].subject, "From computer");
});
test("simultaneous repeat completion produces one next task and overlapping series edits require a choice", () => {
  const base = workspace();
  base.tasks = [task()];
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.tasks = toggleTaskCompletion(
    local.tasks,
    local.tasks[0].id,
    "2026-01-31",
  );
  remote.tasks = toggleTaskCompletion(
    remote.tasks,
    remote.tasks[0].id,
    "2026-01-31",
  );
  const identical = mergeWorkspace(base, local, remote);
  assert.deepEqual(identical.conflicts, []);
  assert.equal(identical.data.tasks.length, 2);
  remote.tasks[1].title = "Edited elsewhere";
  assert.ok(mergeWorkspace(base, local, remote).conflicts.length);
  const both = keepBothWorkspaces(local, remote);
  assert.equal(both.tasks.length, 4);
  assert.equal(new Set(both.tasks.map((item) => item.seriesId)).size, 2);
  assert.equal(new Set(both.tasks.map((item) => item.id)).size, 4);
  validateBackup({ version: 1, data: both });
});

test("adding recurrence during a concurrent task edit keeps IDs unique in merge and keep-both results", () => {
  const base = workspace(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.tasks[0] = task({
    seriesId: "new-local-series",
    due: base.tasks[0].due,
    recurrence: {
      frequency: "weekly",
      interval: 1,
      anchorDate: base.tasks[0].due,
    },
  });
  remote.tasks[0].title = "Edited on another device";
  const merged = mergeWorkspace(base, local, remote);
  assert.ok(merged.conflicts.length);
  assert.equal(
    new Set(merged.data.tasks.map((item) => item.id)).size,
    merged.data.tasks.length,
  );
  validateBackup({ version: 1, data: merged.data });
  const both = keepBothWorkspaces(local, remote);
  assert.equal(both.tasks.length, 2);
  assert.equal(new Set(both.tasks.map((item) => item.id)).size, 2);
  validateBackup({ version: 1, data: both });
  const another = structuredClone(local);
  another.tasks[0].seriesId = "new-remote-series";
  const changed = mergeWorkspace(base, local, another);
  assert.equal(
    new Set(changed.data.tasks.map((item) => item.id)).size,
    changed.data.tasks.length,
  );
  validateBackup({ version: 1, data: changed.data });
});
