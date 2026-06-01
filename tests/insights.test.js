// tests/insights.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekdayOf, byWeekday, quadrants, performanceOutliers } from "../lib/insights.js";
import { scoreHeadline } from "../lib/scorer.js";
import { enrich, fullReport } from "../lib/analytics.js";

test("weekdayOf parses several date formats to Monday=0..Sunday=6", () => {
  assert.equal(weekdayOf({ date: "3 March 2025" }), 0);     // Monday
  assert.equal(weekdayOf({ date: "2025-03-03" }), 0);       // same day, ISO
  assert.equal(weekdayOf({ date: "9 March 2025" }), 6);     // Sunday
  assert.equal(weekdayOf({ date: "" }), null);
  assert.equal(weekdayOf({ date: "not a date" }), null);
});

test("byWeekday groups dated rows and counts the undated", () => {
  const rows = enrich([
    { n: 1, title: "a", date: "3 March 2025", reach: 1000, engagement: 50, type: "News/Article" },
    { n: 2, title: "b", date: "10 March 2025", reach: 1000, engagement: 30, type: "News/Article" }, // Monday
    { n: 3, title: "c", date: "", reach: 1000, engagement: 20, type: "News/Article" },
  ]);
  const wd = byWeekday(rows);
  const mon = wd.days.find(d => d.day === "Monday");
  assert.equal(mon.n, 2);
  assert.equal(wd.undated, 1);
  assert.equal(wd.covered, 2);
});

test("quadrants surfaces hidden gems (low reach, high rate)", () => {
  const rows = enrich([
    { n: 1, title: "gem", date: "1 May 2025", reach: 200, engagement: 40, type: "News/Article" },   // 20% low reach
    { n: 2, title: "dud", date: "2 May 2025", reach: 50000, engagement: 100, type: "News/Article" }, // 0.2% high reach
    { n: 3, title: "star", date: "3 May 2025", reach: 40000, engagement: 4000, type: "News/Article" },
    { n: 4, title: "quiet", date: "4 May 2025", reach: 100, engagement: 1, type: "News/Article" },
  ]);
  const q = quadrants(rows);
  assert.ok(q.hiddenGems.some(g => g.title === "gem"));
  assert.ok(q.boostedDuds.some(d => d.title === "dud"));
  assert.equal(q.counts.star + q.counts.boostedDud + q.counts.hiddenGem + q.counts.quiet, 4);
});

test("performanceOutliers ranks stories vs their beat's median", () => {
  const rows = enrich([
    { n: 1, title: "Mining boom one", date: "1 May 2025", reach: 1000, engagement: 10, type: "News/Article" },
    { n: 2, title: "Mining boom two", date: "2 May 2025", reach: 1000, engagement: 12, type: "News/Article" },
    { n: 3, title: "Mining boom huge hit", date: "3 May 2025", reach: 1000, engagement: 200, type: "News/Article" }, // over-performs
    { n: 4, title: "Mining boom flop", date: "4 May 2025", reach: 1000, engagement: 1, type: "News/Article" },
  ]);
  const o = performanceOutliers(rows);
  assert.equal(o.overPerformers[0].title, "Mining boom huge hit");
  assert.ok(o.overPerformers[0].residual > 0);
});

test("scoreHeadline predicts a rate with explained factors", () => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ n: i, title: `Corruption exposed scandal ${i}`, date: "1 May 2025", reach: 1000, engagement: 100, type: "Investigation" });
  for (let i = 0; i < 8; i++) rows.push({ n: 10 + i, title: `Routine council notice ${i}`, date: "1 May 2025", reach: 1000, engagement: 10, type: "News/Article" });
  const report = fullReport(rows);
  const s = scoreHeadline("Corruption exposed in new scandal", report);
  assert.ok(typeof s.predictedRate === "number");
  assert.ok(["low", "solid", "strong", "exceptional"].includes(s.band));
  assert.ok(Array.isArray(s.factors));
  // Too little data → clear error, not a bogus number.
  assert.ok(scoreHeadline("x", fullReport(rows.slice(0, 3))).error);
});
