/**
 * lib/history.js — a durable, browsable record of everything the Node has produced:
 * every editorial brief, strategy recommendation and set of story ideas, PLUS a dated
 * snapshot of the audience picture at the time each was made.
 *
 * Why this exists: the activity log (node_analytics_activity) is a capped audit trail —
 * it rotates at 200 rows and its UI only replays ingests and briefs. So a recommendation
 * or a set of story ideas was gone the moment you closed the page, and there was no way to
 * see how the audience looked when a past decision was made. This keeps that history, so
 * decisions build on the last ones instead of starting cold each time.
 *
 * Storage = host.store (collection "history"), which behaves identically on the lite host
 * (JSON files, your own machine) and hosted (Postgres node_analytics_store) — so the same
 * code gives every newsroom their own private, persistent history in both modes.
 */

const COLLECTION = 'history';
const MAX_ENTRIES = 300;   // a newsroom makes a handful a week; prune the oldest beyond this

// A compact, self-contained picture of the audience data a decision was based on, taken
// from a fullReport. Small on purpose — enough to recognise the moment (how many stories,
// the median rate, the leading beats and stories, what was rising/fading) without keeping
// the whole matrix. So you can look back and see the state the advice was grounded in.
export function snapshotMetrics(report) {
  if (!report) return null;
  const round2 = (x) => (typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null);
  return {
    stories: report.topline?.stories ?? null,
    medianRate: round2(report.topline?.medianRate),
    reachFloor: report.reachFloor ?? null,
    topBeats: (report.byBeat || []).slice(0, 6).map((b) => ({ beat: b.beat, medianRate: b.medianRate, n: b.n })),
    topStories: (report.signalLeaders || []).slice(0, 5).map((d) => ({ title: d.title, rate: round2(d.rate), reach: d.reach })),
    rising: (report.risingFading || []).filter((x) => x.direction === 'rising').map((x) => x.beat),
    fading: (report.risingFading || []).filter((x) => x.direction === 'fading').map((x) => x.beat),
  };
}

// Sortable, collision-resistant id: ISO timestamp (so lexical order = chronological) + a
// short random suffix so two entries in the same millisecond don't overwrite each other.
function newId() {
  return new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 7);
}

/**
 * Record one thing the Node did. `kind` ∈ brief | recommend | ideas | snapshot.
 * `body` is the full markdown output (null for a bare data snapshot); `metrics` is the
 * audience snapshot at the time. Never throws — history must not break the thing it records.
 */
export async function saveHistory(host, { kind, source, title, body, metrics } = {}) {
  if (!host?.store?.put) return null;
  const entry = {
    id: newId(),
    ts: new Date().toISOString(),
    kind,
    source: source || 'all',
    title: title || null,
    body: body || null,
    metrics: metrics || null,
    newsroom: host.meta?.newsroom || null,
  };
  try {
    await host.store.put(COLLECTION, entry.id, entry);
    await prune(host);
  } catch { /* history is best-effort */ }
  return entry;
}

async function prune(host) {
  const items = await host.store.list(COLLECTION).catch(() => []);
  if (items.length <= MAX_ENTRIES) return;
  const sorted = items.map((i) => i.value).filter(Boolean).sort((a, b) => (a.ts < b.ts ? -1 : 1));
  for (const d of sorted.slice(0, sorted.length - MAX_ENTRIES)) {
    await host.store.delete(COLLECTION, d.id).catch(() => {});
  }
}

// The timeline list — newest first, filterable by kind/source. Omits the heavy `body`;
// carries just enough (title + a metrics topline) to scan and choose what to reopen.
export async function listHistory(host, { kind, source } = {}) {
  const items = await host.store.list(COLLECTION).catch(() => []);
  let entries = items.map((i) => i.value).filter(Boolean);
  if (kind) entries = entries.filter((e) => e.kind === kind);
  if (source && source !== 'all') entries = entries.filter((e) => e.source === source);
  entries.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return entries.map((e) => ({
    id: e.id, ts: e.ts, kind: e.kind, source: e.source, title: e.title,
    metrics: e.metrics ? { stories: e.metrics.stories, medianRate: e.metrics.medianRate } : null,
    hasBody: !!e.body,
  }));
}

export async function getHistoryEntry(host, id) {
  return (await host.store.get(COLLECTION, id).catch(() => null)) || null;
}

export async function deleteHistoryEntry(host, id) {
  await host.store.delete(COLLECTION, id).catch(() => {});
  return { ok: true, deleted: id };
}
