// lib/tokenStore.js
//
// Maneja el ciclo de vida de las credenciales OAuth contra Mercado Libre:
// - Guarda access_token / refresh_token en un archivo local (tokens.json).
// - Los renueva automáticamente cuando están por vencer.
//
// IMPORTANTE: tokens.json queda excluido de git (ver .gitignore). Es un
// archivo local con credenciales sensibles, igual de delicado que el .env.
//
// Nota de diseño: como esta app la usa una sola persona (vos), un archivo
// en disco alcanza y sobra. Si en el futuro hubiera más de un usuario,
// esto se reemplazaría por una base de datos con un registro por usuario.

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const TOKENS_PATH = path.join(__dirname, "..", "tokens.json");
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

// Margen de seguridad: renovamos el token si le quedan menos de 5 minutos.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function readTokens() {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf-8");
}

/**
 * Guarda la respuesta cruda del endpoint /oauth/token, calculando
 * cuándo expira el access_token en base a expires_in.
 */
function saveTokenResponse(tokenResponse) {
  const now = Date.now();
  const tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    token_type: tokenResponse.token_type,
    scope: tokenResponse.scope,
    user_id: tokenResponse.user_id,
    obtained_at: now,
    expires_at: now + tokenResponse.expires_in * 1000,
  };
  writeTokens(tokens);
  return tokens;
}

async function refreshAccessToken(currentTokens) {
  const { data } = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: currentTokens.refresh_token,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return saveTokenResponse(data);
}

/**
 * Devuelve un access_token válido, renovándolo si hace falta.
 * Tira un error si todavía no se hizo el login OAuth nunca.
 */
async function getValidAccessToken() {
  let tokens = readTokens();

  if (!tokens) {
    const err = new Error("NOT_AUTHENTICATED");
    err.code = "NOT_AUTHENTICATED";
    throw err;
  }

  const aboutToExpire = Date.now() > tokens.expires_at - REFRESH_MARGIN_MS;

  if (aboutToExpire) {
    tokens = await refreshAccessToken(tokens);
  }

  return tokens.access_token;
}

module.exports = {
  readTokens,
  saveTokenResponse,
  refreshAccessToken,
  getValidAccessToken,
};
