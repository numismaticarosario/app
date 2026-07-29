// lib/attributeMapper.js
//
// Traduce el JSON crudo de un ítem de MLA a los campos que el formulario
// del frontend necesita. Soporta dos modos de sesión: "monedas" y
// "billetes" — cada uno lee sus propios attribute_id, confirmados contra
// ítems reales:
//
// MONEDAS (MLA-COINS, ej. MLA1470133733):
//   ORIGIN              -> país de origen
//   ISSUE_YEAR           -> año de emisión
//   METAL_TYPE            -> tipo de metal
//   COIN_TYPE              -> tipo de moneda
//   COIN_VALUE              -> valor de la moneda
//   COMMEMORATIVE_COIN       -> si es conmemorativa (puede venir vacío)
//
// BILLETES (MLA-COLLECTIBLE_BILLS, ej. MLA905612492):
//   ORIGIN              -> país de origen (mismo attribute_id que Monedas)
//   RELEASE_YEAR          -> año de lanzamiento
//   BILL_VALUE              -> valor del billete
//   PATTERN_NAME              -> nombre del diseño
//
// Nota: algunos ítems pueden no tener todos los atributos cargados. En esos
// casos devolvemos null, y el frontend deja el campo en blanco para que
// Lautaro lo complete a mano en vez de romper la app.
//
// sku: viene del atributo SELLER_SKU (es donde la UI de ML guarda el campo
// "Código de identificación (SKU)"). Se deja item.seller_custom_field como
// respaldo. Se usa para el código Costo/Ganancia (formato X<costo>Z<ganancia>,
// con P reemplazando el punto decimal). Puede venir null si la publicación
// no tiene SKU cargado. Es igual para ambos modos.

function findAttributeValue(attributes, attributeId) {
  const attr = (attributes || []).find((a) => a.id === attributeId);
  if (!attr) return null;
  // value_name es null cuando el atributo no tiene dato cargado (value_id -1)
  return attr.value_name || null;
}

function mapItemToFormFields(item, description, mode = "monedas") {
  const attributes = item.attributes || [];

  const base = {
    // Identificación / solo lectura
    id: item.id,
    permalink: item.permalink,
    sellerId: item.seller_id,
    status: item.status,
    mode,
    categoryId: item.category_id || null,
    domainId: item.domain_id || null,

    // Comunes a ambos modos
    title: item.title,
    country: findAttributeValue(attributes, "ORIGIN"),
    condition: item.condition, // "used" | "new"
    priceArs: item.price,
    currency: item.currency_id,
    description: description || "",
    photos: (item.pictures || []).map((p) => p.secure_url || p.url),
    sku: findAttributeValue(attributes, "SELLER_SKU") || item.seller_custom_field || null,
  };

  if (mode === "billetes") {
    return {
      ...base,
      year: findAttributeValue(attributes, "RELEASE_YEAR"),
      billValue: findAttributeValue(attributes, "BILL_VALUE"),
      designName: findAttributeValue(attributes, "PATTERN_NAME"),
      // Campos de Monedas, no aplican en este modo:
      metal: null,
      coinType: null,
      coinValue: null,
      commemorative: null,
    };
  }

  // modo "monedas" (default)
  return {
    ...base,
    year: findAttributeValue(attributes, "ISSUE_YEAR"),
    metal: findAttributeValue(attributes, "METAL_TYPE"),
    coinType: findAttributeValue(attributes, "COIN_TYPE"),
    coinValue: findAttributeValue(attributes, "COIN_VALUE"),
    commemorative: findAttributeValue(attributes, "COMMEMORATIVE_COIN"),
    // Campos de Billetes, no aplican en este modo:
    billValue: null,
    designName: null,
  };
}

module.exports = { mapItemToFormFields, findAttributeValue };
