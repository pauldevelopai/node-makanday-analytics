/**
 * lib/wordsignal.js — which WORDS and PHRASES in your headlines move engagement.
 *
 * For every content word and two-word phrase that appears in enough headlines, we
 * compare the median engagement rate of stories that use it vs stories that don't,
 * and test whether the difference is statistically real (not just a few lucky
 * posts). The editor-facing payoff: "headlines with 'exposed' convert +1.8pts —
 * and it's a real effect, not noise."
 *
 * Pure and deterministic. Input is the enriched rows from analytics.enrich().
 */

import { unigrams, bigrams } from "./text.js";
import { mannWhitney } from "./stats.js";

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param {object[]} data   enriched rows (need title, rate, reach, engagement)
 * @param {object} opts
 * @param {number} opts.minStories  ignore terms rarer than this (default 4)
 * @param {number} opts.top         how many lifters / draggers to return (default 10)
 * @returns {{ lifters: object[], draggers: object[], minStories: number }}
 *   each term: { term, type:'word'|'phrase', n, withRate, withoutRate, lift, significant }
 */
export function wordSignal(data, { minStories = 4, top = 10 } = {}) {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length < minStories * 2) return { lifters: [], draggers: [], minStories };

  // term -> Set of row indices that contain it (presence per headline, not count).
  const buckets = new Map();   // term -> { type, idx:Set }
  rows.forEach((r, i) => {
    for (const w of unigrams(r.title)) add(buckets, w, "word", i);
    for (const p of bigrams(r.title)) add(buckets, p, "phrase", i);
  });

  const terms = [];
  for (const [term, { type, idx }] of buckets) {
    if (idx.size < minStories) continue;
    if (rows.length - idx.size < minStories) continue;   // need a comparison group too

    const withRates = [], withoutRates = [];
    rows.forEach((r, i) => (idx.has(i) ? withRates : withoutRates).push(r.rate));
    const withRate = +median(withRates).toFixed(2);
    const withoutRate = +median(withoutRates).toFixed(2);
    // Significance over STORIES (rank test on rates), not impressions.
    terms.push({
      term, type,
      n: idx.size,
      withRate, withoutRate,
      lift: +(withRate - withoutRate).toFixed(2),
      significant: mannWhitney(withRates, withoutRates).significant
    });
  }

  terms.sort((a, b) => b.lift - a.lift);
  // Prefer phrases and significant terms when trimming, but keep it simple: top/bottom by lift.
  const lifters = terms.filter(t => t.lift > 0).slice(0, top);
  const draggers = terms.filter(t => t.lift < 0).slice(-top).reverse();
  return { lifters, draggers, minStories };
}

function add(map, term, type, i) {
  let b = map.get(term);
  if (!b) { b = { type, idx: new Set() }; map.set(term, b); }
  b.idx.add(i);
}
