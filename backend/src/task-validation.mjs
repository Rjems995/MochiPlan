export function validTaskExtensions(value, date) {
  if (
    value.dueTime !== undefined &&
    (!value.due ||
      typeof value.dueTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.dueTime))
  )
    return false;
  if (
    value.reminderMinutes !== undefined &&
    (!value.due || ![0, 15, 30, 60, 1440].includes(value.reminderMinutes))
  )
    return false;
  if (
    value.seriesId !== undefined &&
    (typeof value.seriesId !== "string" ||
      !value.seriesId.trim() ||
      value.seriesId.length > 160)
  )
    return false;
  if (value.subtasks !== undefined) {
    if (!Array.isArray(value.subtasks) || value.subtasks.length > 100)
      return false;
    const ids = new Set();
    for (const step of value.subtasks) {
      if (
        !step ||
        typeof step !== "object" ||
        typeof step.id !== "string" ||
        !step.id.trim() ||
        step.id.length > 200 ||
        ids.has(step.id) ||
        typeof step.title !== "string" ||
        !step.title.trim() ||
        step.title.length > 160 ||
        typeof step.done !== "boolean"
      )
        return false;
      ids.add(step.id);
    }
  }
  if (value.recurrence !== undefined) {
    const rule = value.recurrence;
    if (
      !rule ||
      typeof rule !== "object" ||
      Array.isArray(rule) ||
      !value.seriesId ||
      !date(value.due) ||
      !["daily", "weekly", "monthly"].includes(rule.frequency) ||
      !Number.isInteger(rule.interval) ||
      rule.interval < 1 ||
      rule.interval > 99 ||
      !date(rule.anchorDate) ||
      rule.anchorDate > value.due ||
      (rule.until !== undefined &&
        (!date(rule.until) || rule.until < value.due))
    )
      return false;
  }
  return true;
}
