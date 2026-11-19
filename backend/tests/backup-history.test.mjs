import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { WorkspaceStore } from "../src/database.mjs";
import { createApp } from "../src/server.mjs";
import { backupHash } from "../src/backup-content.mjs";
import { workspace } from "./fixture.mjs";

const key = "a".repeat(64);
const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

test("history lists metadata and restores a selected version without exposing another workspace", async (t) => {
  const server = createApp({ databasePath: ":memory:", historyLimit: 3 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}/api/workspace`;
  const empty = await (await fetch(base + "/history", { headers })).json();
  assert.deepEqual(empty, {
    version: 1,
    revision: 0,
    latest: null,
    versions: [],
    retentionLimit: 3,
  });
  const data = workspace();
  for (let revision = 0; revision < 4; revision++) {
    data.preferences.name = `Version ${revision + 1}`;
    const response = await fetch(base, {
      method: "PUT",
      headers,
      body: JSON.stringify({ version: 1, revision, source: "automatic", data }),
    });
    assert.ok(response.ok);
  }
  const response = await fetch(base + "/history", { headers });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const history = await response.json();
  assert.deepEqual(
    history.versions.map((v) => v.revision),
    [4, 3, 2],
  );
  assert.deepEqual(history.latest.summary, {
    planners: 1,
    activities: 1,
    tasks: 1,
  });
  assert.equal(history.latest.contentHash, backupHash(data));
  assert.equal(history.latest.source, "automatic");
  assert.equal("data" in history.latest, false);
  assert.equal((await fetch(base + "/history/1", { headers })).status, 404);
  const selected = await (await fetch(base + "/history/2", { headers })).json();
  assert.equal(selected.data.preferences.name, "Version 2");
  const restored = await fetch(base, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      version: 1,
      revision: 4,
      source: "restore",
      data: selected.data,
    }),
  });
  assert.equal((await restored.json()).revision, 5);
  assert.equal(
    (await (await fetch(base, { headers })).json()).data.preferences.name,
    "Version 2",
  );
  for (const path of ["/history", "/history/2"]) {
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal(
      (
        await fetch(base + path, {
          headers: { ...headers, Origin: "https://foreign.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + path, { method: "DELETE", headers })).status,
      405,
    );
  }
  assert.equal((await fetch(base + "/history/0", { headers })).status, 400);
  assert.equal(
    (await fetch(base + "/history/99999999999999999", { headers })).status,
    400,
  );
  const other = { Authorization: `Bearer ${"b".repeat(64)}` };
  assert.equal(
    (await (await fetch(base + "/history", { headers: other })).json()).versions
      .length,
    0,
  );
  assert.equal(
    (await fetch(base + "/history/4", { headers: other })).status,
    404,
  );
  for (const body of [
    { version: 1, revision: 4, data },
    { version: 1, revision: 5, data, source: "legacy" },
    { version: 1, revision: 5, data: {} },
  ]) {
    assert.ok(
      !(
        await fetch(base, {
          method: "PUT",
          headers,
          body: JSON.stringify(body),
        })
      ).ok,
    );
  }
  assert.equal(
    (await (await fetch(base + "/history", { headers })).json()).revision,
    5,
  );
});

test("automatic backups deduplicate meaningful content while manual copies remain explicit", (t) => {
  const store = new WorkspaceStore(":memory:");
  t.after(() => store.close());
  const data = workspace();
  const first = store.save(key, 0, data, "automatic");
  data.activeId = "navigation-only";
  data.schedules[0].updatedAt++;
  const identical = store.save(key, 1, data, "automatic");
  assert.equal(identical.revision, 1);
  assert.equal(identical.updatedAt, first.updatedAt);
  assert.equal(identical.unchanged, true);
  data.tasks[0].done = true;
  assert.equal(store.save(key, 1, data, "automatic").revision, 2);
  assert.equal(store.save(key, 2, data, "before-restore").revision, 2);
  assert.equal(store.save(key, 2, data, "manual").revision, 3);
  assert.equal(store.history(key).versions.length, 3);
});

test("failed history writes roll back the head and retention pruning together", (t) => {
  const store = new WorkspaceStore(":memory:", { historyLimit: 1 });
  t.after(() => store.close());
  const data = workspace();
  store.save(key, 0, data);
  store.db.exec(
    "CREATE TRIGGER fail_version BEFORE INSERT ON workspace_versions WHEN NEW.revision=2 BEGIN SELECT RAISE(ABORT,'disk failure'); END",
  );
  data.preferences.name = "Uncommitted";
  assert.throws(() => store.save(key, 1, data), /disk failure/);
  assert.equal(store.get(key).data.preferences.name, "Friend");
  assert.deepEqual(
    store.history(key).versions.map((v) => v.revision),
    [1],
  );
  store.db.exec("DROP TRIGGER fail_version");
  assert.equal(store.save(key, 1, data).revision, 2);
  assert.equal(store.getVersion(key, 1), null);
});

test("legacy SQLite backups migrate into history and remain available after restarting", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mochi-history-"));
  let reopened;
  t.after(() => {
    reopened?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const filename = join(directory, "backup.sqlite");
  const db = new DatabaseSync(filename);
  db.exec(
    "CREATE TABLE workspaces (key_hash TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)",
  );
  const data = workspace(),
    updatedAt = "2026-11-18T09:10:00.000Z";
  db.prepare("INSERT INTO workspaces VALUES (?,?,?,?)").run(
    createHash("sha256").update(key).digest("hex"),
    7,
    JSON.stringify(data),
    updatedAt,
  );
  db.close();
  const store = new WorkspaceStore(filename);
  assert.equal(store.get(key).source, "legacy");
  assert.equal(store.get(key).updatedAt, updatedAt);
  data.preferences.name = "After migration";
  store.save(key, 7, data, "automatic");
  store.close();
  reopened = new WorkspaceStore(filename);
  assert.deepEqual(
    reopened.history(key).versions.map((v) => v.revision),
    [8, 7],
  );
  assert.equal(reopened.getVersion(key, 7).data.preferences.name, "Friend");
  assert.equal(reopened.get(key).data.preferences.name, "After migration");
});

test("history summaries count repeating phases and replacements as one logical activity", (t) => {
  const store = new WorkspaceStore(":memory:");
  t.after(() => store.close());
  const data = workspace(),
    entry = data.schedules[0].entries[0];
  entry.seriesId = entry.id;
  data.schedules[0].entries.push(
    { ...entry, id: "phase" },
    { ...entry, id: "exception", sourceId: entry.id, date: "2026-11-18" },
  );
  assert.equal(store.save(key, 0, data).summary.activities, 1);
});
