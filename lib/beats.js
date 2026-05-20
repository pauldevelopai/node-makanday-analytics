// src/beats.js
// The beat taxonomy is intentionally isolated and human-editable.
// A GROUNDED AI champion can re-map beats for their own newsroom
// without touching ingestion, analytics, or the dashboard.
//
// Each beat is a name -> RegExp tested against the story headline.
// A story can match several beats (that is expected and useful).
// Order does not matter; ranking happens in analytics.

export const BEATS = {
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

export const FALLBACK_BEAT = "Other";

export function tagBeats(headline) {
  const hit = [];
  for (const [name, re] of Object.entries(BEATS)) {
    if (re.test(headline)) hit.push(name);
  }
  return hit.length ? hit : [FALLBACK_BEAT];
}

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
