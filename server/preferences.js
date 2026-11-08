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
import { neonPreferences } from './neon-preferences.js';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || "dev-tsmyxcbitdn1q1vy.us.auth0.com";
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "https://accessify-api";

// File storage is only a local development fallback, not Render persistence.
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
  const database = process.env.DATABASE_URL ? neonPreferences(process.env.DATABASE_URL) : null;
  const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production') || process.env.RENDER === 'true';
  function requireStorage() {
    if (!database && production) {
      const error = new Error('Database is not configured');
      error.code = 'DATABASE_URL_MISSING';
      throw error;
    }
  }

  router.use(auth({ audience: AUTH0_AUDIENCE, issuerBaseURL: `https://${AUTH0_DOMAIN}/` }));

  router.get("/", async (req, res, next) => {
    try {
      requireStorage();
      const saved = database ? await database.get(req.auth.payload.sub) : readAll()[req.auth.payload.sub];
      res.json({ settings: saved?.settings ?? null, updatedAt: saved?.updatedAt ?? null });
    } catch (error) { next(error); }
  });

  router.put("/", async (req, res, next) => {
    const settings = req.body?.settings;
    if (!isValidSettings(settings)) return res.status(400).json({ error: "Those don't look like Clearspace settings." });
    try {
      requireStorage();
      let updatedAt;
      if (database) {
        updatedAt = await database.put(req.auth.payload.sub, settings);
      } else {
        const all = readAll();
        updatedAt = new Date().toISOString();
        all[req.auth.payload.sub] = { settings, updatedAt };
        writeAll(all);
      }
      res.json({ ok: true, updatedAt });
    } catch (error) { next(error); }
  });

  // Turn token problems into clear JSON instead of an HTML error page
  router.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) {
      // Log diagnostic codes only: never tokens, account IDs or saved preferences.
      const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'UNKNOWN';
      const operation = ['mkdir', 'open', 'write', 'rename', 'read'].includes(error.syscall) ? error.syscall : 'request';
      console.error(`[preferences] ${operation} failed (${code}). Check DATABASE_URL and Neon availability; local file storage also requires a writable path.`);
    }
    res.status(status).json({ error: status === 401 ? "Please log in again." : "Something went wrong saving your settings." });
  });

  return router;
}
