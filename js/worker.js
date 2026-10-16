/* ==========================================================
   Web Worker — Almacén
   Procesa MB52 / LT22 / ZLX12 / ZWM.
   Devuelve KPIs + filas crudas comprimidas (solo columnas usadas).
   ========================================================== */

self.onmessage = function (e) {
  const { tipo, rows } = e.data;
  try {
    let resultado;
        if (tipo === "MB52" || tipo === "ALM_MB52") resultado = procesarMB52(rows);
    else if (tipo === "LT22" || tipo === "ALM_LT22") resultado = procesarLT22(rows);
    else if (tipo === "ZLX12" || tipo === "ALM_ZLX12") resultado = procesarZLX12(rows);
    else if (tipo === "ZWM" || tipo === "ALM_ZWM") resultado = procesarZWM(rows);
    else if (tipo === "ASISTENCIA" || tipo === "ASIS_ASISTENCIA") resultado = procesarAsistencia(rows);
    else if (tipo === "HORAS_EXTRA" || tipo === "ASIS_HORAS_EXTRA") resultado = procesarHorasExtra(rows);
    else if (tipo === "PEDIDO" || tipo === "FACT_PEDIDO") resultado = procesarFactPedido(rows);
    else if (tipo === "PLU" || tipo === "FACT_PLU") resultado = procesarFactPLU(rows);
    else if (tipo === "PACKING_2026" || tipo === "RECEP_PACKING") resultado = procesarRecepPacking(rows);
    else if (tipo === "DETALLE_POR_PLU" || tipo === "RECEP_DETALLE") resultado = procesarRecepDetalle(rows);
    else throw new Error("Tipo desconocido: " + tipo);
    self.postMessage({ ok: true, tipo, resultado });
  } catch (err) {
    self.postMessage({ ok: false, tipo, error: err.message });
  }
};

/* ---------- Helpers ---------- */
function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  if (v.toString().startsWith("#")) return 0;
  const s = v.toString().replace(",", ".").replace(/[^0-9.-]/g, "");
  return parseFloat(s) || 0;
}

/* Fecha → etiqueta "23 sep" (día + mes abreviado) */
function formatearFecha(valor) {
  const s = norm(valor);
  if (!s) return "";
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s);
    const ts = (serial - 25569) * 86400 * 1000;
    return etiquetaFecha(ts);
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return etiquetaFecha(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m) {
    let a = +m[3]; if (a < 100) a += 2000;
    return etiquetaFecha(Date.UTC(a, +m[2] - 1, +m[1]));
  }
  return s;
}
const MESES_ABREV = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function etiquetaFecha(ts) {
  const d = new Date(ts);
  return String(d.getUTCDate()).padStart(2, "0") + " " + MESES_ABREV[d.getUTCMonth()];
}
function fechaOrdenable(valor) {
  const s = norm(valor);
  if (!s) return "";
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s);
    return String(serial);
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m) {
    let a = +m[3]; if (a < 100) a += 2000;
    return `${a}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
  }
  return s;
}

/* ---------- MB52 ---------- */
function procesarMB52(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map((c) => (c || "").toString().trim().toLowerCase());
    if (f.includes("almacén") || f.includes("almacen") || f.includes("material")) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => {
    const limpio = (h || "").toString().trim();
    return limpio === "" ? `Columna_${i + 1}` : limpio;
  });
  const cAlm = headers.findIndex((h) => h.toLowerCase().includes("almac"));
  const cMat = headers.findIndex((h) => h.toLowerCase() === "material");
  const cCat = headers.findIndex((h) => h.toLowerCase().includes("categor"));
  const cTalla = headers.findIndex((h) => h.toLowerCase().includes("valor matriz"));
  const cTexto = headers.findIndex((h) => h.toLowerCase().includes("texto breve"));
  const cStock = headers.findIndex((h) => h.toLowerCase().includes("stock disponible"));
  const cLibre = headers.findIndex((h) => h.toLowerCase().includes("libre utiliz"));
  const cBloq = headers.findIndex((h) => h.toLowerCase().includes("bloqueado"));
  const cCtrl = headers.findIndex((h) => h.toLowerCase().includes("control calidad"));

  const filas = [];
  let totalStock = 0, totalLibre = 0, totalBloq = 0, totalCtrl = 0;
  const matsSet = new Set();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const mat = norm(r[cMat]);
    if (!mat) continue;

    const alm = norm(r[cAlm]) || "Sin almacén";
    const cat = norm(r[cCat]) || "Sin categoría";
    const talla = norm(r[cTalla]) || "Sin talla";
    const texto = norm(r[cTexto]);
    const stock = num(r[cStock]);
    const libre = num(r[cLibre]);
    const bloq = num(r[cBloq]);
    const ctrl = num(r[cCtrl]);

    totalStock += stock; totalLibre += libre; totalBloq += bloq; totalCtrl += ctrl;
    matsSet.add(mat);

    filas.push({ alm, mat, cat, talla, texto, stock, libre, bloq, ctrl });
  }

  return {
    tipo: "MB52",
    kpis: {
      totalRegistros: filas.length,
      materialesUnicos: matsSet.size,
      totalStock, totalLibre, totalBloq, totalCtrl,
    },
    filas,
  };
}

/* ---------- LT22 ---------- */
function procesarLT22(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map((c) => (c || "").toString().trim().toLowerCase());
    if (f.some((c) => c.includes("orden de transporte"))) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);

  const cFecha = headers.findIndex((h) => h.toLowerCase().includes("fecha creac"));
  const cMaterial = headers.findIndex((h) => h.toLowerCase() === "material");
  const cTexto = headers.findIndex((h) => h.toLowerCase().includes("texto breve"));
  const cCtdReal = headers.findIndex((h) => h.toLowerCase().includes("ctd.real"));
  const cTipoAlmOri = headers.findIndex((h) => h.toLowerCase().includes("tipo alm.proced"));
  const cTipoAlmDst = headers.findIndex((h) => h.toLowerCase().includes("tipo almacén destino"));
  const cUsuario = headers.findIndex((h) => h.toLowerCase() === "usuario");
  const cClMov = headers.findIndex((h) => h.toLowerCase().includes("cl.movimiento"));
  const cCategoria = headers.findIndex((h) => h.toLowerCase().includes("categoría stock"));

  const grupo = {};
  let totalCtd = 0;
  const matsSet = new Set();
  const usrSet = new Set();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const mat = norm(r[cMaterial]);
    if (!mat) continue;

    const ctd = num(r[cCtdReal]);
    const usuario = norm(r[cUsuario]) || "Sin usuario";
    const clase = norm(r[cClMov]) || "Sin clase";
    const cat = norm(r[cCategoria]) || "Sin categoría";
    const tipoAlmOri = norm(r[cTipoAlmOri]);
    const tipoAlmDst = norm(r[cTipoAlmDst]);
    let tipo = "Otro";
    if (tipoAlmOri && tipoAlmDst) tipo = "Traslado";
    else if (tipoAlmOri && !tipoAlmDst) tipo = "Entrada";
    else if (!tipoAlmOri && tipoAlmDst) tipo = "Salida";

    const fecha = formatearFecha(r[cFecha]);
    const fechaOrd = fechaOrdenable(r[cFecha]);

    totalCtd += ctd;
    matsSet.add(mat);
    usrSet.add(usuario);

    // Agrupar por combinación única
    const key = `${usuario}|${clase}|${cat}|${tipo}|${fecha}`;
    if (!grupo[key]) grupo[key] = { usuario, clase, cat, tipo, fecha, fechaOrd, mov: 0, ctd: 0 };
    grupo[key].mov++;
    grupo[key].ctd += ctd;
  }

  return {
    tipo: "LT22",
    kpis: {
      totalMovimientos: Object.values(grupo).reduce((a, g) => a + g.mov, 0),
      totalCantidad: totalCtd,
      materialesUnicos: matsSet.size,
      usuariosUnicos: usrSet.size,
    },
    filas: Object.values(grupo),
  };
}

/* ---------- ZLX12 ---------- */
function procesarZLX12(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map((c) => (c || "").toString().trim().toLowerCase());
    if (f.some((c) => c.includes("número de necesidad") || c.includes("numero de necesidad"))) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);

  const cMat = headers.findIndex((h) => h.toLowerCase().includes("número de material") || h.toLowerCase().includes("numero de material"));
  const cTexto = headers.findIndex((h) => h.toLowerCase().includes("texto breve"));
  const cCtd = headers.findIndex((h) => h.toLowerCase().includes("cant. real"));
  const cAlmDest = headers.findIndex((h) => h.toLowerCase().includes("ubic.procedencia") || h.toLowerCase().includes("ubic. procedencia"));
  const cUsuario = headers.findIndex((h) => h.toLowerCase().includes("nombre del usuario"));
  const cCategoria = headers.findIndex((h) => h.toLowerCase().includes("categoría stock"));

  const filas = [];
  let totalCtd = 0;
  const usrSet = new Set();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const mat = norm(r[cMat]);
    if (!mat) continue;

    const ctd = num(r[cCtd]);
    const destino = norm(r[cAlmDest]) || "Sin destino";
    const usuario = norm(r[cUsuario]) || "Sin usuario";
    const cat = norm(r[cCategoria]) || "Sin categoría";
    const texto = norm(r[cTexto]);

    totalCtd += ctd;
    usrSet.add(usuario);

    filas.push({ mat, texto, ctd, destino, usuario, cat });
  }

  return {
    tipo: "ZLX12",
    kpis: {
      totalTraslados: filas.length,
      totalCantidad: totalCtd,
      almacenesDestino: new Set(filas.map((f) => f.destino)).size,
      usuariosUnicos: usrSet.size,
    },
    filas,
  };
}

/* ---------- ZWM ---------- */
function procesarZWM(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map((c) => (c || "").toString().trim().toLowerCase());
    if (f.includes("material") && f.some((c) => c.includes("stock"))) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);

  const cAlm = headers.findIndex((h) => h.toLowerCase() === "alm.");
  const cMat = headers.findIndex((h) => h.toLowerCase().includes("número de material") || h.toLowerCase().includes("numero de material"));
  const cTexto = headers.findIndex((h) => h.toLowerCase().includes("marca") ? false : h.toLowerCase().includes("texto"));
  const cLote = headers.findIndex((h) => h.toLowerCase() === "lote");
  const cStock = headers.findIndex((h) => h.toLowerCase().includes("stock total"));
  const cPermanencia = headers.findIndex((h) => h.toLowerCase().includes("permanencia"));
  const cFecha = headers.findIndex((h) => h.toLowerCase().includes("fecha em"));

  const porAlmacen = {};
  const negativos = [];
  const porFecha = {};
  let totalStock = 0, negCount = 0, nPerm = 0, sumPerm = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const mat = norm(r[cMat]);
    if (!mat) continue;

    const alm = norm(r[cAlm]) || "Sin almacén";
    const lote = norm(r[cLote]);
    const texto = norm(r[cTexto]);
    const stock = num(r[cStock]);
    const permanencia = num(r[cPermanencia]);
    const fecha = formatearFecha(r[cFecha]);
    const fechaOrd = fechaOrdenable(r[cFecha]);

    totalStock += stock;
    if (permanencia > 0 && permanencia < 50000) { sumPerm += permanencia; nPerm++; }

    if (!porAlmacen[alm]) porAlmacen[alm] = { nombre: alm, registros: 0, stock: 0, negativos: 0 };
    porAlmacen[alm].registros++;
    porAlmacen[alm].stock += stock;

    if (stock < 0) {
      negCount++;
      porAlmacen[alm].negativos++;
      negativos.push({ mat, lote, texto, stock, alm, permanencia });
    }

    if (fecha) {
      if (!porFecha[fecha]) porFecha[fecha] = { fecha, fechaOrd, registros: 0, negativos: 0 };
      porFecha[fecha].registros++;
      if (stock < 0) porFecha[fecha].negativos++;
    }
  }

  negativos.sort((a, b) => a.stock - b.stock);
  const topNegativos = negativos.slice(0, 100);

  const porFechaArr = Object.values(porFecha).sort((a, b) => a.fechaOrd.localeCompare(b.fechaOrd));

  return {
    tipo: "ZWM",
    kpis: {
      totalRegistros: rows.length - headerIndex - 1,
      totalStock,
      stockNegativoCount: negCount,
      permanenciaPromedio: nPerm ? Math.round(sumPerm / nPerm) : 0,
    },
    porAlmacen: Object.values(porAlmacen).sort((a, b) => b.registros - a.registros),
    topNegativos,
    porFecha: porFechaArr,
  };
}

/* ---------- ASISTENCIA ---------- */
function horasDecimal(v) {
  // Si es número (fracción de día de Excel) → multiplicar por 24
  if (typeof v === "number") return v * 24;
  const s = norm(v);
  if (!s || s === "0:00:00" || s === "0") return 0;
  const m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (!m) return 0;
  return parseInt(m[1]) + parseInt(m[2]) / 60 + (m[3] ? parseInt(m[3]) / 3600 : 0);
}
const MESES_ABREV2 = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function parseFechaAsistencia(txt) {
  const s = norm(txt);
  const m = s.match(/^\w+\s+(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${String(+m[2]).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`;
  const m2 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m2) { let a = +m2[3]; if (a < 100) a += 2000; return `${a}-${String(+m2[2]).padStart(2,"0")}-${String(+m2[1]).padStart(2,"0")}`; }
  return s;
}
function etiquetaFecha2(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return String(+m[3]).padStart(2,"0") + " " + MESES_ABREV2[+m[2] - 1];
}

function procesarAsistencia(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map(c => (c || "").toString().trim().toLowerCase());
    if (f.includes("apellidos") && f.includes("nombre")) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);
    const cApellido = headers.findIndex(h => h.toLowerCase().trim() === "apellidos");
  const cNombre = headers.findIndex(h => h.toLowerCase().trim() === "nombre");
  const cDni = headers.findIndex(h => h.toLowerCase().includes("identificador"));
  const cGrupo = headers.findIndex(h => h.toLowerCase().trim() === "grupo");
  const cFecha = headers.findIndex(h => h.toLowerCase().trim() === "fecha");
  const cPermiso = headers.findIndex(h => h.toLowerCase().trim() === "permiso");
  const cAtraso = headers.findIndex(h => h.toLowerCase().trim() === "atraso");
  const cCargo = headers.findIndex(h => h.toLowerCase().trim() === "cargo");
  const cHT = headers.findIndex(h => h.toLowerCase().trim() === "ht");
  const cHEA = headers.findIndex(h => h.toLowerCase().trim() === "hea");
  const cHEC = headers.findIndex(h => h.toLowerCase().trim() === "hec");

  const filas = [];
  const setTrab = new Set();
  const porPermiso = {};
  let totalHoras = 0, totalAtrasos = 0, totalHEA = 0, totalHEC = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    if (i === headerIndex + 1) {
  console.log("Fila 1 - HT value:", r[cHT], "| horasTrab:", horasDecimal(r[cHT]));
  console.log("cHT index:", cHT);
}
    const ap = norm(r[cApellido]), nom = norm(r[cNombre]);
    if (!ap && !nom) continue;
    const nombre = `${ap} ${nom}`.trim();
    const dni = norm(r[cDni]);
    const grupo = norm(r[cGrupo]);
    const fecha = parseFechaAsistencia(r[cFecha]);
    const fechaEt = etiquetaFecha2(fecha);
    const permiso = norm(r[cPermiso]) || "Ninguno";
    const cargo = norm(r[cCargo]);
    const horasTrab = horasDecimal(r[cHT]);
    const atraso = horasDecimal(r[cAtraso]);
    const hea = horasDecimal(r[cHEA]);
    const hec = horasDecimal(r[cHEC]);

    totalHoras += horasTrab; totalAtrasos += atraso;
    totalHEA += hea; totalHEC += hec;
    setTrab.add(dni || nombre);
    if (permiso !== "Ninguno") porPermiso[permiso] = (porPermiso[permiso] || 0) + 1;

    filas.push({ nombre, dni, grupo, cargo, fecha, fechaEt, permiso, horasTrab, atraso, hea, hec });
  }

  return {
    tipo: "ASISTENCIA",
    kpis: {
      totalTrabajadores: setTrab.size, totalRegistros: filas.length,
      totalHoras, totalAtrasos, totalHEA, totalHEC, totalHE: totalHEA + totalHEC,
      totalPermisos: Object.values(porPermiso).reduce((a, b) => a + b, 0),
    },
    porPermiso: Object.entries(porPermiso).map(([k, v]) => ({ nombre: k, count: v })).sort((a, b) => b.count - a.count),
    filas,
  };
}

/* ---------- HORAS_EXTRA ---------- */
function procesarHorasExtra(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map(c => (c || "").toString().trim().toLowerCase());
    if (f.includes("nombre") && f.includes("dni") && f.includes("cantidad")) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);
  const cNombre = headers.findIndex(h => h.toLowerCase() === "nombre");
  const cDni = headers.findIndex(h => h.toLowerCase() === "dni");
  const cInicio = headers.findIndex(h => h.toLowerCase() === "inicio");
  const cFin = headers.findIndex(h => h.toLowerCase() === "fin");
  const cCantidad = headers.findIndex(h => h.toLowerCase() === "cantidad");
  const cNormales = headers.findIndex(h => h.toLowerCase() === "normales");
  const cAdicionales = headers.findIndex(h => h.toLowerCase() === "adicionales");
  const cCreado = headers.findIndex(h => h.toLowerCase().includes("creado por"));

  const filas = [];
  const setTrab = new Set();
  const porTrab = {};
  let totalHoras = 0, totalNormales = 0, totalAdicionales = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const nombre = norm(r[cNombre]); if (!nombre) continue;
    const dni = norm(r[cDni]);
    const inicio = parseFechaAsistencia(r[cInicio]);
    const fin = parseFechaAsistencia(r[cFin]);
    const cantidad = horasDecimal(r[cCantidad]);
    const normales = norm(r[cNormales]);
    const adicionales = norm(r[cAdicionales]);
    const creadoPor = norm(r[cCreado]);

    totalHoras += cantidad;
    if (normales.includes("25")) totalNormales++;
    if (adicionales.includes("35")) totalAdicionales++;
    setTrab.add(dni || nombre);

    const key = dni || nombre;
    if (!porTrab[key]) porTrab[key] = { nombre, dni, horas: 0, movimientos: 0 };
    porTrab[key].horas += cantidad;
    porTrab[key].movimientos++;

    filas.push({ nombre, dni, inicio, fin, cantidad, normales, adicionales, creadoPor });
  }

  return {
    tipo: "HORAS_EXTRA",
    kpis: { totalRegistros: filas.length, totalTrabajadores: setTrab.size, totalHoras, totalNormales, totalAdicionales },
    porTrabajador: Object.values(porTrab).sort((a, b) => b.horas - a.horas),
    filas,
  };
}

/* ---------- FACTURACIÓN: PEDIDO ---------- */
function procesarFactPedido(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map(c => (c || "").toString().trim().toLowerCase());
    if (f.includes("nº de pedido") || f.includes("n° de pedido")) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);

  const cPedido = headers.findIndex(h => h.toLowerCase().includes("pedido") && h.toLowerCase().includes("n"));
  const cFechaPedido = headers.findIndex(h => h.toLowerCase().includes("fecha cr. pedido"));
  const cZona = headers.findIndex(h => h.toLowerCase().includes("denomin.zona"));
  const cValBruto = headers.findIndex(h => h.toLowerCase().includes("valor bruto pedido"));
  const cImpPedido = headers.findIndex(h => h.toLowerCase().includes("impuesto pedido"));
  const cValNetoPed = headers.findIndex(h => h.toLowerCase().includes("valor neto pedido"));
  const cValBrutoFact = headers.findIndex(h => h.toLowerCase().includes("valor bruto fact"));
  const cImpFact = headers.findIndex(h => h.toLowerCase().includes("impuesto factura"));
  const cValNetoFact = headers.findIndex(h => h.toLowerCase().includes("valor neto factura"));
  const cCantPedido = headers.findIndex(h => h.toLowerCase().includes("cantidad de pedido"));
  const cCantPend = headers.findIndex(h => h.toLowerCase().includes("cantidad pendiente"));
  const cCantConf = headers.findIndex(h => h.toLowerCase().includes("cantidad-acum-confir"));
  const cCantEntrega = headers.findIndex(h => h.toLowerCase().includes("cantidad entrega"));
  const cPagador = headers.findIndex(h => h.toLowerCase() === "pagador");
  const cNombrePag = headers.findIndex(h => h.toLowerCase().includes("nombre pagador"));
  const cPoblacion = headers.findIndex(h => h.toLowerCase() === "población");

  const filas = [];
  const setPedidos = new Set();
  let totValNetoPed = 0, totValNetoFact = 0, totValBrutoPed = 0, totValBrutoFact = 0;
  let totCantPed = 0, totCantConf = 0, totCantPend = 0, totCantEnt = 0;
  const porZona = {};

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const pedido = norm(r[cPedido]); if (!pedido) continue;

    const fecha = fechaOrdenable(r[cFechaPedido]);
    const fechaEt = formatearFecha(r[cFechaPedido]);
    const zona = norm(r[cZona]) || "Sin zona";
    const valNetoPed = num(r[cValNetoPed]);
    const valNetoFact = num(r[cValNetoFact]);
    const valBrutoPed = num(r[cValBruto]);
    const valBrutoFact = num(r[cValBrutoFact]);
    const impPedido = num(r[cImpPedido]);
    const impFact = num(r[cImpFact]);
    const cantPed = num(r[cCantPedido]);
    const cantConf = num(r[cCantConf]);
    const cantPend = num(r[cCantPend]);
    const cantEnt = num(r[cCantEntrega]);
    const pagador = norm(r[cPagador]);
    const nombrePag = norm(r[cNombrePag]);
    const poblacion = norm(r[cPoblacion]);

    totValNetoPed += valNetoPed;
    totValNetoFact += valNetoFact;
    totValBrutoPed += valBrutoPed;
    totValBrutoFact += valBrutoFact;
    totCantPed += cantPed;
    totCantConf += cantConf;
    totCantPend += cantPend;
    totCantEnt += cantEnt;
    setPedidos.add(pedido);

    if (!porZona[zona]) porZona[zona] = { zona, valNetoFact: 0, valNetoPed: 0, pedidos: 0 };
    porZona[zona].valNetoFact += valNetoFact;
    porZona[zona].valNetoPed += valNetoPed;
    porZona[zona].pedidos++;

    filas.push({
      pedido, fecha, fechaEt, zona,
      valNetoPed, valNetoFact, valBrutoPed, valBrutoFact, impPedido, impFact,
      cantPed, cantConf, cantPend, cantEnt,
      pagador, nombrePag, poblacion,
    });
  }

  return {
    tipo: "FACT_PEDIDO",
    kpis: {
      totalPedidos: setPedidos.size,
      totalRegistros: filas.length,
            totValNetoPed, totValNetoFact, totValBrutoPed, totValBrutoFact,
      totCantPed, totCantConf, totCantPend, totCantEnt,
    },
    porZona: Object.values(porZona).sort((a, b) => b.valNetoFact - a.valNetoFact),
    filas,
  };
}

/* ---------- FACTURACIÓN: PLU ---------- */
function procesarFactPLU(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map(c => (c || "").toString().trim().toLowerCase());
    if (f.includes("jerarquía del producto") || f.includes("jerarquia del producto")) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);

  const cFecha = headers.findIndex(h => h.toLowerCase().includes("fecha cr. pedido"));
  const cJerarquia = headers.findIndex(h => h.toLowerCase().includes("jerarquía") || h.toLowerCase().includes("jerarquia"));
  const cPedido = headers.findIndex(h => h.toLowerCase().includes("nº de pedido") || h.toLowerCase().includes("n° de pedido"));
  const cValNeto = headers.findIndex(h => h.toLowerCase().includes("valor neto pedido"));
  const cCantPed = headers.findIndex(h => h.toLowerCase().includes("cantidad de pedido"));
  const cCantConf = headers.findIndex(h => h.toLowerCase().includes("cantidad-acum-confir"));
  const cCantPend = headers.findIndex(h => h.toLowerCase().includes("cantidad pendiente"));
  const cCantEnt = headers.findIndex(h => h.toLowerCase().includes("cantidad entrega"));

  const filas = [];
  const porJerarquia = {};
  let totValNeto = 0, totCantPed = 0, totCantEnt = 0, totCantConf = 0, totCantPend = 0;
  const setPedidos = new Set();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const jerarquia = norm(r[cJerarquia]) || "Sin jerarquía";
    const pedido = norm(r[cPedido]);
    if (!pedido) continue;

    const fecha = fechaOrdenable(r[cFecha]);
    const fechaEt = formatearFecha(r[cFecha]);
    const valNeto = num(r[cValNeto]);
    const cantPed = num(r[cCantPed]);
    const cantConf = num(r[cCantConf]);
    const cantPend = num(r[cCantPend]);
    const cantEnt = num(r[cCantEnt]);

    totValNeto += valNeto;
    totCantPed += cantPed;
    totCantEnt += cantEnt;
    totCantConf += cantConf;
    totCantPend += cantPend;
    setPedidos.add(pedido);

    if (!porJerarquia[jerarquia]) porJerarquia[jerarquia] = { nombre: jerarquia, valNeto: 0, cantPed: 0, cantEnt: 0, registros: 0 };
    porJerarquia[jerarquia].valNeto += valNeto;
    porJerarquia[jerarquia].cantPed += cantPed;
    porJerarquia[jerarquia].cantEnt += cantEnt;
    porJerarquia[jerarquia].registros++;

    filas.push({ jerarquia, pedido, fecha, fechaEt, valNeto, cantPed, cantConf, cantPend, cantEnt });
  }

  return {
    tipo: "FACT_PLU",
    kpis: {
      totalRegistros: filas.length,
      totalPedidos: setPedidos.size,
            totValNeto, totCantPed, totCantEnt, totCantConf, totCantPend,
    },
    porJerarquia: Object.values(porJerarquia).sort((a, b) => b.valNeto - a.valNeto),
    filas,
  };
}

/* ---------- RECEPCIÓN: PACKING ---------- */
function procesarRecepPacking(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map(c => (c || "").toString().trim().toLowerCase());
    if (f.includes("plu") && f.includes("material")) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim().replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').replace(/<br>/gi, '') || `Columna_${i + 1}`);

  const cPLU = headers.findIndex(h => h.toLowerCase().trim() === "plu");
  const cMaterial = headers.findIndex(h => h.toLowerCase().trim() === "material");
  const cDesc = headers.findIndex(h => h.toLowerCase().includes("descripci"));
  const cCant = headers.findIndex(h => h.toLowerCase().includes("cant"));
  const cCaja = headers.findIndex(h => h.toLowerCase().includes("numero de caja") || h.toLowerCase().includes("número de caja"));
  const cCampana = headers.findIndex(h => h.toLowerCase().includes("campa"));
  const cFecha = headers.findIndex(h => h.toLowerCase().includes("fecha de recepcion") || h.toLowerCase().includes("fecha de recepción"));
  const cSemana = headers.findIndex(h => h.toLowerCase().trim() === "semana");
  const cMes = headers.findIndex(h => h.toLowerCase().trim() === "mes");
  const cImportaciones = headers.findIndex(h => h.toLowerCase().includes("importaciones"));

  let totalRegistros = 0;
  const setCajas = new Set();
  let totCant = 0, totImportaciones = 0;
  const porMes = {}, porCampana = {}, porDesc = {};

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const mat = norm(r[cMaterial]);
    if (!mat) continue;

    const cant = num(r[cCant]);
    const caja = norm(r[cCaja]);
    const campana = norm(r[cCampana]) || "Sin campaña";
    const mes = norm(r[cMes]) || "Sin mes";
    const desc = norm(r[cDesc]) || "Sin descripción";
    const imp = num(r[cImportaciones]);
    const fecha = fechaOrdenable(r[cFecha]);

    totalRegistros++;
    totCant += cant;
    totImportaciones += imp;
    if (caja) setCajas.add(caja);

    if (!porMes[mes]) porMes[mes] = { mes, cant: 0, registros: 0 };
    porMes[mes].cant += cant;
    porMes[mes].registros++;

    if (!porCampana[campana]) porCampana[campana] = { campana, cant: 0, registros: 0 };
    porCampana[campana].cant += cant;
    porCampana[campana].registros++;

    if (!porDesc[desc]) porDesc[desc] = { desc, cant: 0, importaciones: 0, fechas: {} };
    porDesc[desc].cant += cant;
    porDesc[desc].importaciones += imp;
    if (fecha) porDesc[desc].fechas[fecha] = true;
  }

  return {
    tipo: "RECEP_PACKING",
    kpis: {
      totalRegistros,
      totalCantidad: totCant,
      totalCajas: setCajas.size,
      totalImportaciones: totImportaciones,
    },
    porMes: Object.values(porMes).sort((a, b) => b.cant - a.cant),
    porCampana: Object.values(porCampana).sort((a, b) => b.cant - a.cant),
    porDescripcion: Object.values(porDesc)
      .map(d => ({ desc: d.desc, cant: d.cant, importaciones: d.importaciones, fechas: Object.keys(d.fechas) }))
      .sort((a, b) => b.cant - a.cant),
  };
}

/* ---------- RECEPCIÓN: DETALLE POR PLU ---------- */
function procesarRecepDetalle(rows) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const f = rows[i].map(c => (c || "").toString().trim().toLowerCase());
    if (f.includes("fecha") && f.includes("material") && f.includes("plu")) { headerIndex = i; break; }
  }
  const headers = rows[headerIndex].map((h, i) => (h || "").toString().trim() || `Columna_${i + 1}`);

  const cFecha = headers.findIndex(h => h.toLowerCase().trim() === "fecha");
  const cMaterial = headers.findIndex(h => h.toLowerCase().trim() === "material");
  const cPLU = headers.findIndex(h => h.toLowerCase().trim() === "plu");
  const cTalla = headers.findIndex(h => h.toLowerCase().trim() === "talla");
  const cCant = headers.findIndex(h => h.toLowerCase().trim() === "cantidad");
  const cProveedor = headers.findIndex(h => h.toLowerCase() === "proveedor");
  const cIngresado = headers.findIndex(h => h.toLowerCase() === "ingresado");
  const cPendiente = headers.findIndex(h => h.toLowerCase().includes("pendiente ingresar"));
  const cEstado = headers.findIndex(h => h.toLowerCase() === "estado");
  const cMes = headers.findIndex(h => h.toLowerCase().trim() === "mes");

  const setProv = new Set();
  let totIngresado = 0, totPendiente = 0, totCantidad = 0, totalRegistros = 0;
  const porMes = {}, porDetalle = {};

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const mat = norm(r[cMaterial]);
    if (!mat) continue;

    const cant = num(r[cCant]);
    const ing = num(r[cIngresado]);
    const pend = num(r[cPendiente]);
    const mes = norm(r[cMes]) || "Sin mes";
    const estado = norm(r[cEstado]);
    const prov = norm(r[cProveedor]);
    const plu = norm(r[cPLU]);
    const talla = norm(r[cTalla]);
    const fecha = fechaOrdenable(r[cFecha]);

    totalRegistros++;
    totCantidad += cant;
    totIngresado += ing;
    totPendiente += pend;
    if (prov) setProv.add(prov);

    if (!porMes[mes]) porMes[mes] = { mes, ingresado: 0, pendiente: 0, total: 0 };
    porMes[mes].ingresado += ing;
    porMes[mes].pendiente += pend;
    porMes[mes].total += cant;

    const key = `${mat}|${plu}|${talla}|${prov}|${estado}`;
    if (!porDetalle[key]) porDetalle[key] = { material: mat, plu, talla, proveedor: prov, estado, cantidad: 0, ingresado: 0, pendiente: 0, fechas: {} };
    porDetalle[key].cantidad += cant;
    porDetalle[key].ingresado += ing;
    porDetalle[key].pendiente += pend;
    if (fecha) porDetalle[key].fechas[fecha] = true;
  }

  return {
    tipo: "RECEP_DETALLE",
    kpis: {
      totalRegistros,
      totCantidad,
      totIngresado,
      totPendiente,
      totalProveedores: setProv.size,
      pctIngreso: totCantidad ? (totIngresado / totCantidad) * 100 : 0,
    },
    porMes: Object.values(porMes).sort((a, b) => b.total - a.total),
    porDetalle: Object.values(porDetalle)
      .map(d => ({ ...d, fechas: Object.keys(d.fechas) }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}