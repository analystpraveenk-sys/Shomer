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
let dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) {
      const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("date", "date");
      store.createIndex("type", "type");
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

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
let currentType = "expense";
let selectedTags = new Set();
let trendRange = 6;
let debtDirection = "borrowed";
let debtStatus = "pending";

/* ---------- Init ---------- */
document.getElementById("f-date").value = todayISO();
populateCategorySelect();

async function refresh() {
  allEntries = await getAllEntries();
  renderOverview();
  renderCategories();
  renderTrends();
  renderLeaks();
  renderSave();
  renderIncome();
  renderDebt();
}
refresh();

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
    ctx.fillStyle = "#A9A499";
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
  ctx.fillStyle = "#12141A";
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
    ctx.fillStyle = "#A9A499";
    ctx.font = "14px IBM Plex Sans";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", w / 2, h / 2);
    return;
  }
  const pad = 30;
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;

  // axis line
  ctx.strokeStyle = "rgba(237,231,218,0.15)";
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
  ctx.strokeStyle = "#B8923F";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // dots + labels
  ctx.fillStyle = "#B8923F";
  values.forEach((v, i) => {
    const x = pad + stepX * i;
    const y = h - pad - (v / max) * (h - pad * 2);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#A9A499";
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
      <div class="entry-amt rust">${fmt(e.amount)}</div>
    </div>
  `).join("") : `<div class="empty-note">Nothing flagged yet — tag entries "avoidable" or "impulse" when logging.</div>`;
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
      <div class="entry-amt sage">${fmt(e.amount)}</div>
    </div>
  `).join("") : `<div class="empty-note">No savings or investments logged yet.</div>`;
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
      <div class="entry-amt sage">${fmt(e.amount)}</div>
    </div>
  `).join("") : `<div class="empty-note">No income logged yet.</div>`;
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
      <div class="entry-amt ${e.direction === "borrowed" ? "rust" : "sage"}">${fmt(e.amount)}</div>
    </div>
  `).join("") : `<div class="empty-note">No debt or lending logged yet.</div>`;

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

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
