import type { AppData } from "../model";
import type { SyncCheckpoint } from "../storage";
import {
  AccountError,
  type AccountApi,
  type SyncSnapshot,
} from "./accountApi.ts";
import { onThisDevice, same, sharedWorkspace } from "./syncMerge.ts";
import {
  canKeepBoth,
  createWorkspaceReview,
  resolveWorkspaceReview,
  validateReviewedWorkspace,
} from "./syncReview.ts";
import type { ConflictSelections, WorkspaceReview } from "./syncTypes";

export type SyncChoice = "local" | "account" | "both";
type SyncAction = SyncChoice | ConflictSelections | { refresh: true };
export type SyncConflict = {
  remote: SyncSnapshot;
  local: AppData;
  count: number;
  review: WorkspaceReview;
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
  async syncNow(choice?: SyncAction) {
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
    error = "Some changes overlap. Choose how to combine your plans.",
  ) {
    if (!this.data) return;
    const review = createWorkspaceReview(
      this.base?.data || null,
      this.data,
      remote.data || this.data,
    );
    this.publish({
      status: "conflict",
      conflict: {
        remote,
        local: this.data,
        count: review.items.length,
        review,
      },
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
  private async perform(choice?: SyncAction) {
    const remote = await this.options.api.read();
    if (
      !this.running ||
      !this.data ||
      !this.enabled ||
      (!choice && this.paused)
    )
      return;
    const current = this.data;
    if (typeof choice === "object" && "refresh" in choice) {
      const previous = this.state.conflict;
      if (
        previous &&
        remote.revision === previous.remote.revision &&
        same(sharedWorkspace(current), sharedWorkspace(previous.local)) &&
        same(remote.data, previous.remote.data)
      ) {
        this.publish({ status: "conflict", error: "" });
        return;
      }
      this.conflict(
        remote,
        "The comparison is up to date. Review each remaining conflict.",
      );
      return;
    }
    if (
      choice &&
      this.state.conflict &&
      (remote.revision !== this.state.conflict.remote.revision ||
        !same(
          sharedWorkspace(current),
          sharedWorkspace(this.state.conflict.local),
        ) ||
        (typeof choice === "object" &&
          choice.reviewId !== this.state.conflict.review.id))
    ) {
      this.conflict(
        remote,
        "Your plans changed while you were reviewing. The comparison has been refreshed; choose again before applying.",
      );
      return;
    }
    let next = current;
    if (remote.data) {
      if (choice) {
        const review = this.state.conflict?.review;
        if (!review)
          throw Error(
            "Open a current conflict comparison before applying choices.",
          );
        const selections =
          typeof choice === "string"
            ? Object.fromEntries(
                review.items.map((item) => [
                  item.id,
                  choice === "both" && !canKeepBoth(item) ? "local" : choice,
                ]),
              )
            : choice.choices;
        next = onThisDevice(
          resolveWorkspaceReview(review, selections),
          current,
        );
      } else if (same(sharedWorkspace(current), sharedWorkspace(remote.data)))
        next = current;
      else if (!this.base?.data) {
        this.conflict(remote);
        return;
      } else {
        const merged = createWorkspaceReview(
          this.base.data,
          current,
          remote.data,
        );
        if (merged.items.length) {
          this.conflict(remote);
          return;
        }
        next = merged.merged;
      }
    }
    try {
      validateReviewedWorkspace(next);
    } catch {
      this.conflict(
        remote,
        "These changes need review to keep your calendar valid. Review the affected items before applying.",
      );
      return;
    }
    if (!same(current, next)) {
      await this.options.safety(current);
      if (!this.running || this.data !== current || (!choice && this.paused)) {
        this.dirty = true;
        if (choice && this.running && this.data !== current)
          this.conflict(
            remote,
            "This device changed while saving the safety copy. Review the updated comparison.",
          );
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
      conflict: null,
    });
  }
}
