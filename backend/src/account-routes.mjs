import { HttpError } from "./errors.mjs";
import { validateWorkspace } from "./validation.mjs";
import { validDeviceId } from "./reminder-plan.mjs";

export function accountRoutes({
  accounts,
  workspaces,
  readJson,
  sendJson,
  maxBodyBytes,
  reminders,
}) {
  return async (req, res, path) => {
    if (!path.startsWith("/api/account/") && !path.startsWith("/api/sync/"))
      return false;
    const secureCookie =
      accounts.secureCookies ||
      !!req.socket.encrypted ||
      req.headers.origin?.startsWith("https://");
    if (["POST", "PUT", "DELETE"].includes(req.method) && !req.headers.origin)
      throw new HttpError(
        403,
        "An application origin is required for account changes.",
      );
    if (
      [
        "/api/account/register",
        "/api/account/login",
        "/api/account/recover",
      ].includes(path)
    ) {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        throw new HttpError(405, "Use POST for account sign-in.");
      }
      const body = await readJson(req, 4096);
      const action = path.split("/").at(-1);
      const result = await accounts[action](
        body,
        req.socket.remoteAddress || "unknown",
        accounts.token(req),
      );
      res.setHeader("Set-Cookie", accounts.cookie(result.token, secureCookie));
      sendJson(res, action === "register" ? 201 : 200, result.result);
      return true;
    }
    if (path === "/api/account/session") {
      if (req.method === "GET") {
        sendJson(res, 200, accounts.current(req));
        return true;
      }
      if (req.method === "DELETE") {
        accounts.logout(req);
        res.setHeader("Set-Cookie", accounts.cookie("", secureCookie));
        sendJson(res, 200, { version: 1, signedOut: true });
        return true;
      }
      res.setHeader("Allow", "GET, DELETE");
      throw new HttpError(405, "Use GET or DELETE for account sessions.");
    }
    if (path === "/api/account/reminder-device") {
      const account = accounts.read(req, true);
      if (req.method !== "PUT") {
        res.setHeader("Allow", "PUT");
        throw new HttpError(405, "Use PUT to link a reminder device.");
      }
      const body = await readJson(req, 4096);
      if (
        !validDeviceId(body?.deviceId) ||
        !/^[a-f0-9]{64}$/.test(body?.workspaceKey) ||
        req.headers["x-mochi-account"] !== account.account_id
      )
        throw new HttpError(400, "Choose a valid account reminder device.");
      reminders.linkAccount(
        account.account_id,
        body.workspaceKey,
        body.deviceId,
        workspaces.get(account.workspace_key)?.data,
        Date.now(),
      );
      sendJson(res, 200, { version: 1, linked: true });
      return true;
    }
    if (path === "/api/sync/workspace") {
      const account = accounts.read(req, req.method === "PUT");
      if (req.headers["x-mochi-account"] !== account.account_id)
        throw new HttpError(
          401,
          "The signed-in account changed. Sign in again to resume this workspace.",
        );
      if (req.method === "GET") {
        const record = workspaces.get(account.workspace_key);
        sendJson(res, 200, record || { version: 1, revision: 0, data: null });
        return true;
      }
      if (req.method === "PUT") {
        const body = await readJson(req, maxBodyBytes),
          data = validateWorkspace(body);
        // Navigation and notification choices stay on the device.
        const shared = structuredClone(data);
        shared.activeId = shared.schedules[0].id;
        shared.schedules.forEach((schedule) => (schedule.updatedAt = 0));
        Object.assign(shared.preferences, {
          reminders: false,
          reminderMinutes: 10,
          onboarded: true,
        });
        sendJson(
          res,
          200,
          workspaces.save(
            account.workspace_key,
            body.revision,
            shared,
            "automatic",
            () => reminders.syncAccount(account.account_id, shared, Date.now()),
          ),
        );
        return true;
      }
      res.setHeader("Allow", "GET, PUT");
      throw new HttpError(405, "Use GET or PUT for account sync.");
    }
    throw new HttpError(404, "Account route not found.");
  };
}
