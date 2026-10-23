"""
api/rag/retrieve.py
Local retrieval engine querying official PAU chunks in SQLite.
Uses TF-IDF and cosine similarity for $0 cost, zero API dependency, high-speed local matching.
"""

import sqlite3
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "chunks.sqlite"

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

    def retrieve(self, question: str, k: int = 3, min_score: float = 0.08) -> list[dict]:
        """
        Retrieves top-k relevant chunks for question.
        Returns empty list if top score is below min_score (triggers safe decline).
        """
        if not self.chunks or self.vectorizer is None or self.tfidf_matrix is None:
            return []

        # Simple keyword synonyms expansion
        expanded_q = question
        q_lower = question.lower()
        if "harvest" in q_lower or "ਕਟਾਈ" in q_lower or "कटाई" in q_lower:
            expanded_q += " stop irrigation harvest combine termination days"
        if "awd" in q_lower or "tillering" in q_lower or "ਸੁਕਾ" in q_lower or "dry" in q_lower:
            expanded_q += " alternate wetting drying tillering days hairline cracks water saving"
        if "saline" in q_lower or "kallar" in q_lower or "ਖਾਰਾ" in q_lower:
            expanded_q += " saline sodic kallar salt drying root zone"
        if "dsr" in q_lower or "direct" in q_lower or "ਸਿੱਧੀ" in q_lower:
            expanded_q += " direct seeded rice tar-wattar seed rate drill weed pendimethalin"
        if "zinc" in q_lower or "iron" in q_lower or "yellow" in q_lower or "loha" in q_lower:
            expanded_q += " deficiency zinc sulphate ferrous sulphate leaves khaira"

        q_vec = self.vectorizer.transform([expanded_q])
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
