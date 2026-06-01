// tests/sentiment.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreSentiment, sentimentLabel, sentimentSignal } from "../lib/sentiment.js";
import { enrich } from "../lib/analytics.js";

test("AFINN scoring picks up positive and negative valence", () => {
  assert.ok(scoreSentiment("a wonderful, brilliant win").score > 0);
  assert.ok(scoreSentiment("tragic death and disaster").score < 0);
  assert.equal(scoreSentiment("the council meeting on tuesday").score, 0); // neutral
});

test("sentimentLabel buckets headlines", () => {
  assert.equal(sentimentLabel("great victory celebrated"), "positive");
  assert.equal(sentimentLabel("horrible corrupt scandal"), "negative");
  assert.equal(sentimentLabel("quarterly report released"), "neutral");
});

test("sentimentSignal groups stories and reports per-group median rate", () => {
  const rows = [
    { n: 1, title: "tragic deadly disaster kills many", month: "May", reach: 1000, engagement: 80, type: "News/Article" },
    { n: 2, title: "horrible corrupt fraud exposed", month: "May", reach: 1000, engagement: 90, type: "Investigation" },
    { n: 3, title: "wonderful happy celebration today", month: "May", reach: 1000, engagement: 20, type: "News/Article" },
    { n: 4, title: "great brilliant success story", month: "May", reach: 1000, engagement: 15, type: "News/Article" }
  ];
  const { groups } = sentimentSignal(enrich(rows));
  const neg = groups.find(g => g.label === "negative");
  const pos = groups.find(g => g.label === "positive");
  assert.equal(neg.n, 2);
  assert.equal(pos.n, 2);
  assert.ok(neg.medianRate > pos.medianRate, "negative framing converts better in this fixture");
});
