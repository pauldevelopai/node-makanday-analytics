// tests/wordsignal.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, contentTokens, bigrams } from "../lib/text.js";
import { wordSignal } from "../lib/wordsignal.js";
import { enrich } from "../lib/analytics.js";

test("tokenizer lowercases, splits on non-letters, drops apostrophes", () => {
  assert.deepEqual(tokenize("Don't STOP — the Mine!"), ["dont", "stop", "the", "mine"]);
  assert.deepEqual(contentTokens("the mining boom in Zambia"), ["mining", "boom", "zambia"]);
  // Stop-words ("the") are dropped before pairing, so bigrams are content-only.
  assert.deepEqual(bigrams("the mining boom continues today"), ["mining boom", "boom continues", "continues today"]);
});

test("wordSignal surfaces a word that lifts engagement, with sample size", () => {
  // 'exposed' headlines all convert well; others poorly. n large enough to register.
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push({ n: i, title: `Corruption exposed case ${i}`, month: "May", reach: 1000, engagement: 100, type: "Investigation" });
  for (let i = 0; i < 6; i++) rows.push({ n: 10 + i, title: `Routine council update ${i}`, month: "May", reach: 1000, engagement: 10, type: "News/Article" });
  const { lifters } = wordSignal(enrich(rows), { minStories: 3 });
  const exposed = lifters.find(t => t.term === "exposed");
  assert.ok(exposed, "'exposed' should be a lifter");
  assert.equal(exposed.n, 6);
  assert.ok(exposed.lift > 0);
  assert.equal(exposed.significant, true);   // 10% vs 1% over big samples
});

test("wordSignal ignores terms below the minStories threshold", () => {
  const rows = [
    { n: 1, title: "unicorn sighting downtown", month: "May", reach: 1000, engagement: 200, type: "News/Article" },
    { n: 2, title: "ordinary day one", month: "May", reach: 1000, engagement: 10, type: "News/Article" },
    { n: 3, title: "ordinary day two", month: "May", reach: 1000, engagement: 10, type: "News/Article" },
    { n: 4, title: "ordinary day three", month: "May", reach: 1000, engagement: 10, type: "News/Article" }
  ];
  const { lifters } = wordSignal(enrich(rows), { minStories: 3 });
  assert.ok(!lifters.some(t => t.term === "unicorn"), "rare word must not appear");
});
