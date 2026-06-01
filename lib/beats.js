// src/beats.js
// The beat taxonomy is intentionally isolated and human-editable.
// A GROUNDED AI champion can re-map beats for their own newsroom
// without touching ingestion, analytics, or the dashboard.
//
// Each beat is a name -> RegExp tested against the story headline.
// A story can match several beats (that is expected and useful).
// Order does not matter; ranking happens in analytics.
//
// DEFAULT_BEATS is deliberately GENERIC — it works for any English-language
// newsroom out of the box. Two ways to specialise it for your coverage:
//   1. Edit DEFAULT_BEATS below by hand (see docs/MAKE_IT_YOUR_OWN.md), or
//   2. Use the "Fit beats to my coverage" button — an AI reads your headlines
//      and stores a fitted taxonomy, applied via compileBeats() at report time.
// EXAMPLE_BEATS_ZAMBIA (bottom of file) is a worked example of a hand-tuned set.

export const DEFAULT_BEATS = {
  "Politics & government":
    /\belection|\bvote|voter|parliament|congress|senate|government|minister\b|president|\bpolicy|\bbill\b|legislation|council|mayor|governor|campaign|democracy|referendum|cabinet|diplomat/i,
  "Business & economy":
    /econom|business|\bmarket|\btrade\b|company|companies|\bjobs?\b|\btax|budget|\bbank|inflation|\bprices?\b|invest|industry|finance|startup|entrepreneur|stocks?|currency|wages?/i,
  "Crime & justice":
    /police|\bcourt|\bcrime|arrest|\btrial|prison|murder|fraud|corrupt|theft|robbery|justice|lawsuit|prosecut|\bjail|smuggl|\bgang\b|homicide/i,
  "Health & medicine":
    /health|hospital|doctor|disease|\bvirus|covid|\bdrug|medical|medicine|patients?|vaccine|mental health|clinic|outbreak|epidemic|surgery|\bnurse/i,
  "Environment & climate":
    /climate|environment|pollut|forest|\bwater\b|\benergy|wildlife|\bflood|drought|mining|\bmine\b|conservation|emission|\bcarbon|renewable|deforest|biodiversity|wildfire/i,
  "Education":
    /\bschool|student|universit|education|teacher|\bexam|college|pupils?|campus|tuition|curriculum|literacy|scholarship/i,
  "Housing & land":
    /housing|\bhouse\b|\bhomeless|\bland\b|evict|informal settlement|\btenant|\brent\b|shelter|squatter|resettle/i,
  "Gender & women's rights":
    /\bwomen\b|\bgender|\bgirls?\b|feminis|domestic violence|\bgbv\b|maternal|sexual|widow/i,
  "Migration & refugees":
    /migrant|migration|refugee|asylum|immigration|displace|\bborder\b|deport|stateless/i,
  "Poverty & inequality":
    /poverty|inequalit|\bpoor\b|welfare|hunger|destitut|food security|cost of living|\bslum/i,
  "Religion & culture":
    /religi|\bchurch|mosque|\bfaith\b|\bculture|cultural|heritage|tradition|festival|\barts?\b|museum/i,
  "Rights & protest":
    /\brights?\b|protest|activis|demonstration|civil society|freedom|discriminat|\bmarch\b|strike\b/i,
  "Family & children":
    /\bfamily|families|children|\bchild\b|youth|parent|orphan|\bkids?\b/i,
  "Sport":
    /football|soccer|cricket|rugby|\bmatch\b|\bteam\b|player|league|\bcup\b|championship|athlete|olympic|tournament|\bgoal|coach|stadium/i,
  "Technology & science":
    /technolog|\btech\b|science|research|digital|internet|\bai\b|\bdata\b|software|\bspace\b|innovat|robot|cyber|satellite|algorithm/i
};

// Back-compat alias: existing imports of BEATS keep working and resolve to the
// generic default. Pass an explicit taxonomy to tagBeats/enrich/fullReport to
// override per report (that's how the AI-fitted taxonomy is applied).
export const BEATS = DEFAULT_BEATS;

export const FALLBACK_BEAT = "Other";

export function tagBeats(headline, beats = DEFAULT_BEATS) {
  const hit = [];
  for (const [name, re] of Object.entries(beats)) {
    if (re.test(headline)) hit.push(name);
  }
  return hit.length ? hit : [FALLBACK_BEAT];
}

// Compile an AI-fitted (or stored) taxonomy — a list of { name, keywords[] } —
// into the { name: RegExp } shape tagBeats expects. Keywords are escaped so they
// can't form a broken/abusive pattern. Returns null if nothing usable, so the
// caller falls back to DEFAULT_BEATS.
const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function compileBeats(list) {
  if (!Array.isArray(list)) return null;
  const out = {};
  for (const item of list) {
    const name = String(item?.name || "").trim();
    const kws = (Array.isArray(item?.keywords) ? item.keywords : [])
      .map(k => String(k).trim()).filter(Boolean);
    if (!name || !kws.length || out[name]) continue;
    out[name] = new RegExp(kws.map(escapeRe).join("|"), "i");
  }
  return Object.keys(out).length ? out : null;
}

// A worked example of a hand-tuned taxonomy (the original MakanDay / Zambia set).
// Not used by default — kept as a reference for newsrooms editing DEFAULT_BEATS.
export const EXAMPLE_BEATS_ZAMBIA = {
  "Mining & minerals":
    /mining|\bmine\b|miner|copper|gold|emerald|nickel|mineral|zccm|gemfields|munali|g-factor|carbon forest|limestone/i,
  "Corruption & graft":
    /corrupt|scandal|brib|fraud|syndicate|jobs for sale|boreholes for sale|sex-for|hijack|coup|kickback|unmasked|loot|ghost guardian|stolen|sells? out|sell outs/i,
  "Whistleblowers & ACC":
    /whistleblow|\bacc\b|anti-corruption|supreme court|prosecut|bankrupt/i,
  "Health & medicine":
    /hospital|health|doctor|burns?|drug|syphilis|treatment|patients|dose|medical|alcohol/i,
  "Environment & forests":
    /forest|hardwood|mukula|mukwa|logging|charcoal|fish|carbon|pollut|toxic|spill|sino metals|environment|deforest|destructive fishing|copperbelt/i,
  "Water & infrastructure":
    /flood|\bwater\b|sewer|\broad\b|market|borehole|garbage|filling station|infrastructure/i,
  "Politics & elections":
    /election|voter|budget|parliament|bill 7|constitution|opposition|president|lungu|hichilema|tasila|chawama|reform/i,
  "Justice, rights & land":
    /justice|police|court|detention|human rights|traffick|child|abuse|eviction|\bland\b|prison|disability/i,
  "Labour & economy":
    /worker|salary|\bpay\b|intern|unpaid|jobs|\btax\b|kwacha|trade|\bsme\b|farmer|cash-for-work|creatives|emolument|fra/i
};

// Headline-shape features. Cheap, surprisingly predictive of resonance,
// and easy for an editor to act on ("we convert better with a quote in the hed").
export function headlineFeatures(headline) {
  const h = headline.trim();
  const letters = h.replace(/[^A-Za-z]/g, "");
  const upper = h.replace(/[^A-Z]/g, "");
  return {
    hasQuestion: /\?/.test(h),
    hasQuote: /["“”']/.test(h),
    hasColon: /:/.test(h),
    hasNumber: /\d/.test(h),
    isShouty: letters.length > 0 && upper.length / letters.length > 0.6
  };
}
