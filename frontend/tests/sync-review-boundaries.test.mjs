import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceReview,
  resolveWorkspaceReview,
} from "../src/services/syncReview.ts";
import { toggleTaskCompletion } from "../src/taskRules.ts";
import { validateBackup } from "../src/storage.ts";
import { validateWorkspace } from "../../backend/src/validation.mjs";
import { workspace } from "../../backend/tests/fixture.mjs";

const decisions = (review, choice) =>
  Object.fromEntries(review.items.map((item) => [item.id, choice]));
function valid(data) {
  validateBackup({ version: 1, data });
  validateWorkspace({ version: 1, revision: 0, data });
  return data;
}

test("keeping both recurring task conflicts creates independent histories and preserves other tasks", () => {
  const base = workspace();
  Object.assign(base.tasks[0], {
    seriesId: "task-family",
    recurrence: {
      frequency: "weekly",
      interval: 1,
      anchorDate: base.tasks[0].due,
    },
    subtasks: [{ id: "read", title: "Read notes", done: false }],
  });
  base.tasks.push({
    ...base.tasks[0],
    id: "independent-task",
    title: "Independent task",
    seriesId: undefined,
    recurrence: undefined,
  });
  const local = structuredClone(base),
    account = structuredClone(base);
  local.tasks[0].title = "Phone recurring task";
  local.tasks = toggleTaskCompletion(
    local.tasks,
    local.tasks[0].id,
    local.tasks[0].due,
  );
  account.tasks[0].title = "Account recurring task";
  local.tasks.find((task) => task.id === "independent-task").subject =
    "Phone subject";
  account.tasks.find((task) => task.id === "independent-task").done = true;
  const review = createWorkspaceReview(base, local, account),
    result = valid(resolveWorkspaceReview(review, decisions(review, "both")));
  assert.equal(result.tasks.length, 4);
  assert.equal(new Set(result.tasks.map((task) => task.id)).size, 4);
  assert.equal(
    new Set(
      result.tasks.filter((task) => task.seriesId).map((task) => task.seriesId),
    ).size,
    2,
  );
  const independent = result.tasks.find(
    (task) => task.id === "independent-task",
  );
  assert.equal(independent.done, true);
  assert.equal(independent.subject, "Phone subject");
  const next = result.tasks.find(
    (task) =>
      task.seriesId &&
      task.seriesId !== "task-family" &&
      task.due === "2026-11-27",
  );
  assert.equal(next.done, false);
  assert.equal(next.subtasks[0].done, false);
});
test("independent planner deletions can retain either or both surviving planner copies", () => {
  const base = workspace();
  base.schedules.push({
    ...structuredClone(base.schedules[0]),
    id: "other-planner",
    name: "Other planner",
  });
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules = [local.schedules[0]];
  account.schedules = [account.schedules[1]];
  account.activeId = "other-planner";
  const review = createWorkspaceReview(base, local, account);
  assert.equal(review.items.length, 1);
  assert.equal(review.items[0].kind, "planners");
  assert.equal(
    valid(resolveWorkspaceReview(review, decisions(review, "both"))).schedules
      .length,
    2,
  );
  assert.equal(
    valid(resolveWorkspaceReview(review, decisions(review, "local"))).schedules
      .length,
    1,
  );
});
test("keeping both cannot exceed planner limits or mutate the compared versions", () => {
  const base = workspace(),
    original = base.schedules[0].entries[0];
  base.schedules[0].entries = Array.from({ length: 10000 }, (_, index) => ({
    ...original,
    id: `activity-${index}`,
  }));
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].entries[0].title = "Phone";
  account.schedules[0].entries[0].title = "Account";
  const review = createWorkspaceReview(base, local, account);
  assert.throws(
    () => resolveWorkspaceReview(review, decisions(review, "both")),
    /limits/,
  );
  assert.equal(review.merged.schedules[0].entries.length, 10000);
  assert.equal(local.schedules[0].entries.length, 10000);
  assert.equal(account.schedules[0].entries.length, 10000);
});

test("retaining an edited planner preserves its independently added pin", () => {
  const base = workspace();
  base.preferences.favorites = [];
  base.schedules.push({
    ...structuredClone(base.schedules[0]),
    id: "other-planner",
    name: "Other planner",
  });
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].title = "Edited on this device";
  local.preferences.favorites = [base.schedules[0].id];
  account.schedules = [account.schedules[1]];
  account.activeId = "other-planner";
  const review = createWorkspaceReview(base, local, account);
  assert.equal(review.items.length, 1);
  const retained = valid(
    resolveWorkspaceReview(review, decisions(review, "local")),
  );
  assert.deepEqual(retained.preferences.favorites, [base.schedules[0].id]);
  const removed = valid(
    resolveWorkspaceReview(review, decisions(review, "account")),
  );
  assert.deepEqual(removed.preferences.favorites, []);
});
