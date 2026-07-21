// lib/attributeMapper.js
//
// Traduce el JSON crudo de un ítem de MLA a los campos que el formulario
// del frontend necesita. Los attribute_id confirmados contra un ítem real
// (MLA1470133733, categoría MLA-COINS) son:
//
//   ORIGIN              -> país de origen
//   ISSUE_YEAR           -> año de emisión
//   METAL_TYPE            -> tipo de metal
//   COIN_TYPE              -> tipo de moneda
//   COIN_VALUE              -> valor de la moneda
//   COMMEMORATIVE_COIN       -> si es conmemorativa (puede venir vacío)
//
// Nota: algunos ítems pueden no tener todos los atributos cargados
// (ej. COMMEMORATIVE_COIN vino vacío en el ítem de prueba). En esos
// casos devolvemos null, y el frontend deja el campo en blanco para
// que Lautaro lo complete a mano en vez de romper la app.

function findAttributeValue(attributes, attributeId) {
  const attr = (attributes || []).find((a) => a.id === attributeId);
  if (!attr) return null;
  // value_name es null cuando el atributo no tiene dato cargado (value_id -1)
  return attr.value_name || null;
}

function mapItemToFormFields(item, description) {
  const attributes = item.attributes || [];

  return {
    // Identificación / solo lectura
    id: item.id,
    permalink: item.permalink,
    sellerId: item.seller_id,
    status: item.status,

    // Editables, precargados desde la API
    title: item.title,
    country: findAttributeValue(attributes, "ORIGIN"),
    year: findAttributeValue(attributes, "ISSUE_YEAR"),
    metal: findAttributeValue(attributes, "METAL_TYPE"),
    coinType: findAttributeValue(attributes, "COIN_TYPE"),
    coinValue: findAttributeValue(attributes, "COIN_VALUE"),
    commemorative: findAttributeValue(attributes, "COMMEMORATIVE_COIN"),
    condition: item.condition, // "used" | "new"
    priceArs: item.price,
    currency: item.currency_id,
    description: description || "",
    photos: (item.pictures || []).map((p) => p.secure_url || p.url),
  };
}

module.exports = { mapItemToFormFields, findAttributeValue };
