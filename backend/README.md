# MochiPlan backend

A Node.js 24 HTTP API with SQLite persistence. It uses Node’s built-in HTTP, filesystem, crypto and SQLite modules; there are no third-party runtime dependencies.

From the project root:

```powershell
npm run dev:backend
```

The API listens on `http://127.0.0.1:3001` by default. `npm run dev` at the root runs it with the frontend. `npm run build` followed by `npm run preview` serves the built frontend and API together on port 4173.

## Routes

| Method | Route            | Purpose                                        |
| ------ | ---------------- | ---------------------------------------------- |
| GET    | `/api/health`    | Returns the service health; no key required.   |
| GET    | `/api/workspace` | Reads this browser’s saved server backup.      |
| PUT    | `/api/workspace` | Creates or replaces a validated server backup. |

Workspace routes require `Authorization: Bearer <64 hexadecimal characters>`. The frontend generates a random 256-bit key and keeps it in browser localStorage. Only its SHA-256 hash is stored in the database.

A PUT body has this shape:

```json
{
  "version": 1,
  "revision": 0,
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

Use revision `0` to create a backup. GET includes its current revision; send that revision to replace it. Successful writes increment the revision. Stale writes return `409` without replacing the newer backup. Invalid input returns `400`, unknown backups return `404`, missing keys return `401`, and bodies over 20 MiB return `413`.

## Storage and configuration

SQLite data is written atomically to `backend/data/mochiplan.sqlite` with WAL journaling. This directory is ignored by Git. Backups are isolated by workspace key and survive server restarts. API responses are not cached.

Optional process environment variables are listed in [.env.example](./.env.example). Set them in the shell, or launch Node with `node --env-file=.env src/server.mjs` from this folder. The npm commands read process environment variables; they do not automatically load `.env` files.

- `HOST`: bind address, default `127.0.0.1`.
- `PORT`: backend port, default `3001`; the root production runner defaults to `4173`.
- `DATABASE_PATH`: SQLite database path.
- `FRONTEND_DIST`: built frontend directory, default `frontend/dist`.
- `ALLOWED_ORIGINS`: additional comma-separated browser origins accepted by the API’s origin check. The local development and preview origins are included by default.

The frontend uses same-origin `/api` URLs. Its Vite development/standalone-preview proxy targets port 3001. Adjust that proxy if changing the API’s development port. This API does not enable cross-origin browser access; use a same-origin reverse proxy when hosting the two parts separately.

## Tests

```powershell
npm test --workspace backend
```

Tests cover saved-data round trips, isolation between keys, conflict handling, invalid input, origin checks, request limits, persistence after reopening SQLite, and serving static frontend assets. Tests use memory databases or isolated temporary directories.
