// routes/auth.js
//
// Flujo OAuth2 Authorization Code contra Mercado Libre Argentina.
// Estos son los mismos 3 pasos que hicimos a mano por PowerShell,
// ahora automatizados:
//   1) GET /auth/login     -> redirige a ML para que autorices la app
//   2) GET /auth/callback  -> ML te trae de vuelta acá con un "code",
//                             lo canjeamos por access_token + refresh_token
//   3) GET /auth/status    -> para que el frontend sepa si ya estás logueado

const express = require("express");
const axios = require("axios");
const { saveTokenResponse, readTokens } = require("../lib/tokenStore");

const router = express.Router();

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const AUTHORIZE_URL = "https://auth.mercadolibre.com.ar/authorization";

router.get("/login", (req, res) => {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.ML_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.ML_REDIRECT_URI);
  res.redirect(url.toString());
});

router.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`Mercado Libre devolvió un error: ${error}`);
  }
  if (!code) {
    return res.status(400).send("Falta el parámetro 'code' en la respuesta de Mercado Libre.");
  }

  try {
    const { data } = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: process.env.ML_REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    saveTokenResponse(data);

    // Si ya existe un frontend desplegado, lo redirigimos ahí con un flag
    // simple (el frontend nunca recibe ni ve el token: éste queda solo en
    // el backend, en tokens.json). Mientras el frontend todavía no existe
    // (fase de pruebas del backend solo), mostramos una confirmación simple
    // en vez de redirigir a una URL que rompería.
    if (process.env.FRONTEND_ORIGIN) {
      try {
        const frontendUrl = new URL(process.env.FRONTEND_ORIGIN);
        frontendUrl.searchParams.set("auth", "ok");
        return res.redirect(frontendUrl.toString());
      } catch {
        // FRONTEND_ORIGIN mal formado: seguimos al fallback de abajo.
      }
    }

    res.send("Login con Mercado Libre exitoso. Ya podés cerrar esta pestaña.");
  } catch (err) {
    console.error("Error canjeando el code por tokens:", err.response?.data || err.message);
    res.status(500).send("No se pudo completar el login con Mercado Libre. Revisá los logs del backend.");
  }
});

router.get("/status", (req, res) => {
  const tokens = readTokens();
  if (!tokens) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    user_id: tokens.user_id,
    expires_at: tokens.expires_at,
  });
});

module.exports = router;
