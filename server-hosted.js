/**
 * server-hosted.js — the ONLINE (multi-tenant) entry for Audience Signal.
 *
 * All the plumbing (tracker-cookie auth, per-request Postgres host, the standard
 * route map, and the injected GROUNDED nav / "run it locally" footer / feedback
 * widget) now lives in the shared runtime's createHostedServer — so this is just
 * the Node's identity + its handlers + its schema. The LOCAL entry (index.js)
 * is the mirror of this for the lite host.
 *
 * Env (box .env, never committed): JWT_SECRET (matches the tracker's),
 * ANTHROPIC_API_KEY (shared), DATABASE_URL or PG*. Optional: PORT, AUTH_COOKIE,
 * LOGIN_URL, APP_URL, MODEL.
 */

import dotenv from "dotenv";
dotenv.config({ override: true }); // the box's .env wins over any stale pm2 env

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHostedServer } from "@developai/grounded-node-runtime";
import * as handlers from "./lib/handlers.js";
import { ensureSchema } from "./lib/schema.js";
import { mountAnalyticsRoutes } from "./lib/routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

await createHostedServer({
  slug: "analytics",
  productName: "Audience Signal",
  handlers,
  ensureSchema,
  // Custom routes (per-request newsroom-scoped host) + the no-cache app shell.
  mountRoutes: (app, { hostFor }) => mountAnalyticsRoutes(app, hostFor),
  nodeVersion: pkg.version,
  staticDir: join(__dirname, "public"),
});
