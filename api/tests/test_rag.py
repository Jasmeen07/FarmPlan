"""
api/tests/test_rag.py
Automated test suite for FarmPlan Tier 2 RAG pipeline and number validator.
"""

import json
import sys
from pathlib import Path

# Add api directory to sys.path
API_DIR = Path(__file__).resolve().parent.parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from fastapi.testclient import TestClient

from main import app
from rag.validate import numbers_supported, normalise_digits, extract_numbers
from rag.retrieve import retriever

client = TestClient(app)
TESTS_DIR = Path(__file__).resolve().parent

def test_normalise_digits():
    assert normalise_digits("੧੨੩੪੫੬੭੮੯੦") == "1234567890"
    assert normalise_digits("१२३४५६७८९०") == "1234567890"
    assert normalise_digits("Plain 15 days") == "Plain 15 days"

def test_numbers_supported_valid():
    sources = [{"text": "Stop irrigation 14 to 15 days before harvesting."}]
    answer = "You should stop irrigation 14-15 days before harvest [1]."
    valid, unsupported = numbers_supported(answer, sources)
    assert valid is True
    assert len(unsupported) == 0

def test_numbers_supported_blocks_hallucination():
    sources = [{"text": "Stop irrigation 14 to 15 days before harvesting."}]
    # 25 days is NOT in the source!
    invented_answer = "You must stop irrigation 25 days before harvest [1]."
    valid, unsupported = numbers_supported(invented_answer, sources)
    assert valid is False
    assert "25" in unsupported

def test_numbers_supported_multilingual_digits():
    sources = [{"text": "Stop irrigation 14 to 15 days before harvesting."}]
    # Gurmukhi digits ੧੪ (14) and ੧੫ (15)
    pa_answer = "ਵਾਢੀ ਤੋਂ ੧੪-੧੫ ਦਿਨ ਪਹਿਲਾਂ ਪਾਣੀ ਬੰਦ ਕਰੋ [1]।"
    valid, unsupported = numbers_supported(pa_answer, sources)
    assert valid is True

def test_retriever_in_scope():
    results = retriever.retrieve("When should I stop irrigation before harvest?", k=1)
    assert len(results) > 0
    assert results[0]["page"] == 27
    assert "14 to 15 days" in results[0]["text"]

def test_retriever_out_of_scope_declined():
    # Out of scope queries should return low scores or empty results
    results = retriever.retrieve("What is the current stock price of Apple in USD?", min_score=0.15)
    assert len(results) == 0

def test_api_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "status": "healthy"}

def test_api_ask_in_scope():
    res = client.post("/ask", json={"question": "When to stop irrigation before harvest?", "lang": "en"})
    assert res.status_code == 200
    data = res.json()
    assert data["grounded"] is True
    assert len(data["sources"]) > 0
    assert "14" in data["answer"] or "15" in data["answer"]

def test_api_ask_out_of_scope():
    res = client.post("/ask", json={"question": "What is the capital of France?", "lang": "en"})
    assert res.status_code == 200
    data = res.json()
    assert data["grounded"] is False
    assert "Agriculture Officer" in data["answer"]
