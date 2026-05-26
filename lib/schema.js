/**
 * lib/schema.js — Audience Signal's own Postgres tables (hosted mode).
 *
 * Passed to createHostedServer({ ensureSchema }). The generic activity log
 * (node_analytics_activity) is created by the runtime; these are this Node's
 * data tables. Mirrors the SQL the handlers/ingest write.
 */
export async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS node_analytics_stories (
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
    CREATE INDEX IF NOT EXISTS node_analytics_stories_nr ON node_analytics_stories (newsroom_id, source_label);

    CREATE TABLE IF NOT EXISTS node_analytics_quality (
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
    CREATE INDEX IF NOT EXISTS node_analytics_quality_nr ON node_analytics_quality (newsroom_id);
  `);
}
