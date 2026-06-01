/**
 * lib/store.js — host.store helpers for the data that lives OUTSIDE the immutable
 * stories table: per-source metadata and per-story enrichment.
 *
 * Why host.store and not host.db: the lite host's host.db is a JSON shim that only
 * understands the ingest INSERT/DELETE/SELECT shapes — it has NO UPDATE and NO
 * ON CONFLICT. host.store (get/put/delete/list) behaves identically on the lite
 * host (JSON files) and hosted (Postgres node_analytics_store), so mutable, keyed
 * data (sheet URLs, "last refreshed", added links, scraped article text) works the
 * same in both. The stories table stays append/replace-only, as the shim expects.
 *
 * Collections:
 *   sources  — key = source_label → { kind, sheet_url, row_count, last_refreshed, created_at }
 *   extras   — key = source_label → { [n]: { url, unique_readers, pageviews,
 *                                            article_text, scraped_at, scrape_status } }
 */

// ── Per-source metadata (#1, #3) ─────────────────────────────────────
export async function listSourceMeta(host) {
  const items = await host.store.list('sources').catch(() => []);
  const out = {};
  for (const it of items) if (it?.key) out[it.key] = it.value;
  return out;
}
export async function getSourceMeta(host, label) {
  return (await host.store.get('sources', label).catch(() => null)) || null;
}
export async function setSourceMeta(host, label, patch) {
  const cur = (await getSourceMeta(host, label)) || { created_at: new Date().toISOString() };
  const next = { ...cur, ...patch };
  await host.store.put('sources', label, next);
  return next;
}
export async function deleteSourceMeta(host, label) {
  await host.store.delete('sources', label).catch(() => {});
}

// ── Per-source story enrichment (#4 readership, #5 url, #6 article_text) ──
// One store value per source: { [n]: {...} }. Keyed by the row number `n` so it
// merges cleanly onto stories regardless of host. Replace-ingest overwrites it.
export async function getExtras(host, label) {
  return (await host.store.get('extras', label).catch(() => null)) || {};
}
export async function setExtras(host, label, obj) {
  await host.store.put('extras', label, obj || {});
}
/** Merge a patch into one story's extras (e.g. add a url, store scraped text). */
export async function patchExtra(host, label, n, patch) {
  const all = await getExtras(host, label);
  all[n] = { ...(all[n] || {}), ...patch };
  await setExtras(host, label, all);
  return all[n];
}
/** Attach extras onto a list of story rows (by n). Overlay wins for url. */
export function mergeExtras(rows, extras) {
  if (!extras || !rows) return rows;
  return rows.map((r) => {
    const e = extras[r.n];
    if (!e) return r;
    return {
      ...r,
      url: e.url || r.url || null,
      unique_readers: e.unique_readers ?? r.unique_readers ?? null,
      pageviews: e.pageviews ?? r.pageviews ?? null,
      article_text: e.article_text || null,
      scraped_at: e.scraped_at || null,
      scrape_status: e.scrape_status || null,
    };
  });
}
