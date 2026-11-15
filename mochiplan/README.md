# MochiPlan

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
- Mouse, touch, and keyboard dragging. Movement snaps to 15 minutes. Pull a block’s bottom edge or use its keyboard-accessible resize handle to adjust its duration.
- Overlap warnings and side-by-side lanes for simultaneous activities. The displayed time range expands to include activities outside the selected range.
- Weekly, daily, monthly, and list views, week/month navigation, daily swipe navigation, and a full-screen editor.
- Eight built-in palettes, saved custom palettes, background colors, gradients, patterns, local background uploads, typography, text size, alignment, borders, corners, grid lines, and weekends.
- Thirty transparent emoji stickers, drag positioning, keyboard positioning, rotation, size, and removal. Their illustration style follows the device’s emoji font.
- Sixteen previewable templates, favorite templates and themes, and preserving activities when applying a template.
- Personalized overview with current date/time, today’s activities, upcoming activities, and pending tasks.
- Tasks with subjects, deadlines, priorities, completion tracking, editing, deletion, and status filters.
- PNG, JPG, and PDF downloads with an exact output preview. Desktop, phone, square, A4 portrait/landscape, and custom dimensions are available. The editor’s rendered layout is scaled proportionally and centered inside the selected output size. Printing uses a dedicated A4 landscape stylesheet and the browser’s print dialog.
- Profile names and avatars, a workspace palette, dark mode, Sunday/Monday week starts, and 12/24-hour time.
- Serialized automatic saves to IndexedDB, lightweight local preferences, save-status feedback, backup downloads, validated backup imports, and confirmation before replacing a workspace.
- An installable web manifest, PNG/maskable icons, service-worker precaching of the app, fonts, and export libraries, offline creation/editing/export, and automatic updates when online.

The calendar represents recurring weekly activities. Moving the week or month changes the dates being viewed; activities recur on their assigned weekdays.

## Data and reminders

The application has no account or server data dependency. Plans are stored in this browser on this device. Clearing site data also clears plans; download a full backup in Settings before clearing data or moving devices. Browser storage capacity and persistence depend on the browser.

Reminders are optional and require notification permission. They run while the app is open; background timers may be suspended, and reminders cannot run after the app is closed. iOS notification support requires an installed web app. Settings includes these limitations, reminder timing controls, and a daily-overview notification action. There is no push server or closed-app reminder scheduler.

## Verification

```sh
npm test
npm run test:e2e
npm run build
```

Unit tests cover overlap detection, interval boundaries, lane assignment, duration-preserving drag constraints, and time formatting. Browser tests cover planner creation/editing/persistence, undo/redo, duplication/deletion confirmation, drag/resize, overlap presentation, themes, stickers, templates, tasks, custom palettes, full-screen editing, views, backup/restore, three download formats, offline cold reload/edit/export, and mobile layouts.

Browser tests use the production preview on port 4173. The configuration launches an installed Google Chrome; change the Playwright channel if using a different browser. Actual mobile installation, iOS behavior, background notification delivery, and physical printer output require testing on the target device.

The production dependency audit has no known advisories at the time of verification. The PWA build-tool dependency tree currently includes upstream advisories in deepmerge and glob/minimatch; these tools are not shipped to the browser. Recheck with `npm audit` when maintaining the project.

## Implementation references

- [Vite PWA automatic updates](https://vite-pwa-org.netlify.app/guide/auto-update.html)
- [html-to-image documentation](https://github.com/bubkoo/html-to-image)

## Hosting

`.openai/hosting.json` declares a static deployment from `dist`. The Sites workflow retains the source and publishes a private app. Other static hosts can serve the same production output over HTTPS.
