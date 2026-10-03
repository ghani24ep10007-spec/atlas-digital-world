/* Atlas Digital Dunia — SPA statis dengan data seed World Bank */
"use strict";

const S = window.SNAPSHOT;
const IND = Object.fromEntries(S.indicators.map((i) => [i.id, i]));
const CTRY = Object.fromEntries(S.countries.map((c) => [c.iso, c]));
const YEARS = [];
for (let y = S.yearRange.from; y <= S.yearRange.to; y++) YEARS.push(y);

// index: `${iso}|${ind}` -> Map(year->value)
const IDX = new Map();
for (const r of S.rows) {
  const k = r.countryIso + "|" + r.indicatorId;
  let m = IDX.get(k);
  if (!m) IDX.set(k, (m = new Map()));
  m.set(r.year, r.value);
}
function series(iso, ind) {
  const m = IDX.get(iso + "|" + ind);
  if (!m) return [];
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([year, value]) => ({ year, value }));
}
function latestOf(iso, ind) {
  const s = series(iso, ind);
  return s.length ? s[s.length - 1] : null;
}
function valueAt(iso, ind, year) {
  const m = IDX.get(iso + "|" + ind);
  return m && m.has(year) ? m.get(year) : null;
}

const PALETTE = ["#22d3ee", "#818cf8", "#fbbf24", "#34d399", "#f87171", "#e879f9", "#38bdf8", "#fb923c", "#a3e635", "#f472b6", "#2dd4bf", "#c084fc"];
const nf = (v, d) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
function fmtVal(v, indId) {
  if (v == null) return "–";
  const u = IND[indId].unit;
  if (u === "jiwa") return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  if (u === "%") return nf(v, 1) + " %";
  return nf(v, 1);
}
function fmtFull(v, indId) {
  if (v == null) return "–";
  return IND[indId].unit === "jiwa" ? nf(v, 0) : nf(v, 1);
}

const charts = [];
function destroyCharts() { while (charts.length) charts.pop().destroy(); }
function mkChart(canvas, cfg) {
  if (!canvas) return null;
  const c = new Chart(canvas.getContext("2d"), cfg);
  charts.push(c);
  return c;
}
Chart.defaults.color = "#8fa3c4";
Chart.defaults.borderColor = "rgba(34,48,82,.6)";
Chart.defaults.font.family = "ui-sans-serif, system-ui, sans-serif";

const $ = (sel, el) => (el || document).querySelector(sel);
const app = $("#app");
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ============================= DASHBOARD ============================= */
const dashState = {
  ind: "IT.NET.USER.ZS",
  countries: ["WLD", "IDN", "USA", "CHN", "IND", "DEU"],
  from: 2000,
  to: 2023,
};

function renderDashboard() {
  const inds = S.indicators.map((i) => `<option value="${i.id}" ${i.id === dashState.ind ? "selected" : ""}>${esc(i.name)}</option>`).join("");
  const yearsOpts = (sel, lo, hi) => YEARS.map((y) => `<option ${y === sel ? "selected" : ""} ${y < lo || y > hi ? "disabled" : ""}>${y}</option>`).join("");
  const chips = S.countries.map((c) => `<button class="chip ${dashState.countries.includes(c.iso) ? "on" : ""}" data-iso="${c.iso}">${esc(c.name)}</button>`).join("");

  app.innerHTML = `
    <h2 class="section-title">Dashboard Tren Digital</h2>
    <p class="section-sub">Pilih indikator, negara, dan rentang tahun — grafik serta ringkasan statistik menyesuaikan. Sumber: World Development Indicators (snapshot 2000–2023).</p>
    <div class="controls">
      <div class="control"><label for="d-ind">Indikator</label><select id="d-ind">${inds}</select></div>
      <div class="control"><label for="d-from">Dari tahun</label><select id="d-from">${yearsOpts(dashState.from, 2000, dashState.to)}</select></div>
      <div class="control"><label for="d-to">Sampai tahun</label><select id="d-to">${yearsOpts(dashState.to, dashState.from, 2023)}</select></div>
      <div class="control" style="flex:1"><label>Negara (pilih beberapa)</label><div class="chipbox" id="d-chips">${chips}</div></div>
    </div>
    <div class="grid kpis" id="d-kpis"></div>
    <div class="grid chart-row">
      <div class="card chart-card"><h3 class="panel-title">Tren waktu — ${esc(IND[dashState.ind].name)}</h3><canvas id="c-line"></canvas><p class="chart-note" id="line-note"></p></div>
      <div class="card chart-card"><h3 class="panel-title">Perbandingan antar negara (${dashState.to})</h3><canvas id="c-bar"></canvas><p class="chart-note">Bar abu-abu = rata-rata negara terpilih.</p></div>
    </div>`;

  $("#d-ind").onchange = (e) => { dashState.ind = e.target.value; renderDashboard(); };
  $("#d-from").onchange = (e) => { dashState.from = +e.target.value; renderDashboard(); };
  $("#d-to").onchange = (e) => { dashState.to = +e.target.value; renderDashboard(); };
  $("#d-chips").onclick = (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const iso = b.dataset.iso;
    dashState.countries = dashState.countries.includes(iso)
      ? dashState.countries.filter((x) => x !== iso)
      : [...dashState.countries, iso];
    renderDashboard();
  };
  dashboardData();
}

function dashboardData() {
  const { ind, countries, from, to } = dashState;
  const nonWld = countries.filter((c) => c !== "WLD");
  const listFor = (iso) => series(iso, ind).filter((p) => p.year >= from && p.year <= to);

  // KPIs — dihitung dari negara terpilih (tanpa WLD) pada tahun terakhir tersedia
  const lastY = to;
  const valsAt = (y) => nonWld.map((iso) => valueAt(iso, ind, y)).filter((v) => v != null);
  let refY = lastY;
  while (refY >= from && !valsAt(refY).length) refY--;
  const cur = valsAt(refY);
  const beginVals = [];
  for (let y = from; y <= refY; y++) { const v = valsAt(y); if (v.length) { beginVals.push(y); break; } }
  const avg = cur.length ? cur.reduce((a, b) => a + b, 0) / cur.length : null;
  const hi = cur.length ? nonWld.reduce((a, b) => (valueAt(a, ind, refY) ?? -Infinity) >= (valueAt(b, ind, refY) ?? -Infinity) ? a : b) : null;
  const lo = cur.length ? nonWld.reduce((a, b) => (valueAt(a, ind, refY) ?? Infinity) <= (valueAt(b, ind, refY) ?? Infinity) ? a : b) : null;
  const w = latestOf("WLD", ind);
  const growthFrom = Math.max(2015, from);
  let growth = null;
  {
    const a0 = valueAt("WLD", ind, growthFrom), a1 = w && w.year >= growthFrom ? w.value : null;
    if (a0 != null && a1 != null && a0 > 0) growth = ((a1 - a0) / a0) * 100;
  }
  $("#d-kpis").innerHTML = `
    <div class="card"><h3>Nilai dunia (${w ? w.year : "–"})</h3><div class="kpi-value">${w ? fmtVal(w.value, ind) : "–"}</div><div class="kpi-note">Agregat World Bank untuk ${esc(IND[ind].name.toLowerCase())}</div></div>
    <div class="card"><h3>Tertinggi ${refY}</div><div class="kpi-value">${hi ? fmtVal(valueAt(hi, ind, refY), ind) : "–"}</div><div class="kpi-note">${hi ? esc(CTRY[hi].name) : "Tidak ada data pada rentang ini"}</div></div>
    <div class="card"><h3>Terendah ${refY}</div><div class="kpi-value">${lo ? fmtVal(valueAt(lo, ind, refY), ind) : "–"}</div><div class="kpi-note">${lo ? esc(CTRY[lo].name) : ""}</div></div>
    <div class="card"><h3>Rata-rata negara terpilih</h3><div class="kpi-value">${avg != null ? fmtVal(avg, ind) : "–"}</div><div class="kpi-note">${cur.length} negara punya data di ${refY}</div></div>
    <div class="card"><h3>Perubahan dunia ${growthFrom}→${w ? w.year : "–"}</h3><div class="kpi-value ${growth == null ? "" : growth >= 0 ? "up" : "down"}">${growth == null ? "–" : nf(Math.abs(growth), 1) + "%"}</div><div class="kpi-note">Basis agregat WLD, indikator yang sama</div></div>`;

  const line = listFor.bind(null);
  const ds = countries.map((iso, i) => {
    const pts = line(iso);
    return {
      label: CTRY[iso] ? CTRY[iso].name : iso,
      data: pts.map((p) => ({ x: p.year, y: p.value })),
      borderColor: iso === "WLD" ? "#fbbf24" : PALETTE[i % PALETTE.length],
      backgroundColor: "transparent",
      borderWidth: iso === "WLD" ? 3 : 2,
      borderDash: iso === "WLD" ? [] : [],
      pointRadius: 2.5,
      tension: .25,
    };
  });
  destroyCharts();
  mkChart($("#c-line"), {
    type: "line",
    data: { datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "nearest", axis: "x" },
      scales: { x: { type: "linear", ticks: { stepSize: 3, callback: (v) => v } }, y: { beginAtZero: IND[ind].unit !== "jiwa" } },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { callbacks: { label: (t) => `${t.dataset.label}: ${fmtVal(t.parsed.y, ind)}` } } },
    },
  });
  $("#line-note").textContent = ds.length ? `${ds.length} deret · ${from}–${to}` : "Pilih minimal satu negara untuk menampilkan tren.";

  const barCountries = nonWld.filter((iso) => valueAt(iso, ind, refY) != null).sort((a, b) => valueAt(b, ind, refY) - valueAt(a, ind, refY));
  mkChart($("#c-bar"), {
    type: "bar",
    data: {
      labels: barCountries.map((iso) => CTRY[iso].name),
      datasets: [{
        data: barCountries.map((iso) => valueAt(iso, ind, refY)),
        backgroundColor: barCountries.map((_, i) => PALETTE[i % PALETTE.length]),
        borderRadius: 5,
      }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      scales: { x: { beginAtZero: true } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (t) => fmtVal(t.parsed.x, ind) } } },
    },
  });
}

/* ============================== KATALOG ============================== */
const catState = { q: "", country: "", ind: "", yFrom: "", yTo: "", sort: { key: "countryName", dir: 1 }, page: 1, size: 25 };

function catalogRows() {
  const st = catState;
  const q = st.q.trim().toLowerCase();
  let rows = S.rows.filter((r) => {
    if (st.country && r.countryIso !== st.country) return false;
    if (st.ind && r.indicatorId !== st.ind) return false;
    if (st.yFrom && r.year < +st.yFrom) return false;
    if (st.yTo && r.year > +st.yTo) return false;
    if (q && !(r.countryName.toLowerCase().includes(q) || IND[r.indicatorId].name.toLowerCase().includes(q) || String(r.year).includes(q))) return false;
    return true;
  });
  const { key, dir } = st.sort;
  rows = rows.slice().sort((a, b) => {
    let x = key === "indicatorName" ? IND[a.indicatorId].name : key === "value" ? a.value : a[key];
    let y = key === "indicatorName" ? IND[b.indicatorId].name : key === "value" ? b.value : b[key];
    if (typeof x === "string") return x.localeCompare(y, "id") * dir;
    return (x - y) * dir || a.countryName.localeCompare(b.countryName, "id");
  });
  return rows;
}

function renderKatalog() {
  const st = catState;
  app.innerHTML = `
    <h2 class="section-title">Katalog Data</h2>
    <p class="section-sub">Seluruh baris snapshot (${S.rows.length.toLocaleString("id-ID")} baris). Klik nama negara untuk membuka halaman detailnya.</p>
    <div class="controls">
      <div class="control"><label for="k-q">Pencarian</label><input id="k-q" type="search" placeholder="nama negara / indikator / tahun" value="${esc(st.q)}" /></div>
      <div class="control"><label for="k-country">Negara</label><select id="k-country"><option value="">Semua</option>${S.countries.map((c) => `<option value="${c.iso}" ${st.country === c.iso ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div class="control"><label for="k-ind">Indikator</label><select id="k-ind"><option value="">Semua</option>${S.indicators.map((i) => `<option value="${i.id}" ${st.ind === i.id ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></div>
      <div class="control"><label for="k-y1">Tahun ≥</label><input id="k-y1" type="number" min="2000" max="2023" value="${esc(st.yFrom)}" /></div>
      <div class="control"><label for="k-y2">Tahun ≤</label><input id="k-y2" type="number" min="2000" max="2023" value="${esc(st.yTo)}" /></div>
    </div>
    <div class="card"><div class="tablewrap"><table id="k-table"><thead><tr>
      ${[["countryName", "Negara"], ["year", "Tahun"], ["indicatorName", "Indikator"], ["value", "Nilai"]].map(([k, l]) => `<th data-key="${k}" class="${k === "value" || k === "year" ? "num" : ""}">${l}${st.sort.key === k ? ` <span class="arrow">${st.sort.dir === 1 ? "↑" : "↓"}</span>` : ""}</th>`).join("")}
    </tr></thead><tbody></tbody></table></div>
    <div class="pager" id="k-pager"></div></div>`;

  const debounce = (() => { let t; return (f) => { clearTimeout(t); t = setTimeout(f, 200); }; })();
  $("#k-q").oninput = (e) => { catState.q = e.target.value; catState.page = 1; debounce(() => { $("#k-table tbody").innerHTML = catBodyHTML(); bindRowClicks(); renderPager(); }); };
  $("#k-country").onchange = (e) => { catState.country = e.target.value; catState.page = 1; drawCat(); };
  $("#k-ind").onchange = (e) => { catState.ind = e.target.value; catState.page = 1; drawCat(); };
  $("#k-y1").oninput = (e) => { catState.yFrom = e.target.value; catState.page = 1; debounce(drawCat); };
  $("#k-y2").oninput = (e) => { catState.yTo = e.target.value; catState.page = 1; debounce(drawCat); };
  $("#k-table thead").onclick = (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const k = th.dataset.key;
    catState.sort = { key: k, dir: catState.sort.key === k ? -catState.sort.dir : 1 };
    drawCat();
  };
  drawCat();
}
function catBodyHTML() {
  const rows = catalogRows();
  const st = catState;
  const pageRows = rows.slice((st.page - 1) * st.size, st.page * st.size);
  if (!rows.length) return `<tr><td colspan="4" class="empty">Tidak ada baris yang cocok. Ubah kata kunci atau filter.</td></tr>`;
  return pageRows.map((r) => `
    <tr class="clickable" data-iso="${r.countryIso}">
      <td><a class="country-link" href="#/negara/${r.countryIso}">${esc(r.countryName)}</a> <span class="region-tag">${esc(CTRY[r.countryIso].region)}</span></td>
      <td class="num">${r.year}</td>
      <td>${esc(IND[r.indicatorId].name)}</td>
      <td class="num" title="${fmtFull(r.value, r.indicatorId)} ${esc(IND[r.indicatorId].unit)}">${fmtVal(r.value, r.indicatorId)}</td>
    </tr>`).join("");
}
function bindRowClicks() {
  $("#k-table tbody").onclick = (e) => {
    if (e.target.closest("a")) return;
    const tr = e.target.closest("tr.clickable");
    if (tr) location.hash = "#/negara/" + tr.dataset.iso;
  };
}
function renderPager(total0) {
  const rows = catalogRows();
  const pages = Math.max(1, Math.ceil(rows.length / catState.size));
  if (catState.page > pages) catState.page = pages;
  const btn = (p, label, dis, cur) => `<button data-p="${p}" ${dis ? "disabled" : ""} class="${cur ? "cur" : ""}">${label}</button>`;
  const s = catState.page;
  let nums = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - s) <= 2) nums.push(p); else if (nums[nums.length - 1] !== "…") nums.push("…");
  $("#k-pager").innerHTML = `
    <span class="count">${rows.length.toLocaleString("id-ID")} baris · halaman ${s}/${pages}</span>
    <div class="pages">${btn(s - 1, "‹", s === 1)}${nums.map((p) => (p === "…" ? `<button disabled>…</button>` : btn(p, p, false, p === s))).join("")}${btn(s + 1, "›", s === pages)}</div>`;
  $("#k-pager").querySelectorAll("button[data-p]").forEach((b) => (b.onclick = () => { catState.page = +b.dataset.p; drawCat(); }));
}
function drawCat() { $("#k-table tbody").innerHTML = catBodyHTML(); bindRowClicks(); renderPager(); }

/* =========================== DETAIL NEGARA =========================== */
function renderDetail(iso) {
  const c = CTRY[iso];
  if (!c) { app.innerHTML = `<div class="card empty">Negara ${esc(iso)} tidak ada dalam snapshot. <a href="#/katalog">Kembali ke katalog</a></div>`; return; }
  destroyCharts();
  const blocks = S.indicators.map((ind, i) => {
    const s = series(iso, ind.id);
    if (!s.length) return `<div class="card chart-card"><h3 class="panel-title">${esc(ind.name)}</h3><p class="empty">Tidak ada data untuk ${esc(c.name)}.</p></div>`;
    const vals = s.map((p) => p.value);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const first = s[0].value, last = s.at(-1);
    const chg = first > 0 ? ((last.value - first) / first) * 100 : null;
    const stat = (k, v) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    return `<div class="card chart-card">
      <h3 class="panel-title">${esc(ind.name)}</h3>
      <div class="stat-strip">
        ${stat(`Terkini (${last.year})`, fmtVal(last.value, ind.id))}
        ${stat("Minimum", fmtVal(Math.min(...vals), ind.id))}
        ${stat("Maksimum", fmtVal(Math.max(...vals), ind.id))}
        ${stat("Rata-rata", fmtVal(avg, ind.id))}
        ${stat(`Δ ${s[0].year}→${last.year}`, chg == null ? "–" : (chg >= 0 ? "+" : "−") + nf(Math.abs(chg), 1) + "%")}
      </div>
      <canvas id="dc-${i}"></canvas>
    </div>`;
  }).join("");
  app.innerHTML = `
    <div class="detail-head">
      <div>
        <h2 class="section-title" style="margin-bottom:2px">${esc(c.name)} <span class="region-tag">· ${esc(c.region)} · ${iso}</span></h2>
        <p class="section-sub" style="margin-bottom:0">Semua indikator tersedia, ${S.yearRange.from}–${S.yearRange.to}.</p>
      </div>
      <a class="backlink" href="#/katalog">← Kembali ke katalog</a>
    </div>
    <div class="grid cols">${blocks}</div>`;

  S.indicators.forEach((ind, i) => {
    const s = series(iso, ind.id);
    if (!s.length) return;
    mkChart($(`#dc-${i}`), {
      type: "line",
      data: { datasets: [{ label: ind.name, data: s.map((p) => ({ x: p.year, y: p.value })), borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length] + "22", fill: true, borderWidth: 2, pointRadius: 2, tension: .25 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { type: "linear", ticks: { stepSize: 4 } }, y: { beginAtZero: ind.unit !== "jiwa" } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (t) => fmtVal(t.parsed.y, ind.id) + " " + ind.unit } } },
      },
    });
  });
}

/* ============================= TERBARU ============================== */
function renderTerbaru() {
  const perCountry = S.countries.map((c) => {
    let y = S.yearRange.to;
    const data = {};
    for (const ind of S.indicators) {
      const l = latestOf(c.iso, ind.id);
      if (l) { data[ind.id] = l; y = Math.min(y, l.year); }
    }
    return { c, data };
  });
  const ordered = [perCountry.find((x) => x.c.iso === "WLD"), ...perCountry.filter((x) => x.c.iso !== "WLD")].filter(Boolean);
  const cards = ordered.map(({ c, data }) => {
    const lines = S.indicators.map((ind) => {
      const l = data[ind.id];
      if (!l) return `<div class="metric-line"><span>${esc(ind.name)}</span><span class="v">–</span></div>`;
      const prev = valueAt(c.iso, ind.id, l.year - 1);
      const d = prev != null ? l.value - prev : null;
      return `<div class="metric-line"><span>${esc(ind.name)}</span><span><span class="v">${fmtVal(l.value, ind.id)}</span>${d != null ? `<span class="delta ${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : "−"}${fmtVal(Math.abs(d), ind.id).replace(/ ?(%.*)$/, "$1")}</span>` : ""}</span></div>`;
    }).join("");
    return `<div class="card latest-card"><div class="head"><h3>${esc(c.name)}</h3><span class="kpi-note">${Object.values(data).length ? Math.max(...Object.values(data).map((x) => x.year)) : ""}</span></div>${lines}<a class="backlink" href="#/negara/${c.iso}">Lihat tren lengkap →</a></div>`;
  }).join("");
  app.innerHTML = `
    <h2 class="section-title">Data Terbaru per Negara</h2>
    <div class="banner">
      <span><strong>Snapshot</strong> ${esc(S.source)} — diambil ${new Date(S.fetchedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} · pembaruan API: ${esc(S.apiLastUpdated)}.</span>
      <span class="tag">${S.rows.length.toLocaleString("id-ID")} baris</span>
      <span class="tag">${S.countries.length} negara/wilayah</span>
      <span class="tag">${S.indicators.length} indikator</span>
      <span class="tag">bukan data live</span>
    </div>
    <div class="grid latest-grid">${cards}</div>`;
}

/* ============================== ROUTER ============================== */
function setActive(name) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
}
function route() {
  const h = (location.hash || "#/").slice(1);
  const parts = h.split("/").filter(Boolean);
  destroyCharts();
  if (parts[0] === "katalog") { setActive("katalog"); renderKatalog(); }
  else if (parts[0] === "terbaru") { setActive("terbaru"); renderTerbaru(); }
  else if (parts[0] === "negara") { setActive("katalog"); renderDetail((parts[1] || "").toUpperCase()); }
  else { setActive("dashboard"); renderDashboard(); }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
$("#footer-meta").textContent = `Snapshot dibuat ${new Date(S.fetchedAt).toLocaleString("id-ID")} · API lastupdated ${S.apiLastUpdated} · ${S.rows.length.toLocaleString("id-ID")} baris`;
route();
