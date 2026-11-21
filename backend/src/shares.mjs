import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { equal, passwordHash } from "./credentials.mjs";
import { sharedSnapshot } from "./shared-snapshot.mjs";
import { HttpError } from "./errors.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const unavailable = () =>
  new HttpError(410, "This planner link has expired or been revoked.");
function seal(token, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  return Buffer.concat([
    iv,
    cipher.update(token),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
}
function unseal(value, key) {
  const bytes = Buffer.from(value, "base64url"),
    cipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      bytes.subarray(0, 12),
    );
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    cipher.update(bytes.subarray(12, -16)),
    cipher.final(),
  ]).toString();
}
export class PlannerShares {
  constructor(db, { now = Date.now } = {}) {
    this.db = db;
    this.now = now;
    db.exec(`CREATE TABLE IF NOT EXISTS planner_shares (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, account_id TEXT, schedule_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE, token_cipher TEXT NOT NULL, snapshot TEXT,
      name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0, password_salt TEXT, password_hash TEXT,
      revision INTEGER NOT NULL DEFAULT 1
    ); CREATE INDEX IF NOT EXISTS planner_share_owner ON planner_shares(owner,schedule_id);
    CREATE TABLE IF NOT EXISTS planner_share_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL);`);
  }
  expiry(value) {
    if (value === null) return null;
    const date = typeof value === "string" ? Date.parse(value) : NaN;
    if (
      !Number.isFinite(date) ||
      date <= this.now() ||
      date > this.now() + 366 * 86400000
    )
      throw new HttpError(
        400,
        "Choose an expiration within the next year, or no expiration.",
      );
    return date;
  }
  metadata(row, key) {
    return {
      id: row.id,
      scheduleId: row.schedule_id,
      name: row.name,
      token: row.revoked ? null : unseal(row.token_cipher, key),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      expiresAt:
        row.expires_at === null ? null : new Date(row.expires_at).toISOString(),
      revoked: !!row.revoked,
      expired: row.expires_at !== null && row.expires_at <= this.now(),
      passwordProtected: !!row.password_hash,
      revision: row.revision,
      ...(row.snapshot
        ? {
            includeLocations: JSON.parse(row.snapshot).includeLocations,
            includeDetails: JSON.parse(row.snapshot).includeDetails,
          }
        : {}),
    };
  }
  list(owner, scheduleId) {
    const rows = this.db
      .prepare(
        "SELECT * FROM planner_shares WHERE owner=? AND (? IS NULL OR schedule_id=?) ORDER BY created_at DESC,rowid DESC",
      )
      .all(digest(owner.key), scheduleId ?? null, scheduleId ?? null);
    return {
      version: 1,
      shares: rows.map((row) => this.metadata(row, owner.key)),
    };
  }
  owned(owner, id) {
    const row = this.db
      .prepare("SELECT * FROM planner_shares WHERE id=? AND owner=?")
      .get(id, digest(owner.key));
    if (!row) throw new HttpError(404, "That shared planner was not found.");
    return row;
  }
  async save(owner, body, reauthorize, id = null) {
    const previous = id ? this.owned(owner, id) : null;
    if (previous?.revoked) throw unavailable();
    if (previous && body?.revision !== previous.revision)
      throw new HttpError(
        409,
        "This link changed on another device. Refresh its settings.",
      );
    const snapshot = sharedSnapshot(body),
      expires = this.expiry(body.expiresAt);
    if (previous && snapshot.schedule.id !== previous.schedule_id)
      throw new HttpError(
        400,
        "Update the planner originally shared by this link.",
      );
    let encoded;
    if (body.password === null) encoded = { salt: null, hash: null };
    else if (body.password === undefined && previous)
      encoded = { salt: previous.password_salt, hash: previous.password_hash };
    else {
      if (
        typeof body.password !== "string" ||
        body.password.length < 12 ||
        body.password.length > 128
      )
        throw new HttpError(
          400,
          "Use a link password between 12 and 128 characters.",
        );
      encoded = await passwordHash(body.password);
    }
    reauthorize();
    const now = this.now();
    if (expires !== null && expires <= now) throw unavailable();
    if (previous) {
      const result = this.db
        .prepare(
          "UPDATE planner_shares SET snapshot=?,name=?,updated_at=?,expires_at=?,password_salt=?,password_hash=?,revision=revision+1 WHERE id=? AND owner=? AND revoked=0 AND revision=?",
        )
        .run(
          JSON.stringify(snapshot),
          snapshot.schedule.name,
          now,
          expires,
          encoded.salt,
          encoded.hash,
          id,
          digest(owner.key),
          previous.revision,
        );
      if (!result.changes)
        throw new HttpError(
          409,
          "This link changed or was revoked. Refresh its settings.",
        );
    } else {
      if (
        this.db
          .prepare(
            "SELECT count(*) AS n FROM planner_shares WHERE owner=? AND revoked=0",
          )
          .get(digest(owner.key)).n >= 20
      )
        throw new HttpError(
          409,
          "Revoke an existing link before creating another. You can keep 20 links per workspace.",
        );
      id = randomUUID();
      const token = randomBytes(32).toString("base64url");
      this.db
        .prepare(
          "INSERT INTO planner_shares(id,owner,account_id,schedule_id,token_hash,token_cipher,snapshot,name,created_at,updated_at,expires_at,password_salt,password_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          digest(owner.key),
          owner.accountId || null,
          snapshot.schedule.id,
          digest(token),
          seal(token, owner.key),
          JSON.stringify(snapshot),
          snapshot.schedule.name,
          now,
          now,
          expires,
          encoded.salt,
          encoded.hash,
        );
    }
    return {
      version: 1,
      share: this.metadata(this.owned(owner, id), owner.key),
    };
  }
  revoke(owner, id) {
    this.owned(owner, id);
    this.db
      .prepare(
        "UPDATE planner_shares SET revoked=1,snapshot=NULL,token_cipher='',password_salt=NULL,password_hash=NULL,revision=revision+1 WHERE id=? AND owner=?",
      )
      .run(id, digest(owner.key));
    return { version: 1, revoked: true };
  }
  row(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new HttpError(404, "This planner link was not found.");
    const row = this.db
      .prepare("SELECT * FROM planner_shares WHERE token_hash=?")
      .get(digest(token));
    if (!row) throw new HttpError(404, "This planner link was not found.");
    if (
      row.revoked ||
      (row.expires_at !== null && row.expires_at <= this.now())
    )
      throw unavailable();
    return row;
  }
  signature(row, token, expires) {
    return createHmac("sha256", row.password_hash)
      .update(`${token}:${expires}`)
      .digest("base64url");
  }
  read(token, access) {
    const row = this.row(token);
    if (row.password_hash) {
      const [expires, signature] = String(access || "").split(".");
      if (
        !/^\d{13}$/.test(expires) ||
        Number(expires) <= this.now() ||
        !equal(signature, this.signature(row, token, expires))
      )
        return { version: 1, passwordRequired: true };
    }
    return this.payload(row);
  }
  payload(row) {
    return {
      version: 1,
      checkedAt: new Date(this.now()).toISOString(),
      ...JSON.parse(row.snapshot),
      updatedAt: new Date(row.updated_at).toISOString(),
      expiresAt:
        row.expires_at === null ? null : new Date(row.expires_at).toISOString(),
      revision: row.revision,
    };
  }
  limit(token, ip) {
    const now = this.now();
    this.db
      .prepare("DELETE FROM planner_share_limits WHERE resets_at<=?")
      .run(now);
    for (const [id, maximum] of [
      [digest(`ip:${ip}`), 40],
      [digest(`${token}:${ip}`), 10],
    ]) {
      const row = this.db
        .prepare("SELECT * FROM planner_share_limits WHERE id=?")
        .get(id);
      if (row?.attempts >= maximum)
        throw new HttpError(
          429,
          "Too many password attempts. Try again in 15 minutes.",
        );
      this.db
        .prepare(
          "INSERT INTO planner_share_limits VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1",
        )
        .run(id, now + 900000);
    }
  }
  async unlock(token, password, ip) {
    const row = this.row(token);
    if (!row.password_hash) return this.payload(row);
    this.limit(token, ip);
    if (typeof password !== "string" || password.length > 128)
      throw new HttpError(400, "Enter a valid link password.");
    const encoded = await passwordHash(password, row.password_salt);
    const current = this.row(token);
    if (
      current.password_hash !== row.password_hash ||
      !equal(encoded.hash, row.password_hash)
    )
      throw new HttpError(403, "That link password is incorrect.");
    const expires = String(
      Math.min(this.now() + 30 * 60000, current.expires_at ?? Infinity),
    );
    return {
      ...this.payload(current),
      accessToken: `${expires}.${this.signature(current, token, expires)}`,
    };
  }
  removeAccount(id) {
    this.db.prepare("DELETE FROM planner_shares WHERE account_id=?").run(id);
  }
}
