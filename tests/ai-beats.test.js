// tests/ai-beats.test.js
// parseBeatsTsv reads untrusted model output, so it must be forgiving but safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBeatsTsv } from "../lib/ai-beats.js";
import { compileBeats, tagBeats } from "../lib/beats.js";

test("parses tab-separated beat lines into name + keywords", () => {
  const out = "Health & medicine\thospital, doctor, vaccine\nLocal politics\tcouncil, mayor, election";
  const beats = parseBeatsTsv(out);
  assert.equal(beats.length, 2);
  assert.deepEqual(beats[0], { name: "Health & medicine", keywords: ["hospital", "doctor", "vaccine"] });
  // …and the result drives tagging end-to-end.
  const t = compileBeats(beats);
  assert.deepEqual(tagBeats("New vaccine arrives at hospital", t), ["Health & medicine"]);
});

test("tolerates code fences, a header row, bullets, and a colon fallback", () => {
  const out = "```\nbeat name\tkeywords\n- Sport: football, rugby, cricket\nEmpty\t\n```";
  const beats = parseBeatsTsv(out);
  assert.equal(beats.length, 1);                 // header + empty-keyword line dropped
  assert.equal(beats[0].name, "Sport");
  assert.deepEqual(beats[0].keywords, ["football", "rugby", "cricket"]);
});

test("drops duplicate beat names and caps keywords", () => {
  const out = "News\ta, b\nNews\tc, d\nWide\t" + Array.from({ length: 20 }, (_, i) => "k" + i).join(", ");
  const beats = parseBeatsTsv(out);
  assert.equal(beats.filter(b => b.name === "News").length, 1);
  assert.ok(beats.find(b => b.name === "Wide").keywords.length <= 12);
});
