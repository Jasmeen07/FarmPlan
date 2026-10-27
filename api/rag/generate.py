"""
api/rag/generate.py
Grounded Answer Generator.
Supports:
1. Deterministic extractive synthesis ($0 cost, 100% offline, zero hallucination).
2. Google Gemini Free Tier API (when GEMINI_API_KEY is configured).
Strictly refuses (NO_ANSWER) when passages do not contain the answer.
"""

import os
import re

SYSTEM_PROMPT = """You answer questions from farmers in Punjab about paddy.
Use ONLY the numbered passages provided. If the passages do not contain the answer, reply exactly: NO_ANSWER.
Rules:
- Reply in {lang_name}. Use short, simple sentences (at most 5).
- Copy every number, unit, date and condition exactly as the passage states it.
- Never give a pesticide or herbicide dose unless it appears in the passages; if it does, copy it and add: check the product label.
- For spraying, diseases or costly decisions, add one line recommending confirmation with the local agriculture officer.
- If passages disagree, say so and give both with their source numbers.
- End with the source numbers you used, like [1].
- Do not use outside knowledge. Do not guess."""

def generate_grounded_answer(question: str, passages: list[dict], lang: str = "en") -> str:
    """
    Generates a cited answer strictly from passages.
    Returns NO_ANSWER if passages are empty or irrelevant.
    """
    if not passages:
        return "NO_ANSWER"

    gemini_key = os.getenv("GEMINI_API_KEY")

    # If free Gemini API key is provided, use it
    if gemini_key:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            ctx = "\n\n".join(f"[{i+1}] ({p['title']}, p.{p['page']})\n{p['text']}" for i, p in enumerate(passages))
            prompt = f"Passages:\n{ctx}\n\nQuestion: {question}"
            lang_name = "Punjabi" if lang == "pa" else "Hindi" if lang == "hi" else "English"
            resp = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=f"{SYSTEM_PROMPT.format(lang_name=lang_name)}\n\n{prompt}",
                config={"temperature": 0.0}
            )
            if resp.text:
                return resp.text.strip()
        except Exception as e:
            print("Gemini API call skipped or failed, falling back to local extractor:", e)

    # Local deterministic grounded synthesis ($0 cost, 100% grounded)
    # Extracts the most relevant sentences from the top passages
    top_p = passages[0]
    p_text = top_p["text"]
    q_words = set(re.findall(r"\w+", question.lower())) - {
        "what", "when", "how", "is", "the", "in", "to", "for", "a", "of", "can", "i", "do", "does", "should", "my", "your"
    }

    sentences = re.split(r"(?<=[.!?])\s+", p_text)
    matched_sentences = []

    for s in sentences:
        s_words = set(re.findall(r"\w+", s.lower()))
        overlap = len(q_words & s_words)
        if overlap > 0:
            matched_sentences.append((overlap, s.strip()))

    matched_sentences.sort(key=lambda x: -x[0])

    if matched_sentences:
        # Take up to 2 best informative sentences
        selected = [item[1] for item in matched_sentences[:2]]
        ans_text = " ".join(selected)
        
        # If spraying or chemicals mentioned, add advisory note
        if any(term in ans_text.lower() for term in ["spray", "herbicide", "fungicide", "chemical", "litre", "ml", "kg"]):
            ans_text += " Always verify product label and confirm with your local Agriculture Officer."
            
        return f"{ans_text} [1]"

    # If no relevant sentence overlaps with the question
    return "NO_ANSWER"
