# MochiPlan backend

A Node.js 24 HTTP API with SQLite persistence. HTTP, storage and crypto use Node’s built-in modules. Web Push delivery uses `web-push`; calendar scheduling uses Luxon for device time zones and daylight-saving transitions.

From the project root:

```powershell
npm run dev:backend
```

The API listens on `http://127.0.0.1:3001` by default. `npm run dev` at the root runs it with the frontend. `npm run build` followed by `npm run preview` serves the built frontend and API together on port 4173.

## Routes

| Method | Route                              | Purpose                                                                                   |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | `/api/health`                      | Returns the service health; no key required.                                              |
| GET    | `/api/workspace`                   | Reads this browser’s saved server backup.                                                 |
| PUT    | `/api/workspace`                   | Creates or replaces a validated server backup.                                            |
| GET    | `/api/workspace/history`           | Lists retained version metadata, newest first; returns an empty list for a new workspace. |
| GET    | `/api/workspace/history/:revision` | Reads a retained workspace snapshot, or returns `404` when pruned.                        |

Workspace routes require `Authorization: Bearer <64 hexadecimal characters>`. The frontend generates a random 256-bit key and keeps it in browser localStorage. Only its SHA-256 hash is stored in the database.

A PUT body has this shape:

```json
{
  "version": 1,
  "revision": 0,
  "source": "automatic",
  "data": {
    "schedules": [],
    "activeId": "an-existing-planner-id",
    "tasks": [],
    "preferences": {}
  }
}
```

The example shows the envelope; `data` must contain a complete, valid workspace with at least one planner, valid activities/designs, and full preferences. See [the frontend data types](../frontend/src/model.ts) and [backend validation](./src/validation.mjs).

Version 1 also accepts optional calendar metadata: planner `termStart`/`termEnd` date strings, `holidays` with named inclusive `startDate`/`endDate` ranges, activity `date` for a one-off event, and activity `cancelledDates`. Dates use `YYYY-MM-DD`; reversed ranges, invalid dates, duplicate cancellation dates, and dates inconsistent with the activity's weekday are rejected. Existing weekly-only backups remain valid. Calendar data is stored in the same workspace JSON without a database migration.

Scoped edits add optional activity `seriesId`, inclusive `startsOn`/`endsOn` bounds for repeating phases, and `sourceId`/`originalDate` for single-date replacements. A replacement links to a repeating activity in the same series whose `cancelledDates` contains the original date. Invalid or orphaned links, duplicate replacements, and overlapping phases in one series are rejected. Older backups without these fields remain valid, and the SQLite schema is unchanged.

Use revision `0` to create a backup. GET includes its current revision; send that revision to replace it. Successful writes increment the revision. Optional `source` accepts `manual` (default), `automatic`, `before-restore`, or `restore`. Automatic and before-restore writes with identical content return the existing revision and timestamp with `unchanged: true`. The SHA-256 content hash ignores the active planner selection and schedule edit timestamps. Manual writes always create a version. Stale writes return `409` without replacing the newer backup. Invalid input returns `400`, unknown backups return `404`, missing keys return `401`, and bodies over 20 MiB return `413`.

Snapshot responses include `contentHash`, `updatedAt`, `source`, and a `summary` of planners, logical activities and tasks. History returns `{ version: 1, revision, latest, versions, retentionLimit }`; metadata does not contain workspace data. Restoring uses normal revision-checked writes, preserving current plans with `before-restore` and then writing the selected snapshot with `restore`. A failed or conflicting restore leaves local plans unchanged. Older database heads migrate into history as `legacy` versions with their original revisions and timestamps.

## Accounts and synchronization

Accounts are optional and use usernames rather than email. Passwords are salted with Node scrypt (`N=131072`, `r=8`, `p=1`); at most two hashes run concurrently. Recovery codes contain 160 random bits, are stored only as hashes and rotate after each successful reset. Password resets revoke all existing sessions. Authentication attempts are limited in SQLite by username and remote IP over 15-minute windows. Forwarded IP headers are not trusted.

| Method | Route                       | Purpose                                                                                                                              |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/account/register`     | Creates `{ username, password }`, a session and a one-time recovery code.                                                            |
| POST   | `/api/account/login`        | Signs in with `{ username, password }`.                                                                                              |
| POST   | `/api/account/recover`      | Resets with `{ username, password, recoveryCode }`; returns a fresh recovery code.                                                   |
| GET    | `/api/account/session`      | Current user, CSRF token and session expiration; no password hashes or workspace key.                                                |
| DELETE | `/api/account/session`      | Revokes the current session and clears its cookie.                                                                                   |
| GET    | `/api/account/sessions`     | Lists active public session IDs, estimated devices, sign-in/last-active/expiry times and current-session flag.                       |
| DELETE | `/api/account/sessions`     | Revokes every session except the current one.                                                                                        |
| DELETE | `/api/account/sessions/:id` | Revokes one owned session, including the current session.                                                                            |
| PUT    | `/api/account/password`     | Verifies `{ currentPassword, newPassword }`, rotates the current session and recovery code, and revokes other sessions.              |
| PUT    | `/api/account/device`       | Associates `{ workspaceKey }` with the authenticated account for device backup cleanup.                                              |
| DELETE | `/api/account`              | Verifies `{ currentPassword, confirmation }`, where confirmation is the exact username, and deletes the account and associated data. |
| GET    | `/api/sync/workspace`       | Current account snapshot, or `{ version: 1, revision: 0, data: null }` for a new account.                                            |
| PUT    | `/api/sync/workspace`       | Validates and writes `{ version: 1, revision, data }` with optimistic revision checks.                                               |

Sessions use 256-bit opaque cookies with HttpOnly, SameSite=Strict, a 30-day lifetime and only hashed tokens in SQLite. At most ten sessions per account are retained. HTTPS origins automatically receive Secure cookies; `NODE_ENV=production` or `ACCOUNT_SECURE_COOKIES=true` forces them behind a reverse proxy. Account mutations require an allowed Origin; authenticated mutations also require the session’s `X-Mochi-CSRF`. Sync requests require `X-Mochi-Account` matching the session user so a cookie changed in another tab cannot send one account’s plans into another account. A browser backup bearer key grants no account access.

Each account has a private server-side workspace key and uses the same atomic version store and retention limit as backups. Conflicting writes return `409`; they never overwrite a newer head. The client keeps its previous server snapshot in IndexedDB for three-way merging, queues offline edits, and resolves overlapping series edits explicitly. Account payloads normalize selection/edit timestamps and exclude device notification choices. Local caches, device-only plans, backup keys and push choices are isolated by profile. No external identity or email service is required.

Management requests require the matching `X-Mochi-Account` header in addition to the session cookie; mutations also require the CSRF token and allowed Origin. Password changes and deletion verify the current password with the same rate limits as authentication and recheck the session after hashing. Password changes rotate the current cookie/CSRF token and recovery code atomically. Existing sessions migrate without losing valid cookies. Device names store only an estimated browser/platform label, not the raw user agent or IP address; last activity is updated at most once per minute. Session IDs exposed in lists cannot authenticate requests.

Account-associated bearer keys additionally require a live session for their owning account on backup and push routes. Scoped browser requests send `X-Mochi-Account`; requests are checked again after asynchronous body reads. Guest workspace keys continue to work without accounts. Revocation removes the affected sessions’ push subscriptions and queued deliveries, including unassigned legacy links. Password rotation preserves and rebinds the current session’s reminder devices.

Account deletion removes sessions, the private account snapshot/history, associated device snapshots/history, push devices and queued deliveries in one transaction. Only hashes of retired device keys remain as tombstones, without an account ID, so stale clients cannot upload new backups or reminders with deleted keys. Unrelated accounts and guest workspaces remain. The frontend clears the deleted account’s current-device cache only after the server confirms success. Offline copies on other devices and downloaded backups cannot be erased remotely.

Serve the app and API from one HTTPS origin reachable by every device. Configure `ALLOWED_ORIGINS` for that origin, set Secure cookies in production, and persist the SQLite directory. Accounts do not encrypt cached plans on a shared device; sign-out returns to device-only plans but retains the account cache for offline use. Recovery codes cannot be retrieved after the initial response.

Authentication follows [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [session cookie guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Push reminders

Account devices link through authenticated `PUT /api/account/reminder-device` with `{ deviceId, workspaceKey }`, the account ID header and CSRF token. The browser key proves control of the reminder device; only its hash is retained in the mapping, which cannot be reassigned to another account. Account writes update linked reminder schedules and invalidate pending jobs in the same SQLite transaction, preserving each device’s time zone and lead time. Linked device uploads always use the account’s latest schedule, so an older offline snapshot cannot revive a cancelled class. Removing a device removes its account link. Exceeding reminder-size limits pauses device reminders without blocking account sync.

Set `VAPID_SUBJECT` to your real `mailto:` contact address or public HTTPS contact URL, then restart the server. A stable VAPID key pair is generated in `backend/data/push-keys.json` (or `VAPID_KEY_PATH`); keep this private file persistent and out of Git. Alternatively set both `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to a matching key pair. Without a subject, push is disabled and existing editing, backups and local reminders continue to work. The development service worker is disabled; test push using `npm run build` and the root `npm run preview`, or an HTTPS production deployment.

| Method | Route                              | Purpose                                                                  |
| ------ | ---------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/push/config`                 | Public configuration: enabled status and public signing key only.        |
| GET    | `/api/push/devices/:deviceId`      | This workspace’s device status, last sync, last accepted push and error. |
| PUT    | `/api/push/devices/:deviceId`      | Registers or updates `{ subscription, plan }`.                           |
| DELETE | `/api/push/devices/:deviceId`      | Removes a device and its pending jobs. Idempotent.                       |
| POST   | `/api/push/devices/:deviceId/test` | Sends one test notification; limited to one per 30 seconds per device.   |

Device routes require the same workspace bearer key as backups. `deviceId` is a UUID v4. Up to ten devices per workspace are allowed; subscription endpoints cannot be reassigned to another workspace. Supported endpoints are browser-managed HTTPS URLs for FCM, Mozilla, Apple and Windows Push. Private hosts, credentials, custom ports and malformed encryption keys are rejected.

The version 1 reminder plan contains `timezone`, `minutes` (0, 5, 10, 15 or 30), `time24`, and `schedules`. Each schedule contains ID/name, optional term dates/holiday ranges, and activities with ID/title/location, weekday/start/end, dates, cancellations and recurring-series metadata. It excludes tasks, images, designs, notes and profile details. Reminder sync is separate from backup versions and supports up to 20,000 activities across all planners on one device.

The scheduler checks every 15 seconds and stores jobs, claims, retries and recent delivery IDs in SQLite. Repeating activities use the same occurrence rules as the planner, including scoped edits and linked reschedules. Advance reminders can cross midnight. Repeated autumn times use their earlier instant; nonexistent spring times move forward by the clock gap. Devices refresh their zone and schedule while the app is open. A notification click opens its planner/date in the current app window or a new one.

Job claims are leased for one minute and survive restarts. Temporary failures back off up to five attempts while the reminder remains relevant; `404`/`410` subscriptions and permanently rejected credentials are disabled. Only reminders due within the last five minutes and no later than one minute after activity start are considered. Push TTL is capped at two minutes and the remaining relevance window. A provider acceptance is recorded as “sent”; it cannot prove the device displayed the notification. An uncertain network result may retry, so the service worker also deduplicates delivery IDs and local reminders. Delivery records are retained for 30 days. Turning off reminders removes pending server jobs; in-flight provider deliveries cannot be recalled.

The Node server must stay running with outbound HTTPS access to browser push providers; no separate cron process is needed. Devices need a secure context and permission; iOS/iPadOS requires the Home Screen app. Sync pending edits before closing the app. Offline edits cannot alter the last server schedule until reconnecting.

References: [Web Push library](https://github.com/web-push-libs/web-push), [Luxon time zones](https://moment.github.io/luxon/api-docs/index.html), [Apple Web Push requirements](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

## Storage and configuration

SQLite data is written atomically to `backend/data/mochiplan.sqlite` with WAL journaling. The head, history insertion and pruning commit in one transaction. The latest 30 versions per workspace are retained by default. This directory is ignored by Git. Backups are isolated by workspace key and survive server restarts. API responses are not cached.

Optional process environment variables are listed in [.env.example](./.env.example). Set them in the shell, or launch Node with `node --env-file=.env src/server.mjs` from this folder. The npm commands read process environment variables; they do not automatically load `.env` files.

- `HOST`: bind address, default `127.0.0.1`.
- `PORT`: backend port, default `3001`; the root production runner defaults to `4173`.
- `DATABASE_PATH`: SQLite database path.
- `BACKUP_HISTORY_LIMIT`: retained versions per workspace, an integer from 1 to 100; default `30`.
- `ACCOUNT_SECURE_COOKIES`: set to `true` for HTTPS deployment; also automatic for HTTPS browser origins or `NODE_ENV=production`.
- `VAPID_SUBJECT`: real `mailto:` or public HTTPS contact; enables background reminders.
- `VAPID_KEY_PATH`: optional persistent private key file; defaults beside the SQLite database, named `push-keys.json`.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: optional existing matching keys, supplied together instead of the generated file.
- `FRONTEND_DIST`: built frontend directory, default `frontend/dist`.
- `ALLOWED_ORIGINS`: additional comma-separated browser origins accepted by the API’s origin check. The local development and preview origins are included by default.

The frontend uses same-origin `/api` URLs. Its Vite development/standalone-preview proxy targets port 3001. Adjust that proxy if changing the API’s development port. This API does not enable cross-origin browser access; use a same-origin reverse proxy when hosting the two parts separately.

## Tests

```powershell
npm test --workspace backend
```

Tests cover saved-data round trips, isolation between keys, conflict handling, invalid input, origin checks, request limits, persistence after reopening SQLite, and serving static frontend assets. Tests use memory databases or isolated temporary directories.

Reminder tests cover the compact projection, validation, occurrence parity with the planner, midnight and daylight-saving transitions, durable leases after restart, duplicate prevention, retries, cancellations, expired endpoints, encrypted Web Push request generation, stable signing keys, device isolation and test-notification rate limits. Push delivery is mocked; no real subscription is contacted by the tests.
