// src/analytics.js
// Pure, deterministic analytics. No DOM, no IO, no side effects.
// Everything that drives the dashboard and the AI brief is computed here
// so it can be unit-tested and reused headlessly (cohort reports, etc).

import { BEATS, FALLBACK_BEAT, tagBeats, headlineFeatures } from "./beats.js";

export const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

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

// Enrich raw rows: engagement rate + beats + headline shape + rate band.
export function enrich(rows) {
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
      beats: tagBeats(r.title),
      features: headlineFeatures(r.title)
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
  const names = [...Object.keys(BEATS), FALLBACK_BEAT];
  return names
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

export function timeline(data) {
  return MONTH_ORDER.map(m => {
    const s = data.filter(d => d.month === m);
    if (!s.length) return null;
    return {
      month: m,
      n: s.length,
      medianRate: +median(s.map(d => d.rate)).toFixed(2),
      medianReach: Math.round(median(s.map(d => d.reach)))
    };
  }).filter(Boolean);
}

// Owned-data "listening": which beats are heating up vs cooling.
// Split the published set chronologically in half, compare median rate.
export function risingFading(data) {
  const ordered = [...data].sort(
    (a, b) => MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month) || a.n - b.n
  );
  const mid = Math.floor(ordered.length / 2);
  const early = ordered.slice(0, mid);
  const late = ordered.slice(mid);
  const names = [...Object.keys(BEATS), FALLBACK_BEAT];
  return names
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

export function signalLeaders(data, n = 15) {
  return [...data].sort((a, b) => b.rate - a.rate).slice(0, n);
}

// Big reach, weak conversion — the "loud but hollow" set.
export function reachGiants(data, n = 15) {
  return [...data]
    .sort((a, b) => b.reach - a.reach)
    .slice(0, n)
    .sort((a, b) => a.rate - b.rate);
}

// One call that assembles everything the dashboard / brief needs.
export function fullReport(rows) {
  const data = enrich(rows);
  return {
    topline: topline(data),
    byBeat: byBeat(data),
    byFormat: byFormat(data),
    timeline: timeline(data),
    risingFading: risingFading(data),
    headlineSignal: headlineSignal(data),
    signalLeaders: signalLeaders(data),
    reachGiants: reachGiants(data),
    stories: data
  };
}
