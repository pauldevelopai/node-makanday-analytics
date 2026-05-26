/**
 * lib/pg-host.js — multi-tenant Postgres host (the hosted counterpart to the
 * runtime's lite host).
 *
 * Same host interface the Node's handlers already target (db / ai / parse / log
 * / feedback / meta / tablePrefix), but:
 *   - storage is Postgres, every query scoped to a per-request newsroom_id
 *   - AI uses the server's single shared key (cheap Haiku)
 *
 * The Node's application code (lib/handlers.js, ingest.js, analytics.js) is
 * UNCHANGED — it never knows whether it's talking to files or Postgres. The
 * SQL the handlers write is real Postgres SQL (the lite host fakes it; here it
 * runs for real, with $1 = newsroom_id auto-bound exactly as the interface
 * promises).
 *
 * Built for server-hosted.js. One pg host is created per request, scoped to the
 * signed-in newsroom.
 */

import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

const SLUG = "analytics";
const PREFIX = `node_${SLUG}_`;

// Columns the activity log may carry. log.run() fills whichever are present.
const ACTIVITY_COLS = [
  "ts", "kind", "op", "source", "success", "provider", "model", "used_fallback",
  "duration_ms", "story_count", "errors", "warnings", "uncategorised",
  "prompt", "response", "error"
];

/** Create the Node's tables if they don't exist. Call once at boot. */
export async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${PREFIX}stories (
      id           bigserial PRIMARY KEY,
      newsroom_id  text NOT NULL,
      source_label text NOT NULL,
      n            integer,
      title        text,
      month        text,
      story_date   text,
      reach        integer,
      engagement   integer,
      type         text,
      ingested_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ${PREFIX}stories_nr  ON ${PREFIX}stories (newsroom_id, source_label);

    CREATE TABLE IF NOT EXISTS ${PREFIX}quality (
      id            bigserial PRIMARY KEY,
      newsroom_id   text NOT NULL,
      source_label  text NOT NULL,
      story_count   integer,
      errors        integer,
      warnings      integer,
      info          integer,
      uncategorised integer,
      issues        jsonb,
      ingested_at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ${PREFIX}quality_nr  ON ${PREFIX}quality (newsroom_id);

    CREATE TABLE IF NOT EXISTS ${PREFIX}activity (
      n             bigserial PRIMARY KEY,
      newsroom_id   text NOT NULL,
      ts            text,
      kind          text,
      op            text,
      source        text,
      success       boolean,
      provider      text,
      model         text,
      used_fallback boolean,
      duration_ms   integer,
      story_count   integer,
      errors        integer,
      warnings      integer,
      uncategorised integer,
      prompt        text,
      response      text,
      error         text
    );
    CREATE INDEX IF NOT EXISTS ${PREFIX}activity_nr ON ${PREFIX}activity (newsroom_id, n);
  `);
}

export function createPgHost({ pool, newsroomId, newsroom, nodeVersion } = {}) {
  if (!pool) throw new Error("createPgHost: pool is required");
  if (!newsroomId) throw new Error("createPgHost: newsroomId is required");

  const ctx = Object.freeze({ newsroomId, userId: newsroomId, role: "owner" });

  // db.query(table, sql, userParams) — real Postgres, $1 = newsroom_id auto-bound.
  const runQuery = async (client, _table, sql, userParams = []) => {
    const res = await client.query(sql, [newsroomId, ...userParams]);
    return { rows: res.rows, rowCount: res.rowCount };
  };
  const db = {
    query: (table, sql, params) => runQuery(pool, table, sql, params),
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({ query: (t, s, p) => runQuery(client, t, s, p) });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
  };

  // AI: single shared server key, Haiku. Same return shape as the lite host.
  let anthropic = null;
  const client = () => {
    if (!anthropic) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("Server AI key (ANTHROPIC_API_KEY) is not configured.");
      }
      anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return anthropic;
  };
  async function chat(input, opts = {}) {
    const model = opts.model || process.env.MODEL || "claude-haiku-4-5";
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    const msg = await client().messages.create({
      model,
      max_tokens: opts.maxTokens || 1000,
      ...(opts.system ? { system: opts.system } : {}),
      messages
    });
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    return { text, provider: "anthropic", model, usedFallback: false };
  }

  async function appendActivity(entry) {
    const e = { ts: new Date().toISOString(), ...entry };
    const cols = ACTIVITY_COLS.filter(c => e[c] !== undefined && e[c] !== null);
    const placeholders = cols.map((_, i) => `$${i + 2}`); // $1 = newsroom_id
    try {
      await pool.query(
        `INSERT INTO ${PREFIX}activity (newsroom_id${cols.length ? "," + cols.join(",") : ""})
         VALUES ($1${placeholders.length ? "," + placeholders.join(",") : ""})`,
        [newsroomId, ...cols.map(c => e[c])]
      );
    } catch (err) {
      console.error("[activity] insert failed:", err.message);
    }
  }

  const meta = {
    slug: SLUG,
    newsroom: newsroom || null,
    node_version: nodeVersion || "unknown",
    runtime_version: "hosted",
    host_id: null
  };

  return {
    ctx,
    tablePrefix: PREFIX,
    meta,
    db,
    ai: { chat },
    parse: { docxToHtml: async (buffer) => (await mammoth.convertToHtml({ buffer })).value },
    log: {
      run: (m) => appendActivity({ kind: "run", ...m }),
      edit: (m) => appendActivity({ kind: "edit", ...m }),
      error: ({ op, error }) => appendActivity({
        kind: "error", op: op || "unknown", success: false,
        error: error?.message || String(error || "(no message)")
      })
    },
    feedback: {
      submit: async ({ type, message }) => {
        const msg = String(message || "").slice(0, 4000).trim();
        if (!msg) throw new Error("Empty feedback message");
        await appendActivity({ kind: "feedback", op: "feedback", response: `[${type || "other"}] ${msg}` });
        return { file: null, entry: { type, message: msg } };
      }
    }
  };
}
