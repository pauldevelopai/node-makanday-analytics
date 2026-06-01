/**
 * lib/routes.js — Audience Signal's custom routes (mutations + reads that don't
 * fit the runtime's standard GET-query-param surface).
 *
 *   Local  (index.js):        mountAnalyticsRoutes(app, () => host)
 *   Hosted (server-hosted.js): mountAnalyticsRoutes(app, hostFor)   // per-request host
 *
 * getHost(req) → a fixed lite host locally, or a per-request newsroom-scoped
 * Postgres host online. Always go through the host interface. Pattern mirrors
 * node-verifier/lib/listener-routes.js (the wrap() helper + per-request host).
 */

import { getContext, saveContext } from './context.js';
import { setSourceMeta, deleteSourceMeta, getExtras, setExtras, patchExtra } from './store.js';
import { recommend } from './handlers.js';
import { fetchArticleText } from './scrape.js';

export function mountAnalyticsRoutes(app, getHost) {
  // Keep the chrome-injected app shell uncached so UI updates show on a normal
  // reload (the runtime serves index.html with no cache header). Runs before the
  // static/catch-all handlers; /api is untouched.
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) res.set('Cache-Control', 'no-cache');
    next();
  });

  const wrap = (fn) => async (req, res) => {
    let host;
    try {
      host = getHost(req);
      res.json(await fn(req, host));
    } catch (err) {
      console.error('analytics route error:', err);
      res.status(500).json({ ok: false, error: err.message || 'route error' });
      try { await host?.log?.error?.({ op: req.path, error: err, context: { method: req.method } }); }
      catch { /* swallow */ }
    }
  };

  // ── Newsroom context (#8 / #10) ──────────────────────────────────
  app.get('/api/context', wrap(async (_req, host) => ({ ok: true, context: await getContext(host) })));
  app.put('/api/context', wrap(async (req, host) => ({ ok: true, context: await saveContext(host, req.body || {}) })));

  // ── Source management (#1, #3) ───────────────────────────────────
  // PUT source provenance (used to associate a Google Sheet URL after ingest, so
  // the dashboard can offer "Refresh from sheet").
  app.put('/api/sources/:label', wrap(async (req, host) => {
    const label = req.params.label;
    const patch = {};
    if (req.body?.sheet_url) { patch.sheet_url = String(req.body.sheet_url).trim(); patch.kind = 'sheet'; }
    if (req.body?.kind) patch.kind = req.body.kind;
    return { ok: true, source: await setSourceMeta(host, label, patch) };
  }));

  // DELETE a whole source: stories + quality (host.db) + meta + extras (host.store).
  app.delete('/api/sources/:label', wrap(async (req, host) => {
    const label = req.params.label;
    const T = host.tablePrefix;
    await host.db.query(`${T}stories`, `DELETE FROM ${T}stories WHERE newsroom_id=$1 AND source_label=$2`, [label]);
    await host.db.query(`${T}quality`, `DELETE FROM ${T}quality WHERE newsroom_id=$1 AND source_label=$2`, [label]).catch(() => {});
    await deleteSourceMeta(host, label);
    await host.store.delete('extras', label).catch(() => {});
    await host.log.run({ op: 'source_delete', source: label }).catch(() => {});
    return { ok: true, deleted: label };
  }));

  // ── AI recommendations (#9) ──────────────────────────────────────
  app.post('/api/recommend', wrap(async (req, host) => recommend(host, req.body || {})));

  // ── Story links (#5): list stories + which lack a url; save added links ──
  app.get('/api/links', wrap(async (req, host) => {
    const source = req.query?.source;
    if (!source) return { ok: false, message: 'source required' };
    const T = host.tablePrefix;
    const res = await host.db.query(`${T}stories`,
      `SELECT n,title FROM ${T}stories WHERE newsroom_id=$1 AND source_label=$2 ORDER BY n`, [source]);
    const extras = await getExtras(host, source);
    const stories = res.rows.map(r => ({ n: r.n, title: r.title, url: (extras[r.n] && extras[r.n].url) || null }));
    return { ok: true, stories, missing: stories.filter(s => !s.url).length, total: stories.length };
  }));
  app.post('/api/links', wrap(async (req, host) => {
    const { source, links } = req.body || {};
    if (!source || !Array.isArray(links)) return { ok: false, message: 'source + links[] required' };
    let saved = 0;
    for (const l of links) {
      const url = String(l?.url || '').trim();
      if (l?.n != null && /^https?:\/\//i.test(url)) { await patchExtra(host, source, l.n, { url }); saved++; }
    }
    await host.log.run({ op: 'links_add', source, count: saved }).catch(() => {});
    return { ok: true, saved };
  }));

  // ── Scrape linked stories → article_text (#6) ────────────────────
  // Reads each story's url and stores the readable article text as newsroom
  // learning. Idempotent/resumable: skips stories already scraped. Fetches with
  // small concurrency but writes the store ONCE at the end (no read-modify-write race).
  app.post('/api/scrape', wrap(async (req, host) => {
    const source = req.query?.source || req.body?.source;
    if (!source) return { ok: false, message: 'source required' };
    const extras = await getExtras(host, source);
    const linked = Object.keys(extras).filter(n => extras[n].url);
    const targets = linked.filter(n => !extras[n].article_text);
    const results = {};
    const queue = [...targets];
    const worker = async () => { while (queue.length) { const n = queue.shift(); results[n] = await fetchArticleText(extras[n].url); } };
    await Promise.all([worker(), worker(), worker()]);
    const now = new Date().toISOString();
    let scraped = 0, blocked = 0, failed = 0;
    for (const n of targets) {
      const r = results[n];
      extras[n] = { ...extras[n], article_text: r.text || null, scraped_at: now, scrape_status: r.status };
      if (r.status === 'ok') scraped++; else if (r.status === 'blocked') blocked++; else failed++;
    }
    await setExtras(host, source, extras);
    await host.log.run({ op: 'scrape', source, scraped, blocked, failed, total: targets.length }).catch(() => {});
    return { ok: true, scraped, blocked, failed, attempted: targets.length, linked: linked.length };
  }));
}
