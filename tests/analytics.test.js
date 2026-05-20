// tests/analytics.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  median, percentile, enrich, topline, byBeat, byFormat,
  risingFading, headlineSignal, signalLeaders, reachGiants, fullReport
} from "../lib/analytics.js";
import { tagBeats, headlineFeatures } from "../lib/beats.js";

const sample = [
  { n: 1, title: "Gold mine scandal exposed", month: "April", reach: 1000, engagement: 50, type: "Investigation" },
  { n: 2, title: "Hospital floods after rains", month: "April", reach: 2000, engagement: 20, type: "News/Article" },
  { n: 3, title: "Whistleblower wins court case", month: "May", reach: 500, engagement: 40, type: "Investigation" },
  { n: 4, title: "OPINION: voters and the budget", month: "May", reach: 800, engagement: 8, type: "Opinion" },
  { n: 5, title: "Forest logging boom: \"They paid us nothing\"", month: "June", reach: 60000, engagement: 300, type: "Investigation" },
  { n: 6, title: "Mining firm gets licence", month: "June", reach: 1500, engagement: 60, type: "News/Article" }
];

test("median handles odd and even", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

test("percentile is monotonic and bounded", () => {
  const a = [10, 20, 30, 40, 50];
  assert.equal(percentile(a, 0), 10);
  assert.equal(percentile(a, 100), 50);
  assert.ok(percentile(a, 50) >= percentile(a, 25));
});

test("enrich computes rate and assigns a band to every row", () => {
  const d = enrich(sample);
  assert.equal(d.length, 6);
  assert.equal(+d[0].rate.toFixed(1), 5.0); // 50/1000
  d.forEach(r => assert.ok(["low", "solid", "strong", "exceptional"].includes(r.band)));
});

test("beat tagging is keyword-driven and multi-label", () => {
  assert.ok(tagBeats("Gold mine scandal exposed").includes("Mining & minerals"));
  assert.ok(tagBeats("Gold mine scandal exposed").includes("Corruption & graft"));
  assert.deepEqual(tagBeats("A quiet afternoon"), ["Other"]);
});

test("headline features detect shape", () => {
  const f = headlineFeatures('Mining boom: "They paid us nothing"?');
  assert.equal(f.hasColon, true);
  assert.equal(f.hasQuote, true);
  assert.equal(f.hasQuestion, true);
});

test("topline aggregates", () => {
  const t = topline(enrich(sample));
  assert.equal(t.stories, 6);
  assert.equal(t.totalReach, 65800);
  assert.ok(t.medianRate > 0);
});

test("byBeat sorted by median rate desc", () => {
  const b = byBeat(enrich(sample));
  for (let i = 1; i < b.length; i++) assert.ok(b[i - 1].medianRate >= b[i].medianRate);
});

test("reachGiants surfaces the loud-but-weak story", () => {
  const g = reachGiants(enrich(sample), 3);
  assert.equal(g[0].n, 5); // 60k reach, 0.5% rate -> worst converter at top of the giants
});

test("signalLeaders sorted by rate desc", () => {
  const s = signalLeaders(enrich(sample));
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].rate >= s[i].rate);
});

test("fullReport returns every section", () => {
  const r = fullReport(sample);
  for (const k of ["topline", "byBeat", "byFormat", "timeline", "risingFading",
    "headlineSignal", "signalLeaders", "reachGiants", "stories"]) {
    assert.ok(k in r, `missing ${k}`);
  }
});
