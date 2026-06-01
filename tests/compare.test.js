// tests/compare.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareReports } from "../lib/compare.js";
import { fullReport } from "../lib/analytics.js";

const mk = (rows) => fullReport(rows);

test("compareReports diffs topline and ranks beats by biggest move", () => {
  const last = mk([
    { n: 1, title: "Mining boom in copper belt", month: "January", story_date: "3 January 2025", reach: 1000, engagement: 10, type: "News/Article" },
    { n: 2, title: "Mining licence granted", month: "February", story_date: "3 February 2025", reach: 1000, engagement: 12, type: "News/Article" },
    { n: 3, title: "School exam results", month: "January", story_date: "5 January 2025", reach: 1000, engagement: 50, type: "News/Article" }
  ]);
  const now = mk([
    { n: 1, title: "Mining boom continues", month: "April", story_date: "3 April 2025", reach: 1000, engagement: 60, type: "News/Article" },
    { n: 2, title: "Mining union strike", month: "May", story_date: "3 May 2025", reach: 1000, engagement: 64, type: "News/Article" },
    { n: 3, title: "School exam results out", month: "April", story_date: "5 April 2025", reach: 1000, engagement: 48, type: "News/Article" }
  ]);
  const cmp = compareReports(now, last, { current: "Q2", baseline: "Q1" });
  assert.equal(cmp.labels.current, "Q2");
  assert.ok(cmp.topline.rateDelta !== 0);
  // Environment & climate (mining) jumped from ~1.1% to ~6% → should be a top mover.
  const mover = cmp.beats[0];
  assert.equal(mover.name, "Environment & climate");
  assert.equal(mover.status, "rose");
  assert.ok(mover.delta > 0);
});

test("compareReports marks beats that exist in only one period", () => {
  const a = mk([
    { n: 1, title: "Mining boom one", month: "April", story_date: "1 April 2025", reach: 1000, engagement: 40, type: "News/Article" },
    { n: 2, title: "Mining boom two", month: "April", story_date: "2 April 2025", reach: 1000, engagement: 44, type: "News/Article" }
  ]);
  const b = mk([
    { n: 1, title: "Hospital health crisis", month: "January", story_date: "1 January 2025", reach: 1000, engagement: 30, type: "News/Article" },
    { n: 2, title: "Hospital doctor shortage", month: "January", story_date: "2 January 2025", reach: 1000, engagement: 33, type: "News/Article" }
  ]);
  const cmp = compareReports(a, b);
  const env = cmp.beats.find(x => x.name === "Environment & climate");
  const health = cmp.beats.find(x => x.name === "Health & medicine");
  assert.equal(env.status, "new");    // only in current
  assert.equal(health.status, "gone"); // only in baseline
});

test("compareReports returns null when a side is empty", () => {
  assert.equal(compareReports({ empty: true }, mk([{ n: 1, title: "x", month: "May", reach: 1, engagement: 0, type: "News/Article" }])), null);
});
