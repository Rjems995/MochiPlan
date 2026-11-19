import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createECDH, randomUUID, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateVAPIDKeys, generateRequestDetails } from "web-push";
import { createApp } from "../src/server.mjs";
import { WorkspaceStore } from "../src/database.mjs";
import { ReminderStore } from "../src/reminder-store.mjs";
import { ReminderScheduler } from "../src/reminder-scheduler.mjs";
import { loadPushConfig } from "../src/push-config.mjs";
import {
  dueReminders,
  occursOn,
  planHash,
  validateReminderPlan,
  validateSubscription,
} from "../src/reminder-plan.mjs";
import {
  reminderPlan,
  reminderId,
} from "../../frontend/src/services/reminderPlan.ts";
import { occurrenceStatus } from "../../frontend/src/calendar.ts";
import { workspace } from "./fixture.mjs";

const key = "a".repeat(64),
  device = "12345678-1234-4123-8123-123456789abc";
const at = Date.parse("2026-11-16T00:50:00Z");
const config = loadPushConfig({
  subject: "mailto:test@example.com",
  ...generateVAPIDKeys(),
});
function subscription() {
  const curve = createECDH("prime256v1");
  curve.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    expirationTime: null,
    keys: {
      p256dh: curve.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}
function plan(data = workspace(), zone = "Asia/Manila") {
  return validateReminderPlan(reminderPlan(data, zone));
}
function harness(t, filename = ":memory:") {
  const workspaceStore = new WorkspaceStore(filename),
    store = new ReminderStore(workspaceStore.db),
    sent = [];
  let now = at;
  const options = {
    config,
    intervalMs: 0,
    now: () => now,
    send: async (sub, payload, delivery) => {
      sent.push({ sub, payload, delivery });
    },
  };
  const scheduler = new ReminderScheduler(store, options);
  t.after(() => {
    scheduler.stop();
    workspaceStore.close();
  });
  return {
    store,
    scheduler,
    options,
    sent,
    advance: (ms) => {
      now += ms;
    },
    now: () => now,
  };
}

test("reminder projection contains only notification data and validates independently of backups", () => {
  const data = workspace();
  data.schedules[0].design.image = "private image";
  data.tasks[0].title = "private task";
  const projected = plan(data);
  assert.equal("preferences" in projected, false);
  assert.equal("tasks" in projected, false);
  assert.equal("design" in projected.schedules[0], false);
  assert.equal("notes" in projected.schedules[0].entries[0], false);
  assert.equal(projected.minutes, 10);
  assert.equal(
    planHash(projected),
    planHash(JSON.parse(JSON.stringify(projected))),
  );
  for (const mutate of [
    (p) => (p.timezone = "Somewhere/Invalid"),
    (p) => (p.minutes = 100),
    (p) => (p.schedules[0].entries[0].day = 10),
    (p) => (p.schedules[0].entries[0].date = "2026-11-17"),
    (p) => (p.schedules[0].entries[0].cancelledDates = ["2026-02-30"]),
    (p) => (p.schedules[0].termStart = "2027-02-30"),
    (p) => p.schedules[0].entries.push(p.schedules[0].entries[0]),
  ]) {
    const invalid = structuredClone(projected);
    mutate(invalid);
    assert.throws(() => validateReminderPlan(invalid), { status: 400 });
  }
});

test("server occurrence rules match the planner for semesters, holidays, cancellations and scoped reschedules", () => {
  const data = workspace(),
    schedule = data.schedules[0],
    entry = schedule.entries[0];
  schedule.termStart = "2026-11-09";
  schedule.termEnd = "2026-12-31";
  schedule.holidays = [
    {
      id: "holiday",
      name: "Break",
      startDate: "2026-11-23",
      endDate: "2026-11-29",
    },
  ];
  entry.seriesId = entry.id;
  entry.endsOn = "2026-11-22";
  entry.cancelledDates = ["2026-11-16"];
  schedule.entries.push(
    {
      ...entry,
      id: "phase",
      startsOn: "2026-11-23",
      endsOn: undefined,
      cancelledDates: [],
      start: 600,
    },
    {
      ...entry,
      id: "moved",
      sourceId: entry.id,
      originalDate: "2026-11-16",
      date: "2026-11-18",
      day: 2,
      endsOn: undefined,
      cancelledDates: [],
    },
  );
  const projected = plan(data).schedules[0];
  for (const date of [
    "2026-11-02",
    "2026-11-09",
    "2026-11-16",
    "2026-11-18",
    "2026-11-23",
    "2026-11-30",
    "2027-01-04",
  ])
    for (let i = 0; i < schedule.entries.length; i++)
      assert.equal(
        occursOn(projected, projected.entries[i], date),
        occurrenceStatus(schedule, schedule.entries[i], date) === "scheduled",
      );
});

test("due reminders use device zones across midnight and deterministic daylight-saving transitions", async () => {
  const p = plan();
  const reminder = dueReminders(p, at)[0];
  assert.equal(reminder.dueAt, at);
  assert.match(reminder.payload.body, /9:00 AM/);
  assert.equal(
    reminder.id,
    await reminderId(
      "planner",
      workspace().schedules[0].entries[0],
      "2026-11-16",
    ),
  );
  const midnight = plan();
  midnight.schedules[0].entries[0] = {
    ...midnight.schedules[0].entries[0],
    day: 1,
    start: 5,
    end: 60,
  };
  assert.equal(
    dueReminders(midnight, Date.parse("2026-11-16T15:55:00Z")).length,
    1,
  );
  const dst = plan(workspace(), "America/New_York");
  dst.minutes = 0;
  dst.schedules[0].entries[0].day = 6;
  dst.schedules[0].entries[0].start = 90;
  dst.schedules[0].entries[0].end = 180;
  assert.equal(dueReminders(dst, Date.parse("2026-11-01T05:30:00Z")).length, 1);
  assert.equal(dueReminders(dst, Date.parse("2026-11-01T06:30:00Z")).length, 0);
  dst.schedules[0].entries[0].start = 150;
  assert.equal(dueReminders(dst, Date.parse("2026-03-08T07:30:00Z")).length, 1);
  assert.equal(
    dueReminders(p, at + 360000).length,
    0,
    "outdated reminder windows are skipped",
  );
});

test("persistent scheduler sends once with the app absent and retries temporary push failures", async (t) => {
  const h = harness(t);
  h.store.save(key, device, subscription(), plan(), h.now());
  const original = h.scheduler.send;
  let calls = 0;
  h.scheduler.send = async (...args) => {
    if (!calls++) throw Object.assign(Error("retry"), { statusCode: 503 });
    await original(...args);
  };
  await h.scheduler.tick();
  assert.equal(h.sent.length, 0);
  assert.match(h.store.status(key, device).error, /delayed/);
  h.advance(15000);
  await h.scheduler.tick();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].delivery.TTL <= 120, true);
  assert.match(h.store.status(key, device).lastSentAt, /^2026-11-16/);
  await h.scheduler.tick();
  assert.equal(h.sent.length, 1);
  h.store.save(key, device, h.sent[0].sub, plan(), h.now());
  await h.scheduler.tick();
  assert.equal(
    h.sent.length,
    1,
    "resyncing never repeats an accepted reminder",
  );
});

test("cancelled or rescheduled jobs are replaced before delivery and expired endpoints stop retrying", async (t) => {
  const h = harness(t),
    sub = subscription();
  h.store.save(key, device, sub, plan(), h.now());
  h.scheduler.send = async () => {
    throw Object.assign(Error("temporary"), {
      statusCode: 429,
      headers: { "retry-after": "30" },
    });
  };
  await h.scheduler.tick();
  const cancelled = workspace();
  cancelled.schedules[0].entries[0].cancelledDates = ["2026-11-16"];
  h.store.save(key, device, sub, plan(cancelled), h.now());
  h.scheduler.send = async () => {
    throw Error("A cancelled class must not send");
  };
  h.advance(30000);
  await h.scheduler.tick();
  assert.equal(
    h.store.db.prepare("SELECT count(*) AS n FROM push_deliveries").get().n,
    0,
  );
  h.store.save(key, device, sub, plan(), h.now());
  let attempts = 0;
  h.scheduler.send = async () => {
    attempts++;
    throw Object.assign(Error("gone"), { statusCode: 410 });
  };
  await h.scheduler.tick();
  h.advance(60000);
  await h.scheduler.tick();
  assert.equal(attempts, 1);
  assert.equal(h.store.status(key, device).enabled, false);
  assert.throws(() => h.store.save(key, device, sub, plan(), h.now()), {
    status: 410,
  });
});

test("leased jobs survive a server restart without duplicating accepted reminders", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mochi-push-")),
    filename = join(directory, "workspace.sqlite");
  let current;
  t.after(() => {
    current?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  current = new WorkspaceStore(filename);
  let store = new ReminderStore(current.db);
  store.save(key, device, subscription(), plan(), at);
  const row = store.devices()[0];
  store.enqueue(row, dueReminders(plan(), at));
  assert.ok(store.claim(at));
  current.close();
  current = new WorkspaceStore(filename);
  store = new ReminderStore(current.db);
  const sent = [],
    scheduler = new ReminderScheduler(store, {
      config,
      now: () => at + 61000,
      intervalMs: 0,
      send: async (...args) => sent.push(args),
    });
  await scheduler.tick();
  await scheduler.tick();
  scheduler.stop();
  assert.equal(sent.length, 1);
  assert.equal(
    store.db.prepare("SELECT status FROM push_deliveries").get().status,
    "sent",
  );
});

test("push keys remain stable, encrypt real request payloads and never appear in public configuration", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mochi-vapid-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = {
    subject: "mailto:test@example.com",
    keyPath: join(directory, "keys.json"),
  };
  const first = loadPushConfig(options),
    second = loadPushConfig(options);
  assert.deepEqual(first, second);
  const request = generateRequestDetails(subscription(), "Private activity", {
    vapidDetails: first.vapidDetails,
    TTL: 120,
  });
  assert.equal(request.body.includes(Buffer.from("Private activity")), false);
  assert.match(request.headers.Authorization, /^vapid /);
  assert.deepEqual(loadPushConfig(), { configured: false, publicKey: null });
  assert.throws(
    () => loadPushConfig({ ...options, publicKey: first.publicKey }),
    /both/,
  );
  assert.throws(
    () => loadPushConfig({ ...options, subject: "https://localhost" }),
    /contact/,
  );
});

test("push API isolates devices, validates subscriptions, supports disabling and rate-limits test messages", async (t) => {
  const sent = [],
    server = createApp({
      databasePath: ":memory:",
      push: {
        config,
        intervalMs: 0,
        now: () => at,
        send: async (...args) => sent.push(args),
      },
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}/api/push`,
    headers = {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    path = base + "/devices/" + device;
  const publicConfig = await (await fetch(base + "/config")).json();
  assert.deepEqual(publicConfig, {
    version: 1,
    configured: true,
    publicKey: config.publicKey,
  });
  const sub = subscription(),
    body = JSON.stringify({ subscription: sub, plan: plan() });
  assert.equal(
    (await fetch(path, { method: "PUT", headers, body })).status,
    200,
  );
  const state = await (await fetch(path, { headers })).json();
  assert.equal(state.enabled, true);
  assert.equal("subscription" in state, false);
  assert.equal((await fetch(path)).status, 401);
  assert.equal(
    (
      await fetch(path, {
        headers: { ...headers, Origin: "https://foreign.example" },
      })
    ).status,
    403,
  );
  assert.equal((await fetch(path, { method: "POST", headers })).status, 405);
  assert.equal(
    (
      await (
        await fetch(path, {
          headers: { Authorization: `Bearer ${"b".repeat(64)}` },
        })
      ).json()
    ).enabled,
    false,
  );
  assert.equal(
    (
      await fetch(path, {
        method: "PUT",
        headers: { ...headers, Authorization: `Bearer ${"b".repeat(64)}` },
        body,
      })
    ).status,
    409,
  );
  for (const endpoint of [
    "http://127.0.0.1/private",
    "https://127.0.0.1/private",
    "https://fcm.googleapis.com.evil.example/token",
    "https://user@fcm.googleapis.com/token",
    "https://fcm.googleapis.com:8080/token",
  ]) {
    assert.throws(() => validateSubscription({ ...sub, endpoint }), {
      status: 400,
    });
  }
  assert.throws(
    () =>
      validateSubscription({
        ...sub,
        keys: { auth: "invalid", p256dh: sub.keys.p256dh },
      }),
    { status: 400 },
  );
  assert.equal(
    (await fetch(path + "/test", { method: "POST", headers })).status,
    200,
  );
  assert.equal(sent.length, 1);
  assert.equal(
    (await fetch(path + "/test", { method: "POST", headers })).status,
    429,
  );
  assert.equal((await fetch(path, { method: "DELETE", headers })).status, 200);
  assert.equal((await (await fetch(path, { headers })).json()).enabled, false);
  await server.reminderScheduler.tick();
  assert.equal(sent.length, 1);
});
