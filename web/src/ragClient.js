/**
 * web/src/ragClient.js
 * Client-Side Grounded RAG Retrieval Engine for FarmPlan
 * Enables zero-latency, $0 cost, offline-capable official PAU guidance retrieval
 * for farmer questions in English, Punjabi (Gurmukhi & transliteration), and Hindi.
 * Preserves negation terms, supports Unicode scripts, and abstains safely when evidence is missing.
 */

// Negation-preserving stop words list (Issue 1 & Issue 6)
const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "could", "did", "do", "does", "doing",
  "down", "during", "each", "few", "for", "from", "further", "had", "has",
  "have", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers",
  "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in",
  "into", "is", "it", "it's", "its", "itself", "let's", "me", "more", "most", "my",
  "myself", "of", "off", "on", "once", "only", "or", "other", "ought", "our",
  "ours", "ourselves", "out", "over", "own", "same", "she", "she'd", "she'll", "she's",
  "should", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs",
  "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was",
  "we", "we'd", "we'll", "we're", "we've", "were", "what", "what's", "when", "when's",
  "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with",
  "would", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves",
  "tell", "give", "kisan", "farmer", "crop", "rice", "paddy"
]);

const SYNONYMS = {
  // Negation & Safety
  not: ["never", "prohibited", "strictly", "avoid", "stop", "restriction"],
  no: ["never", "prohibited", "strictly", "avoid", "not"],
  never: ["prohibited", "strictly", "avoid", "not", "continuous", "5"],
  stop: ["termination", "harvest", "combine", "14", "15", "days"],

  // Water
  water: ["irrigation", "awd", "sinchai", "paani", "pani", "submergence", "flooding", "tubewell", "pumping", "schedule"],
  irrigate: ["water", "irrigation", "awd", "sinchai", "paani", "submergence", "schedule", "tubewell"],
  irrigation: ["water", "awd", "sinchai", "paani", "submergence", "schedule", "tubewell"],
  paani: ["water", "irrigation", "awd", "sinchai", "submergence", "tubewell"],
  pani: ["water", "irrigation", "awd", "sinchai", "submergence", "tubewell"],
  sinchai: ["water", "irrigation", "awd", "submergence", "tubewell"],
  awd: ["alternate", "wetting", "drying", "tillering", "hairline", "cracks", "saving", "tubewell"],
  harvest: ["combine", "stop", "irrigation", "termination", "days", "cut", "maturity", "lodging", "14", "15"],
  flowering: ["nissar", "panicle", "initiation", "moisture", "stress", "standing", "water", "5", "never"],

  // Fertilizers
  fertilizer: ["urea", "nitrogen", "dap", "khad", "single", "superphosphate", "phosphorus", "splits", "dose"],
  fertilizers: ["urea", "nitrogen", "dap", "khad", "single", "superphosphate", "phosphorus", "splits", "dose"],
  khad: ["urea", "fertilizer", "dap", "nitrogen", "phosphorus", "splits"],
  urea: ["fertilizer", "nitrogen", "splits", "puddling", "110", "130", "panicle"],
  dap: ["fertilizer", "phosphorus", "superphosphate", "27"],
  zinc: ["khaira", "deficiency", "rusty", "bronze", "blotches", "sulphate", "25"],
  iron: ["chlorosis", "yellow", "white", "interveinal", "ferrous", "dsr"],
  yellow: ["iron", "zinc", "khaira", "chlorosis", "bacterial", "blight", "deficiency"],

  // Weeds
  weed: ["weeds", "herbicide", "pendimethalin", "bispyribac", "pretilachlor", "butachlor", "swank", "motha", "spray", "ghas"],
  weeds: ["weed", "herbicide", "pendimethalin", "bispyribac", "pretilachlor", "butachlor", "swank", "motha", "spray", "ghas"],
  ghas: ["weeds", "weed", "herbicide", "swank", "motha", "bispyribac"],
  herbicide: ["weeds", "spray", "pendimethalin", "bispyribac", "pretilachlor", "butachlor"],
  spray: ["herbicide", "fungicide", "insecticide", "dose", "chemical", "dawai"],
  dawai: ["spray", "herbicide", "fungicide", "insecticide", "medicine"],

  // Insects
  insect: ["insects", "pest", "pests", "worm", "worms", "sundi", "keeda", "keede", "bph", "hopper", "folder", "borer", "caterpillar"],
  insects: ["insect", "pest", "pests", "worm", "worms", "sundi", "keeda", "keede", "bph", "hopper", "folder", "borer", "caterpillar"],
  pest: ["insect", "insects", "pests", "bph", "hopper", "leaf", "folder", "stem", "borer", "keeda"],
  pests: ["insect", "insects", "pest", "bph", "hopper", "leaf", "folder", "stem", "borer", "keeda"],
  worm: ["caterpillar", "stem", "borer", "leaf", "folder", "sundi", "larvae"],
  worms: ["caterpillar", "stem", "borer", "leaf", "folder", "sundi", "larvae"],
  sundi: ["caterpillar", "stem", "borer", "leaf", "folder", "larvae"],
  keeda: ["insect", "pest", "bph", "stem", "borer", "leaf", "folder"],
  keede: ["insect", "pest", "bph", "stem", "borer", "leaf", "folder"],
  hopper: ["bph", "brown", "plant", "hopper", "burn", "triflumezopyrim", "pymetrozine"],
  bph: ["brown", "plant", "hopper", "burn", "triflumezopyrim", "pymetrozine", "alleyways"],

  // Diseases
  disease: ["diseases", "blast", "blight", "sheath", "fungus", "bimari", "rog", "spots", "rot", "tricyclazole"],
  diseases: ["disease", "blast", "blight", "sheath", "fungus", "bimari", "rog", "spots", "rot", "tricyclazole"],
  bimari: ["disease", "blast", "blight", "sheath", "fungus", "tricyclazole"],
  rog: ["disease", "blast", "blight", "sheath", "fungus", "tricyclazole"],
  blast: ["spindle", "spots", "neck", "tricyclazole", "disease"],
  blight: ["bacterial", "wavy", "margin", "sheath", "hexaconazole", "disease"],

  // DSR & Varieties
  dsr: ["direct", "seeded", "rice", "tar-wattar", "drill", "weed", "pendimethalin", "siddhi", "bijai", "8", "10"],
  direct: ["dsr", "seeded", "rice", "tar-wattar", "drill"],
  saline: ["kallar", "sodic", "salt", "brackish", "capillary", "khara", "strictly", "prohibited", "not"],
  kallar: ["saline", "sodic", "salt", "brackish", "capillary", "strictly", "not"],
  sandy: ["raitli", "iron", "chlorosis", "not", "recommended", "dsr", "caution"],
  variety: ["varieties", "pr", "126", "131", "128", "pusa", "44", "duration", "yield", "beej"],
  varieties: ["variety", "pr", "126", "131", "128", "pusa", "44", "duration", "yield", "beej"],
  beej: ["seed", "variety", "certified", "rate", "nursery", "8"],
  seed: ["beej", "rate", "nursery", "marla", "certified", "treatment", "carbendazim", "8"],
  seeds: ["beej", "seed", "rate", "nursery", "marla", "certified", "treatment", "8"],
  nursery: ["seedling", "carbendazim", "streptocycline", "treatment", "marla", "paneeri", "8"],
  paneeri: ["nursery", "seedlings", "transplanting", "marla", "8"],

  // Economics
  cost: ["costs", "expense", "tubewell", "pumping", "diesel", "labour", "savings", "kharcha", "400", "500"],
  costs: ["cost", "expense", "tubewell", "pumping", "diesel", "labour", "savings", "kharcha", "400", "500"],
  kharcha: ["cost", "diesel", "pumping", "labour", "savings"],
  diesel: ["pumping", "tubewell", "cost", "irrigations", "savings", "400", "500"],
  save: ["saving", "savings", "water", "pumping", "incentive", "subsidy", "bachat"],
  savings: ["saving", "save", "water", "pumping", "incentive", "subsidy", "bachat"],
  subsidy: ["incentive", "punjab", "government", "1500", "dsr", "acre"],
  incentive: ["subsidy", "punjab", "government", "1500", "dsr", "acre"],
  stubble: ["straw", "burning", "happy", "seeder", "smart", "residue", "parali"],
  parali: ["stubble", "straw", "burning", "happy", "seeder", "smart"],

  // Gurmukhi (Punjabi)
  "ਪਾਣੀ": ["water", "irrigation", "awd", "sinchai"],
  "ਝੋਨਾ": ["paddy", "rice", "kharif"],
  "ਝੋਨੇ": ["paddy", "rice", "kharif"],
  "ਖਾਦ": ["fertilizer", "urea", "nitrogen", "dap"],
  "ਨਦੀਨ": ["weeds", "herbicide", "spray"],
  "ਕੀੜੇ": ["insects", "pests", "bph"],
  "ਬਿਮਾਰੀ": ["disease", "blast", "blight"],
  "ਵਾਢੀ": ["harvest", "stop", "irrigation", "14", "15"],
  "ਕਟਾਈ": ["harvest", "stop", "irrigation", "14", "15"],

  // Devanagari (Hindi)
  "पानी": ["water", "irrigation", "awd", "sinchai"],
  "धान": ["paddy", "rice", "kharif"],
  "खाद": ["fertilizer", "urea", "nitrogen", "dap"],
  "खरपतवार": ["weeds", "herbicide", "spray"],
  "कीट": ["insects", "pests", "bph"],
  "रोग": ["disease", "blast", "blight"],
  "कटाई": ["harvest", "stop", "irrigation", "14", "15"]
};

/**
 * Unicode-aware tokenizer (Issue 8)
 * Preserves Latin, Gurmukhi, and Devanagari letters and numbers.
 */
export function tokenize(text) {
  if (!text) return [];
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ");
  return cleaned
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Grounded chunk search with safe abstention (Issue 3 & Issue 6)
 */
export function searchChunks(query, chunks, minScore = 0.03) {
  if (!query || !chunks || chunks.length === 0) return null;

  const rawTokens = tokenize(query);
  if (rawTokens.length === 0) return null;

  // Query Expansion via agricultural domain synonyms
  const queryTokens = new Set(rawTokens);
  for (const token of rawTokens) {
    if (SYNONYMS[token]) {
      SYNONYMS[token].forEach((s) => queryTokens.add(s));
    }
  }

  let bestChunk = null;
  let highestScore = 0;

  for (const chunk of chunks) {
    const chunkTokens = tokenize(`${chunk.title} ${chunk.section} ${chunk.safety_conditions || ''} ${chunk.text}`);
    if (chunkTokens.length === 0) continue;

    // Term Frequency in chunk
    const tf = {};
    for (const t of chunkTokens) {
      tf[t] = (tf[t] || 0) + 1;
    }

    let score = 0;
    for (const qToken of queryTokens) {
      if (tf[qToken]) {
        score += (tf[qToken] * 2.0) / Math.sqrt(chunkTokens.length);
      }
    }

    // Boost if title matches
    const titleTokens = tokenize(chunk.title);
    for (const qToken of rawTokens) {
      if (titleTokens.includes(qToken)) {
        score += 1.0;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestChunk = chunk;
    }
  }

  // If score is too low or query is completely non-agricultural (abstain safely)
  if (highestScore < minScore || !bestChunk) {
    return null;
  }

  // Extract the most informative sentences strictly matching query tokens
  const sentences = bestChunk.text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  let answerText = bestChunk.text;
  if (sentences.length > 2) {
    const scored = sentences.map((sentence, idx) => {
      const sTokens = new Set(tokenize(sentence));
      let overlap = 0;
      for (const t of queryTokens) {
        if (sTokens.has(t)) overlap += 2;
      }
      return { idx, sentence, overlap };
    });
    scored.sort((a, b) => b.overlap - a.overlap);
    const top = scored[0];

    // Abstain if no sentence actually matched query evidence (Issue 3 & 6)
    if (top && top.overlap > 0) {
      const selected = [top.sentence];
      if (top.idx + 1 < sentences.length) {
        selected.push(sentences[top.idx + 1]);
      }
      answerText = selected.join(" ");
    } else {
      return null;
    }
  }

  return {
    chunk: bestChunk,
    score: highestScore,
    answer: answerText,
    is_offline_client: true,
    source: `${bestChunk.title} (${bestChunk.section}, p. ${bestChunk.page}) [Offline PAU Guide]`
  };
}

export function detectConversationalIntent(query) {
  if (!query) return null;
  const q = query.trim().toLowerCase();

  const greetingRegex = /^(hi|hello|hey|sat\s*sri\s*akal|sasrikaal|satsriakal|namaste|namaskar|good\s*(morning|afternoon|evening)|ki\s*haal|kiddan|kaise\s*ho)\b/i;
  const thanksRegex = /\b(thank\s*you|thanks|thx|dhanyawad|shukriya|meharbani|very\s*helpful|great)\b/i;
  const identityRegex = /\b(who\s*are\s*you|what\s*are\s*you|what\s*can\s*you\s*do|help\s*me|what\s*is\s*farmplan|how\s*to\s*use)\b/i;

  if (greetingRegex.test(q)) {
    const rem = q.replace(greetingRegex, "").trim();
    if (rem.length > 8 && /(water|urea|spray|weed|pest|dsr|seed|disease|fertilizer|khad)/.test(rem)) {
      return null;
    }
    return {
      answer: "Sat Sri Akal! Welcome to FarmPlan. I am your water and paddy advisory assistant. How is your crop doing today? You can ask me about watering schedules (AWD), fertilizer doses, weed control, pests, rice varieties like PR 126, or direct seeding (DSR).",
      source: "FarmPlan Conversational Guide (Farmer Interaction)"
    };
  }

  if (thanksRegex.test(q) && q.split(/\s+/).length <= 6) {
    return {
      answer: "You are very welcome! Wishing you a healthy and water-smart harvest. Feel free to ask anytime you need official guidance for your field.",
      source: "FarmPlan Conversational Guide (Farmer Interaction)"
    };
  }

  if (identityRegex.test(q)) {
    return {
      answer: "I am FarmPlan, an agronomic assistant grounded strictly in Punjab Agricultural University (PAU) research. I help farmers practice Alternate Wetting and Drying (AWD), evaluate Direct-Seeded Rice (DSR) economics, identify crop leaf issues, and answer questions without hallucinations.",
      source: "FarmPlan System Overview (About FarmPlan)"
    };
  }

  return null;
}
