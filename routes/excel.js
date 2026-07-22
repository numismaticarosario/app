// routes/excel.js
//
// POST /api/generate-excel
//
// Recibe el array de filas acumuladas en el frontend y devuelve el .xlsx
// final, partiendo del TEMPLATE OFICIAL de Mercado Libre Chile (categoría
// Monedas) en vez de armar un archivo desde cero.
//
// Por qué partir del template y no generar un Excel "plano":
// la planilla oficial ya trae, en cada una de sus ~1000 filas de datos,
// fórmulas vivas que hay que conservar intactas:
//   - Columna C  (Cantidad de caracteres): cuenta el título automáticamente
//   - Columna Q  (Cargo por venta): calcula sola la comisión de ML según
//     el Precio y el Tipo de publicación
//   - Columna AF (Resumen de errores) y AG (BUYBOX_FORMULA): validación
//     interna del propio archivo de ML
// Si generáramos el archivo desde cero con una librería genérica, estas
// fórmulas se perderían y el archivo dejaría de calcular la comisión sola.
//
// Los datos se escriben a partir de la fila 9 (así arranca la planilla
// real), y SOLO en las columnas de dato editable. Las columnas con fórmula
// no se tocan.

const express = require("express");
const path = require("path");
const ExcelJS = require("exceljs");

const router = express.Router();

const TEMPLATE_PATH = path.join(__dirname, "..", "templates", "Planilla_Publicar_Monedas_Chile.xlsx");
const FIRST_DATA_ROW = 9;

// Mapeo columna (letra real de la planilla) -> qué dato de la fila va ahí.
// Las columnas A, C, E, G, Q, AF, AG, AH NO se tocan: quedan vacías o con
// su fórmula original intacta.
function writeRowToSheet(sheet, rowIndex, row) {
  const fx = row.fixed || {};
  const marca = fx.marca && fx.marca !== "—" ? fx.marca : "";

  sheet.getCell(`B${rowIndex}`).value = row.titulo || "";
  sheet.getCell(`D${rowIndex}`).value = row.condicion || "";
  sheet.getCell(`F${rowIndex}`).value = (row.fotos || []).join(",");
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

function toNumber(value, fallback) {
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}

router.post("/", async (req, res) => {
  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "NO_ROWS", message: "No hay filas para generar el Excel." });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);
    const sheet = workbook.getWorksheet("Monedas");

    if (!sheet) {
      throw new Error("La hoja 'Monedas' no se encontró en el template.");
    }

    rows.forEach((row, i) => {
      writeRowToSheet(sheet, FIRST_DATA_ROW + i, row);
    });

    // Borra las filas de plantilla que sobran (sin datos) para que el
    // archivo no muestre cientos de filas vacías marcadas como "error".
    const lastUsedRow = FIRST_DATA_ROW + rows.length - 1;
    const totalTemplateRows = sheet.rowCount;
    if (totalTemplateRows > lastUsedRow) {
      sheet.spliceRows(lastUsedRow + 1, totalTemplateRows - lastUsedRow);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="publicar_monedas_chile.xlsx"'
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Error generando el Excel:", err);
    res.status(500).json({ error: "EXCEL_GENERATION_ERROR", message: "No se pudo generar el Excel." });
  }
});

module.exports = router;
