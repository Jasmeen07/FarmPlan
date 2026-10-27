"""
api/tests/test_rag.py
Automated test suite for FarmPlan Tier 2 RAG pipeline, number validator,
contrastive negation, health readiness, and evaluation benchmark dataset.
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
from rag.conversation import contextualize_followup
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

def test_retriever_contrastive_negation():
    # Contrastive check: asking about not drying during flowering
    q_neg = "Should I not dry the field during flowering stage?"
    res_neg = retriever.retrieve(q_neg, k=1)
    assert len(res_neg) > 0
    assert "Flowering" in res_neg[0]["section"]
    assert "Never allow the field to dry" in res_neg[0]["text"]

def test_saline_and_sandy_soil_constraints():
    # Saline soil check
    res_saline = retriever.retrieve("Can I use AWD in saline soil?", k=1)
    assert len(res_saline) > 0
    assert "Salinity" in res_saline[0]["title"]
    assert "strictly NOT recommended" in res_saline[0]["text"]

    # Sandy soil check
    res_sandy = retriever.retrieve("Is DSR recommended for light sandy soils?", k=1)
    assert len(res_sandy) > 0
    assert "sandy" in res_sandy[0]["text"].lower()
    assert "not" in res_sandy[0]["text"].lower()

def test_retriever_out_of_scope_declined():
    results = retriever.retrieve("What is the current stock price of Apple in USD?", min_score=0.15)
    assert len(results) == 0

def test_api_health_readiness():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["readiness"] is True
    assert data["status"] == "healthy"
    assert data["loaded_chunks"] >= 20
    assert "Punjab Agricultural University" in data["source_org"]

def test_api_ask_in_scope():
    res = client.post("/ask", json={"question": "When to stop irrigation before harvest?", "lang": "en"})
    assert res.status_code == 200
    data = res.json()
    assert data["grounded"] is True
    assert len(data["sources"]) > 0
    assert "14" in data["answer"] or "15" in data["answer"]
    assert "publication" in data["sources"][0]
    assert "source_org" in data["sources"][0]

def test_api_ask_out_of_scope():
    res = client.post("/ask", json={"question": "What is the capital of France?", "lang": "en"})
    assert res.status_code == 200
    data = res.json()
    assert data["grounded"] is False
    assert "Agriculture Officer" in data["answer"]

def test_contextualize_followup_topic_shift():
    # Case 1: Genuine follow-up carries PR 126 context
    history1 = [{"role": "user", "content": "tell me about PR 126"}, {"role": "assistant", "content": "PR 126 is short duration."}]
    q1 = contextualize_followup("how much water does it save?", history1)
    assert "pr 126" in q1.lower()

    # Case 2: Topic change from PR 126 to Brown Plant Hopper does NOT inject PR 126
    history2 = [{"role": "user", "content": "tell me about PR 126"}, {"role": "assistant", "content": "PR 126 is short duration."}]
    q2 = contextualize_followup("How to control brown plant hopper insect pest?", history2)
    assert "pr 126" not in q2.lower()
    assert "brown plant hopper" in q2.lower()

def test_evaluation_benchmark_suite():
    """Runs through the 20-question benchmark dataset in test_questions.jsonl"""
    eval_file = API_DIR / "tests" / "test_questions.jsonl"
    assert eval_file.exists()

    with open(eval_file, "r", encoding="utf-8") as f:
        questions = [json.loads(line) for line in f if line.strip()]

    assert len(questions) >= 15

    for item in questions:
        q_text = item["q"]
        expect = item["expect"]

        res = client.post("/ask", json={"question": q_text, "lang": item.get("lang", "en")})
        assert res.status_code == 200
        data = res.json()

        if expect == "decline":
            assert data["grounded"] is False, f"Expected decline for: {q_text}"
            assert "Agriculture Officer" in data["answer"]
        elif expect == "answer":
            assert data["grounded"] is True, f"Expected answer for: {q_text}"
            assert len(data["sources"]) > 0

            # If expected_doc_id is specified, verify it was retrieved
            if "expected_doc_id" in item:
                # Top retrieved chunk should match expected doc
                passages = retriever.retrieve(q_text, k=2)
                assert len(passages) > 0
                assert passages[0]["doc_id"] == item["expected_doc_id"] or passages[1]["doc_id"] == item["expected_doc_id"], \
                    f"Wrong passage retrieved for {q_text}: got {passages[0]['doc_id']}"

            # Check numbers
            for num in item.get("must_contain_numbers", []):
                assert num in data["answer"], f"Expected number {num} in answer for {q_text}, got: {data['answer']}"

def test_api_diagnose_valid_leaf():
    img = Image.new("RGB", (400, 400), color=(45, 120, 35))
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
