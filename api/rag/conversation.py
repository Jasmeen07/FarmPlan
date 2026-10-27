"""
api/rag/conversation.py
Conversational dialogue manager for FarmPlan Assistant.
Handles greetings, pleasantries, gratitude, and context-aware follow-ups with topic-shift detection.
Grounded in official PAU knowledge without bleeding unrelated constraints across topic changes.
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

# Domain Topic Classifier for Context Tracking
TOPIC_KEYWORDS = {
    "water": ["water", "irrigation", "awd", "flooding", "drying", "tubewell", "pumping", "cracks", "submergence", "paani", "sinchai"],
    "variety": ["variety", "varieties", "pr 126", "pr 131", "pr 128", "pusa 44", "duration", "yield", "maturation"],
    "nutrition": ["urea", "nitrogen", "dap", "phosphorus", "zinc", "iron", "chlorosis", "khaira", "fertilizer", "khad", "split"],
    "weed": ["weed", "weeds", "herbicide", "pendimethalin", "pretilachlor", "butachlor", "bispyribac", "swank", "motha", "ghas"],
    "pest": ["pest", "pests", "insect", "insects", "bph", "hopper", "leaf folder", "stem borer", "caterpillar", "keeda", "sundi"],
    "disease": ["disease", "diseases", "blast", "blight", "bacterial leaf blight", "blb", "sheath blight", "fungus", "bimari", "rog"],
    "dsr": ["dsr", "direct seeded", "tar-wattar", "drill", "laser levelling", "siddhi bijai"],
    "residue": ["stubble", "straw", "happy seeder", "smart seeder", "burning", "parali", "residue"]
}

def detect_topic(text: str) -> str | None:
    t_lower = text.lower()
    for topic, kw_list in TOPIC_KEYWORDS.items():
        if any(kw in t_lower for kw in kw_list):
            return topic
    return None

def detect_conversational_intent(query: str, lang: str = "en") -> dict | None:
    """
    Detects if the query is a greeting, gratitude, or identity question.
    Returns structured answer if matched, or None if it's an agronomic inquiry.
    """
    q = query.strip().lower()

    # 1. Greetings
    for pattern in GREETING_PATTERNS:
        if re.search(pattern, q):
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
    Intelligently contextualizes follow-ups while safely respecting topic shifts (Issue 7).
    If the question is an obvious topic change, old constraints are not carried over.
    """
    if not history:
        return question

    q_lower = question.lower().strip()
    words = q_lower.split()

    current_topic = detect_topic(q_lower)

    # Find the most recent active user query in history
    last_user_query = ""
    for msg in reversed(history):
        if msg.get("role") == "user" and msg.get("content"):
            last_user_query = msg.get("content", "").strip()
            break

    if not last_user_query:
        return question

    last_topic = detect_topic(last_user_query)

    # Topic Shift Detection:
    # If the current question introduces a distinctly new topic (e.g. from variety to pest),
    # do NOT bleed the old topic's constraints into the new query, unless it uses a pronoun.
    has_pronoun = any(p in words for p in ["it", "its", "this", "that", "these", "those", "them"])
    if current_topic and last_topic and current_topic != last_topic and not has_pronoun:
        # Check if it's a cross-topic comparison or pure topic change
        if not any(marker in q_lower for marker in ["what about", "how about", "difference", "compare"]):
            return question

    # Genuine Follow-Up Detection
    is_followup = (
        len(words) <= 5 or
        any(p in words for p in ["it", "its", "this", "that", "these", "those", "them"]) or
        any(phrase in q_lower for phrase in [
            "what about", "how about", "and if", "in case of", "how much", "when to stop",
            "during flowering", "in saline", "in sandy", "water savings", "how many days",
            "what is the cost", "cost savings", "why", "can i", "is it safe"
        ])
    )

    if not is_followup:
        return question

    # Extract relevant entities from previous context
    context_tags = []
    last_lower = last_user_query.lower()

    # Track Variety
    for var in ["pr 126", "pr 131", "pr 128", "pusa 44"]:
        if var in last_lower:
            context_tags.append(var)
            break

    # Track Water Practice
    if any(w in last_lower for w in ["awd", "alternate wetting", "irrigation"]):
        if "water" not in q_lower and "awd" not in q_lower:
            context_tags.append("awd water management")

    # Track DSR
    if "dsr" in last_lower or "tar-wattar" in last_lower:
        if "dsr" not in q_lower:
            context_tags.append("dsr direct seeded rice")

    # Track Fertilizer
    if any(f in last_lower for f in ["urea", "nitrogen", "fertilizer", "dap", "zinc"]):
        if not current_topic:
            context_tags.append("fertilizer application")

    if context_tags:
        return f"{question} {' '.join(context_tags)}"

    return question
