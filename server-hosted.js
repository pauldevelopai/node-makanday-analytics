/**
 * server-hosted.js — the ONLINE (multi-tenant) entrypoint for Audience Signal.
 *
 * Runs on the GROUNDED box behind Caddy. Reuses the Node's existing handlers
 * (lib/handlers.js) UNCHANGED, but swaps the local file host for a per-request
 * Postgres host scoped to the signed-in newsroom (lib/pg-host.js), and reuses
 * the tracker's (holly's) login: it verifies the tracker_token JWT cookie the
 * browser already sends, with the same secret.
 *
 * The LOCAL install path (index.js + the lite host) is untouched — this is a
 * separate, server-only entrypoint started with `npm run start:hosted`.
 *
 * Required env (set in an env file on the box, never committed):
 *   JWT_SECRET     = holly's config.jwtSecret (to verify tracker_token)
 *   ANTHROPIC_API_KEY = the shared GROUNDED key (server makes the AI calls)
 *   PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT  OR  DATABASE_URL  (the box's Postgres)
 * Optional:
 *   PORT (default 3002), AUTH_COOKIE (default tracker_token),
 *   LOGIN_URL (default /login), APP_URL (for post-login return), MODEL
 */

import "dotenv/config";
import express from "express";
import multer from "multer";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as handlers from "./lib/handlers.js";
import { createPgHost, ensureSchema } from "./lib/pg-host.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_COOKIE = process.env.AUTH_COOKIE || "tracker_token";
const LOGIN_URL = process.env.LOGIN_URL || "/login";
const APP_URL = process.env.APP_URL || ""; // public URL of this app, for post-login return

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET not set — it must match the tracker's config.jwtSecret.");
  process.exit(1);
}

const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
await ensureSchema(pool);

// holly's tracker_token payload is { id, email, role, sector_ids } — there is NO
// organisation/newsroom id in it, so we scope per user account. In the pilot each
// newsroom signs in with one account, so account == newsroom. (Sharing one
// newsroom's data across several accounts would need an org id in the token, or a
// users→organisations lookup — a later refinement.)
const tenantOf = (u) => String(u.id);
const nameOf = (u) => u.email || null;

function readUser(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(cookieParser());

const hostFor = (req) => createPgHost({
  pool,
  newsroomId: tenantOf(req.user),
  newsroom: nameOf(req.user)
});

// Every /api/* call needs a valid tracker session.
app.use("/api", (req, res, next) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in.", login: LOGIN_URL });
  req.user = user;
  next();
});

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(hostFor(req), req.body || req.query || {})); }
  catch (e) { res.status(500).json({ error: e.message || "node error" }); }
};

app.get("/api/setup",    wrap((h) => handlers.getSetupStatus(h)));
app.get("/api/sources",  wrap((h) => handlers.listSources(h)));
app.get("/api/report",   wrap((h, q) => handlers.getReport(h, q)));
app.get("/api/quality",  wrap((h, q) => handlers.getQuality(h, q)));
app.get("/api/activity", wrap((h) => handlers.getActivity(h)));
app.post("/api/brief",   wrap((h, b) => handlers.postBrief(h, b)));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.post("/api/ingest", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Choose a file to upload first.");
    const out = await handlers.postIngest(hostFor(req), {
      buffer: req.file.buffer,
      sourceLabel: (req.body && req.body.sourceLabel) || req.file.originalname.replace(/\.[^.]+$/, "")
    });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Static assets are public (just frontend code). The page itself is gated:
// signed-out visitors are bounced to holly's existing login and returned here.
app.use(express.static(join(__dirname, "public"), { index: false }));
app.get("*", (req, res) => {
  if (!readUser(req)) {
    const next = APP_URL ? `?next=${encodeURIComponent(APP_URL)}` : "";
    return res.redirect(`${LOGIN_URL}${next}`);
  }
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  Audience Signal (hosted, multi-tenant) listening on http://localhost:${PORT}\n`);
});
