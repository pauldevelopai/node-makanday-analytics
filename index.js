/**
 * Audience Signal — the Node's entry point.
 *
 * The whole boot. Everything interesting lives in lib/ (analytics, beats,
 * ingest, handlers) and public/ (the dashboard). The runtime handles
 * routing, file uploads, and serving.
 *
 * Branding is newsroom-driven: set NEWSROOM in the environment to label the
 * dashboard (e.g. NEWSROOM="MakanDay"). Once set it's remembered in the Node's
 * meta, so it sticks across restarts even without the env var. Unset and never
 * seen before → the dashboard shows the plain product name.
 */

import "dotenv/config";

// Claude-only. The runtime is provider-flexible (it would auto-pick OpenAI if
// an OPENAI_API_KEY is lying around in the environment) — pin it to Anthropic
// so this Node always runs on Claude.
process.env.AI_PROVIDER = "anthropic";

import { createLiteHost, createServer } from "@developai/grounded-node-runtime";
import * as handlers from "./lib/handlers.js";
import { mountAnalyticsRoutes } from "./lib/routes.js";
import { maybeSendBeacon } from "./lib/beacon.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const SLUG = "analytics";
const PRODUCT = "Audience Signal";

const host = createLiteHost({
  appSlug: SLUG,
  nodeVersion: pkg.version,
  newsroom: process.env.NEWSROOM,   // undefined → falls back to saved meta, then null
});

const newsroom = host.meta?.newsroom;

const app = createServer({
  slug: SLUG,
  host,
  handlers,
  displayName: newsroom ? `${newsroom} ${PRODUCT}` : PRODUCT,
  nodeVersion: pkg.version,
});

// Custom routes (context, sources, links, scrape, recommend). Same per-request
// host signature as hosted; here it's the one fixed lite host.
mountAnalyticsRoutes(app, () => host);

// Identified local-install telemetry — ON by default; opt out with
// GROUNDED_TELEMETRY=off. Fire-and-forget: never blocks or breaks the app.
// Sends only an install id, version, OS, the newsroom name, and activity
// counts — never story content.
maybeSendBeacon({ host, slug: SLUG }).catch(() => {});
