// tests/handlers.test.js
// The setup handlers write a single shared .env / process.env, so they must be
// inert in hosted (multi-tenant) mode — otherwise one tenant could clobber the
// shared AI key for everyone. These tests pin that boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSetupStatus, postSetup, getActivity, getReport } from "../lib/handlers.js";

const hostedHost = { meta: { runtime_version: "hosted", newsroom: "Acme" }, tablePrefix: "node_analytics_" };
const localHost  = { meta: { runtime_version: "0.11.1", newsroom: null }, tablePrefix: "node_analytics_" };

test("getSetupStatus reports managed + configured in hosted mode", async () => {
  const s = await getSetupStatus(hostedHost);
  assert.equal(s.configured, true);
  assert.equal(s.managed, true);
  assert.equal(s.activeProvider, "anthropic");   // Claude-only Node
  // Never leak which keys the shared box holds.
  assert.ok(!("hasAnthropicKey" in s));
});

test("postSetup refuses to write in hosted mode", async () => {
  // Contract: postSetup never throws — it returns { ok:false, message } so the
  // browser can show feedback. Hosted mode must be a refused no-op.
  const r = await postSetup(hostedHost, { provider: "anthropic", apiKey: "sk-ant-malicious-overwrite" });
  assert.equal(r.ok, false);
  assert.equal(r.serverManaged, true);
  assert.match(r.message, /managed centrally/i);
});

test("postSetup still validates input in local mode (Claude-only)", async () => {
  // Non-Anthropic providers are refused before any .env write is attempted.
  const bad = await postSetup(localHost, { provider: "openai", apiKey: "x".repeat(20) });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /runs on Claude/i);
  const short = await postSetup(localHost, { provider: "anthropic", apiKey: "short" });
  assert.equal(short.ok, false);
  assert.match(short.message, /key box/i);
  // A long key that isn't sk-ant- is refused too.
  const notAnt = await postSetup(localHost, { provider: "anthropic", apiKey: "sk-proj-" + "x".repeat(20) });
  assert.equal(notAnt.ok, false);
  assert.match(notAnt.message, /sk-ant-/);
});

test("getActivity caps to the most recent N, ascending, and flags truncation", async () => {
  // Simulate the lite host (ignores LIMIT) returning the whole log.
  const all = Array.from({ length: 250 }, (_, i) => ({ n: i + 1, op: "brief" }));
  const host = { tablePrefix: "node_analytics_", db: { query: async () => ({ rows: all }) } };
  const out = await getActivity(host);
  assert.equal(out.activity.length, 200);
  assert.equal(out.truncated, true);
  assert.equal(out.activity[0].n, 51);                              // oldest kept
  assert.equal(out.activity[out.activity.length - 1].n, 250);       // newest, ascending
});

test("getActivity does not flag truncation when under the cap", async () => {
  const host = { tablePrefix: "node_analytics_", db: { query: async () => ({ rows: [{ n: 1 }, { n: 2 }] }) } };
  const out = await getActivity(host);
  assert.equal(out.truncated, false);
  assert.equal(out.activity.length, 2);
});

test("getReport attaches a period-over-period comparison when a baseline is named", async () => {
  const mkRows = (eng) => Array.from({ length: 5 }, (_, i) => ({
    n: i + 1, title: `Mining story ${i}`, month: "May", story_date: `${i + 1} May 2025`,
    reach: 1000, engagement: eng, type: "News/Article"
  }));
  const data = { current: mkRows(80), baseline: mkRows(20) };  // current converts far better
  const host = {
    meta: { runtime_version: "hosted" }, tablePrefix: "node_analytics_",
    store: { get: async () => null },
    db: { query: async (_t, _sql, p) => ({ rows: p[0] === "baseline" ? data.baseline : data.current }) }
  };
  const rep = await getReport(host, { source: "current", baseline: "baseline" });
  assert.ok(rep.comparison, "comparison present");
  assert.equal(rep.comparison.labels.baseline, "baseline");
  assert.ok(rep.comparison.topline.rateDelta > 0, "current period has the higher rate");
  // No baseline → no comparison.
  const solo = await getReport(host, { source: "current" });
  assert.equal(solo.comparison, undefined);
});
