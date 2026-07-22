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

// Valores fijos de USO INTERNO — no se exportan al Excel, son para calcular
// (por ahora manuales; a futuro pueden alimentar la regla de precio final).
const INTERNAL_FIELDS = [
  { key: "tasaCambio", label: "Rate CLP - USD", value: "950" },
  { key: "costoFijoVenta", label: "Costo fijo por venta", value: "0.00" },
  { key: "envioGratisDesde", label: "Umbral Envío Gratis", value: "0.00" },
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
  el("f-precio").value = data.priceArs ?? "";
  el("f-cond").value = data.condition === "new" ? "Nuevo" : "Usado";
  el("f-desc").value = data.description || "";

  ["f-titulo", "f-pais", "f-anio", "f-metal", "f-tipo", "f-valor", "f-precio", "f-cond", "f-desc"]
    .forEach((id) => (el(id).disabled = false));

  el("f-costo").value = "";
  el("f-conm").value = data.commemorative ? "Sí" : "";

  renderPhotos(data.photos || []);

  btnAddRow.disabled = false;
}

// --- Limpiar el formulario de la publicación actual (no borra filas ya generadas) ---
function cleanForm() {
  ["f-titulo", "f-pais", "f-anio", "f-metal", "f-tipo", "f-valor", "f-precio", "f-cond", "f-desc"]
    .forEach((id) => {
      el(id).value = "";
      el(id).disabled = true;
    });
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

// --- Botón "Nueva Fila" ---
btnAddRow.addEventListener("click", () => {
  if (!lastItemData) return;

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
    precioArs: el("f-precio").value,
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

// --- Botón "Excel" (se conecta en un próximo paso) ---
btnExcel.addEventListener("click", () => {
  alert("Generación de Excel: la conectamos en el próximo paso.");
});
