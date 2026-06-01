/**
 * lib/scrape.js — best-effort fetch of a linked story, reduced to readable text.
 *
 * Server-side (the browser can't cross-origin fetch arbitrary publisher sites).
 * Adapted from node-verifier/lib/fetch-url.js: AbortController timeout, redirect
 * follow, friendly UA, content-type guard, regex strip — with a light readability
 * pass (prefer <article>/<main>). Returns { status, text } and NEVER throws.
 * No AI, no paid API — only egress bandwidth. Paywalled/blocked pages degrade to
 * { status:'blocked'|'empty', text:null } so the caller can record and move on.
 */

export async function fetchArticleText(url, { timeoutMs = 8000, maxChars = 12000 } = {}) {
  if (!url || !/^https?:\/\//i.test(url)) return { status: 'bad_url', text: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AudienceSignal/1.0; +https://grounded.developai.co.za)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return { status: res.status === 401 || res.status === 403 ? 'blocked' : `error_${res.status}`, text: null };
    const ctype = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(ctype)) return { status: 'not_text', text: null };
    const html = await res.text();
    const text = htmlToText(html).slice(0, maxChars);
    return { status: text ? 'ok' : 'empty', text: text || null };
  } catch {
    return { status: 'error', text: null };
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html) {
  let h = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  // Light readability: if there's an <article> or <main>, keep just that — drops
  // nav/header/footer/sidebars for a cleaner learning signal.
  const article = h.match(/<article[\s\S]*?<\/article>/i);
  const main = h.match(/<main[\s\S]*?<\/main>/i);
  if (article && article[0].length > 400) h = article[0];
  else if (main && main[0].length > 400) h = main[0];
  return h
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&rsquo;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
