import { useMemo, useState } from "react";
import { createPlannerShares } from "../services/plannerShares";
export function usePlannerSharing(profile: string | null) {
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [manageAll, setManageAll] = useState(false);
  const api = useMemo(() => createPlannerShares(profile), [profile]);
  return { scheduleId, setScheduleId, manageAll, setManageAll, api };
}
export type PlannerSharingController = ReturnType<typeof usePlannerSharing>;
