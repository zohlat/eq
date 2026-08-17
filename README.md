# Daily Equipment List — Lighting & Grip

A single-page web app for building a daily cinematography equipment list.
Enter the shoot date and filming day number, check off everything you need
from an extensive Lighting and Grip catalog, and generate a clean, printable
daily equipment requirement report.

## Features

- **Projects**: group all the filming days for a production together (e.g.
  a project with 20 saved days, another with 30). Switch projects from the
  Project bar; each keeps its own set of saved days.
- **Filming days**: within a project, save as many days as you need, reload
  any of them, or "Duplicate Last Day" to carry over yesterday's gear and
  auto-bump the day number.
- Shoot info panel: date, filming day #, total days, production title,
  director, DP, gaffer, key grip, location, call time, notes.
- Extensive Lighting and Grip equipment catalogs, organized into collapsible
  categories (HMIs, LEDs, grip stands, flags/nets/silks, dolly & track, etc).
- Per-item quantity steppers and optional notes.
- Search/filter within each department, plus Select All / Clear per category.
- Add custom items to any category — they're remembered for future lists.
- Auto-saving draft (localStorage) so a page refresh never loses your work.
- Generated Daily Report tab: grouped by department/category with totals.
  Export to CSV, copy as plain text, print/save as PDF, or export just that
  day as a `.json` file (with a matching import).
- **Export/Import a whole Project** as one `.json` file — every saved day,
  portable to another computer or teammate, and re-importable any time.
- **Compile Full PDF**: combine every saved day in the active project into
  one printable document (cover page + one section per day + an aggregate
  equipment summary showing cumulative quantity and how many days each item
  is used across the project), ready to print or save as PDF.
- **Cloud Backup (GitHub)**: back up any project — or all of them — straight
  to a GitHub repo as JSON files, directly from the browser. See below.
- **Installable on iPhone/iPad**: add it to the Home Screen and it launches
  full-screen, with no Safari address bar. See below.

## Add to Home Screen (iPhone / iPad)

1. Open `index.html` in Safari (either the local file, or hosted via
   `npm start` / GitHub Pages / any static host).
2. Tap the **Share** button, then **Add to Home Screen**.
3. Launch it from the Home Screen icon — it opens full-screen, with no
   Safari chrome, and behaves like a standalone app.

This works because of the `apple-mobile-web-app-*` meta tags and
`apple-touch-icon` in `index.html`, plus `manifest.json` (which also enables
"Add to Home Screen" on Android/Chrome as an installable PWA). The icon
artwork lives in `icons/`. Safe-area insets (notch, status bar, home
indicator) are handled in `style.css` via `env(safe-area-inset-*)`, so
content doesn't get hidden behind them.

## Cloud Backup (GitHub)

Since this app has no server or database, everything normally lives only in
the current browser's `localStorage`. The **Cloud Backup (GitHub)** panel
lets you push your projects to a GitHub repo instead, so they're safe in the
cloud and usable from another computer.

Setup:

1. Create a GitHub **fine-grained personal access token**
   (github.com → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens) scoped to just the one repo you want to back up to,
   with **Contents: Read and write** permission. (Avoid using a broad
   classic token with full `repo` scope — least privilege is safer since the
   token is stored in your browser.)
2. In the Cloud Backup panel, paste the token, enter the repo as
   `owner/name` (e.g. `zohlat/eq`), the branch (e.g. `main`), and a folder
   prefix for backups (default `backups/`). Click **Save Connection**.
3. Click **Backup Active Project** or **Backup All Projects** any time, or
   check **Auto-backup active project after every Save List** to have it
   happen automatically.
4. To pull a project back down (on this browser or a new one), click
   **Refresh Backups List**, pick a file, and click **Restore as New
   Project**.

Each project is written as its own file:
`<pathPrefix><projectId>-<slugified-name>.json`, containing that project's
name and every saved day. Backups are committed via GitHub's REST API
using the Contents endpoint, so each backup shows up as a normal commit in
the repo's history.

**Security note:** the token is stored in this browser's `localStorage`
only — it is never written into any file in the repo or committed anywhere.
Anyone with access to this browser profile can read it back out, so don't
use this on a shared/public computer, and revoke the token on GitHub if you
ever need to cut off access.

## Running locally

No build step, no dependencies, no server required. Just double-click
`index.html` (or open it via File → Open in your browser) and the app runs
entirely from local files.

If you'd rather serve it over HTTP (e.g. for testing on another device on
your network), an optional zero-dependency static server is included:

```bash
npm start
# or: node server.js [port]
```

Then open http://localhost:8080.

## Customizing the equipment catalog

Edit `data/lighting.js` and `data/grip.js`. Each file defines an array of
category objects:

```js
const lightingData = [
  { category: "HMI Fixtures (PAR & Fresnel)", items: ["1200W HMI Fresnel", "..."] },
  ...
];
```

Add, remove, or rename items/categories freely — the app picks them up on
reload. Items added from within the app itself (via the "+ Add" box in each
category) are stored separately in the browser's localStorage and merged in
at runtime, so they persist without editing these files.

## File structure

```
index.html      Markup / layout
style.css       Styling (dark UI + print-friendly report view)
app.js          App logic (state, rendering, save/load, export)
data/lighting.js  Lighting equipment catalog
data/grip.js      Grip equipment catalog
server.js       Zero-dependency static file server for local dev
manifest.json   Web app manifest (Add to Home Screen / PWA install)
icons/          Home screen / favicon artwork
```
