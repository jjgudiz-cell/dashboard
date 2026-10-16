/* ==========================================================
   Dashboard Almacén — ELEDÉ
   Lee 6 tablas (4 de Almacén + 2 de Asistencia).
   ========================================================== */

const SUPABASE_URL = "https://qkkwvacltcmpgmtrvpjf.supabase.co";
const SUPABASE_KEY = "sb_publishable_UZnT5Fj2Hp8qLOyrWf4Ilw_1QcW_O5U";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- Paleta ELEDÉ ---------- */
const C = {
  gold: "#F5B400", goldLight: "#FFD54A", goldDark: "#B88800",
  yellow: "#FFC107", orange: "#FF9800", amber: "#FFB300",
  green: "#66BB6A", red: "#EF5350", blue: "#42A5F5",
  other: "#4A3F1F", text: "#F5F0E1", dim: "#A89C7A", faint: "#6B6348",
  grid: "rgba(168, 156, 122, 0.10)", panel: "#141008",
};
const PALETTE = [C.gold, C.goldLight, C.orange, C.amber, C.green, C.blue, C.red];

Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = C.dim;
Chart.defaults.animation.duration = 450;
Chart.defaults.plugins.datalabels.display = false;
Chart.defaults.plugins.legend.display = false;

const state = { mb52: null, lt22: null, zlx12: null, zwm: null, asistencia: null, horasExtra: null, factPedido: null, factPLU: null, recepPacking: null, recepDetalle: null };
const charts = {};
let listenersReady = false;
let subActual = "resumen";
let subActualA = "asistencia";
let subActualF = "pedido";
let subActualR = "packing";

const fmt = (v, d = 0) =>
  Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const round = (v, d = 1) => Number(Number(v).toFixed(d));
const truncar = (s, n = 30) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const $ = (id) => document.getElementById(id);
function hexRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* ---------- Carga ---------- */
async function cargarHoja(nombre) {
  const { data, error } = await supabaseClient
    .from("dashboard_data")
    .select("row_index, data")
    .eq("sheet_name", nombre)
    .order("row_index", { ascending: true })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0].data;
}

/* ---------- Plugins ---------- */
const centerText = {
  id: "centerText",
  afterDraw(chart, _args, opts) {
    if (!opts || !opts.title) return;
    const { ctx, chartArea: a } = chart;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.text; ctx.font = "700 20px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 16);
    ctx.restore();
  },
};

/* ---------- Utilidades gráfico ---------- */
function tooltipStyle() {
  return {
    backgroundColor: "#0A0806", titleColor: C.text, bodyColor: C.text,
    borderColor: "#4A3F1F", borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
    callbacks: {
      label: (c) => {
        const v = typeof c.parsed === "number" ? c.parsed : c.chart.options.indexAxis === "y" ? c.parsed.x : c.parsed.y;
        return ` ${c.dataset.label ? c.dataset.label + ": " : c.label ? c.label + ": " : ""}${fmt(v, 0)}`;
      },
    },
  };
}
function mount(id, config) {
  const canvas = $(id); if (!canvas) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const vacio = !config.data.labels || config.data.labels.length === 0;
  canvas.parentElement.classList.toggle("is-empty", vacio);
  if (vacio) return;
  charts[id] = new Chart(canvas, config);
}
function gradV(c1, c2) {
  return (ctx) => {
    const a = ctx.chart.chartArea; if (!a) return c1;
    const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  };
}
function gradH(c1, c2) {
  return (ctx) => {
    const a = ctx.chart.chartArea; if (!a) return c1;
    const g = ctx.chart.ctx.createLinearGradient(a.left, 0, a.right, 0);
    g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  };
}
const scaleX = () => ({
  grid: { display: false }, border: { color: "#4A3F1F" },
  ticks: { color: C.dim, maxRotation: 0, autoSkipPadding: 14 },
});
const scaleY = (max) => ({
  beginAtZero: true, suggestedMax: max, grid: { color: C.grid }, border: { display: false },
  ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 6 },
});
const labelBase = {
  color: C.text, font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10.5 },
};

/* ---------- Gráficos ---------- */
function renderColumns(id, labels, data, color1 = C.goldLight, color2 = C.goldDark, decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data, borderRadius: { topLeft: 7, topRight: 7 }, borderSkipped: false, maxBarThickness: 54, backgroundColor: gradV(color1, color2) }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 14 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: labels.length <= 14, anchor: "end", align: "end", offset: 3, formatter: (v) => fmt(v, decimals) },
      },
      scales: { x: scaleX(), y: scaleY(max * 1.22) },
    },
  });
}
function renderHBar(id, labels, data, color1 = C.goldDark, color2 = C.goldLight, decimals = 0) {
  const max = Math.max(...data, 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data, borderRadius: 6, borderSkipped: false, barThickness: 18, backgroundColor: gradH(color1, color2) }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => fmt(v, decimals) },
      },
      scales: {
        x: { ...scaleY(max * 1.18), ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 28); } } },
      },
    },
  });  
}

function renderGrouped(id, labels, series, decimals = 0) {
  const max = Math.max(...series.flatMap((s) => s.data), 0);
  mount(id, {
    type: "bar",
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label, data: s.data, backgroundColor: s.color,
        borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: false, maxBarThickness: 34,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 12 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: labels.length * series.length <= 20, anchor: "end", align: "end", offset: 2, formatter: (v) => fmt(v, decimals) },
      },
      scales: { x: scaleX(), y: scaleY(max * 1.2) },
    },
  });
}

function renderScrollHBar(id, labels, data, color1 = C.goldDark, color2 = C.goldLight, decimals = 0) {
  const ctx = $(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  const wrap = ctx.parentElement;
  wrap.style.maxHeight = "420px";
  wrap.style.overflowY = "auto";
  wrap.style.overflowX = "hidden";
  ctx.style.height = Math.max(420, labels.length * 32) + "px";
  ctx.style.maxHeight = "none";

  const max = Math.max(...data, 0);
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data, borderRadius: 6, borderSkipped: false, barThickness: 16,
        backgroundColor: gradH(color1, color2),
      }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 12 } },
      plugins: {
        tooltip: tooltipStyle(),
        datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => fmt(v, decimals) },
      },
      scales: {
        x: { ...scaleY(max * 1.18), ticks: { color: C.faint, callback: (v) => fmt(v), maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 30); } } },
      },
    },
  });
}
function renderDoughnut(id, labels, data, centerTitle, centerSub, decimals = 0) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => (l === "Otros" ? C.other : PALETTE[i % PALETTE.length]));
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#141008", borderWidth: 3, hoverOffset: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: { ...tooltipStyle(), callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed, decimals)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` } },
        datalabels: {
          ...labelBase, display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06,
          color: "#1A1408", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 },
          formatter: (v) => Math.round((v / total) * 100) + "%",
        },
        centerText: { title: centerTitle, sub: centerSub },
      },
    },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
  if (lg) lg.innerHTML = labels.map((l, i) =>
    `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${truncar(l, 22)}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`
  ).join("");
}
function renderArea(id, labels, datasets, { decimals = 0 } = {}) {
  const maxAll = Math.max(...datasets.flatMap((d) => d.data), 0);
  mount(id, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: true,
        backgroundColor: (ctx) => {
          const a = ctx.chart.chartArea; if (!a) return hexRgba(d.color, 0.15);
          const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
          g.addColorStop(0, hexRgba(d.color, 0.34)); g.addColorStop(1, hexRgba(d.color, 0)); return g;
        },
        pointBackgroundColor: d.color, pointBorderColor: "#141008", pointBorderWidth: 2,
        pointRadius: 4, pointHoverRadius: 6,
        datalabels: {
          color: C.text,
          font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10 },
          anchor: "end", align: "top", offset: 6,
          display: (ctx) => ctx.dataset.data.length <= 30,
          formatter: (v) => fmt(v, decimals),
        },
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16, right: 10 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: tooltipStyle(),
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.15) },
    },
  });
}

/* ---------- Plantillas ---------- */
function heroCard({ title, value, unit, badge, note }) {
  return `<article class="card hero span-3">
    <span class="eyebrow">Indicador principal</span>
    <h3>${title}</h3>
    <div class="hero-val">${value}<small>${unit}</small></div>
    <p class="hero-note">${note}</p>
    <span class="pill pill-orange">${badge}</span>
  </article>`;
}
function kpiCard({ icon, tone, title, value, unit, pct, barLabel, foot }) {
  return `<article class="card kpi tone-${tone} span-3">
    <div class="kpi-head"><span class="kpi-ico"><i class="fas ${icon}"></i></span><h3>${title}</h3></div>
    <div class="kpi-val">${value}<small>${unit}</small></div>
    <div class="bar"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>
    <div class="kpi-foot"><span>${barLabel}</span><b>${fmt(pct, 1)}%</b></div>
    <p class="kpi-note">${foot}</p>
  </article>`;
}
function plotCard(id, titulo, sub, span, size = "") {
  return `<article class="card span-${span}">
    <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div class="plot ${size}"><canvas id="${id}"></canvas>
      <div class="plot-empty"><i class="fas fa-chart-simple"></i><span>Sin datos para mostrar</span></div></div>
  </article>`;
}
function donutCard(id, titulo, sub, span) {
  return `<article class="card span-${span}">
    <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div class="plot donut"><canvas id="${id}"></canvas>
      <div class="plot-empty"><i class="fas fa-chart-pie"></i><span>Sin datos para mostrar</span></div></div>
    <div class="legend" id="${id}Legend"></div>
  </article>`;
}
function slotCard(id, titulo, sub, span) {
  return `<article class="card span-${span}">
    <div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div>
    <div id="${id}" class="mini-table"></div>
  </article>`;
}
function tabla(encabezados, filas) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${encabezados
    .map((h) => `<th class="${h.num ? "num" : ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${
    filas.map((f) => `<tr>${f.map((c, i) => `<td class="${encabezados[i].num ? "num" : ""} ${i === 0 ? "name" : ""}">${c}</td>`).join("")}</tr>`).join("")
  }</tbody></table></div>`;
}
function vacioMensaje(span = 12) {
  return `<article class="card span-${span}"><div class="plot-empty" style="display:flex;position:static;min-height:200px"><i class="fas fa-database"></i><span>No se encontraron datos para esta sección.</span></div></article>`;
}

/* ---------- Layout interno (una vez) ---------- */
function construirLayoutInterno() {
  // Resumen
  $("filtersResumen").innerHTML = `
    <div class="filter-chip"><i class="fas fa-warehouse"></i>
      <select id="fResAlmacen" class="filter-select"><option value="">Almacén</option></select></div>
    <div class="filter-chip"><i class="fas fa-tags"></i>
      <select id="fResCategoria" class="filter-select"><option value="">Categoría</option></select></div>
    <button id="clearResumen" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridResumen").innerHTML = [
    plotCard("rStockAlm", "Stock por almacén", "MB52 · Unidades disponibles", 8, "tall"),
    donutCard("rCategoria", "Stock por categoría", "Distribución porcentual", 4),
    slotCard("rTopMat", "Top 20 materiales con más stock", "MB52 · Prendas con mayor cantidad", 12),
  ].join("");

  // Movimientos
  $("filtersMov").innerHTML = `
    <div class="filter-chip"><i class="fas fa-user"></i>
      <select id="fMovUsuario" class="filter-select"><option value="">Usuario</option></select></div>
    <div class="filter-chip"><i class="fas fa-tags"></i>
      <select id="fMovCategoria" class="filter-select"><option value="">Categoría</option></select></div>
    <div class="filter-chip"><i class="fas fa-calendar"></i>
      <input type="date" id="fMovFecha" class="filter-select" style="min-width:150px;"></div>
    <button id="clearMov" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridMov").innerHTML = [
    plotCard("mFecha", "Movimientos por fecha", "LT22 · Evolución diaria", 8, "tall"),
    donutCard("mClase", "Movimientos por clase", "Distribución por clase de movimiento", 4),
    slotCard("mTopUsuario", "Top usuarios por movimientos", "Personal con más actividad", 12),
  ].join("");

  // Traslados
  $("filtersTras").innerHTML = `
    <div class="filter-chip"><i class="fas fa-user"></i>
      <select id="fTrasUsuario" class="filter-select"><option value="">Usuario</option></select></div>
    <button id="clearTras" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridTras").innerHTML = [
    slotCard("tTablaDestino", "Detalle de Traslados", "ZLX12 · Almacén · Usuario · Categoría · Material", 8, "tall"),
    donutCard("tCategoria", "Traslados por categoría", "Distribución por categoría", 4),
  ].join("");

  // Negativos
  $("filtersNeg").innerHTML = `
    <div class="filter-chip"><i class="fas fa-warehouse"></i>
      <select id="fNegAlmacen" class="filter-select"><option value="">Almacén</option></select></div>
    <button id="clearNeg" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridNeg").innerHTML = [
    donutCard("nNegativos", "Negativos vs Positivos", "Alertas de inventario", 4),
    slotCard("nTabla", "Top 30 materiales con stock negativo", "ZWM · A revisar", 8),
  ].join("");

  // Asistencia
  $("filtersAsis").innerHTML = `
    <div class="filter-chip"><i class="fas fa-users"></i>
      <select id="fAsisTrabajador" class="filter-select"><option value="">Trabajador</option></select></div>
    <div class="filter-chip"><i class="fas fa-tags"></i>
      <select id="fAsisPermiso" class="filter-select"><option value="">Permiso</option></select></div>
    <div class="filter-chip"><i class="fas fa-calendar"></i>
      <input type="date" id="fAsisFecha" class="filter-select" style="min-width:150px;"></div>
    <button id="clearAsis" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridAsis").innerHTML = [
    plotCard("aHorasFecha", "Horas trabajadas por fecha", "Evolución diaria", 8, "tall"),
    donutCard("aPermisos", "Permisos por tipo", "Distribución por tipo de permiso", 4),
    slotCard("aTablaTrab", "Detalle por trabajador", "Total horas y atrasos por persona", 12),
  ].join("");

  // Horas extra
  $("filtersHoras").innerHTML = `
    <div class="filter-chip"><i class="fas fa-users"></i>
      <select id="fHorasTrabajador" class="filter-select"><option value="">Trabajador</option></select></div>
    <button id="clearHoras" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridHoras").innerHTML = [
    plotCard("hTrabajador", "Horas extra por trabajador", "Top trabajadores con más horas extra", 6, "tall"),
    slotCard("hTablaMov", "Detalle de movimientos", "Registros de horas extra", 6),
  ].join("");

    // Facturación - Pedidos
  $("filtersPed").innerHTML = `
    <div class="filter-chip"><i class="fas fa-map-marker-alt"></i>
      <select id="fPedZona" class="filter-select"><option value="">Zona</option></select></div>
    <div class="filter-chip"><i class="fas fa-calendar"></i>
      <input type="date" id="fPedFecha" class="filter-select" style="min-width:150px;"></div>
    <button id="clearPed" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
      $("gridPed").innerHTML = [
    plotCard("fpFecha", "Cantidad de pedidos por fecha", "Evolución diaria de pedidos", 6, "tall"),
    plotCard("fpZona", "Valor Neto Factura por zona", "Top zonas de venta", 6, "tall"),
    slotCard("fpTabla", "Detalle de pedidos", "Zona · Pagador · Valores", 12),
  ].join("");

  // Facturación - PLU
  $("filtersPLU").innerHTML = `
    <div class="filter-chip"><i class="fas fa-tags"></i>
      <select id="fPluJerarquia" class="filter-select"><option value="">Jerarquía</option></select></div>
    <div class="filter-chip"><i class="fas fa-calendar"></i>
      <input type="date" id="fPluFecha" class="filter-select" style="min-width:150px;"></div>
    <button id="clearPLU" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
    $("gridPLU").innerHTML = [
    plotCard("fplJerarquia", "Valor Neto Pedido por jerarquía", "Categorías del producto", 6, "tall"),
    slotCard("fplTabla", "Detalle por jerarquía", "Jerarquía · Valor · Cantidad", 6),
  ].join("");

    // Recepción - Packing
    $("filtersPack").innerHTML = `
    <div class="filter-chip"><i class="fas fa-tags"></i>
      <select id="fPackCampana" class="filter-select"><option value="">Campaña</option></select></div>
    <div class="filter-chip"><i class="fas fa-calendar"></i>
      <input type="date" id="fPackFecha" class="filter-select" style="min-width:150px;"></div>
    <button id="clearPack" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridPack").innerHTML = [
    plotCard("rpMes", "Cantidad importada por mes", "Suma de CANT por mes", 6, "tall"),
    donutCard("rpCampana", "Cantidad por campaña", "Distribución entre campañas", 6),
    slotCard("rpTabla", "Detalle de packing list", "PLU · Material · Caja · Campaña · Cantidad", 12),
  ].join("");

  // Recepción - Detalle
  $("filtersDet").innerHTML = `
    <div class="filter-chip"><i class="fas fa-truck"></i>
      <select id="fDetProveedor" class="filter-select"><option value="">Proveedor</option></select></div>
    <div class="filter-chip"><i class="fas fa-clipboard-check"></i>
      <select id="fDetEstado" class="filter-select"><option value="">Estado</option></select></div>
    <div class="filter-chip"><i class="fas fa-calendar"></i>
      <input type="date" id="fDetFecha" class="filter-select" style="min-width:150px;"></div>
    <button id="clearDet" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  $("gridDet").innerHTML = [
    plotCard("rdMes", "Ingresado vs Pendiente por mes", "Comparativo mensual", 12, "tall"),
    slotCard("rdTabla", "Detalle por PLU", "Material · Talla · Proveedor · Estado · Ingresado · Pendiente", 12),
  ].join("");
}

/* ---------- Llenar selects ---------- */
function llenarSelect(id, valores, etiqueta) {
  const sel = $(id); if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = `<option value="">${etiqueta}</option>`;
  valores.forEach((v) => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  if (actual && valores.includes(actual)) sel.value = actual;
}
function llenarSegmentadores() {
  if (state.mb52) {
    const alms = [...new Set(state.mb52.filas.map(f => f.alm))].sort();
    llenarSelect("fResAlmacen", alms, "Almacén");
    const cats = [...new Set(state.mb52.filas.map(f => f.cat))].sort();
    llenarSelect("fResCategoria", cats, "Categoría");
  }
  if (state.lt22) {
    const usr = [...new Set(state.lt22.filas.map(f => f.usuario))].sort();
    llenarSelect("fMovUsuario", usr, "Usuario");
    const cats = [...new Set(state.lt22.filas.map(f => f.cat))].sort();
    llenarSelect("fMovCategoria", cats, "Categoría");
  }
  if (state.zlx12) {
    const usr = [...new Set(state.zlx12.filas.map(f => f.usuario))].sort();
    llenarSelect("fTrasUsuario", usr, "Usuario");
  }
  if (state.zwm) {
    const alms = state.zwm.porAlmacen.map(a => a.nombre).sort();
    llenarSelect("fNegAlmacen", alms, "Almacén");
  }
  if (state.asistencia) {
    const trab = [...new Set(state.asistencia.filas.map(f => f.nombre))].sort();
    llenarSelect("fAsisTrabajador", trab, "Trabajador");
    const perm = [...new Set(state.asistencia.filas.map(f => f.permiso))].sort();
    llenarSelect("fAsisPermiso", perm, "Permiso");
  }
  if (state.horasExtra) {
    const trab = [...new Set(state.horasExtra.filas.map(f => f.nombre))].sort();
    llenarSelect("fHorasTrabajador", trab, "Trabajador");
  }
    if (state.factPedido) {
    const zonas = [...new Set(state.factPedido.filas.map(f => f.zona))].sort();
    llenarSelect("fPedZona", zonas, "Zona");
  }
  if (state.factPLU) {
    const jer = [...new Set(state.factPLU.filas.map(f => f.jerarquia))].sort();
    llenarSelect("fPluJerarquia", jer, "Jerarquía");
  }
        if (state.recepPacking) {
    const camps = state.recepPacking.porCampana.map(c => c.campana).sort();
    llenarSelect("fPackCampana", camps, "Campaña");
  }
  if (state.recepDetalle) {
    const provs = [...new Set(state.recepDetalle.porDetalle.map(f => f.proveedor).filter(Boolean))].sort();
    llenarSelect("fDetProveedor", provs, "Proveedor");
    const ests = [...new Set(state.recepDetalle.porDetalle.map(f => f.estado).filter(Boolean))].sort();
    llenarSelect("fDetEstado", ests, "Estado");
  }
}

/* ---------- Filtrar ---------- */
function filtroActivo(id) { const el = $(id); return el ? el.value : ""; }

/* ---------- SUB-RESUMEN ---------- */
function renderResumen() {
  if (!state.mb52) { $("gridResumen").innerHTML = vacioMensaje(12); $("kpiResumen").innerHTML = ""; return; }
  const fAlm = filtroActivo("fResAlmacen");
  const fCat = filtroActivo("fResCategoria");

  const filas = state.mb52.filas.filter(f => {
    if (fAlm && f.alm !== fAlm) return false;
    if (fCat && f.cat !== fCat) return false;
    return true;
  });

  let totalStock = 0, totalLibre = 0, totalBloq = 0, totalCtrl = 0;
  const matsSet = new Set();
  const porAlmacen = {}, porCategoria = {}, porMaterial = {};
  filas.forEach(f => {
    totalStock += f.stock; totalLibre += f.libre; totalBloq += f.bloq; totalCtrl += f.ctrl;
    matsSet.add(f.mat);
    porAlmacen[f.alm] = (porAlmacen[f.alm] || 0) + f.stock;
    porCategoria[f.cat] = (porCategoria[f.cat] || 0) + f.stock;
    const key = f.mat + "|" + f.texto;
    if (!porMaterial[key]) porMaterial[key] = { mat: f.mat, texto: f.texto, stock: 0, count: 0 };
    porMaterial[key].stock += f.stock;
    porMaterial[key].count++;
  });

  $("kpiResumen").innerHTML = [
    heroCard({
      title: "Stock total", value: fmt(totalStock), unit: "unid.",
      note: `${fmt(matsSet.size)} materiales únicos`,
      badge: `Libre: ${fmt(totalLibre)}`,
    }),
    kpiCard({ icon: "fa-lock", tone: "gold", title: "Bloqueado", value: fmt(totalBloq), unit: "unid.",
      pct: totalStock ? (totalBloq / totalStock) * 100 : 0, barLabel: "Sobre el total",
      foot: `Control calidad: ${fmt(totalCtrl)}` }),
    kpiCard({ icon: "fa-cubes", tone: "amber", title: "Registros", value: fmt(filas.length), unit: "",
      pct: 100, barLabel: "Filtrados",
      foot: `${fmt(Object.keys(porAlmacen).length)} almacenes · ${fmt(Object.keys(porCategoria).length)} categorías` }),
    kpiCard({ icon: "fa-hand-holding", tone: "green", title: "Libre utilización", value: fmt(totalLibre), unit: "unid.",
      pct: totalStock ? (totalLibre / totalStock) * 100 : 0, barLabel: "Disponible",
      foot: `Sobre el total` }),
  ].join("");

  const arrAlm = Object.entries(porAlmacen).sort((a, b) => b[1] - a[1]).slice(0, 12);
  renderHBar("rStockAlm", arrAlm.map((a) => "Alm. " + a[0]), arrAlm.map((a) => round(a[1])), C.goldDark, C.goldLight, 0);

  const catArr = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const top6 = catArr.slice(0, 6);
  const otros = catArr.slice(6).reduce((a, e) => a + e[1], 0);
  const catData = top6.map((c) => round(c[1]));
  const catLabels = top6.map((c) => c[0]);
  if (otros > 0) { catData.push(round(otros)); catLabels.push("Otros"); }
  renderDoughnut("rCategoria", catLabels, catData, fmt(totalStock), "unidades");

  const topMat = Object.values(porMaterial).sort((a, b) => b.stock - a.stock).slice(0, 20);
  $("rTopMat").innerHTML = topMat.length
    ? tabla(
        [{ t: "Material" }, { t: "Descripción" }, { t: "Stock", num: 1 }, { t: "Registros", num: 1 }],
        topMat.map((m) => [m.mat, truncar(m.texto, 45), fmt(m.stock), fmt(m.count)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- SUB-MOVIMIENTOS ---------- */
function renderMovimientos() {
  if (!state.lt22) { $("gridMov").innerHTML = vacioMensaje(12); $("kpiMov").innerHTML = ""; return; }
  const fUsr = filtroActivo("fMovUsuario");
  const fCat = filtroActivo("fMovCategoria");
  const fFecha = filtroActivo("fMovFecha");

  const filas = state.lt22.filas.filter(f => {
    if (fUsr && f.usuario !== fUsr) return false;
    if (fCat && f.cat !== fCat) return false;
    if (fFecha && f.fechaOrd !== fFecha) return false;
    return true;
  });

  let totalCtd = 0;
  const porFecha = {}, porClase = {}, porUsuario = {};
  filas.forEach(f => {
    totalCtd += f.ctd;
    porFecha[f.fecha] = (porFecha[f.fecha] || 0) + f.mov;
    porClase[f.clase] = (porClase[f.clase] || 0) + f.mov;
    porUsuario[f.usuario] = (porUsuario[f.usuario] || 0) + f.mov;
  });

  const totalMov = Object.values(porUsuario).reduce((a, b) => a + b, 0);

  $("kpiMov").innerHTML = [
    heroCard({
      title: "Movimientos", value: fmt(totalMov), unit: "",
      note: `${fmt(totalCtd)} unidades movidas`,
      badge: `${fmt(Object.keys(porUsuario).length)} usuarios`,
    }),
    kpiCard({ icon: "fa-boxes-packing", tone: "gold", title: "Unidades movidas", value: fmt(totalCtd), unit: "",
      pct: 100, barLabel: "Total",
      foot: `${fmt(totalMov ? totalCtd / totalMov : 0, 1)} por movimiento` }),
    kpiCard({ icon: "fa-user", tone: "amber", title: "Usuarios activos", value: fmt(Object.keys(porUsuario).length), unit: "",
      pct: 100, barLabel: "Filtrados",
      foot: `En el periodo` }),
    kpiCard({ icon: "fa-calendar", tone: "green", title: "Fechas con actividad", value: fmt(Object.keys(porFecha).length), unit: "",
      pct: 100, barLabel: "Distintas",
      foot: `En LT22` }),
  ].join("");

  const fechasArr = Object.entries(porFecha);
  fechasArr.sort((a, b) => {
    const fa = state.lt22.filas.find(x => x.fecha === a[0])?.fechaOrd || "";
    const fb = state.lt22.filas.find(x => x.fecha === b[0])?.fechaOrd || "";
    return fa.localeCompare(fb);
  });
  const fechaArr = fechasArr.slice(-30);
  renderArea("mFecha", fechaArr.map((f) => f[0]), [
    { label: "Movimientos", color: C.gold, data: fechaArr.map((f) => f[1]) },
  ], { decimals: 0 });

  const claseArr = Object.entries(porClase).sort((a, b) => b[1] - a[1]);
  const top6 = claseArr.slice(0, 6);
  const otros = claseArr.slice(6).reduce((a, e) => a + e[1], 0);
  const clsData = top6.map((c) => c[1]);
  const clsLabels = top6.map((c) => "Clase " + c[0]);
  if (otros > 0) { clsData.push(otros); clsLabels.push("Otros"); }
  renderDoughnut("mClase", clsLabels, clsData, fmt(totalMov), "movimientos");

  const topUsr = Object.entries(porUsuario).sort((a, b) => b[1] - a[1]).slice(0, 20);
  $("mTopUsuario").innerHTML = topUsr.length
    ? tabla(
        [{ t: "Usuario" }, { t: "Movimientos", num: 1 }],
        topUsr.map((u) => [u[0], fmt(u[1])])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- SUB-TRASLADOS ---------- */
function renderTraslados() {
  if (!state.zlx12) { $("gridTras").innerHTML = vacioMensaje(12); $("kpiTras").innerHTML = ""; return; }
  const fUsr = filtroActivo("fTrasUsuario");

  const filas = state.zlx12.filas.filter(f => {
    if (fUsr && f.usuario !== fUsr) return false;
    return true;
  });

  let totalCtd = 0;
  const porDestino = {}, porCategoria = {}, porMaterial = {};
  const detalle = {};
  filas.forEach(f => {
    totalCtd += f.ctd;
    porDestino[f.destino] = (porDestino[f.destino] || 0) + 1;
    porCategoria[f.cat] = (porCategoria[f.cat] || 0) + 1;
    const key = f.mat + "|" + f.texto;
    if (!porMaterial[key]) porMaterial[key] = { mat: f.mat, texto: f.texto, traslados: 0, ctd: 0 };
    porMaterial[key].traslados++;
    porMaterial[key].ctd += f.ctd;

    const k2 = `${f.destino}|${f.usuario}|${f.cat}|${f.mat}|${f.texto}`;
    if (!detalle[k2]) detalle[k2] = { destino: f.destino, usuario: f.usuario, cat: f.cat, mat: f.mat, texto: f.texto, traslados: 0, ctd: 0 };
    detalle[k2].traslados++;
    detalle[k2].ctd += f.ctd;
  });

  $("kpiTras").innerHTML = [
    heroCard({
      title: "Traslados", value: fmt(filas.length), unit: "",
      note: `${fmt(totalCtd)} unidades trasladadas`,
      badge: `${fmt(Object.keys(porDestino).length)} almacenes destino`,
    }),
    kpiCard({ icon: "fa-truck-ramp-box", tone: "gold", title: "Movimientos", value: fmt(filas.length), unit: "",
      pct: 100, barLabel: "Filtrados",
      foot: `${fmt(filas.length ? totalCtd / filas.length : 0, 1)} unidades por traslado` }),
    kpiCard({ icon: "fa-boxes-packing", tone: "amber", title: "Unidades", value: fmt(totalCtd), unit: "",
      pct: 100, barLabel: "Total",
      foot: `Zlx12` }),
    kpiCard({ icon: "fa-warehouse", tone: "green", title: "Almacenes destino", value: fmt(Object.keys(porDestino).length), unit: "",
      pct: 100, barLabel: "Distintos",
      foot: `Filtrados` }),
  ].join("");

  const detalleArr = Object.values(detalle).sort((a, b) => b.traslados - a.traslados).slice(0, 30);
  $("tTablaDestino").innerHTML = detalleArr.length
    ? tabla(
        [
          { t: "Almacén destino" },
          { t: "Usuario" },
          { t: "Categoría" },
          { t: "Descripción" },
          { t: "Traslados", num: 1 },
          { t: "Cantidad", num: 1 },
        ],
        detalleArr.map((d) => [
          truncar(d.destino, 20),
          truncar(d.usuario, 14),
          truncar(d.cat, 12),
          truncar(d.texto, 32),
          fmt(d.traslados),
          fmt(d.ctd),
        ])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;

  const catArr = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const top6 = catArr.slice(0, 6);
  const otros = catArr.slice(6).reduce((a, e) => a + e[1], 0);
  const cd = top6.map((c) => c[1]); const cl = top6.map((c) => c[0]);
  if (otros > 0) { cd.push(otros); cl.push("Otros"); }
  renderDoughnut("tCategoria", cl, cd, fmt(filas.length), "traslados");
}

/* ---------- SUB-NEGATIVOS ---------- */
function renderNegativos() {
  if (!state.zwm) { $("gridNeg").innerHTML = vacioMensaje(12); $("kpiNeg").innerHTML = ""; return; }
  const fAlm = filtroActivo("fNegAlmacen");

  let porAlmacen = state.zwm.porAlmacen;
  let topNegativos = state.zwm.topNegativos;
  if (fAlm) {
    porAlmacen = porAlmacen.filter(a => a.nombre === fAlm);
    topNegativos = topNegativos.filter(n => n.alm === fAlm);
  }

  const totalReg = porAlmacen.reduce((a, b) => a + b.registros, 0);
  const negCount = porAlmacen.reduce((a, b) => a + b.negativos, 0);
  const k = state.zwm.kpis;

  $("kpiNeg").innerHTML = [
    heroCard({
      title: "Registros con negativos", value: fmt(negCount), unit: "",
      note: `${fmt(totalReg)} registros analizados`,
      badge: `Permanencia prom: ${fmt(k.permanenciaPromedio)} días`,
    }),
    kpiCard({ icon: "fa-triangle-exclamation", tone: "gold", title: "Stock negativo", value: fmt(negCount), unit: "",
      pct: totalReg ? (negCount / totalReg) * 100 : 0, barLabel: "Del total",
      foot: "Alertas de inventario" }),
    kpiCard({ icon: "fa-clock", tone: "amber", title: "Permanencia prom.", value: fmt(k.permanenciaPromedio), unit: "días",
      pct: 100, barLabel: "En almacén",
      foot: `Productos con mayor antigüedad` }),
    kpiCard({ icon: "fa-boxes-stacked", tone: "green", title: "Stock total", value: fmt(k.totalStock), unit: "unid.",
      pct: 100, barLabel: "Suma total",
      foot: `${fmt(k.totalRegistros)} registros` }),
  ].join("");

  renderDoughnut("nNegativos",
    ["Negativos", "Positivos/Cero"],
    [negCount, Math.max(0, totalReg - negCount)],
    fmt(totalReg), "registros");

  const neg = topNegativos.slice(0, 30);
  $("nTabla").innerHTML = neg.length
    ? tabla(
        [{ t: "Material" }, { t: "Descripción" }, { t: "Lote" }, { t: "Almacén" }, { t: "Stock", num: 1 }],
        neg.map((n) => [n.mat, truncar(n.texto, 40), n.lote, n.alm, `<span class="pill pill-orange">${n.stock}</span>`])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-check-circle"></i><span>Sin negativos</span></div>`;
}

/* ---------- SUB-ASISTENCIA ---------- */
function renderAsistencia() {
  if (!state.asistencia) { $("gridAsis").innerHTML = vacioMensaje(12); $("kpiAsis").innerHTML = ""; return; }
  const fTrab = filtroActivo("fAsisTrabajador");
  const fPerm = filtroActivo("fAsisPermiso");
  const fFecha = filtroActivo("fAsisFecha");

  const filas = state.asistencia.filas.filter(f => {
    if (fTrab && f.nombre !== fTrab) return false;
    if (fPerm && f.permiso !== fPerm) return false;
    if (fFecha && f.fecha !== fFecha) return false;
    return true;
  });

  let totalHoras = 0, totalAtrasos = 0;
  const setTrab = new Set();
  const porFecha = {}, porPermiso = {}, porTrabajador = {};
  filas.forEach(f => {
    totalHoras += f.horasTrab;
    totalAtrasos += f.atraso;
    setTrab.add(f.dni || f.nombre);
    if (f.fecha) porFecha[f.fechaEt] = (porFecha[f.fechaEt] || 0) + f.horasTrab;
    if (f.permiso && f.permiso !== "Ninguno") porPermiso[f.permiso] = (porPermiso[f.permiso] || 0) + 1;
    const key = f.dni || f.nombre;
    if (!porTrabajador[key]) porTrabajador[key] = { nombre: f.nombre, horas: 0, atrasos: 0, hea: 0, hec: 0 };
    porTrabajador[key].horas += f.horasTrab;
    porTrabajador[key].atrasos += f.atraso;
    porTrabajador[key].hea += f.hea;
    porTrabajador[key].hec += f.hec;
  });

  $("kpiAsis").innerHTML = [
    heroCard({
      title: "Horas trabajadas", value: fmt(totalHoras, 1), unit: "h",
      note: `${fmt(setTrab.size)} trabajadores · ${fmt(filas.length)} registros`,
      badge: `Atrasos: ${fmt(totalAtrasos, 1)} h`,
    }),
    kpiCard({ icon: "fa-users", tone: "gold", title: "Trabajadores", value: fmt(setTrab.size), unit: "",
      pct: 100, barLabel: "Distintos",
      foot: `En el periodo` }),
    kpiCard({ icon: "fa-clock", tone: "amber", title: "Atrasos totales", value: fmt(totalAtrasos, 1), unit: "h",
      pct: totalHoras ? (totalAtrasos / totalHoras) * 100 : 0, barLabel: "Sobre horas trabajadas",
      foot: `En los registros filtrados` }),
    kpiCard({ icon: "fa-calendar-times", tone: "green", title: "Permisos", value: fmt(Object.values(porPermiso).reduce((a, b) => a + b, 0)), unit: "",
      pct: 100, barLabel: "Registrados",
      foot: `${fmt(Object.keys(porPermiso).length)} tipos distintos` }),
  ].join("");

  const fechasArr = Object.entries(porFecha);
  fechasArr.sort((a, b) => {
    const fa = state.asistencia.filas.find(x => x.fechaEt === a[0])?.fecha || "";
    const fb = state.asistencia.filas.find(x => x.fechaEt === b[0])?.fecha || "";
    return fa.localeCompare(fb);
  });
  const fechaArr = fechasArr.slice(-30);
  renderArea("aHorasFecha", fechaArr.map(f => f[0]), [
    { label: "Horas trabajadas", color: C.gold, data: fechaArr.map(f => round(f[1], 1)) },
  ], { decimals: 1 });

  const permArr = Object.entries(porPermiso).sort((a, b) => b[1] - a[1]);
  const top6 = permArr.slice(0, 6);
  const otros = permArr.slice(6).reduce((a, e) => a + e[1], 0);
  const pd = top6.map(x => x[1]); const pl = top6.map(x => x[0]);
  if (otros > 0) { pd.push(otros); pl.push("Otros"); }
  renderDoughnut("aPermisos", pl, pd, fmt(filas.length), "registros");

  const topTrab = Object.values(porTrabajador).sort((a, b) => b.horas - a.horas).slice(0, 30);
  $("aTablaTrab").innerHTML = topTrab.length
    ? tabla(
        [{ t: "Trabajador" }, { t: "Horas trab.", num: 1 }, { t: "Atrasos", num: 1 }, { t: "HEA", num: 1 }, { t: "HEC", num: 1 }],
        topTrab.map(t => [truncar(t.nombre, 40), fmt(t.horas, 1), fmt(t.atrasos, 2), fmt(t.hea, 2), fmt(t.hec, 2)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- SUB-HORAS EXTRA ---------- */
function renderHorasExtra() {
  if (!state.horasExtra) { $("gridHoras").innerHTML = vacioMensaje(12); $("kpiHoras").innerHTML = ""; return; }
  const fTrab = filtroActivo("fHorasTrabajador");

  const filas = state.horasExtra.filas.filter(f => {
    if (fTrab && f.nombre !== fTrab) return false;
    return true;
  });

  let totalHoras = 0;
  const setTrab = new Set();
  const porTrab = {};
  filas.forEach(f => {
    totalHoras += f.cantidad;
    setTrab.add(f.dni || f.nombre);
    const key = f.dni || f.nombre;
    if (!porTrab[key]) porTrab[key] = { nombre: f.nombre, horas: 0, movimientos: 0 };
    porTrab[key].horas += f.cantidad;
    porTrab[key].movimientos++;
  });

  $("kpiHoras").innerHTML = [
    heroCard({
      title: "Total horas extra", value: fmt(totalHoras, 1), unit: "h",
      note: `${fmt(setTrab.size)} trabajadores · ${fmt(filas.length)} movimientos`,
      badge: `${fmt(filas.length ? totalHoras / filas.length : 0, 2)} h por movimiento`,
    }),
    kpiCard({ icon: "fa-users", tone: "gold", title: "Trabajadores", value: fmt(setTrab.size), unit: "",
      pct: 100, barLabel: "Distintos",
      foot: `Con horas extra` }),
    kpiCard({ icon: "fa-clock", tone: "amber", title: "Horas promedio", value: fmt(setTrab.size ? totalHoras / setTrab.size : 0, 2), unit: "h",
      pct: 100, barLabel: "Por trabajador",
      foot: `En el periodo` }),
    kpiCard({ icon: "fa-list", tone: "green", title: "Movimientos", value: fmt(filas.length), unit: "",
      pct: 100, barLabel: "Registros",
      foot: `Cantidad de registros` }),
  ].join("");

  const topTrab = Object.values(porTrab).sort((a, b) => b.horas - a.horas).slice(0, 20);
  renderScrollHBar("hTrabajador", topTrab.map(t => truncar(t.nombre, 30)), topTrab.map(t => round(t.horas, 2)), C.goldDark, C.goldLight, 2);

  const tablaFilas = filas.slice(0, 30);
  $("hTablaMov").innerHTML = tablaFilas.length
    ? tabla(
        [{ t: "Trabajador" }, { t: "Inicio" }, { t: "Fin" }, { t: "Horas", num: 1 }, { t: "Normales" }, { t: "Adicionales" }],
        tablaFilas.map(f => [truncar(f.nombre, 36), f.inicio, f.fin, fmt(f.cantidad, 2), f.normales, f.adicionales])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- SUB-FACT PEDIDO ---------- */
function renderFactPedido() {
  if (!state.factPedido) { $("gridPed").innerHTML = vacioMensaje(12); $("kpiPed").innerHTML = ""; return; }
  const fZona = filtroActivo("fPedZona");
  const fFecha = filtroActivo("fPedFecha");

  const filas = state.factPedido.filas.filter(f => {
    if (fZona && f.zona !== fZona) return false;
    if (fFecha && f.fecha !== fFecha) return false;
    return true;
  });

  let totValNetoPed = 0, totValNetoFact = 0, totCantPed = 0, totCantEnt = 0;
  const setPedidos = new Set();
  const porZona = {};
  filas.forEach(f => {
    totValNetoPed += f.valNetoPed;
    totValNetoFact += f.valNetoFact;
    totCantPed += f.cantPed;
    totCantEnt += f.cantEnt;
    setPedidos.add(f.pedido);
    porZona[f.zona] = (porZona[f.zona] || 0) + f.valNetoFact;
  });
  const ticketProm = setPedidos.size ? totValNetoPed / setPedidos.size : 0;

  $("kpiPed").innerHTML = [
    heroCard({
      title: "Total Valor Neto Pedido", value: "S/ " + fmt(totValNetoPed, 2), unit: "",
      note: `${fmt(setPedidos.size)} pedidos · ${fmt(filas.length)} líneas`,
      badge: `Ticket prom: S/ ${fmt(ticketProm, 2)}`,
    }),
    kpiCard({ icon: "fa-file-invoice-dollar", tone: "gold", title: "Total Valor Neto Factura", value: "S/ " + fmt(totValNetoFact, 2), unit: "",
      pct: totValNetoPed ? (totValNetoFact / totValNetoPed) * 100 : 0, barLabel: "Sobre el pedido",
      foot: `Facturado del pedido` }),
    kpiCard({ icon: "fa-shopping-cart", tone: "amber", title: "Total pedidos", value: fmt(setPedidos.size), unit: "",
      pct: 100, barLabel: "Distintos",
      foot: `${fmt(filas.length)} líneas` }),
    kpiCard({ icon: "fa-cubes", tone: "green", title: "Cantidad pedido", value: fmt(totCantPed), unit: "",
      pct: totCantPed ? (totCantEnt / totCantPed) * 100 : 0, barLabel: "Entregado",
      foot: `${fmt(totCantEnt)} entregado` }),
  ].join("");

    // Cantidad de pedidos por fecha (únicos)
  const porFecha = {};
  filas.forEach(f => {
    if (!f.fecha) return;
    if (!porFecha[f.fecha]) porFecha[f.fecha] = { fecha: f.fecha, fechaEt: f.fechaEt, pedidos: new Set() };
    porFecha[f.fecha].pedidos.add(f.pedido);
  });
  const fechasArr = Object.values(porFecha).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-30);
  renderArea("fpFecha", fechasArr.map(f => f.fechaEt), [
    { label: "Pedidos", color: C.gold, data: fechasArr.map(f => f.pedidos.size) },
  ], { decimals: 0 });

    const zonaArr = Object.entries(porZona).sort((a, b) => b[1] - a[1]).slice(0, 12);
  renderHBar("fpZona", zonaArr.map(z => truncar(z[0], 22)), zonaArr.map(z => round(z[1], 2)), C.goldDark, C.goldLight, 2);

  const top = filas.sort((a, b) => b.valNetoFact - a.valNetoFact).slice(0, 30);
  $("fpTabla").innerHTML = top.length
    ? tabla(
        [{ t: "Pedido" }, { t: "Fecha" }, { t: "Zona" }, { t: "Pagador" }, { t: "V.Neto Ped.", num: 1 }, { t: "V.Neto Fact.", num: 1 }],
        top.map(f => [f.pedido, f.fechaEt, truncar(f.zona, 18), truncar(f.nombrePag, 26), fmt(f.valNetoPed, 2), fmt(f.valNetoFact, 2)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- SUB-FACT PLU ---------- */
function renderFactPLU() {
  if (!state.factPLU) { $("gridPLU").innerHTML = vacioMensaje(12); $("kpiPLU").innerHTML = ""; return; }
  const fJer = filtroActivo("fPluJerarquia");
  const fFecha = filtroActivo("fPluFecha");

  const filas = state.factPLU.filas.filter(f => {
    if (fJer && f.jerarquia !== fJer) return false;
    if (fFecha && f.fecha !== fFecha) return false;
    return true;
  });

  let totValNeto = 0, totCantPed = 0, totCantEnt = 0;
  const porJer = {};
  const setPedidos = new Set();
  filas.forEach(f => {
    totValNeto += f.valNeto;
    totCantPed += f.cantPed;
    totCantEnt += f.cantEnt;
    setPedidos.add(f.pedido);
    porJer[f.jerarquia] = (porJer[f.jerarquia] || 0) + f.valNeto;
  });

  $("kpiPLU").innerHTML = [
    heroCard({
      title: "Total Valor Neto Pedido", value: "S/ " + fmt(totValNeto, 2), unit: "",
      note: `${fmt(filas.length)} líneas · ${fmt(setPedidos.size)} pedidos`,
      badge: `${fmt(Object.keys(porJer).length)} jerarquías`,
    }),
    kpiCard({ icon: "fa-cubes", tone: "gold", title: "Total cantidad pedido", value: fmt(totCantPed), unit: "",
      pct: 100, barLabel: "Total",
      foot: `Unidades pedidas` }),
    kpiCard({ icon: "fa-check", tone: "amber", title: "Total cantidad entrega", value: fmt(totCantEnt), unit: "",
      pct: totCantPed ? (totCantEnt / totCantPed) * 100 : 0, barLabel: "Sobre lo pedido",
      foot: `Unidades entregadas` }),
    kpiCard({ icon: "fa-list", tone: "green", title: "Jerarquías", value: fmt(Object.keys(porJer).length), unit: "",
      pct: 100, barLabel: "Distintas",
      foot: `Categorías de producto` }),
  ].join("");

  const jerArr = Object.entries(porJer).sort((a, b) => b[1] - a[1]).slice(0, 15);
  renderScrollHBar("fplJerarquia", jerArr.map(j => truncar(j[0], 22)), jerArr.map(j => round(j[1], 2)), C.goldDark, C.goldLight, 2);

  const top = filas.sort((a, b) => b.valNeto - a.valNeto).slice(0, 30);
  $("fplTabla").innerHTML = top.length
    ? tabla(
        [{ t: "Jerarquía" }, { t: "Pedido" }, { t: "Fecha" }, { t: "Cant. pedido", num: 1 }, { t: "Cant. entrega", num: 1 }, { t: "V.Neto", num: 1 }],
        top.map(f => [truncar(f.jerarquia, 22), f.pedido, f.fechaEt, fmt(f.cantPed), fmt(f.cantEnt), fmt(f.valNeto, 2)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- SUB-RECEP PACKING ---------- */
function renderRecepPacking() {
  if (!state.recepPacking) { $("gridPack").innerHTML = vacioMensaje(12); $("kpiPack").innerHTML = ""; return; }
  const fCamp = filtroActivo("fPackCampana");
  const fFecha = filtroActivo("fPackFecha");

  const d = state.recepPacking;

  let porDescripcion = d.porDescripcion;
  if (fFecha) {
    porDescripcion = porDescripcion.filter(x => x.fechas && x.fechas.includes(fFecha));
  }

  let porCampana = d.porCampana;
  if (fCamp) {
    porCampana = porCampana.filter(c => c.campana === fCamp);
  }

  const totCant = porDescripcion.reduce((a, x) => a + x.cant, 0) || d.kpis.totalCantidad;

  $("kpiPack").innerHTML = [
    heroCard({
      title: "Total cantidad importada", value: fmt(totCant), unit: "unid.",
      note: `${fmt(d.kpis.totalRegistros)} registros · ${fmt(d.kpis.totalCajas)} cajas`,
      badge: `${fmt(d.kpis.totalImportaciones)} importaciones`,
    }),
    kpiCard({ icon: "fa-boxes-packing", tone: "gold", title: "Total cajas importadas", value: fmt(d.kpis.totalCajas), unit: "",
      pct: 100, barLabel: "Distintas",
      foot: `${fmt(d.kpis.totalRegistros)} registros` }),
    kpiCard({ icon: "fa-calendar", tone: "amber", title: "Meses activos", value: fmt(d.porMes.length), unit: "",
      pct: 100, barLabel: "Distintos",
      foot: `Con importaciones` }),
    kpiCard({ icon: "fa-flag", tone: "green", title: "Campañas", value: fmt(d.porCampana.length), unit: "",
      pct: 100, barLabel: "Distintas",
      foot: `En el packing` }),
  ].join("");

  const mesesMap = { ENERO:1, FEBRERO:2, MARZO:3, ABRIL:4, MAYO:5, JUNIO:6, JULIO:7, AGOSTO:8, SEPTIEMBRE:9, SETIEMBRE:9, OCTUBRE:10, NOVIEMBRE:11, DICIEMBRE:12 };
const mesesArr = d.porMes.slice().sort((a, b) => (mesesMap[a.mes.toUpperCase()] || 99) - (mesesMap[b.mes.toUpperCase()] || 99));
  renderColumns("rpMes", mesesArr.map(m => m.mes), mesesArr.map(m => round(m.cant)), C.goldLight, C.goldDark, 0);

  const campArr = porCampana.slice().sort((a, b) => b.cant - a.cant);
  const top6 = campArr.slice(0, 6);
  const otros = campArr.slice(6).reduce((a, e) => a + e.cant, 0);
  const cd = top6.map(c => c.cant); const cl = top6.map(c => c.campana);
  if (otros > 0) { cd.push(otros); cl.push("Otros"); }
  renderDoughnut("rpCampana", cl, cd, fmt(totCant), "unidades");

  const top = porDescripcion.slice(0, 50);
  $("rpTabla").innerHTML = top.length
    ? tabla(
        [{ t: "Descripción" }, { t: "Cantidad", num: 1 }, { t: "Importaciones", num: 1 }],
        top.map(f => [truncar(f.desc, 45), fmt(f.cant), fmt(f.importaciones)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- SUB-RECEP DETALLE ---------- */
function renderRecepDetalle() {
  if (!state.recepDetalle) { $("gridDet").innerHTML = vacioMensaje(12); $("kpiDet").innerHTML = ""; return; }
  const fProv = filtroActivo("fDetProveedor");
  const fEstado = filtroActivo("fDetEstado");
  const fFecha = filtroActivo("fDetFecha");

  const d = state.recepDetalle;
  let porDetalle = d.porDetalle;
  if (fProv || fEstado || fFecha) {
    porDetalle = porDetalle.filter(x => {
      if (fProv && x.proveedor !== fProv) return false;
      if (fEstado && x.estado !== fEstado) return false;
      if (fFecha && !(x.fechas && x.fechas.includes(fFecha))) return false;
      return true;
    });
  }

  const totCant = porDetalle.reduce((a, x) => a + x.cantidad, 0);
  const totIng = porDetalle.reduce((a, x) => a + x.ingresado, 0);
  const totPend = porDetalle.reduce((a, x) => a + x.pendiente, 0);
  const setProv = new Set(porDetalle.map(x => x.proveedor).filter(Boolean));
  const pct = totCant ? (totIng / totCant) * 100 : 0;

  $("kpiDet").innerHTML = [
    heroCard({
      title: "Total cantidad ingresada", value: fmt(totIng), unit: "unid.",
      note: `${fmt(totCant)} unidades totales`,
      badge: `${pct.toFixed(1)}% de ingreso`,
    }),
    kpiCard({ icon: "fa-clipboard-check", tone: "gold", title: "Cantidad pendiente", value: fmt(totPend), unit: "unid.",
      pct: totCant ? (totPend / totCant) * 100 : 0, barLabel: "Por ingresar",
      foot: `De ${fmt(totCant)} unidades` }),
    kpiCard({ icon: "fa-percent", tone: "amber", title: "% de ingreso", value: pct.toFixed(1) + "%", unit: "",
      pct: pct, barLabel: "Ingresado / total",
      foot: `${fmt(totIng)} de ${fmt(totCant)}` }),
    kpiCard({ icon: "fa-truck", tone: "green", title: "Proveedores", value: fmt(setProv.size), unit: "",
      pct: 100, barLabel: "Distintos",
      foot: `En la producción` }),
  ].join("");

  const ordenMeses = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  const mesesMap = { ENERO:1, FEBRERO:2, MARZO:3, ABRIL:4, MAYO:5, JUNIO:6, JULIO:7, AGOSTO:8, SEPTIEMBRE:9, SETIEMBRE:9, OCTUBRE:10, NOVIEMBRE:11, DICIEMBRE:12 };
const mesesArr = d.porMes.slice().sort((a, b) => (mesesMap[a.mes.toUpperCase()] || 99) - (mesesMap[b.mes.toUpperCase()] || 99));
  renderGrouped("rdMes", mesesArr.map(m => m.mes), [
    { label: "Ingresado", color: C.gold, data: mesesArr.map(m => round(m.ingresado)) },
    { label: "Pendiente", color: C.orange, data: mesesArr.map(m => round(m.pendiente)) },
  ]);

  const top = porDetalle.slice(0, 30);
  $("rdTabla").innerHTML = top.length
    ? tabla(
        [{ t: "Material" }, { t: "PLU" }, { t: "Talla" }, { t: "Proveedor" }, { t: "Estado" }, { t: "Cantidad", num: 1 }, { t: "Ingresado", num: 1 }, { t: "Pendiente", num: 1 }],
        top.map(f => [f.material, f.plu, f.talla, truncar(f.proveedor, 24), f.estado, fmt(f.cantidad), fmt(f.ingresado), fmt(f.pendiente)])
      )
    : `<div class="plot-empty" style="display:flex;position:static;min-height:120px"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div>`;
}

/* ---------- Navegación ---------- */
function cambiarSub(sub) {
  subActual = sub;
  document.querySelectorAll("#subTabs .subtab").forEach((t) => t.classList.toggle("active", t.dataset.sub === sub));
  ["resumen", "movimientos", "traslados", "negativos"].forEach((s) => {
    const el = document.getElementById("sub-" + s);
    if (el) el.style.display = s === sub ? "block" : "none";
  });
  if (sub === "resumen") renderResumen();
  else if (sub === "movimientos") renderMovimientos();
  else if (sub === "traslados") renderTraslados();
  else if (sub === "negativos") renderNegativos();
  requestAnimationFrame(() => Object.values(charts).forEach((c) => c.resize()));
}
function cambiarSubA(sub) {
  subActualA = sub;
  document.querySelectorAll("#subTabsA .subtab").forEach((t) => t.classList.toggle("active", t.dataset.sub === sub));
  ["asistencia", "horasextra"].forEach((s) => {
    const el = document.getElementById("subA-" + s);
    if (el) el.style.display = s === sub ? "block" : "none";
  });
  if (sub === "asistencia") renderAsistencia();
  else if (sub === "horasextra") renderHorasExtra();
  requestAnimationFrame(() => Object.values(charts).forEach((c) => c.resize()));
}

function cambiarSubF(sub) {
  subActualF = sub;
  document.querySelectorAll("#subTabsF .subtab").forEach(t => t.classList.toggle("active", t.dataset.sub === sub));
  ["pedido", "plu"].forEach(s => {
    const el = document.getElementById("subF-" + s);
    if (el) el.style.display = s === sub ? "block" : "none";
  });
  if (sub === "pedido") renderFactPedido();
  else if (sub === "plu") renderFactPLU();
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}

function cambiarSubR(sub) {
  subActualR = sub;
  document.querySelectorAll("#subTabsR .subtab").forEach(t => t.classList.toggle("active", t.dataset.sub === sub));
  ["packing", "detalle"].forEach(s => {
    const el = document.getElementById("subR-" + s);
    if (el) el.style.display = s === sub ? "block" : "none";
  });
  if (sub === "packing") renderRecepPacking();
  else if (sub === "detalle") renderRecepDetalle();
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}
function cambiarSeccion(seccion) {
  document.querySelectorAll("#dashTabs .tab").forEach((t) => {
    if (t.classList.contains("is-disabled")) return;
    t.classList.toggle("active", t.dataset.seccion === seccion);
  });
  ["almacen", "asistencia", "facturacion", "recepcion"].forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.hidden = s !== seccion;
  });
  if (seccion === "almacen") cambiarSub(subActual);
  if (seccion === "asistencia") cambiarSubA(subActualA);
    if (seccion === "facturacion") cambiarSubF(subActualF);
      if (seccion === "recepcion") cambiarSubR(subActualR);
}

/* ---------- Eventos ---------- */
function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  document.querySelectorAll("#dashTabs .tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      if (tab.classList.contains("is-disabled")) return;
      cambiarSeccion(tab.dataset.seccion);
    });
  });
  document.querySelectorAll("#subTabs .subtab").forEach((t) => {
    t.addEventListener("click", () => cambiarSub(t.dataset.sub));
  });
  document.querySelectorAll("#subTabsA .subtab").forEach((t) => {
    t.addEventListener("click", () => cambiarSubA(t.dataset.sub));
  });

  const aplicar = () => cambiarSub(subActual);
  const aplicarA = () => cambiarSubA(subActualA);

  ["fResAlmacen","fResCategoria","fMovUsuario","fMovCategoria","fMovFecha","fTrasUsuario","fNegAlmacen"].forEach((id) => {
    const el = $(id); if (el) el.addEventListener("change", aplicar);
  });
  ["clearResumen","clearMov","clearTras","clearNeg"].forEach((id) => {
    const btn = $(id);
    if (btn) btn.addEventListener("click", () => {
      ["fResAlmacen","fResCategoria","fMovUsuario","fMovCategoria","fMovFecha","fTrasUsuario","fNegAlmacen"].forEach((x) => {
        const el = $(x); if (el) el.value = "";
      });
      aplicar();
    });
  });

  ["fAsisTrabajador","fAsisPermiso","fAsisFecha","fHorasTrabajador"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", aplicarA);
  });
  ["clearAsis","clearHoras"].forEach(id => {
    const btn = $(id);
    if (btn) btn.addEventListener("click", () => {
      ["fAsisTrabajador","fAsisPermiso","fAsisFecha","fHorasTrabajador"].forEach(x => {
        const el = $(x); if (el) el.value = "";
      });
      aplicarA();
    });
  });

  document.querySelectorAll(".js-refresh").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = true; x.classList.add("is-loading"); });
      try { await cargarTodo(); } catch (err) { console.error(err); }
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = false; x.classList.remove("is-loading"); });
    })
  );

    document.querySelectorAll("#subTabsF .subtab").forEach(t => {
    t.addEventListener("click", () => cambiarSubF(t.dataset.sub));
  });
  ["fPedZona","fPedFecha","fPluJerarquia","fPluFecha"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", () => cambiarSubF(subActualF));
  });
  ["clearPed","clearPLU"].forEach(id => {
    const btn = $(id);
    if (btn) btn.addEventListener("click", () => {
      ["fPedZona","fPedFecha","fPluJerarquia","fPluFecha"].forEach(x => {
        const el = $(x); if (el) el.value = "";
      });
      cambiarSubF(subActualF);
    });
  });
      document.querySelectorAll("#subTabsR .subtab").forEach(t => {
    t.addEventListener("click", () => cambiarSubR(t.dataset.sub));
  });
  ["fPackCampana","fPackFecha","fDetProveedor","fDetEstado","fDetFecha"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", () => cambiarSubR(subActualR));
  });
  ["clearPack","clearDet"].forEach(id => {
    const btn = $(id);
    if (btn) btn.addEventListener("click", () => {
      ["fPackCampana","fPackFecha","fDetProveedor","fDetEstado","fDetFecha"].forEach(x => {
        const el = $(x); if (el) el.value = "";
      });
      cambiarSubR(subActualR);
    });
  });
}

/* ---------- Carga completa ---------- */
async function cargarTodo() {
  const [mb52, lt22, zlx12, zwm, asistencia, horasExtra, factPedido, factPLU, recepPacking, recepDetalle] = await Promise.all([
    cargarHoja("ALM_MB52").catch(() => null),
    cargarHoja("ALM_LT22").catch(() => null),
    cargarHoja("ALM_ZLX12").catch(() => null),
    cargarHoja("ALM_ZWM").catch(() => null),
    cargarHoja("ASIS_ASISTENCIA").catch(() => null),
    cargarHoja("ASIS_HORAS_EXTRA").catch(() => null),
    cargarHoja("FACT_PEDIDO").catch(() => null),
    cargarHoja("FACT_PLU").catch(() => null),
    cargarHoja("RECEP_PACKING").catch(() => null),
    cargarHoja("RECEP_DETALLE").catch(() => null),
  ]);
  state.mb52 = mb52; state.lt22 = lt22; state.zlx12 = zlx12; state.zwm = zwm;
  state.asistencia = asistencia; state.horasExtra = horasExtra;
  state.factPedido = factPedido; state.factPLU = factPLU;
  state.recepPacking = recepPacking; state.recepDetalle = recepDetalle;

    const count = [mb52, lt22, zlx12, zwm, asistencia, horasExtra, factPedido, factPLU, recepPacking, recepDetalle].filter(Boolean).length;
  $("stRegistros").textContent = `${count} / 10`;
  $("stSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  const totalReg = (mb52?.filas?.length || 0) + (lt22?.filas?.length || 0) +
                   (zlx12?.filas?.length || 0) + (state.zwm?.kpis?.totalRegistros || 0) +
                   (state.asistencia?.kpis?.totalRegistros || 0) +
                   (state.horasExtra?.kpis?.totalRegistros || 0) +
                   (state.factPedido?.kpis?.totalRegistros || 0) +
                   (state.factPLU?.kpis?.totalRegistros || 0) +
                   (state.recepPacking?.kpis?.totalRegistros || 0) +
                   (state.recepDetalle?.kpis?.totalRegistros || 0);
  $("chipRegistros").textContent = fmt(totalReg);
  $("chipSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  llenarSegmentadores();
  cambiarSub(subActual);
}

/* ---------- Inicio ---------- */
(async function init() {
  construirLayoutInterno();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    engancharEventos();
    const hash = location.hash.replace("#", "");
    cambiarSeccion(hash || "almacen");
  } catch (err) {
    console.error(err);
    $("loading").innerHTML = `
      <div class="error-box">
        <i class="fas fa-triangle-exclamation"></i>
        <h3>No se pudieron cargar los datos</h3>
        <p>${err.message || err}</p>
      </div>`;
  }
})();