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

## Sharing planners

The studio and saved planner cards open **Share this planner**. Create a read-only saved copy with optional password, expiration and opt-in locations/instructors/notes. Publishing is explicit: **Edit link → Update shared copy** updates the same link, without automatically exposing later local changes. **Settings → Manage shared links** lists all owner links and can revoke copies even after their local planner is removed. Account profiles share ownership across signed-in devices; guest links belong to this browser’s backup key. Passwords are not persisted in browser storage.

`/share/#token` renders a separate viewer before workspace hooks mount. It never switches profiles, starts account sync, reads/writes a recipient workspace, or enables reminders. The viewer offers week/day/month/list navigation, defaults to day view on phones, preserves artwork and date rules, and has no editing actions. Public APIs are network-only. Link tokens travel in headers, and password grants stay in memory. Visible viewers recheck access every 30 seconds, on focus/reconnection and at expiration; failed checks hide the copy. Read-only sharing cannot prevent recipients from keeping copies of content already viewed. See the [sharing and hosting guide](../README.md#shareable-planners).

## Tasks and deadline notifications

The task dialog supports up to 100 subtasks, optional deadline times, per-task notification lead times and daily/weekly/monthly repeats every 1–99 periods with an inclusive optional end date. Completing a parent checks its steps; unchecking a step reopens it. A repeating completion keeps history, creates one next copy and resets its steps. The next date follows the original cadence after both the current due date and today, so missed dates are skipped. Monthly repeats clamp short months and then return to the original day. Unchecking history retains the next copy. Existing copies keep their own settings; choosing **Does not repeat** on the pending copy stops its future generation.

Task cards expose step progress, timed overdue status, repeat cadence and selected notifications. The **Repeating tasks** filter includes the series history. All fields persist through offline editing, file/server backups and account sync. Different ordinary subtasks merge by ID; repeating task series merge atomically and use deterministic next-copy IDs to avoid duplicates after concurrent completion. Keep-both conflict resolution gives copied task series independent identities.

Deadline alerts use 0, 15, 30, 60 or 1440 minutes before the local deadline; an omitted time means 9:00 am. Gentle reminders provide the foreground/offline fallback, while background opt-in syncs selected pending deadlines to the server. Local and server alerts share delivery IDs and worker deduplication. Account sync atomically removes obsolete queued alerts after completion, deletion or deadline changes. Task notification links open the correct task, and mismatched workspace links show a switch-workspace message. Device notification permission and opt-in remain local; the task’s selected deadline alert is shared data.

## Calendar dates

Open **Calendar dates** in the editor toolbar to set semester dates, add holidays or breaks, and restore cancelled occurrences. Both semester endpoints are included; either endpoint can be left empty. New planners also offer semester dates during creation.

Activities default to **Every week**. Choose **On a specific date** in the activity form for an exam or one-off event. Exam planners and activities added from the monthly view default to a specific date. Weekly activities run on their assigned weekdays within the semester and pause during holidays. Explicitly dated events keep their chosen dates, including during holidays or outside the semester.

When editing a repeating activity, **Apply changes to** offers **This date**, **Future dates**, and **Entire series**. This date creates a single exception and allows a new event date; the original occurrence is replaced. Future dates includes the selected occurrence and preserves earlier classes. Entire series updates the fields you change across every phase, including past dates. Unchanged fields retain their existing future changes; edited start/end times are applied together as one interval. Existing date-specific reschedules keep their event dates. A weekly drag or resize asks for scope before saving; cancelling the prompt leaves the planner unchanged. All scopes save as one undoable operation.

Open an activity on the relevant date and select **Cancel this date**, then confirm. Other weekly occurrences remain scheduled. Restore it from the struck-through calendar label or from **Calendar dates**. Rescheduled originals show a **Moved to** link rather than an extra cancelled class. Moving a repeating pattern to another weekday also moves its saved cancellation references within their respective weeks. Deleting a repeating activity removes its entire series after confirmation; deleting a single-date exception leaves the original date cancelled and available to restore.

Week, day, month and list views, upcoming activities, reminders, and exports all resolve the actual dates being viewed. Opening a future semester or a planner containing only one-off events selects a relevant calendar date. Existing planners and version 1 backups continue working without conversion. Calendar rules are saved locally and included in file and server backups.

## Data and reminders

Normal editing has no server dependency. Device-only plans are stored in this browser, with optional username/password accounts for cross-device sync. **Settings → Your plans, wherever you are** provides sign-up, sign-in, one-time recovery codes, password recovery, device sync controls and sign-out. See [account setup and hosting](../README.md#optional-accounts-and-cross-device-sync). Both devices must reach the same server; localhost on one device is separate from localhost on another.

Each account has its own IndexedDB workspace and server baseline. Edits save locally first, survive offline reloads, and sync after reconnection while the app is open. Independent changes merge; overlapping changes offer local/account/keep-both choices. Recurring series merge as atomic groups to preserve scoped edits and links. Remote updates wait while an edit form is open; uploading local-only edits preserves undo history. Before applying incoming data, the prior device workspace is saved in Backup history. Sign-out restores the separate device-only workspace, retains the account cache, and unsubscribes its device push reminders. Session credentials stay in HttpOnly cookies, with CSRF checks and per-account sync headers. Device notification and backup choices do not sync.

**Manage account** opens Devices, Password and Delete account sections. Session revocation requires confirmation and supports one session or every other session. Password changes verify the current password, confirm the new password, rotate the current session/recovery code and sign out other sessions. Deletion offers a backup download and requires both the current password and exact username. After server confirmation, it clears this account’s IndexedDB workspace, sync baseline, safety copy and profile-specific preferences, then returns to the preserved device-only workspace. Other-device offline copies remain. Account-linked backup and reminder requests carry the matching account header and cookie, so revoked sessions cannot reuse saved device keys.

Automatic browser-profile server backups are enabled by default and run after edits settle, at most once a minute while the app is open and the companion backend is available. Failures retry with backoff and on reconnection. Settings shows backup status and the last successful server timestamp, offers manual save/restore, and lets you disable automation for this browser. A conflicting backup head pauses automatic writes until an explicit save or restore resolves it.

Backup history lists the latest 30 server versions with timestamps and workspace counts. Restoring keeps a local safety copy of current plans; server restores also save pending current edits before creating a new head from the chosen version. The local safety copy is available offline in history, including after file imports. Failed restores do not replace local plans. Identical automatic backups and navigation-only changes do not create versions. Automatic-backup settings are device-local and are not changed by restoring a workspace.

Clearing site data clears local plans and the browser’s server-backup key; download a full backup before clearing data or moving devices. Browser storage capacity and persistence depend on the browser, and background timers may delay automatic backups. No backups run after the app is closed.

Reminders are optional and require notification permission. **Settings → A nudge, even when you’re away** enables background push separately on each device. Once its schedule is synced, the companion server can send reminders after the app closes. See [server setup](../README.md#background-reminders) for the one-time Web Push contact configuration and persistent signing keys. Use the production build or HTTPS deployment; the service worker is disabled during Vite development. iPhone/iPad requires installation to the Home Screen and permission from the installed app.

Device schedule sync is independent of automatic backups. It sends calendar/activity timing, titles and locations, including semester limits, holidays, cancellations and reschedules, plus pending opted-in task titles/deadlines. Private subtask contents are excluded. Settings shows the device zone, last successful sync, last reminder sent, retry/setup states and subscription reconnection controls. Pending offline changes must sync before the server can use them. Turning off reminders unsubscribes locally even when offline and retries server cleanup after reconnecting. The server must remain running; notification delivery depends on browser, connection and device settings.

**Reminders while open** retain the existing local reminders and daily overview. A synced background subscription takes priority; local and push delivery share an ID and worker deduplication to avoid repeated nudges. Selecting a notification opens the relevant planner and calendar date. Background choices are device-local and are not enabled or disabled by restoring workspace backups. Subscription expiry or changed server signing keys require reconnecting; no permission prompt appears during automatic sync.

## Verification

Background subscriptions for account profiles link to the account after opt-in. A synced account edit refreshes linked server reminder schedules even with those apps closed, while device time zones and lead times stay independent. Pending offline changes must reach account sync first.

```sh
npm test
npm run test:e2e
npm run build
```

Unit tests cover scoped recurring edits, linked exceptions, future changes, series duplication, validation parity with the backend, text contrast, date arithmetic, week starts, semester boundaries, holidays, cancellations, upcoming occurrences, backup validation, overlap detection, lane assignment, drag constraints, and time formatting. Browser tests cover all three edit scopes, scope selection during drag/resize, history preservation, rendered text contrast, illustrated stickers across mobile layouts and offline exports, legacy backups, calendar exceptions and restoration, exact-date editing/dragging/export, semester persistence, daily swipes, planner creation/editing, undo/redo, duplication/deletion confirmation, themes, templates, tasks, custom palettes, views, backup/restore, three download formats, offline editing/export, and mobile layouts.

Browser tests use the production preview on port 4173. The configuration launches an installed Google Chrome; change the Playwright channel if using a different browser. Actual mobile installation, iOS behavior, background notification delivery, and physical printer output require testing on the target device.

The production dependency audit has no known advisories at the time of verification. The PWA build-tool dependency tree currently includes upstream advisories in deepmerge and glob/minimatch; these tools are not shipped to the browser. Recheck with `npm audit` when maintaining the project.

## Source organization

`src/App.tsx` composes shared state, account profiles, pages and dialogs. Version 1 workspace JSON remains compatible; IndexedDB adds a sync-baseline table and separate profile records.

- `src/pages/`: the studio, overview, saved schedules, templates, tasks, and settings.
- `src/hooks/useWorkspace.ts`: loading, automatic saves, preferences, schedule changes, and undo/redo.
- `src/hooks/useAccounts.ts`: account sessions, password changes, recovery, revocation, deletion, profile switching and sync lifecycle.
- `src/hooks/usePlannerSharing.ts`, `src/components/PlannerSharingDialog.tsx` and `src/services/plannerShares.ts`: scoped link ownership, publishing, privacy settings and revocation.
- `src/pages/SharedPlannerPage.tsx`: standalone read-only viewer, password gate and access revalidation.
- `src/components/AccountManagementDialog.tsx`: signed-in devices, password changes and confirmed account deletion.
- `src/services/workspaceSync.ts`, `syncMerge.ts` and `accountApi.ts`: offline synchronization, three-way merging, conflict decisions and authenticated API calls.
- `src/services/deviceScope.ts`: profile-specific storage names and browser backup/reminder keys.
- `src/hooks/useScheduleEditor.ts`: calendar navigation, activities, cancellations, drag/resize, and canvas measurements.
- `src/hooks/usePlannerManager.ts`, `useTaskManager.ts`, and `useTemplateBrowser.ts`: feature state and actions.
- `src/taskRules.ts`, `src/components/TaskOptionsFields.tsx` and `TaskCard.tsx`: task validation, repeat dates, completion, subtasks, timed deadlines and task controls.
- `src/hooks/useScheduleCollection.ts`: responsive gallery sizing and pagination.
- `src/hooks/useBackups.ts`: file import, backup history, safety copies and workspace restoration.
- `src/hooks/useAutomaticBackups.ts` and `src/services/automaticBackups.ts`: automatic scheduling, one queued writer, retries, conflict protection and persisted backup status.
- `src/hooks/useAppPlatform.ts`, `useNavigation.ts`, and `useFeedback.ts`: browser/PWA events, reminders, navigation, and toast lifecycle.
- `src/hooks/useBackgroundReminders.ts` and `useReminderNavigation.ts`: device subscriptions, schedule sync/retry, unsubscribe cleanup, and notification links.
- `src/services/reminderPlan.ts`, `pushReminders.ts`, and `localReminder.ts`: compact reminder projection, authenticated push API, and local notification delivery.
- `public/push-worker.js`: push display, local/push deduplication, notification clicks and subscription-change messages, imported by the generated offline service worker.
- `src/context/AppContext.ts`: the typed bridge between controllers and UI components. It is provided after the workspace is ready.
- `src/components/AppShell.tsx`, `AppSidebar.tsx`, `AppHeader.tsx`, and `MobileNavigation.tsx`: the shared layout. Feature dialogs and template previews are separate components.

Feature hooks remain mounted in the composition root, so editor dates, view selection, and filters survive page changes. Components read shared state with `useAppContext()` and call feature actions; storage and browser side effects belong in hooks and services.

## Implementation references

- [Vite PWA automatic updates](https://vite-pwa-org.netlify.app/guide/auto-update.html)
- [html-to-image documentation](https://github.com/bubkoo/html-to-image)

## Hosting

`.openai/hosting.json` retains the existing Site identity and declares the frontend’s static output in `dist`. Static hosting supports the offline planner; server backups require the Node backend and a same-origin `/api` route. The root `npm run preview` command provides both locally. Publication is a separate operation.
