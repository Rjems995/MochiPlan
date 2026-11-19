import { createContext, useContext } from "react";
import type { AppPlatformController } from "../hooks/useAppPlatform";
import type { AccountsController } from "../hooks/useAccounts";
import type { BackgroundRemindersController } from "../hooks/useBackgroundReminders";
import type { BackupsController } from "../hooks/useBackups";
import type { FeedbackController } from "../hooks/useFeedback";
import type { NavigationController } from "../hooks/useNavigation";
import type { PlannerManagerController } from "../hooks/usePlannerManager";
import type { ScheduleCollectionController } from "../hooks/useScheduleCollection";
import type { ScheduleEditorController } from "../hooks/useScheduleEditor";
import type { TaskManagerController } from "../hooks/useTaskManager";
import type { TemplateBrowserController } from "../hooks/useTemplateBrowser";
import type { WorkspaceController } from "../hooks/useWorkspace";
import type { AppData, Preferences, Schedule } from "../model";
export type AppContextValue = {
  data: AppData;
  active: Schedule;
  p: Preferences;
  workspace: WorkspaceController;
  feedback: FeedbackController;
  navigation: NavigationController;
  platform: AppPlatformController;
  accounts: AccountsController;
  reminders: BackgroundRemindersController;
  studio: ScheduleEditorController & {
    canvasProps: NonNullable<ScheduleEditorController["canvasProps"]>;
  };
  planners: PlannerManagerController;
  collection: ScheduleCollectionController;
  tasks: TaskManagerController;
  templateBrowser: TemplateBrowserController;
  backups: BackupsController;
};
export const AppContext = createContext<AppContextValue | null>(null);
export function useAppContext() {
  const app = useContext(AppContext);
  if (!app) throw Error("App components must be inside AppContext.");
  return app;
}
