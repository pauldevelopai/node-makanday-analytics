/**
 * lib/compare.js — period-over-period comparison ("this upload vs last").
 *
 * Closes the feedback loop the tool was missing: you change what you commission,
 * upload the next period, and see what actually moved. Diffs two already-computed
 * reports (analytics.fullReport) — overall rate, and which beats / formats rose or
 * fell the most. Pure: given two reports, the diff is deterministic.
 */

function indexBy(rows, key) {
  const m = new Map();
  for (const r of rows || []) m.set(r[key], r);
  return m;
}

// Diff two keyed metric lists (byBeat / byFormat) on medianRate.
function diffGroups(current, baseline, key) {
  const cur = indexBy(current, key);
  const base = indexBy(baseline, key);
  const names = new Set([...cur.keys(), ...base.keys()]);
  const out = [];
  for (const name of names) {
    const c = cur.get(name), b = base.get(name);
    const currentRate = c ? c.medianRate : null;
    const baselineRate = b ? b.medianRate : null;
    let status, delta = null;
    if (c && b) { delta = +(currentRate - baselineRate).toFixed(2); status = delta >= 0 ? "rose" : "fell"; }
    else if (c) status = "new";
    else status = "gone";
    out.push({ name, currentRate, baselineRate, delta, currentN: c ? c.n : 0, baselineN: b ? b.n : 0, status });
  }
  // Biggest movers first; new/gone (delta null) sink to the bottom.
  return out.sort((a, b) => Math.abs(b.delta ?? -1) - Math.abs(a.delta ?? -1));
}

/**
 * @param {object} current   fullReport of the selected source
 * @param {object} baseline  fullReport of the comparison source
 * @param {object} labels    { current, baseline } display names
 */
export function compareReports(current, baseline, labels = {}) {
  if (!current || !baseline || current.empty || baseline.empty) return null;
  const ct = current.topline, bt = baseline.topline;
  return {
    labels: { current: labels.current || "current", baseline: labels.baseline || "baseline" },
    topline: {
      current: ct,
      baseline: bt,
      rateDelta: +(ct.medianRate - bt.medianRate).toFixed(2),
      reachDelta: ct.medianReach - bt.medianReach,
      storiesDelta: ct.stories - bt.stories
    },
    beats: diffGroups(current.byBeat, baseline.byBeat, "beat"),
    formats: diffGroups(current.byFormat, baseline.byFormat, "type")
  };
}
