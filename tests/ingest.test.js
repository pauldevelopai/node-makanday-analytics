// tests/ingest.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMatrixHtml, ingestMatrix } from "../lib/ingest.js";

const tableRow = (n, desc, matrix) =>
  `<tr><td>${n}</td><td>${desc}</td><td>${matrix}</td></tr>`;

const html =
  "<table>" +
  tableRow("#", "Story description", "Social media matrix") + // header -> skipped
  tableRow(1, "Gold mine scandal exposed 1st April 2025",
    "Post reach 1,307, post engagement 13. (Investigation)") +
  tableRow(2, "Hospital floods after rains 2nd April 2025",
    "Post reach 8,862, post engagement 37 (news article)") +
  tableRow(3, 'Forest logging boom 5th June 2025',
    "Post reach 60,000, post engagement 300 (investigation)") +
  // the real-doc "post reach X, post reach Y" typo (engagement recovered):
  tableRow(4, "When money rules 12th September 2025",
    "Post reach 507, post reach 12 (opinion)") +
  // no parseable date:
  tableRow(5, "BLOOD ON THE COPPER Part II",
    "Post reach 1115, post engagement 27 (investigation)") +
  "</table>";

test("parser skips header, parses rows, computes nothing (pure)", () => {
  const { rows, issues } = parseMatrixHtml(html);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].title, "Gold mine scandal exposed");
  assert.equal(rows[0].reach, 1307);
  assert.equal(rows[0].engagement, 13);
  assert.equal(rows[0].type, "Investigation");
});

test("recovers engagement from the reach/reach typo", () => {
  const { rows, issues } = parseMatrixHtml(html);
  const r4 = rows.find(r => r.n === 4);
  assert.equal(r4.engagement, 12);
  assert.ok(issues.some(i => i.n === 4 && i.field === "engagement"));
});

test("reach and engagement parse thousands separators identically (commas or dots)", () => {
  const doc =
    "<table>" +
    tableRow(1, "Comma format 1st April 2025", "Post reach 1,307, post engagement 1,045 (news article)") +
    tableRow(2, "Dot format 2nd April 2025", "Post reach 1.307, post engagement 1.045 (news article)") +
    "</table>";
  const { rows } = parseMatrixHtml(doc);
  assert.equal(rows[0].reach, 1307);
  assert.equal(rows[0].engagement, 1045);
  // The dot-separated row must parse to the same integers — not 13075 / 1 / etc.
  assert.equal(rows[1].reach, 1307);
  assert.equal(rows[1].engagement, 1045);
});

test("flags rows with no parseable date but still keeps them", () => {
  const { rows, issues } = parseMatrixHtml(html);
  assert.ok(rows.some(r => r.n === 5));
  assert.ok(issues.some(i => i.n === 5 && i.field === "date"));
});

// Minimal buffer that passes detectFormat() as a complete .docx: ZIP local-file
// header (PK\x03\x04) + the end-of-central-directory marker (PK\x05\x06). The
// real parsing is mocked via host.parse.docxToHtml, so the body is irrelevant.
const fakeDocx = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("zip-body"),
  Buffer.from([0x50, 0x4b, 0x05, 0x06])
]);

test("ingestMatrix drives the host facade correctly (mock host)", async () => {
  const calls = [];
  const host = {
    tablePrefix: "node_analytics_",
    parse: { docxToHtml: async () => html },
    db: {
      tx: async fn => fn({ query: async (t, sql, p) => { calls.push([t, sql.split("\n")[0].trim(), p]); return { rows: [] }; } })
    },
    log: { run: async m => calls.push(["log", m.op || m.kind]) }
  };
  const res = await ingestMatrix(host, fakeDocx, "matrix-2025");
  assert.equal(res.storyCount, 5);
  assert.equal(res.quality.warnings >= 2, true);          // date + reach/typo
  // ingest.js no longer logs — that's now the handler's job. Only DB calls expected.
  assert.ok(calls.every(c => c[0].startsWith("node_analytics_")));
});
