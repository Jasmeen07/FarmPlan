"""
api/rag/retrieve.py
Local retrieval engine querying official PAU chunks in SQLite.
Uses TF-IDF with negation-preserving stop-words, Unicode-aware tokenization,
and domain concept expansion for $0 cost, zero API dependency, high-precision retrieval.
"""

import re
import sqlite3
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer, ENGLISH_STOP_WORDS
from sklearn.metrics.pairwise import cosine_similarity

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "chunks.sqlite"

# Negation and safety-critical terms preserved from stop-words
SAFETY_PRESERVED_WORDS = {
    "not", "no", "never", "none", "neither", "nor", "without", "except",
    "stop", "against", "cannot", "cant", "wont", "dont", "shouldnt", "isnt",
    "avoid", "restrict", "restricted", "ban", "banned"
}
CUSTOM_STOP_WORDS = list(ENGLISH_STOP_WORDS - SAFETY_PRESERVED_WORDS)

# Comprehensive Agricultural Domain Concept & Synonym Mappings
# Maps colloquial farmer terms (English, Punjabi Gurmukhi, Hindi Devanagari, Transliteration) to official PAU terminology
CONCEPT_SYNONYMS = {
    # Negation, Restrictions & Safety Warnings
    "not": "not strictly prohibited avoid restriction never exception",
    "no": "not strictly prohibited avoid restriction never",
    "never": "never strictly prohibited avoid restriction not continuous shallow water 5 cm",
    "stop": "stop 14 15 days harvest combine termination discontinue",
    "avoid": "avoid strictly prohibited not recommended warning",
    "ban": "pusa 44 unrecommended prohibited Punjab Government groundwater depletion",
    "banned": "pusa 44 unrecommended prohibited Punjab Government groundwater depletion",

    # Water & Irrigation
    "water": "irrigation awd flooding submergence standing water moisture infiltration drainage sinchai paani watering tubewell canal ponding",
    "irrigate": "water irrigation awd watering schedule intervals puddle submergence sinchai",
    "irrigation": "water awd watering schedule intervals puddle submergence sinchai paani",
    "paani": "water irrigation awd flooding shallow standing tubewell sinchai",
    "pani": "water irrigation awd flooding shallow standing tubewell sinchai",
    "sinchai": "irrigation water awd flooding tubewell canal",
    "awd": "alternate wetting drying tillering days hairline cracks water saving tubewell",
    "dry": "drying alternate wetting drying tillering cracks moisture",
    "drying": "alternate wetting drying tillering cracks moisture",
    "harvest": "combine harvesting stop termination maturity cutting lodging 14 15 days",
    "katayi": "harvest combine stop irrigation termination 14 15 days",
    "flowering": "nissar panicle initiation flowering moisture stress standing water 5 cm never dry",
    "establishment": "transplanting seedling 15 days shallow standing water 3 to 5 cm weed suppression",

    # Fertilizers & Nutrition
    "fertilizer": "urea nitrogen dap single superphosphate phosphorus application split dose puddling khad",
    "fertilizers": "urea nitrogen dap single superphosphate phosphorus application split dose puddling khad",
    "khad": "urea fertilizer dap nitrogen phosphorus single superphosphate split dose",
    "urea": "urea 110 kg 130 kg nitrogen splits puddling 21 days 42 days panicle initiation",
    "dap": "dap single superphosphate phosphorus fertilizer puddling 27 kg",
    "nitrogen": "urea fertilizer vegetative tillering splits",
    "zinc": "zinc sulphate heptahydrate 21 percent khaira disease rusty brown spots lower leaves 25 kg",
    "iron": "ferrous sulphate 1 percent chlorosis yellow white young leaves dsr loha",
    "yellow": "iron chlorosis zinc deficiency khaira bacterial leaf blight pale leaves yellowing",
    "yellowing": "iron chlorosis zinc deficiency khaira bacterial leaf blight pale leaves",
    "khaira": "zinc deficiency khaira disease zinc sulphate 25 kg rusty brown",

    # Weeds & Herbicides
    "weed": "weeds herbicide pre-emergence pendimethalin pretilachlor butachlor post-emergence bispyribac swank motha deela spray",
    "weeds": "weeds herbicide pre-emergence pendimethalin pretilachlor butachlor post-emergence bispyribac swank motha deela spray",
    "ghas": "weeds grass swank motha herbicide bispyribac pendimethalin",
    "buti": "weeds grass herbicide bispyribac pendimethalin",
    "herbicide": "weed control spray pendimethalin pretilachlor butachlor bispyribac-sodium",
    "herbicides": "weed control spray pendimethalin pretilachlor butachlor bispyribac-sodium",
    "spray": "herbicide fungicide insecticide dose litre ml per acre chemical",
    "dawai": "spray medicine herbicide pesticide fungicide dose",
    "grass": "swank motha weeds herbicide bispyribac",
    "swank": "weeds grass pretilachlor butachlor bispyribac-sodium",
    "motha": "weeds sedge bispyribac-sodium",

    # Insects & Pests
    "insect": "insect pest brown plant hopper bph leaf folder stem borer caterpillar hopper burn dead heart whitehead triflumezopyrim flubendiamide spray keeda sundi",
    "insects": "insect pest brown plant hopper bph leaf folder stem borer caterpillar hopper burn dead heart whitehead triflumezopyrim flubendiamide spray keeda sundi",
    "pest": "insects brown plant hopper leaf folder stem borer caterpillar economic threshold keeda",
    "pests": "insects brown plant hopper leaf folder stem borer caterpillar economic threshold keeda",
    "worm": "caterpillar stem borer leaf folder larvae sundi keeda",
    "worms": "caterpillar stem borer leaf folder larvae sundi keeda",
    "sundi": "caterpillar stem borer leaf folder larvae insect",
    "keeda": "insect pest bph stem borer leaf folder triflumezopyrim",
    "keede": "insect pest bph stem borer leaf folder triflumezopyrim",
    "hopper": "brown plant hopper bph hopper burn alleyways triflumezopyrim pymetrozine",
    "bph": "brown plant hopper sap sucker hopper burn alleyways triflumezopyrim",
    "borer": "stem borer dead heart whitehead panicle",
    "folder": "leaf folder translucent streaks flubendiamide",

    # Diseases & Pathology
    "disease": "disease blast bacterial leaf blight sheath blight fungus lesion rot spot propiconazole tricyclazole bimari rog",
    "diseases": "disease blast bacterial leaf blight sheath blight fungus lesion rot spot propiconazole tricyclazole bimari rog",
    "bimari": "disease blast blight sheath fungus propiconazole tricyclazole",
    "rog": "disease blast blight sheath fungus propiconazole tricyclazole",
    "blast": "rice leaf neck blast spindle lesions ash grey tricyclazole",
    "blight": "bacterial leaf blight blb wavy margins drain field sheath blight hexaconazole",
    "spots": "brown spots blast zinc deficiency bacterial leaf blight",
    "spot": "brown spots blast zinc deficiency bacterial leaf blight",
    "fungus": "blast sheath blight false smut propiconazole tricyclazole",

    # DSR, Soil & Restrictions
    "dsr": "direct seeded rice tar-wattar drill laser levelling seed rate pendimethalin weed 8 10 kg siddhi bijai",
    "direct": "direct seeded rice dsr tar-wattar seed drill siddhi bijai",
    "seeding": "direct seeded rice dsr tar-wattar seed drill nursery",
    "machine": "dsr drill inclined plates press wheels laser leveller happy seeder",
    "saline": "saline sodic kallar salt brackish tubewell upward capillary root zone khara strictly not recommended",
    "kallar": "saline sodic kallar salt brackish tubewell upward capillary strictly not recommended",
    "sandy": "sandy light soil raitli iron deficiency not recommended dsr 1 day drying caution",

    # Varieties & Seeds
    "variety": "pr 126 pr 131 pr 128 pusa 44 duration days yield short medium beej",
    "varieties": "pr 126 pr 131 pr 128 pusa 44 duration days yield short medium beej",
    "seed": "seed rate certified seed nursery 8 kg per acre carbendazim streptocycline treatment beej",
    "seeds": "seed rate certified seed nursery 8 kg per acre carbendazim streptocycline treatment beej",
    "beej": "seed variety certified seed rate nursery treatment",
    "nursery": "nursery 1 marla 25 square metres seedlings 25 30 days transplanting paneeri",
    "paneeri": "nursery seedlings 25 30 days transplanting 1 marla",
    "transplant": "transplanting june 11 zone 1 june 20 zone 2 subsoil water act",
    "transplanting": "transplanting june 11 zone 1 june 20 zone 2 subsoil water act",
    "pusa": "pusa 44 unrecommended long duration water depletion stubble burning",
    "pr126": "pr 126 short duration 93 days water saving 30 quintals",

    # Economics & Savings
    "cost": "cost expense rupees tubewell pumping diesel labour nursery savings 7030 kharcha",
    "costs": "cost expense rupees tubewell pumping diesel labour nursery savings 7030 kharcha",
    "kharcha": "cost expense rupees tubewell diesel labour savings",
    "diesel": "tubewell pumping cost 400 500 rupees per irrigation 26 irrigations 19 irrigations awd",
    "save": "water saving pumping savings awd dsr incentive subsidy 1500 bachat",
    "savings": "water saving pumping savings awd dsr incentive subsidy 1500 bachat",
    "subsidy": "punjab government incentive 1500 rupees per acre direct seeded rice dsr",
    "incentive": "punjab government incentive 1500 rupees per acre direct seeded rice dsr",
    "stubble": "paddy straw residue happy seeder smart seeder burning zero tillage parali",
    "parali": "paddy straw residue happy seeder smart seeder burning stubble",

    # Gurmukhi (Punjabi) Concepts
    "ਪਾਣੀ": "water irrigation awd sinchai flooding standing",
    "ਝੋਨਾ": "paddy rice crop kharif",
    "ਝੋਨੇ": "paddy rice crop kharif",
    "ਖਾਦ": "fertilizer urea nitrogen dap khad",
    "ਨਦੀਨ": "weeds herbicide pendimethalin bispyribac spray",
    "ਕੀੜੇ": "insects pests bph leaf folder stem borer",
    "ਬਿਮਾਰੀ": "disease blast blight sheath fungus",
    "ਵਾਢੀ": "harvest combine stop irrigation termination 14 15 days",
    "ਕਟਾਈ": "harvest combine stop irrigation termination 14 15 days",
    "ਬੀਜ": "seed certified seed rate nursery 8 kg",
    "ਪਨੀਰੀ": "nursery seedlings 25 30 days 1 marla",
    "ਨਿਸਰਨ": "flowering panicle initiation standing water 5 cm continuous never dry",
    "ਸੁੱਕਣਾ": "drying alternate wetting drying awd cracks",
    "ਰੇਤਲੀ": "sandy light soil raitli iron deficiency not recommended dsr",
    "ਕੱਲਰ": "saline sodic kallar salt brackish awd strictly not recommended",

    # Devanagari (Hindi) Concepts
    "पानी": "water irrigation awd sinchai flooding standing",
    "धान": "paddy rice crop kharif",
    "खाद": "fertilizer urea nitrogen dap khad",
    "खरपतवार": "weeds herbicide pendimethalin bispyribac spray",
    "कीट": "insects pests bph leaf folder stem borer",
    "रोग": "disease blast blight sheath fungus",
    "कटाई": "harvest combine stop irrigation termination 14 15 days",
    "बीज": "seed certified seed rate nursery 8 kg",
    "नर्सरी": "nursery seedlings 25 30 days 1 marla",
    "फूल": "flowering panicle initiation standing water 5 cm continuous never dry",
    "रेतीली": "sandy light soil raitli iron deficiency not recommended dsr",
    "कल्लड़": "saline sodic kallar salt brackish awd strictly not recommended"
}

class Retriever:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.chunks = []
        self.vectorizer = None
        self.tfidf_matrix = None
        self.reload()

    def reload(self):
        """Loads chunks from SQLite and builds negation-preserving TF-IDF index."""
        if not self.db_path.exists():
            return
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, doc_id, title, source_org, publication, edition_year,
                   lang, region, page, section, safety_conditions, text
            FROM chunks
        """)
        rows = cursor.fetchall()
        conn.close()

        self.chunks = [
            {
                "id": r[0],
                "doc_id": r[1],
                "title": r[2],
                "source_org": r[3],
                "publication": r[4],
                "edition_year": r[5],
                "lang": r[6],
                "region": r[7],
                "page": r[8],
                "section": r[9],
                "safety_conditions": r[10],
                "text": r[11],
            }
            for r in rows
        ]

        if self.chunks:
            # Build corpus including title, section, safety conditions, and full text
            corpus = [
                f"{c['title']} {c['section']} {c.get('safety_conditions', '')} {c['text']}"
                for c in self.chunks
            ]
            self.vectorizer = TfidfVectorizer(
                ngram_range=(1, 2),
                token_pattern=r"(?u)\b\w+\b",
                stop_words=CUSTOM_STOP_WORDS
            )
            self.tfidf_matrix = self.vectorizer.fit_transform(corpus)

    def retrieve(self, question: str, k: int = 4, min_score: float = 0.03) -> list[dict]:
        """
        Retrieves top-k relevant chunks for question using negation-preserving concept expansion.
        Returns empty list only if question has zero agricultural relevance.
        """
        if not self.chunks or self.vectorizer is None or self.tfidf_matrix is None:
            return []

        q_clean = question.lower().strip()
        tokens = re.findall(r"[\w\u0900-\u097F\u0A00-\u0A7F]+", q_clean)

        # Detect negation intent to boost safety warnings
        has_negation = any(tok in SAFETY_PRESERVED_WORDS or tok in ["not", "never", "no", "stop", "avoid", "ਬੰਦ", "ਨਹੀਂ", "ਮਨ੍ਹਾ", "बंद", "नहीं", "मना"] for tok in tokens)

        # Expand query with matched agricultural concept expansions
        expanded_parts = [question]
        for token in tokens:
            if token in CONCEPT_SYNONYMS:
                expanded_parts.append(CONCEPT_SYNONYMS[token])

        expanded_query = " ".join(expanded_parts)

        q_vec = self.vectorizer.transform([expanded_query])
        scores = cosine_similarity(q_vec, self.tfidf_matrix)[0]

        # Contrastive negation scoring adjustment
        if has_negation:
            for i, chunk in enumerate(self.chunks):
                chunk_text_lower = f"{chunk['section']} {chunk.get('safety_conditions', '')} {chunk['text']}".lower()
                # If question asks about what NOT to do or when to STOP, boost warning/restriction passages
                if any(w in chunk_text_lower for w in ["stop", "never", "not recommended", "strictly", "prohibited", "do not"]):
                    scores[i] *= 1.35

        ranked_indices = scores.argsort()[::-1]
        results = []

        for idx in ranked_indices[:k]:
            score = float(scores[idx])
            if score >= min_score:
                chunk = dict(self.chunks[idx])
                chunk["score"] = score
                results.append(chunk)

        return results

# Singleton instance
retriever = Retriever()
