"""
api/main.py
FastAPI backend for FarmPlan v2 (Tier 2 Grounded RAG Assistant).
All operations are 100% free of cost, locally run, with strict safety validations.
Features startup index self-healing, readiness checks, restricted CORS, and verified source citations.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rag.ingest import ensure_db_initialized
from rag.retrieve import retriever
from rag.generate import generate_grounded_answer
from rag.validate import numbers_supported
from rag.conversation import detect_conversational_intent, contextualize_followup
from vision.diagnose import analyze_image_bytes

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup self-healing and index readiness verification.
    Ensures chunks.sqlite is created and populated before servicing requests.
    """
    chunk_count = ensure_db_initialized()
    retriever.reload()
    print(f"FarmPlan API ready: {chunk_count} verified PAU guidance chunks indexed in memory.")
    yield

app = FastAPI(title="FarmPlan API", version="2.0.0", lifespan=lifespan)

# Restrict CORS to known frontend origins (Issue 9)
raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
)
allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

FALLBACK_MESSAGES = {
    "en": "I do not have a verified answer for this in official Punjab guidance. Please contact your local Agriculture Officer or KVK specialist.",
    "pa": "ਸਰਕਾਰੀ ਖੇਤੀਬਾੜੀ ਸਿਫ਼ਾਰਸ਼ਾਂ ਵਿੱਚ ਇਸ ਸਵਾਲ ਦਾ ਕੋਈ ਪ੍ਰਮਾਣਿਤ ਜਵਾਬ ਨਹੀਂ ਮਿਲਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਸਥਾਨਕ ਖੇਤੀਬਾੜੀ ਅਫ਼ਸਰ ਜਾਂ KVK ਮਾਹਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।",
    "hi": "सरकारी कृषि सिफारिशों में इस प्रश्न का कोई प्रमाणित उत्तर नहीं मिला। कृपया अपने स्थानीय कृषि अधिकारी या KVK विशेषज्ञ से संपर्क करें।",
}

class AskRequest(BaseModel):
    question: str = Field(..., max_length=500, description="Farmer's query")
    history: list[dict] = Field(default=[], description="Conversation history turns")
    lang: str = Field("en", description="Language code: pa, hi, or en")
    district: str | None = Field(None, description="Optional district code")

@app.get("/health")
def health():
    """
    Liveness and Readiness health check.
    Reports index readiness and loaded chunk count to avoid silent unindexed deployments (Issue 5).
    """
    loaded_chunks = len(retriever.chunks)
    is_ready = loaded_chunks > 0 and retriever.vectorizer is not None
    return {
        "ok": is_ready,
        "status": "healthy" if is_ready else "unindexed",
        "readiness": is_ready,
        "loaded_chunks": loaded_chunks,
        "vectorizer_ready": retriever.vectorizer is not None,
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "edition_year": 2024
    }

@app.post("/ask")
def ask(req: AskRequest):
    if len(req.question.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty question")

    # 1. Check conversational pleasantries (Hi, Hello, Sat Sri Akal, Thanks, Who are you)
    conv_response = detect_conversational_intent(req.question, lang=req.lang)
    if conv_response:
        return conv_response

    # 2. Contextualize follow-up questions from conversation history (Issue 7)
    query_to_search = contextualize_followup(req.question, req.history)

    # 3. Retrieve official passages with calibrated k and threshold (Issue 1 & 2)
    passages = retriever.retrieve(query_to_search, k=4, min_score=0.03)

    if not passages:
        return {
            "grounded": False,
            "answer": FALLBACK_MESSAGES.get(req.lang, FALLBACK_MESSAGES["en"]),
            "sources": [],
            "reason": "no_relevant_passages"
        }

    # 4. Generate answer strictly supported by retrieved text (Issue 3)
    raw_answer = generate_grounded_answer(req.question, passages, lang=req.lang)

    if raw_answer.strip() == "NO_ANSWER":
        return {
            "grounded": False,
            "answer": FALLBACK_MESSAGES.get(req.lang, FALLBACK_MESSAGES["en"]),
            "sources": [],
            "reason": "refusal_by_model"
        }

    # 5. Defensive Number Validator (Safety Net)
    is_valid, unsupported_numbers = numbers_supported(raw_answer, passages)
    if not is_valid:
        print(f"SECURITY ALERT: Blocked hallucinated numbers {unsupported_numbers} in generated answer.")
        return {
            "grounded": False,
            "answer": FALLBACK_MESSAGES.get(req.lang, FALLBACK_MESSAGES["en"]),
            "sources": [],
            "reason": "unsupported_number_detected",
            "flagged_numbers": list(unsupported_numbers)
        }

    # 6. Success: return grounded answer and traceable source citations (Issue 4)
    sources = [
        {
            "title": p["title"],
            "page": p["page"],
            "section": p["section"],
            "source_org": p.get("source_org", "Punjab Agricultural University (PAU), Ludhiana"),
            "publication": p.get("publication", "Package of Practices for Kharif Crops 2024"),
            "edition_year": p.get("edition_year", 2024),
            "safety_conditions": p.get("safety_conditions", "")
        }
        for p in passages
    ]

    return {
        "grounded": True,
        "answer": raw_answer,
        "sources": sources
    }

@app.post("/diagnose")
async def diagnose(file: UploadFile = File(...)):
    """
    Tier 3: Analyzes an uploaded paddy leaf image for common issues,
    blur, and non-plant content. Returns structured agronomic diagnosis.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not an image")
    
    contents = await file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image file too large (max 15MB)")
        
    result = analyze_image_bytes(contents)
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
