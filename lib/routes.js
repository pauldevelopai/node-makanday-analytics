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
import { setSourceMeta, deleteSourceMeta } from './store.js';

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

  // (Further routes added per phase: /api/links, /api/scrape, /api/recommend.)
}
