const BASE_CATALOG = { lighting: lightingData, grip: gripData };
const DEPARTMENTS = ["lighting", "grip"];

const LS_CUSTOM = "eq_customCatalog";
const LS_SAVED = "eq_savedLists";
const LS_DRAFT = "eq_currentDraft";

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

// ---------- state ----------

let customCatalog = loadJSON(LS_CUSTOM, { lighting: {}, grip: {} });
let savedLists = loadJSON(LS_SAVED, {});

let state = {
  shootInfo: {},
  // key: "dept::category::item" -> { qty, note }
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
  saveJSON(LS_DRAFT, state);
}

function restoreDraft() {
  const draft = loadJSON(LS_DRAFT, null);
  if (draft) {
    state = draft;
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

// ---------- report ----------

const DEPT_LABELS = { lighting: "Lighting", grip: "Grip" };

function updateReport() {
  const container = document.getElementById("reportContent");
  const entries = Object.values(state.selections);

  const info = state.shootInfo;
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

  container.innerHTML = html;
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

// ---------- export / save / load ----------

function exportCSV() {
  const entries = Object.values(state.selections);
  if (entries.length === 0) { toast("No items selected to export."); return; }
  const rows = [["Department", "Category", "Item", "Quantity", "Note"]];
  entries.forEach((e) => rows.push([DEPT_LABELS[e.dept], e.category, e.item, e.qty, e.note || ""]));
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const info = state.shootInfo;
  const filename = `equipment-list_${info.shootDate || "undated"}_day${info.dayNumber || "x"}.csv`;
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(val) {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

function saveCurrentList() {
  const nameInput = document.getElementById("saveListName");
  const info = state.shootInfo;
  const name = nameInput.value.trim() || `${info.shootDate || "undated"} — Day ${info.dayNumber || "?"}`;
  savedLists[name] = {
    savedAt: Date.now(),
    shootInfo: { ...state.shootInfo },
    selections: { ...state.selections },
  };
  saveJSON(LS_SAVED, savedLists);
  renderSavedListsDropdown();
  document.getElementById("savedListsSelect").value = name;
  toast(`Saved as "${name}"`);
}

function renderSavedListsDropdown() {
  const select = document.getElementById("savedListsSelect");
  const current = select.value;
  select.innerHTML = `<option value="">— Load a saved day —</option>`;
  Object.keys(savedLists)
    .sort((a, b) => (savedLists[b].savedAt || 0) - (savedLists[a].savedAt || 0))
    .forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  if (savedLists[current]) select.value = current;
}

function loadList(name) {
  const data = savedLists[name];
  if (!data) { toast("Select a saved list first."); return; }
  state.shootInfo = { ...data.shootInfo };
  state.selections = { ...data.selections };
  persistDraft();
  fullRerender();
  toast(`Loaded "${name}"`);
}

function duplicateLastDay() {
  const names = Object.keys(savedLists).sort((a, b) => (savedLists[b].savedAt || 0) - (savedLists[a].savedAt || 0));
  if (names.length === 0) { toast("No saved days yet to duplicate."); return; }
  const last = savedLists[names[0]];
  const newShootInfo = { ...last.shootInfo };
  newShootInfo.shootDate = new Date().toISOString().slice(0, 10);
  newShootInfo.callTime = "";
  newShootInfo.shootNotes = "";
  const dayNum = parseInt(newShootInfo.dayNumber, 10);
  if (!isNaN(dayNum)) newShootInfo.dayNumber = String(dayNum + 1);
  state.shootInfo = newShootInfo;
  state.selections = { ...last.selections };
  persistDraft();
  fullRerender();
  toast(`Duplicated equipment from "${names[0]}" — update date/day and re-save.`);
}

function deleteSelectedList() {
  const select = document.getElementById("savedListsSelect");
  const name = select.value;
  if (!name) { toast("Select a saved list first."); return; }
  if (!confirm(`Delete saved list "${name}"? This cannot be undone.`)) return;
  delete savedLists[name];
  saveJSON(LS_SAVED, savedLists);
  renderSavedListsDropdown();
  toast(`Deleted "${name}"`);
}

function newList() {
  if (totalSelectedCount() > 0 && !confirm("Start a new blank list? Unsaved changes will be lost.")) return;
  state = { shootInfo: {}, selections: {} };
  defaultShootInfoIfEmpty();
  persistDraft();
  fullRerender();
  toast("Started a new list.");
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

// ---------- header action buttons ----------

function bindHeaderActions() {
  document.getElementById("loadBtn").addEventListener("click", () => {
    const name = document.getElementById("savedListsSelect").value;
    loadList(name);
  });
  document.getElementById("duplicateBtn").addEventListener("click", duplicateLastDay);
  document.getElementById("newBtn").addEventListener("click", newList);
  document.getElementById("deleteBtn").addEventListener("click", deleteSelectedList);

  document.getElementById("saveListBtn").addEventListener("click", saveCurrentList);
  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("csvBtn").addEventListener("click", exportCSV);
  document.getElementById("copyBtn").addEventListener("click", copyAsText);
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
  restoreDraft();
  defaultShootInfoIfEmpty();
  bindShootInfoFields();
  bindTabs();
  bindHeaderActions();
  renderSavedListsDropdown();
  renderAllDepartments();
  updateReport();
}

init();
