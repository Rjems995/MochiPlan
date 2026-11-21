import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash, createECDH, randomBytes, randomUUID } from "node:crypto";
import { generateVAPIDKeys } from "web-push";
import { createApp } from "../src/server.mjs";
import { loadPushConfig } from "../src/push-config.mjs";
import { Accounts } from "../src/accounts.mjs";
import { WorkspaceStore } from "../src/database.mjs";
import { workspace } from "./fixture.mjs";
import { reminderPlan } from "../../frontend/src/services/reminderPlan.ts";

const password = "original-long-account-password",
  nextPassword = "a-new-long-account-password";
const chrome =
  "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
const safari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1";
const hash = (value) => createHash("sha256").update(value).digest("hex");
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
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (path, method = "GET", body, identity, extra = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: "http://127.0.0.1:4173",
        "User-Agent": chrome,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(identity
          ? {
              Cookie: identity.cookie,
              "X-Mochi-CSRF": identity.csrfToken,
              "X-Mochi-Account": identity.user.id,
            }
          : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    return {
      response,
      json,
      identity: {
        ...json,
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      },
    };
  };
  return {
    api,
    db: server.reminderScheduler.store.db,
    reminders: server.reminderScheduler.store,
  };
}

test("session listings identify the current browser without exposing session credentials", async (t) => {
  let now = Date.now();
  const { api } = await start(t, { accountOptions: { now: () => now } });
  const computer = (
    await api("/account/register", "POST", {
      username: "device_owner",
      password,
    })
  ).identity;
  now += 1000;
  const phone = (
    await api(
      "/account/login",
      "POST",
      { username: "device_owner", password },
      undefined,
      { "User-Agent": safari },
    )
  ).identity;
  const list = await api("/account/sessions", "GET", undefined, computer);
  assert.equal(list.response.status, 200);
  assert.equal(list.response.headers.get("cache-control"), "no-store");
  assert.equal(list.json.sessions.length, 2);
  assert.equal(
    list.json.sessions.find((s) => s.current).id,
    computer.sessionId,
  );
  assert.equal(
    list.json.sessions.find((s) => s.id === phone.sessionId).device,
    "Safari on iPhone",
  );
  assert.equal(
    list.json.sessions.find((s) => s.current).device,
    "Chrome on Windows",
  );
  for (const row of list.json.sessions) {
    assert.deepEqual(Object.keys(row).sort(), [
      "createdAt",
      "current",
      "device",
      "expiresAt",
      "id",
      "lastActiveAt",
    ]);
    assert.equal("csrf" in row, false);
    assert.equal("token_hash" in row, false);
  }
  now += 61000;
  const refreshed = (await api("/account/sessions", "GET", undefined, phone))
    .json;
  assert.equal(
    refreshed.sessions.find((s) => s.current).lastActiveAt,
    new Date(now).toISOString(),
  );
  const stranger = (
    await api("/account/register", "POST", {
      username: "another_owner",
      password,
    })
  ).identity;
  assert.equal(
    (
      await api(
        `/account/sessions/${phone.sessionId}`,
        "DELETE",
        undefined,
        stranger,
      )
    ).response.status,
    404,
  );
  assert.equal(
    (
      await api("/account/sessions", "GET", undefined, stranger, {
        "X-Mochi-Account": computer.user.id,
      })
    ).response.status,
    401,
  );
  assert.equal(
    (
      await api(
        `/account/sessions/${phone.sessionId}`,
        "DELETE",
        undefined,
        computer,
        { "X-Mochi-CSRF": "wrong" },
      )
    ).response.status,
    403,
  );
  assert.equal(
    (
      await api(
        `/account/sessions/${phone.sessionId}`,
        "DELETE",
        undefined,
        computer,
      )
    ).json.signedOut,
    false,
  );
  assert.equal(
    (await api("/account/session", "GET", undefined, phone)).response.status,
    401,
  );
  assert.equal(
    (await api("/account/session", "GET", undefined, computer)).response.status,
    200,
  );
});

test("signing out other sessions preserves this session; signing out this session clears its cookie", async (t) => {
  const { api } = await start(t);
  const current = (
    await api("/account/register", "POST", {
      username: "revoke_owner",
      password,
    })
  ).identity;
  const others = [];
  for (let i = 0; i < 2; i++)
    others.push(
      (
        await api("/account/login", "POST", {
          username: "revoke_owner",
          password,
        })
      ).identity,
    );
  const result = await api("/account/sessions", "DELETE", undefined, current);
  assert.equal(result.json.revoked, 2);
  assert.equal(result.json.signedOut, false);
  for (const other of others)
    assert.equal(
      (await api("/account/session", "GET", undefined, other)).response.status,
      401,
    );
  assert.equal(
    (await api("/account/sessions", "GET", undefined, current)).json.sessions
      .length,
    1,
  );
  const signedOut = await api(
    `/account/sessions/${current.sessionId}`,
    "DELETE",
    undefined,
    current,
  );
  assert.equal(signedOut.json.signedOut, true);
  assert.match(signedOut.response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (await api("/account/session", "GET", undefined, current)).response.status,
    401,
  );
});

test("password changes require the current password, rotate credentials and recovery, and preserve plans", async (t) => {
  const { api } = await start(t);
  const registered = await api("/account/register", "POST", {
    username: "password_owner",
    password,
  });
  const original = registered.identity;
  const phone = (
    await api("/account/login", "POST", {
      username: "password_owner",
      password,
    })
  ).identity;
  await api(
    "/sync/workspace",
    "PUT",
    { version: 1, revision: 0, data: workspace() },
    original,
  );
  assert.equal(
    (
      await api(
        "/account/password",
        "PUT",
        {
          currentPassword: "a-wrong-current-password",
          newPassword: nextPassword,
        },
        original,
      )
    ).response.status,
    400,
  );
  assert.equal(
    (await api("/account/session", "GET", undefined, phone)).response.status,
    200,
  );
  assert.equal(
    (
      await api(
        "/account/password",
        "PUT",
        { currentPassword: password, newPassword: "short" },
        original,
      )
    ).response.status,
    400,
  );
  const changed = await api(
    "/account/password",
    "PUT",
    { currentPassword: password, newPassword: nextPassword },
    original,
  );
  assert.equal(changed.response.status, 200);
  assert.notEqual(changed.identity.cookie, original.cookie);
  assert.notEqual(changed.json.csrfToken, original.csrfToken);
  assert.notEqual(changed.json.recoveryCode, registered.json.recoveryCode);
  assert.notEqual(changed.json.sessionId, original.sessionId);
  assert.equal(
    (await api("/account/session", "GET", undefined, original)).response.status,
    401,
  );
  assert.equal(
    (await api("/account/session", "GET", undefined, phone)).response.status,
    401,
  );
  assert.equal(
    (await api("/sync/workspace", "GET", undefined, changed.identity)).json.data
      .schedules[0].entries[0].title,
    "Design principles",
  );
  assert.equal(
    (
      await api("/account/login", "POST", {
        username: "password_owner",
        password,
      })
    ).response.status,
    401,
  );
  assert.equal(
    (
      await api("/account/login", "POST", {
        username: "password_owner",
        password: nextPassword,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await api("/account/recover", "POST", {
        username: "password_owner",
        password,
        recoveryCode: registered.json.recoveryCode,
      })
    ).response.status,
    401,
  );
});

function subscription() {
  const curve = createECDH("prime256v1");
  curve.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    keys: {
      p256dh: curve.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}
test("session revocation stops linked reminders and password rotation keeps only the current device", async (t) => {
  const config = loadPushConfig({
    subject: "mailto:test@example.com",
    ...generateVAPIDKeys(),
  });
  const { api, db } = await start(t, {
    push: { config, intervalMs: 0, send: async () => {} },
  });
  const current = (
    await api("/account/register", "POST", {
      username: "notify_owner",
      password,
    })
  ).identity;
  const phone = (
    await api("/account/login", "POST", { username: "notify_owner", password })
  ).identity;
  const computerKey = "a".repeat(64),
    phoneKey = "b".repeat(64),
    computerId = randomUUID(),
    phoneId = randomUUID();
  for (const [identity, workspaceKey, deviceId] of [
    [current, computerKey, computerId],
    [phone, phoneKey, phoneId],
  ]) {
    assert.equal(
      (
        await api(
          `/push/devices/${deviceId}`,
          "PUT",
          {
            subscription: subscription(),
            plan: reminderPlan(workspace(), "Asia/Manila"),
          },
          undefined,
          { Authorization: `Bearer ${workspaceKey}` },
        )
      ).response.status,
      200,
    );
    assert.equal(
      (
        await api(
          "/account/reminder-device",
          "PUT",
          { workspaceKey, deviceId },
          identity,
        )
      ).response.status,
      200,
    );
  }
  const changed = await api(
    "/account/password",
    "PUT",
    { currentPassword: password, newPassword: nextPassword },
    current,
  );
  assert.equal(changed.response.status, 200);
  assert.equal(db.prepare("SELECT count(*) AS n FROM push_devices").get().n, 1);
  assert.equal(
    db.prepare("SELECT session_id FROM account_reminder_devices").get()
      .session_id,
    changed.json.sessionId,
  );
  assert.equal(
    (
      await api(
        `/push/devices/${computerId}`,
        "GET",
        undefined,
        changed.identity,
        {
          Authorization: `Bearer ${computerKey}`,
        },
      )
    ).json.enabled,
    true,
  );
  assert.equal(
    (
      await api(`/push/devices/${phoneId}`, "GET", undefined, phone, {
        Authorization: `Bearer ${phoneKey}`,
      })
    ).response.status,
    401,
  );
  await api("/account/session", "DELETE", undefined, changed.identity);
  assert.equal(db.prepare("SELECT count(*) AS n FROM push_devices").get().n, 0);
});

test("revoked sessions cannot reuse account device keys for backups or push registration", async (t) => {
  const config = loadPushConfig({
    subject: "mailto:test@example.com",
    ...generateVAPIDKeys(),
  });
  const { api } = await start(t, {
    push: { config, intervalMs: 0, send: async () => {} },
  });
  const current = (
    await api("/account/register", "POST", { username: "key_owner", password })
  ).identity;
  const phone = (
    await api("/account/login", "POST", { username: "key_owner", password })
  ).identity;
  const other = (
    await api("/account/register", "POST", {
      username: "other_key_owner",
      password,
    })
  ).identity;
  const key = "d".repeat(64),
    headers = { Authorization: `Bearer ${key}` };
  await api("/account/device", "PUT", { workspaceKey: key }, phone);
  assert.equal(
    (
      await api(
        "/workspace",
        "PUT",
        { version: 1, revision: 0, data: workspace() },
        phone,
        headers,
      )
    ).response.status,
    201,
  );
  await api(
    `/account/sessions/${phone.sessionId}`,
    "DELETE",
    undefined,
    current,
  );
  for (const identity of [undefined, phone, other]) {
    for (const path of [
      "/workspace",
      "/workspace/history",
      `/push/devices/${randomUUID()}`,
    ])
      assert.equal(
        (await api(path, "GET", undefined, identity, headers)).response.status,
        401,
      );
    assert.equal(
      (
        await api(
          "/workspace",
          "PUT",
          { version: 1, revision: 1, data: workspace() },
          identity,
          headers,
        )
      ).response.status,
      401,
    );
    assert.equal(
      (
        await api(
          `/push/devices/${randomUUID()}`,
          "PUT",
          {
            subscription: subscription(),
            plan: reminderPlan(workspace(), "Asia/Manila"),
          },
          identity,
          headers,
        )
      ).response.status,
      401,
    );
  }
  assert.equal(
    (await api("/workspace", "GET", undefined, current, headers)).response
      .status,
    200,
  );
  assert.equal(
    (
      await api(
        "/workspace",
        "PUT",
        { version: 1, revision: 0, data: workspace() },
        undefined,
        { Authorization: `Bearer ${"e".repeat(64)}` },
      )
    ).response.status,
    201,
  );
});

test("deletion is confirmed, atomic and scoped to the account and its linked server copies", async (t) => {
  const config = loadPushConfig({
    subject: "mailto:test@example.com",
    ...generateVAPIDKeys(),
  });
  const { api, db, reminders } = await start(t, {
    push: { config, intervalMs: 0, send: async () => {} },
  });
  const doomed = (
    await api("/account/register", "POST", {
      username: "delete_owner",
      password,
    })
  ).identity;
  const second = (
    await api("/account/login", "POST", { username: "delete_owner", password })
  ).identity;
  const unrelated = (
    await api("/account/register", "POST", { username: "keep_owner", password })
  ).identity;
  const account = db
    .prepare("SELECT * FROM accounts WHERE id=?")
    .get(doomed.user.id);
  for (const identity of [doomed, unrelated])
    await api(
      "/sync/workspace",
      "PUT",
      { version: 1, revision: 0, data: workspace() },
      identity,
    );
  const keys = ["a".repeat(64), "b".repeat(64), "c".repeat(64)];
  for (let i = 0; i < keys.length; i++) {
    const identity = i === 0 ? doomed : i === 1 ? second : unrelated,
      key = keys[i],
      deviceId = randomUUID();
    await api("/account/device", "PUT", { workspaceKey: key }, identity);
    await api(
      "/workspace",
      "PUT",
      { version: 1, revision: 0, data: workspace() },
      identity,
      { Authorization: `Bearer ${key}` },
    );
    await api(
      `/push/devices/${deviceId}`,
      "PUT",
      {
        subscription: subscription(),
        plan: reminderPlan(workspace(), "Asia/Manila"),
      },
      identity,
      { Authorization: `Bearer ${key}` },
    );
    await api(
      "/account/reminder-device",
      "PUT",
      { workspaceKey: key, deviceId },
      identity,
    );
    const deviceRow = db
      .prepare("SELECT * FROM push_devices WHERE owner=?")
      .get(hash(key));
    reminders.enqueue(deviceRow, [
      {
        id: `delivery-${i}`,
        dueAt: Date.now(),
        expiresAt: Date.now() + 120000,
        payload: { body: "Private reminder" },
      },
    ]);
  }
  // An interrupted browser can have a subscription before its account link finishes.
  assert.equal(
    (
      await api(
        `/push/devices/${randomUUID()}`,
        "PUT",
        {
          subscription: subscription(),
          plan: reminderPlan(workspace(), "Asia/Manila"),
        },
        doomed,
        { Authorization: `Bearer ${keys[0]}` },
      )
    ).response.status,
    200,
  );
  const body = { currentPassword: password, confirmation: "delete_owner" };
  assert.equal(
    (
      await api(
        "/account",
        "DELETE",
        { ...body, currentPassword: "a-wrong-current-password" },
        doomed,
      )
    ).response.status,
    400,
  );
  assert.equal(
    (
      await api(
        "/account",
        "DELETE",
        { ...body, confirmation: "wrong" },
        doomed,
      )
    ).response.status,
    400,
  );
  db.exec(
    "CREATE TRIGGER prevent_account_delete BEFORE DELETE ON accounts BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END",
  );
  assert.equal(
    (await api("/account", "DELETE", body, doomed)).response.status,
    500,
  );
  assert.equal(
    (await api("/account/session", "GET", undefined, doomed)).response.status,
    200,
  );
  assert.equal(db.prepare("SELECT count(*) AS n FROM push_devices").get().n, 4);
  assert.equal(
    (
      await api("/workspace", "GET", undefined, doomed, {
        Authorization: `Bearer ${keys[0]}`,
      })
    ).response.status,
    200,
  );
  db.exec("DROP TRIGGER prevent_account_delete");
  const deleted = await api("/account", "DELETE", body, doomed);
  assert.equal(deleted.json.deleted, true);
  assert.match(deleted.response.headers.get("set-cookie"), /Max-Age=0/);
  for (const identity of [doomed, second])
    assert.equal(
      (await api("/account/session", "GET", undefined, identity)).response
        .status,
      401,
    );
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM accounts WHERE id=?")
      .get(doomed.user.id).n,
    0,
  );
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM workspace_versions WHERE key_hash=?")
      .get(hash(account.workspace_key)).n,
    0,
  );
  for (const key of keys.slice(0, 2)) {
    assert.equal(
      (
        await api("/workspace", "GET", undefined, undefined, {
          Authorization: `Bearer ${key}`,
        })
      ).response.status,
      410,
    );
    assert.equal(
      (
        await api(
          "/workspace",
          "PUT",
          { version: 1, revision: 0, data: workspace() },
          undefined,
          { Authorization: `Bearer ${key}` },
        )
      ).response.status,
      410,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM workspace_versions WHERE key_hash=?",
        )
        .get(hash(key)).n,
      0,
    );
  }
  assert.equal(db.prepare("SELECT count(*) AS n FROM push_devices").get().n, 1);
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM push_deliveries").get().n,
    1,
  );
  assert.equal(
    (await api("/sync/workspace", "GET", undefined, unrelated)).json.data
      .preferences.name,
    "Friend",
  );
  assert.equal(
    (
      await api("/workspace", "GET", undefined, unrelated, {
        Authorization: `Bearer ${keys[2]}`,
      })
    ).response.status,
    200,
  );
});

test("revoking a session during password verification prevents credential changes", async (t) => {
  const store = new WorkspaceStore(":memory:");
  t.after(() => store.close());
  const accounts = new Accounts(store.db);
  const created = await accounts.register(
    { username: "race_owner", password },
    "race-ip",
  );
  const req = {
    headers: {
      cookie: `mochiplan_session=${created.token}`,
      "x-mochi-csrf": created.result.csrfToken,
    },
  };
  const changing = accounts.changePassword(
    req,
    { currentPassword: password, newPassword: nextPassword },
    "race-ip",
  );
  accounts.revokeSessions(req, created.result.sessionId);
  await assert.rejects(changing, { status: 401 });
  assert.ok(
    (await accounts.login({ username: "race_owner", password }, "race-ip"))
      .token,
  );
});

test("legacy session migration preserves valid cookies and gives stable public device IDs", () => {
  const store = new WorkspaceStore(":memory:");
  try {
    const now = Date.now(),
      token = "a".repeat(64);
    store.db.exec(
      "CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,password_hash TEXT NOT NULL,recovery_hash TEXT NOT NULL,workspace_key TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE TABLE account_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL)",
    );
    store.db
      .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)")
      .run(
        "legacy",
        "legacy_owner",
        "salt",
        "hash",
        "recovery",
        "b".repeat(64),
        now,
      );
    store.db
      .prepare("INSERT INTO account_sessions VALUES (?,?,?,?,?)")
      .run(hash(token), "legacy", "c".repeat(64), now + 100000, now);
    const accounts = new Accounts(store.db),
      req = { headers: { cookie: `mochiplan_session=${token}` } };
    const first = accounts.current(req);
    assert.match(first.sessionId, /^[a-f0-9-]{36}$/);
    assert.equal(
      new Accounts(store.db).current(req).sessionId,
      first.sessionId,
    );
    assert.equal(
      accounts.listSessions(req).sessions[0].device,
      "Earlier browser session",
    );
  } finally {
    store.close();
  }
});
