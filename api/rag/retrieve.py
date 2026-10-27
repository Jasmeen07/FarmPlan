"""
api/rag/retrieve.py
Local retrieval engine querying official PAU chunks in SQLite.
Uses TF-IDF, semantic concept expansion, and cosine similarity for $0 cost,
zero API dependency, high-speed local matching for any farmer query.
"""

import re
import sqlite3
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "chunks.sqlite"

# Comprehensive Agricultural Domain Concept & Synonym Mappings
# Maps colloquial farmer terms (English, Punjabi, Hindi, Hinglish) to official PAU terminology
CONCEPT_SYNONYMS = {
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
    "harvest": "combine harvesting stop termination maturity cutting lodging",
    "katayi": "harvest combine stop irrigation termination",
    "flowering": "nissar panicle initiation flowering moisture stress standing water 5 cm",
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

    # DSR & Sowing Methods
    "dsr": "direct seeded rice tar-wattar drill laser levelling seed rate pendimethalin weed 8 10 kg siddhi bijai",
    "direct": "direct seeded rice dsr tar-wattar seed drill siddhi bijai",
    "seeding": "direct seeded rice dsr tar-wattar seed drill nursery",
    "machine": "dsr drill inclined plates press wheels laser leveller happy seeder",
    "saline": "saline sodic kallar salt brackish tubewell upward capillary root zone khara",
    "kallar": "saline sodic kallar salt brackish tubewell upward capillary",

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
    "parali": "paddy straw residue happy seeder smart seeder burning stubble"
}

class Retriever:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.chunks = []
        self.vectorizer = None
        self.tfidf_matrix = None
        self.reload()

    def reload(self):
        """Loads chunks from SQLite and builds TF-IDF index."""
        if not self.db_path.exists():
            return
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT id, doc_id, title, lang, region, page, section, text FROM chunks")
        rows = cursor.fetchall()
        conn.close()

        self.chunks = [
            {
                "id": r[0],
                "doc_id": r[1],
                "title": r[2],
                "lang": r[3],
                "region": r[4],
                "page": r[5],
                "section": r[6],
                "text": r[7],
            }
            for r in rows
        ]

        if self.chunks:
            corpus = [f"{c['title']} {c['section']} {c['text']}" for c in self.chunks]
            self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words="english")
            self.tfidf_matrix = self.vectorizer.fit_transform(corpus)

    def retrieve(self, question: str, k: int = 3, min_score: float = 0.02) -> list[dict]:
        """
        Retrieves top-k relevant chunks for question using domain concept expansion.
        Returns empty list only if question has zero agricultural relevance.
        """
        if not self.chunks or self.vectorizer is None or self.tfidf_matrix is None:
            return []

        q_clean = question.lower()
        tokens = re.findall(r"\w+", q_clean)

        # Expand query with matched agricultural concept expansions
        expanded_parts = [question]
        for token in tokens:
            if token in CONCEPT_SYNONYMS:
                expanded_parts.append(CONCEPT_SYNONYMS[token])

        expanded_query = " ".join(expanded_parts)

        q_vec = self.vectorizer.transform([expanded_query])
        scores = cosine_similarity(q_vec, self.tfidf_matrix)[0]

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
