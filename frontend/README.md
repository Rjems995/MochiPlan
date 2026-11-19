# MochiPlan

This is the **frontend** workspace. The project root contains the [combined frontend/backend run commands](../README.md). Its companion [backend](../backend/README.md) provides optional, persistent server backups. Normal editing remains offline-first.

A cozy schedule planner and design studio built with React, TypeScript, Vite, Tailwind CSS, Lucide, Motion, dnd-kit, Dexie, html-to-image, jsPDF, and vite-plugin-pwa.

## Run locally

Use Node.js 24 LTS and npm. Chrome is used by the browser test configuration.

```sh
npm ci
npm run dev
```

For the installable, offline-capable production build:

```sh
npm run build
npm run preview
```

PWA installation and service workers require HTTPS or localhost. Offline functionality becomes available after the first successful online load and service-worker installation. Development mode intentionally does not install a service worker.

## What works

- Multiple planners with eight schedule types, renaming, duplication, deletion confirmation, and undo/redo.
- Timed activities with multiple days, location, instructor, notes, custom colors, duplication, and deletion confirmation.
- Semester start/end dates, one-off exams and events, holiday ranges, and cancellation/restoration of individual occurrences.
- Mouse, touch, and keyboard dragging. Movement snaps to 15 minutes. Pull a block’s bottom edge or use its keyboard-accessible resize handle to adjust its duration.
- Overlap warnings and side-by-side lanes for simultaneous activities. The displayed time range expands to include activities outside the selected range.
- Weekly, daily, monthly, and list views, week/month navigation, daily swipe navigation, and a full-screen editor.
- The editor and My Schedules fit within the viewport. Timetable spacing adapts to the available height, design controls fit in their panel, and saved schedules use responsive pagination. Phones initially open the daily view, with design controls available from the toolbar.
- Eight built-in palettes, saved custom palettes, background colors, gradients, patterns, local background uploads, typography, text size, alignment, borders, corners, grid lines, and weekends.
- Thirty illustrated SVG stickers with a shared pastel palette and rounded outlines, drag positioning, keyboard positioning, rotation, size, and removal. The same bundled artwork appears across devices, offline, in previews, and in exports. Existing saved sticker tokens resolve to these illustrations without a data migration. Unrecognized imported tokens display a keepsake star while preserving the original saved token.
- Stronger supporting-text contrast in light and dark mode, plus adaptive text colors for planner backgrounds and activity colors. Activity times and room labels use full-opacity text.
- Sixteen previewable templates, favorite templates and themes, and preserving activities when applying a template.
- Personalized overview with current date/time, today’s activities, upcoming activities, and pending tasks.
- Tasks with subjects, deadlines, priorities, completion tracking, editing, deletion, and status filters.
- PNG, JPG, and PDF downloads with an exact output preview. Desktop, phone, square, A4 portrait/landscape, and custom dimensions are available. The editor’s rendered layout is scaled proportionally and centered inside the selected output size. Printing uses a dedicated A4 landscape stylesheet and the browser’s print dialog.
- Profile names and avatars, a workspace palette, dark mode, Sunday/Monday week starts, and 12/24-hour time.
- Serialized automatic saves to IndexedDB, lightweight local preferences, save-status feedback, backup downloads, validated backup imports, and confirmation before replacing a workspace.
- An installable web manifest, PNG/maskable icons, service-worker precaching of the app, fonts, and export libraries, offline creation/editing/export, and automatic updates when online.

## Calendar dates

Open **Calendar dates** in the editor toolbar to set semester dates, add holidays or breaks, and restore cancelled occurrences. Both semester endpoints are included; either endpoint can be left empty. New planners also offer semester dates during creation.

Activities default to **Every week**. Choose **On a specific date** in the activity form for an exam or one-off event. Exam planners and activities added from the monthly view default to a specific date. Weekly activities run on their assigned weekdays within the semester and pause during holidays. Explicitly dated events keep their chosen dates, including during holidays or outside the semester.

When editing a repeating activity, **Apply changes to** offers **This date**, **Future dates**, and **Entire series**. This date creates a single exception and allows a new event date; the original occurrence is replaced. Future dates includes the selected occurrence and preserves earlier classes. Entire series updates the fields you change across every phase, including past dates. Unchanged fields retain their existing future changes; edited start/end times are applied together as one interval. Existing date-specific reschedules keep their event dates. A weekly drag or resize asks for scope before saving; cancelling the prompt leaves the planner unchanged. All scopes save as one undoable operation.

Open an activity on the relevant date and select **Cancel this date**, then confirm. Other weekly occurrences remain scheduled. Restore it from the struck-through calendar label or from **Calendar dates**. Rescheduled originals show a **Moved to** link rather than an extra cancelled class. Moving a repeating pattern to another weekday also moves its saved cancellation references within their respective weeks. Deleting a repeating activity removes its entire series after confirmation; deleting a single-date exception leaves the original date cancelled and available to restore.

Week, day, month and list views, upcoming activities, reminders, and exports all resolve the actual dates being viewed. Opening a future semester or a planner containing only one-off events selects a relevant calendar date. Existing planners and version 1 backups continue working without conversion. Calendar rules are saved locally and included in file and server backups.

## Data and reminders

The application has no account and normal editing has no server dependency. Plans are stored in this browser on this device. Settings also offers manual save/restore through the companion backend. Clearing site data clears local plans and the browser’s server-backup key; download a full backup before clearing data or moving devices. Browser storage capacity and persistence depend on the browser.

Reminders are optional and require notification permission. They run while the app is open; background timers may be suspended, and reminders cannot run after the app is closed. iOS notification support requires an installed web app. Settings includes these limitations, reminder timing controls, and a daily-overview notification action. There is no push server or closed-app reminder scheduler.

## Verification

```sh
npm test
npm run test:e2e
npm run build
```

Unit tests cover scoped recurring edits, linked exceptions, future changes, series duplication, validation parity with the backend, text contrast, date arithmetic, week starts, semester boundaries, holidays, cancellations, upcoming occurrences, backup validation, overlap detection, lane assignment, drag constraints, and time formatting. Browser tests cover all three edit scopes, scope selection during drag/resize, history preservation, rendered text contrast, illustrated stickers across mobile layouts and offline exports, legacy backups, calendar exceptions and restoration, exact-date editing/dragging/export, semester persistence, daily swipes, planner creation/editing, undo/redo, duplication/deletion confirmation, themes, templates, tasks, custom palettes, views, backup/restore, three download formats, offline editing/export, and mobile layouts.

Browser tests use the production preview on port 4173. The configuration launches an installed Google Chrome; change the Playwright channel if using a different browser. Actual mobile installation, iOS behavior, background notification delivery, and physical printer output require testing on the target device.

The production dependency audit has no known advisories at the time of verification. The PWA build-tool dependency tree currently includes upstream advisories in deepmerge and glob/minimatch; these tools are not shipped to the browser. Recheck with `npm audit` when maintaining the project.

## Source organization

`src/App.tsx` composes the shared state, layout, pages, and dialogs. The UI and saved-data format remain the same.

- `src/pages/`: the studio, overview, saved schedules, templates, tasks, and settings.
- `src/hooks/useWorkspace.ts`: loading, automatic saves, preferences, schedule changes, and undo/redo.
- `src/hooks/useScheduleEditor.ts`: calendar navigation, activities, cancellations, drag/resize, and canvas measurements.
- `src/hooks/usePlannerManager.ts`, `useTaskManager.ts`, and `useTemplateBrowser.ts`: feature state and actions.
- `src/hooks/useScheduleCollection.ts`: responsive gallery sizing and pagination.
- `src/hooks/useBackups.ts`: file import, server backup, and workspace restoration.
- `src/hooks/useAppPlatform.ts`, `useNavigation.ts`, and `useFeedback.ts`: browser/PWA events, reminders, navigation, and toast lifecycle.
- `src/context/AppContext.ts`: the typed bridge between controllers and UI components. It is provided after the workspace is ready.
- `src/components/AppShell.tsx`, `AppSidebar.tsx`, `AppHeader.tsx`, and `MobileNavigation.tsx`: the shared layout. Feature dialogs and template previews are separate components.

Feature hooks remain mounted in the composition root, so editor dates, view selection, and filters survive page changes. Components read shared state with `useAppContext()` and call feature actions; storage and browser side effects belong in hooks and services.

## Implementation references

- [Vite PWA automatic updates](https://vite-pwa-org.netlify.app/guide/auto-update.html)
- [html-to-image documentation](https://github.com/bubkoo/html-to-image)

## Hosting

`.openai/hosting.json` retains the existing Site identity and declares the frontend’s static output in `dist`. Static hosting supports the offline planner; server backups require the Node backend and a same-origin `/api` route. The root `npm run preview` command provides both locally. Publication is a separate operation.
