# MochiPlan

The project has two application folders:

```text
MochiPlan/
├── frontend/       React + TypeScript PWA, editor, exports and offline storage
├── backend/        Node.js API and persistent SQLite server backups
├── dev.mjs         Starts both parts or the combined production server
├── package.json    Commands for the whole project
└── package-lock.json
```

Use Node.js 24 or newer. Run commands from `C:\Users\robin\MochiPlan`.

## Install and run

```powershell
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. This starts the frontend on port 5173 and the API on port 3001. Vite forwards `/api` requests to the backend. Stop both with **Ctrl+C**.

## Run the production build locally

```powershell
npm run build
npm run preview
```

Open **http://127.0.0.1:4173/**. The backend serves the built frontend and its API from the same address. This preserves browser-local plans previously saved at that exact address. Keep using the same hostname and port to access existing IndexedDB data.

`npm start` also serves the production build. To change its port in PowerShell, set `$env:PORT='8080'` first.

## Data

Normal editing saves automatically to IndexedDB and works offline. **Automatic server backups** are enabled by default in **Settings → A little server backup**. While MochiPlan is open and the backend is available, edits back up after a short pause, at most once a minute. Failed backups retry with backoff and on reconnection. Settings shows the last successful server backup, including after a reload, and lets you turn automation off or save manually.

**Backup history** keeps the latest 30 server versions with timestamps and planner/activity/task counts. Choose a version to restore after confirmation. Restoring first creates a local safety copy; server restores also preserve current plans as a server version before making the selected version the latest. The local safety copy remains available offline in Backup history. A conflicting server version pauses automatic writes until you review history, restore a version, or explicitly save this workspace manually.

Backups include planners, activities, semester dates, holidays, cancelled/rescheduled occurrences, designs, tasks and preferences. Identical automatic backups do not create extra versions; navigating between planners does not count as an edit. File backup/export controls remain available offline. Automatic-backup preferences apply to this browser and are separate from restored workspace preferences.

The backend stores data in `backend/data/mochiplan.sqlite`, which Git ignores. Each browser uses its own random workspace key, stored in localStorage; the server stores a hash of that key. There is no account. Clearing the browser’s site data also removes its server-backup key, so keep a downloaded backup before clearing data or moving devices. Server backups require the backend to be running. Backups run while the app is open; browser background timers may delay them.

## Background reminders

Install the updated dependencies with `npm install`. Before starting the server, set a real Web Push contact address in PowerShell:

```powershell
$env:VAPID_SUBJECT='mailto:your-real-email@example.com'
npm run build
npm run preview
```

Replace the example email with your contact address. Open **http://127.0.0.1:4173/**, then **Settings → A nudge, even when you’re away → Enable background reminders** and allow notifications. Use **Send a test reminder** to check this device. The server generates signing keys once in the ignored `backend/data/push-keys.json`; retain that file with your SQLite data across restarts. An existing deployment can instead supply `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

Keep the server running with internet access. After the reminder schedule has synced, notifications can arrive with MochiPlan closed. Production hosting needs HTTPS; localhost works for testing. On iPhone or iPad, install the Home Screen app and enable reminders from there. Delivery can be delayed by device settings or connectivity.

Each device opts in separately and uses its own time zone. The server respects semesters, holidays, cancellations and all edit scopes. Reminder sync is independent of automatic backups and uploads only activity timing, titles, locations and calendar rules. Settings shows the last successful schedule sync and last reminder accepted by the push service. Offline edits must sync before the server can use them. Turning reminders off unsubscribes the device immediately and retries server cleanup after reconnection.

**Reminders while open** remain available as an optional local fallback. Push and local reminders use matching IDs to avoid duplicate nudges. The worker opens the relevant planner and date when a notification is selected. Server jobs and recent delivery IDs persist across restarts; temporary errors retry briefly, expired subscriptions require reconnecting, and reminders more than five minutes overdue are skipped.

## Checks

```powershell
npm test
npm run build
npm run test:e2e
```

These run the frontend unit tests, backend persistence/API tests, production build, and Chrome browser tests. Browser tests use an installed Google Chrome and port 4173. Server-backup and reminder integration tests use isolated in-memory databases. Reminder tests simulate push-provider acceptance and Chrome push delivery, including delivery with no MochiPlan page open, worker deduplication, cancellation sync, offline unsubscribe and expired-subscription reconnection. Real browser push-provider delivery and physical iOS/Android device behavior still need testing on the target device.

For reproducible dependency installation, use `npm ci` at the project root. The root lockfile describes both npm workspaces.

`MochiPlan-production.tar.gz` contains the frontend static build. The full application, including server backups, runs through the Node commands above.

See [frontend documentation](./frontend/README.md) for the planner’s features and [backend documentation](./backend/README.md) for the API.
