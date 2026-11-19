import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { AutomaticBackups } from "../src/services/automaticBackups.ts";
import { backupFingerprint } from "../src/services/backupFingerprint.ts";
import { BackupError } from "../src/services/backupTypes.ts";
import { WorkspaceStore } from "../../backend/src/database.mjs";
import { backupHash } from "../../backend/src/backup-content.mjs";
import { workspace } from "../../backend/tests/fixture.mjs";

const key = "a".repeat(64);
function harness(t, options = {}) {
  const store = new WorkspaceStore(":memory:");
  let now = 0,
    next = 0;
  const timers = new Map(),
    writes = [],
    checkpoints = [];
  const transport = {
    async history() {
      return store.history(key);
    },
    async snapshot(revision) {
      return revision ? store.getVersion(key, revision) : store.get(key);
    },
    async save(data, revision, source) {
      writes.push({ data, revision, source });
      return store.save(key, revision, data, source);
    },
  };
  const engine = new AutomaticBackups({
    transport,
    enabled: true,
    now: () => now,
    setTimer: (fn, delay) => {
      const id = ++next;
      timers.set(id, { fn, due: now + delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    onCheckpoint: (value) => checkpoints.push(value),
    ...options,
  });
  engine.start();
  t.after(() => {
    engine.stop();
    store.close();
  });
  async function settle() {
    for (let i = 0; i < 1000; i++) {
      await setImmediate();
      if (!engine.getSnapshot().busy) return;
    }
    throw Error("Backup operation did not finish");
  }
  async function advance(ms) {
    const target = now + ms;
    while (true) {
      const due = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!due || due[1].due > target) break;
      now = due[1].due;
      timers.delete(due[0]);
      due[1].fn();
      await settle();
    }
    now = target;
  }
  return { engine, store, transport, writes, checkpoints, advance, settle };
}

test("browser and server fingerprints agree and ignore navigation and update timestamps", async () => {
  const data = workspace();
  assert.equal(await backupFingerprint(data), backupHash(data));
  const original = await backupFingerprint(data);
  data.activeId = "another-view";
  data.schedules[0].updatedAt++;
  assert.equal(await backupFingerprint(data), original);
  for (const edit of [
    (d) => (d.tasks[0].done = true),
    (d) => (d.schedules[0].entries[0].date = "2026-11-16"),
    (d) => (d.preferences.name = "New name"),
    (d) => (d.schedules[0].design.background = "#abcdef"),
  ]) {
    const changed = structuredClone(data);
    edit(changed);
    assert.notEqual(await backupFingerprint(changed), original);
    assert.equal(await backupFingerprint(changed), backupHash(changed));
  }
});

test("automatic backups debounce locally saved edits, coalesce changes and skip identical content", async (t) => {
  const h = harness(t),
    initial = workspace();
  h.engine.observe(initial, false);
  await h.advance(4000);
  assert.equal(h.writes.length, 0);
  h.engine.observe(initial, true);
  await h.advance(0);
  assert.equal(h.writes.length, 1);
  const changed = structuredClone(initial);
  changed.preferences.name = "First edit";
  h.engine.observe(changed, true);
  await h.advance(30000);
  const newest = structuredClone(changed);
  newest.preferences.name = "Latest edit";
  h.engine.observe(newest, true);
  await h.advance(30000);
  assert.equal(h.writes.length, 2);
  assert.equal(h.store.get(key).data.preferences.name, "Latest edit");
  h.engine.observe({ ...newest, activeId: "just-navigation" }, true);
  await h.advance(65000);
  assert.equal(h.writes.length, 2);
  assert.equal(h.engine.getSnapshot().status, "saved");
});

test("disabled and offline backups wait; reconnecting uploads the newest workspace", async (t) => {
  const h = harness(t),
    data = workspace();
  h.engine.setEnabled(false);
  h.engine.observe(data, true);
  await h.advance(10000);
  assert.equal(h.writes.length, 0);
  h.engine.setOnline(false);
  h.engine.setEnabled(true);
  await h.advance(10000);
  assert.equal(h.engine.getSnapshot().status, "offline");
  data.preferences.name = "Offline edit";
  h.engine.setOnline(true);
  await h.advance(0);
  assert.equal(h.store.get(key).data.preferences.name, "Offline edit");
  assert.equal(h.writes.length, 1);
});

test("failed requests preserve the last successful backup and retry with backoff", async (t) => {
  const h = harness(t),
    data = workspace();
  h.engine.observe(data, true);
  await h.advance(3000);
  const success = h.engine.getSnapshot().lastSuccessful;
  const changed = structuredClone(data);
  changed.preferences.name = "Pending changes";
  const save = h.transport.save;
  h.transport.save = async () => {
    throw Error("Server unavailable");
  };
  h.engine.observe(changed, true);
  await h.advance(60000);
  assert.equal(h.engine.getSnapshot().status, "error");
  assert.deepEqual(h.engine.getSnapshot().lastSuccessful, success);
  assert.equal(h.checkpoints.length, 1);
  h.transport.save = save;
  await h.advance(10000);
  assert.equal(h.store.get(key).revision, 2);
  assert.equal(h.engine.getSnapshot().status, "saved");
  assert.equal(h.checkpoints.length, 2);
});

test("unknown or newer remote workspaces pause automation until an explicit manual save", async (t) => {
  const h = harness(t),
    data = workspace(),
    remote = structuredClone(data);
  remote.preferences.name = "Do not overwrite this backup";
  h.store.save(key, 0, remote);
  h.engine.observe(data, true);
  await h.advance(3000);
  assert.equal(h.engine.getSnapshot().status, "conflict");
  assert.equal(h.writes.length, 0);
  await h.advance(300000);
  assert.equal(h.writes.length, 0);
  await h.engine.backupNow(data);
  assert.equal(h.store.get(key).revision, 2);
  const external = structuredClone(data);
  external.preferences.name = "Other tab";
  h.store.save(key, 2, external);
  const local = structuredClone(data);
  local.preferences.name = "This tab";
  h.engine.observe(local, true);
  await h.advance(61000);
  assert.equal(h.engine.getSnapshot().status, "conflict");
  assert.equal(h.store.get(key).data.preferences.name, "Other tab");
});

test("matching remote content is adopted without an extra version", async (t) => {
  const h = harness(t),
    data = workspace();
  h.store.save(key, 0, data);
  h.engine.observe(data, true);
  await h.advance(3000);
  assert.equal(h.writes.length, 0);
  assert.equal(h.engine.getSnapshot().lastSuccessful.revision, 1);
});

test("edits arriving during an upload produce a later version without overlapping requests", async (t) => {
  const h = harness(t),
    first = workspace();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const save = h.transport.save;
  let calls = 0;
  h.transport.save = async (...args) => {
    calls++;
    if (calls === 1) await gate;
    return save(...args);
  };
  // Use a manual operation so the deferred upload can be controlled without advancing timers.
  h.engine.observe(first, true);
  const uploading = h.engine.backupNow(first);
  while (!calls) await setImmediate();
  const newest = structuredClone(first);
  newest.preferences.name = "Edit during upload";
  h.engine.observe(newest, true);
  assert.equal(calls, 1);
  release();
  await uploading;
  await h.advance(60000);
  assert.equal(calls, 2);
  assert.equal(h.store.get(key).data.preferences.name, "Edit during upload");
});

test("restoring preserves pending edits, creates a new head, and rejects a stale confirmation", async (t) => {
  const h = harness(t),
    original = workspace();
  h.store.save(key, 0, original);
  const selected = h.store.get(key);
  const current = structuredClone(original);
  current.preferences.name = "Unsaved current plans";
  await h.engine.restore(selected, current, 1);
  assert.equal(h.store.getVersion(key, 2).source, "before-restore");
  assert.equal(
    h.store.getVersion(key, 2).data.preferences.name,
    "Unsaved current plans",
  );
  assert.equal(h.store.get(key).source, "restore");
  assert.equal(h.store.get(key).data.preferences.name, "Friend");
  await assert.rejects(
    h.engine.restore(selected, current, 1),
    (e) => e instanceof BackupError && e.status === 409,
  );
  assert.equal(h.store.get(key).revision, 3);
});

test("open restore dialogs pause automation and stopped engines do not write", async (t) => {
  const h = harness(t);
  h.engine.observe(workspace(), true);
  h.engine.setPaused(true);
  await h.advance(10000);
  assert.equal(h.writes.length, 0);
  h.engine.setPaused(false);
  await h.advance(0);
  assert.equal(h.writes.length, 1);
  h.engine.observe(workspace(), true);
  h.engine.stop();
  await h.advance(100000);
  assert.equal(h.writes.length, 1);
});
