import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/server.mjs";
import { workspace } from "./fixture.mjs";

test("decorative text persists through server backups and read-only links, and invalid edits cannot replace it", async (t) => {
  const server = createApp({ databasePath: ":memory:" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const data = workspace();
  data.schedules[0].design.textBoxes = [
    {
      id: "note",
      text: "a lovely week ♡",
      font: "Caveat",
      fontSize: 32,
      color: "#98516b",
      bold: false,
      italic: false,
      alignment: "center",
      x: 35,
      y: 7,
      width: 30,
      rotation: 0,
    },
  ];
  const api = (path, method = "GET", body, customHeaders = {}) =>
    fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${"a".repeat(64)}`,
        Origin: "http://127.0.0.1:4173",
        "Content-Type": "application/json",
        ...customHeaders,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal(
    (await api("/workspace", "PUT", { version: 1, revision: 0, data })).status,
    201,
  );
  const saved = await (await api("/workspace")).json();
  assert.deepEqual(
    saved.data.schedules[0].design.textBoxes,
    data.schedules[0].design.textBoxes,
  );
  const invalid = structuredClone(data);
  invalid.schedules[0].design.textBoxes[0].fontSize = 1000;
  assert.equal(
    (
      await api("/workspace", "PUT", {
        version: 1,
        revision: saved.revision,
        data: invalid,
      })
    ).status,
    400,
  );
  assert.equal(
    (await (await api("/workspace")).json()).revision,
    saved.revision,
  );
  const shared = await (
    await api("/planner-shares", "POST", {
      schedule: data.schedules[0],
      preferences: data.preferences,
      includeLocations: false,
      includeDetails: false,
      expiresAt: null,
      password: null,
    })
  ).json();
  assert.ok(shared.share?.token);
  const visible = await (
    await api("/shared-planner", "GET", undefined, {
      "X-Mochi-Share": shared.share.token,
    })
  ).json();
  assert.deepEqual(
    visible.schedule.design.textBoxes,
    data.schedules[0].design.textBoxes,
  );
});
