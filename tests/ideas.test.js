// tests/ideas.test.js
// storyIdeas pitches NEW commissionable stories grounded in the newsroom's own
// winners. These tests pin: the evidence pack reaches the model (top stories,
// beats, newsroom context), the idea count is clamped, and empty data refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storyIdeas } from "../lib/handlers.js";

// Rows as loadRows reads them from the stories table. Health stories convert
// far better than sport ones, so "A Costly Dose" style titles must surface as
// the proven appetite in the prompt.
function mkRows() {
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push({
    n: i + 1, title: `Health clinic funds missing in district ${i + 1}`, month: "May",
    story_date: `${i + 2} May 2025`, reach: 2000, engagement: 60 + i, type: "Investigation",
    source_label: "matrix",
  });
  for (let i = 0; i < 6; i++) rows.push({
    n: i + 7, title: `Football league roundup week ${i + 1}`, month: "June",
    story_date: `${i + 2} June 2025`, reach: 2000, engagement: 8 + i, type: "News/Article",
    source_label: "matrix",
  });
  return rows;
}

function mkHost(rows, capture = {}) {
  return {
    meta: { runtime_version: "0.14.0", newsroom: "TestRoom" },
    tablePrefix: "node_analytics_",
    db: { query: async () => ({ rows }) },
    store: {
      get: async (collection, key) =>
        collection === "config" && key === "newsroom_context"
          ? { country: "Zambia", audience: "urban readers" }
          : null,
    },
    ai: {
      chat: async (prompt, opts) => {
        capture.prompt = prompt; capture.opts = opts;
        return { text: "## Idea one\n- **The story:** x", usedFallback: false, provider: "anthropic", model: "claude-haiku-4-5" };
      },
    },
    log: { run: async () => {} },
  };
}

test("storyIdeas grounds the pitch in the newsroom's own winners and context", async () => {
  const capture = {};
  const out = await storyIdeas(mkHost(mkRows(), capture), {});
  assert.equal(out.ideas, "## Idea one\n- **The story:** x");
  // The proven appetite (a top health story) reaches the model verbatim.
  assert.match(capture.prompt, /Health clinic funds missing/);
  // So does the newsroom context that ideas must fit.
  assert.match(capture.prompt, /Zambia/);
  assert.match(capture.prompt, /urban readers/);
  // Default ask is exactly 6 NEW ideas.
  assert.match(capture.prompt, /exactly 6 NEW story ideas/);
});

test("storyIdeas clamps the requested count to 3–10", async () => {
  const hi = {};
  await storyIdeas(mkHost(mkRows(), hi), { count: 99 });
  assert.match(hi.prompt, /exactly 10 NEW story ideas/);
  const lo = {};
  await storyIdeas(mkHost(mkRows(), lo), { count: 1 });
  assert.match(lo.prompt, /exactly 3 NEW story ideas/);
  const junk = {};
  await storyIdeas(mkHost(mkRows(), junk), { count: "not-a-number" });
  assert.match(junk.prompt, /exactly 6 NEW story ideas/);
});

test("storyIdeas refuses when nothing is ingested", async () => {
  await assert.rejects(() => storyIdeas(mkHost([]), {}), /nothing ingested/);
});
