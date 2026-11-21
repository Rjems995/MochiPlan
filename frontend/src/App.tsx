import { ScheduleCanvas } from "./components/ScheduleCanvas";
import { useEffect } from "react";

import { ActivityDialogs } from "./components/ActivityDialogs";
import { AccountDialogs } from "./components/AccountDialogs";
import { AppShell } from "./components/AppShell";
import { BackupHistoryDialog } from "./components/BackupHistoryDialog";
import { FeedbackToast } from "./components/FeedbackToast";
import { HelpDialogs } from "./components/HelpDialogs";
import { PlannerDialogs } from "./components/PlannerDialogs";
import { RestoreWorkspaceDialog } from "./components/RestoreWorkspaceDialog";
import { TaskDialog } from "./components/TaskDialog";
import { TemplateDialog } from "./components/TemplateDialog";
import { WorkspaceLoading } from "./components/WorkspaceLoading";
import { AppContext } from "./context/AppContext";
import { useAppPlatform } from "./hooks/useAppPlatform";
import { useBackgroundReminders } from "./hooks/useBackgroundReminders";
import { useReminderNavigation } from "./hooks/useReminderNavigation";
import { useBackups } from "./hooks/useBackups";
import { useFeedback } from "./hooks/useFeedback";
import { useNavigation } from "./hooks/useNavigation";
import { usePlannerManager } from "./hooks/usePlannerManager";
import { useScheduleCollection } from "./hooks/useScheduleCollection";
import { useScheduleEditor } from "./hooks/useScheduleEditor";
import { useTaskManager } from "./hooks/useTaskManager";
import { useTemplateBrowser } from "./hooks/useTemplateBrowser";
import { useWorkspace } from "./hooks/useWorkspace";
import type { WorkspaceController } from "./hooks/useWorkspace";
import { useAccounts, type AccountsController } from "./hooks/useAccounts";
import { DashboardPage } from "./pages/DashboardPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StudioPage } from "./pages/StudioPage";
import { TasksPage } from "./pages/TasksPage";
import { TemplatesPage } from "./pages/TemplatesPage";
const pages = {
  studio: StudioPage,
  dashboard: DashboardPage,
  schedules: SchedulesPage,
  templates: TemplatesPage,
  tasks: TasksPage,
  settings: SettingsPage,
};
export default function App() {
  const feedback = useFeedback();
  const workspace = useWorkspace(feedback.notify);
  const accounts = useAccounts(workspace, feedback.notify);
  return (
    <WorkspaceApplication
      key={workspace.profileId || "device"}
      workspace={workspace}
      accounts={accounts}
      feedback={feedback}
    />
  );
}
function WorkspaceApplication({
  workspace,
  accounts,
  feedback,
}: {
  workspace: WorkspaceController;
  accounts: AccountsController;
  feedback: ReturnType<typeof useFeedback>;
}) {
  const navigation = useNavigation();
  const reminders = useBackgroundReminders(
    workspace.data,
    workspace.saved,
    feedback.notify,
  );
  useEffect(() => {
    if (
      accounts.signedIn &&
      workspace.profileId &&
      reminders.enabled &&
      reminders.phase === "active"
    )
      void accounts.linkReminders(reminders.deviceId, workspace.profileId);
  }, [
    accounts.linkReminders,
    accounts.signedIn,
    accounts.sessionId,
    workspace.profileId,
    reminders.enabled,
    reminders.phase,
    reminders.deviceId,
  ]);
  const platform = useAppPlatform(
    workspace.data,
    feedback.notify,
    workspace.pref,
    reminders.suppressForeground,
  );
  const studio = useScheduleEditor(
    workspace,
    navigation,
    platform.now,
    feedback.notify,
  );
  const planners = usePlannerManager(
    workspace,
    studio,
    navigation,
    feedback.notify,
  );
  const collection = useScheduleCollection(
    workspace.data?.schedules || [],
    navigation.query,
  );
  const tasks = useTaskManager(workspace, feedback.notify);
  const templateBrowser = useTemplateBrowser(
    workspace,
    navigation,
    navigation.query,
    feedback.notify,
  );
  const backups = useBackups(workspace, studio, navigation, feedback.notify);
  const editing = !!(
    studio.editor ||
    studio.pendingEdit ||
    studio.calendarOpen ||
    planners.newModal ||
    planners.renameId ||
    planners.deleteId ||
    tasks.taskModal ||
    templateBrowser.templatePreview ||
    backups.backupConfirm ||
    backups.restoring
  );
  useEffect(() => accounts.setEditing(editing), [accounts.setEditing, editing]);
  useReminderNavigation(workspace, studio, navigation);
  const { data, active, p } = workspace;
  if (!data || !active || !p || !studio.canvasProps)
    return <WorkspaceLoading loadError={workspace.loadError} />;
  const CurrentPage = pages[navigation.page];
  return (
    <AppContext.Provider
      value={{
        data,
        active,
        p,
        workspace,
        feedback,
        navigation,
        platform,
        studio: { ...studio, canvasProps: studio.canvasProps },
        planners,
        collection,
        tasks,
        templateBrowser,
        backups,
        reminders,
        accounts,
      }}
    >
      <AppShell
        overlays={
          <>
            <PlannerDialogs />
            <ActivityDialogs />
            <TemplateDialog />
            <TaskDialog />
            <HelpDialogs />
            <RestoreWorkspaceDialog />
            <BackupHistoryDialog />
            <AccountDialogs />
            <FeedbackToast />
            <div className="print-only">
              <ScheduleCanvas {...studio.canvasProps} interactive={false} />
            </div>
          </>
        }
      >
        <CurrentPage />
      </AppShell>
    </AppContext.Provider>
  );
}
