/**
 * lib/text.js — tiny, dependency-free text utilities for headline analysis.
 *
 * Tokenisation + a compact English stop-word list + n-gram extraction. Shared by
 * the word-resonance analysis (which words/phrases move engagement) and reused
 * wherever headline text is broken into terms. No NLP library — just enough to
 * find the signal in short headlines, editable like the beats taxonomy.
 */

// Common words that carry no topical signal. Deliberately compact — kept short
// so genuinely meaningful short words (e.g. "tax", "war") survive.
export const STOPWORDS = new Set([
  "a","an","the","and","or","but","if","then","so","as","of","at","by","for","with",
  "about","into","onto","to","from","in","on","off","out","up","down","over","under",
  "is","are","was","were","be","been","being","am","do","does","did","has","have","had",
  "i","you","he","she","it","we","they","them","his","her","its","our","your","their",
  "this","that","these","those","there","here","what","which","who","whom","whose",
  "how","when","where","why","not","no","yes","can","will","would","should","could",
  "may","might","must","shall","than","too","very","just","more","most","some","any",
  "all","both","each","few","other","new","old","get","got","says","said","after",
  "before","amid","via","per","s","t","re","ve","ll","d","m","o"
]);

/** Lowercase, split on non-letters, drop empties. Keeps intra-word apostrophes out. */
export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[''`]/g, "")          // drop apostrophes so "don't" → "dont"
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** Content tokens: tokens minus stop-words and 1-character noise. */
export function contentTokens(text) {
  return tokenize(text).filter(w => w.length > 1 && !STOPWORDS.has(w));
}

/** Distinct content unigrams in a headline (deduped — presence, not frequency). */
export function unigrams(text) {
  return [...new Set(contentTokens(text))];
}

/**
 * Distinct content bigrams (adjacent content-word pairs) in a headline.
 * Built from the stop-word-filtered token stream so "the mining boom" → "mining boom".
 */
export function bigrams(text) {
  const toks = contentTokens(text);
  const out = new Set();
  for (let i = 0; i < toks.length - 1; i++) out.add(`${toks[i]} ${toks[i + 1]}`);
  return [...out];
}
