import type { AppData } from "../model";

export type ConflictChoice = "local" | "account" | "both";
export type ConflictKind =
  "activity" | "task-series" | "planner" | "task" | "field" | "planners";
export type MergeConflictItem = {
  id: string;
  path: string[];
  kind: ConflictKind;
  base: any;
  local: any;
  account: any;
  memberIds?: string[];
  reason?: string;
};
export type WorkspaceReview = {
  id: string;
  base: AppData | null;
  local: AppData;
  account: AppData;
  merged: AppData;
  items: MergeConflictItem[];
};
export type ConflictSelections = {
  reviewId: string;
  choices: Record<string, ConflictChoice>;
};
