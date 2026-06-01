// tests/csv.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDelimited, csvToMatrix } from "../lib/csv.js";
import { detectFormat } from "../lib/extract.js";

test("parseDelimited handles quoted fields, embedded commas and newlines", () => {
  const csv = 'a,b,c\n"x,1","line\nbreak",3\n"quote""d",e,f';
  const t = parseDelimited(csv);
  assert.deepEqual(t[0], ["a", "b", "c"]);
  assert.deepEqual(t[1], ["x,1", "line\nbreak", "3"]);
  assert.deepEqual(t[2], ['quote"d', "e", "f"]);
});

test("parseDelimited auto-detects tab vs comma", () => {
  assert.deepEqual(parseDelimited("a\tb\n1\t2")[1], ["1", "2"]);
});

test("csvToMatrix maps columns by fuzzy header names", () => {
  const csv = [
    "Headline,Date published,Post reach,Total interactions,Format",
    'Gold mine scandal exposed,3 March 2025,"1,307",13,Investigation',
    "Hospital floods after rains,2025-04-02,8862,37,News article",
  ].join("\n");
  const { rows, issues } = csvToMatrix(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Gold mine scandal exposed");
  assert.equal(rows[0].reach, 1307);
  assert.equal(rows[0].engagement, 13);
  assert.equal(rows[0].month, "March");
  assert.equal(rows[0].type, "Investigation");
  assert.equal(rows[1].month, "April");          // ISO date → month
  assert.equal(rows[1].type, "News/Article");
});

test("csvToMatrix errors clearly when required columns are missing", () => {
  const { rows, issues } = csvToMatrix("name,colour\nfoo,red");
  assert.equal(rows.length, 0);
  assert.ok(issues.some(i => i.field === "reach"));
  assert.ok(issues.some(i => i.field === "engagement"));
});

test("detectFormat recognises CSV/TSV text but not prose", () => {
  assert.equal(detectFormat(Buffer.from("title,reach,engagement\na,1,2\n")), "csv");
  assert.equal(detectFormat(Buffer.from("a\tb\tc\n1\t2\t3\n")), "csv");
  assert.equal(detectFormat(Buffer.from("just some prose with no delimiters\n")), "unknown");
});
