import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { WorkspaceSync } from "../src/services/workspaceSync.ts";
import { AccountError } from "../src/services/accountApi.ts";
import {
  keepBothWorkspaces,
  mergeWorkspace,
  sharedWorkspace,
} from "../src/services/syncMerge.ts";
import { validateBackup } from "../src/storage.ts";
import { WorkspaceStore } from "../../backend/src/database.mjs";
import { workspace } from "../../backend/tests/fixture.mjs";

test("three-way merge combines disjoint calendar, task and preference changes", () => {
  const base = workspace(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.schedules[0].entries[0].title = "Edited on phone";
  remote.tasks[0].done = true;
  remote.preferences.name = "Desktop name";
  const result = mergeWorkspace(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.data.schedules[0].entries[0].title, "Edited on phone");
  assert.equal(result.data.tasks[0].done, true);
  assert.equal(result.data.preferences.name, "Desktop name");
  validateBackup({ version: 1, data: result.data });
});
test("one recurring series merges atomically and overlapping edits require a choice", () => {
  const base = workspace();
  base.schedules[0].entries[0].seriesId = "entry";
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.schedules[0].entries[0].title = "Phone";
  remote.schedules[0].entries[0].start = 555;
  assert.equal(mergeWorkspace(base, local, remote).conflicts.length, 1);
  remote.schedules[0].entries.push({
    ...base.schedules[0].entries[0],
    id: "new",
    seriesId: undefined,
    day: 1,
  });
  remote.schedules[0].entries[0] = base.schedules[0].entries[0];
  const result = mergeWorkspace(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.data.schedules[0].entries.length, 2);
});
test("deletions propagate but delete-versus-edit conflicts preserve both choices", () => {
  const base = workspace(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.tasks = [];
  assert.equal(mergeWorkspace(base, local, remote).data.tasks.length, 0);
  remote.tasks[0].title = "Edited remotely";
  assert.equal(mergeWorkspace(base, local, remote).conflicts.length, 1);
  const both = keepBothWorkspaces(remote, base);
  assert.equal(both.tasks.length, 2);
  validateBackup({ version: 1, data: both });
});
test("navigation and device notification choices stay local, while keep-both copies valid planners", () => {
  const base = workspace(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.preferences.reminders = true;
  local.preferences.reminderMinutes = 30;
  remote.schedules[0].title = "Remote planner";
  assert.equal(
    mergeWorkspace(base, local, remote).data.preferences.reminderMinutes,
    30,
  );
  assert.equal(sharedWorkspace(local).preferences.reminders, false);
  local.schedules[0].entries[0].seriesId = "entry";
  const both = keepBothWorkspaces(local, remote);
  assert.equal(both.schedules.length, 2);
  assert.notEqual(both.schedules[0].id, both.schedules[1].id);
  validateBackup({ version: 1, data: both });
});

function harness(t, options = {}) {
  const store = new WorkspaceStore(":memory:"),
    key = "a".repeat(64),
    checkpoints = [],
    safety = [];
  let current = options.local || workspace();
  if (!options.empty)
    store.save(key, 0, sharedWorkspace(options.remote || workspace()));
  const api = {
    async read() {
      return store.get(key) || { revision: 0, data: null };
    },
    async write(data, revision) {
      try {
        return store.save(key, revision, data, "automatic");
      } catch (error) {
        throw new AccountError(error.status, error.message);
      }
    },
  };
  const engine = new WorkspaceSync({
    accountId: "account",
    api,
    checkpoint: options.noBase
      ? null
      : {
          id: "account",
          revision: 1,
          data: sharedWorkspace(workspace()),
          syncedAt: "2026-11-19T00:00:00Z",
        },
    commit: async (checkpoint) => {
      if (options.commitError) throw Error("Device storage is full");
      checkpoints.push(structuredClone(checkpoint));
    },
    saveLocal: async () => {},
    safety: async (data) => {
      safety.push(structuredClone(data));
      await options.beforeSafety?.();
    },
    apply: (expected, data) => {
      if (expected !== current) return false;
      current = data;
      engine.observe(current, true);
      return true;
    },
  });
  engine.start();
  engine.observe(current, true);
  t.after(() => {
    engine.stop();
    store.close();
  });
  return {
    engine,
    store,
    key,
    api,
    checkpoints,
    safety,
    current: () => current,
    edit: (fn) => {
      const next = structuredClone(current);
      fn(next);
      current = next;
      engine.observe(next, true);
    },
  };
}
test("sync pulls account changes and pushes local edits without losing either side", async (t) => {
  const remote = workspace();
  remote.tasks[0].done = true;
  const h = harness(t, { remote });
  h.edit((data) => (data.preferences.name = "Offline phone edit"));
  await h.engine.syncNow();
  assert.equal(h.current().tasks[0].done, true);
  assert.equal(h.store.get(h.key).data.preferences.name, "Offline phone edit");
  assert.equal(h.safety.length, 1);
  assert.equal(h.engine.getSnapshot().status, "synced");
});
test("a fresh account uploads existing device plans; unknown remote versions never overwrite local plans", async (t) => {
  const fresh = harness(t, { empty: true, noBase: true });
  await fresh.engine.syncNow();
  assert.equal(fresh.store.get(fresh.key).revision, 1);
  const different = workspace();
  different.preferences.name = "Remote account";
  const h = harness(t, { noBase: true, remote: different });
  await h.engine.syncNow();
  assert.equal(h.engine.getSnapshot().status, "conflict");
  assert.equal(h.current().preferences.name, "Friend");
  assert.equal(h.store.get(h.key).data.preferences.name, "Remote account");
});
test("offline changes wait and edits made during an upload remain queued", async (t) => {
  const h = harness(t);
  h.engine.setOnline(false);
  h.edit((data) => (data.preferences.name = "Offline"));
  await h.engine.syncNow();
  assert.equal(h.store.get(h.key).data.preferences.name, "Friend");
  h.engine.setOnline(true);
  let release,
    entered = false;
  const gate = new Promise((resolve) => (release = resolve)),
    write = h.api.write;
  h.api.write = async (...args) => {
    entered = true;
    await gate;
    return write(...args);
  };
  const uploading = h.engine.syncNow();
  while (!entered) await setImmediate();
  h.edit((data) => (data.tasks[0].title = "Typed while uploading"));
  release();
  await uploading;
  await h.engine.syncNow();
  assert.equal(h.store.get(h.key).data.preferences.name, "Offline");
  assert.equal(h.store.get(h.key).data.tasks[0].title, "Typed while uploading");
});
test("compare-and-swap retries merge a newer server edit instead of overwriting it", async (t) => {
  const h = harness(t),
    write = h.api.write;
  h.edit((data) => (data.preferences.name = "Phone"));
  let raced = false;
  h.api.write = async (...args) => {
    if (!raced) {
      raced = true;
      const newer = h.store.get(h.key).data;
      newer.tasks[0].done = true;
      h.store.save(h.key, 1, newer);
    }
    return write(...args);
  };
  await h.engine.syncNow();
  await h.engine.syncNow();
  assert.equal(h.store.get(h.key).data.tasks[0].done, true);
  assert.equal(h.store.get(h.key).data.preferences.name, "Phone");
});
test("explicit conflict resolution keeps both activities in one planner and refuses stale confirmations", async (t) => {
  const remote = workspace();
  remote.schedules[0].entries[0].title = "Computer class";
  const h = harness(t, { remote });
  h.edit((data) => (data.schedules[0].entries[0].title = "Phone class"));
  await h.engine.syncNow();
  assert.equal(h.engine.getSnapshot().status, "conflict");
  const newer = h.store.get(h.key).data;
  newer.preferences.name = "Changed again";
  h.store.save(h.key, 1, newer);
  await h.engine.syncNow("both");
  assert.equal(h.engine.getSnapshot().status, "conflict");
  assert.equal(h.current().schedules.length, 1);
  await h.engine.syncNow("both");
  assert.equal(h.store.get(h.key).data.schedules.length, 1);
  assert.equal(h.current().schedules[0].entries.length, 2);
  assert.deepEqual(
    new Set(h.current().schedules[0].entries.map((entry) => entry.title)),
    new Set(["Phone class", "Computer class"]),
  );
});
test("authentication failures leave pending edits intact", async (t) => {
  const h = harness(t);
  h.edit((data) => (data.preferences.name = "Keep me"));
  h.api.read = async () => {
    throw new AccountError(401, "Sign in again");
  };
  await h.engine.syncNow();
  assert.equal(h.engine.getSnapshot().status, "auth");
  assert.equal(h.current().preferences.name, "Keep me");
  assert.equal(h.checkpoints.length, 0);
});

test("a failed local checkpoint prevents uploads and retries without discarding edits", async (t) => {
  const remote = workspace();
  remote.tasks[0].done = true;
  const options = { remote, commitError: true },
    h = harness(t, options);
  h.edit((data) => (data.preferences.name = "Keep my pending edit"));
  await h.engine.syncNow();
  assert.equal(h.engine.getSnapshot().status, "error");
  assert.equal(h.store.get(h.key).revision, 1);
  assert.equal(h.current().preferences.name, "Keep my pending edit");
  options.commitError = false;
  await h.engine.syncNow();
  assert.equal(
    h.store.get(h.key).data.preferences.name,
    "Keep my pending edit",
  );
  assert.equal(h.current().tasks[0].done, true);
});

test("incoming changes wait while an edit form is open", async (t) => {
  const remote = workspace();
  remote.schedules[0].entries[0].title = "Computer update";
  const h = harness(t, { remote });
  h.engine.setPaused(true);
  await h.engine.syncNow();
  assert.equal(h.current().schedules[0].entries[0].title, "Design principles");
  h.engine.setPaused(false);
  await h.engine.syncNow();
  assert.equal(h.current().schedules[0].entries[0].title, "Computer update");
});

test("uploading a local edit preserves its timestamp and does not replace local undo history", async (t) => {
  const h = harness(t);
  const timestamp = Date.now();
  h.edit((data) => {
    data.schedules[0].entries[0].title = "Local class edit";
    data.schedules[0].updatedAt = timestamp;
  });
  await h.engine.syncNow();
  assert.equal(
    h.safety.length,
    0,
    "a local-only upload must not apply a remote workspace",
  );
  assert.equal(h.current().schedules[0].updatedAt, timestamp);
  assert.equal(
    h.store.get(h.key).data.schedules[0].entries[0].title,
    "Local class edit",
  );
});

test("review choices resolve separate conflicts and retain unrelated changes from both devices", async (t) => {
  const remote = workspace();
  remote.schedules[0].entries[0].title = "Account class";
  remote.tasks[0].title = "Account task";
  remote.preferences.avatar = "🐱";
  const h = harness(t, { remote });
  h.edit((data) => {
    data.schedules[0].entries[0].title = "Phone class";
    data.tasks[0].title = "Phone task";
    data.schedules[0].title = "Phone planner title";
  });
  await h.engine.syncNow();
  const review = h.engine.getSnapshot().conflict.review;
  assert.equal(review.items.length, 2);
  const choices = Object.fromEntries(
    review.items.map((item) => [
      item.id,
      item.kind === "activity" ? "local" : "account",
    ]),
  );
  await h.engine.syncNow({ reviewId: review.id, choices });
  assert.equal(h.engine.getSnapshot().status, "synced");
  assert.equal(h.current().schedules[0].entries[0].title, "Phone class");
  assert.equal(h.current().tasks[0].title, "Account task");
  assert.equal(h.current().schedules[0].title, "Phone planner title");
  assert.equal(h.current().preferences.avatar, "🐱");
});
test("local changes during review invalidate old choices before any upload", async (t) => {
  const remote = workspace();
  remote.schedules[0].entries[0].title = "Account class";
  const h = harness(t, { remote });
  h.edit((data) => {
    data.schedules[0].entries[0].title = "Phone class";
  });
  await h.engine.syncNow();
  const review = h.engine.getSnapshot().conflict.review;
  h.edit((data) => {
    data.tasks[0].title = "Typed during review";
  });
  await h.engine.syncNow({
    reviewId: review.id,
    choices: { [review.items[0].id]: "local" },
  });
  assert.equal(h.engine.getSnapshot().status, "conflict");
  assert.notEqual(h.engine.getSnapshot().conflict.review.id, review.id);
  assert.equal(h.store.get(h.key).revision, 1);
  assert.equal(h.current().tasks[0].title, "Typed during review");
});
test("partial choices and stale review IDs cannot apply a partial workspace", async (t) => {
  const remote = workspace();
  remote.schedules[0].entries[0].title = "Account class";
  const h = harness(t, { remote });
  h.edit((data) => {
    data.schedules[0].entries[0].title = "Phone class";
  });
  await h.engine.syncNow();
  const review = h.engine.getSnapshot().conflict.review;
  await h.engine.syncNow({ reviewId: review.id, choices: {} });
  assert.equal(h.engine.getSnapshot().status, "error");
  assert.ok(h.engine.getSnapshot().conflict);
  assert.equal(h.store.get(h.key).revision, 1);
  await h.engine.syncNow({
    reviewId: "old-review",
    choices: { [review.items[0].id]: "account" },
  });
  assert.equal(h.engine.getSnapshot().status, "conflict");
  assert.equal(h.store.get(h.key).revision, 1);
  assert.equal(h.current().schedules[0].entries[0].title, "Phone class");
});
test("review preserves current device notification preferences that do not synchronize", async (t) => {
  const remote = workspace();
  remote.schedules[0].entries[0].title = "Account class";
  const h = harness(t, { remote });
  h.edit((data) => {
    data.schedules[0].entries[0].title = "Phone class";
  });
  await h.engine.syncNow();
  const review = h.engine.getSnapshot().conflict.review;
  h.edit((data) => {
    data.preferences.reminders = true;
    data.preferences.reminderMinutes = 30;
  });
  await h.engine.syncNow({
    reviewId: review.id,
    choices: { [review.items[0].id]: "account" },
  });
  assert.equal(h.engine.getSnapshot().status, "synced");
  assert.equal(h.current().preferences.reminders, true);
  assert.equal(h.current().preferences.reminderMinutes, 30);
});
test("changes made while a review safety copy saves trigger a new review without uploading", async (t) => {
  const remote = workspace();
  remote.schedules[0].entries[0].title = "Account class";
  const options = { remote },
    h = harness(t, options);
  h.edit((data) => {
    data.schedules[0].entries[0].title = "Phone class";
  });
  await h.engine.syncNow();
  const review = h.engine.getSnapshot().conflict.review;
  options.beforeSafety = () =>
    h.edit((data) => {
      data.tasks[0].title = "Still editing";
    });
  await h.engine.syncNow({
    reviewId: review.id,
    choices: { [review.items[0].id]: "account" },
  });
  assert.equal(h.engine.getSnapshot().status, "conflict");
  assert.equal(h.store.get(h.key).revision, 1);
  assert.equal(h.current().tasks[0].title, "Still editing");
});
test("an account write race refreshes review without duplicating a previously kept activity", async (t) => {
  const remote = workspace();
  remote.schedules[0].entries[0].title = "Account class";
  const h = harness(t, { remote });
  h.edit((data) => {
    data.schedules[0].entries[0].title = "Phone class";
  });
  await h.engine.syncNow();
  const review = h.engine.getSnapshot().conflict.review,
    write = h.api.write;
  let race = true;
  h.api.write = async (...args) => {
    if (race) {
      race = false;
      const newer = h.store.get(h.key).data;
      newer.schedules[0].entries[0].title = "Newer account class";
      h.store.save(h.key, 1, newer);
      throw new AccountError(409, "A new account revision exists.");
    }
    return write(...args);
  };
  await h.engine.syncNow({
    reviewId: review.id,
    choices: { [review.items[0].id]: "both" },
  });
  const refreshed = h.engine.getSnapshot().conflict.review;
  assert.notEqual(refreshed.id, review.id);
  assert.equal(h.current().schedules[0].entries.length, 2);
  await h.engine.syncNow({
    reviewId: refreshed.id,
    choices: Object.fromEntries(
      refreshed.items.map((item) => [item.id, "account"]),
    ),
  });
  assert.equal(h.engine.getSnapshot().status, "synced");
  assert.equal(h.current().schedules[0].entries.length, 2);
  assert.deepEqual(
    new Set(h.current().schedules[0].entries.map((entry) => entry.title)),
    new Set(["Phone class", "Newer account class"]),
  );
});
