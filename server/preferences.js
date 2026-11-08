// Clearspace account sync: each logged-in user can load and save THEIR OWN settings.
//
//   GET /api/preferences   -> { settings, updatedAt }  (settings is null if never saved)
//   PUT /api/preferences   <- { settings }             -> { ok: true, updatedAt }
//
// Every request must carry an Auth0 access token ("Authorization: Bearer ...").
// express-oauth2-jwt-bearer checks it was really made by our Auth0 tenant, for our
// API, and hasn't expired. The user's id ("sub") comes from the verified token,
// never from the request body, so nobody can read or change someone else's settings.
//
// Privacy: only the settings themselves are stored. No names, no emails, and never
// labels like "has dyslexia".

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auth } from "express-oauth2-jwt-bearer";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || "dev-tsmyxcbitdn1q1vy.us.auth0.com";
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "https://accessify-api";

// A small JSON file is enough for the demo; swap for a real database later.
const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.PREFERENCES_FILE || path.join(here, "data", "preferences.json");

function readAll() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return {}; }
}
function writeAll(all) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(all, null, 2));
  fs.renameSync(temp, DATA_FILE); // replace in one step, so a crash can't leave half a file
}

// Settings must look like Clearspace settings: an object with version 1
function isValidSettings(settings) {
  return settings && typeof settings === "object" && !Array.isArray(settings) && settings.version === 1 && Array.isArray(settings.selected);
}

export function preferencesRouter() {
  const router = express.Router();

  router.use(auth({ audience: AUTH0_AUDIENCE, issuerBaseURL: `https://${AUTH0_DOMAIN}/` }));

  router.get("/", (req, res) => {
    const saved = readAll()[req.auth.payload.sub];
    res.json({ settings: saved?.settings ?? null, updatedAt: saved?.updatedAt ?? null });
  });

  router.put("/", (req, res) => {
    const settings = req.body?.settings;
    if (!isValidSettings(settings)) return res.status(400).json({ error: "Those don't look like Clearspace settings." });
    const all = readAll();
    const updatedAt = new Date().toISOString();
    all[req.auth.payload.sub] = { settings, updatedAt };
    writeAll(all);
    res.json({ ok: true, updatedAt });
  });

  // Turn token problems into clear JSON instead of an HTML error page
  router.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({ error: status === 401 ? "Please log in again." : "Something went wrong saving your settings." });
  });

  return router;
}
