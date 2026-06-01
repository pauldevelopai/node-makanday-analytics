// tests/analytics.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  median, percentile, enrich, topline, byBeat, byFormat, timeline,
  risingFading, headlineSignal, signalLeaders, reachGiants, fullReport, periodOf
} from "../lib/analytics.js";
import { tagBeats, headlineFeatures, compileBeats, EXAMPLE_BEATS_ZAMBIA } from "../lib/beats.js";

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

test("beat tagging is keyword-driven and multi-label (generic default)", () => {
  const tags = tagBeats("Police probe mining pollution in court");
  assert.ok(tags.includes("Crime & justice"));       // police, court
  assert.ok(tags.includes("Environment & climate"));  // mining, pollution
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

test("signalLeaders sorted by rate desc within the reach-qualified set", () => {
  // sample reaches are all comfortably above the floor → straight rate-desc.
  const s = signalLeaders(enrich(sample));
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].rate >= s[i].rate);
});

test("signalLeaders demotes a low-reach fluke below real wins", () => {
  const rows = [
    ...sample,
    // reach 40, eng 8 -> 20% rate. Highest rate, but a tiny sample.
    { n: 99, title: "Tiny post that got lucky", month: "April", reach: 40, engagement: 8, type: "News/Article" }
  ];
  const enriched = enrich(rows);
  const fluke = enriched.find(d => d.n === 99);
  assert.equal(+fluke.rate.toFixed(0), 20);           // it really is the top rate
  const leaders = signalLeaders(enriched);
  assert.notEqual(leaders[0].n, 99);                  // ...but it does NOT lead
  // It's demoted to the tail (below every reach-qualified story), not deleted.
  assert.equal(leaders[leaders.length - 1].n, 99);
});

test("signalLeaders keeps the list full when nothing clears the floor", () => {
  // All tiny → floor is a fraction of their own median, so the list still fills.
  const tiny = [
    { n: 1, title: "a", month: "May", reach: 30, engagement: 6, type: "News/Article" },
    { n: 2, title: "b", month: "May", reach: 20, engagement: 2, type: "News/Article" }
  ];
  assert.equal(signalLeaders(enrich(tiny)).length, 2);
});

test("periodOf reads the year from the date string, falls back to month", () => {
  assert.deepEqual(
    { y: periodOf({ date: "3 March 2025" }).year, m: periodOf({ date: "3 March 2025" }).monthIndex },
    { y: 2025, m: 2 }
  );
  // Bare month (no date) → no year, still a usable period.
  assert.equal(periodOf({ month: "April" }).year, null);
  assert.equal(periodOf({ month: "April" }).monthIndex, 3);
  // Undated → null.
  assert.equal(periodOf({ title: "no date here" }), null);
});

test("timeline keeps same month in different years as separate, ordered buckets", () => {
  const rows = [
    { n: 1, title: "a", date: "5 December 2024", reach: 1000, engagement: 50, type: "News/Article" },
    { n: 2, title: "b", date: "9 December 2024", reach: 1000, engagement: 30, type: "News/Article" },
    { n: 3, title: "c", date: "4 January 2025", reach: 1000, engagement: 80, type: "News/Article" },
    { n: 4, title: "d", date: "8 January 2025", reach: 1000, engagement: 60, type: "News/Article" }
  ];
  const t = timeline(enrich(rows));
  assert.deepEqual(t.map(b => b.label), ["Dec 2024", "Jan 2025"]); // chronological, not "Jan" before "Dec"
  assert.equal(t.length, 2);
  assert.equal(t[0].n, 2);
});

test("risingFading splits a Dec→Jan span by true chronology", () => {
  // Engagement climbs across the turn of the year for one beat.
  const rows = [
    { n: 1, title: "Mining licence granted", date: "2 December 2024", reach: 1000, engagement: 10, type: "News/Article" },
    { n: 2, title: "Mining boom in copper belt", date: "20 December 2024", reach: 1000, engagement: 12, type: "News/Article" },
    { n: 3, title: "Mining firm fined", date: "5 January 2025", reach: 1000, engagement: 40, type: "News/Article" },
    { n: 4, title: "Mining union strike", date: "18 January 2025", reach: 1000, engagement: 44, type: "News/Article" }
  ];
  const rf = risingFading(enrich(rows)).find(x => x.beat === "Environment & climate");
  assert.ok(rf, "mining beat present in both halves");
  assert.equal(rf.direction, "rising");   // Dec (early) < Jan (late)
  assert.ok(rf.lateRate > rf.earlyRate);
});

test("compileBeats turns AI keyword lists into a usable taxonomy", () => {
  const t = compileBeats([
    { name: "Sport", keywords: ["football", "match"] },
    { name: "Bad", keywords: [] },          // dropped — no keywords
    { name: "", keywords: ["x"] }           // dropped — no name
  ]);
  assert.deepEqual(Object.keys(t), ["Sport"]);
  assert.deepEqual(tagBeats("Big football match tonight", t), ["Sport"]);
  assert.equal(compileBeats([]), null);     // null → caller falls back to default
  assert.equal(compileBeats("nope"), null);
});

test("an explicit taxonomy overrides the generic default in enrich/fullReport", () => {
  // Same data, the original Zambia example taxonomy → Zambia beat names appear.
  const r = fullReport(sample, EXAMPLE_BEATS_ZAMBIA);
  const beats = r.byBeat.map(b => b.beat);
  assert.ok(beats.includes("Mining & minerals"));   // only exists in the Zambia set
  assert.ok(!beats.includes("Environment & climate")); // a generic-default name, absent here
});

test("fullReport returns every section", () => {
  const r = fullReport(sample);
  for (const k of ["topline", "byBeat", "byFormat", "timeline", "risingFading",
    "headlineSignal", "signalLeaders", "reachGiants", "stories"]) {
    assert.ok(k in r, `missing ${k}`);
  }
});
