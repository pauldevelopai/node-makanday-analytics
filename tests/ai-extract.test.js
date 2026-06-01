// tests/ai-extract.test.js
// parseAiTsv reads untrusted model output (the .doc/PDF path), so it must be
// forgiving but never invent rows. aiExtractRows must flag a truncated input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAiTsv, aiExtractRows } from "../lib/ai-extract.js";

test("parses tab-separated story rows and derives the month", () => {
  const out =
    "1\tGold mine scandal\t3 March 2025\t1,307\t13\tInvestigation\n" +
    "2\tHospital floods\t\t8862\t37\tNews/Article";
  const { rows, issues } = parseAiTsv(out);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { n: rows[0].n, title: rows[0].title, month: rows[0].month, reach: rows[0].reach, engagement: rows[0].engagement, type: rows[0].type },
    { n: 1, title: "Gold mine scandal", month: "March", reach: 1307, engagement: 13, type: "Investigation" }
  );
  assert.ok(issues.some(i => i.n === 2 && i.field === "date"));   // missing date flagged
});

test("skips a header row and prose, and never invents rows", () => {
  const out = "number\ttitle\tdate\treach\tengagement\ttype\nHere are the stories:\n1\tReal story\t1 May 2025\t500\t40\tOpinion";
  const { rows } = parseAiTsv(out);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Real story");
});

test("normalises dot/comma thousands separators the same way", () => {
  const { rows } = parseAiTsv("1\tA\t1 May 2025\t1.307\t1,045\tNews/Article");
  assert.equal(rows[0].reach, 1307);
  assert.equal(rows[0].engagement, 1045);
});

test("drops rows missing reach or engagement (can't compute a rate)", () => {
  const { rows, issues } = parseAiTsv("1\tNo numbers\t1 May 2025\t\t\tNews/Article");
  assert.equal(rows.length, 0);
  assert.ok(issues.some(i => i.field === "reach"));
});

test("aiExtractRows flags truncation of an oversized document", async () => {
  const host = { ai: { chat: async () => ({ text: "1\tStory\t1 May 2025\t500\t40\tNews/Article" }) } };
  const huge = "x".repeat(120000) + "more text that won't be read";
  const { rows, issues } = await aiExtractRows(host, huge);
  assert.equal(rows.length, 1);
  assert.ok(issues.some(i => i.field === "file" && /large/i.test(i.msg)), "expected a truncation warning");
});

test("aiExtractRows does not flag truncation for a normal-size document", async () => {
  const host = { ai: { chat: async () => ({ text: "1\tStory\t1 May 2025\t500\t40\tNews/Article" }) } };
  const { issues } = await aiExtractRows(host, "small document text");
  assert.ok(!issues.some(i => i.field === "file"));
});
