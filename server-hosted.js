/**
 * server-hosted.js — the ONLINE (multi-tenant) entrypoint for Audience Signal.
 *
 * Runs on the GROUNDED box behind Caddy. Reuses the Node's existing handlers
 * (lib/handlers.js) UNCHANGED, but swaps the local file host for a per-request
 * Postgres host scoped to the signed-in newsroom (lib/pg-host.js), and reuses
 * the tracker's login: it verifies the tracker's JWT cookie the browser already
 * sends, with the same secret. (The cookie name has changed across rebrands —
 * holly_token → tracker_token → ... — so readUser accepts whichever cookie
 * verifies with JWT_SECRET rather than hardcoding one name.)
 *
 * The LOCAL install path (index.js + the lite host) is untouched — this is a
 * separate, server-only entrypoint started with `npm run start:hosted`.
 *
 * Required env (set in an env file on the box, never committed):
 *   JWT_SECRET     = the tracker's config.jwtSecret (to verify holly_token)
 *   ANTHROPIC_API_KEY = the shared GROUNDED key (server makes the AI calls)
 *   PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT  OR  DATABASE_URL  (the box's Postgres)
 * Optional:
 *   PORT (default 3002), AUTH_COOKIE (first cookie name to try; default tracker_token),
 *   LOGIN_URL (default /login), APP_URL (for post-login return), MODEL
 */

import dotenv from "dotenv";
// Make the box's .env file authoritative: with override:true it wins over any
// stale value pm2 may have captured into the process environment at start time
// (otherwise editing .env — e.g. fixing ANTHROPIC_API_KEY — silently has no
// effect). Matches how the tracker loads its own config.
dotenv.config({ override: true });
import express from "express";
import multer from "multer";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as handlers from "./lib/handlers.js";
import { createPgHost, ensureSchema } from "./lib/pg-host.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// ── Consistent GROUNDED nav, injected only in hosted mode ──────────────────
// The local install (index.js) serves public/index.html untouched. Online,
// the Node lives under the same domain as the tracker + front door, so we
// inject the same nav the rest of grounded.developai.co.za uses — the menu is
// then visible and consistent across every Node page. Absolute paths resolve
// against the domain root, so they reach the tracker regardless of the
// /nodes/analytics/app/ subpath the app itself is mounted on.
const NAV_HTML = `<style id="g-nav-style">
#g-nav{border-bottom:1px solid #E2E8F0;background:#fff;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif}
#g-nav .g-bar{max-width:1180px;margin:0 auto;padding:12px 26px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
#g-nav .g-brand{text-decoration:none;color:#1A202C;display:flex;flex-direction:column;line-height:1.2}
#g-nav .g-brand b{font-size:18px;font-weight:700;letter-spacing:-0.01em}
#g-nav .g-brand span{font-size:11px;color:#718096;font-weight:500}
#g-nav .g-links{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
#g-nav .g-links a{padding:8px 12px;border-radius:6px;font-size:14px;font-weight:500;color:#718096;text-decoration:none}
#g-nav .g-links a:hover{color:#1A202C}
#g-nav .g-links a.active{font-weight:600;color:#1A202C;background:#EEF2FF}
#g-nav .g-user{display:flex;align-items:center;gap:10px;padding-left:10px;margin-left:4px;border-left:1px solid #E2E8F0}
#g-nav .g-email{font-size:13px;color:#1A202C;font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#g-nav .g-logout{margin:0}
#g-nav .g-logout button{font:inherit;font-size:13px;font-weight:500;color:#718096;background:none;border:1px solid #E2E8F0;border-radius:6px;padding:7px 12px;cursor:pointer}
#g-nav .g-logout button:hover{color:#1A202C;border-color:#CBD5E1}
</style>
<nav id="g-nav"><div class="g-bar">
  <a class="g-brand" href="/"><b>Grounded: AI&nbsp;Legal</b><span>Global AI lawsuits &amp; regulations tracker</span></a>
  <div class="g-links">
    <a href="/">Home</a>
    <a href="/legal/lawsuits">Lawsuits</a>
    <a href="/legal/regulations">Regulations</a>
    <a href="/legal/explore">Connections</a>
    <a href="/legal/use-cases">Use cases</a>
    <a href="/tools/">Tools</a>
    <a href="/legal/sources">Sources</a>
    <a href="/legal/submit">Submit</a>
    <a href="/nodes/" class="active">Nodes</a>
    <span class="g-user">
      <span class="g-email" title="__GROUNDED_USER__">__GROUNDED_USER__</span>
      <form class="g-logout" method="POST" action="/api/auth/logout"><button type="submit">Sign out</button></form>
    </span>
  </div>
</div></nav>`;

// ── "Run it on your own computer" footer, injected only in hosted mode ──────
// A newsroom that tried the hosted app can switch to running it locally (their
// data then stays on their machine). Same one-command install as the front
// door. Absolute install URLs work on this domain.
const LOCAL_FOOTER_HTML = `<style>
#g-local{background:#0d0c0a;border-top:2px solid #c4761b;color:#ede4d3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:34px 26px 44px}
#g-local .gl-wrap{max-width:1180px;margin:0 auto}
#g-local h3{font-size:19px;font-weight:600;margin:0 0 6px}
#g-local p{color:#a89e88;font-size:14px;margin:0 0 18px;max-width:70ch}
#g-local .gl-row{display:grid;grid-template-columns:78px 1fr auto;gap:10px;align-items:center;margin-bottom:8px}
#g-local .gl-os{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#a89e88}
#g-local code{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12.5px;background:#1c1a14;color:#e8a13a;border:1px solid #3a352a;border-radius:5px;padding:10px 12px;overflow-x:auto;white-space:nowrap}
#g-local .gl-copy{font-family:inherit;font-size:12px;background:#1c1a14;color:#ede4d3;border:1px solid #3a352a;border-radius:5px;padding:9px 13px;cursor:pointer}
#g-local .gl-copy:hover{border-color:#c4761b;color:#e8a13a}
#g-local .gl-note{margin-top:16px;font-size:13px;color:#a89e88}
#g-local .gl-note a{color:#e8a13a;text-decoration:none}
#g-local .gl-note a:hover{text-decoration:underline}
@media(max-width:640px){#g-local .gl-row{grid-template-columns:1fr;gap:5px}}
</style>
<footer id="g-local"><div class="gl-wrap">
  <h3>Prefer to run it on your own computer?</h3>
  <p>Everything here also runs locally, on your own machine &mdash; your data never leaves your computer. Paste one line into your computer's built-in terminal; nothing to install by hand.</p>
  <div class="gl-row"><span class="gl-os">macOS</span><code id="gl-mac">curl -fsSL https://grounded.developai.co.za/nodes/analytics/mac | bash</code><button class="gl-copy" data-t="gl-mac">Copy</button></div>
  <div class="gl-row"><span class="gl-os">Windows</span><code id="gl-win">irm https://grounded.developai.co.za/nodes/analytics/windows | iex</code><button class="gl-copy" data-t="gl-win">Copy</button></div>
  <p class="gl-note">Or <a href="/nodes/">see all Nodes</a> &middot; <a href="https://github.com/pauldevelopai/node-analytics" target="_blank" rel="noopener">get the code on GitHub</a>.</p>
</div>
<script>
document.querySelectorAll('#g-local .gl-copy').forEach(function(b){
  b.addEventListener('click', function(){
    var el=document.getElementById(b.getAttribute('data-t'));
    try{ navigator.clipboard.writeText(el.textContent.trim()); }catch(e){}
    var o=b.textContent; b.textContent='Copied'; setTimeout(function(){b.textContent=o;},1300);
  });
});
</script></footer>`;

const escHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Built once; the per-user email is substituted per request in pageFor().
const INDEX_HTML = readFileSync(join(__dirname, "public", "index.html"), "utf8")
  .replace("<body>", `<body>\n${NAV_HTML}`)
  .replace("</body>", `${LOCAL_FOOTER_HTML}\n</body>`);

const pageFor = (user) => INDEX_HTML.replace(/__GROUNDED_USER__/g, escHtml(user && user.email));

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_COOKIE = process.env.AUTH_COOKIE || "tracker_token";
const LOGIN_URL = process.env.LOGIN_URL || "/login";
// Public path of this app, used as ?next= so the tracker login returns the user
// HERE after sign-in (Caddy strips the /nodes/analytics/app prefix before the
// request reaches us, so we can't derive it from the request — hence a default).
// Must be an in-app path starting with "/" (the tracker login only honours those).
const APP_URL = process.env.APP_URL || "/nodes/analytics/app/";

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
  const cookies = req.cookies || {};
  // The tracker has renamed its auth cookie across rebrands (holly_token →
  // tracker_token → ...). Rather than depend on one name, accept whichever
  // cookie carries a token our shared JWT_SECRET can verify. AUTH_COOKIE is
  // tried first; unrelated cookies (e.g. AIKit's) simply won't verify and are
  // skipped. Override/disable the name guess with AUTH_COOKIE if needed.
  const names = [AUTH_COOKIE, ...Object.keys(cookies)].filter((n, i, a) => n && a.indexOf(n) === i);
  let sawToken = false;
  for (const name of names) {
    const token = cookies[name];
    if (!token) continue;
    sawToken = true;
    try { return jwt.verify(token, JWT_SECRET); } catch { /* try the next cookie */ }
  }
  if (sawToken) {
    // A token arrived but none verified — almost always a JWT_SECRET mismatch
    // with the secret the tracker SIGNS with.
    console.warn(`[auth] cookie(s) present (${Object.keys(cookies).join(", ")}) but none verified with ` +
      `JWT_SECRET — does this app's JWT_SECRET match the tracker's config.jwtSecret?`);
  }
  return null;
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
    // Format detection + parsing (docx table / doc+pdf via AI) lives in
    // ingestMatrix so local and hosted behave identically; we just log here.
    console.log(`[ingest] name="${req.file.originalname}" type="${req.file.mimetype}" size=${req.file.buffer.length}B`);
    const out = await handlers.postIngest(hostFor(req), {
      buffer: req.file.buffer,
      sourceLabel: (req.body && req.body.sourceLabel) || req.file.originalname.replace(/\.[^.]+$/, "")
    });
    res.json(out);
  } catch (e) {
    console.error("[ingest] failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Static assets are public (just frontend code). The page itself is gated:
// signed-out visitors are bounced to holly's existing login and returned here.
app.use(express.static(join(__dirname, "public"), { index: false }));
app.get("*", (req, res) => {
  const user = readUser(req);
  if (!user) {
    // Diagnostic (names only, never values): if this shows the cookie IS
    // present but we still bounce, it's a JWT_SECRET mismatch (see readUser);
    // if it shows AUTH_COOKIE is not the tracker's cookie, the process is
    // running old code or a stale AUTH_COOKIE env.
    const present = Object.keys(req.cookies || {});
    console.log(`[auth] bounce → login. expecting '${AUTH_COOKIE}'; cookies received: ${present.join(", ") || "(none)"}`);
    const next = APP_URL ? `?next=${encodeURIComponent(APP_URL)}` : "";
    return res.redirect(`${LOGIN_URL}${next}`);
  }
  res.type("html").send(pageFor(user));
});

app.listen(PORT, () => {
  console.log(`\n  Audience Signal (hosted, multi-tenant) listening on http://localhost:${PORT}\n`);
});
