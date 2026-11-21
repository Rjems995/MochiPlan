import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createApp } from "../src/server.mjs";
import { PlannerShares } from "../src/shares.mjs";
import { WorkspaceStore } from "../src/database.mjs";
import { workspace } from "./fixture.mjs";

const key = "a".repeat(64),
  otherKey = "b".repeat(64),
  password = "a-long-private-link-password";
function input(extra = {}) {
  const data = workspace();
  return {
    schedule: data.schedules[0],
    preferences: data.preferences,
    includeLocations: false,
    includeDetails: false,
    expiresAt: null,
    password: null,
    ...extra,
  };
}
async function start(t, options = {}) {
  const server = createApp({ databasePath: ":memory:", ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const api = async (
    path,
    method = "GET",
    body,
    headers = { Authorization: `Bearer ${key}` },
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method,
        headers: {
          Origin: "http://127.0.0.1:4173",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return {
      response,
      json: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  return { api, db: server.reminderScheduler.store.db };
}
function identity(result, workspaceKey = key) {
  return {
    Cookie: result.cookie,
    "X-Mochi-CSRF": result.json.csrfToken,
    "X-Mochi-Account": result.json.user.id,
    Authorization: `Bearer ${workspaceKey}`,
  };
}

test("links expose only the selected planner and explicitly included fields; owner keys and tokens stay separate", async (t) => {
  const { api, db } = await start(t);
  const body = input();
  body.schedule.secret = "hidden planner property";
  body.schedule.entries[0].secret = "hidden entry property";
  body.schedule.design.secret = "hidden design property";
  body.schedule.design.stickers = [
    {
      id: "sticker",
      emoji: "heart",
      x: 20,
      y: 30,
      size: 40,
      rotation: 0,
      secret: "hidden sticker property",
    },
  ];
  const created = await api("/planner-shares", "POST", body);
  assert.equal(created.response.status, 201);
  const { id, token } = created.json.share;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const headers = { "X-Mochi-Share": token },
    publicResult = await api("/shared-planner", "GET", undefined, headers);
  assert.equal(publicResult.response.status, 200);
  assert.equal(publicResult.response.headers.get("cache-control"), "no-store");
  assert.equal(
    publicResult.response.headers.get("referrer-policy"),
    "no-referrer",
  );
  assert.match(publicResult.response.headers.get("x-robots-tag"), /noindex/);
  assert.equal(publicResult.json.schedule.entries[0].location, "");
  assert.equal(publicResult.json.schedule.entries[0].notes, "");
  assert.deepEqual(publicResult.json.preferences, {
    weekStart: "monday",
    time24: false,
  });
  const serialized = JSON.stringify(publicResult.json);
  for (const privateValue of [
    "hidden",
    "Friend",
    "Bring a sketchbook",
    "Finish moodboard",
    "Studio 204",
    key,
    token,
  ])
    assert.ok(!serialized.includes(privateValue));
  assert.ok(!("tasks" in publicResult.json));
  assert.equal(
    JSON.stringify(db.prepare("SELECT * FROM planner_shares").get()).includes(
      token,
    ),
    false,
  );
  assert.equal(
    (await api("/planner-shares?scheduleId=planner")).json.shares[0].token,
    token,
  );
  assert.equal(
    (
      await api("/planner-shares?scheduleId=planner", "GET", undefined, {
        Authorization: `Bearer ${otherKey}`,
      })
    ).json.shares.length,
    0,
  );
  assert.equal(
    (
      await api(`/planner-shares/${id}`, "DELETE", undefined, {
        Authorization: `Bearer ${otherKey}`,
      })
    ).response.status,
    404,
  );
  assert.equal(
    (await api(`/planner-shares/${id}`, "PUT", input({ revision: 1 }), headers))
      .response.status,
    401,
  );
  assert.equal(
    (await api("/shared-planner", "PUT", input(), headers)).response.status,
    405,
  );
  assert.equal(
    (
      await api("/shared-planner", "GET", undefined, {
        "X-Mochi-Share": "z".repeat(43),
      })
    ).response.status,
    404,
  );
  assert.equal((await api("/workspace", "GET")).response.status, 404);
});

test("expiration, revocation and validation are enforced on the server without changing the local planner", async (t) => {
  let now = Date.parse("2026-11-21T06:00:00Z");
  const { api, db } = await start(t, { shareOptions: { now: () => now } });
  for (const expiresAt of [
    "invalid",
    new Date(now - 1).toISOString(),
    new Date(now + 367 * 86400000).toISOString(),
  ])
    assert.equal(
      (await api("/planner-shares", "POST", input({ expiresAt }))).response
        .status,
      400,
    );
  const original = input();
  original.schedule.entries[0].instructor = "Professor Mori";
  const created = (
    await api("/planner-shares", "POST", {
      ...original,
      expiresAt: new Date(now + 60000).toISOString(),
      includeLocations: true,
      includeDetails: true,
    })
  ).json.share;
  assert.equal(
    (
      await api("/shared-planner", "GET", undefined, {
        "X-Mochi-Share": created.token,
      })
    ).json.schedule.entries[0].instructor,
    "Professor Mori",
  );
  now += 60000;
  assert.equal(
    (
      await api("/shared-planner", "GET", undefined, {
        "X-Mochi-Share": created.token,
      })
    ).response.status,
    410,
  );
  const updated = await api(
    `/planner-shares/${created.id}`,
    "PUT",
    input({ revision: 1 }),
  );
  assert.equal(updated.response.status, 200);
  assert.equal(updated.json.share.token, created.token);
  assert.equal(
    (await api(`/planner-shares/${created.id}`, "PUT", input({ revision: 1 })))
      .response.status,
    409,
  );
  assert.equal(
    (
      await api("/shared-planner", "GET", undefined, {
        "X-Mochi-Share": created.token,
      })
    ).json.schedule.entries[0].notes,
    "",
  );
  assert.equal(
    (await api(`/planner-shares/${created.id}`, "DELETE")).response.status,
    200,
  );
  assert.equal(
    (
      await api("/shared-planner", "GET", undefined, {
        "X-Mochi-Share": created.token,
      })
    ).response.status,
    410,
  );
  assert.equal(
    (await api(`/planner-shares/${created.id}`, "PUT", input({ revision: 3 })))
      .response.status,
    410,
  );
  assert.equal(
    db.prepare("SELECT snapshot FROM planner_shares").get().snapshot,
    null,
  );
  assert.equal(original.schedule.entries[0].location, "Studio 204");
});

test("passwords gate every view, rotate access grants, and reject stale updates", async (t) => {
  const { api, db } = await start(t);
  const created = (await api("/planner-shares", "POST", input({ password })))
    .json.share;
  const headers = { "X-Mochi-Share": created.token };
  assert.deepEqual(
    (await api("/shared-planner", "GET", undefined, headers)).json,
    { version: 1, passwordRequired: true },
  );
  assert.equal(
    JSON.stringify(db.prepare("SELECT * FROM planner_shares").get()).includes(
      password,
    ),
    false,
  );
  assert.equal(
    (
      await api(
        "/shared-planner",
        "POST",
        { password: "wrong password" },
        headers,
      )
    ).response.status,
    403,
  );
  const unlocked = await api("/shared-planner", "POST", { password }, headers);
  assert.equal(unlocked.json.schedule.name, "Spring semester");
  const access = {
    ...headers,
    "X-Mochi-Share-Access": unlocked.json.accessToken,
  };
  assert.equal(
    (await api("/shared-planner", "GET", undefined, access)).json.schedule.name,
    "Spring semester",
  );
  const other = (await api("/planner-shares", "POST", input({ password }))).json
    .share;
  assert.equal(
    (
      await api("/shared-planner", "GET", undefined, {
        ...access,
        "X-Mochi-Share": other.token,
      })
    ).json.passwordRequired,
    true,
  );
  assert.equal(
    (
      await api(
        `/planner-shares/${created.id}`,
        "PUT",
        input({ password: "a-new-secret-link-password", revision: 1 }),
      )
    ).response.status,
    200,
  );
  assert.equal(
    (await api("/shared-planner", "GET", undefined, access)).json
      .passwordRequired,
    true,
  );
  assert.equal(
    (await api("/shared-planner", "POST", { password }, headers)).response
      .status,
    403,
  );
  assert.equal(
    (await api(`/planner-shares/${created.id}`, "PUT", input({ revision: 2 })))
      .response.status,
    200,
  );
  assert.ok(
    (await api("/shared-planner", "GET", undefined, headers)).json.schedule,
  );
});

test("account links follow the account across devices, reject revoked sessions, and are removed atomically on deletion", async (t) => {
  const { api, db } = await start(t);
  const registered = await api("/account/register", "POST", {
    username: "share_owner",
    password,
  });
  const computer = identity(registered);
  const phoneResult = await api("/account/login", "POST", {
    username: "share_owner",
    password,
  });
  const phone = identity(phoneResult, otherKey);
  const unrelated = identity(
    await api("/account/register", "POST", {
      username: "share_other",
      password,
    }),
    "c".repeat(64),
  );
  const link = (await api("/planner-shares", "POST", input(), computer)).json
    .share;
  assert.equal(
    (await api("/planner-shares?scheduleId=planner", "GET", undefined, phone))
      .json.shares[0].token,
    link.token,
  );
  assert.equal(
    (await api(`/planner-shares/${link.id}`, "DELETE", undefined, unrelated))
      .response.status,
    404,
  );
  assert.equal(
    (
      await api("/planner-shares?scheduleId=planner", "GET", undefined, {
        ...computer,
        Cookie: "",
      })
    ).response.status,
    401,
  );
  await api(
    `/account/sessions/${phoneResult.json.sessionId}`,
    "DELETE",
    undefined,
    computer,
  );
  assert.equal(
    (await api("/planner-shares?scheduleId=planner", "GET", undefined, phone))
      .response.status,
    401,
  );
  const body = { currentPassword: password, confirmation: "share_owner" };
  db.exec(
    "CREATE TRIGGER block_delete BEFORE DELETE ON accounts BEGIN SELECT RAISE(ABORT,'test rollback'); END",
  );
  assert.equal(
    (await api("/account", "DELETE", body, computer)).response.status,
    500,
  );
  assert.equal(
    (
      await api("/shared-planner", "GET", undefined, {
        "X-Mochi-Share": link.token,
      })
    ).response.status,
    200,
  );
  db.exec("DROP TRIGGER block_delete");
  assert.equal(
    (await api("/account", "DELETE", body, computer)).response.status,
    200,
  );
  assert.equal(
    (
      await api("/shared-planner", "GET", undefined, {
        "X-Mochi-Share": link.token,
      })
    ).response.status,
    404,
  );
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM planner_shares").get().n,
    0,
  );
});

test("revocation while password verification runs cannot unlock or resurrect a shared planner", async (t) => {
  const store = new WorkspaceStore(":memory:");
  t.after(() => store.close());
  const shares = new PlannerShares(store.db),
    owner = { key };
  const link = (await shares.save(owner, input({ password }), () => {})).share;
  const unlocking = shares.unlock(link.token, password, "ip"),
    updating = shares.save(
      owner,
      input({ password: "another-private-share-password", revision: 1 }),
      () => {},
      link.id,
    );
  shares.revoke(owner, link.id);
  await Promise.all([
    assert.rejects(unlocking, (error) => error.status === 410),
    assert.rejects(updating, (error) => error.status === 409),
  ]);
  const unauthorized = shares.save(owner, input({ password }), () => {
    throw Object.assign(Error("revoked session"), { status: 401 });
  });
  await assert.rejects(unauthorized, (error) => error.status === 401);
  assert.equal(shares.list(owner, "planner").shares.length, 1);
});

test("stored links survive a server restart and password limits survive too", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mochiplan-shares-")),
    path = join(directory, "test.sqlite");
  t.after(() => {
    store.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  let store = new WorkspaceStore(path),
    shares = new PlannerShares(store.db);
  const owner = { key };
  const link = (await shares.save(owner, input({ password }), () => {})).share;
  for (let i = 0; i < 10; i++)
    await assert.rejects(
      shares.unlock(link.token, "incorrect", "ip"),
      (error) => error.status === 403,
    );
  store.close();
  store = new WorkspaceStore(path);
  shares = new PlannerShares(store.db);
  assert.equal(shares.list(owner, "planner").shares[0].token, link.token);
  await assert.rejects(
    shares.unlock(link.token, password, "ip"),
    (error) => error.status === 429,
  );
  assert.ok((await shares.unlock(link.token, password, "another-ip")).schedule);
});
