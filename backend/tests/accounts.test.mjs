import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/server.mjs";
import { Accounts } from "../src/accounts.mjs";
import { WorkspaceStore } from "../src/database.mjs";
import { workspace } from "./fixture.mjs";

const password = "a-long-test-password-2026";
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
  return async (path, method = "GET", body, identity, extra = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: "http://127.0.0.1:4173",
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
}

test("accounts sync between separate sessions, isolate workspaces, and reject stale writes", async (t) => {
  const api = await start(t);
  const registered = await api("/account/register", "POST", {
    username: "Student_One",
    password,
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.json.user.username, "student_one");
  assert.match(registered.json.recoveryCode, /^[a-f0-9-]{47}$/);
  assert.match(
    registered.response.headers.get("set-cookie"),
    /HttpOnly; SameSite=Strict/,
  );
  assert.equal(registered.response.headers.get("cache-control"), "no-store");
  const phone = (
    await api("/account/login", "POST", { username: "STUDENT_ONE", password })
  ).identity;
  const computer = registered.identity;
  assert.notEqual(phone.cookie, computer.cookie);
  assert.equal(
    (await api("/sync/workspace", "GET", undefined, phone)).json.revision,
    0,
  );
  const data = workspace();
  data.preferences.reminders = true;
  data.activeId = data.schedules[0].id;
  const saved = await api(
    "/sync/workspace",
    "PUT",
    { version: 1, revision: 0, data },
    computer,
  );
  assert.equal(saved.response.status, 200);
  const loaded = await api("/sync/workspace", "GET", undefined, phone);
  assert.equal(loaded.json.data.preferences.name, "Friend");
  assert.equal(loaded.json.data.preferences.reminders, false);
  assert.equal(loaded.json.data.schedules[0].updatedAt, 0);
  assert.equal(
    (
      await api(
        "/sync/workspace",
        "PUT",
        { version: 1, revision: 0, data },
        phone,
      )
    ).response.status,
    409,
  );
  const other = (
    await api("/account/register", "POST", {
      username: "student_two",
      password,
    })
  ).identity;
  assert.equal(
    (await api("/sync/workspace", "GET", undefined, other)).json.revision,
    0,
  );
  assert.equal((await api("/sync/workspace")).response.status, 401);
  assert.equal(
    (
      await api("/sync/workspace", "GET", undefined, other, {
        "X-Mochi-Account": computer.user.id,
      })
    ).response.status,
    401,
  );
  assert.equal(
    (await api("/account/session", "DELETE", undefined, phone)).response.status,
    200,
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

test("account mutations require a matching origin and session CSRF token", async (t) => {
  const api = await start(t, { accountOptions: { secureCookies: true } });
  const identity = (
    await api("/account/register", "POST", {
      username: "secure_user",
      password,
    })
  ).identity;
  assert.match(
    (
      await api("/account/login", "POST", { username: "secure_user", password })
    ).response.headers.get("set-cookie"),
    /; Secure/,
  );
  const body = { version: 1, revision: 0, data: workspace() };
  assert.equal(
    (
      await api("/sync/workspace", "PUT", body, identity, {
        "X-Mochi-CSRF": "wrong",
      })
    ).response.status,
    403,
  );
  assert.equal(
    (
      await api("/sync/workspace", "PUT", body, identity, {
        Origin: "https://foreign.example",
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await api("/sync/workspace", "PUT", body, identity, { Origin: "" }))
      .response.status,
    403,
  );
  assert.equal(
    (
      await api("/account/session", "DELETE", undefined, identity, {
        "X-Mochi-CSRF": "",
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await api("/sync/workspace", "GET", undefined, identity)).json.revision,
    0,
  );
  assert.equal(
    (await api("/account/register", "POST", { username: "bad name", password }))
      .response.status,
    400,
  );
  assert.equal(
    (
      await api("/account/register", "POST", {
        username: "short",
        password: "short",
      })
    ).response.status,
    400,
  );
});

test("recovery codes rotate and revoke previous sessions without replacing saved plans", async (t) => {
  const api = await start(t);
  const registered = await api("/account/register", "POST", {
    username: "recover_me",
    password,
  });
  const original = registered.identity;
  await api(
    "/sync/workspace",
    "PUT",
    { version: 1, revision: 0, data: workspace() },
    original,
  );
  const second = (
    await api("/account/login", "POST", { username: "recover_me", password })
  ).identity;
  const recovery = await api("/account/recover", "POST", {
    username: "recover_me",
    password: "a-different-long-password",
    recoveryCode: registered.json.recoveryCode,
  });
  assert.equal(recovery.response.status, 200);
  assert.notEqual(recovery.json.recoveryCode, registered.json.recoveryCode);
  assert.equal(
    (await api("/account/session", "GET", undefined, original)).response.status,
    401,
  );
  assert.equal(
    (await api("/account/session", "GET", undefined, second)).response.status,
    401,
  );
  assert.equal(
    (await api("/account/login", "POST", { username: "recover_me", password }))
      .response.status,
    401,
  );
  assert.equal(
    (await api("/sync/workspace", "GET", undefined, recovery.identity)).json
      .data.schedules[0].entries[0].title,
    "Design principles",
  );
  assert.equal(
    (
      await api("/account/recover", "POST", {
        username: "recover_me",
        password,
        recoveryCode: registered.json.recoveryCode,
      })
    ).response.status,
    401,
  );
});

test("passwords and session tokens are hashed, sessions expire, and persisted limits throttle guesses", async (t) => {
  const workspaceStore = new WorkspaceStore(":memory:");
  t.after(() => workspaceStore.close());
  let now = Date.now();
  const accounts = new Accounts(workspaceStore.db, { now: () => now });
  const created = await accounts.register(
    { username: "hashed_user", password },
    "test-ip",
  );
  const row = workspaceStore.db.prepare("SELECT * FROM accounts").get();
  assert.notEqual(row.password_hash, password);
  assert.notEqual(row.recovery_hash, created.result.recoveryCode);
  const session = workspaceStore.db
    .prepare("SELECT * FROM account_sessions")
    .get();
  assert.notEqual(session.token_hash, created.token);
  for (let i = 0; i < 10; i++) accounts.limit("other-ip", "blocked-name");
  assert.throws(() => accounts.limit("other-ip", "blocked-name"), {
    status: 429,
  });
  const restarted = new Accounts(workspaceStore.db, { now: () => now });
  assert.throws(() => restarted.limit("other-ip", "blocked-name"), {
    status: 429,
  });
  now += 31 * 86400000;
  assert.throws(
    () =>
      restarted.current({
        headers: { cookie: `mochiplan_session=${created.token}` },
      }),
    { status: 401 },
  );
  assert.doesNotThrow(() => restarted.limit("other-ip", "blocked-name"));
});
