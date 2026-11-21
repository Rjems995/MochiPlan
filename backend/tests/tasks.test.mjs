import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { generateVAPIDKeys } from "web-push";
import { createApp } from "../src/server.mjs";
import { loadPushConfig } from "../src/push-config.mjs";
import { validateReminderPlan, dueReminders } from "../src/reminder-plan.mjs";
import {
  reminderPlan,
  taskReminderId,
} from "../../frontend/src/services/reminderPlan.ts";
import { toggleTaskCompletion } from "../../frontend/src/taskRules.ts";
import { workspace } from "./fixture.mjs";

const key = "d".repeat(64),
  now = Date.parse("2026-11-16T00:50:00Z");
function data() {
  const value = workspace();
  value.schedules[0].entries = [];
  value.tasks[0] = {
    ...value.tasks[0],
    title: "Submit reading journal",
    due: "2026-11-16",
    dueTime: "09:05",
    reminderMinutes: 15,
    subtasks: [{ id: "notes", title: "Private reading notes", done: false }],
    seriesId: "reading",
    recurrence: { frequency: "daily", interval: 1, anchorDate: "2026-11-16" },
  };
  return value;
}
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
async function start(t, push = {}) {
  const server = createApp({ databasePath: ":memory:", push });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const api = async (path, method = "GET", body, extra = {}) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method,
        headers: {
          Origin: "http://127.0.0.1:4173",
          Authorization: `Bearer ${key}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return {
      status: response.status,
      json: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  return { server, api };
}
test("upgraded tasks persist through backup/history and malformed nested data cannot overwrite them", async (t) => {
  const { api } = await start(t);
  const original = data();
  assert.equal(
    (
      await api("/workspace", "PUT", {
        version: 1,
        revision: 0,
        data: original,
      })
    ).status,
    201,
  );
  assert.deepEqual((await api("/workspace")).json.data.tasks, original.tasks);
  assert.deepEqual(
    (await api("/workspace/history/1")).json.data.tasks,
    original.tasks,
  );
  for (const patch of [
    { dueTime: "24:00" },
    { reminderMinutes: 7 },
    { subtasks: [{ id: "a", title: "Step", done: "yes" }] },
    {
      recurrence: {
        frequency: "daily",
        interval: 100,
        anchorDate: "2026-11-16",
      },
    },
  ]) {
    const invalid = data();
    Object.assign(invalid.tasks[0], patch);
    assert.equal(
      (
        await api("/workspace", "PUT", {
          version: 1,
          revision: 1,
          data: invalid,
        })
      ).status,
      400,
    );
  }
  assert.deepEqual((await api("/workspace")).json.data.tasks, original.tasks);
});
test("task reminder projection excludes private steps, ignores completed/unselected tasks and matches local deduplication IDs", async () => {
  const original = data(),
    task = original.tasks[0];
  original.tasks.push(
    { ...task, id: "done", done: true },
    { ...task, id: "off", reminderMinutes: undefined },
  );
  const plan = validateReminderPlan(reminderPlan(original, "Asia/Manila"));
  assert.equal(plan.tasks.length, 1);
  assert.ok(!JSON.stringify(plan).includes("Private reading notes"));
  assert.ok(!("recurrence" in plan.tasks[0]));
  assert.ok(!("subtasks" in plan.tasks[0]));
  const jobs = dueReminders(plan, now);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, await taskReminderId(task));
  assert.match(jobs[0].payload.title, /Task deadline: Submit reading journal/);
  assert.match(jobs[0].payload.url, /task=task&profile=device/);
  assert.equal(dueReminders(plan, now + 600000).length, 0);
  assert.throws(() =>
    validateReminderPlan({
      ...plan,
      tasks: [{ ...plan.tasks[0], dueTime: ["09:00"] }],
    }),
  );
  assert.throws(() =>
    validateReminderPlan({ ...plan, tasks: [plan.tasks[0], plan.tasks[0]] }),
  );
});
test("deadline alerts handle day-before notifications, default times, midnight and daylight-saving transitions", () => {
  const make = (zone, task) =>
    validateReminderPlan({
      version: 1,
      timezone: zone,
      time24: false,
      minutes: 10,
      schedules: [],
      tasks: [
        {
          id: "deadline",
          title: "Deadline",
          due: "2026-11-17",
          reminderMinutes: 0,
          ...task,
        },
      ],
    });
  assert.equal(
    dueReminders(
      make("Asia/Manila", { reminderMinutes: 1440 }),
      Date.parse("2026-11-16T01:00:00Z"),
    ).length,
    1,
  );
  assert.equal(
    dueReminders(
      make("America/New_York", { dueTime: "00:05", reminderMinutes: 15 }),
      Date.parse("2026-11-17T04:50:00Z"),
    ).length,
    1,
  );
  const spring = make("America/New_York", {
    due: "2026-03-08",
    dueTime: "02:30",
  });
  assert.equal(
    dueReminders(spring, Date.parse("2026-03-08T07:30:00Z")).length,
    1,
  );
  const autumn = make("America/New_York", {
    due: "2026-11-01",
    dueTime: "01:30",
  });
  assert.equal(
    dueReminders(autumn, Date.parse("2026-11-01T05:30:00Z")).length,
    1,
  );
  assert.equal(
    dueReminders(autumn, Date.parse("2026-11-01T06:30:00Z")).length,
    0,
  );
});
test("account task completion atomically cancels queued alerts and stale device uploads cannot revive them", async (t) => {
  const received = [],
    config = loadPushConfig({
      subject: "mailto:test@example.com",
      ...generateVAPIDKeys(),
    });
  const { api, server } = await start(t, {
    config,
    intervalMs: 0,
    now: () => now,
    send: async (_subscription, payload) => received.push(payload),
  });
  const registered = await api("/account/register", "POST", {
    username: "task_owner",
    password: "a-task-account-test-password",
  });
  const headers = {
    Cookie: registered.cookie,
    "X-Mochi-CSRF": registered.json.csrfToken,
    "X-Mochi-Account": registered.json.user.id,
  };
  const original = data();
  const saved = await api(
    "/sync/workspace",
    "PUT",
    { version: 1, revision: 0, data: original },
    headers,
  );
  const deviceId = randomUUID(),
    sub = subscription(),
    plan = reminderPlan(original, "Asia/Manila");
  assert.equal(
    (
      await api(
        `/push/devices/${deviceId}`,
        "PUT",
        { subscription: sub, plan },
        headers,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        "/account/reminder-device",
        "PUT",
        { workspaceKey: key, deviceId },
        headers,
      )
    ).status,
    200,
  );
  const store = server.reminderScheduler.store,
    row = store.row(key, deviceId);
  store.enqueue(row, dueReminders(JSON.parse(row.plan), now));
  assert.equal(
    store.db
      .prepare(
        "SELECT count(*) AS n FROM push_deliveries WHERE status='pending'",
      )
      .get().n,
    1,
  );
  const completed = data();
  completed.tasks = toggleTaskCompletion(
    original.tasks,
    original.tasks[0].id,
    "2026-11-16",
  );
  assert.equal(
    (
      await api(
        "/sync/workspace",
        "PUT",
        { version: 1, revision: saved.json.revision, data: completed },
        headers,
      )
    ).status,
    200,
  );
  assert.equal(
    store.db
      .prepare(
        "SELECT count(*) AS n FROM push_deliveries WHERE status='pending'",
      )
      .get().n,
    0,
  );
  assert.equal(
    (
      await api(
        `/push/devices/${deviceId}`,
        "PUT",
        { subscription: sub, plan },
        headers,
      )
    ).status,
    200,
  );
  const latest = JSON.parse(store.row(key, deviceId).plan);
  assert.equal(latest.tasks.length, 1);
  assert.equal(latest.tasks[0].due, "2026-11-17");
  assert.equal(latest.profileId, registered.json.user.id);
  await server.reminderScheduler.tick();
  assert.equal(received.length, 0);
});
