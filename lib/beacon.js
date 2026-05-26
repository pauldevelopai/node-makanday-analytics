/**
 * lib/beacon.js — opt-in, identified local-install telemetry.
 *
 * OFF by default. A newsroom turns it on by setting GROUNDED_TELEMETRY=on in
 * their .env. When on, the Node POSTs a tiny heartbeat to the GROUNDED tracker
 * on startup so Paul can see download / local-install activity in the Nodes
 * admin — the same view that already shows the hosted newsrooms.
 *
 * What it sends, and ONLY this:
 *   install_id        the sticky host_id the runtime already generates locally
 *   node_slug, node_version, runtime_version
 *   newsroom          the name set via NEWSROOM (identified — chosen model)
 *   os                coarse platform string (e.g. "darwin arm64 node v20.11")
 *   counts            # ingests / # briefs / # errors / # stories (integers)
 *   last_activity_at  timestamp of the most recent activity entry
 *
 * It NEVER sends story text, headlines, source names, file names, prompts,
 * responses, or API keys. Fire-and-forget with a short timeout: any failure is
 * swallowed so the beacon can never delay or break the app.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_URL = "https://grounded.developai.co.za/api/nodes/beacon";

function telemetryOn() {
  const v = String(process.env.GROUNDED_TELEMETRY || "").toLowerCase().trim();
  return v === "on" || v === "1" || v === "true" || v === "yes";
}

const readJson = (file, fallback) => {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback; }
  catch { return fallback; }
};

export async function maybeSendBeacon({ host, slug = "analytics", dataDir = "data/processed" } = {}) {
  if (!telemetryOn()) return { sent: false, reason: "telemetry off (default)" };
  try {
    const meta = host?.meta || {};
    if (!meta.host_id) return { sent: false, reason: "no install id" };

    // Local storage layout (lite host): ingests/briefs are entries in the
    // activity log; errors and stories live in their own files.
    const prefix = `node_${slug.replace(/-/g, "_")}_`;
    const f = (name) => join(process.cwd(), dataDir, `${prefix}${name}.json`);
    const activity = readJson(f("activity"), []);
    const errors   = readJson(f("errors"), []);
    const stories  = readJson(f("stories"), []);

    const isRun = (e, op) => e && e.kind === "run" && e.op === op;
    const counts = {
      ingests: activity.filter((e) => isRun(e, "ingest")).length,
      briefs:  activity.filter((e) => isRun(e, "brief")).length,
      errors:  Array.isArray(errors) ? errors.length : 0,
      story_count: Array.isArray(stories) ? stories.length : 0,
    };
    const last = Array.isArray(activity) && activity.length ? activity[activity.length - 1] : null;

    const payload = {
      install_id: meta.host_id,
      node_slug: slug,
      newsroom: meta.newsroom || null,
      node_version: meta.node_version || null,
      runtime_version: meta.runtime_version || null,
      os: meta.platform || null,
      counts,
      last_activity_at: (last && last.ts) || meta.last_boot || null,
    };

    const url = process.env.GROUNDED_TELEMETRY_URL || DEFAULT_URL;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}
