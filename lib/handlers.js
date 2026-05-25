/**
 * lib/handlers.js
 * Framework-free handlers — same code runs standalone (host = lite) and
 * integrated into GROUNDED (host = facade). Auto-mounted by the runtime
 * at the standard route names matching each exported function.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fullReport } from "./analytics.js";
import { ingestMatrix } from "./ingest.js";

const T = host => host.tablePrefix;
const ENV_PATH = ".env";

// ── Setup: in-app API-key configuration ─────────────────────────────────────
// Newsroom never has to edit .env by hand. Frontend calls getSetupStatus to
// decide whether to show the welcome form or the dashboard; postSetup writes
// the chosen key to .env and updates process.env in-process so the next AI
// call works without restarting the app.

function readEnvFile() {
  if (!existsSync(ENV_PATH)) return {};
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function writeEnvFile(updates) {
  const current = readEnvFile();
  const merged = { ...current, ...updates };
  const order = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AI_PROVIDER", "MODEL", "OPENAI_BASE_URL", "PORT"];
  const lines = [
    "# Saved by the in-app setup screen. Update through the app, not by editing this.",
    "# Keep this file private — it contains your API key. (Already in .gitignore.)",
    ""
  ];
  for (const k of order) {
    if (merged[k] !== undefined && merged[k] !== "") lines.push(`${k}=${merged[k]}`);
  }
  for (const k of Object.keys(merged)) {
    if (!order.includes(k) && merged[k]) lines.push(`${k}=${merged[k]}`);
  }
  writeFileSync(ENV_PATH, lines.join("\n") + "\n");
  // Apply live so the next chat() call picks up the new key without restart.
  for (const [k, v] of Object.entries(updates)) {
    if (v) process.env[k] = v; else delete process.env[k];
  }
}

/** GET — has the newsroom configured an API key yet? */
export async function getSetupStatus(host) {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const explicit = (process.env.AI_PROVIDER || "").toLowerCase();
  let activeProvider = null;
  if (explicit === "anthropic" || explicit === "openai") activeProvider = explicit;
  else if (hasAnthropic) activeProvider = "anthropic";
  else if (hasOpenAI) activeProvider = "openai";
  return {
    configured: !!activeProvider,
    activeProvider,
    hasAnthropicKey: hasAnthropic,
    hasOpenAIKey: hasOpenAI,
    // Branding for the dashboard — newsroom is the sticky meta identity
    // (NEWSROOM env on first boot, then remembered); product name is fixed.
    newsroom: host.meta?.newsroom || null,
    productName: "Audience Signal",
    activityFile: `data/processed/${host.tablePrefix}activity.json`
  };
}

/** POST — save the chosen provider + API key to .env. */
export async function postSetup(host, body) {
  const { provider, apiKey } = body || {};
  if (!["anthropic", "openai"].includes(provider)) {
    throw new Error("Pick Anthropic or OpenAI.");
  }
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
    throw new Error("Paste your API key into the key box.");
  }
  const key = apiKey.trim();
  const updates = { AI_PROVIDER: provider };
  if (provider === "anthropic") updates.ANTHROPIC_API_KEY = key;
  else updates.OPENAI_API_KEY = key;
  writeEnvFile(updates);
  await host.log.run({ op: "setup", provider, success: true });
  return { ok: true, provider };
}

async function loadRows(host, sourceLabel) {
  const t = `${T(host)}stories`;
  const sql = sourceLabel
    ? `SELECT n,title,month,story_date,reach,engagement,type
         FROM ${t} WHERE newsroom_id = $1 AND source_label = $2 ORDER BY n`
    : `SELECT n,title,month,story_date,reach,engagement,type
         FROM ${t} WHERE newsroom_id = $1 ORDER BY n`;
  const res = await host.db.query(t, sql, sourceLabel ? [sourceLabel] : []);
  return res.rows.map(r => ({
    n: r.n, title: r.title, month: r.month, date: r.story_date,
    reach: r.reach, engagement: r.engagement, type: r.type
  }));
}

/** GET — list ingested sources for this newsroom. */
export async function listSources(host) {
  const t = `${T(host)}stories`;
  const res = await host.db.query(
    t,
    `SELECT source_label, COUNT(*)::int AS n
       FROM ${t} WHERE newsroom_id = $1 GROUP BY source_label ORDER BY source_label`
  );
  return res.rows;
}

/** GET — full computed report for a source (defaults to all rows). */
export async function getReport(host, { source } = {}) {
  const rows = await loadRows(host, source);
  if (!rows.length) return { empty: true };
  return fullReport(rows);
}

/** GET — data-quality report (drives the mentoring conversation). */
export async function getQuality(host, { source } = {}) {
  const t = `${T(host)}quality`;
  const sql = source
    ? `SELECT * FROM ${t} WHERE newsroom_id = $1 AND source_label = $2
         ORDER BY ingested_at DESC LIMIT 1`
    : `SELECT * FROM ${t} WHERE newsroom_id = $1
         ORDER BY ingested_at DESC LIMIT 1`;
  const res = await host.db.query(t, sql, source ? [source] : []);
  return res.rows[0] || { empty: true };
}

/** GET — full activity log (every ingest, brief, error). */
export async function getActivity(host) {
  const t = `${T(host)}activity`;
  const res = await host.db.query(
    t,
    `SELECT * FROM ${t} WHERE newsroom_id = $1 ORDER BY n`
  ).catch(() => ({ rows: [] }));
  return { activity: res.rows };
}

/** POST — ingest an uploaded matrix buffer. */
export async function postIngest(host, { buffer, sourceLabel }) {
  if (!buffer) throw new Error("no file");
  const startedAt = Date.now();
  try {
    const result = await ingestMatrix(host, buffer, sourceLabel || "matrix");
    await host.log.run({
      op: "ingest",
      source: sourceLabel || "matrix",
      story_count: result.storyCount,
      errors: result.quality.errors,
      warnings: result.quality.warnings,
      uncategorised: result.quality.uncategorised,
      duration_ms: Date.now() - startedAt,
      success: true
    });
    return result;
  } catch (e) {
    await host.log.run({
      op: "ingest",
      source: sourceLabel || "matrix",
      duration_ms: Date.now() - startedAt,
      success: false,
      error: e.message
    });
    throw e;
  }
}

/** POST — AI editorial brief. Uses host.ai.chat (Haiku-only, logged, fallback). */
export async function postBrief(host, { source } = {}) {
  const startedAt = Date.now();
  const rows = await loadRows(host, source);
  if (!rows.length) throw new Error("nothing ingested");
  const r = fullReport(rows);

  const ctx = [
    `${r.topline.stories} stories. Metric = Facebook engagement RATE (engagement ÷ reach). Raw reach is inflated by boosting/algorithm; rate is the true resonance signal.`,
    `\nBEATS (median rate%):\n` + r.byBeat.map(b => `${b.beat}: n=${b.n}, rate ${b.medianRate}%, reach ${b.medianReach}`).join("\n"),
    `\nTOP BY RATE:\n` + r.signalLeaders.slice(0, 8).map(d => `"${d.title}" — ${d.rate.toFixed(2)}% (reach ${d.reach})`).join("\n"),
    `\nLOUD BUT WEAK:\n` + r.reachGiants.slice(0, 6).map(d => `"${d.title}" — reach ${d.reach}, only ${d.rate.toFixed(2)}%`).join("\n"),
    `\nRISING/FADING:\n` + r.risingFading.map(x => `${x.beat}: ${x.earlyRate}% → ${x.lateRate}% (${x.direction})`).join("\n"),
    `\nFORMAT:\n` + r.byFormat.map(f => `${f.type}: n=${f.n}, ${f.medianRate}%`).join("\n")
  ].join("\n");

  const prompt =
    `You are an editorial-intelligence analyst briefing the editor of an African investigative newsroom. Below is owned-data audience resonance — what their existing audience already rewards.\n\n${ctx}\n\n` +
    `Write a decisive brief. Exact section headers, each prefixed "## ":\n` +
    `## The signal\n## Commission more\n## Loud but hollow\n## Test next\n\n` +
    `2-4 tight sentences or "- " bullets per section. Name specific beats/patterns from the data. ` +
    `No preamble, no data-quality caveats. Under 320 words.`;

  const { text, usedFallback, provider, model } = await host.ai.chat(prompt, { maxTokens: 1000 });
  const durationMs = Date.now() - startedAt;
  await host.log.run({
    op: "brief",
    source: source || "all",
    provider, model,
    duration_ms: durationMs,
    used_fallback: !!usedFallback,
    prompt,                    // full prompt sent to the model
    response: text,            // full brief returned
    success: true
  });
  return { brief: text, usedFallback: !!usedFallback };
}
