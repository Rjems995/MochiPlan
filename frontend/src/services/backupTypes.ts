import type { AppData } from "../model";

export type BackupSource =
  "automatic" | "manual" | "before-restore" | "restore" | "legacy";
export type BackupMetadata = {
  revision: number;
  updatedAt: string;
  contentHash: string;
  source: BackupSource;
  summary: { planners: number; activities: number; tasks: number };
};
export type BackupSnapshot = BackupMetadata & { version: 1; data: AppData };
export type BackupHistory = {
  version: 1;
  revision: number;
  latest: BackupMetadata | null;
  versions: BackupMetadata[];
  retentionLimit: number;
};
export type BackupTransport = {
  history(): Promise<BackupHistory>;
  snapshot(revision?: number): Promise<BackupSnapshot>;
  save(
    data: AppData,
    revision: number,
    source: Exclude<BackupSource, "legacy">,
  ): Promise<BackupMetadata>;
};
export class BackupError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
