/**
 * web/src/ragClient.js
 * Client-Side Grounded RAG Retrieval Engine for FarmPlan
 * Enables zero-latency, $0 cost, offline-capable official PAU guidance retrieval
 * for ANY farmer question.
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
  "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
]);

const SYNONYMS = {
  harvest: ["combine", "stop", "irrigation", "termination", "days", "cut", "maturity"],
  awd: ["alternate", "wetting", "drying", "tillering", "hairline", "cracks", "saving"],
  saline: ["kallar", "sodic", "salt", "brackish", "capillary"],
  dsr: ["direct", "seeded", "rice", "tar-wattar", "drill", "weed", "pendimethalin"],
  zinc: ["khaira", "deficiency", "rusty", "bronze", "blotches", "sulphate"],
  iron: ["chlorosis", "yellow", "white", "interveinal", "ferrous"],
  fertilizer: ["urea", "dap", "nitrogen", "phosphorus", "superphosphate", "split"],
  nursery: ["seedling", "carbendazim", "streptocycline", "treatment", "marla"],
  weed: ["pendimethalin", "bispyribac", "pretilachlor", "butachlor", "swank", "motha"],
  hopper: ["bph", "brown", "plant", "hopper", "burn", "triflumezopyrim", "pymetrozine"],
  folder: ["leaf", "caterpillar", "translucent", "flubendiamide"],
  blast: ["spindle", "spots", "neck", "tricyclazole"],
  blight: ["bacterial", "wavy", "margin", "sheath", "hexaconazole"],
  stubble: ["straw", "burning", "happy", "seeder", "smart", "residue"],
  date: ["zone", "june", "act", "preservation", "subsoil", "may"]
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

export function searchChunks(query, chunks, minScore = 0.08) {
  if (!query || !chunks || chunks.length === 0) return null;

  const rawTokens = tokenize(query);
  if (rawTokens.length === 0) return null;

  // Query Expansion via agricultural domain synonyms
  const queryTokens = new Set(rawTokens);
  for (const token of rawTokens) {
    for (const [key, synList] of Object.entries(SYNONYMS)) {
      if (token === key || synList.includes(token)) {
        queryTokens.add(key);
        synList.forEach((s) => queryTokens.add(s));
      }
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

    let matchCount = 0;
    let score = 0;

    for (const qToken of queryTokens) {
      if (tf[qToken]) {
        matchCount += 1;
        // Frequency weighting with length normalization
        score += (tf[qToken] * 1.5) / Math.sqrt(chunkTokens.length);
      }
    }

    // Boost if title matches
    const titleTokens = tokenize(chunk.title);
    for (const qToken of rawTokens) {
      if (titleTokens.includes(qToken)) {
        score += 0.8;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestChunk = chunk;
    }
  }

  if (highestScore < minScore || !bestChunk) {
    return null;
  }

  // Extract sentences from bestChunk
  const sentences = bestChunk.text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  let answerText = bestChunk.text;
  if (sentences.length > 3) {
    const scored = sentences.map((sentence, idx) => {
      const sTokens = new Set(tokenize(sentence));
      let overlap = 0;
      for (const t of rawTokens) {
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
    }
  }

  return {
    chunk: bestChunk,
    score: highestScore,
    answer: answerText,
    source: `${bestChunk.title} (${bestChunk.section}, p. ${bestChunk.page})`
  };
}
