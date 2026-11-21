import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./errors.mjs";

const derive = promisify(scrypt),
  lifetime = 30 * 86400000;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const recoveryKey = () =>
  randomBytes(20)
    .toString("hex")
    .match(/.{1,5}/g)
    .join("-");
const recoveryHash = (value) =>
  digest(String(value).replaceAll("-", "").toLowerCase());
const equal = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const usernameOf = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_]{3,32}$/.test(value))
    throw new HttpError(
      400,
      "Use 3–32 letters, numbers or underscores for your username.",
    );
  return value.toLowerCase();
};
const passwordOf = (value) => {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new HttpError(400, "Use a password between 12 and 128 characters.");
  return value;
};
function deviceLabel(agent = "") {
  const ua = String(agent).slice(0, 1024);
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\/|CriOS\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPad/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} on ${os}` : ua ? browser : "Earlier browser session";
}
let hashing = 0;
async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  if (hashing >= 2)
    throw new HttpError(503, "Sign-in is busy. Try again in a moment.");
  hashing++;
  try {
    const result = await derive(password, salt, 32, {
      N: 131072,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    });
    return { salt, hash: result.toString("hex") };
  } finally {
    hashing--;
  }
}

export class Accounts {
  constructor(db, { now = Date.now, secureCookies = false } = {}) {
    this.db = db;
    this.now = now;
    this.secureCookies = secureCookies;
    db.exec(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL,
      password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, workspace_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    ); CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, csrf TEXT NOT NULL,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS account_session_owner ON account_sessions(account_id);
    CREATE TABLE IF NOT EXISTS account_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL);`);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS account_device_workspaces (owner TEXT PRIMARY KEY,account_id TEXT,deleted INTEGER NOT NULL DEFAULT 0)",
    );
    const columns = new Set(
      db
        .prepare("PRAGMA table_info(account_sessions)")
        .all()
        .map((c) => c.name),
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const [name, type] of [
        ["session_id", "TEXT"],
        ["device_label", "TEXT NOT NULL DEFAULT 'Earlier browser session'"],
        ["last_seen_at", "INTEGER NOT NULL DEFAULT 0"],
      ])
        if (!columns.has(name))
          db.exec(`ALTER TABLE account_sessions ADD COLUMN ${name} ${type}`);
      for (const session of db
        .prepare(
          "SELECT token_hash,created_at FROM account_sessions WHERE session_id IS NULL",
        )
        .all())
        db.prepare(
          "UPDATE account_sessions SET session_id=?,last_seen_at=? WHERE token_hash=?",
        ).run(randomUUID(), session.created_at, session.token_hash);
      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS account_session_id ON account_sessions(session_id); COMMIT",
      );
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  limit(ip, username) {
    const now = this.now();
    this.db.prepare("DELETE FROM account_limits WHERE resets_at<=?").run(now);
    for (const [id, maximum] of [
      [digest(`ip:${ip}`), 30],
      [digest(`name:${username}`), 10],
    ]) {
      const row = this.db
        .prepare("SELECT * FROM account_limits WHERE id=?")
        .get(id);
      if (row && row.attempts >= maximum)
        throw new HttpError(
          429,
          "Too many sign-in attempts. Try again in 15 minutes.",
        );
      this.db
        .prepare(
          "INSERT INTO account_limits VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1",
        )
        .run(id, now + 900000);
    }
  }
  session(account, previousToken, userAgent = "") {
    const fresh = this.db
      .prepare("SELECT * FROM accounts WHERE id=?")
      .get(account.id);
    if (
      !fresh ||
      (account.password_hash && fresh.password_hash !== account.password_hash)
    )
      throw new HttpError(401, "Account credentials changed. Sign in again.");
    const now = this.now(),
      token = randomBytes(32).toString("hex"),
      csrf = randomBytes(32).toString("hex"),
      sessionId = randomUUID();
    this.db
      .prepare("DELETE FROM account_sessions WHERE expires_at<=?")
      .run(now);
    if (previousToken)
      this.db
        .prepare("DELETE FROM account_sessions WHERE token_hash=?")
        .run(digest(previousToken));
    this.db
      .prepare(
        "INSERT INTO account_sessions(token_hash,account_id,csrf,expires_at,created_at,session_id,device_label,last_seen_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        digest(token),
        account.id,
        csrf,
        now + lifetime,
        now,
        sessionId,
        deviceLabel(userAgent),
        now,
      );
    this.db
      .prepare(
        "DELETE FROM account_sessions WHERE account_id=? AND token_hash NOT IN (SELECT token_hash FROM account_sessions WHERE account_id=? ORDER BY created_at DESC,rowid DESC LIMIT 10)",
      )
      .run(account.id, account.id);
    return {
      token,
      id: sessionId,
      result: {
        version: 1,
        user: { id: account.id, username: account.username },
        csrfToken: csrf,
        sessionId,
        expiresAt: new Date(now + lifetime).toISOString(),
      },
    };
  }
  cookie(token = "", secure = this.secureCookies) {
    return `mochiplan_session=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${token ? lifetime / 1000 : 0}${secure ? "; Secure" : ""}`;
  }
  token(req) {
    return (
      /(?:^|;\s*)mochiplan_session=([a-f0-9]{64})(?:;|$)/.exec(
        req.headers.cookie || "",
      )?.[1] || ""
    );
  }
  read(req, mutation = false) {
    const row = this.db
      .prepare(
        "SELECT s.*,a.username,a.workspace_key FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE token_hash=? AND expires_at>?",
      )
      .get(digest(this.token(req)), this.now());
    if (!row)
      throw new HttpError(
        401,
        "Sign in to sync your account. Your offline plans are safe.",
      );
    if (mutation && !equal(req.headers["x-mochi-csrf"], row.csrf))
      throw new HttpError(
        403,
        "Refresh your sign-in before making this change.",
      );
    const now = this.now();
    if (now - row.last_seen_at >= 60000) {
      this.db
        .prepare(
          "UPDATE account_sessions SET last_seen_at=? WHERE token_hash=?",
        )
        .run(now, row.token_hash);
      row.last_seen_at = now;
    }
    return row;
  }
  current(req) {
    const row = this.read(req);
    return {
      version: 1,
      user: { id: row.account_id, username: row.username },
      csrfToken: row.csrf,
      sessionId: row.session_id,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }
  async register(body, ip, previousToken, userAgent) {
    const username = usernameOf(body?.username),
      password = passwordOf(body?.password);
    this.limit(ip, username);
    const encoded = await passwordHash(password),
      recoveryCode = recoveryKey();
    const account = { id: randomUUID(), username };
    try {
      this.db
        .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)")
        .run(
          account.id,
          username,
          encoded.salt,
          encoded.hash,
          recoveryHash(recoveryCode),
          randomBytes(32).toString("hex"),
          this.now(),
        );
    } catch (error) {
      if (error.code?.includes("CONSTRAINT") || /UNIQUE/.test(error.message))
        throw new HttpError(
          409,
          "That username is already taken. Choose another or sign in.",
        );
      throw error;
    }
    const session = this.session(account, previousToken, userAgent);
    session.result.recoveryCode = recoveryCode;
    return session;
  }
  async login(body, ip, previousToken, userAgent) {
    const username = usernameOf(body?.username),
      password = passwordOf(body?.password);
    this.limit(ip, username);
    const account = this.db
      .prepare("SELECT * FROM accounts WHERE username=?")
      .get(username);
    const encoded = await passwordHash(
      password,
      account?.salt || "00000000000000000000000000000000",
    );
    if (!account || !equal(encoded.hash, account.password_hash))
      throw new HttpError(401, "The username or password is incorrect.");
    return this.session(account, previousToken, userAgent);
  }
  async recover(body, ip, previousToken, userAgent, rotateDevices = () => {}) {
    const username = usernameOf(body?.username),
      password = passwordOf(body?.password);
    this.limit(ip, username);
    const account = this.db
      .prepare("SELECT * FROM accounts WHERE username=?")
      .get(username);
    const encoded = await passwordHash(password),
      recoveryCode = recoveryKey();
    if (
      !account ||
      !equal(recoveryHash(body?.recoveryCode), account.recovery_hash)
    )
      throw new HttpError(401, "The username or recovery code is incorrect.");
    let session;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE accounts SET salt=?,password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?",
        )
        .run(
          encoded.salt,
          encoded.hash,
          recoveryHash(recoveryCode),
          account.id,
          account.recovery_hash,
        );
      if (!this.db.prepare("SELECT changes() AS n").get().n)
        throw new HttpError(409, "That recovery code has already been used.");
      this.db
        .prepare("DELETE FROM account_sessions WHERE account_id=?")
        .run(account.id);
      rotateDevices(account.id, null, null);
      session = this.session(
        { ...account, password_hash: encoded.hash },
        previousToken,
        userAgent,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    session.result.recoveryCode = recoveryCode;
    return session;
  }
  listSessions(req) {
    const current = this.read(req);
    const sessions = this.db
      .prepare(
        "SELECT session_id,device_label,created_at,last_seen_at,expires_at FROM account_sessions WHERE account_id=? AND expires_at>? ORDER BY last_seen_at DESC,created_at DESC",
      )
      .all(current.account_id, this.now());
    return {
      version: 1,
      sessions: sessions.map((row) => ({
        id: row.session_id,
        device: row.device_label,
        current: row.session_id === current.session_id,
        createdAt: new Date(row.created_at).toISOString(),
        lastActiveAt: new Date(row.last_seen_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
      })),
    };
  }
  revokeSessions(req, target, cleanup = () => {}) {
    const current = this.read(req, true);
    if (target !== "others" && !/^[a-f0-9-]{36}$/i.test(target))
      throw new HttpError(400, "Choose a valid session.");
    const rows =
      target === "others"
        ? this.db
            .prepare(
              "SELECT session_id FROM account_sessions WHERE account_id=? AND session_id!=?",
            )
            .all(current.account_id, current.session_id)
        : this.db
            .prepare(
              "SELECT session_id FROM account_sessions WHERE account_id=? AND session_id=?",
            )
            .all(current.account_id, target);
    if (target !== "others" && !rows.length)
      throw new HttpError(404, "That session is no longer signed in.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const ids = rows.map((row) => row.session_id);
      cleanup(current.account_id, ids);
      for (const id of ids)
        this.db
          .prepare(
            "DELETE FROM account_sessions WHERE account_id=? AND session_id=?",
          )
          .run(current.account_id, id);
      this.db.exec("COMMIT");
      return {
        version: 1,
        revoked: ids.length,
        signedOut: ids.includes(current.session_id),
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async verifyCurrent(req, password, ip) {
    const session = this.read(req, true),
      account = this.db
        .prepare("SELECT * FROM accounts WHERE id=?")
        .get(session.account_id);
    this.limit(ip, account.username);
    const encoded = await passwordHash(passwordOf(password), account.salt);
    if (!equal(encoded.hash, account.password_hash))
      throw new HttpError(400, "Your current password is incorrect.");
    this.assertCurrent(req, account);
    return { account, session };
  }
  assertCurrent(req, account) {
    const current = this.read(req, true),
      fresh = this.db
        .prepare("SELECT password_hash FROM accounts WHERE id=?")
        .get(account.id);
    if (
      current.account_id !== account.id ||
      fresh?.password_hash !== account.password_hash
    )
      throw new HttpError(401, "Account credentials changed. Sign in again.");
  }
  async changePassword(req, body, ip, userAgent, rotateDevices = () => {}) {
    const next = passwordOf(body?.newPassword);
    if (body?.currentPassword === next)
      throw new HttpError(400, "Choose a different password.");
    const { account, session: current } = await this.verifyCurrent(
      req,
      body?.currentPassword,
      ip,
    );
    const encoded = await passwordHash(next),
      recoveryCode = recoveryKey();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.assertCurrent(req, account);
      this.db
        .prepare(
          "UPDATE accounts SET salt=?,password_hash=?,recovery_hash=? WHERE id=?",
        )
        .run(
          encoded.salt,
          encoded.hash,
          recoveryHash(recoveryCode),
          account.id,
        );
      this.db
        .prepare("DELETE FROM account_sessions WHERE account_id=?")
        .run(account.id);
      const session = this.session(
        { ...account, password_hash: encoded.hash },
        null,
        userAgent,
      );
      rotateDevices(account.id, current.session_id, session.id);
      this.db.exec("COMMIT");
      session.result.recoveryCode = recoveryCode;
      return session;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  registerDevice(req, key) {
    const account = this.read(req, true);
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key))
      throw new HttpError(400, "Choose a valid account device.");
    const owner = digest(key),
      previous = this.db
        .prepare("SELECT * FROM account_device_workspaces WHERE owner=?")
        .get(owner);
    if (previous?.deleted)
      throw new HttpError(410, "This account device was removed.");
    if (previous && previous.account_id !== account.account_id)
      throw new HttpError(409, "This device belongs to another account.");
    this.db
      .prepare("INSERT OR IGNORE INTO account_device_workspaces VALUES (?,?,0)")
      .run(owner, account.account_id);
    return { version: 1, registered: true };
  }
  authorizeDevice(req, key) {
    const owner = digest(key),
      binding = this.db
        .prepare("SELECT * FROM account_device_workspaces WHERE owner=?")
        .get(owner);
    if (binding?.deleted)
      throw new HttpError(410, "This account device was deleted.");
    const requestedAccount = req.headers["x-mochi-account"];
    if (!binding && !requestedAccount) return;
    const session = this.read(req);
    if (
      (binding?.account_id || requestedAccount) !== session.account_id ||
      (requestedAccount && requestedAccount !== session.account_id)
    )
      throw new HttpError(
        401,
        "Sign in to use this account’s device backups and reminders.",
      );
    if (!binding)
      this.db
        .prepare("INSERT INTO account_device_workspaces VALUES (?,?,0)")
        .run(owner, session.account_id);
  }
  async deleteAccount(req, body, ip, cleanup = () => []) {
    const { account } = await this.verifyCurrent(
      req,
      body?.currentPassword,
      ip,
    );
    if (body?.confirmation !== account.username)
      throw new HttpError(
        400,
        "Type your username exactly to confirm account deletion.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.assertCurrent(req, account);
      const owners = new Set([
        ...this.db
          .prepare(
            "SELECT owner FROM account_device_workspaces WHERE account_id=?",
          )
          .all(account.id)
          .map((row) => row.owner),
        ...cleanup(account.id),
      ]);
      for (const owner of [digest(account.workspace_key), ...owners]) {
        this.db.prepare("DELETE FROM workspaces WHERE key_hash=?").run(owner);
        this.db
          .prepare("DELETE FROM workspace_versions WHERE key_hash=?")
          .run(owner);
      }
      for (const owner of owners)
        this.db
          .prepare(
            "INSERT INTO account_device_workspaces VALUES (?,NULL,1) ON CONFLICT(owner) DO UPDATE SET account_id=NULL,deleted=1",
          )
          .run(owner);
      this.db
        .prepare("DELETE FROM account_sessions WHERE account_id=?")
        .run(account.id);
      this.db.prepare("DELETE FROM accounts WHERE id=?").run(account.id);
      this.db
        .prepare("DELETE FROM account_limits WHERE id=?")
        .run(digest(`name:${account.username}`));
      this.db.exec("COMMIT");
      return { version: 1, deleted: true };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  logout(req, cleanup) {
    return this.revokeSessions(req, this.read(req, true).session_id, cleanup);
  }
}
