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

Normal editing still saves automatically to IndexedDB and works offline. In **Settings → A little server backup**, use **Save a server backup** to store a separate copy on the backend, or **Restore from server** to load it after confirmation. Backups include planners, activities, semester dates, holidays, cancelled occurrences, designs, tasks and preferences. File backup/export controls also remain available offline.

The backend stores data in `backend/data/mochiplan.sqlite`, which Git ignores. Each browser uses its own random workspace key, stored in localStorage; the server stores a hash of that key. There is no account. Clearing the browser’s site data also removes its server-backup key, so keep a downloaded backup before clearing data or moving devices. Server backup is manual and requires the backend to be running.

## Checks

```powershell
npm test
npm run build
npm run test:e2e
```

These run the frontend unit tests, backend persistence/API tests, production build, and Chrome browser tests. Browser tests use an installed Google Chrome and port 4173. The server-backup integration test uses an isolated in-memory database.

For reproducible dependency installation, use `npm ci` at the project root. The root lockfile describes both npm workspaces.

`MochiPlan-production.tar.gz` contains the frontend static build. The full application, including server backups, runs through the Node commands above.

See [frontend documentation](./frontend/README.md) for the planner’s features and [backend documentation](./backend/README.md) for the API.
