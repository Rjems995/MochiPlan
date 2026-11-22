import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceReview,
  resolveWorkspaceReview,
  otherChangedItems,
} from "../src/services/syncReview.ts";
import {
  comparisonRows,
  itemDescription,
} from "../src/services/syncReviewDisplay.ts";
import { validateBackup } from "../src/storage.ts";
import { validateWorkspace } from "../../backend/src/validation.mjs";
import { editOccurrence } from "../src/series.ts";
import { workspace } from "../../backend/tests/fixture.mjs";

function source() {
  const data = workspace();
  const original = data.schedules[0].entries[0];
  data.schedules[0].entries = [
    original,
    { ...original, id: "writing", title: "Writing workshop", day: 1 },
    { ...original, id: "studio", title: "Studio practice", day: 2 },
  ];
  return data;
}
const decisions = (review, choice = "account") =>
  Object.fromEntries(review.items.map((item) => [item.id, choice]));
function valid(data) {
  validateBackup({ version: 1, data });
  validateWorkspace({ version: 1, revision: 0, data });
  return data;
}

test("individual activity choices preserve independent activity, planner, task and setting changes", () => {
  const base = source(),
    local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].entries[0].title = "Phone design";
  account.schedules[0].entries[0].title = "Account design";
  local.schedules[0].entries[1].title = "Phone writing";
  account.schedules[0].entries[1].title = "Account writing";
  local.schedules[0].entries[2].notes = "Bring paints";
  account.tasks[0].done = true;
  local.schedules[0].title = "My updated planner";
  account.preferences.name = "Computer profile";
  const review = createWorkspaceReview(base, local, account),
    choices = decisions(review);
  assert.equal(review.items.length, 2);
  choices[review.items.find((item) => item.memberIds.includes("entry")).id] =
    "local";
  const result = valid(resolveWorkspaceReview(review, choices));
  assert.deepEqual(
    result.schedules[0].entries.map((entry) => entry.title),
    ["Studio practice", "Phone design", "Account writing"],
  );
  assert.equal(
    result.schedules[0].entries.find((entry) => entry.id === "studio").notes,
    "Bring paints",
  );
  assert.equal(result.tasks[0].done, true);
  assert.equal(result.schedules[0].title, "My updated planner");
  assert.equal(result.preferences.name, "Computer profile");
  assert.ok(
    otherChangedItems(review).some((item) => item.path.at(-1) === "studio"),
  );
  assert.equal(local.schedules[0].entries[0].title, "Phone design");
});
test("keep-both duplicates only a selected activity, with stable valid copy IDs and no extra planners", () => {
  const base = source(),
    local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].entries[0].start = 600;
  local.schedules[0].entries[0].end = 690;
  account.schedules[0].entries[0].title = "Account class";
  account.schedules[0].entries[1].location = "Updated room";
  const review = createWorkspaceReview(base, local, account),
    choices = decisions(review, "both");
  const first = valid(resolveWorkspaceReview(review, choices)),
    second = resolveWorkspaceReview(review, choices);
  assert.equal(first.schedules.length, 1);
  assert.equal(first.schedules[0].entries.length, 4);
  assert.equal(first.tasks.length, base.tasks.length);
  assert.deepEqual(
    first.schedules[0].entries.map((entry) => entry.id),
    second.schedules[0].entries.map((entry) => entry.id),
  );
  assert.equal(
    first.schedules[0].entries.find((entry) => entry.id === "writing").location,
    "Updated room",
  );
});
test("linked recurring phases and reschedules remain valid when one conflict keeps both", () => {
  const base = source();
  let counter = 0;
  const original = base.schedules[0].entries[0];
  base.schedules[0].entries = editOccurrence(
    base.schedules[0],
    original.id,
    { ...original, title: "Moved lecture", date: "2026-11-17", day: 1 },
    { scope: "date", occurrenceDate: "2026-11-16" },
    "monday",
    () => `exception-${++counter}`,
  );
  valid(base);
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].entries[0].title = "Phone recurring class";
  account.schedules[0].entries[0].location = "Account room";
  const review = createWorkspaceReview(base, local, account),
    activity = review.items.find((item) => item.kind === "activity");
  assert.equal(activity.memberIds.length, 2);
  const result = valid(
    resolveWorkspaceReview(review, decisions(review, "both")),
  );
  const copies = result.schedules[0].entries.filter((entry) =>
    entry.id.startsWith(review.id),
  );
  const exception = copies.find((entry) => entry.sourceId);
  assert.ok(copies.some((entry) => entry.id === exception.sourceId));
  assert.equal(exception.originalDate, "2026-11-16");
  assert.equal(exception.date, "2026-11-17");
  assert.equal(
    result.schedules[0].entries.filter((entry) => entry.id === "writing")
      .length,
    1,
  );
});
test("delete-versus-edit choices remove or retain only that activity", () => {
  const base = source(),
    local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].entries = local.schedules[0].entries.filter(
    (entry) => entry.id !== "entry",
  );
  account.schedules[0].entries[0].title = "Edited after deletion";
  local.tasks[0].done = true;
  const review = createWorkspaceReview(base, local, account);
  const removed = valid(
    resolveWorkspaceReview(review, decisions(review, "local")),
  );
  assert.equal(removed.schedules[0].entries.length, 2);
  assert.equal(removed.tasks[0].done, true);
  const kept = valid(resolveWorkspaceReview(review, decisions(review, "both")));
  assert.equal(kept.schedules[0].entries.length, 3);
  assert.ok(
    kept.schedules[0].entries.some(
      (entry) => entry.title === "Edited after deletion",
    ),
  );
});
test("paths use real ID segments even with dots, brackets and object-like identifiers", () => {
  const base = source();
  base.schedules[0].id = "planner.with[punctuation]";
  base.activeId = base.schedules[0].id;
  base.schedules[0].entries[0].id = "constructor";
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].entries[0].title = "Phone";
  account.schedules[0].entries[0].title = "Account";
  const review = createWorkspaceReview(base, local, account);
  assert.deepEqual(review.items[0].path, [
    "schedules",
    base.activeId,
    "entries",
    "constructor",
  ]);
  const result = valid(
    resolveWorkspaceReview(review, decisions(review, "local")),
  );
  assert.equal(
    result.schedules[0].entries.find((entry) => entry.id === "constructor")
      .title,
    "Phone",
  );
});
test("missing choices, foreign choices and impossible scalar keep-both choices are rejected", () => {
  const base = source(),
    local = structuredClone(base),
    account = structuredClone(base);
  local.preferences.name = "Phone";
  account.preferences.name = "Computer";
  const review = createWorkspaceReview(base, local, account);
  assert.throws(() => resolveWorkspaceReview(review, {}), /every conflict/);
  assert.throws(
    () =>
      resolveWorkspaceReview(review, {
        ...decisions(review),
        foreign: "local",
      }),
    /older comparison/,
  );
  assert.throws(
    () => resolveWorkspaceReview(review, decisions(review, "both")),
    /cannot hold two/,
  );
});
test("invalid calendar combinations are fenced to the affected planner and other changes survive", () => {
  const base = source();
  base.schedules[0].termStart = "2026-01-01";
  base.schedules[0].termEnd = "2026-12-31";
  const local = structuredClone(base),
    account = structuredClone(base);
  local.schedules[0].termStart = "2026-11-01";
  account.schedules[0].termEnd = "2026-06-01";
  account.tasks[0].done = true;
  const review = createWorkspaceReview(base, local, account);
  assert.equal(review.items.length, 1);
  assert.equal(review.items[0].kind, "planner");
  assert.match(review.items[0].reason, /calendar rules/);
  const result = valid(
    resolveWorkspaceReview(review, decisions(review, "local")),
  );
  assert.equal(result.schedules[0].termStart, "2026-11-01");
  assert.equal(result.schedules[0].termEnd, "2026-12-31");
  assert.equal(result.tasks[0].done, true);
});
test("review without common history retains separate additions and never assumes missing items were deleted", () => {
  const local = source(),
    account = source();
  account.schedules[0].id = "other-planner";
  account.activeId = "other-planner";
  account.tasks[0].id = "other-task";
  const review = createWorkspaceReview(null, local, account);
  assert.equal(review.base, null);
  assert.equal(review.items.length, 0);
  const result = valid(resolveWorkspaceReview(review, {}));
  assert.equal(result.schedules.length, 2);
  assert.equal(result.tasks.length, 2);
});
test("comparisons describe exact title, time, cancellation and deletion changes in readable form", () => {
  const original = source().schedules[0].entries[0],
    local = {
      ...original,
      title: "Phone title",
      cancelledDates: ["2026-11-16"],
    },
    account = { ...original, start: 600, end: 690 };
  const rows = comparisonRows(
    original,
    local,
    account,
    true,
    ["title", "time", "cancelledDates"],
    false,
  );
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.key === "title").local, "Phone title");
  assert.match(rows.find((row) => row.key === "time").account, /10 am/);
  assert.match(
    rows.find((row) => row.key === "cancelledDates").local,
    /Nov 16, 2026/,
  );
  const review = createWorkspaceReview(
    source(),
    {
      ...source(),
      schedules: [{ ...source().schedules[0], entries: [local] }],
    },
    {
      ...source(),
      schedules: [{ ...source().schedules[0], entries: [account] }],
    },
  );
  assert.equal(
    itemDescription(
      review.items.find((item) => item.kind === "activity"),
      review,
    ).label,
    "Design principles",
  );
});
