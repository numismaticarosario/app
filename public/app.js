// app.js — lógica del frontend del Publicador MLA → MLC

// Estado en memoria: las filas acumuladas para el Excel.
let rows = [];

const MAX_PHOTOS = 10;

// Valores fijos que SÍ van al Excel (columnas del template de MLC).
const FIXED_FIELDS = [
  { key: "stock", label: "Stock", value: "1" },
  { key: "moneda", label: "Moneda", value: "$" },
  { key: "ancho", label: "Ancho (cm)", value: "10" },
  { key: "alto", label: "Alto (cm)", value: "14" },
  { key: "profundidad", label: "Profundidad (cm)", value: "1" },
  { key: "peso", label: "Peso (kg)", value: "0.10" },
  { key: "tipoPublicacion", label: "Tipo de publicación", value: "Clásica" },
  { key: "formaEnvio", label: "Forma de envío", value: "Mercado Envíos" },
  { key: "costoEnvio", label: "Costo de envío", value: "A cargo del comprador" },
  { key: "retiroPersona", label: "Retiro en persona", value: "No acepto" },
  { key: "tipoGarantia", label: "Tipo de garantía", value: "Garantía del vendedor" },
  {
    key: "tiempoGarantia",
    label: "Tiempo de garantía",
    dual: true,
    valueNumero: "7",
    valueUnidad: "días",
  },
  { key: "marca", label: "Marca", value: "—" },
];

// Valores fijos de USO INTERNO — no se exportan al Excel. Alimentan la
// fórmula de "Calcular Valor" (precio de venta en CLP).
const INTERNAL_FIELDS = [
  { key: "tasaCambio", label: "Rate CLP - USD", value: "950" },
  { key: "comisionML", label: "Comisión ML (%)", value: "14" },
  { key: "costoFijoVenta", label: "Costo fijo por venta (CLP)", value: "750" },
  { key: "iva", label: "IVA (%)", value: "15" },
  { key: "envioGratisDesde", label: "Umbral Envío Gratis", value: "15000" },
];

// --- Referencias a elementos del DOM ---
const el = (id) => document.getElementById(id);
const lookupInput = el("lookupInput");
const btnFetch = el("btnFetch");
const btnClean = el("btnClean");
const btnAddRow = el("btnAddRow");
const btnExcel = el("btnExcel");
const statusMsg = el("statusMsg");
const fixedGrid = el("fixedGrid");
const internalGrid = el("internalGrid");
const unlockFixed = el("unlockFixed");
const photoRow = el("photoRow");
const btnAplicarFijo = el("btnAplicarFijo");
const btnAplicarMult = el("btnAplicarMult");

let lastItemData = null; // guarda el JSON crudo del último ítem traído

// --- Render de una grilla de celdas fijas (simples o duales) ---
function renderFixedCells(container, fields) {
  container.innerHTML = "";
  fields.forEach((f) => {
    const cell = document.createElement("div");
    cell.className = "fixed-cell";

    if (f.dual) {
      cell.innerHTML = `
        <span class="k">${f.label}</span>
        <div class="dual-inputs">
          <input value="${f.valueNumero}" data-key="${f.key}Numero" disabled>
          <input value="${f.valueUnidad}" data-key="${f.key}Unidad" disabled>
        </div>
      `;
    } else {
      cell.innerHTML = `
        <span class="k">${f.label}</span>
        <input value="${f.value}" data-key="${f.key}" disabled>
      `;
    }
    container.appendChild(cell);
  });
}

renderFixedCells(fixedGrid, FIXED_FIELDS);
renderFixedCells(internalGrid, INTERNAL_FIELDS);

// --- Checkbox maestro: desbloquea/bloquea ambos bloques (fijo + interno) ---
unlockFixed.addEventListener("change", () => {
  [fixedGrid, internalGrid].forEach((grid) => {
    grid.classList.toggle("editing", unlockFixed.checked);
    grid.querySelectorAll("input").forEach((input) => {
      input.disabled = !unlockFixed.checked;
    });
    grid.querySelectorAll(".fixed-cell").forEach((cell) => {
      cell.classList.toggle("editing", unlockFixed.checked);
    });
  });
});

// --- Leer un valor numérico de los fijos/internos por su data-key ---
function getInternalValue(key) {
  const input = internalGrid.querySelector(`input[data-key="${key}"]`);
  return input ? parseFloat(input.value) : NaN;
}

// --- Render de los 10 espacios de fotos: activos (con foto real) o inactivos ---
function renderPhotos(photoUrls) {
  const urls = photoUrls || [];
  photoRow.innerHTML = "";
  for (let i = 0; i < MAX_PHOTOS; i++) {
    const thumb = document.createElement("div");
    if (urls[i]) {
      thumb.className = "coin-thumb";
      thumb.style.backgroundImage = `url("${urls[i]}")`;
    } else {
      thumb.className = "coin-thumb inactive";
      thumb.textContent = "—";
    }
    photoRow.appendChild(thumb);
  }
}
renderPhotos([]); // estado inicial: los 10 espacios inactivos

// --- Mensajes de estado (error / éxito) ---
function showStatus(message, type) {
  statusMsg.innerHTML = message
    ? `<div class="status-msg ${type}">${message}</div>`
    : "";
}

// --- Extraer el ID de MLA desde texto libre (ID, código, o URL) ---
function extractItemId(raw) {
  const text = raw.trim();
  const direct = text.match(/MLA-?\d+/i);
  if (direct) return direct[0].replace("-", "").toUpperCase();
  if (/^\d+$/.test(text)) return `MLA${text}`;
  return null;
}

// --- Poblar el formulario con los datos traídos del backend ---
function populateForm(data) {
  el("f-titulo").value = data.title || "";
  el("f-pais").value = data.country || "";
  el("f-anio").value = data.year || "";
  el("f-metal").value = data.metal || "";
  el("f-tipo").value = data.coinType || "";
  el("f-valor").value = data.coinValue || "";
  el("f-cond").value = data.condition === "new" ? "Nuevo" : "Usado";
  el("f-desc").value = data.description || "";

  ["f-titulo", "f-pais", "f-anio", "f-metal", "f-tipo", "f-valor", "f-cond", "f-desc"]
    .forEach((id) => (el(id).disabled = false));

  // El precio de MLA (ARS) ya NO se muestra: genera confusión, porque el precio
  // que importa acá es el de venta en MLC (CLP), calculado con el panel de abajo.
  el("f-precio").value = "";
  el("f-precio").disabled = true;

  el("f-costo").value = "";
  el("f-conm").value = data.commemorative ? "Sí" : "";

  renderPhotos(data.photos || []);

  btnAddRow.disabled = false;
}

// --- Limpiar el formulario de la publicación actual (no borra filas ya generadas) ---
function cleanForm() {
  ["f-titulo", "f-pais", "f-anio", "f-metal", "f-tipo", "f-valor", "f-cond", "f-desc"]
    .forEach((id) => {
      el(id).value = "";
      el(id).disabled = true;
    });
  el("f-precio").value = "";
  el("f-precio").disabled = true;
  el("f-costo").value = "";
  el("f-conm").value = "";
  renderPhotos([]);
  lookupInput.value = "";
  lastItemData = null;
  btnAddRow.disabled = true;
  showStatus("", "");
}

// --- Botón "Obtener datos" ---
btnFetch.addEventListener("click", async () => {
  const itemId = extractItemId(lookupInput.value);
  if (!itemId) {
    showStatus("No pude reconocer el ID. Probá con MLA1470133733, el número solo, o la URL completa.", "error");
    return;
  }

  btnFetch.disabled = true;
  showStatus("Buscando publicación…", "ok");

  try {
    const res = await fetch(`/api/items/${itemId}`);
    const data = await res.json();

    if (!res.ok) {
      if (data.error === "NOT_OWNER") {
        showStatus("Esta publicación no pertenece a tu cuenta de Mercado Libre.", "error");
      } else if (data.error === "NOT_AUTHENTICATED") {
        showStatus("Todavía no iniciaste sesión con Mercado Libre. Andá a /auth/login.", "error");
      } else {
        showStatus(data.message || "No se pudo traer la publicación.", "error");
      }
      return;
    }

    lastItemData = data;
    populateForm(data);
    showStatus(`Datos cargados: ${data.title}`, "ok");
  } catch (err) {
    showStatus("Error de conexión con el backend. Probá de nuevo.", "error");
  } finally {
    btnFetch.disabled = false;
  }
});

// --- Botón "Clean" ---
btnClean.addEventListener("click", cleanForm);

// --- Cálculo del precio de venta (CLP) ---
//
// neto (USD):
//   modo "fijo"          -> costo + valorFijo
//   modo "multiplicador" -> costo × valor
//
// base_clp        = neto × Rate CLP-USD
// protegido_ML     = base_clp ÷ (1 - comisionML/100)
// + costo fijo por venta (CLP)
// precio_final     = anterior ÷ (1 - iva/100)
function calcularPrecioVenta(modo) {
  const costo = parseFloat(el("f-costo").value);
  if (isNaN(costo) || costo <= 0) {
    showStatus("Ingresá primero un Costo U$D válido antes de calcular.", "error");
    return;
  }

  const rateCLP = getInternalValue("tasaCambio");
  const comisionML = getInternalValue("comisionML");
  const costoFijoVenta = getInternalValue("costoFijoVenta");
  const iva = getInternalValue("iva");

  if ([rateCLP, comisionML, costoFijoVenta, iva].some((v) => isNaN(v))) {
    showStatus("Revisá los valores fijos internos (Rate, Comisión ML, Costo fijo, IVA).", "error");
    return;
  }

  let neto;
  if (modo === "fijo") {
    const fijo = parseFloat(el("calcFijo").value);
    if (isNaN(fijo)) {
      showStatus("Ingresá un valor válido en el campo Fijo (U$D).", "error");
      return;
    }
    neto = costo + fijo;
  } else {
    const mult = parseFloat(el("calcMultiplicador").value);
    if (isNaN(mult)) {
      showStatus("Ingresá un multiplicador válido.", "error");
      return;
    }
    neto = costo * mult;
  }

  const baseClp = neto * rateCLP;
  const protegidoML = baseClp / (1 - comisionML / 100);
  const conCostoFijo = protegidoML + costoFijoVenta;
  const precioFinal = conCostoFijo / (1 - iva / 100);

  const precioInput = el("f-precio");
  precioInput.value = Math.round(precioFinal).toLocaleString("es-CL");
  precioInput.dataset.raw = Math.round(precioFinal); // valor numérico puro, sin formato, para el Excel
  precioInput.disabled = false;

  showStatus(`Precio de venta calculado: $${precioInput.value} CLP`, "ok");
}

btnAplicarFijo.addEventListener("click", () => calcularPrecioVenta("fijo"));
btnAplicarMult.addEventListener("click", () => calcularPrecioVenta("multiplicador"));

// --- Botón "Nueva Fila" ---
btnAddRow.addEventListener("click", () => {
  if (!lastItemData) return;

  if (!el("f-precio").value) {
    showStatus("Calculá el precio de venta (panel Calcular Valor) antes de generar la fila.", "error");
    return;
  }

  const fixedValues = {};
  fixedGrid.querySelectorAll("input").forEach((input) => {
    fixedValues[input.dataset.key] = input.value;
  });

  const internalValues = {};
  internalGrid.querySelectorAll("input").forEach((input) => {
    internalValues[input.dataset.key] = input.value;
  });

  const row = {
    id: lastItemData.id,
    titulo: el("f-titulo").value,
    pais: el("f-pais").value,
    anio: el("f-anio").value,
    metal: el("f-metal").value,
    tipoMoneda: el("f-tipo").value,
    valorMoneda: el("f-valor").value,
    precioClp: el("f-precio").value,
    precioClpRaw: parseFloat(el("f-precio").dataset.raw) || 0,
    condicion: el("f-cond").value,
    descripcion: el("f-desc").value,
    costoUsd: el("f-costo").value,
    conmemorativa: el("f-conm").value,
    fotos: lastItemData.photos || [],
    fixed: fixedValues,
    internal: internalValues,
  };

  rows.push(row);
  updateCounters();
  showStatus(`Fila agregada (${rows.length} en total). Podés cargar la siguiente moneda.`, "ok");
  cleanForm();
});

// --- Contador de filas (en el botón de Excel) ---
function updateCounters() {
  el("excelCount").textContent = rows.length;
  btnExcel.disabled = rows.length === 0;
}

// --- Botón "Excel": pide al backend el .xlsx real y lo descarga ---
btnExcel.addEventListener("click", async () => {
  if (rows.length === 0) return;

  btnExcel.disabled = true;
  showStatus("Generando el Excel…", "ok");

  try {
    const res = await fetch("/api/generate-excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showStatus(data.message || "No se pudo generar el Excel.", "error");
      return;
    }

    // Descarga el archivo que devuelve el backend
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "publicar_monedas_chile.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showStatus(`Excel descargado con ${rows.length} fila(s).`, "ok");
  } catch (err) {
    showStatus("Error de conexión al generar el Excel. Probá de nuevo.", "error");
  } finally {
    btnExcel.disabled = rows.length === 0;
  }
});
