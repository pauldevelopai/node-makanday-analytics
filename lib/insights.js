/**
 * lib/insights.js — three actionable, forward-looking views on enriched rows.
 * Pure and deterministic. Input is analytics.enrich() output (rate, reach, beats,
 * wlb, date).
 *
 *   byWeekday(data)          → which day of the week the audience rewards.
 *   quadrants(data)          → reach × rate map; surfaces "hidden gems" to boost.
 *   performanceOutliers(data)→ stories that beat / missed their beat's norm.
 */

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["january","february","march","april","may","june",
  "july","august","september","october","november","december"];

const monthIndex = name => {
  const n = String(name || "").toLowerCase().slice(0, 3);
  return MONTHS.findIndex(m => m.slice(0, 3) === n);   // -1 if not found
};

// Parse a row's date to a weekday index (0=Mon … 6=Sun), or null if unusable.
// Parses Y/M/D components and builds a UTC date so the weekday is timezone-proof
// (Date.parse + getUTCDay would shift across midnight depending on the host TZ).
// Handles "3 March 2025", "3rd March 2025", ISO "2025-03-03", "03/03/2025".
export function weekdayOf(row) {
  const raw = String(row?.date || "").replace(/(\d+)(st|nd|rd|th)/gi, "$1").trim();
  if (!raw) return null;
  let y, m, d, mm;
  if ((mm = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if ((mm = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/))) { d = +mm[1]; m = monthIndex(mm[2]) + 1; y = +mm[3]; }
  else if ((mm = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { d = +mm[1]; m = +mm[2]; y = +mm[3]; }   // D/M/Y
  else return null;
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : (dt.getUTCDay() + 6) % 7;   // Monday = 0
}

export function byWeekday(data) {
  const buckets = Array.from({ length: 7 }, () => []);
  let undated = 0;
  for (const d of data) {
    const w = weekdayOf(d);
    if (w == null) { undated++; continue; }
    buckets[w].push(d);
  }
  const days = buckets
    .map((rows, i) => rows.length ? {
      day: WEEKDAYS[i],
      n: rows.length,
      medianRate: +median(rows.map(d => d.rate)).toFixed(2),
      medianReach: Math.round(median(rows.map(d => d.reach))),
    } : null)
    .filter(Boolean);
  return { days, undated, covered: data.length - undated };
}

// Reach × rate quadrants. Splits at the medians of reach and rate.
export function quadrants(data) {
  if (!data.length) return { splitReach: 0, splitRate: 0, counts: {}, hiddenGems: [], boostedDuds: [] };
  const splitReach = median(data.map(d => d.reach));
  const splitRate = median(data.map(d => d.rate));
  const tag = d => {
    const hiReach = d.reach >= splitReach, hiRate = d.rate >= splitRate;
    return hiReach ? (hiRate ? "star" : "boostedDud") : (hiRate ? "hiddenGem" : "quiet");
  };
  const counts = { star: 0, boostedDud: 0, hiddenGem: 0, quiet: 0 };
  for (const d of data) counts[tag(d)]++;
  const pick = (which, sortKey) => data.filter(d => tag(d) === which)
    .sort((a, b) => sortKey(b) - sortKey(a))
    .slice(0, 12)
    .map(d => ({ title: d.title, reach: d.reach, engagement: d.engagement, rate: +d.rate.toFixed(2), band: d.band, beat: d.beats[0], month: d.month }));
  return {
    splitReach: Math.round(splitReach),
    splitRate: +splitRate.toFixed(2),
    counts,
    // Resonant but under-distributed → rank by Wilson lower bound (reliably high).
    hiddenGems: pick("hiddenGem", d => d.wlb),
    // Lots of reach, weak conversion → the boosting didn't land.
    boostedDuds: pick("boostedDud", d => d.reach),
  };
}

// Stories that beat or missed the median rate of their (primary) beat.
export function performanceOutliers(data, n = 8) {
  if (data.length < 4) return { overPerformers: [], underPerformers: [] };
  const overall = median(data.map(d => d.rate));
  const beatMedian = new Map();
  const beatsPresent = new Set(data.flatMap(d => d.beats));
  for (const b of beatsPresent) {
    const rs = data.filter(d => d.beats.includes(b)).map(d => d.rate);
    beatMedian.set(b, median(rs));
  }
  const scored = data.map(d => {
    const beat = d.beats[0];
    const expected = beatMedian.has(beat) ? beatMedian.get(beat) : overall;
    return {
      title: d.title, beat, rate: +d.rate.toFixed(2),
      expected: +expected.toFixed(2),
      residual: +(d.rate - expected).toFixed(2),
      reach: d.reach, month: d.month,
    };
  });
  const byResidual = [...scored].sort((a, b) => b.residual - a.residual);
  return {
    overPerformers: byResidual.filter(s => s.residual > 0).slice(0, n),
    underPerformers: byResidual.filter(s => s.residual < 0).slice(-n).reverse(),
  };
}
