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

const SLUG = "makanday-analytics";

createServer({
  slug: SLUG,
  host: createLiteHost({ appSlug: SLUG }),
  handlers,
  displayName: "MakanDay Audience Signal"
});
