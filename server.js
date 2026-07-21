// server.js — punto de entrada del backend.
//
// Cómo correrlo en local:
//   1) cd backend
//   2) npm install
//   3) copiá .env.example a .env y completá tus credenciales
//   4) npm run dev

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const itemsRoutes = require("./routes/items");

const REQUIRED_ENV_VARS = [
  "ML_CLIENT_ID",
  "ML_CLIENT_SECRET",
  "ML_REDIRECT_URI",
  "ML_SELLER_USER_ID",
];

const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `Faltan variables de entorno: ${missing.join(", ")}. Revisá tu archivo .env.`
  );
  process.exit(1);
}

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json());

// Sirve el frontend (carpeta "public") como sitio estático.
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "publicador-mla-mlc-backend" });
});

app.use("/auth", authRoutes);
app.use("/api/items", itemsRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
