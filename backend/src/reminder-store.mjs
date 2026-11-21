import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "./errors.mjs";
import { planHash, validateReminderPlan } from "./reminder-plan.mjs";
import { reminderTasks } from "./task-reminders.mjs";

export class ReminderStore {
  constructor(db) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS push_devices (
      owner TEXT NOT NULL, device_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE,
      subscription TEXT NOT NULL, plan TEXT NOT NULL, plan_hash TEXT NOT NULL,
      generation INTEGER NOT NULL, enabled INTEGER NOT NULL, synced_at INTEGER NOT NULL,
      last_sent_at INTEGER, error TEXT, last_test_at INTEGER,
      PRIMARY KEY(owner,device_id)
    ); CREATE TABLE IF NOT EXISTS push_deliveries (
      owner TEXT NOT NULL, device_id TEXT NOT NULL, id TEXT NOT NULL,
      generation INTEGER NOT NULL, due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL, lease_until INTEGER, claim TEXT,
      PRIMARY KEY(owner,device_id,id)
    ); CREATE INDEX IF NOT EXISTS push_due ON push_deliveries(status,next_at);
    CREATE TABLE IF NOT EXISTS account_reminder_devices (account_id TEXT NOT NULL,owner TEXT NOT NULL,device_id TEXT NOT NULL,PRIMARY KEY(owner,device_id));`);
    db.exec(
      "CREATE TABLE IF NOT EXISTS account_device_workspaces (owner TEXT PRIMARY KEY,account_id TEXT,deleted INTEGER NOT NULL DEFAULT 0); INSERT OR IGNORE INTO account_device_workspaces(owner,account_id,deleted) SELECT DISTINCT owner,account_id,0 FROM account_reminder_devices",
    );
    if (
      !db
        .prepare("PRAGMA table_info(account_reminder_devices)")
        .all()
        .some((c) => c.name === "session_id")
    )
      db.exec(
        "ALTER TABLE account_reminder_devices ADD COLUMN session_id TEXT",
      );
  }
  owner(key) {
    return createHash("sha256").update(key).digest("hex");
  }
  row(key, id) {
    return this.db
      .prepare("SELECT * FROM push_devices WHERE owner=? AND device_id=?")
      .get(this.owner(key), id);
  }
  status(key, id) {
    const row = this.row(key, id);
    return {
      version: 1,
      enabled: !!row?.enabled,
      lastSyncedAt: row ? new Date(row.synced_at).toISOString() : null,
      lastSentAt: row?.last_sent_at
        ? new Date(row.last_sent_at).toISOString()
        : null,
      error: row?.error || "",
      timezone: row ? JSON.parse(row.plan).timezone : null,
      planHash: row?.plan_hash || null,
      accountLinked: !!this.db
        .prepare(
          "SELECT 1 FROM account_reminder_devices WHERE owner=? AND device_id=?",
        )
        .get(this.owner(key), id),
    };
  }
  save(key, id, subscription, plan, now) {
    const owner = this.owner(key),
      hash = planHash(plan),
      previous = this.row(key, id);
    const other = this.db
      .prepare("SELECT owner,device_id FROM push_devices WHERE endpoint=?")
      .get(subscription.endpoint);
    if (other && (other.owner !== owner || other.device_id !== id))
      throw new HttpError(
        409,
        "This push subscription is linked to another device. Reconnect reminders.",
      );
    if (
      previous &&
      !previous.enabled &&
      previous.endpoint === subscription.endpoint
    )
      throw new HttpError(
        410,
        "This push subscription has expired or was rejected. Reconnect reminders.",
      );
    if (
      !previous &&
      this.db
        .prepare("SELECT count(*) AS count FROM push_devices WHERE owner=?")
        .get(owner).count >= 10
    )
      throw new HttpError(
        400,
        "This workspace already has ten reminder devices.",
      );
    const changed =
      !previous ||
      previous.plan_hash !== hash ||
      previous.subscription !== JSON.stringify(subscription);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (changed) {
        this.db
          .prepare(
            `INSERT INTO push_devices(owner,device_id,endpoint,subscription,plan,plan_hash,generation,enabled,synced_at,last_sent_at,error)
          VALUES (?,?,?,?,?,?,?,1,?,?,NULL) ON CONFLICT(owner,device_id) DO UPDATE SET endpoint=excluded.endpoint,subscription=excluded.subscription,plan=excluded.plan,plan_hash=excluded.plan_hash,generation=excluded.generation,enabled=1,synced_at=excluded.synced_at,error=NULL`,
          )
          .run(
            owner,
            id,
            subscription.endpoint,
            JSON.stringify(subscription),
            JSON.stringify(plan),
            hash,
            (previous?.generation || 0) + 1,
            now,
            previous?.last_sent_at ?? null,
          );
        this.db
          .prepare(
            "DELETE FROM push_deliveries WHERE owner=? AND device_id=? AND status!='sent'",
          )
          .run(owner, id);
      } else
        this.db
          .prepare(
            "UPDATE push_devices SET synced_at=? WHERE owner=? AND device_id=?",
          )
          .run(now, owner, id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.status(key, id);
  }
  remove(key, id) {
    const owner = this.owner(key);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM account_reminder_devices WHERE owner=? AND device_id=?",
        )
        .run(owner, id);
      this.db
        .prepare("DELETE FROM push_devices WHERE owner=? AND device_id=?")
        .run(owner, id);
      this.db
        .prepare(
          "DELETE FROM push_deliveries WHERE owner=? AND device_id=? AND status!='sent'",
        )
        .run(owner, id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  linkedKey(key, id) {
    return this.db
      .prepare(
        "SELECT a.workspace_key FROM account_reminder_devices m JOIN accounts a ON a.id=m.account_id WHERE m.owner=? AND m.device_id=?",
      )
      .get(this.owner(key), id)?.workspace_key;
  }
  linkAccount(accountId, key, id, data, now, sessionId = null) {
    const owner = this.owner(key),
      row = this.row(key, id);
    if (!row)
      throw new HttpError(
        404,
        "Sync this reminder device before linking it to your account.",
      );
    const binding = this.db
      .prepare("SELECT * FROM account_device_workspaces WHERE owner=?")
      .get(owner);
    if (binding?.deleted)
      throw new HttpError(410, "This account device was deleted.");
    if (binding && binding.account_id !== accountId)
      throw new HttpError(
        409,
        "This reminder device belongs to another account.",
      );
    const previous = this.db
      .prepare(
        "SELECT account_id FROM account_reminder_devices WHERE owner=? AND device_id=?",
      )
      .get(owner, id);
    if (previous && previous.account_id !== accountId)
      throw new HttpError(
        409,
        "This reminder device belongs to another account.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO account_device_workspaces VALUES (?,?,0)",
        )
        .run(owner, accountId);
      this.db
        .prepare(
          "INSERT OR IGNORE INTO account_reminder_devices(account_id,owner,device_id) VALUES (?,?,?)",
        )
        .run(accountId, owner, id);
      if (sessionId)
        this.db
          .prepare(
            "UPDATE account_reminder_devices SET session_id=? WHERE owner=? AND device_id=?",
          )
          .run(sessionId, owner, id);
      if (data) this.syncAccount(accountId, data, now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  removeAccountDevices(accountId, sessionIds = null) {
    const rows = this.db
      .prepare(
        "SELECT owner,device_id,session_id FROM account_reminder_devices WHERE account_id=?",
      )
      .all(accountId);
    const removed = [];
    for (const row of rows) {
      if (sessionIds && row.session_id && !sessionIds.includes(row.session_id))
        continue;
      this.db
        .prepare("DELETE FROM push_deliveries WHERE owner=? AND device_id=?")
        .run(row.owner, row.device_id);
      this.db
        .prepare("DELETE FROM push_devices WHERE owner=? AND device_id=?")
        .run(row.owner, row.device_id);
      this.db
        .prepare(
          "DELETE FROM account_reminder_devices WHERE owner=? AND device_id=?",
        )
        .run(row.owner, row.device_id);
      removed.push(row.owner);
    }
    if (!sessionIds) {
      // Include devices whose account link was interrupted after registration.
      for (const table of ["push_deliveries", "push_devices"])
        this.db
          .prepare(
            `DELETE FROM ${table} WHERE owner IN (SELECT owner FROM account_device_workspaces WHERE account_id=?)`,
          )
          .run(accountId);
    }
    return removed;
  }
  rotateAccountSessions(accountId, keepSession, nextSession) {
    if (keepSession && nextSession)
      this.db
        .prepare(
          "UPDATE account_reminder_devices SET session_id=? WHERE account_id=? AND session_id=?",
        )
        .run(nextSession, accountId, keepSession);
    const rows = this.db
      .prepare(
        "SELECT DISTINCT session_id FROM account_reminder_devices WHERE account_id=? AND (session_id IS NULL OR session_id!=?)",
      )
      .all(accountId, nextSession || "");
    this.removeAccountDevices(
      accountId,
      rows.map((row) => row.session_id),
    );
  }
  // Called inside the account workspace transaction so cancellations and reminder jobs commit together.
  syncAccount(accountId, data, now) {
    const devices = this.db
      .prepare(
        "SELECT d.* FROM push_devices d JOIN account_reminder_devices m ON m.owner=d.owner AND m.device_id=d.device_id WHERE m.account_id=? AND d.enabled=1",
      )
      .all(accountId);
    for (const device of devices) {
      const previous = JSON.parse(device.plan);
      let plan;
      try {
        plan = validateReminderPlan({
          ...previous,
          schedules: data.schedules,
          tasks: reminderTasks(data.tasks),
          profileId: accountId,
        });
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        this.db
          .prepare(
            "UPDATE push_devices SET enabled=0,error=? WHERE owner=? AND device_id=?",
          )
          .run(
            "Account reminder updates are paused. The account exceeds this device’s supported reminder limits.",
            device.owner,
            device.device_id,
          );
        this.db
          .prepare(
            "DELETE FROM push_deliveries WHERE owner=? AND device_id=? AND status!='sent'",
          )
          .run(device.owner, device.device_id);
        continue;
      }
      const hash = planHash(plan);
      if (hash === device.plan_hash) continue;
      this.db
        .prepare(
          "UPDATE push_devices SET plan=?,plan_hash=?,generation=generation+1,synced_at=? WHERE owner=? AND device_id=?",
        )
        .run(JSON.stringify(plan), hash, now, device.owner, device.device_id);
      this.db
        .prepare(
          "DELETE FROM push_deliveries WHERE owner=? AND device_id=? AND status!='sent'",
        )
        .run(device.owner, device.device_id);
    }
  }
  devices() {
    return this.db.prepare("SELECT * FROM push_devices WHERE enabled=1").all();
  }
  enqueue(device, jobs) {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO push_deliveries(owner,device_id,id,generation,due_at,expires_at,payload,status,next_at) VALUES (?,?,?,?,?,?,?,'pending',?)",
    );
    for (const job of jobs)
      insert.run(
        device.owner,
        device.device_id,
        job.id,
        device.generation,
        job.dueAt,
        job.expiresAt,
        JSON.stringify(job.payload),
        job.dueAt,
      );
  }
  claim(now) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          `SELECT j.*,d.subscription FROM push_deliveries j JOIN push_devices d ON d.owner=j.owner AND d.device_id=j.device_id AND d.generation=j.generation
        WHERE d.enabled=1 AND j.next_at<=? AND j.expires_at>? AND (j.status='pending' OR (j.status='sending' AND j.lease_until<=?)) ORDER BY j.due_at LIMIT 1`,
        )
        .get(now, now, now);
      if (row) {
        row.claim = randomUUID();
        row.attempts++;
        this.db
          .prepare(
            "UPDATE push_deliveries SET status='sending',attempts=?,lease_until=?,claim=? WHERE owner=? AND device_id=? AND id=?",
          )
          .run(
            row.attempts,
            now + 60000,
            row.claim,
            row.owner,
            row.device_id,
            row.id,
          );
      }
      this.db.exec("COMMIT");
      return row;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  finish(job, now, error) {
    const where = [job.owner, job.device_id, job.id, job.generation, job.claim];
    if (!error) {
      this.db
        .prepare(
          "UPDATE push_deliveries SET status='sent',lease_until=NULL WHERE owner=? AND device_id=? AND id=? AND generation=? AND claim=?",
        )
        .run(...where);
      this.db
        .prepare(
          "UPDATE push_devices SET last_sent_at=?,error=NULL WHERE owner=? AND device_id=? AND generation=?",
        )
        .run(now, job.owner, job.device_id, job.generation);
      return;
    }
    const expired = [404, 410].includes(error.statusCode);
    const rejected = [400, 401, 403].includes(error.statusCode);
    const message = expired
      ? "This subscription expired. Reconnect background reminders on this device."
      : rejected
        ? "Push delivery was rejected. Check the server configuration and reconnect reminders."
        : "Reminder delivery is delayed. The server will retry while it is still relevant.";
    this.db
      .prepare(
        "UPDATE push_devices SET enabled=CASE WHEN ? THEN 0 ELSE enabled END,error=? WHERE owner=? AND device_id=? AND generation=?",
      )
      .run(
        expired || rejected ? 1 : 0,
        message,
        job.owner,
        job.device_id,
        job.generation,
      );
    const retryAfter = Number(error.headers?.["retry-after"]);
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(120000, retryAfter * 1000)
        : Math.min(120000, 15000 * 2 ** Math.min(3, job.attempts - 1));
    this.db
      .prepare(
        "UPDATE push_deliveries SET status=?,next_at=?,lease_until=NULL WHERE owner=? AND device_id=? AND id=? AND generation=? AND claim=?",
      )
      .run(
        expired || rejected || job.attempts >= 5 ? "failed" : "pending",
        now + delay,
        ...where,
      );
  }
  prune(now) {
    this.db
      .prepare(
        "DELETE FROM push_deliveries WHERE (status!='sent' AND expires_at<=?) OR due_at<?",
      )
      .run(now, now - 30 * 86400000);
  }
  testSlot(key, id, now) {
    const row = this.row(key, id);
    if (!row?.enabled)
      throw new HttpError(
        404,
        "Enable background reminders on this device first.",
      );
    if (row.last_test_at && now - row.last_test_at < 30000)
      throw new HttpError(
        429,
        "Wait a moment before sending another test reminder.",
      );
    this.db
      .prepare(
        "UPDATE push_devices SET last_test_at=? WHERE owner=? AND device_id=?",
      )
      .run(now, row.owner, id);
    return row;
  }
  expire(key, id) {
    this.db
      .prepare(
        "UPDATE push_devices SET enabled=0,error=? WHERE owner=? AND device_id=?",
      )
      .run(
        "This subscription expired. Reconnect background reminders on this device.",
        this.owner(key),
        id,
      );
  }
}
