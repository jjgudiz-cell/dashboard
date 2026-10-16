/* ==========================================================
   Index — Sube Excel de Almacén (uno a la vez)
   Detecta el tipo por el nombre de la hoja: MB52, LT22, ZLX12, ZWM
   ========================================================== */

const SUPABASE_URL = "https://mtsewbdhgkfzwwnewfhy.supabase.co/";
const SUPABASE_KEY = "sb_publishable_UwAMub1-i76B7uwPIQACiA_hYnAfhhB";
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

const BATCH_SIZE = 1000;

let resultadoPendiente = null;

function setProgreso(pct, label) {
  progressBox.style.display = 'block';
  progressBar.style.width = pct + '%';
  progressPct.textContent = Math.round(pct) + '%';
  if (label) progressLabel.textContent = label;
}
function ocultarProgreso() {
  setTimeout(() => { progressBox.style.display = 'none'; }, 1500);
}

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

/* ---------- Subida por lotes ---------- */
async function subirPorLotes(sheetName, filas) {
  const total = filas.length;
  const lotes = Math.ceil(total / BATCH_SIZE);

  // 1) Borrar lo anterior
  setProgreso(5, `Borrando datos anteriores de ${sheetName}…`);
  await supabaseClient.from('dashboard_data').delete().eq('sheet_name', sheetName);

  // 2) Insertar por lotes
  for (let i = 0; i < lotes; i++) {
    const desde = i * BATCH_SIZE;
    const hasta = Math.min(desde + BATCH_SIZE, total);
    const chunk = filas.slice(desde, hasta);
    const registros = chunk.map((fila, j) => ({
      sheet_name: sheetName,
      row_index: desde + j,
      data: fila,
    }));

    const pct = 10 + Math.round(((i + 1) / lotes) * 85);
    setProgreso(pct, `Insertando lote ${i + 1}/${lotes} (${hasta}/${total} filas)…`);

    const { error } = await supabaseClient.from('dashboard_data').insert(registros);
    if (error) throw new Error(`Lote ${i + 1}: ${error.message}`);
  }

  return total;
}

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

    let hojaTipo = null;
    for (const nombre of workbook.SheetNames) {
      if (HOJAS_VALIDAS[nombre.trim()]) { hojaTipo = nombre.trim(); break; }
    }

    if (!hojaTipo) {
      setProgreso(100, 'Error');
      mostrarMensaje('La hoja no coincide con ninguna conocida.', 'error');
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

    // Si el worker devuelve un array de filas, lo usamos directo para lotes.
    // Si devuelve un objeto con .filas, usamos eso.
    const filasParaSubir = Array.isArray(agregado)
      ? agregado
      : (agregado.filas && Array.isArray(agregado.filas) ? agregado.filas : [agregado]);

    resultadoPendiente = {
      sheetName: HOJAS_VALIDAS[hojaTipo],
      tipo: hojaTipo,
      filas: filasParaSubir,
      payload: agregado,
    };

    const li = document.createElement('li');
    li.innerHTML = `<i class="fas fa-check-circle"></i> ${hojaTipo} listo · ${rows.length} filas procesadas · ${filasParaSubir.length} registros a subir`;
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

btnSubir.addEventListener('click', async function () {
  if (!resultadoPendiente) {
    mostrarMensaje('Primero selecciona un archivo Excel válido.', 'error');
    return;
  }

  btnSubir.disabled = true;
  btnSubir.textContent = 'Subiendo…';
  setProgreso(0, `Subiendo ${resultadoPendiente.sheetName}…`);

  try {
    const { sheetName, tipo, filas } = resultadoPendiente;
    const total = await subirPorLotes(sheetName, filas);

    setProgreso(100, `${tipo} subido correctamente`);
    mostrarMensaje(`✅ ${tipo} subido (${total} filas en lotes de ${BATCH_SIZE}).`, 'ok');
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