/* ==========================================================
   Index — Sube Excel de Almacén (uno a la vez)
   Detecta el tipo por el nombre de la hoja: MB52, LT22, ZLX12, ZWM
   ========================================================== */

const SUPABASE_URL = "https://qkkwvacltcmpgmtrvpjf.supabase.co";
const SUPABASE_KEY = "sb_publishable_UZnT5Fj2Hp8qLOyrWf4Ilw_1QcW_O5U";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const fileInput = document.getElementById('excelFile');
const sheetStatus = document.getElementById('sheetStatus');
const sheetList = document.getElementById('sheetList');
const btnSubir = document.getElementById('btnSubir');
const mensaje = document.getElementById('mensaje');
const progressBox = document.getElementById('progressBox');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const progressPct = document.getElementById('progressPct');
const tipoDetected = document.getElementById('tipoDetected');
const tipoNombre = document.getElementById('tipoNombre');

const HOJAS_VALIDAS = {
  "MB52": "ALM_MB52",
  "LT22": "ALM_LT22",
  "ZLX12": "ALM_ZLX12",
  "ZWM": "ALM_ZWM",
  "ASISTENCIA": "ASIS_ASISTENCIA",
  "HORAS_EXTRA": "ASIS_HORAS_EXTRA",
  "PEDIDO": "FACT_PEDIDO",
  "PLU": "FACT_PLU",
  "PACKING_2026": "RECEP_PACKING",
  "DETALLE_POR_PLU": "RECEP_DETALLE",
};

let resultadoPendiente = null;  // { sheetName, tipo, payload }

/* ---------- Progreso ---------- */
function setProgreso(pct, label) {
  progressBox.style.display = 'block';
  progressBar.style.width = pct + '%';
  progressPct.textContent = Math.round(pct) + '%';
  if (label) progressLabel.textContent = label;
}
function ocultarProgreso() {
  setTimeout(() => { progressBox.style.display = 'none'; }, 1500);
}

/* ---------- Worker ---------- */
function procesarEnWorker(tipo, rows) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('js/worker.js');
    worker.onmessage = (e) => {
      const data = e.data;
      worker.terminate();
      if (data.ok) resolve(data.resultado);
      else reject(new Error(data.error || 'Error en worker'));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error('Error del worker: ' + err.message));
    };
    worker.postMessage({ tipo, rows });
  });
}

/* ---------- Lectura del Excel ---------- */
fileInput.addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  resultadoPendiente = null;
  sheetList.innerHTML = '';
  sheetStatus.style.display = 'none';
  tipoDetected.style.display = 'none';
  mensaje.className = 'mensaje';
  mensaje.textContent = '';

  try {
    setProgreso(5, 'Leyendo archivo…');
    const data = new Uint8Array(await file.arrayBuffer());

    setProgreso(15, 'Abriendo Excel…');
    const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellNF: false, cellStyles: false });

    // Buscar la primera hoja cuyo nombre esté en HOJAS_VALIDAS
    let hojaTipo = null;
    for (const nombre of workbook.SheetNames) {
      if (HOJAS_VALIDAS[nombre.trim()]) { hojaTipo = nombre.trim(); break; }
    }

    if (!hojaTipo) {
      setProgreso(100, 'Error');
      mostrarMensaje('La hoja no coincide con ninguna conocida (MB52, LT22, ZLX12, ZWM, ASISTENCIA, HORAS_EXTRA).', 'error');
      ocultarProgreso();
      return;
    }

    tipoNombre.textContent = hojaTipo;
    tipoDetected.style.display = 'flex';

    setProgreso(30, `Leyendo ${hojaTipo}…`);
    const worksheet = workbook.Sheets[hojaTipo];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

    setProgreso(55, `Procesando ${hojaTipo} (${rows.length} filas)…`);
    const agregado = await procesarEnWorker(hojaTipo, rows);

    resultadoPendiente = {
      sheetName: HOJAS_VALIDAS[hojaTipo],
      tipo: hojaTipo,
      payload: agregado,
    };

    const li = document.createElement('li');
    li.innerHTML = `<i class="fas fa-check-circle"></i> ${hojaTipo} listo · ${rows.length} filas procesadas`;
    sheetList.appendChild(li);

    setProgreso(100, `${hojaTipo} procesado`);
    sheetStatus.style.display = 'block';
    mostrarMensaje(`Listo para subir ${hojaTipo}.`, 'ok');
    ocultarProgreso();
  } catch (err) {
    console.error(err);
    setProgreso(100, 'Error');
    mostrarMensaje('❌ Error: ' + err.message, 'error');
    ocultarProgreso();
  }
});

/* ---------- Subir a Supabase ---------- */
btnSubir.addEventListener('click', async function () {
  if (!resultadoPendiente) {
    mostrarMensaje('Primero selecciona un archivo Excel válido.', 'error');
    return;
  }

  btnSubir.disabled = true;
  btnSubir.textContent = 'Subiendo…';
  setProgreso(0, `Subiendo ${resultadoPendiente.sheetName}…`);

  try {
    const { sheetName, tipo, payload } = resultadoPendiente;

    setProgreso(30, `Borrando datos anteriores de ${sheetName}…`);
    await supabaseClient.from('dashboard_data').delete().eq('sheet_name', sheetName);

    setProgreso(70, `Insertando ${sheetName}…`);
    const registro = { sheet_name: sheetName, row_index: 0, data: payload };
    const { error } = await supabaseClient.from('dashboard_data').insert([registro]);
    if (error) throw error;

    setProgreso(100, `${tipo} subido correctamente`);
    mostrarMensaje(`✅ ${tipo} subido. Puedes subir el siguiente Excel.`, 'ok');
    resultadoPendiente = null;
    sheetStatus.style.display = 'none';
    fileInput.value = '';
    ocultarProgreso();
  } catch (err) {
    console.error(err);
    mostrarMensaje('❌ Error: ' + err.message, 'error');
    setProgreso(100, 'Error');
    ocultarProgreso();
  } finally {
    btnSubir.disabled = false;
    btnSubir.textContent = 'Subir a Supabase';
  }
});

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje ' + tipo;
}