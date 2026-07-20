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
import { getExtras, listSourceMeta } from "./store.js";
import { getContext, formatContextForPrompt } from "./context.js";
import { saveHistory, snapshotMetrics } from "./history.js";

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
  // When a story has been scraped (#6), fit on title + a short excerpt of the real
  // article — richer signal than the headline alone → finer, more accurate beats.
  const inputs = rows.map(r => r.article_text
    ? `${r.title} — ${String(r.article_text).replace(/\s+/g, " ").slice(0, 200)}`
    : r.title);
  const list = await deriveBeats(host, inputs);
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
  const order = ["ANTHROPIC_API_KEY", "AI_PROVIDER", "MODEL", "PORT"];
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
      activeProvider: "anthropic",
      newsroom: host.meta?.newsroom || null,
      productName: "Audience Signal"
    };
  }
  // This Node runs on Claude only (the runtime is provider-flexible, but
  // Grounded is newsroom-owned AI on Anthropic — index.js pins AI_PROVIDER).
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  return {
    configured: hasAnthropic,
    activeProvider: hasAnthropic ? "anthropic" : null,
    hasAnthropicKey: hasAnthropic,
    // Branding for the dashboard — newsroom is the sticky meta identity
    // (NEWSROOM env on first boot, then remembered); product name is fixed.
    newsroom: host.meta?.newsroom || null,
    productName: "Audience Signal",
    activityFile: `data/processed/${host.tablePrefix}activity.json`
  };
}

// Live key check — a zero-cost GET to Anthropic's models endpoint. 200 = the
// key works; 401/403 = rejected; anything else / network = couldn't verify (we
// still save, so an offline newsroom isn't blocked). Does NOT go through host.ai
// (whose client is built once and cached), so it's accurate even when changing a key.
async function validateKey(key) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, rejected: true };
    return { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, network: true, error: e.message };
  }
}

/** POST — validate + save the Anthropic API key to .env. Local-only.
 *  Returns { ok, message?, verified?, warning?, reset? } (never throws) so the
 *  browser can show clear feedback. Online it's a no-op (one shared .env).
 *  Claude-only: a legacy OPENAI_API_KEY in .env is actively cleared on save. */
export async function postSetup(host, body) {
  if (isHosted(host)) {
    return { ok: false, serverManaged: true, message: "The AI key is managed centrally for the hosted version — nothing to set here." };
  }
  const { provider, apiKey } = body || {};
  if (provider === null && apiKey === null) {
    writeEnvFile({ ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", AI_PROVIDER: "" });
    return { ok: true, reset: true };
  }
  if (provider !== undefined && provider !== "anthropic") {
    return { ok: false, message: "This Node runs on Claude — paste an Anthropic key (it starts with sk-ant-)." };
  }
  const key = (apiKey || "").trim();
  if (key.length < 10) return { ok: false, message: "Paste your API key into the key box." };
  if (!/^sk-ant-/.test(key)) return { ok: false, message: 'That doesn’t look like an Anthropic key — it should start with "sk-ant-".' };

  const v = await validateKey(key);
  if (v.rejected) {
    return { ok: false, message: "That key was rejected by Anthropic. Check you copied the whole key." };
  }

  // Pin the provider and clear any legacy OpenAI key (older installs had both).
  writeEnvFile({ ANTHROPIC_API_KEY: key, AI_PROVIDER: "anthropic", OPENAI_API_KEY: "" });
  await host.log.run({ op: "setup", provider: "anthropic", verified: !!v.ok });
  return {
    ok: true,
    provider: "anthropic",
    verified: !!v.ok,
    warning: v.network ? "Saved — but we couldn’t reach Anthropic to confirm it (no internet?). It’ll be used when you run something." : null,
  };
}

async function loadRows(host, sourceLabel) {
  const t = `${T(host)}stories`;
  const sql = sourceLabel
    ? `SELECT n,title,month,story_date,reach,engagement,type,source_label
         FROM ${t} WHERE newsroom_id = $1 AND source_label = $2 ORDER BY n`
    : `SELECT n,title,month,story_date,reach,engagement,type,source_label
         FROM ${t} WHERE newsroom_id = $1 ORDER BY n`;
  const res = await host.db.query(t, sql, sourceLabel ? [sourceLabel] : []);
  const rows = res.rows.map(r => ({
    n: r.n, title: r.title, month: r.month, date: r.story_date,
    reach: r.reach, engagement: r.engagement, type: r.type, source_label: r.source_label
  }));
  // Merge the per-source enrichment overlay (url, readership, scraped text) kept
  // in host.store — keyed by (source_label, n). Works on both hosts.
  const labels = sourceLabel ? [sourceLabel] : [...new Set(rows.map(r => r.source_label).filter(Boolean))];
  const extrasByLabel = {};
  for (const l of labels) extrasByLabel[l] = await getExtras(host, l).catch(() => ({}));
  return rows.map(r => {
    const e = (extrasByLabel[r.source_label] || {})[r.n];
    if (!e) return r;
    return {
      ...r,
      url: e.url || null,
      unique_readers: e.unique_readers ?? null,
      pageviews: e.pageviews ?? null,
      article_text: e.article_text || null,
      scraped_at: e.scraped_at || null,
      scrape_status: e.scrape_status || null,
    };
  });
}

/** GET — list ingested sources for this newsroom (with provenance metadata). */
export async function listSources(host) {
  const t = `${T(host)}stories`;
  const res = await host.db.query(
    t,
    `SELECT source_label, COUNT(*)::int AS n
       FROM ${t} WHERE newsroom_id = $1 GROUP BY source_label ORDER BY source_label`
  );
  const meta = await listSourceMeta(host).catch(() => ({}));
  return res.rows.map(r => ({ ...r, ...(meta[r.source_label] || {}) }));
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
    // Record a dated snapshot of the audience picture after this data landed, so the
    // history shows how the numbers moved over time — not just the AI outputs. Best-effort:
    // a snapshot failure must never fail the ingest.
    try {
      const rows = await loadRows(host, sourceLabel || "matrix");
      const { beats } = await loadBeats(host);
      await saveHistory(host, {
        kind: "snapshot",
        source: sourceLabel || "matrix",
        title: `Data updated — ${result.storyCount} stories`,
        metrics: snapshotMetrics(fullReport(rows, beats)),
      });
    } catch { /* snapshot is best-effort */ }
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
  // Ground in the shared cross-node newsroom profile (host.profile) — location,
  // audience, focus — so the brief reads the data in the newsroom's real context.
  const profile = await getContext(host).catch(() => null);
  const profileBlock = profile ? `## This newsroom (ground your brief in this)\n${formatContextForPrompt(profile)}\n\n` : "";
  const prompt =
    `You are an editorial-intelligence analyst briefing ${who}. Below is owned-data audience resonance — what their existing audience already rewards.\n\n${profileBlock}${ctx}\n\n` +
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
  // Keep it, with the audience snapshot it was based on, so it's reviewable later.
  await saveHistory(host, { kind: "brief", source: source || "all", title: "Editorial brief", body: text, metrics: snapshotMetrics(r) });
  return { brief: text, usedFallback: !!usedFallback };
}

/**
 * POST — forward-looking AI recommendations (#9): what topics to follow and where
 * to put editorial resources for maximum audience engagement. Grounded in this
 * newsroom's OWN audience data + its geography/audience context + (when stories
 * have been scraped) the actual article gists. Mounted via lib/routes.js.
 */
export async function recommend(host, { source } = {}) {
  const startedAt = Date.now();
  const rows = await loadRows(host, source);
  if (!rows.length) throw new Error("nothing ingested");
  const { beats } = await loadBeats(host);
  const r = fullReport(rows, beats);
  const context = await getContext(host).catch(() => null);

  // Readership rollup (only when the data carries it — truer than boosted reach).
  const hasU = rows.some(x => x.unique_readers != null);
  const hasPV = rows.some(x => x.pageviews != null);
  const sum = k => rows.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  let readership = "";
  if (hasU || hasPV) {
    const parts = [`total reach ${sum("reach")}`];
    if (hasU) parts.push(`unique readers ${sum("unique_readers")}`);
    if (hasPV) parts.push(`pageviews ${sum("pageviews")}`);
    readership = `\nREADERSHIP (truer than boosted reach): ${parts.join(", ")}.`;
  }
  // Article gists, when stories have been scraped (#6) — lets the model reason
  // over substance, not just headlines. Bounded hard for token cost.
  const gists = rows.filter(x => x.article_text).slice(0, 6)
    .map(x => `"${x.title}": ${String(x.article_text).replace(/\s+/g, " ").slice(0, 220)}`).join("\n");

  const ctx = [
    `${r.topline.stories} stories. Metric = engagement RATE (engagement ÷ reach); raw reach is inflated by boosting/algorithm.`,
    `\nBEATS (median rate%):\n` + r.byBeat.map(b => `${b.beat}: n=${b.n}, rate ${b.medianRate}%`).join("\n"),
    `\nTOP BY RATE:\n` + r.signalLeaders.slice(0, 8).map(d => `"${d.title}" — ${d.rate.toFixed(2)}% (reach ${d.reach})`).join("\n"),
    `\nLOUD BUT WEAK:\n` + r.reachGiants.slice(0, 6).map(d => `"${d.title}" — reach ${d.reach}, ${d.rate.toFixed(2)}%`).join("\n"),
    `\nRISING/FADING:\n` + r.risingFading.map(x => `${x.beat}: ${x.earlyRate}%→${x.lateRate}% (${x.direction})`).join("\n"),
    `\nFORMAT:\n` + r.byFormat.map(f => `${f.type}: n=${f.n}, ${f.medianRate}%`).join("\n"),
    `\nWORDS THAT LIFT:\n` + (r.wordSignal?.lifters || []).slice(0, 6).map(t => `"${t.term}" +${t.lift}pts`).join("\n"),
    readership,
    gists ? `\nSTORY GISTS (from the actual articles):\n${gists}` : "",
  ].join("\n");

  const contextBlock = context ? `## This newsroom (ground every recommendation in this)\n${formatContextForPrompt(context)}\n\n` : "";
  const newsroom = host.meta?.newsroom;
  const who = newsroom ? `the editor of ${newsroom}` : "a newsroom editor";
  const prompt =
    `You are an audience-strategy analyst advising ${who}. Using ONLY this newsroom's own audience data (what their real audience already rewards) and their context below, recommend where to put editorial resources for maximum audience engagement going forward.\n\n` +
    contextBlock + ctx + `\n\n` +
    `Be specific and decisive — name actual beats/topics/formats from the data, tie each to the evidence, and respect the newsroom's location and audience. Exact section headers, each prefixed "## ":\n` +
    `## Topics to double down on\n## Topics to drop or rethink\n## Where to put resources\n## What to test next\n\n` +
    `2-4 tight sentences or "- " bullets per section. No preamble, no data-quality caveats. Under 360 words.`;

  const { text, usedFallback, provider, model } = await host.ai.chat(prompt, { maxTokens: 1200 });
  await host.log.run({
    op: "recommend", source: source || "all", provider, model,
    duration_ms: Date.now() - startedAt, used_fallback: !!usedFallback,
    prompt, response: text, success: true,
  });
  await saveHistory(host, { kind: "recommend", source: source || "all", title: "Strategy recommendations", body: text, metrics: snapshotMetrics(r) });
  return { recommendations: text, usedFallback: !!usedFallback };
}

/**
 * POST — concrete story ideas: what to write NEXT, generated from what this
 * newsroom's audience has already rewarded. Where recommend() advises strategy
 * (which beats/formats to resource), this pitches actual commissionable
 * stories — each tied to the past winners, rising beats, and lifting words
 * that justify it. Mounted via lib/routes.js (POST /api/ideas).
 */
export async function storyIdeas(host, { source, count } = {}) {
  const startedAt = Date.now();
  const rows = await loadRows(host, source);
  if (!rows.length) throw new Error("nothing ingested");
  const n = Math.min(10, Math.max(3, Number(count) || 6));
  const { beats } = await loadBeats(host);
  const r = fullReport(rows, beats);
  const context = await getContext(host).catch(() => null);

  // Article gists when stories have been scraped (#6) — ideas grounded in the
  // substance of what worked, not just its headline. Bounded for token cost.
  const gists = rows.filter(x => x.article_text).slice(0, 6)
    .map(x => `"${x.title}": ${String(x.article_text).replace(/\s+/g, " ").slice(0, 220)}`).join("\n");

  const bestDay = (r.weekday?.days || [])[0];
  const ctx = [
    `${r.topline.stories} stories. Metric = engagement RATE (engagement ÷ reach); newsroom median ${r.topline.medianRate.toFixed(2)}%.`,
    `\nWHAT WORKED — TOP BY RATE (the audience's proven appetite):\n` +
      r.signalLeaders.slice(0, 10).map(d => `"${d.title}" — ${d.rate.toFixed(2)}% (beat: ${(d.beats || [])[0] || "?"}, reach ${d.reach})`).join("\n"),
    (r.quadrants?.hiddenGems || []).length
      ? `\nHIDDEN GEMS (resonated hard but barely promoted — undervalued appetite):\n` +
        r.quadrants.hiddenGems.slice(0, 5).map(d => `"${d.title}" — ${d.rate.toFixed(2)}%`).join("\n")
      : "",
    `\nBEATS (median rate%):\n` + r.byBeat.slice(0, 10).map(b => `${b.beat}: ${b.medianRate}% (n=${b.n})`).join("\n"),
    `\nRISING/FADING:\n` + r.risingFading.map(x => `${x.beat}: ${x.earlyRate}%→${x.lateRate}% (${x.direction})`).join("\n"),
    `\nWORDS THAT LIFT RATE:\n` + (r.wordSignal?.lifters || []).slice(0, 8).map(t => `"${t.term}" +${t.lift}pts`).join("\n"),
    `\nFORMAT:\n` + r.byFormat.map(f => `${f.type}: ${f.medianRate}% (n=${f.n})`).join("\n"),
    bestDay ? `\nBEST DAY: ${bestDay.day} (median ${bestDay.medianRate.toFixed(2)}%)` : "",
    r.sentiment?.negativeVsPositive
      ? `\nFRAMING: negative-framed ${r.sentiment.negativeVsPositive.negRate}% vs positive ${r.sentiment.negativeVsPositive.posRate}%`
      : "",
    gists ? `\nSTORY GISTS (from the actual articles):\n${gists}` : "",
  ].filter(Boolean).join("\n");

  const contextBlock = context ? `## This newsroom (every idea must fit this)\n${formatContextForPrompt(context)}\n\n` : "";
  const newsroom = host.meta?.newsroom;
  const who = newsroom ? `the editor of ${newsroom}` : "a newsroom editor";
  const prompt =
    `You are a commissioning editor pitching to ${who}. Below is evidence of what their audience has ALREADY rewarded — their own published stories ranked by engagement rate.\n\n` +
    contextBlock + ctx + `\n\n` +
    `Pitch exactly ${n} NEW story ideas this newsroom should commission next. Rules:\n` +
    `- Every idea must be traceable to the evidence above — extend a proven winner, dig deeper into a high-rate beat, or ride a rising trend. Never invent an appetite the data doesn't show.\n` +
    `- NEW reporting, not rewrites or updates of the listed stories.\n` +
    `- Ideas must be realistically reportable by a small newsroom, and fit its location and audience.\n` +
    `- Working headlines should use the newsroom's own high-lift words where they fit naturally.\n\n` +
    `Format each idea EXACTLY like this (repeat ${n} times, no preamble, no closing note):\n` +
    `## <working headline>\n` +
    `- **The story:** one or two sentences on the angle and who it affects.\n` +
    `- **Why it will land:** the specific evidence — name the past story, beat rate, or word signal that justifies it.\n` +
    `- **Format & timing:** the format the data favours and, if known, the best publish day.`;

  const { text, usedFallback, provider, model } = await host.ai.chat(prompt, { maxTokens: 1600 });
  await host.log.run({
    op: "ideas", source: source || "all", provider, model,
    duration_ms: Date.now() - startedAt, used_fallback: !!usedFallback,
    prompt, response: text, success: true,
  });
  await saveHistory(host, { kind: "ideas", source: source || "all", title: `Story ideas (${n})`, body: text, metrics: snapshotMetrics(r) });
  return { ideas: text, usedFallback: !!usedFallback };
}
