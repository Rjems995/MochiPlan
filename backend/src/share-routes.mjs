import { HttpError } from "./errors.mjs";

export function shareRoutes({
  shares,
  accounts,
  readJson,
  sendJson,
  maxBodyBytes,
}) {
  function owner(req) {
    const key = /^Bearer ([a-f0-9]{64})$/i.exec(
      req.headers.authorization || "",
    )?.[1];
    if (!key)
      throw new HttpError(
        401,
        "A workspace key is required to manage shared planners.",
      );
    accounts.authorizeDevice(req, key);
    const expected = req.headers["x-mochi-account"];
    if (!expected) return { key };
    const account = accounts.read(req);
    if (account.account_id !== expected)
      throw new HttpError(
        401,
        "Sign in to manage this account’s shared planners.",
      );
    return { key: account.workspace_key, accountId: account.account_id };
  }
  return async (req, res, url) => {
    const publicRoute = url.pathname === "/api/shared-planner";
    const management = /^\/api\/planner-shares(?:\/([a-f0-9-]{36}))?$/.exec(
      url.pathname,
    );
    if (!publicRoute && !management) return false;
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (["POST", "PUT", "DELETE"].includes(req.method) && !req.headers.origin)
      throw new HttpError(
        403,
        "An application origin is required for sharing changes.",
      );
    if (publicRoute) {
      const token = req.headers["x-mochi-share"];
      if (req.method === "GET")
        sendJson(
          res,
          200,
          shares.read(token, req.headers["x-mochi-share-access"]),
        );
      else if (req.method === "POST") {
        const body = await readJson(req, 4096);
        sendJson(
          res,
          200,
          await shares.unlock(
            token,
            body?.password,
            req.socket.remoteAddress || "unknown",
          ),
        );
      } else {
        res.setHeader("Allow", "GET, POST");
        throw new HttpError(405, "Shared planners are read-only.");
      }
      return true;
    }
    const identity = owner(req),
      id = management[1];
    if (!id && req.method === "GET") {
      const scheduleId = url.searchParams.get("scheduleId");
      if (scheduleId !== null && (!scheduleId || scheduleId.length > 200))
        throw new HttpError(400, "Choose a planner to manage its links.");
      sendJson(res, 200, shares.list(identity, scheduleId));
    } else if ((!id && req.method === "POST") || (id && req.method === "PUT")) {
      const body = await readJson(req, maxBodyBytes);
      const reauthorize = () => {
        const current = owner(req);
        if (current.key !== identity.key)
          throw new HttpError(401, "The signed-in account changed.");
      };
      reauthorize();
      sendJson(
        res,
        id ? 200 : 201,
        await shares.save(identity, body, reauthorize, id),
      );
    } else if (id && req.method === "DELETE")
      sendJson(res, 200, shares.revoke(identity, id));
    else {
      res.setHeader("Allow", id ? "PUT, DELETE" : "GET, POST");
      throw new HttpError(405, "Use the supported sharing action.");
    }
    return true;
  };
}
