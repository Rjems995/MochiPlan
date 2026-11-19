import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { HttpError } from "./errors.mjs";
import { backupHash, backupSummary } from "./backup-content.mjs";

export class WorkspaceStore {
  constructor(filename, { historyLimit = 30 } = {}) {
    if (
      !Number.isInteger(historyLimit) ||
      historyLimit < 1 ||
      historyLimit > 100
    )
      throw Error("BACKUP_HISTORY_LIMIT must be between 1 and 100.");
    this.historyLimit = historyLimit;
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
    this.db.exec(`CREATE TABLE IF NOT EXISTS workspace_versions (
      key_hash TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL,
      content_hash TEXT NOT NULL, updated_at TEXT NOT NULL, source TEXT NOT NULL,
      planners INTEGER NOT NULL, activities INTEGER NOT NULL, tasks INTEGER NOT NULL,
      PRIMARY KEY (key_hash, revision)
    )`);
    this.insertVersion = this.db.prepare(
      "INSERT INTO workspace_versions VALUES (?,?,?,?,?,?,?,?,?)",
    );
    this.readVersion = this.db.prepare(
      "SELECT * FROM workspace_versions WHERE key_hash = ? AND revision = ?",
    );
    this.listVersions = this.db.prepare(
      "SELECT revision,content_hash,updated_at,source,planners,activities,tasks FROM workspace_versions WHERE key_hash = ? ORDER BY revision DESC LIMIT ?",
    );
    this.pruneVersions = this.db.prepare(
      "DELETE FROM workspace_versions WHERE key_hash = ? AND revision NOT IN (SELECT revision FROM workspace_versions WHERE key_hash = ? ORDER BY revision DESC LIMIT ?)",
    );
    // Preserve the latest backup from databases created before history existed.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const legacy = this.db
        .prepare(
          "SELECT w.* FROM workspaces w LEFT JOIN workspace_versions v ON w.key_hash=v.key_hash AND w.revision=v.revision WHERE v.revision IS NULL",
        )
        .all();
      for (const row of legacy) {
        const data = JSON.parse(row.data),
          summary = backupSummary(data);
        this.insertVersion.run(
          row.key_hash,
          row.revision,
          row.data,
          backupHash(data),
          row.updated_at,
          "legacy",
          summary.planners,
          summary.activities,
          summary.tasks,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }
  hash(key) {
    return createHash("sha256").update(key).digest("hex");
  }
  get(key) {
    const row = this.read.get(this.hash(key));
    return row ? this.getVersion(key, row.revision) : null;
  }
  metadata(row) {
    return {
      revision: row.revision,
      updatedAt: row.updated_at,
      contentHash: row.content_hash,
      source: row.source,
      summary: {
        planners: row.planners,
        activities: row.activities,
        tasks: row.tasks,
      },
    };
  }
  history(key) {
    const versions = this.listVersions
      .all(this.hash(key), this.historyLimit)
      .map((row) => this.metadata(row));
    return {
      version: 1,
      revision: versions[0]?.revision || 0,
      latest: versions[0] || null,
      versions,
      retentionLimit: this.historyLimit,
    };
  }
  getVersion(key, revision) {
    const row = this.readVersion.get(this.hash(key), revision);
    return row
      ? { version: 1, ...this.metadata(row), data: JSON.parse(row.data) }
      : null;
  }
  save(key, expectedRevision, data, source = "manual", afterWrite) {
    if (!["manual", "automatic", "before-restore", "restore"].includes(source))
      throw new HttpError(400, "Choose a valid backup source.");
    const text = JSON.stringify(data),
      contentHash = backupHash(data),
      summary = backupSummary(data);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const hash = this.hash(key);
      const current = this.read.get(hash);
      if ((current?.revision || 0) !== expectedRevision)
        throw new HttpError(
          409,
          "A newer server backup exists. Check it before saving again.",
        );
      const previous = current && this.readVersion.get(hash, current.revision);
      if (
        previous &&
        previous.content_hash === contentHash &&
        ["automatic", "before-restore"].includes(source)
      ) {
        afterWrite?.();
        this.db.exec("COMMIT");
        return { version: 1, ...this.metadata(previous), unchanged: true };
      }
      const revision = expectedRevision + 1;
      const updatedAt = new Date().toISOString();
      this.write.run(hash, revision, text, updatedAt);
      this.insertVersion.run(
        hash,
        revision,
        text,
        contentHash,
        updatedAt,
        source,
        summary.planners,
        summary.activities,
        summary.tasks,
      );
      this.pruneVersions.run(hash, hash, this.historyLimit);
      afterWrite?.();
      this.db.exec("COMMIT");
      return { version: 1, revision, updatedAt, contentHash, source, summary };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
