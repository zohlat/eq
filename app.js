const BASE_CATALOG = { lighting: lightingData, grip: gripData };
const DEPARTMENTS = ["lighting", "grip"];
const DEPT_LABELS = { lighting: "Lighting", grip: "Grip" };

const LS_CUSTOM = "eq_customCatalog";
const LS_PROJECTS = "eq_projects_v2";
const LS_ACTIVE_PROJECT = "eq_activeProjectId";
const LS_DRAFT = "eq_currentDraft_v2";
const LS_SAVED_LEGACY = "eq_savedLists"; // pre-project version, migrated on first load

const SHOOT_FIELDS = [
  "shootDate", "dayNumber", "totalDays", "productionTitle",
  "director", "dp", "gaffer", "keyGrip", "location", "callTime", "shootNotes",
];

// ---------- storage helpers ----------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- projects ----------

let customCatalog = loadJSON(LS_CUSTOM, { lighting: {}, grip: {} });
let projects = loadJSON(LS_PROJECTS, {});
let activeProjectId = loadJSON(LS_ACTIVE_PROJECT, null);

function persistProjects() {
  saveJSON(LS_PROJECTS, projects);
}

function persistActiveProject() {
  saveJSON(LS_ACTIVE_PROJECT, activeProjectId);
}

function getActiveProject() {
  return projects[activeProjectId] || null;
}

function migrateLegacyIfNeeded() {
  const legacy = loadJSON(LS_SAVED_LEGACY, null);
  if (!legacy || Object.keys(legacy).length === 0) return;
  const project = createProjectRecord("My Project");
  Object.keys(legacy).forEach((name) => {
    const entry = legacy[name];
    const id = genId();
    project.days[id] = {
      id,
      name,
      savedAt: entry.savedAt || Date.now(),
      shootInfo: entry.shootInfo || {},
      selections: entry.selections || {},
    };
  });
  projects[project.id] = project;
  activeProjectId = project.id;
  persistProjects();
  persistActiveProject();
  localStorage.removeItem(LS_SAVED_LEGACY);
}

function createProjectRecord(name) {
  const id = genId();
  return { id, name, createdAt: Date.now(), updatedAt: Date.now(), days: {} };
}

function ensureProjectsExist() {
  migrateLegacyIfNeeded();
  if (Object.keys(projects).length === 0) {
    const project = createProjectRecord("My Project");
    projects[project.id] = project;
    activeProjectId = project.id;
    persistProjects();
    persistActiveProject();
  }
  if (!getActiveProject()) {
    activeProjectId = Object.keys(projects).sort((a, b) => projects[b].updatedAt - projects[a].updatedAt)[0];
    persistActiveProject();
  }
}

function sortedDays(project) {
  return Object.values(project.days).sort((a, b) => {
    const dayA = parseInt(a.shootInfo.dayNumber, 10);
    const dayB = parseInt(b.shootInfo.dayNumber, 10);
    if (!isNaN(dayA) && !isNaN(dayB) && dayA !== dayB) return dayA - dayB;
    return (a.savedAt || 0) - (b.savedAt || 0);
  });
}

// ---------- state (current working day, unsaved draft) ----------

let state = {
  currentDayId: null,
  shootInfo: {},
  // key: "dept::category::item" -> { qty, note, dept, category, item }
  selections: {},
};

function itemKey(dept, cat, item) {
  return `${dept}::${cat}::${item}`;
}

function getCatalog(dept) {
  const base = BASE_CATALOG[dept];
  const extra = customCatalog[dept] || {};
  return base.map((catBlock) => {
    const extraItems = extra[catBlock.category] || [];
    return { category: catBlock.category, items: [...catBlock.items, ...extraItems] };
  });
}

// ---------- draft persistence ----------

function persistDraft() {
  saveJSON(LS_DRAFT, { activeProjectId, ...state });
}

function restoreDraft() {
  const draft = loadJSON(LS_DRAFT, null);
  if (draft) {
    if (draft.activeProjectId && projects[draft.activeProjectId]) activeProjectId = draft.activeProjectId;
    state = { currentDayId: draft.currentDayId || null, shootInfo: draft.shootInfo || {}, selections: draft.selections || {} };
  }
}

// ---------- toast ----------

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- shoot info ----------

function bindShootInfoFields() {
  SHOOT_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    el.value = state.shootInfo[id] || "";
    el.addEventListener("input", () => {
      state.shootInfo[id] = el.value;
      persistDraft();
      updateReport();
    });
  });
}

function defaultShootInfoIfEmpty() {
  if (!state.shootInfo.shootDate) {
    const today = new Date();
    state.shootInfo.shootDate = today.toISOString().slice(0, 10);
  }
}

// ---------- department rendering ----------

function selectedCountFor(dept) {
  return Object.keys(state.selections).filter(
    (k) => k.startsWith(dept + "::") && state.selections[k]
  ).length;
}

function totalSelectedCount() {
  return Object.keys(state.selections).length;
}

function renderAllDepartments() {
  DEPARTMENTS.forEach(renderDepartment);
  updateBadge();
}

function renderDepartment(dept) {
  const panel = document.getElementById(`tab-${dept}`);
  panel.innerHTML = "";

  const toolbar = document.createElement("div");
  toolbar.className = "dept-toolbar";
  toolbar.innerHTML = `
    <input type="search" placeholder="Search ${dept} equipment…" data-search="${dept}" />
    <button class="btn btn-small" data-action="expand-all" data-dept="${dept}">Expand All</button>
    <button class="btn btn-small" data-action="collapse-all" data-dept="${dept}">Collapse All</button>
    <span class="dept-summary" id="summary-${dept}"></span>
  `;
  panel.appendChild(toolbar);

  const list = document.createElement("div");
  list.className = "category-list";
  list.id = `list-${dept}`;
  panel.appendChild(list);

  getCatalog(dept).forEach((catBlock) => renderCategory(dept, catBlock, list));

  toolbar.querySelector("[data-search]").addEventListener("input", (e) => {
    filterDepartment(dept, e.target.value.trim().toLowerCase());
  });
  toolbar.querySelector('[data-action="expand-all"]').addEventListener("click", () => {
    list.querySelectorAll(".category").forEach((c) => c.classList.remove("collapsed"));
  });
  toolbar.querySelector('[data-action="collapse-all"]').addEventListener("click", () => {
    list.querySelectorAll(".category").forEach((c) => c.classList.add("collapsed"));
  });

  updateDeptSummary(dept);
}

function renderCategory(dept, catBlock, container) {
  const catEl = document.createElement("div");
  catEl.className = "category";
  catEl.dataset.category = catBlock.category;

  const header = document.createElement("div");
  header.className = "category-header";
  header.innerHTML = `
    <span class="chevron">▾</span>
    <span class="category-title">${catBlock.category}</span>
    <span class="category-count"></span>
    <span class="category-actions">
      <button class="btn btn-small" data-action="select-all">Select All</button>
      <button class="btn btn-small" data-action="clear-all">Clear</button>
    </span>
  `;
  header.addEventListener("click", (e) => {
    if (e.target.closest(".category-actions")) return;
    catEl.classList.toggle("collapsed");
  });
  header.querySelector('[data-action="select-all"]').addEventListener("click", (e) => {
    e.stopPropagation();
    catBlock.items.forEach((item) => setSelected(dept, catBlock.category, item, true));
    renderDepartment(dept);
  });
  header.querySelector('[data-action="clear-all"]').addEventListener("click", (e) => {
    e.stopPropagation();
    catBlock.items.forEach((item) => setSelected(dept, catBlock.category, item, false));
    renderDepartment(dept);
  });

  const body = document.createElement("div");
  body.className = "category-body";

  catBlock.items.forEach((item) => {
    body.appendChild(renderItemRow(dept, catBlock.category, item));
  });

  const addRow = document.createElement("div");
  addRow.className = "add-custom-row";
  addRow.innerHTML = `
    <input type="text" placeholder="Add custom item to ${catBlock.category}…" data-add-input />
    <button class="btn btn-small" data-add-btn>+ Add</button>
  `;
  addRow.querySelector("[data-add-btn]").addEventListener("click", () => {
    const input = addRow.querySelector("[data-add-input]");
    const name = input.value.trim();
    if (!name) return;
    addCustomItem(dept, catBlock.category, name);
    renderDepartment(dept);
  });
  addRow.querySelector("[data-add-input]").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addRow.querySelector("[data-add-btn]").click();
  });
  body.appendChild(addRow);

  catEl.appendChild(header);
  catEl.appendChild(body);
  container.appendChild(catEl);

  updateCategoryCount(catEl, dept, catBlock);
}

function renderItemRow(dept, category, item) {
  const key = itemKey(dept, category, item);
  const sel = state.selections[key];

  const row = document.createElement("div");
  row.className = "item-row" + (sel ? " checked" : "");
  row.dataset.item = item.toLowerCase();

  row.innerHTML = `
    <label>
      <input type="checkbox" ${sel ? "checked" : ""} />
      <span>${item}</span>
    </label>
    <div class="qty-controls">
      <button type="button" data-qty="dec">−</button>
      <input type="number" min="1" value="${sel ? sel.qty : 1}" />
      <button type="button" data-qty="inc">+</button>
    </div>
    <input type="text" class="item-note" placeholder="note…" value="${sel && sel.note ? sel.note : ""}" />
  `;

  const checkbox = row.querySelector('input[type="checkbox"]');
  const qtyInput = row.querySelector('input[type="number"]');
  const noteInput = row.querySelector(".item-note");

  checkbox.addEventListener("change", () => {
    row.classList.toggle("checked", checkbox.checked);
    if (checkbox.checked) {
      setSelected(dept, category, item, true, Number(qtyInput.value) || 1, noteInput.value);
    } else {
      setSelected(dept, category, item, false);
    }
    refreshUIAfterSelectionChange(dept, row);
  });

  qtyInput.addEventListener("change", () => {
    let v = Math.max(1, Math.floor(Number(qtyInput.value)) || 1);
    qtyInput.value = v;
    if (checkbox.checked) {
      setSelected(dept, category, item, true, v, noteInput.value);
      persistDraft();
      updateReport();
    }
  });

  row.querySelector('[data-qty="inc"]').addEventListener("click", () => {
    qtyInput.value = Math.max(1, (Number(qtyInput.value) || 1) + 1);
    qtyInput.dispatchEvent(new Event("change"));
    if (!checkbox.checked) { checkbox.checked = true; checkbox.dispatchEvent(new Event("change")); }
  });
  row.querySelector('[data-qty="dec"]').addEventListener("click", () => {
    qtyInput.value = Math.max(1, (Number(qtyInput.value) || 1) - 1);
    qtyInput.dispatchEvent(new Event("change"));
  });

  noteInput.addEventListener("input", () => {
    if (checkbox.checked) {
      setSelected(dept, category, item, true, Number(qtyInput.value) || 1, noteInput.value);
      persistDraft();
      updateReport();
    }
  });

  return row;
}

function refreshUIAfterSelectionChange(dept, row) {
  persistDraft();
  updateBadge();
  updateDeptSummary(dept);
  const catEl = row.closest(".category");
  updateCategoryCount(catEl, dept, { category: catEl.dataset.category, items: getItemsInCategory(dept, catEl.dataset.category) });
  updateReport();
}

function getItemsInCategory(dept, category) {
  const block = getCatalog(dept).find((c) => c.category === category);
  return block ? block.items : [];
}

function updateCategoryCount(catEl, dept, catBlock) {
  const selectedInCat = catBlock.items.filter(
    (item) => state.selections[itemKey(dept, catBlock.category, item)]
  ).length;
  catEl.querySelector(".category-count").textContent = `${selectedInCat}/${catBlock.items.length} selected`;
}

function updateDeptSummary(dept) {
  const el = document.getElementById(`summary-${dept}`);
  if (el) el.textContent = `${selectedCountFor(dept)} items selected`;
}

function updateBadge() {
  document.getElementById("selectedCount").textContent = totalSelectedCount();
}

function setSelected(dept, category, item, checked, qty = 1, note = "") {
  const key = itemKey(dept, category, item);
  if (checked) {
    state.selections[key] = { qty: Math.max(1, qty), note: note || "", dept, category, item };
  } else {
    delete state.selections[key];
  }
}

function addCustomItem(dept, category, name) {
  if (!customCatalog[dept]) customCatalog[dept] = {};
  if (!customCatalog[dept][category]) customCatalog[dept][category] = [];
  if (!customCatalog[dept][category].includes(name)) {
    customCatalog[dept][category].push(name);
    saveJSON(LS_CUSTOM, customCatalog);
  }
  setSelected(dept, category, name, true, 1, "");
  persistDraft();
  toast(`Added "${name}" to ${category}`);
}

function filterDepartment(dept, query) {
  const list = document.getElementById(`list-${dept}`);
  list.querySelectorAll(".category").forEach((catEl) => {
    const rows = catEl.querySelectorAll(".item-row");
    let anyMatch = false;
    rows.forEach((row) => {
      const match = !query || row.dataset.item.includes(query);
      row.style.display = match ? "" : "none";
      if (match) anyMatch = true;
    });
    const catNameMatch = catEl.dataset.category.toLowerCase().includes(query);
    catEl.style.display = anyMatch || !query ? "" : "none";
    if (query) catEl.classList.toggle("collapsed", !anyMatch && !catNameMatch);
  });
}

// ---------- single-day report ----------

function buildDayReportHTML(shootInfo, selections) {
  const info = shootInfo;
  const entries = Object.values(selections);
  const dayLabel = info.dayNumber
    ? `Day ${info.dayNumber}${info.totalDays ? ` of ${info.totalDays}` : ""}`
    : "";

  let html = "";
  html += `<h2>${info.productionTitle || "Untitled Production"}</h2>`;
  html += `<div class="report-header-grid">
    <div><b>Shooting Date</b>${formatDate(info.shootDate)}</div>
    <div><b>Filming Day</b>${dayLabel || "—"}</div>
    <div><b>Location</b>${info.location || "—"}</div>
    <div><b>Call Time</b>${info.callTime || "—"}</div>
    <div><b>Director</b>${info.director || "—"}</div>
    <div><b>DP</b>${info.dp || "—"}</div>
    <div><b>Gaffer</b>${info.gaffer || "—"}</div>
    <div><b>Key Grip</b>${info.keyGrip || "—"}</div>
    ${info.shootNotes ? `<div class="field-wide"><b>Notes</b>${info.shootNotes}</div>` : ""}
  </div>`;

  if (entries.length === 0) {
    html += `<div class="report-empty">No equipment selected yet. Check items in the Lighting or Grip tabs to build today's list.</div>`;
  } else {
    DEPARTMENTS.forEach((dept) => {
      const deptEntries = entries.filter((e) => e.dept === dept);
      if (deptEntries.length === 0) return;
      html += `<div class="report-dept-title ${dept}">${DEPT_LABELS[dept]} (${deptEntries.length} items, ${sumQty(deptEntries)} total qty)</div>`;

      const byCategory = {};
      deptEntries.forEach((e) => {
        if (!byCategory[e.category]) byCategory[e.category] = [];
        byCategory[e.category].push(e);
      });

      Object.keys(byCategory).forEach((cat) => {
        html += `<div class="report-cat-title">${cat}</div>`;
        html += `<table class="report-table"><thead><tr><th>Item</th><th class="qty-col">Qty</th><th>Note</th></tr></thead><tbody>`;
        byCategory[cat].forEach((e) => {
          html += `<tr><td>${e.item}</td><td class="qty-col">${e.qty}</td><td>${e.note || ""}</td></tr>`;
        });
        html += `</tbody></table>`;
      });
    });

    html += `<div class="report-totals">Total unique items: <b>${entries.length}</b> &nbsp;|&nbsp; Total quantity: <b>${sumQty(entries)}</b></div>`;
  }

  return html;
}

function updateReport() {
  document.getElementById("reportContent").innerHTML = buildDayReportHTML(state.shootInfo, state.selections);
}

function sumQty(entries) {
  return entries.reduce((sum, e) => sum + e.qty, 0);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// ---------- day-level export / save / load ----------

function exportCSV() {
  const entries = Object.values(state.selections);
  if (entries.length === 0) { toast("No items selected to export."); return; }
  const rows = [["Department", "Category", "Item", "Quantity", "Note"]];
  entries.forEach((e) => rows.push([DEPT_LABELS[e.dept], e.category, e.item, e.qty, e.note || ""]));
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  downloadBlob(csv, "text/csv;charset=utf-8;", `equipment-list_${state.shootInfo.shootDate || "undated"}_day${state.shootInfo.dayNumber || "x"}.csv`);
}

function csvEscape(val) {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(name) {
  return (name || "untitled").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "untitled";
}

function copyAsText() {
  const entries = Object.values(state.selections);
  const info = state.shootInfo;
  let text = `${info.productionTitle || "Untitled Production"}\n`;
  text += `Date: ${info.shootDate || "—"}  Day: ${info.dayNumber || "—"}${info.totalDays ? "/" + info.totalDays : ""}\n`;
  text += `Location: ${info.location || "—"}  Call Time: ${info.callTime || "—"}\n\n`;
  DEPARTMENTS.forEach((dept) => {
    const deptEntries = entries.filter((e) => e.dept === dept);
    if (deptEntries.length === 0) return;
    text += `${DEPT_LABELS[dept].toUpperCase()}\n`;
    const byCategory = {};
    deptEntries.forEach((e) => { (byCategory[e.category] ||= []).push(e); });
    Object.keys(byCategory).forEach((cat) => {
      text += `  ${cat}:\n`;
      byCategory[cat].forEach((e) => {
        text += `    - ${e.item} x${e.qty}${e.note ? ` (${e.note})` : ""}\n`;
      });
    });
    text += "\n";
  });
  navigator.clipboard.writeText(text).then(
    () => toast("Copied to clipboard!"),
    () => toast("Could not copy — clipboard permission denied.")
  );
}

function exportDayJSON() {
  const payload = { type: "eq-day", exportedAt: Date.now(), shootInfo: state.shootInfo, selections: state.selections };
  const info = state.shootInfo;
  downloadBlob(JSON.stringify(payload, null, 2), "application/json", `day_${slugify(info.shootDate)}_day${info.dayNumber || "x"}.json`);
  toast("Day exported as JSON.");
}

function importDayJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.shootInfo || !data.selections) throw new Error("bad shape");
      state.currentDayId = null;
      state.shootInfo = data.shootInfo;
      state.selections = data.selections;
      persistDraft();
      fullRerender();
      toast("Day imported. Review and Save List to add it to the active project.");
    } catch {
      toast("That file doesn't look like a valid day export.");
    }
  };
  reader.readAsText(file);
}

function saveCurrentDay() {
  const project = getActiveProject();
  if (!project) return;
  const nameInput = document.getElementById("saveListName");
  const info = state.shootInfo;
  const defaultName = `${info.shootDate || "undated"} — Day ${info.dayNumber || "?"}`;
  const name = nameInput.value.trim() || defaultName;

  const id = state.currentDayId && project.days[state.currentDayId] ? state.currentDayId : genId();
  project.days[id] = {
    id,
    name,
    savedAt: Date.now(),
    shootInfo: { ...state.shootInfo },
    selections: { ...state.selections },
  };
  project.updatedAt = Date.now();
  state.currentDayId = id;
  persistProjects();
  persistDraft();
  renderDaySelect();
  document.getElementById("savedListsSelect").value = id;
  nameInput.value = "";
  updateProjectSummary();
  toast(`Saved as "${name}" in "${project.name}"`);
}

function renderDaySelect() {
  const select = document.getElementById("savedListsSelect");
  const project = getActiveProject();
  select.innerHTML = `<option value="">— Select a day —</option>`;
  if (!project) return;
  sortedDays(project).forEach((day) => {
    const opt = document.createElement("option");
    opt.value = day.id;
    opt.textContent = day.name;
    select.appendChild(opt);
  });
  if (project.days[state.currentDayId]) select.value = state.currentDayId;
}

function loadDay(dayId) {
  const project = getActiveProject();
  const day = project && project.days[dayId];
  if (!day) { toast("Select a day first."); return; }
  state.currentDayId = day.id;
  state.shootInfo = { ...day.shootInfo };
  state.selections = { ...day.selections };
  persistDraft();
  fullRerender();
  toast(`Loaded "${day.name}"`);
}

function duplicateLastDay() {
  const project = getActiveProject();
  if (!project) return;
  const days = sortedDays(project);
  if (days.length === 0) { toast("No saved days yet in this project to duplicate."); return; }
  const last = days[days.length - 1];
  const newShootInfo = { ...last.shootInfo };
  newShootInfo.shootDate = new Date().toISOString().slice(0, 10);
  newShootInfo.callTime = "";
  newShootInfo.shootNotes = "";
  const dayNum = parseInt(newShootInfo.dayNumber, 10);
  if (!isNaN(dayNum)) newShootInfo.dayNumber = String(dayNum + 1);
  state.currentDayId = null;
  state.shootInfo = newShootInfo;
  state.selections = { ...last.selections };
  persistDraft();
  fullRerender();
  toast(`Duplicated equipment from "${last.name}" — update date/day and Save List.`);
}

function deleteSelectedDay() {
  const project = getActiveProject();
  const select = document.getElementById("savedListsSelect");
  const dayId = select.value;
  if (!project || !dayId || !project.days[dayId]) { toast("Select a day first."); return; }
  const name = project.days[dayId].name;
  if (!confirm(`Delete saved day "${name}"? This cannot be undone.`)) return;
  delete project.days[dayId];
  project.updatedAt = Date.now();
  if (state.currentDayId === dayId) state.currentDayId = null;
  persistProjects();
  persistDraft();
  renderDaySelect();
  updateProjectSummary();
  toast(`Deleted "${name}"`);
}

function newDay() {
  if (totalSelectedCount() > 0 && !confirm("Start a new blank day? Unsaved changes will be lost.")) return;
  state = { currentDayId: null, shootInfo: {}, selections: {} };
  defaultShootInfoIfEmpty();
  persistDraft();
  fullRerender();
  toast("Started a new day.");
}

// ---------- project-level actions ----------

function renderProjectSelect() {
  const select = document.getElementById("projectSelect");
  select.innerHTML = "";
  Object.values(projects)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${Object.keys(p.days).length} day${Object.keys(p.days).length === 1 ? "" : "s"})`;
      select.appendChild(opt);
    });
  select.value = activeProjectId;
}

function updateProjectSummary() {
  const project = getActiveProject();
  const el = document.getElementById("projectSummary");
  if (!project) { el.textContent = ""; return; }
  const days = sortedDays(project);
  const totalItems = days.reduce((sum, d) => sum + Object.keys(d.selections).length, 0);
  el.textContent = `${days.length} saved day${days.length === 1 ? "" : "s"} · ${totalItems} total item selections across the project`;
}

function switchToProject(id) {
  if (!projects[id]) return;
  activeProjectId = id;
  persistActiveProject();
  state = { currentDayId: null, shootInfo: {}, selections: {} };
  defaultShootInfoIfEmpty();
  persistDraft();
  renderProjectSelect();
  renderDaySelect();
  updateProjectSummary();
  fullRerender();
  toast(`Switched to project "${projects[id].name}"`);
}

function createNewProject() {
  const input = document.getElementById("newProjectName");
  const name = input.value.trim();
  if (!name) { toast("Enter a project name first."); return; }
  const project = createProjectRecord(name);
  projects[project.id] = project;
  persistProjects();
  input.value = "";
  switchToProject(project.id);
}

function renameActiveProject() {
  const project = getActiveProject();
  if (!project) return;
  const newName = prompt("Rename project:", project.name);
  if (!newName || !newName.trim()) return;
  project.name = newName.trim();
  project.updatedAt = Date.now();
  persistProjects();
  renderProjectSelect();
  toast("Project renamed.");
}

function deleteActiveProject() {
  const project = getActiveProject();
  if (!project) return;
  if (!confirm(`Delete project "${project.name}" and all ${Object.keys(project.days).length} saved day(s)? This cannot be undone.`)) return;
  delete projects[project.id];
  if (Object.keys(projects).length === 0) {
    const fresh = createProjectRecord("My Project");
    projects[fresh.id] = fresh;
    activeProjectId = fresh.id;
  } else {
    activeProjectId = Object.keys(projects).sort((a, b) => projects[b].updatedAt - projects[a].updatedAt)[0];
  }
  persistProjects();
  persistActiveProject();
  state = { currentDayId: null, shootInfo: {}, selections: {} };
  defaultShootInfoIfEmpty();
  persistDraft();
  renderProjectSelect();
  renderDaySelect();
  updateProjectSummary();
  fullRerender();
  toast("Project deleted.");
}

function exportProjectJSON() {
  const project = getActiveProject();
  if (!project) return;
  const payload = {
    type: "eq-project",
    exportedAt: Date.now(),
    name: project.name,
    days: Object.values(project.days),
  };
  downloadBlob(JSON.stringify(payload, null, 2), "application/json", `project_${slugify(project.name)}.json`);
  toast(`Exported "${project.name}" (${Object.keys(project.days).length} days).`);
}

function importProjectJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.days)) throw new Error("bad shape");
      let name = data.name || "Imported Project";
      const existingNames = new Set(Object.values(projects).map((p) => p.name));
      if (existingNames.has(name)) name = `${name} (imported)`;
      const project = createProjectRecord(name);
      data.days.forEach((day) => {
        const id = genId();
        project.days[id] = {
          id,
          name: day.name || `${day.shootInfo?.shootDate || "undated"} — Day ${day.shootInfo?.dayNumber || "?"}`,
          savedAt: day.savedAt || Date.now(),
          shootInfo: day.shootInfo || {},
          selections: day.selections || {},
        };
      });
      projects[project.id] = project;
      persistProjects();
      switchToProject(project.id);
      toast(`Imported project "${name}" with ${data.days.length} day(s).`);
    } catch {
      toast("That file doesn't look like a valid project export.");
    }
  };
  reader.readAsText(file);
}

// ---------- compile full project PDF ----------

const COMPILE_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  .cover { padding: 40px 36px 24px; border-bottom: 3px solid #111; }
  .cover h1 { margin: 0 0 6px; font-size: 1.8rem; }
  .cover p { color: #555; margin: 0 0 16px; }
  .report-page { padding: 28px 36px; page-break-after: always; }
  .report-page:last-child { page-break-after: auto; }
  h2 { margin: 0 0 4px; }
  .report-header-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 4px 20px; font-size: 0.85rem; margin: 12px 0 20px; border-bottom: 2px solid #111; padding-bottom: 14px; }
  .report-header-grid div b { display: block; font-size: 0.7rem; text-transform: uppercase; color: #666; letter-spacing: 0.03em; }
  .report-dept-title { font-size: 1.15rem; margin-top: 22px; padding: 6px 0; border-bottom: 2px solid #222; }
  .report-dept-title.lighting { border-color: #b8860b; }
  .report-dept-title.grip { border-color: #2266aa; }
  .report-cat-title { font-weight: 700; margin: 14px 0 4px; font-size: 0.92rem; color: #333; }
  table.report-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 0.88rem; }
  table.report-table th, table.report-table td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ddd; }
  table.report-table th { color: #555; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
  table.report-table td.qty-col, table.report-table th.qty-col { width: 60px; text-align: center; }
  .report-empty { color: #777; font-style: italic; padding: 30px 0; text-align: center; }
  .report-totals { margin-top: 20px; font-size: 0.85rem; color: #333; border-top: 1px solid #ccc; padding-top: 10px; }
  @media print { .report-page { page-break-after: always; } }
`;

function buildAggregateSummaryHTML(days) {
  const agg = {};
  days.forEach((day) => {
    Object.values(day.selections).forEach((e) => {
      const key = itemKey(e.dept, e.category, e.item);
      if (!agg[key]) agg[key] = { ...e, daysUsed: 0, totalQty: 0 };
      agg[key].daysUsed += 1;
      agg[key].totalQty += e.qty;
    });
  });
  const rows = Object.values(agg);
  if (rows.length === 0) return "";

  let html = `<h3>Aggregate Equipment Summary — Across All Days</h3>`;
  DEPARTMENTS.forEach((dept) => {
    const deptRows = rows.filter((r) => r.dept === dept);
    if (deptRows.length === 0) return;
    html += `<div class="report-dept-title ${dept}">${DEPT_LABELS[dept]}</div>`;
    const byCategory = {};
    deptRows.forEach((r) => { (byCategory[r.category] ||= []).push(r); });
    Object.keys(byCategory).forEach((cat) => {
      html += `<div class="report-cat-title">${cat}</div>`;
      html += `<table class="report-table"><thead><tr><th>Item</th><th class="qty-col">Days Used</th><th class="qty-col">Cumulative Qty</th></tr></thead><tbody>`;
      byCategory[cat]
        .sort((a, b) => a.item.localeCompare(b.item))
        .forEach((r) => {
          html += `<tr><td>${r.item}</td><td class="qty-col">${r.daysUsed}/${days.length}</td><td class="qty-col">${r.totalQty}</td></tr>`;
        });
      html += `</tbody></table>`;
    });
  });
  return html;
}

function compileProjectPDF() {
  const project = getActiveProject();
  if (!project) return;
  const days = sortedDays(project);
  if (days.length === 0) { toast("Save at least one day in this project first."); return; }

  const win = window.open("", "_blank");
  if (!win) { toast("Popup blocked — please allow popups for this site and try again."); return; }

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${project.name} — Full Equipment Report</title><style>${COMPILE_CSS}</style></head><body>`;
  html += `<div class="cover">
    <h1>${project.name}</h1>
    <p>${days.length} filming day(s) compiled — generated ${new Date().toLocaleString()}</p>
    ${buildAggregateSummaryHTML(days)}
  </div>`;
  days.forEach((day) => {
    html += `<div class="report-page">${buildDayReportHTML(day.shootInfo, day.selections)}</div>`;
  });
  html += `</body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ---------- tabs ----------

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "report") updateReport();
    });
  });
}

// ---------- action button bindings ----------

function bindProjectActions() {
  document.getElementById("projectSelect").addEventListener("change", (e) => switchToProject(e.target.value));
  document.getElementById("newProjectBtn").addEventListener("click", createNewProject);
  document.getElementById("newProjectName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createNewProject();
  });
  document.getElementById("renameProjectBtn").addEventListener("click", renameActiveProject);
  document.getElementById("deleteProjectBtn").addEventListener("click", deleteActiveProject);
  document.getElementById("exportProjectBtn").addEventListener("click", exportProjectJSON);
  document.getElementById("importProjectInput").addEventListener("change", (e) => {
    if (e.target.files[0]) importProjectJSON(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("compilePdfBtn").addEventListener("click", compileProjectPDF);
}

function bindDayActions() {
  document.getElementById("loadBtn").addEventListener("click", () => {
    loadDay(document.getElementById("savedListsSelect").value);
  });
  document.getElementById("duplicateBtn").addEventListener("click", duplicateLastDay);
  document.getElementById("newBtn").addEventListener("click", newDay);
  document.getElementById("deleteBtn").addEventListener("click", deleteSelectedDay);
}

function bindReportActions() {
  document.getElementById("saveListBtn").addEventListener("click", saveCurrentDay);
  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("csvBtn").addEventListener("click", exportCSV);
  document.getElementById("copyBtn").addEventListener("click", copyAsText);
  document.getElementById("exportDayJsonBtn").addEventListener("click", exportDayJSON);
  document.getElementById("importDayJsonInput").addEventListener("change", (e) => {
    if (e.target.files[0]) importDayJSON(e.target.files[0]);
    e.target.value = "";
  });
}

// ---------- init ----------

function fullRerender() {
  bindShootInfoFieldsValuesOnly();
  renderAllDepartments();
  updateReport();
}

function bindShootInfoFieldsValuesOnly() {
  SHOOT_FIELDS.forEach((id) => {
    document.getElementById(id).value = state.shootInfo[id] || "";
  });
}

function init() {
  ensureProjectsExist();
  restoreDraft();
  defaultShootInfoIfEmpty();
  bindShootInfoFields();
  bindTabs();
  bindProjectActions();
  bindDayActions();
  bindReportActions();
  renderProjectSelect();
  renderDaySelect();
  updateProjectSummary();
  renderAllDepartments();
  updateReport();
}

init();
