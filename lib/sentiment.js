/**
 * lib/sentiment.js — offline emotional framing of headlines (AFINN-165).
 *
 * Scores each headline's valence by summing AFINN word/phrase scores (−5..+5),
 * fully offline — no API, no cost (see lib/data/AFINN-165.LICENSE.md). Then
 * groups stories into negative / neutral / positive and reports which framing
 * the audience rewards, with a significance test so it's a finding, not a hunch.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tokenize } from "./text.js";
import { mannWhitney } from "./stats.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = JSON.parse(readFileSync(join(__dirname, "data/afinn-165.json"), "utf8"));

// Split the lexicon into single words (fast map lookup) and multi-word phrases
// (scanned against the normalised headline). Normalise both sides with the same
// tokenizer so "can't stand" matches "cant stand".
const WORDS = new Map();
const PHRASES = [];
for (const [key, score] of Object.entries(RAW)) {
  const toks = tokenize(key);
  if (toks.length === 1) WORDS.set(toks[0], score);
  else if (toks.length > 1) PHRASES.push({ key: toks.join(" "), score });
}

/** Raw sentiment of a headline: { score, hits } (sum of matched valences). */
export function scoreSentiment(text) {
  const toks = tokenize(text);
  let score = 0, hits = 0;
  for (const t of toks) {
    const v = WORDS.get(t);
    if (v !== undefined) { score += v; hits++; }
  }
  if (PHRASES.length && toks.length > 1) {
    const joined = ` ${toks.join(" ")} `;
    for (const p of PHRASES) {
      if (joined.includes(` ${p.key} `)) { score += p.score; hits++; }
    }
  }
  return { score, hits };
}

/** Coarse label for grouping: 'negative' | 'neutral' | 'positive'. */
export function sentimentLabel(text) {
  const { score } = scoreSentiment(text);
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

const ORDER = ["negative", "neutral", "positive"];

/**
 * Group stories by headline sentiment and report median rate per group, plus
 * whether positive vs negative framing differs significantly.
 * @returns {{ groups: object[], negativeVsPositive: object|null }}
 */
export function sentimentSignal(data) {
  const rows = Array.isArray(data) ? data : [];
  const by = { negative: [], neutral: [], positive: [] };
  for (const r of rows) by[sentimentLabel(r.title)].push(r);

  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const groups = ORDER
    .map(label => {
      const g = by[label];
      if (!g.length) return null;
      return {
        label,
        n: g.length,
        medianRate: +median(g.map(d => d.rate)).toFixed(2),
        medianReach: Math.round(median(g.map(d => d.reach)))
      };
    })
    .filter(Boolean);

  const neg = by.negative, pos = by.positive;
  let negativeVsPositive = null;
  if (neg.length >= 3 && pos.length >= 3) {
    negativeVsPositive = {
      negRate: +median(neg.map(d => d.rate)).toFixed(2),
      posRate: +median(pos.map(d => d.rate)).toFixed(2),
      significant: mannWhitney(neg.map(d => d.rate), pos.map(d => d.rate)).significant
    };
  }
  return { groups, negativeVsPositive };
}
