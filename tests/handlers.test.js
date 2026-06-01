// tests/handlers.test.js
// The setup handlers write a single shared .env / process.env, so they must be
// inert in hosted (multi-tenant) mode — otherwise one tenant could clobber the
// shared AI key for everyone. These tests pin that boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSetupStatus, postSetup, getActivity } from "../lib/handlers.js";

const hostedHost = { meta: { runtime_version: "hosted", newsroom: "Acme" }, tablePrefix: "node_analytics_" };
const localHost  = { meta: { runtime_version: "0.11.1", newsroom: null }, tablePrefix: "node_analytics_" };

test("getSetupStatus reports managed + configured in hosted mode", async () => {
  const s = await getSetupStatus(hostedHost);
  assert.equal(s.configured, true);
  assert.equal(s.managed, true);
  // Never leak which keys the shared box holds.
  assert.ok(!("hasAnthropicKey" in s));
  assert.ok(!("hasOpenAIKey" in s));
});

test("postSetup refuses to write in hosted mode", async () => {
  await assert.rejects(
    () => postSetup(hostedHost, { provider: "anthropic", apiKey: "sk-ant-malicious-overwrite" }),
    /managed centrally/i
  );
});

test("postSetup still validates input in local mode", async () => {
  // Bad provider is rejected before any .env write is attempted.
  await assert.rejects(() => postSetup(localHost, { provider: "nope", apiKey: "x".repeat(20) }), /Anthropic or OpenAI/i);
  await assert.rejects(() => postSetup(localHost, { provider: "anthropic", apiKey: "short" }), /key box/i);
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
