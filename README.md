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
```
