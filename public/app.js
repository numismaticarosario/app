// app.js — lógica del frontend del Publicador MLA → MLC

// Estado en memoria: las filas acumuladas para el Excel, y el modo de
// sesión activo ("monedas" o "billetes"). Todas las filas de "rows"
// pertenecen siempre al mismo modo — no se mezclan en la misma cola.
let rows = [];
let currentMode = "monedas";

const MAX_PHOTOS = 10;

// Valores fijos que SÍ van al Excel (columnas del template de MLC).
const FIXED_FIELDS = [
  { key: "stock", label: "Stock", value: "1" },
  { key: "moneda", label: "Moneda", value: "$" },
  { key: "ancho", label: "Ancho (cm)", value: "10" },
  { key: "alto", label: "Alto (cm)", value: "16" },
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
  { key: "iva", label: "IVA (%)", value: "19" },
  { key: "envioGratisDesde", label: "Umbral Envío Gratis", value: "12999" },
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
const fieldGrid = el("fieldGrid");
const modeBtnMonedas = el("modeBtnMonedas");
const modeBtnBilletes = el("modeBtnBilletes");
const lblTipo = el("lbl-tipo");
const lblValor = el("lbl-valor");

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
applyFieldOrder(currentMode); // orden inicial de campos (modo Monedas)

// --- Mensajes de estado (error / éxito) ---
function showStatus(message, type) {
  statusMsg.innerHTML = message
    ? `<div class="status-msg ${type}">${message}</div>`
    : "";
}

// --- Orden de los campos según el modo (Billetes tiene un orden propio;
// Metal y Libre a definir no entran en ese orden porque están ocultos ahí) ---
function applyFieldOrder(mode) {
  const order =
    mode === "billetes"
      ? ["field-titulo", "field-tipo", "field-pais", "field-costo", "field-cond", "field-precio", "field-anio", "field-libre", "field-valor", "field-libre2", "field-metal"]
      : ["field-titulo", "field-anio", "field-pais", "field-tipo", "field-metal", "field-costo", "field-valor", "field-precio", "field-cond", "field-libre", "field-libre2"];

  order.forEach((id) => {
    const node = document.getElementById(id);
    if (node) fieldGrid.appendChild(node);
  });
}

// --- Modo de sesión: Monedas / Billetes ---
//
// Cambia qué atributos se piden a MLA (vía ?mode= en el fetch), qué
// labels se muestran para los campos reutilizados (f-tipo / f-valor),
// y qué plantilla de Excel se usa al exportar. El switch se bloquea
// solo (ver updateModeLockState) mientras haya filas sin exportar.
function setMode(mode) {
  if (mode === currentMode) return;

  currentMode = mode;
  modeBtnMonedas.classList.toggle("active", mode === "monedas");
  modeBtnBilletes.classList.toggle("active", mode === "billetes");
  fieldGrid.classList.toggle("mode-billetes", mode === "billetes");
  el("field-libre2").style.display = mode === "billetes" ? "" : "none";
  applyFieldOrder(mode);

  if (mode === "billetes") {
    lblTipo.textContent = "Nombre del diseño";
    lblValor.textContent = "Valor del billete";
  } else {
    lblTipo.textContent = "Tipo de moneda";
    lblValor.textContent = "Valor de la moneda";
  }

  cleanForm();
}

// --- Bloquea/desbloquea el switch según si hay filas sin exportar ---
function updateModeLockState() {
  const locked = rows.length > 0;
  modeBtnMonedas.disabled = locked;
  modeBtnBilletes.disabled = locked;
}

modeBtnMonedas.addEventListener("click", () => setMode("monedas"));
modeBtnBilletes.addEventListener("click", () => setMode("billetes"));

// --- Extraer el ID de MLA desde texto libre (ID, código, o URL) ---
function extractItemId(raw) {
  const text = raw.trim();
  const direct = text.match(/MLA-?\d+/i);
  if (direct) return direct[0].replace("-", "").toUpperCase();
  if (/^\d+$/.test(text)) return `MLA${text}`;
  return null;
}

// --- Decodificar el código Costo/Ganancia escrito en el SKU ---
//
// Formato: X<costo>Z<ganancia fija>   (Y queda reservado para "multiplicador",
// sin uso todavía). La letra P reemplaza al punto decimal en ambos números,
// porque el campo SKU de MLA no acepta símbolos.
//
// Ejemplos: "X1Z2P5" -> costo 1, ganancia fija 2.5
//           "X3P20Z10" -> costo 3.20, ganancia fija 10
//
// Devuelve null si el SKU no tiene este formato (publicación sin código,
// o con un SKU usado para otra cosa) — en ese caso no se toca nada.
function decodeSkuCode(sku) {
  if (!sku) return null;

  const match = sku.trim().match(/^X([0-9P]+)(Z|Y)([0-9P]+)$/i);
  if (!match) return null;

  const costo = parseFloat(match[1].replace(/P/gi, "."));
  const modo = match[2].toUpperCase() === "Z" ? "fijo" : "multiplicador";
  const valor = parseFloat(match[3].replace(/P/gi, "."));

  if (isNaN(costo) || isNaN(valor)) return null;

  return { costo, modo, valor };
}

// --- Poblar el formulario con los datos traídos del backend ---
function populateForm(data) {
  el("f-titulo").value = data.title || "";
  el("f-pais").value = data.country || "";
  el("f-anio").value = data.year || "";
  el("f-cond").value = data.condition === "new" ? "Nuevo" : "Usado";
  el("f-desc").value = data.description || "";

  // f-tipo y f-valor se reutilizan entre modos con distinto significado:
  //   Monedas  -> Tipo de moneda / Valor de la moneda
  //   Billetes -> Nombre del diseño / Valor del billete
  if (currentMode === "billetes") {
    el("f-tipo").value = data.designName || "";
    el("f-valor").value = data.billValue || "";
    el("f-metal").value = "";
  } else {
    el("f-tipo").value = data.coinType || "";
    el("f-valor").value = data.coinValue || "";
    el("f-metal").value = data.metal || "";
  }

  ["f-titulo", "f-pais", "f-anio", "f-metal", "f-tipo", "f-valor", "f-cond", "f-desc", "f-costo"]
    .forEach((id) => (el(id).disabled = false));

  // El precio de MLA (ARS) ya NO se muestra: genera confusión, porque el precio
  // que importa acá es el de venta en MLC (CLP), calculado con el panel de abajo.
  el("f-precio").value = "";
  el("f-precio").disabled = true;

  el("f-costo").value = "";

  renderPhotos(data.photos || []);

  // Si el SKU trae un código Costo/Ganancia (formato X<costo>Z<ganancia>),
  // completamos el Costo solo y disparamos el mismo cálculo que hace
  // "Aplicar" — sin tocar nada, el campo sigue siendo editable después.
  const decoded = decodeSkuCode(data.sku);
  if (decoded) {
    el("f-costo").value = decoded.costo;
    if (decoded.modo === "fijo") {
      el("calcFijo").value = decoded.valor;
    } else {
      el("calcMultiplicador").value = decoded.valor;
    }
  }

  btnAddRow.disabled = false;

  if (decoded) {
    calcularPrecioVenta(decoded.modo);
  }
}

// --- Limpiar el formulario de la publicación actual (no borra filas ya generadas) ---
function cleanForm() {
  ["f-titulo", "f-pais", "f-anio", "f-metal", "f-tipo", "f-valor", "f-cond", "f-desc", "f-costo"]
    .forEach((id) => {
      el(id).value = "";
      el(id).disabled = true;
    });
  el("f-precio").value = "";
  el("f-precio").disabled = true;
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
  showStatus("", "");

  try {
    const res = await fetch(`/api/items/${itemId}?mode=${currentMode}`);
    const data = await res.json();

    if (!res.ok) {
      if (data.error === "NOT_OWNER") {
        showStatus("Esta publicación no pertenece a tu cuenta de Mercado Libre.", "error");
      } else if (data.error === "NOT_AUTHENTICATED") {
        showStatus("Todavía no iniciaste sesión con Mercado Libre. Andá a /auth/login.", "error");
      } else {
        // Acá cae también WRONG_CATEGORY (publicación de otro tipo al modo activo),
        // el backend ya manda un mensaje claro listo para mostrar.
        showStatus(data.message || "No se pudo traer la publicación.", "error");
      }
      return;
    }

    lastItemData = data;
    populateForm(data);
    showStatus("", "");
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

  showStatus("", "");
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

  const baseRow = {
    id: lastItemData.id,
    modo: currentMode,
    titulo: el("f-titulo").value,
    pais: el("f-pais").value,
    anio: el("f-anio").value,
    precioClp: el("f-precio").value,
    precioClpRaw: parseFloat(el("f-precio").dataset.raw) || 0,
    condicion: el("f-cond").value,
    descripcion: el("f-desc").value,
    costoUsd: el("f-costo").value,
    fotos: lastItemData.photos || [],
    fixed: fixedValues,
    internal: internalValues,
  };

  const row =
    currentMode === "billetes"
      ? { ...baseRow, designName: el("f-tipo").value, billValue: el("f-valor").value }
      : {
          ...baseRow,
          metal: el("f-metal").value,
          tipoMoneda: el("f-tipo").value,
          valorMoneda: el("f-valor").value,
        };

  rows.push(row);
  updateCounters();
  showStatus("", "");
  cleanForm();
});

// --- Contador de filas (en el botón de Excel) + bloqueo del switch ---
function updateCounters() {
  el("excelCount").textContent = rows.length;
  btnExcel.disabled = rows.length === 0;
  updateModeLockState();
}

// --- Botón "Excel": pide al backend el .xlsx real y lo descarga ---
btnExcel.addEventListener("click", async () => {
  if (rows.length === 0) return;

  btnExcel.disabled = true;
  showStatus("", "");

  try {
    const res = await fetch("/api/generate-excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, mode: currentMode }),
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
    a.download = currentMode === "billetes" ? "publicar_billetes_chile.xlsx" : "publicar_monedas_chile.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    // Al exportar, se vacía la cola: esto desbloquea el switch de modo.
    rows = [];
    updateCounters();

    showStatus("", "");
  } catch (err) {
    showStatus("Error de conexión al generar el Excel. Probá de nuevo.", "error");
  } finally {
    btnExcel.disabled = rows.length === 0;
  }
});
