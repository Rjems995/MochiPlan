import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WorkspaceStore } from "./database.mjs";
import { validateWorkspace } from "./validation.mjs";
import { HttpError } from "./errors.mjs";
import { Accounts } from "./accounts.mjs";
import { accountRoutes } from "./account-routes.mjs";
import { loadPushConfig, createPushSender } from "./push-config.mjs";
import { ReminderStore } from "./reminder-store.mjs";
import { ReminderScheduler } from "./reminder-scheduler.mjs";
import {
  validDeviceId,
  validateReminderPlan,
  validateSubscription,
} from "./reminder-plan.mjs";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
function readJson(req, limit) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json")
    throw new HttpError(415, "Send application/json.");
  if (Number(req.headers["content-length"]) > limit) {
    req.resume();
    throw new HttpError(413, "The backup is larger than 20 MB.");
  }
  return new Promise((resolveBody, reject) => {
    let size = 0,
      failed = false;
    const chunks = [];
    req.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, "The backup is larger than 20 MB."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!failed) {
        try {
          resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new HttpError(400, "The request contains invalid JSON."));
        }
      }
    });
    req.on("error", reject);
    req.on("aborted", () =>
      reject(new HttpError(400, "The request was interrupted.")),
    );
  });
}
export function createApp({
  databasePath = resolve(backendRoot, "data/mochiplan.sqlite"),
  frontendDist = resolve(backendRoot, "../frontend/dist"),
  allowedOrigins = [],
  maxBodyBytes = 20 * 1024 * 1024,
  historyLimit = 30,
  push = {},
  accountOptions = {},
} = {}) {
  const store = new WorkspaceStore(databasePath, { historyLimit });
  const accounts = new Accounts(store.db, accountOptions);
  const reminderStore = new ReminderStore(store.db);
  const handleAccount = accountRoutes({
    accounts,
    workspaces: store,
    readJson,
    sendJson,
    maxBodyBytes,
    reminders: reminderStore,
  });
  const scheduler = new ReminderScheduler(reminderStore, {
    ...push,
    send: push.send || createPushSender(push.config || {}),
  });
  const origins = new Set([
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    ...allowedOrigins,
  ]);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/health" && req.method === "GET") {
        sendJson(res, 200, { status: "ok", service: "mochiplan-api" });
        return;
      }
      if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
        if (req.headers.origin && !origins.has(req.headers.origin))
          throw new HttpError(403, "This origin is not allowed.");
        if (await handleAccount(req, res, url.pathname)) return;
        if (url.pathname === "/api/push/config") {
          if (req.method !== "GET") {
            res.setHeader("Allow", "GET");
            throw new HttpError(405, "Use GET for push configuration.");
          }
          sendJson(res, 200, {
            version: 1,
            configured: !!push.config?.configured,
            publicKey: push.config?.configured ? push.config.publicKey : null,
          });
          return;
        }
        const pushRoute = /^\/api\/push\/devices\/([^/]+)(\/test)?$/.exec(
          url.pathname,
        );
        const historyRoute = url.pathname === "/api/workspace/history";
        const versionRoute = /^\/api\/workspace\/history\/(\d+)$/.exec(
          url.pathname,
        );
        if (
          url.pathname !== "/api/workspace" &&
          !historyRoute &&
          !versionRoute &&
          !pushRoute
        )
          throw new HttpError(404, "API route not found.");
        const match = /^Bearer ([a-f0-9]{64})$/i.exec(
          req.headers.authorization || "",
        );
        if (!match) throw new HttpError(401, "A workspace key is required.");
        const key = match[1];
        accounts.authorizeDevice(req, key);
        if (pushRoute) {
          const deviceId = pushRoute[1];
          if (!validDeviceId(deviceId))
            throw new HttpError(400, "Choose a valid reminder device.");
          if (pushRoute[2]) {
            if (req.method !== "POST") {
              res.setHeader("Allow", "POST");
              throw new HttpError(405, "Use POST to send a test reminder.");
            }
            sendJson(res, 200, await scheduler.test(key, deviceId));
            return;
          }
          if (req.method === "GET") {
            sendJson(res, 200, reminderStore.status(key, deviceId));
            return;
          }
          if (req.method === "DELETE") {
            reminderStore.remove(key, deviceId);
            sendJson(res, 200, { version: 1, enabled: false });
            return;
          }
          if (req.method === "PUT") {
            if (!push.config?.configured)
              throw new HttpError(
                503,
                "Background reminders are not configured on this server yet.",
              );
            const body = await readJson(req, maxBodyBytes);
            accounts.authorizeDevice(req, key);
            const subscription = validateSubscription(body?.subscription);
            const linkedKey = reminderStore.linkedKey(key, deviceId),
              shared = linkedKey && store.get(linkedKey)?.data;
            const plan = validateReminderPlan(
              shared
                ? { ...body?.plan, schedules: shared.schedules }
                : body?.plan,
            );
            sendJson(
              res,
              200,
              reminderStore.save(
                key,
                deviceId,
                subscription,
                plan,
                scheduler.now(),
              ),
            );
            return;
          }
          res.setHeader("Allow", "GET, PUT, DELETE");
          throw new HttpError(
            405,
            "Use GET, PUT or DELETE for reminder devices.",
          );
        }
        if (historyRoute || versionRoute) {
          if (req.method !== "GET") {
            res.setHeader("Allow", "GET");
            throw new HttpError(405, "Use GET for backup history.");
          }
          if (historyRoute) sendJson(res, 200, store.history(key));
          else {
            const revision = Number(versionRoute[1]);
            if (!Number.isSafeInteger(revision) || revision < 1)
              throw new HttpError(400, "Choose a valid backup version.");
            const record = store.getVersion(key, revision);
            if (!record)
              throw new HttpError(
                404,
                "That backup version is no longer available.",
              );
            sendJson(res, 200, record);
          }
          return;
        }
        if (req.method === "GET") {
          const record = store.get(key);
          if (!record)
            throw new HttpError(
              404,
              "No server backup has been saved in this browser yet.",
            );
          sendJson(res, 200, record);
          return;
        }
        if (req.method === "PUT") {
          const body = await readJson(req, maxBodyBytes);
          accounts.authorizeDevice(req, key);
          const data = validateWorkspace(body);
          sendJson(
            res,
            body.revision === 0 ? 201 : 200,
            store.save(key, body.revision, data, body.source || "manual"),
          );
          return;
        }
        res.setHeader("Allow", "GET, PUT");
        throw new HttpError(405, "Use GET or PUT for a workspace.");
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.setHeader("Allow", "GET, HEAD");
        throw new HttpError(405, "Method not allowed.");
      }
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        throw new HttpError(400, "The path is invalid.");
      }
      if (
        pathname.includes("\\") ||
        pathname.includes("\0") ||
        pathname.split("/").some((part) => part.startsWith("."))
      )
        throw new HttpError(404, "File not found.");
      let filename = resolve(
        frontendDist,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      const local = relative(frontendDist, filename);
      if (local.startsWith(".." + sep) || isAbsolute(local))
        throw new HttpError(404, "File not found.");
      let file = await stat(filename).catch(() => null);
      if (!file?.isFile() && !extname(pathname)) {
        filename = resolve(frontendDist, "index.html");
        file = await stat(filename).catch(() => null);
      }
      if (!file?.isFile())
        throw new HttpError(
          pathname === "/" ? 503 : 404,
          pathname === "/"
            ? "Build the frontend with npm run build, then try again."
            : "File not found.",
        );
      res.writeHead(200, {
        "Content-Length": file.size,
        "Content-Type": types[extname(filename)] || "application/octet-stream",
        "Cache-Control": pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : await readFile(filename));
    } catch (error) {
      if (!res.headersSent)
        sendJson(res, error instanceof HttpError ? error.status : 500, {
          error:
            error instanceof HttpError
              ? error.message
              : "The server could not complete this request.",
        });
      else res.destroy();
    }
  });
  server.requestTimeout = 30000;
  server.reminderScheduler = scheduler;
  server.on("listening", () => scheduler.start());
  server.on("close", () => {
    scheduler.stop();
    store.close();
  });
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be between 1 and 65535.");
  const app = createApp({
    databasePath: process.env.DATABASE_PATH
      ? resolve(process.env.DATABASE_PATH)
      : undefined,
    frontendDist: process.env.FRONTEND_DIST
      ? resolve(process.env.FRONTEND_DIST)
      : undefined,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .filter(Boolean)
      .concat([`http://${host}:${port}`]),
    historyLimit: Number(process.env.BACKUP_HISTORY_LIMIT || 30),
    accountOptions: {
      secureCookies:
        process.env.ACCOUNT_SECURE_COOKIES === "true" ||
        process.env.NODE_ENV === "production",
    },
    push: {
      config: loadPushConfig({
        subject: process.env.VAPID_SUBJECT,
        keyPath: process.env.VAPID_KEY_PATH
          ? resolve(process.env.VAPID_KEY_PATH)
          : resolve(
              process.env.DATABASE_PATH
                ? dirname(resolve(process.env.DATABASE_PATH))
                : resolve(backendRoot, "data"),
              "push-keys.json",
            ),
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      }),
    },
  });
  app.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  app.listen(port, host, () =>
    console.log(`MochiPlan frontend + API: http://${host}:${port}`),
  );
  function close() {
    app.close(() => process.exit(0));
    app.closeIdleConnections();
  }
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
