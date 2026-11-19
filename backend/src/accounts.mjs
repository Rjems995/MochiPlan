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
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
  session(account, previousToken) {
    const now = this.now(),
      token = randomBytes(32).toString("hex"),
      csrf = randomBytes(32).toString("hex");
    this.db
      .prepare("DELETE FROM account_sessions WHERE expires_at<=?")
      .run(now);
    if (previousToken)
      this.db
        .prepare("DELETE FROM account_sessions WHERE token_hash=?")
        .run(digest(previousToken));
    this.db
      .prepare("INSERT INTO account_sessions VALUES (?,?,?,?,?)")
      .run(digest(token), account.id, csrf, now + lifetime, now);
    this.db
      .prepare(
        "DELETE FROM account_sessions WHERE account_id=? AND token_hash NOT IN (SELECT token_hash FROM account_sessions WHERE account_id=? ORDER BY created_at DESC,rowid DESC LIMIT 10)",
      )
      .run(account.id, account.id);
    return {
      token,
      result: {
        version: 1,
        user: { id: account.id, username: account.username },
        csrfToken: csrf,
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
    return row;
  }
  current(req) {
    const row = this.read(req);
    return {
      version: 1,
      user: { id: row.account_id, username: row.username },
      csrfToken: row.csrf,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }
  async register(body, ip, previousToken) {
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
    const session = this.session(account, previousToken);
    session.result.recoveryCode = recoveryCode;
    return session;
  }
  async login(body, ip, previousToken) {
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
    return this.session(account, previousToken);
  }
  async recover(body, ip, previousToken) {
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
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const session = this.session(account, previousToken);
    session.result.recoveryCode = recoveryCode;
    return session;
  }
  logout(req) {
    this.read(req, true);
    this.db
      .prepare("DELETE FROM account_sessions WHERE token_hash=?")
      .run(digest(this.token(req)));
  }
}
