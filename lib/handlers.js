/**
 * lib/handlers.js
 * Framework-free handlers — same code runs standalone (host = lite) and
 * integrated into GROUNDED (host = facade). Auto-mounted by the runtime
 * at the standard route names matching each exported function.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fullReport } from "./analytics.js";
import { ingestMatrix } from "./ingest.js";
import { compileBeats } from "./beats.js";
import { deriveBeats } from "./ai-beats.js";
import { compareReports } from "./compare.js";
import { scoreHeadline } from "./scorer.js";

// Where a newsroom's AI-fitted beat taxonomy lives (host.store works the same in
// local JSON and hosted Postgres mode). Absent → reports use the generic default.
const BEATS_COLLECTION = "config";
const BEATS_KEY = "beats";

// Resolve the taxonomy for this newsroom: the stored AI-fitted one if present and
// still compiles, otherwise the generic default (compileBeats→null signals that).
async function loadBeats(host) {
  const stored = await host.store?.get(BEATS_COLLECTION, BEATS_KEY).catch(() => null);
  const compiled = stored && compileBeats(stored.beats);
  if (compiled) return { beats: compiled, source: "ai", names: Object.keys(compiled), fittedAt: stored.fittedAt || null };
  return { beats: undefined, source: "default", names: null, fittedAt: null };  // undefined → fullReport uses DEFAULT_BEATS
}

// Fit a taxonomy from the given rows' headlines and persist it. Throws on failure
// (no AI key / unclear headlines) so the caller can report it without losing data.
async function fitBeats(host, rows) {
  const list = await deriveBeats(host, rows.map(r => r.title));
  if (!compileBeats(list)) throw new Error("The AI returned no usable beats.");
  await host.store.put(BEATS_COLLECTION, BEATS_KEY, { beats: list, fittedAt: new Date().toISOString() });
  await host.log.run({ op: "fit_beats", beat_count: list.length, success: true }).catch(() => {});
  return list;
}

const T = host => host.tablePrefix;
const ENV_PATH = ".env";

// Hosted (multi-tenant) vs local (single-newsroom) mode. The pg host hardcodes
// runtime_version "hosted"; the lite host reports a real semver. Setup writes to
// a single shared .env + process.env, so it MUST be a no-op online — otherwise
// any logged-in newsroom could overwrite the shared API key for every tenant.
const isHosted = host => host?.meta?.runtime_version === "hosted";

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
  // Hosted mode: the AI key is server-managed (shared, central). Always report
  // configured so the dashboard skips the welcome form, and never expose which
  // keys the box holds.
  if (isHosted(host)) {
    return {
      configured: true,
      managed: true,
      activeProvider: (process.env.AI_PROVIDER || "anthropic").toLowerCase(),
      newsroom: host.meta?.newsroom || null,
      productName: "Audience Signal"
    };
  }
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

/** POST — save the chosen provider + API key to .env. Local-only. */
export async function postSetup(host, body) {
  // Refuse online: there is one shared .env / process.env for ALL tenants, so a
  // write here would clobber every newsroom's AI config. The key is managed by
  // the box operator, not by tenants.
  if (isHosted(host)) {
    throw new Error("The AI key is managed centrally for the hosted version — there's nothing to set up here.");
  }
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

/**
 * GET — full computed report for a source (defaults to all rows).
 * `fit` is an opt-in beat action triggered from the dashboard:
 *   fit=1 → fit the beat taxonomy to this newsroom's headlines (AI), then use it.
 *   fit=0 → forget the fitted taxonomy and revert to the generic default.
 * (A GET with a side effect, by necessity — the runtime only exposes query params
 * on this route; the action is always explicit and user-initiated.)
 */
export async function getReport(host, { source, fit, baseline, score } = {}) {
  const rows = await loadRows(host, source);
  if (!rows.length) return { empty: true };

  let beatsError = null;
  if (fit === "1" || fit === "on" || fit === "true") {
    try { await fitBeats(host, rows); }
    catch (e) {
      beatsError = e.message;
      await host.log.run({ op: "fit_beats", success: false, error: e.message }).catch(() => {});
    }
  } else if (fit === "0" || fit === "off" || fit === "false") {
    await host.store?.delete(BEATS_COLLECTION, BEATS_KEY).catch(() => {});
  }

  const { beats, source: beatsSource, names, fittedAt } = await loadBeats(host);
  const report = fullReport(rows, beats);
  // Headline scorer: predict a draft's rate from this newsroom's own history.
  if (score && String(score).trim()) report.scored = scoreHeadline(String(score), report, beats);
  report.beatsSource = beatsSource;   // "ai" | "default"
  report.beatNames = names;           // the fitted beat names, or null on default
  report.beatsFittedAt = fittedAt;
  if (beatsError) report.beatsError = beatsError;

  // Period-over-period: if a (different) baseline source is named, diff against it.
  if (baseline && baseline !== source) {
    const baseRows = await loadRows(host, baseline);
    if (baseRows.length) {
      report.comparison = compareReports(report, fullReport(baseRows, beats),
        { current: source || "all", baseline });
    }
  }
  return report;
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

/** GET — recent activity log (every ingest, brief, error). */
const ACTIVITY_LIMIT = 200;
export async function getActivity(host) {
  const t = `${T(host)}activity`;
  // The log grows for the life of the newsroom and the dashboard reloads it on
  // every render, so return only the most recent N. LIMIT bounds it in Postgres;
  // the JS slice bounds it in local mode too (the lite host ignores LIMIT). Fetch
  // one extra to detect (and flag) that older rows were dropped.
  const res = await host.db.query(
    t,
    `SELECT * FROM ${t} WHERE newsroom_id = $1 ORDER BY n DESC LIMIT $2`,
    [ACTIVITY_LIMIT + 1]
  ).catch(() => ({ rows: [] }));
  const ascending = [...res.rows].sort((a, b) => (a.n || 0) - (b.n || 0));
  return { activity: ascending.slice(-ACTIVITY_LIMIT), truncated: ascending.length > ACTIVITY_LIMIT };
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
  const { beats } = await loadBeats(host);
  const r = fullReport(rows, beats);

  const ctx = [
    `${r.topline.stories} stories. Metric = Facebook engagement RATE (engagement ÷ reach). Raw reach is inflated by boosting/algorithm; rate is the true resonance signal.`,
    `\nBEATS (median rate%):\n` + r.byBeat.map(b => `${b.beat}: n=${b.n}, rate ${b.medianRate}%, reach ${b.medianReach}`).join("\n"),
    `\nTOP BY RATE (reach-qualified — rate from stories that cleared ~${r.reachFloor} reach, so these aren't tiny-sample flukes):\n` + r.signalLeaders.slice(0, 8).map(d => `"${d.title}" — ${d.rate.toFixed(2)}% (reach ${d.reach})`).join("\n"),
    `\nLOUD BUT WEAK:\n` + r.reachGiants.slice(0, 6).map(d => `"${d.title}" — reach ${d.reach}, only ${d.rate.toFixed(2)}%`).join("\n"),
    `\nRISING/FADING:\n` + r.risingFading.map(x => `${x.beat}: ${x.earlyRate}% → ${x.lateRate}% (${x.direction})`).join("\n"),
    `\nFORMAT:\n` + r.byFormat.map(f => `${f.type}: n=${f.n}, ${f.medianRate}%`).join("\n"),
    `\nWORDS THAT LIFT RATE (median rate of headlines using the term vs not; ★ = statistically significant):\n` +
      (r.wordSignal?.lifters || []).slice(0, 6).map(t => `"${t.term}" +${t.lift}pts (n=${t.n})${t.significant ? " ★" : ""}`).join("\n"),
    r.sentiment?.negativeVsPositive
      ? `\nHEADLINE SENTIMENT: negative-framed ${r.sentiment.negativeVsPositive.negRate}% vs positive ${r.sentiment.negativeVsPositive.posRate}%` +
        `${r.sentiment.negativeVsPositive.significant ? " (significant)" : " (not significant)"}`
      : ""
  ].join("\n");

  // Newsroom-neutral: address the brief to the newsroom by name when we know it,
  // otherwise a generic editor — no baked-in region/genre (matches the generic
  // beats default).
  const newsroom = host.meta?.newsroom;
  const who = newsroom ? `the editor of ${newsroom}` : "a newsroom editor";
  const prompt =
    `You are an editorial-intelligence analyst briefing ${who}. Below is owned-data audience resonance — what their existing audience already rewards.\n\n${ctx}\n\n` +
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
