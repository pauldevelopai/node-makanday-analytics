/**
 * lib/scorer.js — predict a DRAFT headline's engagement rate from the newsroom's
 * own history. Turns Audience Signal from "what happened" into "what to publish".
 *
 * Transparent and additive (not a black box): start from the median rate, then
 * add the measured lift of each thing the draft has — its beat(s), headline shape
 * (question/number/quote…), known high/low-converting words, and emotional
 * framing. Every adjustment is shown to the editor, so they can see WHY. Pure;
 * reads the already-computed report sections.
 */

import { tagBeats, headlineFeatures, FALLBACK_BEAT } from "./beats.js";
import { unigrams, bigrams } from "./text.js";
import { sentimentLabel } from "./sentiment.js";

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

const FEATURE_LABEL = {
  hasQuestion: "a question (?)", hasQuote: "a quote", hasColon: "a colon (:)",
  hasNumber: "a number", isShouty: "ALL-CAPS",
};

/**
 * @param {string} draft   the draft headline
 * @param {object} report  a fullReport() result (needs topline, byBeat,
 *                         headlineSignal, wordSignal, sentiment, stories)
 * @param {object} beats   the taxonomy used for the report (so the draft tags the same way)
 * @returns {{ predictedRate, band, base, factors }} or { error } if no data
 */
export function scoreHeadline(draft, report, beats) {
  const text = String(draft || "").trim();
  if (!text) return { error: "Type a headline to score." };
  const stories = report?.stories || [];
  if (stories.length < 5) return { error: "Need at least 5 ingested stories to predict from." };

  const rates = stories.map(d => d.rate);
  const base = +percentile(rates, 50).toFixed(2);
  const factors = [];
  let predicted = base;

  // ── Beat(s) ──
  const draftBeats = tagBeats(text, beats).filter(b => b !== FALLBACK_BEAT);
  const beatRows = (report.byBeat || []).filter(b => draftBeats.includes(b.beat));
  if (beatRows.length) {
    const avg = beatRows.reduce((s, b) => s + (b.medianRate - base), 0) / beatRows.length;
    predicted += avg;
    factors.push({ label: `beat: ${beatRows.map(b => b.beat).join(", ")}`, delta: +avg.toFixed(2) });
  }

  // ── Headline shape ──
  const feats = headlineFeatures(text);
  for (const h of report.headlineSignal || []) {
    if (feats[h.feature]) {
      const delta = +(h.withRate - h.withoutRate).toFixed(2);
      if (delta) { predicted += delta; factors.push({ label: `has ${FEATURE_LABEL[h.feature] || h.feature}${h.significant ? " ★" : ""}`, delta }); }
    }
  }

  // ── Known words / phrases ──
  const terms = new Set([...unigrams(text), ...bigrams(text)]);
  const ws = report.wordSignal || { lifters: [], draggers: [] };
  for (const t of [...ws.lifters, ...ws.draggers]) {
    if (terms.has(t.term) && t.lift) {
      predicted += t.lift;
      factors.push({ label: `word “${t.term}”${t.significant ? " ★" : ""}`, delta: t.lift });
    }
  }

  // ── Sentiment framing ──
  const label = sentimentLabel(text);
  const grp = (report.sentiment?.groups || []).find(g => g.label === label);
  if (grp) {
    const delta = +(grp.medianRate - base).toFixed(2);
    if (delta) { predicted += delta; factors.push({ label: `${label} framing`, delta }); }
  }

  // Keep the prediction within the newsroom's observed range.
  predicted = Math.max(percentile(rates, 2), Math.min(predicted, percentile(rates, 98)));
  predicted = +predicted.toFixed(2);

  let band = "low";
  if (predicted >= percentile(rates, 90)) band = "exceptional";
  else if (predicted >= percentile(rates, 75)) band = "strong";
  else if (predicted >= percentile(rates, 50)) band = "solid";

  factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { predictedRate: predicted, band, base, factors };
}
