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

  // (Further routes added per phase: DELETE /api/sources/:label, /api/links,
  //  /api/scrape, /api/recommend.)
}
