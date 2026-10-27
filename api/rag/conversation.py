"""
api/rag/conversation.py
Conversational dialogue manager for FarmPlan Assistant.
Handles greetings, pleasantries, gratitude, and contextual conversation flows
so farmers have a warm, natural conversation without artificial refusals.
"""

import re

GREETING_PATTERNS = [
    r"^(hi|hello|hey|heya|hola)\b",
    r"\b(sat\s*sri\s*akal|sasrikaal|satsriakal)\b",
    r"\b(namaste|namaskar|pranam)\b",
    r"\b(good\s*(morning|afternoon|evening|day))\b",
    r"\b(ki\s*haal|kiddan|kaise\s*ho|kem\s*cho)\b",
    r"^(greetings|welcome)\b",
]

GRATITUDE_PATTERNS = [
    r"\b(thank\s*you|thanks|thx|dhanyawad|shukriya|meharbani|bohot\s*achha|very\s*helpful|great)\b",
]

IDENTITY_PATTERNS = [
    r"\b(who\s*are\s*you|what\s*are\s*you|what\s*can\s*you\s*do|help\s*me|what\s*is\s*this|introduce\s*yourself)\b",
]

GREETING_RESPONSES = {
    "en": "Sat Sri Akal! Welcome to FarmPlan. I am your water and paddy advisory assistant. How is your crop doing today? You can ask me about watering schedules (AWD), fertilizer doses, weed control, pests, rice varieties like PR 126, or direct seeding (DSR).",
    "pa": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਜੀ! ਫਾਰਮ-ਪਲਾਨ ਵਿੱਚ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ। ਮੈਂ ਤੁਹਾਡਾ ਝੋਨੇ ਅਤੇ ਪਾਣੀ ਪ੍ਰਬੰਧਨ ਦਾ ਸਹਾਇਕ ਹਾਂ। ਅੱਜ ਤੁਹਾਡੀ ਫ਼ਸਲ ਕਿਵੇਂ ਹੈ? ਤੁਸੀਂ ਪਾਣੀ ਦੇ ਪ੍ਰਬੰਧ (AWD), ਖਾਦਾਂ ਦੀ ਮਾਤਰਾ, ਨਦੀਨਾਂ ਦੀ ਰੋਕਥਾਮ, ਕੀੜੇ-ਮਕੌੜਿਆਂ ਜਾਂ PR 126 ਕਿਸਮ ਬਾਰੇ ਪੁੱਛ ਸਕਦੇ ਹੋ।",
    "hi": "सत श्री अकाल! फार्म-प्लान में आपका स्वागत है। मैं आपका धान और जल प्रबंधन सलाहकार हूँ। आज आपकी फसल कैसी है? आप मुझसे पानी प्रबंधन (AWD), खाद की खुराक, खरपतवार नियंत्रण, कीटों या सीधी बिजाई (DSR) के बारे में पूछ सकते हैं।"
}

GRATITUDE_RESPONSES = {
    "en": "You are very welcome! Wishing you a healthy and water-smart harvest. Feel free to ask anytime you need official guidance for your field.",
    "pa": "ਤੁਹਾਡਾ ਬਹੁਤ-ਬਹੁਤ ਧੰਨਵਾਦ ਜੀ! ਤੁਹਾਡੀ ਫ਼ਸਲ ਚੰਗੀ ਅਤੇ ਖੁਸ਼ਹਾਲ ਰਹੇ। ਜਦੋਂ ਵੀ ਖੇਤ ਲਈ ਸਲਾਹ ਚਾਹੀਦੀ ਹੋਵੇ, ਬੇਝਿਜਕ ਪੁੱਛੋ।",
    "hi": "आपका बहुत-बहुत स्वागत है! आपकी फसल समृद्ध और पानी बचाने वाली हो। जब भी खेत के लिए सलाह चाहिए, बेझिझक पूछें।"
}

IDENTITY_RESPONSES = {
    "en": "I am FarmPlan, an agronomic assistant grounded strictly in Punjab Agricultural University (PAU) research. I help farmers practice Alternate Wetting and Drying (AWD), evaluate Direct-Seeded Rice (DSR) economics, identify crop leaf issues, and answer questions without hallucinations.",
    "pa": "ਮੈਂ ਫਾਰਮ-ਪਲਾਨ ਹਾਂ, ਜੋ ਪੰਜਾਬ ਐਗਰੀਕਲਚਰਲ ਯੂਨੀਵਰਸਿਟੀ (PAU) ਦੀਆਂ ਅਧਿਕਾਰਤ ਸਿਫ਼ਾਰਸ਼ਾਂ 'ਤੇ ਆਧਾਰਿਤ ਹੈ। ਮੈਂ ਪਾਣੀ ਬਚਾਉਣ (AWD), ਡੀਐਸਆਰ ਦੇ ਖਰਚੇ ਅਤੇ ਫ਼ਸਲ ਦੀਆਂ ਬਿਮਾਰੀਆਂ ਬਾਰੇ ਸਹੀ ਜਾਣਕਾਰੀ ਦਿੰਦਾ ਹਾਂ।",
    "hi": "मैं फार्म-प्लान हूँ, जो पंजाब कृषि विश्वविद्यालय (PAU) के प्रमाणित अनुसंधान पर आधारित है। मैं किसानों को पानी बचाने (AWD), सीधी बिजाई (DSR) के खर्च और धान की बीमारियों के बारे में सही सलाह देता हूँ।"
}

def detect_conversational_intent(query: str, lang: str = "en") -> dict | None:
    """
    Detects if the query is a greeting, gratitude, or identity question.
    Returns structured answer if matched, or None if it's an agronomic inquiry.
    """
    q = query.strip().lower()

    # 1. Greetings
    for pattern in GREETING_PATTERNS:
        if re.search(pattern, q):
            # If the user combined greeting with a question (e.g. "Hello, when to put urea?")
            # check if there's also an agronomic question
            rem = re.sub(pattern, "", q).strip()
            if len(rem) > 8 and any(term in rem for term in ["water", "urea", "spray", "weed", "pest", "dsr", "seed", "disease", "fertilizer", "khad"]):
                return None  # Let it pass through to the RAG retriever with the full query
            return {
                "grounded": True,
                "is_conversational": True,
                "answer": GREETING_RESPONSES.get(lang, GREETING_RESPONSES["en"]),
                "sources": [{"title": "FarmPlan Conversational Guide", "page": 1, "section": "Farmer Interaction"}]
            }

    # 2. Gratitude / Thanks
    for pattern in GRATITUDE_PATTERNS:
        if re.search(pattern, q) and len(q.split()) <= 6:
            return {
                "grounded": True,
                "is_conversational": True,
                "answer": GRATITUDE_RESPONSES.get(lang, GRATITUDE_RESPONSES["en"]),
                "sources": [{"title": "FarmPlan Conversational Guide", "page": 1, "section": "Farmer Interaction"}]
            }

    # 3. Identity / Help
    for pattern in IDENTITY_PATTERNS:
        if re.search(pattern, q):
            return {
                "grounded": True,
                "is_conversational": True,
                "answer": IDENTITY_RESPONSES.get(lang, IDENTITY_RESPONSES["en"]),
                "sources": [{"title": "FarmPlan System Overview", "page": 1, "section": "About FarmPlan"}]
            }

    return None

def contextualize_followup(question: str, history: list[dict]) -> str:
    """
    If the current question is a short follow-up or uses pronouns,
    enriches the query with topic keywords from the previous conversation turn.
    """
    if not history or len(history) == 0:
        return question

    q_lower = question.lower().strip()
    words = q_lower.split()

    # Short follow-up indicators
    needs_context = (
        len(words) <= 5 or
        any(p in words for p in ["it", "this", "that", "these", "those", "them", "why", "how", "when", "cost", "more", "save", "sandy", "clay"])
    )

    if not needs_context:
        return question

    # Find the last user turn or last assistant answer
    last_user_query = ""
    for msg in reversed(history):
        if msg.get("role") == "user" and msg.get("content"):
            last_user_query = msg.get("content", "")
            break

    if last_user_query:
        # Extract key agronomic nouns from the previous query
        key_terms = []
        for term in ["awd", "water", "irrigation", "dsr", "pr 126", "pr 131", "urea", "fertilizer", "weed", "pest", "hopper", "blast", "blight", "zinc", "iron", "stubble"]:
            if term in last_user_query.lower():
                key_terms.append(term)
        if key_terms:
            return f"{question} {' '.join(key_terms)}"

    return question
