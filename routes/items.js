// routes/items.js
//
// GET /api/items/:id?mode=monedas|billetes
//
// Dado un ID de publicación de MLA (ej. MLA1470133733):
//   1) Pide un access_token válido (se renueva solo si hace falta).
//   2) Trae el ítem desde la API de Mercado Libre.
//   3) Valida que el seller_id del ítem sea el tuyo (chequeo de propiedad,
//      no negociable por seguridad: nunca se debe poder traer datos de
//      publicaciones ajenas).
//   4) Valida que la categoría del ítem coincida con el "mode" pedido
//      (Monedas o Billetes) — si no coincide, no se trae nada. Esto es
//      lo que impide mezclar tipos dentro de una misma sesión de trabajo.
//   5) Trae la descripción (viene en un endpoint aparte en la API de ML).
//   6) Devuelve todo ya mapeado a los campos que el formulario necesita.

const express = require("express");
const axios = require("axios");
const { getValidAccessToken } = require("../lib/tokenStore");
const { mapItemToFormFields } = require("../lib/attributeMapper");

const router = express.Router();

// domain_id real de MLA para cada modo, confirmado contra ítems reales:
//   Monedas  -> MLA-COINS              (ej. MLA1470133733)
//   Billetes -> MLA-COLLECTIBLE_BILLS  (ej. MLA905612492)
const DOMAIN_BY_MODE = {
  monedas: "MLA-COINS",
  billetes: "MLA-COLLECTIBLE_BILLS",
};

const MODE_LABEL = {
  monedas: "Monedas",
  billetes: "Billetes",
};

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const mode = (req.query.mode || "monedas").toLowerCase();

  // Validación básica de formato antes de gastar una llamada a la API.
  if (!/^MLA\d+$/i.test(id)) {
    return res.status(400).json({ error: "INVALID_ID", message: "El ID debe tener el formato MLA1234567890." });
  }

  if (!DOMAIN_BY_MODE[mode]) {
    return res.status(400).json({ error: "INVALID_MODE", message: "Modo de sesión inválido (esperado: monedas o billetes)." });
  }

  try {
    const accessToken = await getValidAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}` };

    const { data: item } = await axios.get(`https://api.mercadolibre.com/items/${id}`, { headers });

    // --- Chequeo de propiedad: obligatorio, no opcional ---
    const myUserId = Number(process.env.ML_SELLER_USER_ID);
    if (item.seller_id !== myUserId) {
      return res.status(403).json({
        error: "NOT_OWNER",
        message: "Esta publicación no pertenece a tu cuenta de Mercado Libre. No se puede importar.",
      });
    }

    // --- Chequeo de categoría: el ítem tiene que ser del mismo tipo que la sesión activa ---
    const expectedDomain = DOMAIN_BY_MODE[mode];
    if (item.domain_id !== expectedDomain) {
      return res.status(409).json({
        error: "WRONG_CATEGORY",
        message: `Esta publicación no es de ${MODE_LABEL[mode]}. Cambiá el modo de sesión o pegá una publicación de ${MODE_LABEL[mode]}.`,
        detectedDomain: item.domain_id || null,
      });
    }

    // La descripción vive en un endpoint aparte.
    let description = "";
    try {
      const { data: descData } = await axios.get(
        `https://api.mercadolibre.com/items/${id}/description`,
        { headers }
      );
      description = descData.plain_text || "";
    } catch {
      // Si el ítem no tiene descripción cargada, seguimos sin romper.
      description = "";
    }

    const formFields = mapItemToFormFields(item, description, mode);
    res.json(formFields);
  } catch (err) {
    if (err.code === "NOT_AUTHENTICATED") {
      return res.status(401).json({
        error: "NOT_AUTHENTICATED",
        message: "Todavía no iniciaste sesión con Mercado Libre. Andá a /auth/login.",
      });
    }

    const status = err.response?.status || 500;
    console.error(`Error trayendo el ítem ${id}:`, err.response?.data || err.message);
    res.status(status).json({
      error: "ML_API_ERROR",
      message: "No se pudo traer la publicación desde Mercado Libre.",
      detail: err.response?.data || null,
    });
  }
});

module.exports = router;
