"""
api/tests/test_rag.py
Automated test suite for FarmPlan Tier 2 RAG pipeline, number validator, and Tier 3 diagnosis.
"""

import io
import json
import sys
from pathlib import Path
from PIL import Image

# Add api directory to sys.path
API_DIR = Path(__file__).resolve().parent.parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from fastapi.testclient import TestClient

from main import app
from rag.validate import numbers_supported, normalise_digits, extract_numbers
from rag.retrieve import retriever
from vision.diagnose import analyze_image_bytes

client = TestClient(app)

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

def test_retriever_expanded_varieties():
    results = retriever.retrieve("Which variety saves water PR 126?", k=1)
    assert len(results) > 0
    assert "PR 126" in results[0]["text"]
    assert "93 days" in results[0]["text"]

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

def test_api_diagnose_valid_leaf():
    # Create a synthetic 400x400 leaf image with green and yellow marginal pixels
    img = Image.new("RGB", (400, 400), color=(45, 120, 35))
    # Add yellow edge
    for x in range(320, 400):
        for y in range(400):
            img.putpixel((x, y), (210, 180, 30))
    
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    res = client.post("/diagnose", files={"file": ("leaf.jpg", buf, "image/jpeg")})
    assert res.status_code == 200
    data = res.json()
    assert "problem" in data
    assert "confidence" in data
    assert "guidance" in data

def test_api_diagnose_too_small():
    img = Image.new("RGB", (50, 50), color=(50, 150, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    res = client.post("/diagnose", files={"file": ("tiny.jpg", buf, "image/jpeg")})
    assert res.status_code == 200
    data = res.json()
    assert data["problem"] == "unclear"
    assert data["need_better_photo"] is True
