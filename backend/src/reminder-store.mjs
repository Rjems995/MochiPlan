import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "./errors.mjs";
import { planHash } from "./reminder-plan.mjs";

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
    ); CREATE INDEX IF NOT EXISTS push_due ON push_deliveries(status,next_at);`);
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
