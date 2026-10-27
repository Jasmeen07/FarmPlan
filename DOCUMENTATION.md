# FarmPlan v2 — System Documentation

FarmPlan is a farmer-first, software-only, $0-cost agricultural advisory platform designed for small and marginal paddy farmers in Punjab, India. It translates official Punjab Agricultural University (PAU) packages of practices into responsive, accessible, interactive field tools.

---

## 🏛 Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │          Farmer / Browser Client             │
                      │   (HTML5, Modern CSS, Web Speech, Canvas)    │
                      └───────┬──────────────────────────────┬───────┘
                              │                              │
                1. Local Dual Pipeline         2. REST API Calls
               (Zero Server Fallback)          (FastAPI Local Server)
                              │                              │
               ┌──────────────▼──────────────┐┌──────────────▼──────────────┐
               │    Tier 1 Client Engine     ││   Tier 2 Grounded Backend   │
               │  - AWD Stage Calculator     ││  - TF-IDF Cosine Retrieval  │
               │  - DSR Break-Even Ledger    ││  - Deterministic Extractor  │
               │  - In-Browser Vector Search ││  - Strict Number Validator  │
               │  - Canvas Pixel Vision CV   ││  - OpenCV Laplacian & HSV   │
               └─────────────────────────────┘└─────────────────────────────┘
```

FarmPlan implements a **dual-engine architecture**:
1. **Tier 1 (Client-First / Edge)**: All core logic (AWD rules, DSR gate, cost ledger, vector retrieval, and canvas computer vision) can execute 100% locally in the browser with zero cloud dependencies and zero cost.
2. **Tier 2 & 3 (FastAPI Local Backend)**: Provides local TF-IDF semantic search, defensive digit validation across Gurmukhi, Devanagari, and ASCII numerals, and OpenCV image processing.

---

## 📄 The 5 Core Pages

### Page A: The Living Field (Home)
- **Visual Direction**: Editorial field guide layout with warm ivory background (`#F5F2E9`), Fraunces serif headlines, and topographic contour elevations.
- **Dynamic Field Overview**: Displays the farmer's active sowing date, elapsed days, and current biological stage.
- **Direct Navigation**: Fast routing to the four field jobs with responsive desktop navigation and mobile bottom tab bar.

### Page B: The Water Atlas (Water Advisor)
- **Dynamic Sowing Date Recalculation**: Sowing date, variety selection, and salinity status can be adjusted live on the page or via the Field Settings modal.
- **Stage Boundary Progression**:
  - Automatically calculates elapsed days and highlights the current growth stage based on variety maturity (e.g. PR 126: 123 days; PR 131: 140 days).
  - Six distinct stages: Establishment (0–15 d), Tillering / AWD (16–45 d), Panicle Initiation (46–59 d), Flowering (60–75 d), Grain Filling (76–92 d), Pre-Harvest Termination (93+ d).
- **AWD Soil Cross-Section & Water Gauge**: Visual gauge indicates water level (Continuous Submergence, Saturated / Infiltration, Moist Aeration, Dry for Harvest).
- **Critical Guardrails**:
  - **Salinity Alert**: Strictly warns against AWD on saline or kallar land where drying brings subsoil salts upward.
  - **Flowering Alert**: Strictly forbids field drying during pollination to prevent chaffy grain heads.
- **Audio Narration**: Web Speech Synthesis reads advice aloud in Indian English (`en-IN`).

### Page C: The Field Ledger (DSR & Costs)
- **Punjab Baseline Cultivation Economics**:
  - Compares Conventional Transplanted, Transplanted + AWD, and Tar-Wattar Direct-Seeded Rice (DSR).
  - Accounts for land prep, puddling, nursery, labour, seed, herbicide applications, and tubewell pumping cycles.
  - DSR saves ₹7,030/acre over conventional transplanting; break-even yield loss is **3.03 q/acre** at current MSP.
- **Interactive Yield Difference Slider**:
  - Farmer can adjust expected DSR yield difference (-6.0 q to +3.0 q/acre) and total farm acreage.
  - Real-time calculation shows exact net financial profit advantage or loss.
- **Custom Expense Drawer**: Allows customized adjustments for labor rate, diesel pumping cost, laser leveling, machine drill rental, and Punjab DSR subsidy.
- **DSR Suitability Gate**: Interactive 5-question readiness check (previous crop, laser leveling, drill machine access, 24h herbicide, salinity) with traffic-light diagnostic verdict (*Recommended*, *Caution*, or *Not Recommended*).

### Page D: The Listening Room (Ask Advisor)
- **Grounded Agricultural Q&A**: Answers any question strictly using 22 official PAU Kharif chapters.
- **Defensive Number Validator**: Verifies that every number, unit, date, and dose in the response exists verbatim in official guidance, preventing hallucinated agricultural inputs.
- **Dual Retrieval Fallback**:
  - Queries local FastAPI backend (`/ask`) using TF-IDF cosine similarity.
  - If backend is offline, browser executes client-side RAG search (`ragClient.js`) over `pau_chunks.json`.
- **Speech Interaction**: Supports voice speech-to-text input and audio readout.
- **Safe Referral**: Off-topic queries or unverified recommendations are declined with an official referral to the local Krishi Vigyan Kendra (KVK).

### Page E: The Field Journal (Crop Check)
- **Real Dual Computer Vision Analysis**:
  - **Server-Side OpenCV**: Analyzes Laplacian blur variance and HSV spectral distributions.
  - **Browser Canvas Engine**: Offscreen `<canvas>` inspects pixel color channels and edge contrast gradients if the backend is unavailable.
- **Diagnostic Categories**:
  - Bacterial Leaf Blight (BLB)
  - Rice Leaf Blast
  - Sheath Blight
  - Zinc Deficiency (Khaira Disease)
  - Iron Chlorosis (DSR)
  - Healthy Paddy Leaf
- **Image Quality Guardrails**:
  - Blurry images (< 25 Laplacian variance) are rejected with clear retake instructions.
  - Non-crop images (< 15% foliage) are rejected.
  - Displays quantitative metrics: focus score, foliage %, chlorosis %, and necrosis %.

---

## 🛠 Setup & Running Instructions

### Prerequisites
- Node.js (v18+ or v20+)
- Python 3.10+ with `pip`

### 1. Web Application (Frontend)
```bash
cd web
npm install
npm run build
npm test         # Runs 36 Vitest unit tests
npx vite preview --port 4173 --host 127.0.0.1
```
Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) in your web browser.

### 2. FastAPI Backend
```bash
pip install -r requirements.txt   # or fastapi uvicorn scikit-learn pillow opencv-python python-multipart pytest
python -m uvicorn main:app --app-dir api --host 127.0.0.1 --port 8000 --reload
```
API documentation available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 3. Running Test Suites
- **Frontend Vitest (39 tests)**:
  ```bash
  cd web && npm test
  ```
- **Backend Pytest (16 tests)**:
  ```bash
  python -m pytest api/tests
  ```

---

## 🛡️ Code Review Improvements & Hardened Protections

In response to the comprehensive codebase inspection (`FarmPlan_Issues_and_Solutions.md`), all 10 identified issues have been systematically resolved and verified:

| Issue | Area | Severity | Solution Implemented |
| :--- | :--- | :--- | :--- |
| **Issue 1** | Negation Removal | **P0** | Removed negation words (`not`, `no`, `never`, `none`, `neither`, `nor`, `without`, `stop`, `avoid`) from stop-words in both Python (`CUSTOM_STOP_WORDS`) and JavaScript. Added contrastive scoring so warning passages receive appropriate weight for safety questions. |
| **Issue 2** | Context Window & Scoring | **P0/P1** | Increased retrieval context to `k=4` with calibrated `min_score=0.03`. Requires verified supporting passage evidence across multi-part questions before answering. |
| **Issue 3** | Local Fallback Irrelevance | **P0/P1** | Eliminated arbitrary opening sentence selection. If no sentence in retrieved passages provides direct factual support or contains unsupported products, the generator cleanly abstains (`NO_ANSWER`), triggering official KVK/Agriculture Officer fallback. |
| **Issue 4** | Traceable Sourced Citations | **P0** | Hardcoded passages enriched with traceable official source metadata: Organization (`PAU Ludhiana`), Publication (`Package of Practices for Kharif Crops 2024`), Year (`2024`), Section, Page, and explicit safety condition constraints. |
| **Issue 5** | Missing Index Deployment Risk | **P0** | Added startup self-healing lifecycle in FastAPI (`ensure_db_initialized()`) that auto-builds `chunks.sqlite` if missing or unindexed. Updated `/health` endpoint to return readiness, loaded chunk count (`>=20`), and vectorizer status. |
| **Issue 6** | Frontend & Backend Retrieval Divergence | **P1** | Made backend API canonical with seamless client fallback. Synchronized synonym mappings, eliminated arbitrary fallback sentences in JavaScript, and added explicit `is_offline_client: true` badge on offline turns. |
| **Issue 7** | Narrow Follow-Up Context | **P1** | Implemented topic-shift classification (`detect_topic`) across 8 domains (water, variety, nutrition, weeds, pests, diseases, DSR, stubble). Follow-ups referencing pronouns or attributes (`"how much water does it save?"`) retain context; explicit topic shifts safely reset context. |
| **Issue 8** | Unicode Script Tokenization | **P1** | Upgraded tokenizers in Python and JavaScript to support Unicode Indic combining marks (`\p{M}` in JS, `[\w\u0900-\u097F\u0A00-\u0A7F]+` in Python). Prevents Gurmukhi (ਪੰਜਾਬੀ) and Devanagari (हिन्दी) words from being fragmented. |
| **Issue 9** | Overly Permissive CORS | **P1** | Restricted CORS from wildcard `*` to an explicit allowlist of frontend origins (`localhost:5173`, `127.0.0.1:5173`, `localhost:4173`, `127.0.0.1:4173`), configurable via `CORS_ORIGINS`. |
| **Issue 10** | Evaluation Benchmark Suite | **P1** | Expanded `api/tests/test_questions.jsonl` to 20 labelled evaluation queries covering contrastive negation, salinity constraints, sandy soil exclusions, multi-part questions, Indic scripts, and out-of-scope abstentions. Pytest suite expanded to 16 automated test suites. |

---

## 🔒 Confidentiality & Zero-Cost Architecture
- **$0 Cost Guarantee**: No paid APIs, cloud subscriptions, or external LLM tokens are required.
- **Secrets Management**: No API keys, credentials, or personal tokens are stored in the repository. Optional keys (such as `GEMINI_API_KEY`) are managed strictly via environment variables (`.env`).
- **Data Privacy**: All photo processing and voice recognition run either locally on the user's device or against the local FastAPI instance.

---

## 📚 Official Sourced References
1. Punjab Agricultural University (PAU), *Package of Practices for the Kharif Crops of Punjab: Rice* (2024).
2. PAU Directorate of Extension Education, *Direct Seeded Rice (Tar-Wattar DSR) Technology Bulletin* (2024).
3. Punjab Subsoil Water Preservation Act 2008 & Statutory Sowing Window Notifications (2024).
4. ICAR-National Rice Research Institute (NRRI), *Alternate Wetting and Drying (AWD) Technical Manual*.
