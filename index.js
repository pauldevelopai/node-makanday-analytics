/**
 * MakanDay Audience Signal — the Node's entry point.
 *
 * The whole boot. Everything interesting lives in lib/ (analytics, beats,
 * ingest, handlers) and public/ (the dashboard). The runtime handles
 * routing, file uploads, and serving.
 */

import "dotenv/config";
import { createLiteHost, createServer } from "@developai/grounded-node-runtime";
import * as handlers from "./lib/handlers.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const SLUG = "makanday-analytics";

createServer({
  slug: SLUG,
  host: createLiteHost({
    appSlug: SLUG,
    nodeVersion: pkg.version,
    newsroom: process.env.NEWSROOM || "MakanDay",
  }),
  handlers,
  displayName: "MakanDay Audience Signal",
  nodeVersion: pkg.version,
});
