// tests/stats.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { wilson, wilsonLowerBound, twoProportionTest, mannWhitney } from "../lib/stats.js";

test("wilson interval brackets the point estimate and stays in [0,1]", () => {
  const w = wilson(50, 1000);
  assert.ok(w.lo < w.p && w.p < w.hi);
  assert.ok(w.lo >= 0 && w.hi <= 1);
  assert.equal(+w.p.toFixed(2), 0.05);
});

test("wilson handles empty trials without dividing by zero", () => {
  assert.deepEqual(wilson(0, 0), { lo: 0, hi: 0, p: 0 });
});

test("wilson lower bound punishes small samples more than large ones", () => {
  // Same 20% rate, very different evidence: the tiny sample gets pulled down more.
  const tiny = wilsonLowerBound(2, 10);
  const big = wilsonLowerBound(200, 1000);
  assert.ok(big > tiny, "1000-sample 20% should out-rank 10-sample 20%");
  assert.ok(tiny < 0.2 && big < 0.2);
});

test("two-proportion test flags a real difference and ignores a tiny one", () => {
  // Clearly different rates over big samples → significant.
  const real = twoProportionTest(200, 1000, 50, 1000);
  assert.equal(real.significant, true);
  assert.ok(real.diff > 0);
  // Same rate → not significant.
  const none = twoProportionTest(50, 1000, 50, 1000);
  assert.equal(none.significant, false);
  // Empty group → can't tell.
  assert.equal(twoProportionTest(5, 0, 5, 100).significant, false);
});

test("mannWhitney flags a real group difference, ignores ties and tiny samples", () => {
  // Cleanly separated rate distributions over enough stories → significant.
  assert.equal(mannWhitney([8, 9, 10, 9, 8, 10], [1, 2, 1, 2, 1, 2]).significant, true);
  // Identical groups → not significant.
  assert.equal(mannWhitney([5, 5, 5, 5, 5], [5, 5, 5, 5, 5]).significant, false);
  // Fewer than 5 stories a side → can't tell, even if separated.
  assert.equal(mannWhitney([1, 2, 3], [7, 8, 9]).significant, false);
});
