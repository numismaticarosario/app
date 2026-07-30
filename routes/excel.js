// routes/excel.js
//
// POST /api/generate-excel
// body: { rows: [...], mode: "monedas" | "billetes" }
//
// Recibe el array de filas acumuladas en el frontend y devuelve el .xlsx
// final, partiendo del TEMPLATE OFICIAL de Mercado Libre Chile que
// corresponda (Monedas o Billetes) en vez de armar un archivo desde cero.
//
// Por qué partir del template y no generar un Excel "plano":
// las planillas oficiales ya traen, en cada una de sus ~1000 filas de
// datos, fórmulas vivas que hay que conservar intactas (cantidad de
// caracteres del título, cargo por venta calculado según Precio y Tipo
// de publicación, resumen de errores, etc.). Si generáramos el archivo
// desde cero con una librería genérica, estas fórmulas se perderían.
//
// Los datos se escriben a partir de la fila 9 (así arrancan las dos
// planillas reales), y SOLO en las columnas de dato editable. Las
// columnas con fórmula no se tocan.

const express = require("express");
const path = require("path");
const ExcelJS = require("exceljs");

const router = express.Router();

const FIRST_DATA_ROW = 9;

const TEMPLATES = {
  monedas: {
    file: path.join(__dirname, "..", "templates", "Planilla_Publicar_Monedas_Chile.xlsx"),
    sheetName: "Monedas",
    writeRow: writeRowMonedas,
  },
  billetes: {
    file: path.join(__dirname, "..", "templates", "Planilla_Publicar_Billetes_Chile.xlsx"),
    sheetName: "Billetes",
    writeRow: writeRowBilletes,
  },
};

function toNumber(value, fallback) {
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}

// Mapeo columna (letra real de la planilla) -> qué dato de la fila va ahí.
// Las columnas A, C, E, Q, AF, AG, AH NO se tocan: quedan vacías o con
// su fórmula original intacta. La columna G (SKU) SÍ se completa ahora,
// con el código Costo/Ganancia generado por la app (ver app.js).
function writeRowMonedas(sheet, rowIndex, row) {
  const fx = row.fixed || {};
  const marca = fx.marca && fx.marca !== "—" ? fx.marca : "";

  sheet.getCell(`B${rowIndex}`).value = row.titulo || "";
  sheet.getCell(`D${rowIndex}`).value = row.condicion || "";
  sheet.getCell(`F${rowIndex}`).value = (row.fotos || []).join(",");
  sheet.getCell(`G${rowIndex}`).value = row.sku || ""; // código Costo/Ganancia (X<costo>Z<ganancia>)
  sheet.getCell(`H${rowIndex}`).value = toNumber(fx.stock, 1);
  sheet.getCell(`I${rowIndex}`).value = toNumber(row.precioClpRaw, 0);
  sheet.getCell(`J${rowIndex}`).value = fx.moneda || "$";
  sheet.getCell(`K${rowIndex}`).value = row.descripcion || "";
  sheet.getCell(`L${rowIndex}`).value = toNumber(fx.ancho, 10);
  sheet.getCell(`M${rowIndex}`).value = toNumber(fx.alto, 14);
  sheet.getCell(`N${rowIndex}`).value = toNumber(fx.profundidad, 1);
  sheet.getCell(`O${rowIndex}`).value = toNumber(fx.peso, 0.1);
  sheet.getCell(`P${rowIndex}`).value = fx.tipoPublicacion || "Clásica";
  // Q: Cargo por venta -> fórmula del template, NO se toca
  sheet.getCell(`R${rowIndex}`).value = fx.formaEnvio || "Mercado Envíos";
  sheet.getCell(`S${rowIndex}`).value = fx.costoEnvio || "A cargo del comprador";
  sheet.getCell(`T${rowIndex}`).value = fx.retiroPersona || "No acepto";
  sheet.getCell(`U${rowIndex}`).value = fx.tipoGarantia || "Garantía del vendedor";
  sheet.getCell(`V${rowIndex}`).value = toNumber(fx.tiempoGarantiaNumero, 7);
  sheet.getCell(`W${rowIndex}`).value = fx.tiempoGarantiaUnidad || "días";
  sheet.getCell(`X${rowIndex}`).value = toNumber(row.anio, null);
  sheet.getCell(`Y${rowIndex}`).value = row.pais || "";
  sheet.getCell(`Z${rowIndex}`).value = marca;
  sheet.getCell(`AA${rowIndex}`).value = row.costoUsd || ""; // Modelo, Fase 1: copia el Costo tal cual
  sheet.getCell(`AB${rowIndex}`).value = row.metal || "";
  sheet.getCell(`AC${rowIndex}`).value = row.conmemorativa || "";
  sheet.getCell(`AD${rowIndex}`).value = row.valorMoneda || "";
  sheet.getCell(`AE${rowIndex}`).value = row.tipoMoneda || "";
  // AF, AG: fórmulas del template, NO se tocan. AH: se deja vacía.
}

// Columnas confirmadas contra la plantilla real de Billetes (distinto
// orden y distintas columnas que Monedas: sin Metal ni Conmemorativa,
// con Formato de venta / Unidades por pack / Nombre del diseño).
function writeRowBilletes(sheet, rowIndex, row) {
  const fx = row.fixed || {};

  sheet.getCell(`B${rowIndex}`).value = row.titulo || "";
  sheet.getCell(`D${rowIndex}`).value = row.condicion || "";
  sheet.getCell(`F${rowIndex}`).value = (row.fotos || []).join(",");
  sheet.getCell(`G${rowIndex}`).value = row.sku || ""; // código Costo/Ganancia (X<costo>Z<ganancia>)
  sheet.getCell(`H${rowIndex}`).value = toNumber(fx.stock, 1);
  sheet.getCell(`I${rowIndex}`).value = toNumber(row.precioClpRaw, 0);
  sheet.getCell(`J${rowIndex}`).value = fx.moneda || "$";
  sheet.getCell(`K${rowIndex}`).value = "Unidad"; // siempre Unidad, nunca Pack (confirmado)
  sheet.getCell(`L${rowIndex}`).value = 1; // Unidades por pack: siempre 1
  sheet.getCell(`M${rowIndex}`).value = row.descripcion || "";
  sheet.getCell(`N${rowIndex}`).value = toNumber(fx.ancho, 10);
  sheet.getCell(`O${rowIndex}`).value = toNumber(fx.alto, 14);
  sheet.getCell(`P${rowIndex}`).value = toNumber(fx.profundidad, 1);
  sheet.getCell(`Q${rowIndex}`).value = toNumber(fx.peso, 0.1);
  sheet.getCell(`R${rowIndex}`).value = fx.tipoPublicacion || "Clásica";
  // S: Cargo por venta -> fórmula del template, NO se toca
  sheet.getCell(`T${rowIndex}`).value = fx.formaEnvio || "Mercado Envíos";
  sheet.getCell(`U${rowIndex}`).value = fx.costoEnvio || "A cargo del comprador";
  sheet.getCell(`V${rowIndex}`).value = fx.retiroPersona || "No acepto";
  sheet.getCell(`W${rowIndex}`).value = fx.tipoGarantia || "Garantía del vendedor";
  sheet.getCell(`X${rowIndex}`).value = toNumber(fx.tiempoGarantiaNumero, 7);
  sheet.getCell(`Y${rowIndex}`).value = fx.tiempoGarantiaUnidad || "días";
  sheet.getCell(`Z${rowIndex}`).value = row.pais || "";
  sheet.getCell(`AA${rowIndex}`).value = toNumber(row.billValue, null); // Valor del billete, columna numérica
  sheet.getCell(`AB${rowIndex}`).value = row.costoUsd || ""; // Modelo, Fase 1: copia el Costo tal cual
  sheet.getCell(`AC${rowIndex}`).value = toNumber(row.anio, null);
  sheet.getCell(`AD${rowIndex}`).value = row.designName || "";
  // AE, AF: fórmulas del template, NO se tocan. AG: se deja vacía.
}

router.post("/", async (req, res) => {
  const { rows, mode } = req.body;
  const templateMode = TEMPLATES[mode] ? mode : "monedas";
  const template = TEMPLATES[templateMode];

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "NO_ROWS", message: "No hay filas para generar el Excel." });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(template.file);
    const sheet = workbook.getWorksheet(template.sheetName);

    if (!sheet) {
      throw new Error(`La hoja '${template.sheetName}' no se encontró en el template.`);
    }

    rows.forEach((row, i) => {
      template.writeRow(sheet, FIRST_DATA_ROW + i, row);
    });

    // Borra las filas de plantilla que sobran (sin datos) para que el
    // archivo no muestre cientos de filas vacías marcadas como "error".
    const lastUsedRow = FIRST_DATA_ROW + rows.length - 1;
    const totalTemplateRows = sheet.rowCount;
    if (totalTemplateRows > lastUsedRow) {
      sheet.spliceRows(lastUsedRow + 1, totalTemplateRows - lastUsedRow);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = templateMode === "billetes" ? "publicar_billetes_chile.xlsx" : "publicar_monedas_chile.xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Error generando el Excel:", err);
    res.status(500).json({ error: "EXCEL_GENERATION_ERROR", message: "No se pudo generar el Excel." });
  }
});

module.exports = router;
