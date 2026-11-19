export function activeProfile(): string | null {
  try {
    return localStorage.getItem("mochiplan-active-profile") || null;
  } catch {
    return null;
  }
}
export function deviceKey(name: string, profile = activeProfile()) {
  return profile ? `${name}:${profile}` : name;
}
export function workspaceRecord(profile = activeProfile()) {
  return profile ? `account:${profile}` : "workspace";
}
