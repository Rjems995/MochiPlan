import type { AppData } from "../model";
import type { SyncCheckpoint } from "../storage";
import { validateBackup } from "../storage.ts";
import {
  AccountError,
  type AccountApi,
  type SyncSnapshot,
} from "./accountApi.ts";
import {
  keepBothWorkspaces,
  mergeWorkspace,
  onThisDevice,
  same,
  sharedWorkspace,
} from "./syncMerge.ts";

export type SyncChoice = "local" | "account" | "both";
export type SyncConflict = {
  remote: SyncSnapshot;
  local: AppData;
  count: number;
};
export type SyncState = {
  status:
    | "off"
    | "pending"
    | "syncing"
    | "synced"
    | "offline"
    | "error"
    | "conflict"
    | "auth";
  busy: boolean;
  error: string;
  lastSyncedAt: string | null;
  conflict: SyncConflict | null;
};
type Options = {
  accountId: string;
  api: Pick<AccountApi, "read" | "write">;
  checkpoint: SyncCheckpoint | null;
  commit: (checkpoint: SyncCheckpoint, data?: AppData) => Promise<void>;
  saveLocal: (data: AppData) => Promise<void>;
  safety: (data: AppData) => Promise<unknown>;
  apply: (expected: AppData, next: AppData) => boolean;
};
export class WorkspaceSync {
  private options: Options;
  private state: SyncState;
  private base: SyncCheckpoint | null;
  private data: AppData | null = null;
  private ready = false;
  private enabled = true;
  private paused = false;
  private online = true;
  private running = false;
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private failures = 0;
  private operation: Promise<void> | null = null;
  constructor(options: Options) {
    this.options = options;
    this.base = options.checkpoint;
    this.state = {
      status: "pending",
      busy: false,
      error: "",
      lastSyncedAt: options.checkpoint?.syncedAt || null,
      conflict: null,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(value: Partial<SyncState>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((fn) => fn());
  }
  start() {
    this.running = true;
    this.schedule();
  }
  stop() {
    this.running = false;
    clearTimeout(this.timer);
  }
  observe(data: AppData | null, ready: boolean) {
    if (data !== this.data) this.dirty = true;
    this.data = data;
    this.ready = ready;
    this.schedule();
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.publish({ status: enabled ? "pending" : "off" });
    this.schedule();
  }
  setOnline(online: boolean) {
    this.online = online;
    this.schedule();
  }
  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.schedule();
  }
  retry() {
    if (this.state.conflict) return;
    this.failures = 0;
    this.publish({ error: "" });
    this.schedule(0);
  }
  private schedule(delay = 1500) {
    clearTimeout(this.timer);
    if (!this.running || this.operation) return;
    if (!this.enabled) {
      this.publish({ status: "off" });
      return;
    }
    if (!this.online) {
      this.publish({ status: "offline" });
      return;
    }
    if (
      this.paused ||
      !this.data ||
      !this.ready ||
      this.state.conflict ||
      this.state.status === "auth"
    )
      return;
    if (this.dirty) this.publish({ status: "pending" });
    this.timer = setTimeout(() => void this.syncNow(), delay);
  }
  async syncNow(choice?: SyncChoice) {
    if (this.operation) return this.operation;
    if (
      !this.running ||
      !this.enabled ||
      !this.online ||
      (!choice && this.paused) ||
      !this.data ||
      !this.ready ||
      (this.state.conflict && !choice)
    )
      return;
    this.dirty = false;
    clearTimeout(this.timer);
    this.publish({ busy: true, status: "syncing", error: "" });
    this.operation = this.perform(choice)
      .catch((error) => {
        if (!this.running) return;
        this.failures++;
        this.publish({
          status:
            error instanceof AccountError && error.status === 401
              ? "auth"
              : "error",
          error:
            error instanceof Error
              ? error.message
              : "Sync is delayed. Your offline plans are safe.",
        });
      })
      .finally(() => {
        this.operation = null;
        if (!this.running) return;
        this.publish({ busy: false });
        this.schedule(
          this.failures
            ? Math.min(300000, 10000 * 2 ** Math.min(5, this.failures - 1))
            : this.dirty
              ? 1500
              : 15000,
        );
      });
    return this.operation;
  }
  private conflict(
    remote: SyncSnapshot,
    count = 1,
    error = "Some changes overlap. Choose how to combine your plans.",
  ) {
    if (!this.data) return;
    this.publish({
      status: "conflict",
      conflict: { remote, local: this.data, count },
      error,
    });
  }
  private async checkpoint(remote: SyncSnapshot, local?: AppData) {
    const checkpoint = {
      id: this.options.accountId,
      revision: remote.revision,
      data: remote.data,
      syncedAt: new Date().toISOString(),
    };
    await this.options.commit(checkpoint, local);
    this.base = checkpoint;
  }
  private async perform(choice?: SyncChoice) {
    const remote = await this.options.api.read();
    if (
      !this.running ||
      !this.data ||
      !this.enabled ||
      (!choice && this.paused)
    )
      return;
    const current = this.data;
    if (
      choice &&
      this.state.conflict &&
      remote.revision !== this.state.conflict.remote.revision
    ) {
      this.conflict(
        remote,
        1,
        "The account changed again while you were reviewing. Review the newest version before choosing.",
      );
      return;
    }
    let next = current;
    if (remote.data) {
      if (choice)
        next =
          choice === "account"
            ? onThisDevice(remote.data, current)
            : choice === "both"
              ? keepBothWorkspaces(current, remote.data)
              : current;
      else if (same(sharedWorkspace(current), sharedWorkspace(remote.data)))
        next = current;
      else if (!this.base?.data) {
        this.conflict(remote);
        return;
      } else {
        const merged = mergeWorkspace(this.base.data, current, remote.data);
        if (merged.conflicts.length) {
          this.conflict(remote, merged.conflicts.length);
          return;
        }
        next = merged.data;
      }
    }
    try {
      validateBackup({ version: 1, data: next });
    } catch {
      this.conflict(
        remote,
        1,
        "These changes need review to keep the calendar valid. Choose which workspace to keep, or keep both sets of plans.",
      );
      return;
    }
    if (!same(current, next)) {
      await this.options.safety(current);
      if (!this.running || this.data !== current || (!choice && this.paused)) {
        this.dirty = true;
        return;
      }
      if (!this.options.apply(current, next)) {
        this.dirty = true;
        return;
      }
      this.data = next;
      this.dirty = false;
      await this.checkpoint(remote, next);
    } else await this.checkpoint(remote);
    if (!this.running || !this.enabled || !this.data) return;
    this.publish({ conflict: null });
    // Edits made during a request descend from the merged local workspace and remain queued.
    const upload = this.data,
      shared = sharedWorkspace(upload);
    if (!remote.data || !same(shared, sharedWorkspace(remote.data))) {
      await this.options.saveLocal(upload);
      if (!this.running || !this.enabled) return;
      try {
        const saved = await this.options.api.write(shared, remote.revision);
        if (!this.running) return;
        await this.checkpoint({ revision: saved.revision, data: shared });
      } catch (error) {
        if (error instanceof AccountError && error.status === 409) {
          if (choice)
            this.conflict(
              await this.options.api.read(),
              1,
              "The account changed again. Your plans are safe; review the latest version.",
            );
          else this.dirty = true;
          return;
        }
        throw error;
      }
    }
    this.failures = 0;
    this.publish({
      status: this.data === upload ? "synced" : "pending",
      error: "",
      lastSyncedAt: this.base?.syncedAt || null,
    });
  }
}
