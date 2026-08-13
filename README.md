# Daily Equipment List — Lighting & Grip

A single-page web app for building a daily cinematography equipment list.
Enter the shoot date and filming day number, check off everything you need
from an extensive Lighting and Grip catalog, and generate a clean, printable
daily equipment requirement report.

## Features

- Shoot info panel: date, filming day #, total days, production title,
  director, DP, gaffer, key grip, location, call time, notes.
- Extensive Lighting and Grip equipment catalogs, organized into collapsible
  categories (HMIs, LEDs, grip stands, flags/nets/silks, dolly & track, etc).
- Per-item quantity steppers and optional notes.
- Search/filter within each department, plus Select All / Clear per category.
- Add custom items to any category — they're remembered for future lists.
- Auto-saving draft (localStorage) so a page refresh never loses your work.
- Save named daily lists, reload them later, or "Duplicate Last Day" to
  carry over yesterday's gear and auto-bump the day number.
- Generated report tab: grouped by department/category with totals.
- Export to CSV, copy as plain text, or print/save as PDF.

## Running locally

No build step or dependencies required — it's plain HTML/CSS/JS with ES
modules. You do need to serve the files over HTTP (not `file://`) for
module imports to work:

```bash
npm start
# or: node server.js [port]
```

Then open http://localhost:8080.

## Customizing the equipment catalog

Edit `data/lighting.js` and `data/grip.js`. Each file exports an array of
category objects:

```js
export const lightingData = [
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
