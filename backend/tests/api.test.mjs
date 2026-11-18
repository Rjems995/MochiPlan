import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { createApp } from "../src/server.mjs";
import { WorkspaceStore } from "../src/database.mjs";
import { workspace } from "./fixture.mjs";

const key = "a".repeat(64),
  otherKey = "b".repeat(64);
const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

test("dated calendars persist through the workspace API", async (t) => {
  const base = await start(t);
  const data = workspace();
  const s = data.schedules[0];
  s.termStart = "2026-11-01";
  s.termEnd = "2026-12-31";
  s.holidays = [
    {
      id: "h",
      name: "Holiday",
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    },
  ];
  s.entries[0].cancelledDates = ["2026-11-23"];
  s.entries.push({
    ...s.entries[0],
    id: "exam",
    title: "Final exam",
    day: 2,
    date: "2026-11-18",
    cancelledDates: [],
  });
  const saved = await fetch(base + "/api/workspace", {
    method: "PUT",
    headers,
    body: JSON.stringify({ version: 1, revision: 0, data }),
  });
  assert.equal(saved.status, 201);
  assert.deepEqual(
    (await (await fetch(base + "/api/workspace", { headers })).json()).data,
    data,
  );
});
test("invalid semester, holiday, one-off and cancellation dates cannot replace a backup", async (t) => {
  const base = await start(t);
  const data = workspace();
  await fetch(base + "/api/workspace", {
    method: "PUT",
    headers,
    body: JSON.stringify({ version: 1, revision: 0, data }),
  });
  for (const mutate of [
    (s) => (s.termStart = "2026-11-31"),
    (s) => {
      s.termStart = "2026-12-01";
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
  ]) {
    const invalid = structuredClone(data);
    mutate(invalid.schedules[0]);
    assert.equal(
      (
        await fetch(base + "/api/workspace", {
          method: "PUT",
          headers,
          body: JSON.stringify({ version: 1, revision: 1, data: invalid }),
        })
      ).status,
      400,
    );
  }
  assert.deepEqual(
    (await (await fetch(base + "/api/workspace", { headers })).json()).data,
    data,
  );
});
async function start(t, options = {}) {
  const server = createApp({ databasePath: ":memory:", ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolveClose) => server.close(resolveClose));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
function temporary(t) {
  const path = mkdtempSync(join(tmpdir(), "mochiplan-backend-"));
  t.after(() => {
    const absolute = resolve(path);
    if (
      !absolute.startsWith(resolve(tmpdir()) + sep) ||
      !basename(absolute).startsWith("mochiplan-backend-")
    )
      throw Error("Unexpected temporary directory.");
    rmSync(absolute, { recursive: true, force: true });
  });
  return path;
}

test("workspace API saves, loads and isolates each browser key", async (t) => {
  const base = await start(t);
  const data = workspace();
  assert.equal((await fetch(base + "/api/health")).status, 200);
  assert.equal((await fetch(base + "/api/workspace", { headers })).status, 404);
  const saved = await fetch(base + "/api/workspace", {
    method: "PUT",
    headers,
    body: JSON.stringify({ version: 1, revision: 0, data }),
  });
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).revision, 1);
  const loaded = await fetch(base + "/api/workspace", { headers });
  assert.equal(loaded.headers.get("cache-control"), "no-store");
  assert.deepEqual((await loaded.json()).data, data);
  assert.equal(
    (
      await fetch(base + "/api/workspace", {
        headers: { Authorization: `Bearer ${otherKey}` },
      })
    ).status,
    404,
  );
});
test("optimistic revisions protect a newer backup from stale writes", async (t) => {
  const base = await start(t);
  const data = workspace();
  for (const [revision, status] of [
    [0, 201],
    [1, 200],
    [1, 409],
  ]) {
    const result = await fetch(base + "/api/workspace", {
      method: "PUT",
      headers,
      body: JSON.stringify({ version: 1, revision, data }),
    });
    assert.equal(result.status, status);
  }
  assert.equal(
    (await (await fetch(base + "/api/workspace", { headers })).json()).revision,
    2,
  );
});
test("invalid workspaces cannot replace saved plans", async (t) => {
  const base = await start(t);
  const data = workspace();
  await fetch(base + "/api/workspace", {
    method: "PUT",
    headers,
    body: JSON.stringify({ version: 1, revision: 0, data }),
  });
  for (const mutate of [
    (d) => (d.schedules[0].entries[0].end = 500),
    (d) => (d.activeId = "missing"),
    (d) => (d.tasks[0].due = "2026-02-31"),
    (d) => (d.preferences.customThemes = [{ id: "bad" }]),
  ]) {
    const invalid = structuredClone(data);
    mutate(invalid);
    assert.equal(
      (
        await fetch(base + "/api/workspace", {
          method: "PUT",
          headers,
          body: JSON.stringify({ version: 1, revision: 1, data: invalid }),
        })
      ).status,
      400,
    );
  }
  assert.deepEqual(
    (await (await fetch(base + "/api/workspace", { headers })).json()).data,
    data,
  );
});
test("API rejects missing keys, foreign origins, malformed JSON, oversized bodies and unsupported methods", async (t) => {
  const base = await start(t, { maxBodyBytes: 1024 });
  assert.equal((await fetch(base + "/api/workspace")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/workspace", {
        headers: { ...headers, Origin: "https://unrelated.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/workspace", {
        method: "PUT",
        headers,
        body: "{broken",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/workspace", {
        method: "PUT",
        headers,
        body: "x".repeat(2048),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await fetch(base + "/api/workspace", {
        method: "PUT",
        headers: { Authorization: `Bearer ${key}` },
        body: "{}",
      })
    ).status,
    415,
  );
  assert.equal(
    (await fetch(base + "/api/workspace", { method: "DELETE", headers }))
      .status,
    405,
  );
  assert.equal((await fetch(base + "/api/unknown")).status, 404);
});
test("SQLite retains a backup after reopening the database", (t) => {
  const filename = join(temporary(t), "test.sqlite");
  const data = workspace();
  let store = new WorkspaceStore(filename);
  store.save(key, 0, data);
  store.close();
  store = new WorkspaceStore(filename);
  try {
    assert.deepEqual(store.get(key).data, data);
    assert.equal(store.get(key).revision, 1);
  } finally {
    store.close();
  }
});
test("production serves the built frontend and never substitutes HTML for API or missing asset errors", async (t) => {
  const root = temporary(t);
  mkdirSync(join(root, "assets"));
  writeFileSync(
    join(root, "index.html"),
    "<!doctype html><title>MochiPlan</title>",
  );
  writeFileSync(join(root, "assets", "app.js"), "console.log('mochi');");
  const base = await start(t, { frontendDist: root });
  const index = await fetch(base + "/");
  assert.equal(index.status, 200);
  assert.match(await index.text(), /MochiPlan/);
  assert.equal(index.headers.get("cache-control"), "no-cache");
  const head = await fetch(base + "/", { method: "HEAD" });
  assert.equal(
    head.headers.get("content-length"),
    index.headers.get("content-length"),
  );
  assert.equal(await head.text(), "");
  const asset = await fetch(base + "/assets/app.js");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.equal((await fetch(base + "/assets/missing.js")).status, 404);
  assert.equal((await fetch(base + "/.env")).status, 404);
  assert.equal(
    (await fetch(base + "/api/missing")).headers.get("content-type"),
    "application/json; charset=utf-8",
  );
});
