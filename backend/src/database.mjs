import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { HttpError } from "./errors.mjs";

export class WorkspaceStore {
  constructor(filename) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS workspaces (key_hash TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);",
    );
    this.read = this.db.prepare(
      "SELECT revision, data, updated_at FROM workspaces WHERE key_hash = ?",
    );
    this.write = this.db.prepare(
      "INSERT INTO workspaces (key_hash,revision,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(key_hash) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at",
    );
  }
  hash(key) {
    return createHash("sha256").update(key).digest("hex");
  }
  get(key) {
    const row = this.read.get(this.hash(key));
    return row
      ? {
          version: 1,
          revision: row.revision,
          data: JSON.parse(row.data),
          updatedAt: row.updated_at,
        }
      : null;
  }
  save(key, expectedRevision, data) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const hash = this.hash(key);
      const current = this.read.get(hash);
      if ((current?.revision || 0) !== expectedRevision)
        throw new HttpError(
          409,
          "A newer server backup exists. Check it before saving again.",
        );
      const revision = expectedRevision + 1;
      const updatedAt = new Date().toISOString();
      this.write.run(hash, revision, JSON.stringify(data), updatedAt);
      this.db.exec("COMMIT");
      return { version: 1, revision, updatedAt };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
