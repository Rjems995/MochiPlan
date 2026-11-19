import type { AppData } from "../model";
import { backupFingerprint } from "./backupFingerprint.ts";
import {
  BackupError,
  type BackupMetadata,
  type BackupSnapshot,
  type BackupTransport,
} from "./backupTypes.ts";

export type BackupStatus =
  "off" | "pending" | "saving" | "saved" | "offline" | "error" | "conflict";
export type AutomaticBackupState = {
  enabled: boolean;
  status: BackupStatus;
  busy: boolean;
  lastSuccessful: BackupMetadata | null;
  error: string;
};
type Options = {
  transport: BackupTransport;
  enabled: boolean;
  checkpoint?: BackupMetadata | null;
  onCheckpoint?: (metadata: BackupMetadata) => void;
  now?: () => number;
  setTimer?: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};
const conflictMessage =
  "A different server backup exists. Review history, restore a version, or save this workspace manually before automatic backups continue.";

/** One writer for automatic, manual and restore operations. Local edits stay independent. */
export class AutomaticBackups {
  private options: Options;
  private state: AutomaticBackupState;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private queue: Promise<unknown> = Promise.resolve();
  private jobs = 0;
  private data: AppData | null = null;
  private ready = false;
  private online = true;
  private paused = false;
  private running = false;
  private dirty = false;
  private checked = false;
  private changedAt = 0;
  private lastAutoAt = -Infinity;
  private retryAt = 0;
  private failures = 0;

  constructor(options: Options) {
    this.options = options;
    this.state = {
      enabled: options.enabled,
      status: options.enabled ? "pending" : "off",
      busy: false,
      lastSuccessful: options.checkpoint || null,
      error: "",
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  private publish(patch: Partial<AutomaticBackupState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private clear() {
    if (this.timer !== undefined)
      (this.options.clearTimer || clearTimeout)(this.timer);
    this.timer = undefined;
  }
  start() {
    this.running = true;
    this.schedule();
  }
  stop() {
    this.running = false;
    this.clear();
  }
  observe(data: AppData | null, locallySaved: boolean) {
    if (data !== this.data) {
      this.data = data;
      this.dirty = true;
      this.changedAt = this.now();
    }
    this.ready = locallySaved;
    this.schedule();
  }
  setEnabled(enabled: boolean) {
    this.publish({ enabled, error: "", status: enabled ? "pending" : "off" });
    this.dirty = true;
    this.retryAt = 0;
    this.schedule();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.schedule();
  }
  setOnline(online: boolean) {
    const reconnecting = online && !this.online;
    this.online = online;
    if (reconnecting) this.retry();
    else this.schedule();
  }
  retry() {
    if (this.state.status === "conflict") return;
    this.retryAt = 0;
    this.dirty = true;
    this.checked = false;
    this.schedule();
  }
  private schedule() {
    this.clear();
    if (!this.running || this.jobs) return;
    if (!this.state.enabled) {
      if (this.state.status !== "off") this.publish({ status: "off" });
      return;
    }
    if (this.state.status === "conflict") return;
    if (!this.online) {
      if (this.state.status !== "offline") this.publish({ status: "offline" });
      return;
    }
    if (!this.data || !this.dirty || this.paused || !this.ready) return;
    if (this.state.status !== "error") this.publish({ status: "pending" });
    const due = Math.max(
      this.changedAt + 3000,
      this.lastAutoAt + 60000,
      this.retryAt,
    );
    this.timer = (this.options.setTimer || setTimeout)(
      () => {
        this.timer = undefined;
        void this.automatic();
      },
      Math.max(0, due - this.now()),
    );
  }
  private remember(metadata: BackupMetadata) {
    this.checked = true;
    this.failures = 0;
    this.retryAt = 0;
    this.publish({ lastSuccessful: metadata, status: "saved", error: "" });
    try {
      this.options.onCheckpoint?.(metadata);
    } catch {
      /* A server success remains valid if device storage is full. */
    }
  }
  private failed(error: unknown) {
    const conflict = error instanceof BackupError && error.status === 409;
    this.dirty = true;
    this.checked = false;
    this.failures++;
    this.retryAt =
      this.now() +
      Math.min(300000, 10000 * 2 ** Math.min(5, this.failures - 1));
    this.publish({
      status: conflict ? "conflict" : "error",
      error: conflict
        ? conflictMessage
        : error instanceof Error
          ? error.message
          : "The server backup could not be saved. Your local plans are safe.",
    });
  }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.jobs++;
    this.clear();
    this.publish({ busy: true });
    const job = this.queue.catch(() => {}).then(operation);
    this.queue = job.catch(() => {});
    return job.finally(() => {
      this.jobs--;
      this.publish({ busy: this.jobs > 0 });
      this.schedule();
    });
  }
  private async automatic() {
    if (
      !this.data ||
      !this.state.enabled ||
      !this.online ||
      this.paused ||
      !this.ready ||
      !this.running
    )
      return;
    const data = this.data;
    this.dirty = false;
    await this.exclusive(async () => {
      try {
        this.publish({ status: "saving" });
        const hash = await backupFingerprint(data);
        if (this.checked && hash === this.state.lastSuccessful?.contentHash) {
          this.publish({ status: "saved", error: "" });
          return;
        }
        const history = await this.options.transport.history();
        if (history.latest?.contentHash === hash) {
          this.remember(history.latest);
          return;
        }
        const checkpoint = this.state.lastSuccessful;
        if (
          history.latest &&
          (!checkpoint ||
            history.latest.revision !== checkpoint.revision ||
            history.latest.contentHash !== checkpoint.contentHash)
        )
          throw new BackupError(409, conflictMessage);
        if (
          !this.state.enabled ||
          !this.online ||
          this.paused ||
          !this.running
        ) {
          this.dirty = true;
          return;
        }
        const result = await this.options.transport.save(
          data,
          history.revision,
          "automatic",
        );
        this.lastAutoAt = this.now();
        this.remember(result);
      } catch (error) {
        this.failed(error);
      }
    });
  }
  backupNow(data: AppData) {
    return this.exclusive(async () => {
      this.publish({ status: "saving", error: "" });
      try {
        const history = await this.options.transport.history();
        const result = await this.options.transport.save(
          data,
          history.revision,
          "manual",
        );
        this.lastAutoAt = this.now();
        this.remember(result);
        if (this.data === data) this.dirty = false;
        return result;
      } catch (error) {
        this.failed(error);
        throw error;
      }
    });
  }
  restore(snapshot: BackupSnapshot, current: AppData, expectedHead: number) {
    return this.exclusive(async () => {
      this.publish({ status: "saving", error: "" });
      try {
        const history = await this.options.transport.history();
        if (history.revision !== expectedHead)
          throw new BackupError(409, conflictMessage);
        const safety = await this.options.transport.save(
          current,
          expectedHead,
          "before-restore",
        );
        this.remember(safety);
        const restored = await this.options.transport.save(
          snapshot.data,
          safety.revision,
          "restore",
        );
        this.remember(restored);
        this.lastAutoAt = this.now();
        return restored;
      } catch (error) {
        this.failed(error);
        throw error;
      }
    });
  }
}
