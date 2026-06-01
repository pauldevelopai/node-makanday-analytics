// src/analytics.js
// Pure, deterministic analytics. No DOM, no IO, no side effects.
// Everything that drives the dashboard and the AI brief is computed here
// so it can be unit-tested and reused headlessly (cohort reports, etc).

import { BEATS, tagBeats, headlineFeatures } from "./beats.js";

export const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const MONTH_INDEX = Object.fromEntries(MONTH_ORDER.map((m, i) => [m.toLowerCase(), i]));

// Year-aware period for a row. The full date string ("3 March 2025") carries the
// year; the bare `month` field doesn't. Preferring the date is what keeps a
// matrix that spans a year boundary (Dec 2024 → Jan 2025) in true chronological
// order instead of sorting by month name alone. Returns null for undated rows.
export function periodOf(row) {
  const text = String(row?.date || row?.month || "");
  const monthMatch = text.match(/[A-Za-z]+/);
  if (!monthMatch) return null;
  const mi = MONTH_INDEX[monthMatch[0].toLowerCase()];
  if (mi === undefined) return null;
  const yearMatch = text.match(/\b(\d{4})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const mm = String(mi + 1).padStart(2, "0");
  const abbr = MONTH_ORDER[mi].slice(0, 3);
  return {
    year,
    monthIndex: mi,
    monthName: MONTH_ORDER[mi],
    // Sortable. Undated-year rows fall in a year-0 bucket, before any dated row —
    // deterministic, and they never silently merge into a real year's month.
    chrono: (year ?? 0) * 12 + mi,
    key: `${year ?? 0}-${mm}`,
    label: year ? `${abbr} ${year}` : abbr
  };
}

export function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// All distinct beat names present across already-tagged rows. Lets byBeat /
// risingFading work against ANY taxonomy (default or AI-fitted) without knowing
// its keys — they read the beats the rows were actually tagged with.
function beatNamesIn(data) {
  const seen = new Set();
  for (const d of data) for (const b of d.beats) seen.add(b);
  return [...seen];
}

// Enrich raw rows: engagement rate + beats + headline shape + rate band.
// `beats` is the taxonomy to tag against (default = generic DEFAULT_BEATS).
export function enrich(rows, beats = BEATS) {
  const rates = rows.map(r => (r.reach ? (r.engagement / r.reach) * 100 : 0));
  const bands = {
    p25: percentile(rates, 25),
    p50: percentile(rates, 50),
    p75: percentile(rates, 75),
    p90: percentile(rates, 90)
  };
  return rows.map(r => {
    const rate = r.reach ? (r.engagement / r.reach) * 100 : 0;
    let band = "low";
    if (rate >= bands.p90) band = "exceptional";
    else if (rate >= bands.p75) band = "strong";
    else if (rate >= bands.p50) band = "solid";
    return {
      ...r,
      rate,
      band,
      beats: tagBeats(r.title, beats),
      features: headlineFeatures(r.title),
      period: periodOf(r)
    };
  });
}

export function topline(data) {
  const reach = data.map(d => d.reach);
  return {
    stories: data.length,
    totalReach: reach.reduce((s, x) => s + x, 0),
    medianReach: Math.round(median(reach)),
    medianRate: +median(data.map(d => d.rate)).toFixed(2)
  };
}

export function byBeat(data) {
  return beatNamesIn(data)
    .map(b => {
      const s = data.filter(d => d.beats.includes(b));
      if (!s.length) return null;
      return {
        beat: b,
        n: s.length,
        medianRate: +median(s.map(d => d.rate)).toFixed(2),
        medianReach: Math.round(median(s.map(d => d.reach)))
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.medianRate - a.medianRate);
}

export function byFormat(data) {
  const types = [...new Set(data.map(d => d.type))];
  return types
    .map(t => {
      const s = data.filter(d => d.type === t);
      return {
        type: t,
        n: s.length,
        medianRate: +median(s.map(d => d.rate)).toFixed(2),
        medianReach: Math.round(median(s.map(d => d.reach)))
      };
    })
    .sort((a, b) => b.medianRate - a.medianRate);
}

// One bucket per real calendar month (year-aware), in chronological order.
// Undated rows have no period and are simply absent from the timeline.
export function timeline(data) {
  const buckets = new Map();
  for (const d of data) {
    if (!d.period) continue;
    const b = buckets.get(d.period.key) ||
      { key: d.period.key, label: d.period.label, chrono: d.period.chrono, rows: [] };
    b.rows.push(d);
    buckets.set(d.period.key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => a.chrono - b.chrono)
    .map(b => ({
      period: b.key,
      label: b.label,
      month: b.label,   // back-compat: the dashboard reads `month` as the bar label
      n: b.rows.length,
      medianRate: +median(b.rows.map(d => d.rate)).toFixed(2),
      medianReach: Math.round(median(b.rows.map(d => d.reach)))
    }));
}

// Owned-data "listening": which beats are heating up vs cooling.
// Split the published set chronologically in half, compare median rate.
export function risingFading(data) {
  // Only dated rows can be placed in time. Order by true chronology (year-aware),
  // so a Dec→Jan span splits correctly instead of by month name.
  const ordered = data
    .filter(d => d.period)
    .sort((a, b) => a.period.chrono - b.period.chrono || a.n - b.n);
  const mid = Math.floor(ordered.length / 2);
  const early = ordered.slice(0, mid);
  const late = ordered.slice(mid);
  return beatNamesIn(ordered)
    .map(b => {
      const e = early.filter(d => d.beats.includes(b));
      const l = late.filter(d => d.beats.includes(b));
      if (e.length < 2 || l.length < 2) return null;
      const er = median(e.map(d => d.rate));
      const lr = median(l.map(d => d.rate));
      return {
        beat: b,
        earlyRate: +er.toFixed(2),
        lateRate: +lr.toFixed(2),
        delta: +(lr - er).toFixed(2),
        direction: lr > er ? "rising" : "fading"
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.delta - a.delta);
}

// Does headline shape correlate with resonance? Editor-actionable.
export function headlineSignal(data) {
  const keys = ["hasQuestion", "hasQuote", "hasColon", "hasNumber", "isShouty"];
  return keys.map(k => {
    const yes = data.filter(d => d.features[k]);
    const no = data.filter(d => !d.features[k]);
    return {
      feature: k,
      withN: yes.length,
      withRate: +median(yes.map(d => d.rate)).toFixed(2),
      withoutRate: +median(no.map(d => d.rate)).toFixed(2)
    };
  });
}

// Rate is only trustworthy above a minimum audience: at low reach a single share
// swings the percentage wildly, so a tiny post can post a fluke 20% and crowd out
// real wins. We rank stories that cleared a reach floor first, and only fall back
// to the rest to fill the list — flukes are demoted, never hidden, and the floor
// scales to each newsroom (a fraction of its OWN median reach). Editable.
export const SIGNAL_REACH_FRACTION = 0.25;

export function reachFloor(data) {
  return SIGNAL_REACH_FRACTION * median(data.map(d => d.reach));
}

export function signalLeaders(data, n = 15) {
  const floor = reachFloor(data);
  const byRate = (a, b) => b.rate - a.rate;
  const qualified = data.filter(d => d.reach >= floor).sort(byRate);
  const rest = data.filter(d => d.reach < floor).sort(byRate);
  return [...qualified, ...rest].slice(0, n);
}

// Big reach, weak conversion — the "loud but hollow" set.
export function reachGiants(data, n = 15) {
  return [...data]
    .sort((a, b) => b.reach - a.reach)
    .slice(0, n)
    .sort((a, b) => a.rate - b.rate);
}

// One call that assembles everything the dashboard / brief needs.
// `beats` is the taxonomy to tag against (default = generic DEFAULT_BEATS).
export function fullReport(rows, beats = BEATS) {
  const data = enrich(rows, beats);
  return {
    topline: topline(data),
    byBeat: byBeat(data),
    byFormat: byFormat(data),
    timeline: timeline(data),
    risingFading: risingFading(data),
    headlineSignal: headlineSignal(data),
    signalLeaders: signalLeaders(data),
    reachGiants: reachGiants(data),
    reachFloor: Math.round(reachFloor(data)),
    stories: data
  };
}
