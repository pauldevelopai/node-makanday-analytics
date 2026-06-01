/**
 * lib/stats.js — small, dependency-free statistics for trustworthy analytics.
 *
 * Engagement RATE is a binomial proportion: engagement "successes" out of reach
 * "trials". Raw rate is noisy at low reach, and a difference between two groups
 * can be pure chance. These helpers put a confidence bound on a rate and tell
 * you whether a difference is real — so the dashboard stops presenting flukes
 * and noise as findings.
 *
 * Method: Wilson score interval (the one Reddit/Stack Exchange use to rank by
 * rate without small samples winning), plus a two-proportion z-test for "is this
 * difference significant?". Pure math, no libraries.
 */

const Z = 1.96; // ~95% confidence

/**
 * Wilson score interval for `successes` out of `trials`.
 * Returns { lo, hi, p } as PROPORTIONS in [0,1]. Empty trials → all zero.
 */
export function wilson(successes, trials, z = Z) {
  const n = Number(trials) || 0;
  if (n <= 0) return { lo: 0, hi: 0, p: 0 };
  const p = Math.min(Math.max(successes / n, 0), 1);
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    p,
    lo: Math.max(0, (centre - margin) / denom),
    hi: Math.min(1, (centre + margin) / denom)
  };
}

/**
 * Wilson LOWER bound — the conservative "this rate is at least…" score. Use it
 * to rank: a high rate from a tiny sample gets pulled down toward 0, so it can't
 * out-rank a slightly lower rate proven over a big sample.
 */
export function wilsonLowerBound(successes, trials, z = Z) {
  return wilson(successes, trials, z).lo;
}

/**
 * Two-proportion z-test: is the rate of group A (sa/na) different from group B
 * (sb/nb)? Returns { z, significant, diff } where diff = pA − pB (proportions)
 * and significant means |z| ≥ 1.96 (~95%). Returns z=0/insignificant when either
 * group is empty (can't tell).
 *
 * NB: appropriate for a SINGLE proportion vs another (e.g. one story's rate). Do
 * NOT use it to compare GROUPS of stories with reach as the sample size — that
 * treats every impression as independent (pseudoreplication) and flags almost
 * everything as significant. For group-vs-group, use mannWhitney on the per-story
 * rates, where the sample is the number of stories.
 */
export function twoProportionTest(sa, na, sb, nb, z = Z) {
  na = Number(na) || 0; nb = Number(nb) || 0;
  if (na <= 0 || nb <= 0) return { z: 0, significant: false, diff: 0 };
  const pa = sa / na, pb = sb / nb;
  const pooled = (sa + sb) / (na + nb);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / na + 1 / nb));
  if (se === 0) return { z: 0, significant: false, diff: pa - pb };
  const stat = (pa - pb) / se;
  return { z: stat, significant: Math.abs(stat) >= z, diff: pa - pb };
}

/**
 * Mann-Whitney U test (normal approximation) — do two groups of per-story rates
 * come from different distributions? The right tool for "does beat X resonate
 * more than the rest?": rank-based (robust to the skew of engagement rates) and
 * the sample is the STORY COUNT, not impressions. Returns { z, significant }.
 * Too few stories on either side (< 5) → not enough to tell.
 */
export function mannWhitney(a, b, z = Z) {
  const na = a.length, nb = b.length;
  if (na < 5 || nb < 5) return { z: 0, significant: false };
  const all = a.map(v => ({ v, g: 0 })).concat(b.map(v => ({ v, g: 1 })));
  all.sort((x, y) => x.v - y.v);
  // Average ranks (1-based), handling ties.
  const ranks = new Array(all.length);
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let Ra = 0;
  for (let k = 0; k < all.length; k++) if (all[k].g === 0) Ra += ranks[k];
  const Ua = Ra - (na * (na + 1)) / 2;
  const U = Math.min(Ua, na * nb - Ua);
  const mu = (na * nb) / 2;
  const sigma = Math.sqrt((na * nb * (na + nb + 1)) / 12);
  if (sigma === 0) return { z: 0, significant: false };
  const stat = (U - mu) / sigma;
  return { z: stat, significant: Math.abs(stat) >= z };
}
