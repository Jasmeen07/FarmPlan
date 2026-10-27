/**
 * web/src/ragClient.js
 * Client-Side Grounded RAG Retrieval Engine for FarmPlan
 * Enables zero-latency, $0 cost, offline-capable official PAU guidance retrieval
 * for ANY farmer question in English, Hindi/Punjabi transliteration, or colloquial phrasing.
 */

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing",
  "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers",
  "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in",
  "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our",
  "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's",
  "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs",
  "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't",
  "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's",
  "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't",
  "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves",
  "tell", "give", "kisan", "farmer", "crop", "rice", "paddy"
]);

const SYNONYMS = {
  // Water
  water: ["irrigation", "awd", "sinchai", "paani", "pani", "submergence", "flooding", "tubewell", "pumping", "schedule"],
  irrigate: ["water", "irrigation", "awd", "sinchai", "paani", "submergence", "schedule", "tubewell"],
  irrigation: ["water", "awd", "sinchai", "paani", "submergence", "schedule", "tubewell"],
  paani: ["water", "irrigation", "awd", "sinchai", "submergence", "tubewell"],
  pani: ["water", "irrigation", "awd", "sinchai", "submergence", "tubewell"],
  sinchai: ["water", "irrigation", "awd", "submergence", "tubewell"],
  awd: ["alternate", "wetting", "drying", "tillering", "hairline", "cracks", "saving", "tubewell"],
  harvest: ["combine", "stop", "irrigation", "termination", "days", "cut", "maturity", "lodging"],
  flowering: ["nissar", "panicle", "initiation", "moisture", "stress", "standing", "water"],

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
  dsr: ["direct", "seeded", "rice", "tar-wattar", "drill", "weed", "pendimethalin", "siddhi", "bijai"],
  direct: ["dsr", "seeded", "rice", "tar-wattar", "drill"],
  saline: ["kallar", "sodic", "salt", "brackish", "capillary", "khara"],
  kallar: ["saline", "sodic", "salt", "brackish", "capillary"],
  variety: ["varieties", "pr", "126", "131", "128", "pusa", "44", "duration", "yield", "beej"],
  varieties: ["variety", "pr", "126", "131", "128", "pusa", "44", "duration", "yield", "beej"],
  beej: ["seed", "variety", "certified", "rate", "nursery"],
  seed: ["beej", "rate", "nursery", "marla", "certified", "treatment", "carbendazim"],
  seeds: ["beej", "seed", "rate", "nursery", "marla", "certified", "treatment"],
  nursery: ["seedling", "carbendazim", "streptocycline", "treatment", "marla", "paneeri"],
  paneeri: ["nursery", "seedlings", "transplanting", "marla"],

  // Economics
  cost: ["costs", "expense", "tubewell", "pumping", "diesel", "labour", "savings", "kharcha"],
  costs: ["cost", "expense", "tubewell", "pumping", "diesel", "labour", "savings", "kharcha"],
  kharcha: ["cost", "diesel", "pumping", "labour", "savings"],
  diesel: ["pumping", "tubewell", "cost", "irrigations", "savings"],
  save: ["saving", "savings", "water", "pumping", "incentive", "subsidy", "bachat"],
  savings: ["saving", "save", "water", "pumping", "incentive", "subsidy", "bachat"],
  subsidy: ["incentive", "punjab", "government", "1500", "dsr", "acre"],
  incentive: ["subsidy", "punjab", "government", "1500", "dsr", "acre"],
  stubble: ["straw", "burning", "happy", "seeder", "smart", "residue", "parali"],
  parali: ["stubble", "straw", "burning", "happy", "seeder", "smart"]
};

export function tokenize(text) {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return words;
}

export function searchChunks(query, chunks, minScore = 0.02) {
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
    const chunkTokens = tokenize(`${chunk.title} ${chunk.section} ${chunk.text}`);
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

  // If score is too low or query is completely non-agricultural
  if (highestScore < minScore || !bestChunk) {
    return null;
  }

  // Extract the most informative sentences
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
    if (top && top.overlap > 0) {
      const selected = [top.sentence];
      if (top.idx + 1 < sentences.length) selected.push(sentences[top.idx + 1]);
      answerText = selected.join(" ");
    } else {
      answerText = sentences.slice(0, 2).join(" ");
    }
  }

  return {
    chunk: bestChunk,
    score: highestScore,
    answer: answerText,
    source: `${bestChunk.title} (${bestChunk.section}, p. ${bestChunk.page})`
  };
}
