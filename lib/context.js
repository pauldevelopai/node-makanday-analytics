/**
 * lib/context.js — the newsroom-context seam (#8 / #10).
 *
 * Geography + audience + about the newsroom Audience Signal is serving. Stored
 * node-locally in host.store (collection 'config', key 'newsroom_context') so it
 * works identically local + hosted. The overlapping fields (about/audience/beats)
 * also sync to the tracker's Newsroom Profile from the FRONTEND (same-origin).
 *
 * THE FUTURE CROSS-NODE SEAM: getContext()/saveContext() are the single read/write
 * point. When the runtime later exposes a shared `host.profile` + grounded_newsroom_*
 * layer, only these two functions change — every consumer (the report banner, the
 * recommendations prompt) calls getContext(host) and is unaffected.
 */

const COLLECTION = 'config';
const KEY = 'newsroom_context';

export const CONTEXT_FIELDS = [
  'country', 'region', 'city', 'languages', // geography (#8)
  'audience', 'about', 'beats_note',         // overlaps the tracker Newsroom Profile
];

export async function getContext(host) {
  const c = await host.store.get(COLLECTION, KEY).catch(() => null);
  return c || null;
}

export async function saveContext(host, fields = {}) {
  const cur = (await getContext(host)) || {};
  const next = { ...cur };
  for (const k of CONTEXT_FIELDS) {
    if (fields[k] !== undefined) next[k] = typeof fields[k] === 'string' ? fields[k].trim() : fields[k];
  }
  if (fields.extra !== undefined) next.extra = fields.extra; // node-only richer context
  next.updated_at = new Date().toISOString();
  await host.store.put(COLLECTION, KEY, next);
  return next;
}

/** True when we have too little context to interpret the data well (drives the prompt banner). */
export function contextIsThin(c) {
  if (!c) return true;
  return !(c.country || c.region) || !c.audience;
}

/** One-line grounding string for AI prompts (recommendations, briefs). */
export function formatContextForPrompt(c) {
  if (!c) return '';
  const where = [c.city, c.region, c.country].filter(Boolean).join(', ');
  const parts = [];
  if (where) parts.push(`Newsroom location: ${where}`);
  if (c.languages) parts.push(`Languages: ${c.languages}`);
  if (c.audience) parts.push(`Audience: ${c.audience}`);
  if (c.about) parts.push(`About: ${c.about}`);
  if (c.beats_note) parts.push(`Beats/focus: ${c.beats_note}`);
  return parts.join('\n');
}
