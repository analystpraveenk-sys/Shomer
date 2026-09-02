/* ---------- Categories ---------- */
const CATEGORIES = {
  Housing: ["Rent/EMI", "Maintenance", "Utilities", "Internet"],
  Food: ["Groceries", "Dining Out", "Delivery"],
  Transport: ["Fuel", "Cabs/Auto", "Public Transport", "Vehicle Maintenance"],
  Subscriptions: ["OTT", "Apps/SaaS", "Memberships"],
  Health: ["Medical/Doctor", "Fitness", "Insurance", "Pharmacy"],
  Personal: ["Grooming", "Clothing", "Gadgets/Electronics"],
  "Family/Social": ["Gifts", "Outings", "Family Support"],
  Learning: ["Courses", "Books", "Certifications"],
  Misc: ["Uncategorized", "One-off"]
};
const SAVING_CATEGORIES = { "Investments/Savings": ["SIP", "Deposit", "Stocks", "Emergency Fund"] };
const INCOME_CATEGORIES = { Income: ["Salary", "Freelance/Side Income", "Gift Received", "Interest/Returns", "Other"] };

const CAT_COLORS = ["#B8923F","#4F7D75","#B5502F","#7B8FA1","#9B7EBD","#C2A15C","#5E9E8F","#A65A5A","#7C7361"];

/* ---------- IndexedDB wrapper ---------- */
const DB_NAME = "shomer-db";
const STORE = "entries";
const BUDGET_STORE = "budgets";
const RECURRING_STORE = "recurring";
const GOAL_STORE = "goals";
let dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 2);
  req.onupgradeneeded = (evt) => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) {
      const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("date", "date");
      store.createIndex("type", "type");
    }
    if (!db.objectStoreNames.contains(BUDGET_STORE)) {
      db.createObjectStore(BUDGET_STORE, { keyPath: "category" });
    }
    if (!db.objectStoreNames.contains(RECURRING_STORE)) {
      db.createObjectStore(RECURRING_STORE, { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains(GOAL_STORE)) {
      db.createObjectStore(GOAL_STORE, { keyPath: "id", autoIncrement: true });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function storeGetAll(storeName) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function storePut(storeName, value) {
  const db = await dbPromise;
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  await txDone(tx);
}
async function storeDelete(storeName, key) {
  const db = await dbPromise;
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  await txDone(tx);
}
async function storeClear(storeName) {
  const db = await dbPromise;
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).clear();
  await txDone(tx);
}

async function addEntry(entry) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllEntries() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- Helpers ---------- */
function fmt(n) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function monthKey(d) { return d.slice(0, 7); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

/* ---------- App state ---------- */
let allEntries = [];
let allBudgets = [];
let allRecurring = [];
let allGoals = [];
let currentType = "expense";
let selectedTags = new Set();
let trendRange = 6;
let debtDirection = "borrowed";
let debtStatus = "pending";
let isRecurringToggle = false;

/* ---------- Theme ---------- */
const THEME_KEY = "shomer-theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  document.getElementById("themeToggle").textContent = theme === "light" ? "☾" : "☀";
}
applyTheme(localStorage.getItem(THEME_KEY) || "dark");
document.getElementById("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(next);
  renderCategories();
  renderTrends();
});

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- Init ---------- */
document.getElementById("f-date").value = todayISO();
populateCategorySelect();

async function refresh() {
  allEntries = await getAllEntries();
  allBudgets = await storeGetAll(BUDGET_STORE);
  allRecurring = await storeGetAll(RECURRING_STORE);
  allGoals = await storeGetAll(GOAL_STORE);
  renderOverview();
  renderCategories();
  renderTrends();
  renderLeaks();
  renderSave();
  renderIncome();
  renderDebt();
  renderBudgets();
  renderRecurring();
  renderGoals();
}

async function generateDueRecurring() {
  const currentMonth = thisMonthKey();
  let created = false;
  for (const r of allRecurring) {
    if (r.lastGeneratedMonth === currentMonth) continue;
    const day = Math.min(r.dayOfMonth || 1, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
    const date = `${currentMonth}-${String(day).padStart(2, "0")}`;
    await addEntry({
      type: r.type,
      amount: r.amount,
      date,
      category: r.category,
      subcategory: r.subcategory,
      note: r.note ? r.note + " (recurring)" : "Recurring",
      paymentMethod: r.paymentMethod || "",
      tags: r.type === "expense" ? ["recurring"] : []
    });
    r.lastGeneratedMonth = currentMonth;
    await storePut(RECURRING_STORE, r);
    created = true;
  }
  return created;
}

(async function init() {
  allRecurring = await storeGetAll(RECURRING_STORE);
  const created = await generateDueRecurring();
  await refresh();
  if (created) console.log("Recurring entries added for this month.");
})();

/* ---------- Navigation ---------- */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
document.getElementById("ov-leak-block").addEventListener("click", () => switchView("leaks"));
document.getElementById("ov-saved-block").addEventListener("click", () => openMoreSegment("save"));
document.getElementById("ov-debt-block").addEventListener("click", () => openMoreSegment("debt"));

function openMoreSegment(seg) {
  switchView("more");
  document.querySelectorAll("#moreSegmentToggle button").forEach(b => b.classList.toggle("active", b.dataset.segment === seg));
  document.querySelectorAll(".segment").forEach(s => s.classList.toggle("active", s.id === "segment-" + seg));
}

document.getElementById("moreSegmentToggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const seg = btn.dataset.segment;
  document.querySelectorAll("#moreSegmentToggle button").forEach(b => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".segment").forEach(s => s.classList.toggle("active", s.id === "segment-" + seg));
});

function switchView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.dataset.view === name));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
}

/* ---------- Modal ---------- */
const modal = document.getElementById("addModal");
document.getElementById("addBtn").addEventListener("click", () => {
  modal.classList.remove("hidden");
});
document.getElementById("closeModal").addEventListener("click", () => modal.classList.add("hidden"));

function categorySourceFor(type) {
  if (type === "expense") return CATEGORIES;
  if (type === "saving") return SAVING_CATEGORIES;
  if (type === "income") return INCOME_CATEGORIES;
  return null; // debt has no category system
}

document.getElementById("entryTypeToggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll("#entryTypeToggle button").forEach(b => b.classList.toggle("active", b === btn));
  applyFieldVisibility();
  populateCategorySelect();
});

function applyFieldVisibility() {
  const isDebt = currentType === "debt";
  document.getElementById("categoryFieldWrap").style.display = isDebt ? "none" : "block";
  document.getElementById("subcategoryFieldWrap").style.display = isDebt ? "none" : "block";
  document.getElementById("tagsFieldWrap").style.display = currentType === "expense" ? "block" : "none";
  document.getElementById("paymentFieldWrap").style.display = isDebt ? "none" : "block";
  document.getElementById("debtDirectionWrap").style.display = isDebt ? "block" : "none";
  document.getElementById("counterpartyFieldWrap").style.display = isDebt ? "block" : "none";
  document.getElementById("debtStatusWrap").style.display = isDebt ? "block" : "none";
  document.getElementById("f-category").required = !isDebt;
}
applyFieldVisibility();

function populateCategorySelect() {
  const source = categorySourceFor(currentType);
  const catSel = document.getElementById("f-category");
  if (!source) { catSel.innerHTML = ""; document.getElementById("f-subcategory").innerHTML = ""; return; }
  catSel.innerHTML = Object.keys(source).map(c => `<option value="${c}">${c}</option>`).join("");
  updateSubcategorySelect();
}
document.getElementById("f-category").addEventListener("change", updateSubcategorySelect);

function updateSubcategorySelect() {
  const source = categorySourceFor(currentType);
  if (!source) return;
  const cat = document.getElementById("f-category").value;
  const subSel = document.getElementById("f-subcategory");
  subSel.innerHTML = (source[cat] || []).map(s => `<option value="${s}">${s}</option>`).join("");
}

document.getElementById("debtDirectionToggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  debtDirection = btn.dataset.direction;
  document.querySelectorAll("#debtDirectionToggle button").forEach(b => b.classList.toggle("active", b === btn));
});

document.getElementById("debtStatusToggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  debtStatus = btn.dataset.status;
  document.querySelectorAll("#debtStatusToggle button").forEach(b => b.classList.toggle("active", b === btn));
});

document.getElementById("tagPicker").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const tag = btn.dataset.tag;
  if (selectedTags.has(tag)) { selectedTags.delete(tag); btn.classList.remove("active"); }
  else { selectedTags.add(tag); btn.classList.add("active"); }
});

document.getElementById("entryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const base = {
    type: currentType,
    amount: parseFloat(document.getElementById("f-amount").value),
    date: document.getElementById("f-date").value,
    note: document.getElementById("f-note").value.trim()
  };

  let entry;
  if (currentType === "debt") {
    entry = {
      ...base,
      direction: debtDirection,
      counterparty: document.getElementById("f-counterparty").value.trim(),
      status: debtStatus,
      category: "Debt & Lending",
      subcategory: debtDirection === "borrowed" ? "Borrowed" : "Lent",
      paymentMethod: "",
      tags: []
    };
  } else {
    entry = {
      ...base,
      category: document.getElementById("f-category").value,
      subcategory: document.getElementById("f-subcategory").value,
      paymentMethod: document.getElementById("f-payment").value,
      tags: currentType === "expense" ? Array.from(selectedTags) : []
    };
  }

  await addEntry(entry);

  // reset form
  document.getElementById("entryForm").reset();
  document.getElementById("f-date").value = todayISO();
  selectedTags.clear();
  document.querySelectorAll("#tagPicker button").forEach(b => b.classList.remove("active"));
  debtDirection = "borrowed"; debtStatus = "pending";
  document.querySelectorAll("#debtDirectionToggle button").forEach((b,i) => b.classList.toggle("active", i === 0));
  document.querySelectorAll("#debtStatusToggle button").forEach((b,i) => b.classList.toggle("active", i === 0));
  modal.classList.add("hidden");

  await refresh();
});

async function updateEntry(entry) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteEntryById(id) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function wireDeleteButtons(container) {
  container.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      if (!confirm("Delete this entry?")) return;
      await deleteEntryById(id);
      await refresh();
    });
  });
}

/* ---------- Derived data ---------- */
function expenses() { return allEntries.filter(e => e.type === "expense"); }
function savings() { return allEntries.filter(e => e.type === "saving"); }
function incomes() { return allEntries.filter(e => e.type === "income"); }
function debts() { return allEntries.filter(e => e.type === "debt"); }
function thisMonthKey() { return monthKey(todayISO()); }
function lastMonthKey() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

/* ---------- Overview / Dashboard ---------- */
function renderOverview() {
  const ex = expenses();
  const inc = incomes();
  const thisMonthEx = ex.filter(e => monthKey(e.date) === thisMonthKey());
  const thisMonthInc = inc.filter(e => monthKey(e.date) === thisMonthKey());
  const totalExThis = thisMonthEx.reduce((s, e) => s + e.amount, 0);
  const totalIncThis = thisMonthInc.reduce((s, e) => s + e.amount, 0);
  const net = totalIncThis - totalExThis;

  document.getElementById("ov-net").textContent = (net < 0 ? "-" : "") + fmt(Math.abs(net));
  document.getElementById("ov-net-breakdown").textContent =
    `Income ${fmt(totalIncThis)} · Expenses ${fmt(totalExThis)}`;

  // pace (spend only)
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const dailyAvg = dayOfMonth > 0 ? totalExThis / dayOfMonth : 0;
  const projected = dailyAvg * daysInMonth;
  document.getElementById("ov-pace").textContent =
    totalExThis > 0 ? `${fmt(projected)} by month end (${daysLeft}d left)` : "—";

  // saved all time
  const savedTotal = savings().reduce((s, e) => s + e.amount, 0);
  document.getElementById("ov-saved").textContent = fmt(savedTotal);

  // debt snapshot
  const dbtList = debts();
  const oweTotal = dbtList.filter(e => e.direction === "borrowed" && e.status === "pending")
    .reduce((s, e) => s + e.amount, 0);
  const owedTotal = dbtList.filter(e => e.direction === "lent" && e.status === "pending")
    .reduce((s, e) => s + e.amount, 0);
  document.getElementById("ov-owe").textContent = fmt(oweTotal);
  document.getElementById("ov-owed").textContent = fmt(owedTotal);

  // leak
  const leakThisYear = ex.filter(e => e.date.slice(0,4) === todayISO().slice(0,4) && e.tags.includes("avoidable"));
  const leakTotal = leakThisYear.reduce((s, e) => s + e.amount, 0);
  document.getElementById("ov-leak-amount").textContent = fmt(leakTotal);

  // top categories this month
  const byCategory = {};
  thisMonthEx.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const maxVal = sorted.length ? sorted[0][1] : 1;
  const container = document.getElementById("ov-top-categories");
  container.innerHTML = sorted.length ? sorted.map(([name, amt]) => `
    <div>
      <div class="mini-row"><span class="name">${name}</span><span class="amt">${fmt(amt)}</span></div>
      <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${(amt/maxVal*100).toFixed(0)}%"></div></div>
    </div>
  `).join("") : `<div class="empty-note">No expenses logged this month yet.</div>`;
}

/* ---------- Categories view ---------- */
function renderCategories() {
  const ex = expenses();
  const byCategory = {};
  ex.forEach(e => {
    byCategory[e.category] = byCategory[e.category] || { total: 0, subs: {} };
    byCategory[e.category].total += e.amount;
    byCategory[e.category].subs[e.subcategory] = (byCategory[e.category].subs[e.subcategory] || 0) + e.amount;
  });
  const entries = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);

  drawPieChart(document.getElementById("cat-chart"), entries.map(([name, v]) => ({ name, value: v.total })));

  const list = document.getElementById("cat-list");
  list.innerHTML = entries.length ? entries.map(([name, v], i) => `
    <div class="category-group">
      <div class="category-group-header">
        <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${CAT_COLORS[i % CAT_COLORS.length]};margin-right:8px;"></span>${name}</span>
        <span class="amt">${fmt(v.total)}</span>
      </div>
      ${Object.entries(v.subs).sort((a,b)=>b[1]-a[1]).map(([s, amt]) => `
        <div class="subcat-row"><span>${s}</span><span>${fmt(amt)}</span></div>
      `).join("")}
    </div>
  `).join("") : `<div class="empty-note">Log an expense to see the breakdown.</div>`;
}

function drawPieChart(canvas, data) {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    ctx.fillStyle = cssVar('--parchment-dim') || "#A9A499";
    ctx.font = "14px IBM Plex Sans";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", size / 2, size / 2);
    return;
  }
  let start = -Math.PI / 2;
  const cx = size / 2, cy = size / 2, r = size / 2 - 10;
  data.forEach((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = CAT_COLORS[i % CAT_COLORS.length];
    ctx.fill();
    start += angle;
  });
  // inner hole for donut feel
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = cssVar('--ink-2') || "#12141A";
  ctx.fill();
}

/* ---------- Trends view ---------- */
document.getElementById("range-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  trendRange = btn.dataset.range === "all" ? "all" : parseInt(btn.dataset.range);
  document.querySelectorAll("#range-toggle button").forEach(b => b.classList.toggle("active", b === btn));
  renderTrends();
});

function renderTrends() {
  const ex = expenses();
  const byMonth = {};
  ex.forEach(e => { byMonth[monthKey(e.date)] = (byMonth[monthKey(e.date)] || 0) + e.amount; });

  let months = Object.keys(byMonth).sort();
  if (trendRange !== "all") months = months.slice(-trendRange);
  const values = months.map(m => byMonth[m]);

  drawLineChart(document.getElementById("trend-chart"), months, values);

  // payment methods
  const byPayment = {};
  ex.forEach(e => { byPayment[e.paymentMethod] = (byPayment[e.paymentMethod] || 0) + e.amount; });
  const sorted = Object.entries(byPayment).sort((a, b) => b[1] - a[1]);
  const maxVal = sorted.length ? sorted[0][1] : 1;
  document.getElementById("payment-list").innerHTML = sorted.length ? sorted.map(([name, amt]) => `
    <div>
      <div class="mini-row"><span class="name">${name}</span><span class="amt">${fmt(amt)}</span></div>
      <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${(amt/maxVal*100).toFixed(0)}%"></div></div>
    </div>
  `).join("") : `<div class="empty-note">No expenses logged yet.</div>`;
}

function drawLineChart(canvas, labels, values) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (values.length === 0) {
    ctx.fillStyle = cssVar('--parchment-dim') || "#A9A499";
    ctx.font = "14px IBM Plex Sans";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", w / 2, h / 2);
    return;
  }
  const pad = 30;
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const brass = cssVar('--brass') || "#B8923F";
  const dim = cssVar('--parchment-dim') || "#A9A499";

  // axis line
  ctx.strokeStyle = cssVar('--line') || "rgba(237,231,218,0.15)";
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  // line path
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + stepX * i;
    const y = h - pad - (v / max) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = brass;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // dots + labels
  ctx.fillStyle = brass;
  values.forEach((v, i) => {
    const x = pad + stepX * i;
    const y = h - pad - (v / max) * (h - pad * 2);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = dim;
  ctx.font = "10px IBM Plex Sans";
  ctx.textAlign = "center";
  labels.forEach((m, i) => {
    const x = pad + stepX * i;
    ctx.fillText(m.slice(2).replace("-", "/"), x, h - pad + 14);
  });
}

/* ---------- Leaks view ---------- */
function renderLeaks() {
  const flagged = expenses().filter(e => e.tags.includes("avoidable") || e.tags.includes("impulse"))
    .sort((a, b) => b.amount - a.amount);
  const total = flagged.reduce((s, e) => s + e.amount, 0);
  document.getElementById("leak-total").textContent = fmt(total);

  document.getElementById("leak-list").innerHTML = flagged.length ? flagged.map(e => `
    <div class="entry-row">
      <div>
        <div>${e.note || e.subcategory || e.category}</div>
        <div class="entry-meta">${e.category} · ${e.date} · ${e.tags.join(", ")}</div>
      </div>
      <div class="entry-right">
        <div class="entry-amt rust">${fmt(e.amount)}</div>
        <button class="delete-btn" data-id="${e.id}" aria-label="Delete">×</button>
      </div>
    </div>
  `).join("") : `<div class="empty-note">Nothing flagged yet — tag entries "avoidable" or "impulse" when logging.</div>`;
  wireDeleteButtons(document.getElementById("leak-list"));
}

/* ---------- Save view ---------- */
function renderSave() {
  const sv = savings().sort((a, b) => new Date(b.date) - new Date(a.date));
  const total = sv.reduce((s, e) => s + e.amount, 0);
  document.getElementById("save-total").textContent = fmt(total);

  document.getElementById("save-list").innerHTML = sv.length ? sv.map(e => `
    <div class="entry-row">
      <div>
        <div>${e.note || e.subcategory || e.category}</div>
        <div class="entry-meta">${e.subcategory} · ${e.date}</div>
      </div>
      <div class="entry-right">
        <div class="entry-amt sage">${fmt(e.amount)}</div>
        <button class="delete-btn" data-id="${e.id}" aria-label="Delete">×</button>
      </div>
    </div>
  `).join("") : `<div class="empty-note">No savings or investments logged yet.</div>`;
  wireDeleteButtons(document.getElementById("save-list"));
}

/* ---------- Income view ---------- */
function renderIncome() {
  const inc = incomes().sort((a, b) => new Date(b.date) - new Date(a.date));
  const total = inc.reduce((s, e) => s + e.amount, 0);
  document.getElementById("income-total").textContent = fmt(total);

  document.getElementById("income-list").innerHTML = inc.length ? inc.map(e => `
    <div class="entry-row">
      <div>
        <div>${e.note || e.subcategory || e.category}</div>
        <div class="entry-meta">${e.subcategory} · ${e.date}</div>
      </div>
      <div class="entry-right">
        <div class="entry-amt sage">${fmt(e.amount)}</div>
        <button class="delete-btn" data-id="${e.id}" aria-label="Delete">×</button>
      </div>
    </div>
  `).join("") : `<div class="empty-note">No income logged yet.</div>`;
  wireDeleteButtons(document.getElementById("income-list"));
}

/* ---------- Debt & Lending view ---------- */
function renderDebt() {
  const list = debts().sort((a, b) => new Date(b.date) - new Date(a.date));

  const oweTotal = list.filter(e => e.direction === "borrowed" && e.status === "pending")
    .reduce((s, e) => s + e.amount, 0);
  const owedTotal = list.filter(e => e.direction === "lent" && e.status === "pending")
    .reduce((s, e) => s + e.amount, 0);
  document.getElementById("debt-owe-total").textContent = fmt(oweTotal);
  document.getElementById("debt-owed-total").textContent = fmt(owedTotal);

  document.getElementById("debt-list").innerHTML = list.length ? list.map(e => `
    <div class="entry-row debt-row" data-id="${e.id}">
      <div>
        <div>${e.direction === "borrowed" ? "Borrowed from" : "Lent to"} ${e.counterparty || "someone"}
          <span class="status-badge ${e.status}">${e.status}</span>
        </div>
        <div class="entry-meta">${e.note ? e.note + " · " : ""}${e.date}</div>
      </div>
      <div class="entry-right">
        <div class="entry-amt ${e.direction === "borrowed" ? "rust" : "sage"}">${fmt(e.amount)}</div>
        <button class="delete-btn" data-id="${e.id}" aria-label="Delete">×</button>
      </div>
    </div>
  `).join("") : `<div class="empty-note">No debt or lending logged yet.</div>`;
  wireDeleteButtons(document.getElementById("debt-list"));

  document.querySelectorAll(".debt-row").forEach(row => {
    row.style.cursor = "pointer";
    row.addEventListener("click", async () => {
      const id = parseInt(row.dataset.id);
      const entry = allEntries.find(e => e.id === id);
      if (!entry) return;
      entry.status = entry.status === "pending" ? "repaid" : "pending";
      await updateEntry(entry);
      await refresh();
    });
  });
}

document.getElementById("report-month").value = todayISO().slice(0, 7);
document.getElementById("downloadReportBtn").addEventListener("click", downloadMonthlyReport);

function downloadMonthlyReport() {
  const month = document.getElementById("report-month").value;
  if (!month) { alert("Pick a month first."); return; }
  const monthEntries = allEntries.filter(e => monthKey(e.date) === month)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!monthEntries.length) { alert("No entries for that month."); return; }

  const rows = monthEntries.map(e => ({
    Type: e.type,
    Date: e.date,
    Category: e.category || "",
    Subcategory: e.subcategory || "",
    Amount: e.amount,
    Note: e.note || "",
    "Payment Method": e.paymentMethod || "",
    "Tags / Status": e.type === "debt" ? `${e.direction}/${e.status}` : (e.tags || []).join(", "),
    Counterparty: e.counterparty || ""
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{wch:10},{wch:12},{wch:16},{wch:18},{wch:10},{wch:24},{wch:14},{wch:16},{wch:16}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, month);
  XLSX.writeFile(wb, `shomer-report-${month}.xlsx`);
}

/* ---------- Budgets ---------- */
function renderBudgets() {
  const ex = expenses().filter(e => monthKey(e.date) === thisMonthKey());
  const byCategory = {};
  ex.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
  const budgetMap = {};
  allBudgets.forEach(b => { budgetMap[b.category] = b.amount; });

  const list = document.getElementById("budget-list");
  list.innerHTML = Object.keys(CATEGORIES).map(cat => {
    const spent = byCategory[cat] || 0;
    const budget = budgetMap[cat] || 0;
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const cls = budget > 0 && spent > budget ? "budget-over" : (budget > 0 && spent / budget >= 0.8 ? "budget-near" : "");
    return `
      <div class="budget-row ${cls}">
        <div class="mini-row"><span class="name">${cat}</span><span class="amt">${fmt(spent)} ${budget ? "/ " + fmt(budget) : ""}</span></div>
        <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
        <div style="margin-top:6px;"><input type="number" min="0" data-cat="${cat}" class="budget-input" placeholder="Set monthly budget" value="${budget || ""}"></div>
      </div>`;
  }).join("");

  list.querySelectorAll(".budget-input").forEach(input => {
    input.addEventListener("change", async () => {
      const cat = input.dataset.cat;
      const val = parseFloat(input.value);
      if (!val || val <= 0) { await storeDelete(BUDGET_STORE, cat); }
      else { await storePut(BUDGET_STORE, { category: cat, amount: val }); }
      await refresh();
    });
  });
}

/* ---------- Recurring ---------- */
function populateRecurringCategorySelect() {
  const type = document.getElementById("rec-type").value;
  const source = categorySourceFor(type);
  const sel = document.getElementById("rec-category");
  sel.innerHTML = Object.keys(source).map(c => `<option value="${c}">${c}</option>`).join("");
  updateRecurringSubcategorySelect();
}
function updateRecurringSubcategorySelect() {
  const type = document.getElementById("rec-type").value;
  const source = categorySourceFor(type);
  const cat = document.getElementById("rec-category").value;
  document.getElementById("rec-subcategory").innerHTML = (source[cat] || []).map(s => `<option value="${s}">${s}</option>`).join("");
}
document.getElementById("rec-type").addEventListener("change", populateRecurringCategorySelect);
document.getElementById("rec-category").addEventListener("change", updateRecurringSubcategorySelect);
populateRecurringCategorySelect();

document.getElementById("rec-add-btn").addEventListener("click", async () => {
  const amount = parseFloat(document.getElementById("rec-amount").value);
  if (!amount || amount <= 0) { alert("Enter a valid amount."); return; }
  const template = {
    type: document.getElementById("rec-type").value,
    category: document.getElementById("rec-category").value,
    subcategory: document.getElementById("rec-subcategory").value,
    amount,
    dayOfMonth: parseInt(document.getElementById("rec-day").value) || 1,
    note: document.getElementById("rec-note").value.trim(),
    paymentMethod: "",
    lastGeneratedMonth: null
  };
  await storePut(RECURRING_STORE, template);
  document.getElementById("rec-amount").value = "";
  document.getElementById("rec-note").value = "";
  allRecurring = await storeGetAll(RECURRING_STORE);
  await generateDueRecurring();
  await refresh();
});

function renderRecurring() {
  const list = document.getElementById("recurring-list");
  list.innerHTML = allRecurring.length ? allRecurring.map(r => `
    <div class="entry-row recurring-row">
      <div>
        <div>${r.category} · ${r.subcategory} ${r.note ? "— " + r.note : ""}</div>
        <div class="entry-meta">${r.type} · day ${r.dayOfMonth} of each month</div>
      </div>
      <div class="entry-right">
        <div class="entry-amt">${fmt(r.amount)}</div>
        <button class="delete-btn" data-rec-id="${r.id}" aria-label="Delete">×</button>
      </div>
    </div>
  `).join("") : `<div class="empty-note">No recurring entries set up yet.</div>`;

  list.querySelectorAll("[data-rec-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this recurring entry template? Past generated entries stay.")) return;
      await storeDelete(RECURRING_STORE, parseInt(btn.dataset.recId));
      allRecurring = await storeGetAll(RECURRING_STORE);
      await refresh();
    });
  });
}

/* ---------- Goals & Emergency Fund ---------- */
function renderGoals() {
  const savedBySubcat = {};
  savings().forEach(e => { savedBySubcat[e.subcategory] = (savedBySubcat[e.subcategory] || 0) + e.amount; });

  const list = document.getElementById("goal-list");
  list.innerHTML = allGoals.length ? allGoals.map(g => {
    const current = g.subcategory ? (savedBySubcat[g.subcategory] || 0) : (g.manualCurrent || 0);
    const pct = g.targetAmount > 0 ? Math.min((current / g.targetAmount) * 100, 100) : 0;
    return `
      <div class="goal-item">
        <div class="mini-row">
          <span class="name">${g.name}<button class="goal-delete" data-goal-id="${g.id}">✕</button></span>
          <span class="amt">${fmt(current)} / ${fmt(g.targetAmount)}</span>
        </div>
        <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join("") : `<div class="empty-note">No goals yet — add one below, or use the emergency fund calculator.</div>`;

  list.querySelectorAll(".goal-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      await storeDelete(GOAL_STORE, parseInt(btn.dataset.goalId));
      allGoals = await storeGetAll(GOAL_STORE);
      renderGoals();
    });
  });

  renderEmergencyFundCalculator();
}

document.getElementById("goal-add-btn").addEventListener("click", async () => {
  const name = document.getElementById("goal-name").value.trim();
  const amount = parseFloat(document.getElementById("goal-amount").value);
  if (!name || !amount || amount <= 0) { alert("Enter a goal name and target amount."); return; }
  await storePut(GOAL_STORE, { name, targetAmount: amount, subcategory: null });
  document.getElementById("goal-name").value = "";
  document.getElementById("goal-amount").value = "";
  allGoals = await storeGetAll(GOAL_STORE);
  renderGoals();
});

function renderEmergencyFundCalculator() {
  const ex = expenses();
  const essentialCats = ["Housing", "Food", "Transport", "Health"];
  const essential = ex.filter(e => essentialCats.includes(e.category) || e.tags.includes("essential"));
  const months = new Set(essential.map(e => monthKey(e.date)));
  const monthCount = Math.max(months.size, 1);
  const avgMonthly = essential.reduce((s, e) => s + e.amount, 0) / monthCount;

  const summaryEl = document.getElementById("ef-summary");
  if (essential.length === 0) {
    summaryEl.innerHTML = `<span class="empty-note">Log a few months of essential expenses (Housing, Food, Transport, Health) to get a personalized estimate.</span>`;
  } else {
    summaryEl.innerHTML = `<span class="row-label">Avg. essential spend/month (${monthCount} mo. logged)</span><span class="row-value">${fmt(avgMonthly)}</span>`;
  }

  const monthsCover = parseInt(document.getElementById("ef-months").value);
  const timeline = parseInt(document.getElementById("ef-timeline").value);
  const target = avgMonthly * monthsCover;
  const monthlySaving = target / timeline;

  document.getElementById("ef-result").textContent = essential.length
    ? `Target: ${fmt(target)} (${monthsCover} months of cover). Save ${fmt(monthlySaving)}/month to reach it in ${timeline} months.`
    : "";

  document.getElementById("ef-set-goal").onclick = async () => {
    if (!essential.length) { alert("Log some essential expenses first so the calculator has real numbers to work from."); return; }
    await storePut(GOAL_STORE, { name: "Emergency Fund", targetAmount: Math.round(target), subcategory: "Emergency Fund" });
    allGoals = await storeGetAll(GOAL_STORE);
    renderGoals();
  };
}
document.getElementById("ef-months").addEventListener("change", renderEmergencyFundCalculator);
document.getElementById("ef-timeline").addEventListener("change", renderEmergencyFundCalculator);

/* ---------- Search ---------- */
const searchModal = document.getElementById("searchModal");
document.getElementById("searchBtn").addEventListener("click", () => {
  searchModal.classList.remove("hidden");
  document.getElementById("search-input").value = "";
  document.getElementById("search-results").innerHTML = "";
  document.getElementById("search-input").focus();
});
document.getElementById("closeSearch").addEventListener("click", () => searchModal.classList.add("hidden"));

document.getElementById("search-input").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const resultsEl = document.getElementById("search-results");
  if (!q) { resultsEl.innerHTML = ""; return; }
  const matches = allEntries.filter(en =>
    (en.note || "").toLowerCase().includes(q) ||
    (en.category || "").toLowerCase().includes(q) ||
    (en.subcategory || "").toLowerCase().includes(q) ||
    (en.counterparty || "").toLowerCase().includes(q)
  ).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

  resultsEl.innerHTML = matches.length ? matches.map(en => `
    <div class="entry-row">
      <div>
        <div>${en.note || en.subcategory || en.category}</div>
        <div class="entry-meta">${en.type} · ${en.category || ""} · ${en.date}</div>
      </div>
      <div class="entry-right">
        <div class="entry-amt">${fmt(en.amount)}</div>
        <button class="delete-btn" data-id="${en.id}" aria-label="Delete">×</button>
      </div>
    </div>
  `).join("") : `<div class="empty-note">No matches.</div>`;
  wireDeleteButtons(resultsEl);
});

/* ---------- Backup & Restore ---------- */
document.getElementById("backup-btn").addEventListener("click", async () => {
  const backup = {
    exportedAt: new Date().toISOString(),
    entries: await getAllEntries(),
    budgets: await storeGetAll(BUDGET_STORE),
    recurring: await storeGetAll(RECURRING_STORE),
    goals: await storeGetAll(GOAL_STORE)
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shomer-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById("restore-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm("This will replace ALL current data with the backup file. Continue?")) { e.target.value = ""; return; }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await storeClear(STORE);
    await storeClear(BUDGET_STORE);
    await storeClear(RECURRING_STORE);
    await storeClear(GOAL_STORE);
    for (const en of data.entries || []) await storePut(STORE, en);
    for (const b of data.budgets || []) await storePut(BUDGET_STORE, b);
    for (const r of data.recurring || []) await storePut(RECURRING_STORE, r);
    for (const g of data.goals || []) await storePut(GOAL_STORE, g);
    alert("Restore complete.");
    await refresh();
  } catch (err) {
    alert("Couldn't read that backup file. Make sure it's an unmodified Shomer backup JSON.");
  }
  e.target.value = "";
});

/* ---------- PIN Lock ---------- */
const PIN_KEY = "shomer-pin-hash";
async function hashPin(pin) {
  const enc = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function hasPin() { return !!localStorage.getItem(PIN_KEY); }
function updatePinSettingsUI() {
  document.getElementById("pin-status").textContent = hasPin() ? "PIN lock is on." : "No PIN set — app opens directly.";
  document.getElementById("pin-setup-btn").textContent = hasPin() ? "Change PIN" : "Set up PIN";
  document.getElementById("pin-remove-btn").style.display = hasPin() ? "block" : "none";
}
document.getElementById("pin-setup-btn").addEventListener("click", async () => {
  const pin = prompt("Enter a 4-6 digit PIN:");
  if (!pin || pin.length < 4) { if (pin !== null) alert("PIN must be at least 4 digits."); return; }
  const confirmPin = prompt("Confirm your PIN:");
  if (pin !== confirmPin) { alert("PINs didn't match."); return; }
  localStorage.setItem(PIN_KEY, await hashPin(pin));
  updatePinSettingsUI();
  alert("PIN set. It'll be asked for next time you open the app.");
});
document.getElementById("pin-remove-btn").addEventListener("click", () => {
  if (!confirm("Remove the PIN lock?")) return;
  localStorage.removeItem(PIN_KEY);
  updatePinSettingsUI();
});
updatePinSettingsUI();

const lockScreen = document.getElementById("lockScreen");
if (hasPin()) lockScreen.classList.remove("hidden");
document.getElementById("lock-submit").addEventListener("click", tryUnlock);
document.getElementById("lock-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
async function tryUnlock() {
  const entered = document.getElementById("lock-input").value;
  const hash = await hashPin(entered);
  if (hash === localStorage.getItem(PIN_KEY)) {
    lockScreen.classList.add("hidden");
    document.getElementById("lock-input").value = "";
    document.getElementById("lock-error").textContent = "";
  } else {
    document.getElementById("lock-error").textContent = "Incorrect PIN.";
  }
}

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
